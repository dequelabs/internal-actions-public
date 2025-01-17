import { assert } from 'chai'
import sinon from 'sinon'
import checkLicenses from './checkLicenses'
import {
  CheckLicensesOptions,
  DependencyType,
  DetailsOutputFormat,
  LicenseChecker,
  ModuleInfos
} from './types'

type InitCallback = (error: Error, packages: ModuleInfos) => void

describe('checkLicenses', () => {
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>
  let options: CheckLicensesOptions

  beforeEach(() => {
    licenseChecker = {
      init: sinon.stub(),
      asSummary: sinon.stub()
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

    const result = await checkLicenses(licenseChecker, options)

    assert.deepEqual(result, mockPackages)
    assert.isTrue(licenseChecker.init.calledOnce)
    assert.deepEqual(licenseChecker.init.firstCall.args[0], {
      json: true,
      csv: false,
      // @ts-expect-error - The markdown option is not typed in license-checker-rseidelsohn
      markdown: false,
      plainVertical: false,
      start: './test-path',
      production: true,
      development: false,
      out: undefined,
      onlyAllow: 'MIT',
      customFormat: ['author', 'license'],
      excludePackages: 'excluded-package',
      excludePackagesStartingWith: '@test/',
      clarificationsFile: './clarifications.json'
    })
  })

  it('should reject when license check fails', async () => {
    const error = new Error('License check failed')
    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(error, null)
    })

    try {
      await checkLicenses(licenseChecker, options)
      assert.fail('Expected checkLicenses to reject')
    } catch (err) {
      assert.strictEqual(err, error)
    }
    assert.isTrue(licenseChecker.init.calledOnce)
  })

  it('should handle development dependencies', async () => {
    options.dependencyType = DependencyType.Development

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, {})
    })

    await checkLicenses(licenseChecker, options)

    assert.deepInclude(licenseChecker.init.firstCall.args[0], {
      production: false,
      development: true
    })
  })

  it('should handle CSV output format', async () => {
    options.detailsOutputFormat = DetailsOutputFormat.CSV

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, {})
    })

    await checkLicenses(licenseChecker, options)

    assert.deepOwnInclude(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: true,
      markdown: false
    })
  })

  it('should handle Markdown output format', async () => {
    options.detailsOutputFormat = DetailsOutputFormat.Markdown

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, {})
    })

    await checkLicenses(licenseChecker, options)

    assert.deepOwnInclude(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: false,
      markdown: true
    })
  })

  it('should handle PlainVertical output format', async () => {
    options.detailsOutputFormat = DetailsOutputFormat.PlainVertical

    licenseChecker.init.callsFake((opts: unknown, callback: InitCallback) => {
      // @ts-expect-error - The first argument can be an error or null
      callback(null, {})
    })

    await checkLicenses(licenseChecker, options)

    assert.deepOwnInclude(licenseChecker.init.firstCall.args[0], {
      json: false,
      csv: false,
      markdown: false,
      plainVertical: true
    })
  })
})
