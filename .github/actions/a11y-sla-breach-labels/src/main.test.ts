import { assert } from 'chai'
import sinon from 'sinon'
import * as core from '@actions/core'
import * as github from '@actions/github'
import { run } from './main'

// Mock Interfaces
interface MockIssueLabel {
  name: string
}
interface MockIssue {
  number: number
  createdAt: string // ISO string
  labels: MockIssueLabel[]
}

// Helper to create mock issues
const createMockIssue = (
  number: number,
  createdAt: string,
  labelNames: string[]
): MockIssue => ({
  number,
  createdAt,
  labels: labelNames.map(name => ({ name }))
})

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
    now = new Date('2024-01-29T12:00:00Z') // Initialize now here
    clock = sinon.useFakeTimers(now.getTime())
  })

  afterEach(() => {
    clock.restore()
    sinon.restore()
  })

  it('should log "No issues found" and return if no issues are fetched', async () => {
    mockOctokitPaginate.resolves([])

    await run()

    assert.isTrue(
      mockCoreGetInput.calledWith('github-token', { required: true })
    )
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
    const issueWithoutImpact = createMockIssue(1, new Date().toISOString(), [
      'A11y',
      'VPAT',
      'SomeOtherLabel'
    ])
    mockOctokitPaginate.resolves([issueWithoutImpact])

    await run()

    assert.isTrue(
      mockCoreInfo.calledWith(
        `⚠️ Issue #${issueWithoutImpact.number} has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping.`
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
  })

  it('should apply "SLA Breach" if issue is older than Blocker threshold and remove old P-label', async () => {
    const fiveWeeksAgoISO = getPastDateISO({ weeks: 5 })
    const issueToBreach = createMockIssue(10, fiveWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker',
      'SLA P1'
    ])
    mockOctokitPaginate.resolves([issueToBreach])

    await run()

    assert.isTrue(
      mockOctokitRemoveLabel.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueToBreach.number,
          name: 'SLA P1'
        })
      )
    )

    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueToBreach.number,
          labels: ['SLA Breach']
        })
      )
    )

    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should apply "SLA P1" if issue is 1 week from Blocker threshold (3 weeks old)', async () => {
    const threeWeeksAgoISO = getPastDateISO({ weeks: 3 })
    const issueForP1 = createMockIssue(11, threeWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker'
    ])
    mockOctokitPaginate.resolves([issueForP1])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueForP1.number,
          labels: ['SLA P1']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should apply "SLA P2" if issue is 2 weeks from Blocker threshold (2 weeks old)', async () => {
    const twoWeeksAgoISO = getPastDateISO({ weeks: 2 })
    const issueForP2 = createMockIssue(12, twoWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker'
    ])
    mockOctokitPaginate.resolves([issueForP2])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueForP2.number,
          labels: ['SLA P2']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should apply "SLA P3" if issue is 3 weeks from Blocker threshold (1 week old)', async () => {
    const oneWeekAgoISO = getPastDateISO({ weeks: 1 })
    const issueForP3 = createMockIssue(13, oneWeekAgoISO, [
      'A11y',
      'VPAT',
      'Blocker'
    ])
    mockOctokitPaginate.resolves([issueForP3])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: issueForP3.number,
          labels: ['SLA P3']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should not apply any SLA label if issue is too new (0 weeks old for Blocker)', async () => {
    const fewDaysAgoISO = getPastDateISO({ days: 3 })
    const newIssue = createMockIssue(14, fewDaysAgoISO, [
      'A11y',
      'VPAT',
      'Blocker'
    ])
    mockOctokitPaginate.resolves([newIssue])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should not change labels if issue already has the correct SLA label (SLA P1)', async () => {
    const threeWeeksAgoISO = getPastDateISO({ weeks: 3 })
    const issueWithCorrectLabel = createMockIssue(15, threeWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker',
      'SLA P1'
    ])
    mockOctokitPaginate.resolves([issueWithCorrectLabel])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isFalse(mockOctokitAddLabels.called)
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should remove an old SLA label if no new SLA label is applicable', async () => {
    const fewDaysAgoISO = getPastDateISO({ days: 3 })
    const issueWithObsoleteLabel = createMockIssue(16, fewDaysAgoISO, [
      'A11y',
      'VPAT',
      'Blocker',
      'SLA P3'
    ])
    mockOctokitPaginate.resolves([issueWithObsoleteLabel])

    await run()

    assert.isTrue(
      mockOctokitRemoveLabel.calledOnceWith(sinon.match({ name: 'SLA P3' }))
    )
    assert.isFalse(mockOctokitAddLabels.called)
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should call core.setFailed if removing a label fails', async () => {
    const fiveWeeksAgoISO = getPastDateISO({ weeks: 5 })
    const issueToBreach = createMockIssue(20, fiveWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker',
      'SLA P1'
    ])
    mockOctokitPaginate.resolves([issueToBreach])

    const removeError = new Error('API_REMOVE_ERROR')
    mockOctokitRemoveLabel.rejects(removeError)

    await run()

    assert.isTrue(mockOctokitRemoveLabel.calledOnce)
    assert.isTrue(mockCoreSetFailed.calledOnce)
    assert.strictEqual(
      mockCoreSetFailed.firstCall.args[0],
      `Could not remove label SLA P1 from issue #${issueToBreach.number}: ${removeError.message}`
    )
    assert.isFalse(mockOctokitAddLabels.called)
  })

  it('should call core.setFailed if adding a label fails', async () => {
    const threeWeeksAgoISO = getPastDateISO({ weeks: 3 })
    const issueForP1 = createMockIssue(21, threeWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker'
    ])
    mockOctokitPaginate.resolves([issueForP1])

    const addError = new Error('API_ADD_ERROR')
    mockOctokitAddLabels.rejects(addError)

    await run()

    assert.isTrue(mockOctokitAddLabels.calledOnce)
    assert.isTrue(mockCoreSetFailed.calledOnce)
    assert.strictEqual(
      mockCoreSetFailed.firstCall.args[0],
      `Could not add label SLA P1 to issue #${issueForP1.number}: ${addError.message}`
    )
  })

  it('should correctly apply "SLA P1" for a "Critical" issue (10w SLA) at 9 weeks old', async () => {
    const nineWeeksAgoISO = getPastDateISO({ weeks: 9 })
    const criticalIssueForP1 = createMockIssue(30, nineWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Critical'
    ])
    mockOctokitPaginate.resolves([criticalIssueForP1])

    await run()

    assert.isFalse(mockOctokitRemoveLabel.called)
    assert.isTrue(
      mockOctokitAddLabels.calledOnceWith(
        sinon.match({
          owner: MOCK_OWNER,
          repo: MOCK_REPO,
          issue_number: criticalIssueForP1.number,
          labels: ['SLA P1']
        })
      )
    )
    assert.isFalse(mockCoreSetFailed.called)
  })

  it('should remove multiple existing SLA labels if needed when applying a new one', async () => {
    const fiveWeeksAgoISO = getPastDateISO({ weeks: 5 })
    const issueWithMultipleOldSLAs = createMockIssue(40, fiveWeeksAgoISO, [
      'A11y',
      'VPAT',
      'Blocker',
      'SLA P1',
      'SLA P2'
    ])
    mockOctokitPaginate.resolves([issueWithMultipleOldSLAs])

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
})
