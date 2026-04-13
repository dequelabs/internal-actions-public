import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import checkLicensesRaw from './checkLicensesRaw.ts'
import type {
  CheckLicensesRawOptions,
  Core,
  LicenseChecker,
  ModuleInfos
} from './types.ts'

type InitCallback = (error: Error, packages: ModuleInfos) => void

describe('checkLicensesRaw', () => {
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>
  let core: sinon.SinonStubbedInstance<Core>
  let options: CheckLicensesRawOptions

  beforeEach(() => {
    licenseChecker = {
      init: sinon.stub(),
      asSummary: sinon.stub(),
      asCSV: sinon.stub(),
      asMarkDown: sinon.stub(),
      asPlainVertical: sinon.stub()
    }

    core = {
      info: sinon.stub(),
      getInput: sinon.stub(),
      setFailed: sinon.stub()
    }

    options = {
      dependencyType: 'production',
      startPath: './test-path',
      customFields: { name: '', version: '' },
      excludePackages: 'excluded-pkg',
      excludePackagesStartingWith: '@test/',
      clarificationsPath: './clarifications.json'
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, {})
    })
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should resolve with packages when scan succeeds', async () => {
    const mockPackages: ModuleInfos = {
      'package-1': { licenses: 'MIT' }
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, mockPackages)
    })

    const result = await checkLicensesRaw(licenseChecker, options, core)

    assert.deepStrictEqual(result, mockPackages)
  })

  it('should reject when scan fails', async () => {
    const error = new Error('Scan failed')
    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(error, null)
    })

    try {
      await checkLicensesRaw(licenseChecker, options, core)
      assert.fail('Expected checkLicensesRaw to reject')
    } catch (err) {
      assert.strictEqual(err, error)
    }
  })

  it('should not pass onlyAllow, out, or format flags to init', async () => {
    await checkLicensesRaw(licenseChecker, options, core)

    const initOpts = licenseChecker.init.firstCall.args[0]
    assert.strictEqual(initOpts.onlyAllow, undefined)
    assert.strictEqual(initOpts.out, undefined)
    assert.strictEqual(initOpts.json, undefined)
    assert.strictEqual(initOpts.csv, undefined)
    // @ts-expect-error - markdown is not in the InitOpts type
    assert.strictEqual(initOpts.markdown, undefined)
    // @ts-expect-error - plainVertical is not in the InitOpts type
    assert.strictEqual(initOpts.plainVertical, undefined)
  })

  it('should pass scanning options correctly', async () => {
    await checkLicensesRaw(licenseChecker, options, core)

    const initOpts = licenseChecker.init.firstCall.args[0]
    assert.strictEqual(initOpts.start, './test-path')
    assert.strictEqual(initOpts.production, true)
    assert.deepStrictEqual(initOpts.customFormat, { name: '', version: '' })
    assert.strictEqual(initOpts.excludePackages, 'excluded-pkg')
    assert.strictEqual(initOpts.excludePackagesStartingWith, '@test/')
    assert.strictEqual(initOpts.clarificationsFile, './clarifications.json')
  })

  it('should handle all dependency type', async () => {
    options.dependencyType = 'all'
    await checkLicensesRaw(licenseChecker, options, core)

    const initOpts = licenseChecker.init.firstCall.args[0]
    assert.strictEqual(initOpts.production, false)
  })

  it('should handle undefined optional fields', async () => {
    const minimalOptions: CheckLicensesRawOptions = {
      dependencyType: 'production',
      startPath: './test-path'
    }

    await checkLicensesRaw(licenseChecker, minimalOptions, core)

    const initOpts = licenseChecker.init.firstCall.args[0]
    assert.strictEqual(initOpts.customFormat, undefined)
    assert.strictEqual(initOpts.excludePackages, undefined)
    assert.strictEqual(initOpts.excludePackagesStartingWith, undefined)
    assert.strictEqual(initOpts.clarificationsFile, undefined)
  })

  it('should log scanning info', async () => {
    await checkLicensesRaw(licenseChecker, options, core)

    assert.strictEqual(core.info.calledOnce, true)
    assert.ok((core.info.firstCall.args[0] as string).includes('./test-path'))
  })
})
