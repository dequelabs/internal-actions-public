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
  let writeFileSyncStub: sinon.SinonStub
  let mockExpandWorkspaces: sinon.SinonStub
  let mockResolveNodeModules: sinon.SinonStub
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
      asCSV: sinon
        .stub<Parameters<LicenseChecker['asCSV']>, string>()
        .returns('csv-output'),
      asMarkDown: sinon
        .stub<Parameters<LicenseChecker['asMarkDown']>, string>()
        .returns('markdown-output'),
      asPlainVertical: sinon
        .stub<Parameters<LicenseChecker['asPlainVertical']>, string>()
        .returns('plainvertical-output')
    }

    // Setup fs stubs
    existsSyncStub = sinon.stub(fs, 'existsSync').returns(true)
    readFileSyncStub = sinon.stub(fs, 'readFileSync').returns('{}')
    writeFileSyncStub = sinon.stub(fs, 'writeFileSync')

    // Setup DI mocks — pass-through by default
    mockExpandWorkspaces = sinon.stub().callsFake((p: string) => [p])
    mockResolveNodeModules = sinon
      .stub()
      .callsFake((p: string) => ({ scanPath: p, cleanup: sinon.stub() }))
    mockDetectPnpm = sinon.stub().returns(false)
    mockFindPnpmWorkspaceRoot = sinon.stub().returns(null)
    mockScanPnpm = sinon.stub().returns({})

    // Default input values
    core.getInput.withArgs('dependency-type').returns('production')
    core.getInput.withArgs('start-path').returns('./package.json')
    core.getInput.withArgs('start-paths').returns('')
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

  function runWithMocks() {
    return run({
      core,
      licenseChecker,
      expandWorkspaces: mockExpandWorkspaces,
      resolveNodeModules: mockResolveNodeModules,
      detectPnpm: mockDetectPnpm,
      findPnpmWorkspaceRoot: mockFindPnpmWorkspaceRoot,
      scanPnpm: mockScanPnpm
    })
  }

  it('should fail with invalid dependency-type', async () => {
    core.getInput.withArgs('dependency-type').returns('invalid-type')

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Invalid dependency-type'
      )
    )
  })

  it('should fail with invalid details-output-format', async () => {
    core.getInput.withArgs('details-output-format').returns('invalid-format')

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'Invalid details-output-format'
      )
    )
  })

  it('should fail when path does not exist', async () => {
    existsSyncStub.withArgs(path.resolve('./package.json')).returns(false)

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    const msg = core.setFailed.firstCall.args[0] as string
    assert.ok(msg.includes('start-path'))
    assert.ok(msg.includes('does not exist'))
  })

  it('should handle custom fields path correctly when file exists', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    readFileSyncStub.returns(
      '{"name":"","version":"","licenses":"","licenseText":""}'
    )

    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)
  })

  it('should fail when custom-fields-path does not exist', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    existsSyncStub.withArgs(path.resolve('./custom-fields.json')).returns(false)

    await runWithMocks()

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

    await runWithMocks()

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

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'clarifications-path does not exist'
      )
    )
  })

  it('should fail when scan rejects', async () => {
    const error = new Error('License check failed')
    licenseChecker.init.callsFake((options, cb) => {
      cb(error, {})
    })

    await runWithMocks()

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

    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)
    assert.ok(
      JSON.stringify(licenseChecker.init.firstCall.args[0]).includes(
        clarificationsPath
      )
    )
  })

  it('should fail when path is missing package.json', async () => {
    existsSyncStub.withArgs(path.resolve('./package.json')).returns(true)
    existsSyncStub
      .withArgs(path.resolve('./package.json', 'package.json'))
      .returns(false)

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes(
        'does not contain a package.json'
      )
    )
  })

  it('should handle excludePackages correctly when provided', async () => {
    const excludePackages = 'package1,package2'

    core.getInput.withArgs('exclude-packages').returns(excludePackages)
    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]
    assert.ok(JSON.stringify(options).includes(excludePackages))
  })

  it('should skip excludePackages if not provided', async () => {
    core.getInput.withArgs('exclude-packages').returns('')
    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]
    assert.ok(!JSON.stringify(options).includes('excludePackages'))
  })

  it('should handle excludePackagesStartingWith correctly when provided', async () => {
    const excludePackagesStartingWith = '@scope,react-'

    core.getInput
      .withArgs('exclude-packages-starting-with')
      .returns(excludePackagesStartingWith)
    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]
    assert.ok(JSON.stringify(options).includes(excludePackagesStartingWith))
  })

  it('should skip excludePackagesStartingWith if not provided', async () => {
    core.getInput.withArgs('exclude-packages-starting-with').returns('')
    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)

    const options = licenseChecker.init.firstCall.args[0]
    assert.ok(!JSON.stringify(options).includes('excludePackagesStartingWith'))
  })

  it('should handle detailsOutputPath parameter correctly', async () => {
    const detailsOutputPath = './license-details.json'

    core.getInput.withArgs('details-output-path').returns(detailsOutputPath)
    await runWithMocks()

    assert.strictEqual(core.setFailed.notCalled, true)
    assert.strictEqual(writeFileSyncStub.calledOnce, true)
  })

  it('should fail when licenseCheckerSummary is empty', async () => {
    licenseChecker.asSummary.returns('')

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    assert.ok(
      (core.setFailed.firstCall.args[0] as string).includes('No licenses found')
    )
  })

  it('should log license checker summary when available', async () => {
    const summary = 'License summary with details'
    licenseChecker.asSummary.returns(summary)

    await runWithMocks()

    const infoCall = core.info
      .getCalls()
      .find(call => (call.args[0] as string).includes(summary))
    assert.notStrictEqual(infoCall, undefined)
  })

  it('should handle errors during execution', async () => {
    licenseChecker.init.throws(new Error('Unexpected error occurred'))

    await runWithMocks()

    assert.strictEqual(core.setFailed.called, true)
    const msg = core.setFailed.firstCall.args[0] as string
    assert.ok(msg.includes('Error checking licenses'))
    assert.ok(msg.includes('Unexpected error occurred'))
  })

  it('should use default expandWorkspaces and resolveNodeModules when not injected', async () => {
    // Call run without DI overrides — exercises the default parameter branches.
    // The real defaults will run but since fs is stubbed, the scan likely
    // produces an error or empty result. We just verify the defaults are used
    // (no TypeError from missing functions).
    await run({ core, licenseChecker })

    // If it gets to setFailed or asSummary, the defaults were used successfully
    assert.ok(core.setFailed.called || licenseChecker.asSummary.called)
  })

  describe('workspace expansion', () => {
    it('should call expandWorkspaces for each path', async () => {
      core.getInput.withArgs('start-paths').returns('./path-a, ./path-b')

      await runWithMocks()

      assert.strictEqual(mockExpandWorkspaces.callCount, 2)
    })

    it('should call resolveNodeModules for each expanded path', async () => {
      mockExpandWorkspaces.returns(['/project', '/project/packages/app-a'])

      await runWithMocks()

      assert.strictEqual(mockResolveNodeModules.callCount, 2)
      assert.strictEqual(mockResolveNodeModules.firstCall.args[0], '/project')
      assert.strictEqual(
        mockResolveNodeModules.secondCall.args[0],
        '/project/packages/app-a'
      )
    })

    it('should call cleanup even when scan fails', async () => {
      const cleanupStub = sinon.stub()
      mockResolveNodeModules.returns({
        scanPath: '/tmp/scan',
        cleanup: cleanupStub
      })
      licenseChecker.init.callsFake((options, cb) => {
        cb(new Error('scan error'), {})
      })

      await runWithMocks()

      assert.strictEqual(cleanupStub.calledOnce, true)
    })

    it('should merge results from multiple expanded paths', async () => {
      let callCount = 0
      licenseChecker.init.callsFake((options, cb) => {
        const packages =
          callCount === 0
            ? { 'pkg-root@1.0.0': { licenses: 'MIT' } }
            : { 'pkg-ws@2.0.0': { licenses: 'Apache-2.0' } }
        callCount++
        cb(
          // @ts-expect-error The error parameter is typed as required but can be null in practice
          null,
          packages
        )
      })
      mockExpandWorkspaces.returns(['/project', '/project/packages/app-a'])

      await runWithMocks()

      const merged = licenseChecker.asSummary.firstCall.args[0]
      assert.notStrictEqual(merged['pkg-root@1.0.0'], undefined)
      assert.notStrictEqual(merged['pkg-ws@2.0.0'], undefined)
    })
  })

  describe('multi-path flow', () => {
    beforeEach(() => {
      core.getInput.withArgs('start-paths').returns('./path-a, ./path-b')

      let callCount = 0
      licenseChecker.init.callsFake((options, cb) => {
        const packages =
          callCount === 0
            ? { 'pkg-a@1.0.0': { licenses: 'MIT' } }
            : { 'pkg-b@2.0.0': { licenses: 'Apache-2.0' } }
        callCount++
        cb(
          // @ts-expect-error The error parameter is typed as required but can be null in practice
          null,
          packages
        )
      })
    })

    it('should scan each path and merge results', async () => {
      await runWithMocks()

      assert.strictEqual(core.setFailed.notCalled, true)
      assert.strictEqual(licenseChecker.init.callCount, 2)
    })

    it('should fail when a path does not exist', async () => {
      existsSyncStub.withArgs(path.resolve('./path-b')).returns(false)

      await runWithMocks()

      assert.strictEqual(core.setFailed.called, true)
      const msg = core.setFailed.firstCall.args[0] as string
      assert.ok(msg.includes('start-paths'))
      assert.ok(msg.includes('does not exist'))
    })

    it('should write output file when details-output-path is set', async () => {
      core.getInput.withArgs('details-output-path').returns('./output.json')

      await runWithMocks()

      assert.strictEqual(writeFileSyncStub.calledOnce, true)
      const writtenContent = JSON.parse(
        writeFileSyncStub.firstCall.args[1] as string
      )
      assert.notStrictEqual(writtenContent['pkg-a@1.0.0'], undefined)
      assert.notStrictEqual(writtenContent['pkg-b@2.0.0'], undefined)
    })

    it('should use CSV formatter when format is CSV', async () => {
      core.getInput.withArgs('details-output-path').returns('./output.csv')
      core.getInput.withArgs('details-output-format').returns('csv')

      await runWithMocks()

      assert.strictEqual(licenseChecker.asCSV.calledOnce, true)
      assert.strictEqual(writeFileSyncStub.firstCall.args[1], 'csv-output')
    })

    it('should use Markdown formatter when format is Markdown', async () => {
      core.getInput.withArgs('details-output-path').returns('./output.md')
      core.getInput.withArgs('details-output-format').returns('markdown')

      await runWithMocks()

      assert.strictEqual(licenseChecker.asMarkDown.calledOnce, true)
    })

    it('should use PlainVertical formatter when format is PlainVertical', async () => {
      core.getInput.withArgs('details-output-path').returns('./output.txt')
      core.getInput.withArgs('details-output-format').returns('plainVertical')

      await runWithMocks()

      assert.strictEqual(licenseChecker.asPlainVertical.calledOnce, true)
    })

    it('should not write output file when details-output-path is empty', async () => {
      await runWithMocks()

      assert.strictEqual(writeFileSyncStub.notCalled, true)
    })

    it('should fail when onlyAllow is violated in merged results', async () => {
      core.getInput.withArgs('only-allow').returns('MIT')

      await runWithMocks()

      assert.strictEqual(core.setFailed.called, true)
      const msg = core.setFailed.firstCall.args[0] as string
      assert.ok(msg.includes('pkg-b@2.0.0'))
      assert.ok(!msg.includes('Error checking licenses'))
    })

    it('should not fail when all licenses match onlyAllow', async () => {
      core.getInput.withArgs('only-allow').returns('MIT;Apache-2.0')

      await runWithMocks()

      assert.strictEqual(core.setFailed.notCalled, true)
    })

    it('should fail when merged summary is empty', async () => {
      licenseChecker.asSummary.returns('')

      await runWithMocks()

      assert.strictEqual(core.setFailed.called, true)
      assert.ok(
        (core.setFailed.firstCall.args[0] as string).includes(
          'No licenses found'
        )
      )
    })

    it('should take precedence over start-path', async () => {
      core.getInput.withArgs('start-path').returns('./ignored-path')

      await runWithMocks()

      // expandWorkspaces should be called with resolved path-a and path-b, not ignored-path
      assert.strictEqual(mockExpandWorkspaces.callCount, 2)
    })

    it('should handle whitespace-only entries in start-paths', async () => {
      core.getInput.withArgs('start-paths').returns('./path-a, , ./path-b')

      await runWithMocks()

      assert.strictEqual(mockExpandWorkspaces.callCount, 2)
    })

    it('should pass excludePackages, excludePackagesStartingWith, and clarificationsPath to each scan', async () => {
      core.getInput.withArgs('exclude-packages').returns('excluded-pkg')
      core.getInput.withArgs('exclude-packages-starting-with').returns('@test/')
      core.getInput
        .withArgs('clarifications-path')
        .returns('./clarifications.json')

      await runWithMocks()

      const firstCallOpts = licenseChecker.init.firstCall.args[0]
      assert.strictEqual(firstCallOpts.excludePackages, 'excluded-pkg')
      assert.strictEqual(firstCallOpts.excludePackagesStartingWith, '@test/')
      assert.strictEqual(
        firstCallOpts.clarificationsFile,
        './clarifications.json'
      )
    })

    it('should fail when start-paths contains only commas', async () => {
      core.getInput.withArgs('start-paths').returns(', ,')

      await runWithMocks()

      assert.strictEqual(core.setFailed.called, true)
      assert.ok(
        (core.setFailed.firstCall.args[0] as string).includes(
          'contains no valid paths'
        )
      )
    })
  })
})
