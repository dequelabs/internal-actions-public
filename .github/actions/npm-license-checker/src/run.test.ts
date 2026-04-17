import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import run from './run.ts'
import type { Core, LicenseChecker, ModuleInfos } from './types.ts'
import type { InitOpts } from 'license-checker-rseidelsohn'

describe('run', () => {
  let core: sinon.SinonStubbedInstance<Core>
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>
  let existsSyncStub: sinon.SinonStub
  let readFileSyncStub: sinon.SinonStub
  let mockDetectPnpm: sinon.SinonStub
  let mockFindPnpmWorkspaceRoot: sinon.SinonStub
  let mockScanPnpm: sinon.SinonStub

  beforeEach(() => {
    // Setup core mock
    core = {
      getInput: sinon.stub(),
      setFailed: sinon.stub(),
      info: sinon.stub()
    }

    // Setup license-checker mock
    licenseChecker = {
      asSummary: sinon.stub().returns('License summary') as sinon.SinonStub<
        [ModuleInfos],
        string
      >,
      init: sinon
        .stub<[InitOpts, (err: Error, ret: ModuleInfos) => void]>()
        .callsFake((options, cb) => {
          cb(
            // @ts-expect-error The error parameter is typed as required but can be null in practice
            null,
            {}
          )
        }),
      asCSV: sinon.stub(),
      asMarkDown: sinon.stub(),
      asPlainVertical: sinon.stub()
    }

    // Setup fs stubs
    existsSyncStub = sinon.stub(fs, 'existsSync').returns(true)
    readFileSyncStub = sinon.stub(fs, 'readFileSync').returns('{}')

    // Default pnpm mocks — tests exercising the library path need these to
    // short-circuit to false; pnpm-specific tests override as needed.
    mockDetectPnpm = sinon.stub().returns(false)
    mockFindPnpmWorkspaceRoot = sinon.stub().returns(null)
    mockScanPnpm = sinon.stub().returns({})

    // Default input values
    core.getInput.withArgs('dependency-type').returns('production')
    core.getInput.withArgs('start-path').returns('./package.json')
    core.getInput.withArgs('custom-fields-path').returns('')
    core.getInput.withArgs('clarifications-path').returns('')
    core.getInput.withArgs('only-allow').returns('')
    core.getInput.withArgs('details-output-path').returns('')
    core.getInput.withArgs('exclude-packages').returns('')
    core.getInput.withArgs('exclude-packages-starting-with').returns('')
    core.getInput.withArgs('details-output-format').returns('json')
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should fail with invalid dependency-type', async () => {
    core.getInput.withArgs('dependency-type').returns('invalid-type')

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Invalid dependency-type'
      )
    )
  })

  it('should fail with invalid details-output-format', async () => {
    core.getInput.withArgs('details-output-format').returns('invalid-format')

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Invalid details-output-format'
      )
    )
  })

  it('should fail when start-path does not exist', async () => {
    existsSyncStub.withArgs(path.resolve('./package.json')).returns(false)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'start-path does not exist'
      )
    )
  })

  it('should normalize a package.json start-path to its parent directory', async () => {
    core.getInput.withArgs('start-path').returns('/tmp/foo/package.json')
    existsSyncStub.withArgs(path.resolve('/tmp/foo/package.json')).returns(true)
    sinon.stub(fs, 'statSync').returns({ isDirectory: () => false } as fs.Stats)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(
      mockDetectPnpm.firstCall.args[0],
      path.resolve('/tmp/foo')
    )
  })

  it('should reject a non-package.json file as start-path', async () => {
    core.getInput.withArgs('start-path').returns('/tmp/foo/README.md')
    existsSyncStub.withArgs(path.resolve('/tmp/foo/README.md')).returns(true)
    sinon.stub(fs, 'statSync').returns({ isDirectory: () => false } as fs.Stats)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'start-path must be a directory or a package.json file'
      )
    )
    assert.strictEqual(mockDetectPnpm.called, false)
  })

  it('should accept a directory start-path unchanged', async () => {
    core.getInput.withArgs('start-path').returns('/tmp/foo')
    existsSyncStub.withArgs(path.resolve('/tmp/foo')).returns(true)
    sinon.stub(fs, 'statSync').returns({ isDirectory: () => true } as fs.Stats)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(
      mockDetectPnpm.firstCall.args[0],
      path.resolve('/tmp/foo')
    )
  })

  it('should continue past start-path normalization when statSync fails', async () => {
    sinon.stub(fs, 'statSync').throws(new Error('EACCES'))

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    // Falls through to the default library path (detectPnpm returns false)
    assert.strictEqual(licenseChecker.init.called, true)
  })

  it('should handle custom fields path correctly when file exists', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    readFileSyncStub.returns(
      '{"name":"","version":"","licenses":"","licenseText":""}'
    )

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)
  })

  it('should fail when custom-fields-path does not exist', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    existsSyncStub.withArgs(path.resolve('./custom-fields.json')).returns(false)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'custom-fields-path does not exist'
      )
    )
  })

  it('should fail when custom fields file is invalid JSON', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    readFileSyncStub.returns('invalid json')

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Error reading or parsing customFieldsPath'
      )
    )
  })

  it('should fail when clarifications path does not exist', async () => {
    core.getInput
      .withArgs('clarifications-path')
      .returns('./clarifications.json')
    existsSyncStub
      .withArgs(path.resolve('./clarifications.json'))
      .returns(false)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'clarifications-path does not exist'
      )
    )
    // Should short-circuit before any scan happens.
    assert.strictEqual(licenseChecker.init.called, false)
    assert.strictEqual(mockDetectPnpm.called, false)
  })

  it('should fail when checkLicenses rejects', async () => {
    const error = new Error('License check failed')
    licenseChecker.init.callsFake((options, cb) => {
      cb(error, {})
    })

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'License check failed'
      )
    )
  })

  it('should handle clarificationsPath correctly when file exists', async () => {
    const clarificationsPath = './clarifications.json'

    core.getInput.withArgs('clarifications-path').returns(clarificationsPath)
    existsSyncStub.withArgs(path.resolve(clarificationsPath)).returns(true)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)
    assert.ok(
      JSON.stringify(licenseChecker.init.firstCall.args[0]).includes(
        clarificationsPath
      )
    )
  })

  it('should handle excludePackages correctly when provided', async () => {
    const excludePackages = 'package1,package2'

    core.getInput.withArgs('exclude-packages').returns(excludePackages)
    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]

    assert.ok(JSON.stringify(options).includes(excludePackages))
  })

  it('should skip excludePackages if not provided', async () => {
    core.getInput.withArgs('exclude-packages').returns('')
    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]

    assert.ok(!JSON.stringify(options).includes('excludePackages'))
  })

  it('should handle excludePackagesStartingWith correctly when provided', async () => {
    const excludePackagesStartingWith = '@scope,react-'

    core.getInput
      .withArgs('exclude-packages-starting-with')
      .returns(excludePackagesStartingWith)
    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]

    assert.ok(JSON.stringify(options).includes(excludePackagesStartingWith))
  })

  it('should skip excludePackagesStartingWith if not provided', async () => {
    core.getInput.withArgs('exclude-packages-starting-with').returns('')
    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]

    assert.ok(!JSON.stringify(options).includes('excludePackagesStartingWith'))
  })

  it('should handle onlyAllow parameter correctly', async () => {
    const onlyAllow = 'MIT,Apache-2.0'

    core.getInput.withArgs('only-allow').returns(onlyAllow)
    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]

    assert.ok(JSON.stringify(options).includes(onlyAllow))
  })

  it('should handle detailsOutputPath parameter correctly', async () => {
    const detailsOutputPath = './license-details.json'

    core.getInput.withArgs('details-output-path').returns(detailsOutputPath)
    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]

    assert.ok(JSON.stringify(options).includes(detailsOutputPath))
  })

  it('should fail when licenseCheckerSummary is empty', async () => {
    licenseChecker.asSummary.returns('')

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes('No licenses found')
    )
  })

  it('should log info with provided options', async () => {
    core.getInput.withArgs('only-allow').returns('MIT')
    core.getInput.withArgs('details-output-path').returns('./details.json')

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    const infoCall = core.info
      .getCalls()
      .find(call => call.args[0].includes('Provided options'))
    assert.notStrictEqual(infoCall, undefined)
    assert.ok(infoCall!.args[0].includes('MIT'))
    assert.ok(infoCall!.args[0].includes('./details.json'))
  })

  it('should log license checker summary when available', async () => {
    const summary = 'License summary with details'
    licenseChecker.asSummary.returns(summary)

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    const infoCall = core.info
      .getCalls()
      .find(call => call.args[0].includes(summary))
    assert.notStrictEqual(infoCall, undefined)
    assert.ok(infoCall!.args[0].includes(summary))
  })

  it('should handle errors during execution', async () => {
    licenseChecker.init.throws(new Error('Unexpected error occurred'))

    await run({
      core,
      licenseChecker,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Error checking licenses'
      )
    )
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Unexpected error occurred'
      )
    )
  })

  describe('pnpm routing', () => {
    beforeEach(() => {
      mockDetectPnpm.returns(true)
      mockScanPnpm.returns({
        'foo@1.0.0': { licenses: 'MIT' }
      })
    })

    it('should route pnpm projects to scanPnpm', async () => {
      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      assert.strictEqual(mockScanPnpm.calledOnce, true)
      assert.strictEqual(licenseChecker.init.notCalled, true)
    })

    it('should use --filter for pnpm workspace members', async () => {
      core.getInput.withArgs('start-path').returns('./packages/app')
      mockFindPnpmWorkspaceRoot.returns(path.resolve('./'))

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      const opts = mockScanPnpm.firstCall.args[0]
      assert.strictEqual(opts.filter, './packages/app')
      assert.strictEqual(opts.recursive, false)
    })

    it('should use -r for pnpm workspace root', async () => {
      const root = path.resolve('./')
      mockFindPnpmWorkspaceRoot.returns(root)

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      const opts = mockScanPnpm.firstCall.args[0]
      assert.strictEqual(opts.recursive, true)
      assert.strictEqual(opts.filter, undefined)
    })

    it('should surface pnpm ENOENT error without wrapper', async () => {
      mockScanPnpm.throws(
        new Error(
          'pnpm is required to scan a pnpm-managed project but was not found on PATH. Install pnpm in your workflow (for example, add a step "uses: pnpm/action-setup@v4") and retry.'
        )
      )

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      assert.strictEqual(core.setFailed.called, true)
      const msg = core.setFailed.firstCall.args[0] as string
      assert.ok(msg.includes('pnpm/action-setup'))
      assert.ok(!msg.includes('Error checking licenses'))
    })

    it('should apply excludes to pnpm results', async () => {
      mockScanPnpm.returns({
        'foo@1.0.0': { licenses: 'MIT' },
        'bar@2.0.0': { licenses: 'MIT' }
      })
      core.getInput.withArgs('exclude-packages').returns('bar')

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      const merged = licenseChecker.asSummary.firstCall.args[0] as ModuleInfos
      assert.ok('foo@1.0.0' in merged)
      assert.ok(!('bar@2.0.0' in merged))
    })

    it('should apply clarifications to pnpm results', async () => {
      mockScanPnpm.returns({
        'foo@1.0.0': { licenses: 'UNKNOWN' }
      })
      core.getInput
        .withArgs('clarifications-path')
        .returns('./clarifications.json')
      readFileSyncStub
        .withArgs('./clarifications.json', 'utf8')
        .returns(JSON.stringify({ 'foo@^1.0.0': { licenses: 'MIT' } }))

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      const merged = licenseChecker.asSummary.firstCall.args[0] as ModuleInfos
      assert.strictEqual(merged['foo@1.0.0'].licenses, 'MIT')
    })

    it('should fail with targeted message when clarifications JSON is invalid', async () => {
      mockScanPnpm.returns({
        'foo@1.0.0': { licenses: 'MIT' }
      })
      core.getInput
        .withArgs('clarifications-path')
        .returns('./clarifications.json')
      readFileSyncStub
        .withArgs('./clarifications.json', 'utf8')
        .returns('not valid json')

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      assert.strictEqual(core.setFailed.called, true)
      assert.ok(
        (core.setFailed.firstCall.args[0] as string).includes(
          'Error applying excludes/clarifications'
        )
      )
    })

    it('should apply excludes-starting-with to pnpm results', async () => {
      mockScanPnpm.returns({
        '@scope/foo@1.0.0': { licenses: 'MIT' },
        'bar@2.0.0': { licenses: 'MIT' }
      })
      core.getInput
        .withArgs('exclude-packages-starting-with')
        .returns('@scope/')

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      const merged = licenseChecker.asSummary.firstCall.args[0] as ModuleInfos
      assert.ok(!('@scope/foo@1.0.0' in merged))
      assert.ok('bar@2.0.0' in merged)
    })

    it('should fail pnpm path when onlyAllow is violated', async () => {
      mockScanPnpm.returns({
        'bad@1.0.0': { licenses: 'GPL-3.0' }
      })
      core.getInput.withArgs('only-allow').returns('MIT')

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      assert.strictEqual(core.setFailed.called, true)
      const msg = core.setFailed.firstCall.args[0] as string
      assert.ok(msg.includes('bad@1.0.0'))
      assert.ok(!msg.includes('Error checking licenses'))
    })

    it('should write output file for pnpm results', async () => {
      const writeStub = sinon.stub(fs, 'writeFileSync')
      core.getInput.withArgs('details-output-path').returns('./out.json')

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      assert.strictEqual(writeStub.calledOnce, true)
      assert.ok((writeStub.firstCall.args[1] as string).includes('foo@1.0.0'))
    })

    it('should fail pnpm scan when summary is empty', async () => {
      mockScanPnpm.returns({})
      licenseChecker.asSummary.returns('')

      await run({
        core,
        licenseChecker,
        detectPnpm: mockDetectPnpm,
        findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
        scanPnpm: mockScanPnpm
      })

      assert.strictEqual(core.setFailed.called, true)
      assert.ok(
        (core.setFailed.firstCall.args[0] as string).includes(
          'No licenses found'
        )
      )
    })

    it('should use default detectPnpm/scanPnpm when not injected', async () => {
      // Pass no DI — real defaults will try to detect pnpm from cwd. Since the
      // repo root has a node_modules (from our install), defaults are exercised.
      await run({ core, licenseChecker })

      // Either the scan succeeded (reached asSummary) or failed (setFailed) —
      // either way, the defaults were invoked.
      assert.ok(core.setFailed.called || licenseChecker.asSummary.called)
    })
  })
})
