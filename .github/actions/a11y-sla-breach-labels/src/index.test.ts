import { assert } from 'chai'
import sinon from 'sinon'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { run } from './'

// Define an interface for the raw issue structure used in tests
interface RawTestIssue {
  number: number
  created_at: string // ISO string
  labels: Array<
    | string
    | { name?: string | null }
    | Record<string, unknown>
    | null
    | undefined
  >
}

// Mocks for @actions/core
let mockCoreGetInput: sinon.SinonStub
let mockCoreInfo: sinon.SinonSpy
let mockCoreSetFailed: sinon.SinonSpy

// Mocks for @actions/github
let mockOctokitPaginate: sinon.SinonStub
let mockOctokitRemoveLabel: sinon.SinonStub
let mockOctokitAddLabels: sinon.SinonStub

const MOCK_TOKEN = 'test-github-token'
const MOCK_OWNER = 'test-owner'
const MOCK_REPO = 'test-repo'

let now: Date // Declare now in the describe scope

// Helper function to generate past dates relative to 'now'
const getPastDateISO = (options: { weeks?: number; days?: number }): string => {
  const pastDate = new Date(now.getTime()) // 'now' will be set in beforeEach
  if (options.weeks !== undefined) {
    pastDate.setDate(pastDate.getDate() - options.weeks * 7)
  } else if (options.days !== undefined) {
    pastDate.setDate(pastDate.getDate() - options.days)
  }
  return pastDate.toISOString()
}

// Helper function to set up mockOctokitPaginate.callsFake
const setupMockOctokitPaginate = (rawIssues: RawTestIssue[]) => {
  mockOctokitPaginate.callsFake(
    async (_octokitMethod, _octokitParams, transform) => {
      const mockApiResponse = { data: rawIssues }
      return transform(mockApiResponse)
    }
  )
}

