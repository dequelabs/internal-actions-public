import { assert } from 'chai'
import sinon from 'sinon'
import checkLicenses from './checkLicenses'
import {
  CheckLicensesOptions,
  Core,
  DependencyType,
  DetailsOutputFormat,
  LicenseChecker,
  ModuleInfos,
  CustomFields
} from './types'

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
      dependencyType: DependencyType.Production,
      startPath: './test-path',
      customFields: ['author', 'license'],
      onlyAllow: 'MIT',
      excludePackages: 'excluded-package',
      excludePackagesStartingWith: '@test/',
      detailsOutputFormat: DetailsOutputFormat.JSON,
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

    assert.deepEqual(result, mockPackages)
    assert.isTrue(licenseChecker.init.calledOnce)
    assert.deepEqual(licenseChecker.init.firstCall.args[0], {
      json: true,
      csv: false,
      // @ts-expect-error - The markdown option is not typed in license-checker-rseidelsohn
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
    assert.isTrue(licenseChecker.init.calledOnce)
  })

  it('should handle development dependencies', async () => {
    options.dependencyType = DependencyType.Development
    await checkLicenses(licenseChecker, options, core)

    assert.include(licenseChecker.init.firstCall.args[0], {
      production: false,
      development: true
    })
  })

  it('should handle CSV output format', async () => {
    options.detailsOutputFormat = DetailsOutputFormat.CSV
    await checkLicenses(licenseChecker, options, core)

    assert.deepOwnInclude(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: true,
      markdown: false
    })
  })

  it('should handle Markdown output format', async () => {
    options.detailsOutputFormat = DetailsOutputFormat.Markdown
    await checkLicenses(licenseChecker, options, core)

    assert.deepOwnInclude(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: false,
      markdown: true
    })
  })

  it('should handle PlainVertical output format', async () => {
    options.detailsOutputFormat = DetailsOutputFormat.PlainVertical
    await checkLicenses(licenseChecker, options, core)

    assert.deepOwnInclude(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: false,
      markdown: false,
      plainVertical: true
    })
  })

  it('should handle detailsOutputPath correctly', async () => {
    options.detailsOutputPath = './license-output.json'
    await checkLicenses(licenseChecker, options, core)

    assert.include(licenseChecker.init.firstCall.args[0], {
      out: options.detailsOutputPath
    })
  })

  it('should log license checker options', async () => {
    await checkLicenses(licenseChecker, options, core)

    assert.isTrue(core.info.calledOnce)

    const infoMessage = core.info.firstCall.args[0]

    assert.include(
      infoMessage,
      'Start checking licenses with the following options'
    )
    assert.include(infoMessage, options.startPath)
    assert.include(infoMessage, 'MIT')
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

    assert.include(licenseChecker.init.firstCall.args[0], {
      customFormat: customFieldsObj
    })
  })

  it('should handle undefined excludePackages', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { excludePackages, ...optionsWithoutExcludePackages } = options

    await checkLicenses(licenseChecker, optionsWithoutExcludePackages, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.isUndefined(initOptions.excludePackages)
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

    assert.isUndefined(initOptions.excludePackagesStartingWith)
  })

  it('should handle undefined onlyAllow', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { onlyAllow, ...optionsWithoutOnlyAllow } = options

    await checkLicenses(licenseChecker, optionsWithoutOnlyAllow, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.isUndefined(initOptions.onlyAllow)
  })

  it('should handle undefined clarificationsPath', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { clarificationsPath, ...optionsWithoutClarificationsPath } = options

    await checkLicenses(licenseChecker, optionsWithoutClarificationsPath, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.isUndefined(initOptions.clarificationsFile)
  })

  it('should handle undefined customFields', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- for test purposes
    const { customFields, ...optionsWithoutCustomFields } = options

    await checkLicenses(licenseChecker, optionsWithoutCustomFields, core)

    const initOptions = licenseChecker.init.firstCall.args[0]

    assert.isUndefined(initOptions.customFormat)
  })

  it('should handle all dependencies type', async () => {
    options.dependencyType = DependencyType.All
    await checkLicenses(licenseChecker, options, core)

    assert.include(licenseChecker.init.firstCall.args[0], {
      production: false,
      development: false
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

    assert.deepEqual(result, mockPackagesWithEmptyLicense)
  })
})
