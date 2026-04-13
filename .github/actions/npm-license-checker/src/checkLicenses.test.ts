import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import checkLicenses from './checkLicenses.ts'
import type {
  CheckLicensesOptions,
  Core,
  LicenseChecker,
  ModuleInfos,
  CustomFields
} from './types.ts'

type InitCallback = (error: Error, packages: ModuleInfos) => void

describe('checkLicenses', () => {
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>
  let core: sinon.SinonStubbedInstance<Core>
  let options: CheckLicensesOptions

  beforeEach(() => {
    licenseChecker = {
      init: sinon.stub(),
      asSummary: sinon.stub()
    }

    core = {
      info: sinon.stub(),
      getInput: sinon.stub(),
      setFailed: sinon.stub()
    }

    options = {
      dependencyType: 'production',
      startPath: './test-path',
      customFields: ['author', 'license'],
      onlyAllow: 'MIT',
      excludePackages: 'excluded-package',
      excludePackagesStartingWith: '@test/',
      detailsOutputFormat: 'json',
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

  it('should resolve with packages when license check succeeds', async () => {
    const mockPackages: ModuleInfos = {
      'package-1': { licenses: 'MIT' },
      'package-2': { licenses: 'Apache-2.0' }
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, mockPackages)
    })

    const result = await checkLicenses(licenseChecker, options, core)

    assert.deepStrictEqual(result, mockPackages)
    assert.strictEqual(licenseChecker.init.calledOnce, true)
    assert.deepStrictEqual(licenseChecker.init.firstCall.args[0], {
      json: true,
      csv: false,
      markdown: false,
      plainVertical: false,
      start: options.startPath,
      production: true,
      development: false,
      out: undefined,
      onlyAllow: options.onlyAllow,
      customFormat: options.customFields,
      excludePackages: options.excludePackages,
      excludePackagesStartingWith: options.excludePackagesStartingWith,
      clarificationsFile: options.clarificationsPath
    })
  })

  it('should reject when license check fails', async () => {
    const error = new Error('License check failed')
    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(error, null)
    })

    try {
      await checkLicenses(licenseChecker, options, core)
      assert.fail('Expected checkLicenses to reject')
    } catch (err) {
      assert.strictEqual(err, error)
    }
    assert.strictEqual(licenseChecker.init.calledOnce, true)
  })

  it('should handle development dependencies', async () => {
    options.dependencyType = 'development'
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      production: false,
      development: true
    })
  })

  it('should handle CSV output format', async () => {
    options.detailsOutputFormat = 'csv'
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: true,
      markdown: false
    })
  })

  it('should handle Markdown output format', async () => {
    options.detailsOutputFormat = 'markdown'
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: false,
      markdown: true
    })
  })

  it('should handle PlainVertical output format', async () => {
    options.detailsOutputFormat = 'plainVertical'
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: false,
      markdown: false,
      plainVertical: true
    })
  })

  it('should handle detailsOutputPath correctly', async () => {
    options.detailsOutputPath = './license-output.json'
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      out: options.detailsOutputPath
    })
  })

  it('should log license checker options', async () => {
    await checkLicenses(licenseChecker, options, core)

    assert.strictEqual(core.info.calledOnce, true)

    const infoMessage = core.info.firstCall.args[0]

    assert.ok(
      infoMessage.includes(
        'Start checking licenses with the following options'
      )
    )
    assert.ok(infoMessage.includes(options.startPath))
    assert.ok(infoMessage.includes('MIT'))
  })

  it('should handle customFields as an object', async () => {
    const customFieldsObj: CustomFields = {
      name: 'custom-name',
      version: 'custom-version',
      licenses: 'custom-license',
      licenseText: 'custom-text'
    }

    options.customFields = customFieldsObj
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      customFormat: customFieldsObj
    })
  })

  it('should handle undefined excludePackages', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { excludePackages, ...optionsWithoutExcludePackages } = options

    await checkLicenses(licenseChecker, optionsWithoutExcludePackages, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.strictEqual(initOptions.excludePackages, undefined)
  })

  it('should handle undefined excludePackagesStartingWith', async () => {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for testing
      excludePackagesStartingWith,
      ...optionsWithoutExcludePackagesStartingWith
    } = options

    await checkLicenses(
      licenseChecker,
      optionsWithoutExcludePackagesStartingWith,
      core
    )

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.strictEqual(initOptions.excludePackagesStartingWith, undefined)
  })

  it('should handle undefined onlyAllow', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { onlyAllow, ...optionsWithoutOnlyAllow } = options

    await checkLicenses(licenseChecker, optionsWithoutOnlyAllow, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.strictEqual(initOptions.onlyAllow, undefined)
  })

  it('should handle undefined clarificationsPath', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { clarificationsPath, ...optionsWithoutClarificationsPath } = options

    await checkLicenses(licenseChecker, optionsWithoutClarificationsPath, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.strictEqual(initOptions.clarificationsFile, undefined)
  })

  it('should handle undefined customFields', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { customFields, ...optionsWithoutCustomFields } = options

    await checkLicenses(licenseChecker, optionsWithoutCustomFields, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.strictEqual(initOptions.customFormat, undefined)
  })

  it('should handle all dependencies type', async () => {
    options.dependencyType = 'all'
    await checkLicenses(licenseChecker, options, core)

    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      production: false,
      development: false
    })
  })

  it('should handle packages with SPDX OR expressions in licenses', async () => {
    const mockPackages: ModuleInfos = {
      'package-1': { licenses: '(MIT OR Apache-2.0)' },
      'package-2': { licenses: 'MIT' }
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, mockPackages)
    })

    const result = await checkLicenses(licenseChecker, options, core)

    assert.deepStrictEqual(result, mockPackages)
    assert.strictEqual(result['package-1'].licenses, '(MIT OR Apache-2.0)')
  })

  it('should handle packages with SPDX AND expressions in licenses', async () => {
    const mockPackages: ModuleInfos = {
      'package-1': { licenses: '(MIT AND BSD-3-Clause)' }
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, mockPackages)
    })

    const result = await checkLicenses(licenseChecker, options, core)

    assert.deepStrictEqual(result, mockPackages)
    assert.strictEqual(result['package-1'].licenses, '(MIT AND BSD-3-Clause)')
  })

  it('should handle SPDX license expressions in onlyAllow', async () => {
    const mockPackages: ModuleInfos = {
      'package-1': { licenses: '(MIT OR Apache-2.0)' },
      'package-2': { licenses: 'ISC' }
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, mockPackages)
    })

    options.onlyAllow = 'MIT;Apache-2.0;ISC'

    const result = await checkLicenses(licenseChecker, options, core)

    assert.deepStrictEqual(result, mockPackages)
    assert.partialDeepStrictEqual(licenseChecker.init.firstCall.args[0], {
      onlyAllow: 'MIT;Apache-2.0;ISC'
    })
  })

  it('should correctly include empty licenses', async () => {
    const mockPackagesWithEmptyLicense: ModuleInfos = {
      'package-1': { licenses: 'MIT' },
      'package-2': { licenses: '' }
    }

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, mockPackagesWithEmptyLicense)
    })

    const result = await checkLicenses(licenseChecker, options, core)

    assert.deepStrictEqual(result, mockPackagesWithEmptyLicense)
  })
})