describe('run (SLA Breach Labels Action)', () => {
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    mockCoreGetInput = sinon.stub(core, 'getInput').returns(MOCK_TOKEN)
    mockCoreInfo = sinon.spy(core, 'info')
    mockCoreSetFailed = sinon.spy(core, 'setFailed')

    const octokitInstance = github.getOctokit(MOCK_TOKEN)
    mockOctokitPaginate = sinon.stub(octokitInstance, 'paginate')
    mockOctokitRemoveLabel = sinon
      .stub(octokitInstance.rest.issues, 'removeLabel')
      .resolves()
    mockOctokitAddLabels = sinon
      .stub(octokitInstance.rest.issues, 'addLabels')
      .resolves()
    sinon.stub(github, 'getOctokit').returns(octokitInstance)

    sinon.stub(github, 'context').value({
      repo: {
        owner: MOCK_OWNER,
        repo: MOCK_REPO
      }
    })

    // Mock Date to control time-based calculations (weeksOld)
    // Current date set to a Monday for easier week calculations if needed
    now = new Date('2024-01-29T12:00:00Z')
    clock = sinon.useFakeTimers(now.getTime())
  })

  afterEach(() => {
    clock.restore()
    sinon.restore()
  })

  it('should log "No issues found" and return if no issues are fetched', async () => {
    setupMockOctokitPaginate([])

    await run()

    assert.isTrue(mockCoreGetInput.calledWith('token', { required: true }))
    assert.isTrue(mockOctokitPaginate.calledOnce)

    assert.isTrue(
      mockCoreInfo.calledWith('🚀 Fetching open issues from GitHub API...')
    )
    assert.isTrue(mockCoreInfo.calledWith('Total Issues Fetched: 0'))
    assert.isTrue(
      mockCoreInfo.calledWith('⚠️ No issues found with the required labels.')
    )
    assert.isFalse(mockCoreSetFailed.called)
    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
  })

  it('should log "no recognized impact level" and skip an issue without an impact label', async () => {
    const issueWithoutImpactRaw = {
      number: 1,
      created_at: new Date().toISOString(),
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'SomeOtherLabel' }]
    }
    setupMockOctokitPaginate([issueWithoutImpactRaw])

    await run()

    assert.isTrue(
      mockCoreInfo.calledWith(
        `⚠️ Issue #${issueWithoutImpactRaw.number} has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping.`
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
  })

  it('should apply "SLA Breach" if issue is older than Blocker threshold and remove old P-label', async () => {
    const fiveWeeksAgoISO = getPastDateISO({ weeks: 5 })
    const issueToBreachRaw = {
      number: 10,
      created_at: fiveWeeksAgoISO,
      labels: [
        { name: 'A11y' },
        { name: 'VPAT' },
        { name: 'Blocker' },
        { name: 'SLA P1' }
      ]
    }
    setupMockOctokitPaginate([issueToBreachRaw])

    await run()

    assert.isTrue(
      mockOctokitRemoveLabel.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueToBreachRaw.number,
          name: 'SLA P1'
        })
      )
    )

    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueToBreachRaw.number,
          labels: ['SLA Breach']
        })
      )
    )

    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should apply "SLA P1" if issue is 1 week from Blocker threshold (3 weeks old)', async () => {
    const threeWeeksAgoISO = getPastDateISO({ weeks: 3 })
    const issueForP1Raw = {
      number: 11,
      created_at: threeWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Blocker' }]
    }
    setupMockOctokitPaginate([issueForP1Raw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueForP1Raw.number,
          labels: ['SLA P1']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should apply "SLA P2" if issue is 2 weeks from Blocker threshold (2 weeks old)', async () => {
    const twoWeeksAgoISO = getPastDateISO({ weeks: 2 })
    const issueForP2Raw = {
      number: 12,
      created_at: twoWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Blocker' }]
    }
    setupMockOctokitPaginate([issueForP2Raw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueForP2Raw.number,
          labels: ['SLA P2']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should apply "SLA P3" if issue is 3 weeks from Blocker threshold (1 week old)', async () => {
    const oneWeekAgoISO = getPastDateISO({ weeks: 1 })
    const issueForP3Raw = {
      number: 13,
      created_at: oneWeekAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Blocker' }]
    }
    setupMockOctokitPaginate([issueForP3Raw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueForP3Raw.number,
          labels: ['SLA P3']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should not apply any SLA label if issue is too new (0 weeks old for Blocker)', async () => {
    const fewDaysAgoISO = getPastDateISO({ days: 3 })
    const newIssueRaw = {
      number: 14,
      created_at: fewDaysAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Blocker' }]
    }
    setupMockOctokitPaginate([newIssueRaw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should not change labels if issue already has the correct SLA label (SLA P1)', async () => {
    const threeWeeksAgoISO = getPastDateISO({ weeks: 3 })
    const issueWithCorrectLabelRaw = {
      number: 15,
      created_at: threeWeeksAgoISO,
      labels: [
        { name: 'A11y' },
        { name: 'VPAT' },
        { name: 'Blocker' },
        { name: 'SLA P1' }
      ]
    }
    setupMockOctokitPaginate([issueWithCorrectLabelRaw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should remove an old SLA label if no new SLA label is applicable', async () => {
    const fewDaysAgoISO = getPastDateISO({ days: 3 })
    const issueWithObsoleteLabelRaw = {
      number: 16,
      created_at: fewDaysAgoISO,
      labels: [
        { name: 'A11y' },
        { name: 'VPAT' },
        { name: 'Blocker' },
        { name: 'SLA P3' }
      ]
    }
    setupMockOctokitPaginate([issueWithObsoleteLabelRaw])

    await run()

    assert.isTrue(
      mockOctokitRemoveLabel.calledOnceWith(sinon.match({ name: 'SLA P3' }))
    )
    assert.isFalse(mockOctokitAddLabels.called)
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should call core.setFailed if removing a label fails', async () => {
    const fiveWeeksAgoISO = getPastDateISO({ weeks: 5 })
    const issueToBreachRaw = {
      number: 20,
      created_at: fiveWeeksAgoISO,
      labels: [
        { name: 'A11y' },
        { name: 'VPAT' },
        { name: 'Blocker' },
        { name: 'SLA P1' }
      ]
    }
    setupMockOctokitPaginate([issueToBreachRaw])

    const removeError = new Error('API_REMOVE_ERROR')
    mockOctokitRemoveLabel.rejects(removeError)

    await run()

    assert.isTrue(mockOctokitRemoveLabel.calledOnce)
    assert.isTrue(mockCoreSetFailed.calledOnce)
    assert.strictEqual(
      mockCoreSetFailed.firstCall.args[0],
      `Could not remove label SLA P1 from issue #${issueToBreachRaw.number}: ${removeError.message}`
    )
    assert.isFalse(mockOctokitAddLabels.called)
  })

  it('should call core.setFailed if adding a label fails', async () => {
    const threeWeeksAgoISO = getPastDateISO({ weeks: 3 })
    const issueForP1Raw = {
      number: 21,
      created_at: threeWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Blocker' }]
    }
    setupMockOctokitPaginate([issueForP1Raw])

    const addError = new Error('API_ADD_ERROR')
    mockOctokitAddLabels.rejects(addError)

    await run()

    assert.isTrue(mockOctokitAddLabels.calledOnce)
    assert.isTrue(mockCoreSetFailed.calledOnce)
    assert.strictEqual(
      mockCoreSetFailed.firstCall.args[0],
      `Could not add label SLA P1 to issue #${issueForP1Raw.number}: ${addError.message}`
    )
  })

  it('should correctly apply "SLA P1" for a "Critical" issue (10w SLA) at 9 weeks old', async () => {
    const nineWeeksAgoISO = getPastDateISO({ weeks: 9 })
    const criticalIssueForP1Raw = {
      number: 30,
      created_at: nineWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Critical' }]
    }
    setupMockOctokitPaginate([criticalIssueForP1Raw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: criticalIssueForP1Raw.number,
          labels: ['SLA P1']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should remove multiple existing SLA labels if needed when applying a new one', async () => {
    const fiveWeeksAgoISO = getPastDateISO({ weeks: 5 })
    const issueWithMultipleOldSLAsRaw = {
      number: 40,
      created_at: fiveWeeksAgoISO,
      labels: [
        { name: 'A11y' },
        { name: 'VPAT' },
        { name: 'Blocker' },
        { name: 'SLA P1' },
        { name: 'SLA P2' }
      ]
    }
    setupMockOctokitPaginate([issueWithMultipleOldSLAsRaw])

    await run()

    assert.isTrue(mockOctokitRemoveLabel.calledTwice)
    assert.isTrue(
      mockOctokitRemoveLabel.calledWith(sinon.match({ name: 'SLA P1' }))
    )
    assert.isTrue(
      mockOctokitRemoveLabel.calledWith(sinon.match({ name: 'SLA P2' }))
    )

    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({ labels: ['SLA Breach'] })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should call core.setFailed with a generic message for non-Error exceptions', async () => {
    const nonErrorObject = { message: 'not an error instance' }
    // For this specific test, we want to simulate a non-Error throw directly from paginate setup
    mockOctokitPaginate.callsFake(async () => {
      throw nonErrorObject
    })

    await run()

    assert.isTrue(mockCoreSetFailed.calledOnce)
    assert.strictEqual(
      mockCoreSetFailed.firstCall.args[0],
      `An unknown error occurred: ${String(nonErrorObject)}`
    )
  })

  it('should correctly apply "SLA P1" for a "Serious" issue (20w SLA) at 19 weeks old', async () => {
    const nineteenWeeksAgoISO = getPastDateISO({ weeks: 19 })
    const seriousIssueForP1Raw = {
      number: 50,
      created_at: nineteenWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Serious' }]
    }
    setupMockOctokitPaginate([seriousIssueForP1Raw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: seriousIssueForP1Raw.number,
          labels: ['SLA P1']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should correctly apply "SLA Breach" for a "Serious" issue (20w SLA) at 20 weeks old', async () => {
    const twentyWeeksAgoISO = getPastDateISO({ weeks: 20 })
    const seriousIssueToBreachRaw = {
      number: 51,
      created_at: twentyWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Serious' }]
    }
    setupMockOctokitPaginate([seriousIssueToBreachRaw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called) // No old P-label to remove initially
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: seriousIssueToBreachRaw.number,
          labels: ['SLA Breach']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should correctly apply "SLA P1" for a "Moderate" issue (30w SLA) at 29 weeks old', async () => {
    const twentyNineWeeksAgoISO = getPastDateISO({ weeks: 29 })
    const moderateIssueForP1Raw = {
      number: 60,
      created_at: twentyNineWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Moderate' }]
    }
    setupMockOctokitPaginate([moderateIssueForP1Raw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: moderateIssueForP1Raw.number,
          labels: ['SLA P1']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should correctly apply "SLA Breach" for a "Moderate" issue (30w SLA) at 30 weeks old', async () => {
    const thirtyWeeksAgoISO = getPastDateISO({ weeks: 30 })
    const moderateIssueToBreachRaw = {
      number: 61,
      created_at: thirtyWeeksAgoISO,
      labels: [{ name: 'A11y' }, { name: 'VPAT' }, { name: 'Moderate' }]
    }
    setupMockOctokitPaginate([moderateIssueToBreachRaw])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called) // No old P-label to remove initially
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: moderateIssueToBreachRaw.number,
          labels: ['SLA Breach']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should correctly map various label formats from API response', async () => {
    const issuesWithVariousLabelsRaw: RawTestIssue[] = [
      {
        number: 100,
        created_at: new Date().toISOString(),
        // Provide a mix of label types to cover all branches in the transformation:
        labels: [
          'string-label', // For: typeof label === 'string'
          { name: 'name-prop-label' }, // For: typeof label !== 'string' AND label.name is truthy
          { name: null }, // For: typeof label !== 'string' AND label.name is null (falsy)
          { id: 12345, description: 'object without name' }, // For: typeof label !== 'string' AND label.name is undefined (falsy)
          null, // For: typeof label !== 'string' (null type), label?.name is undefined (falsy)
          undefined, // For: typeof label !== 'string' (undefined type), label?.name is undefined (falsy)
          { name: '' } // For: typeof label !== 'string' AND label.name is empty string (falsy)
        ]
      }
    ]
    setupMockOctokitPaginate(issuesWithVariousLabelsRaw)

    await run()

    assert.isTrue(mockOctokitPaginate.calledOnce)
    assert.isFalse(mockCoreSetFailed.called)
    assert.isTrue(
      mockCoreInfo.calledWith(
        `⚠️ Issue #${issuesWithVariousLabelsRaw[0].number} has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping.`
      )
    )
  })
})
