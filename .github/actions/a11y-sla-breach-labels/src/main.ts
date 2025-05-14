import * as core from '@actions/core'
import * as github from '@actions/github'

type ImpactLevel = 'Blocker' | 'Critical' | 'Serious' | 'Moderate'
// Define SLA Thresholds based on impact levels (in weeks)
const LABEL_THRESHOLDS: Record<ImpactLevel, number> = {
  Blocker: 4,
  Critical: 10,
  Serious: 20,
  Moderate: 30
}

// SLA Labels (only these should be removed/updated)
type SLALabel = 'SLA P1' | 'SLA P2' | 'SLA P3' | 'SLA Breach'
const SLA_LABELS: SLALabel[] = ['SLA P1', 'SLA P2', 'SLA P3', 'SLA Breach']

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
    return 'SLA Breach'
  } else if (weeksOld >= impactSLAWeeks - 1) {
    return 'SLA P1'
  } else if (weeksOld >= impactSLAWeeks - 2) {
    return 'SLA P2'
  } else if (weeksOld >= impactSLAWeeks - 3) {
    return 'SLA P3'
  }
}

// Export the run function for testing and for the action's entry point
export async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true })
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
      response =>
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

      let impactLevel: ImpactLevel | undefined = undefined
      for (const levelKey in LABEL_THRESHOLDS) {
        const currentImpactLevel = levelKey as ImpactLevel
        if (
          issue.labels.some(
            label =>
              label.name.toLowerCase() === currentImpactLevel.toLowerCase()
          )
        ) {
          impactLevel = currentImpactLevel
          break
        }
      }

      if (!impactLevel) {
        core.info(
          `⚠️ Issue #${issue.number} has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping.`
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
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(`An unknown error occurred: ${String(error)}`)
    }
  }
}

// Call the run function when this script is executed
run()
