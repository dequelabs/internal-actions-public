import type * as core from '@actions/core'
import type * as github from '@actions/github'

type ListForRepoResponse = {
  data: Array<{
    number: number
    created_at: string
    labels: Array<string | { name?: string | null }>
  }>
}

type ImpactLevel = 'VPAT:Blocker' | 'VPAT:Critical' | 'VPAT:Serious' | 'VPAT:Moderate'

export type Core = Pick<typeof core, 'getInput' | 'info' | 'setFailed'>
export type GitHub = Pick<typeof github, 'getOctokit' | 'context'>

// Define SLA Thresholds based on impact levels (in weeks)
const LABEL_THRESHOLDS: Record<ImpactLevel, number> = {
  'VPAT:Blocker': 4,
  'VPAT:Critical': 10,
  'VPAT:Serious': 20,
  'VPAT:Moderate': 30
}

// SLA Labels (only these should be removed/updated)
type SLALabel =
  | 'VPAT:SLA P1'
  | 'VPAT:SLA P2'
  | 'VPAT:SLA P3'
  | 'VPAT:SLA Breach'
const SLA_LABELS: SLALabel[] = [
  'VPAT:SLA P1',
  'VPAT:SLA P2',
  'VPAT:SLA P3',
  'VPAT:SLA Breach'
]

// Required labels for filtering issues
const REQUIRED_LABELS: string[] = ['A11y', 'VPAT']

interface IssueLabel {
  name: string
}

interface Issue {
  number: number
  createdAt: string // ISO 8601 string
  labels: IssueLabel[]
}

function isSLALabel(name: string): name is SLALabel {
  return (SLA_LABELS as readonly string[]).includes(name)
}

function getSLALabel(
  weeksOld: number,
  impactLevel: ImpactLevel
): SLALabel | undefined {
  const impactSLAWeeks = LABEL_THRESHOLDS[impactLevel]
  if (weeksOld >= impactSLAWeeks) {
    return 'VPAT:SLA Breach'
  } else if (weeksOld >= impactSLAWeeks - 1) {
    return 'VPAT:SLA P1'
  } else if (weeksOld >= impactSLAWeeks - 2) {
    return 'VPAT:SLA P2'
  } else if (weeksOld >= impactSLAWeeks - 3) {
    return 'VPAT:SLA P3'
  }
  return
}

/**
 * Main function for the GitHub Action.
 *
 * This function performs the following steps:
 * 1. Retrieves the GitHub token from action inputs.
 * 2. Initializes the Octokit client for GitHub API interaction.
 * 3. Fetches all open issues from the repository that are labeled with both 'A11y' and 'VPAT'.
 * 4. If no such issues are found, logs a message and exits.
 * 5. For each fetched issue:
 *    a. Calculates the age of the issue in weeks.
 *    b. Determines the issue's impact level (VPAT:Blocker, VPAT:Critical, VPAT:Serious, or VPAT:Moderate) by checking its existing labels.
 *    c. If no recognized impact level label is found, logs a warning and skips the issue.
 *    d. Based on the issue's age and impact level, determines the appropriate SLA label
 *       (VPAT:SLA P1, VPAT:SLA P2, VPAT:SLA P3, or VPAT:SLA Breach) according to predefined thresholds.
 *    e. Identifies any existing SLA labels on the issue that are different from the newly determined SLA label.
 *    f. Removes these incorrect or outdated SLA labels from the issue.
 *    g. If a new SLA label is determined and is not already present on the issue, adds the new SLA label.
 * 6. If any errors occur during the process, catches them, logs an appropriate message, and sets the action to failed.
 */
export async function run(core: Core, github: GitHub): Promise<void> {
  try {
    const token = core.getInput('token', { required: true })
    const octokit = github.getOctokit(token)
    const { owner, repo } = github.context.repo

    core.info('🚀 Fetching open issues from GitHub API...')

    const issues: Issue[] = await octokit.paginate(
      octokit.rest.issues.listForRepo,
      {
        owner,
        repo,
        state: 'open',
        labels: REQUIRED_LABELS.join(',')
      },
      (response: ListForRepoResponse) =>
        response.data.map(issue => ({
          number: issue.number,
          createdAt: issue.created_at,
          labels: issue.labels.map(label => ({
            name: typeof label === 'string' ? label : label?.name || ''
          }))
        }))
    )

    core.info(`Total Issues Fetched: ${issues.length}`)

    if (issues.length === 0) {
      core.info('⚠️ No issues found with the required labels.')
      return
    }

    const currentTimestamp = Math.floor(new Date().getTime() / 1000)

    for (const issue of issues) {
      const createdAtTimestamp = Math.floor(
        new Date(issue.createdAt).getTime() / 1000
      )
      const daysOld = Math.floor(
        (currentTimestamp - createdAtTimestamp) / 86400
      )
      const weeksOld = Math.floor(daysOld / 7)

      const impactLevel = Object.keys(LABEL_THRESHOLDS).find(levelKey =>
        issue.labels.some(
          label => label.name.toLowerCase() === levelKey.toLowerCase()
        )
      ) as ImpactLevel | undefined

      if (!impactLevel) {
        core.info(
          `⚠️ Issue #${issue.number} has no recognized impact level (VPAT:Blocker, VPAT:Critical, VPAT:Serious, VPAT:Moderate). Skipping.`
        )
        continue
      }

      const newSLALabel = getSLALabel(weeksOld, impactLevel)
      const allCurrentLabelNamesOnIssue = issue.labels.map(l => l.name)

      const labelsToRemove = issue.labels
        .filter(label => isSLALabel(label.name) && label.name !== newSLALabel)
        .map(label => label.name)

      for (const labelNameToRemove of labelsToRemove) {
        core.info(
          `🚫 Removing label: ${labelNameToRemove} from Issue #${issue.number}`
        )
        try {
          await octokit.rest.issues.removeLabel({
            owner,
            repo,
            issue_number: issue.number,
            name: labelNameToRemove
          })
        } catch (e) {
          const error = e as Error
          throw new Error(
            `Could not remove label ${labelNameToRemove} from issue #${issue.number}: ${error.message}`
          )
        }
      }

      const shouldAddNewLabel =
        !!newSLALabel && !allCurrentLabelNamesOnIssue.includes(newSLALabel)
      if (shouldAddNewLabel) {
        core.info(
          `➕ Adding new label: ${newSLALabel} to Issue #${issue.number}`
        )
        try {
          await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: issue.number,
            labels: [newSLALabel]
          })
        } catch (e) {
          const error = e as Error
          throw new Error(
            `Could not add label ${newSLALabel} to issue #${issue.number}: ${error.message}`
          )
        }
      }
    }
  } catch (e) {
    const error = e as Error
    core.setFailed(
      error instanceof Error
        ? error.message
        : `An unknown error occurred: ${String(error)}`
    )
  }
}
