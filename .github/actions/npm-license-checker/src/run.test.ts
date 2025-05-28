import 'mocha'
import { assert } from 'chai'
import sinon from 'sinon'
import fs from 'fs'
import path from 'path'
import run from './run'
import {
  Core,
  DependencyType,
  DetailsOutputFormat,
  LicenseChecker,
  ModuleInfos
} from './types'
import type { InitOpts } from 'license-checker-rseidelsohn'

describe('run', () => {
  let core: sinon.SinonStubbedInstance<Core>
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>
  let existsSyncStub: sinon.SinonStub
  let readFileSyncStub: sinon.SinonStub

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
        })
    }

    // Setup fs stubs
    existsSyncStub = sinon.stub(fs, 'existsSync').returns(true)
    readFileSyncStub = sinon.stub(fs, 'readFileSync').returns('{}')

    // Default input values
    core.getInput.withArgs('dependency-type').returns(DependencyType.Production)
    core.getInput.withArgs('start-path').returns('./package.json')
    core.getInput.withArgs('custom-fields-path').returns('')
    core.getInput.withArgs('clarifications-path').returns('')
    core.getInput.withArgs('only-allow').returns('')
    core.getInput.withArgs('details-output-path').returns('')
    core.getInput.withArgs('exclude-packages').returns('')
    core.getInput.withArgs('exclude-packages-starting-with').returns('')
    core.getInput
      .withArgs('details-output-format')
      .returns(DetailsOutputFormat.JSON)
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should fail with invalid dependency-type', async () => {
    core.getInput.withArgs('dependency-type').returns('invalid-type')

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(core.setFailed.firstCall.args[0], 'Invalid dependency-type')
  })

  it('should fail with invalid details-output-format', async () => {
    core.getInput.withArgs('details-output-format').returns('invalid-format')

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(
      core.setFailed.firstCall.args[0],
      'Invalid details-output-format'
    )
  })

  it('should fail when start-path does not exist', async () => {
    existsSyncStub.withArgs(path.resolve('./package.json')).returns(false)

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(
      core.setFailed.firstCall.args[0],
      'start-path does not exist'
    )
  })

  it('should handle custom fields path correctly when file exists', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    readFileSyncStub.returns(
      '{"name":"","version":"","licenses":"","licenseText":""}'
    )

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)
  })

  it('should fail when custom-fields-path does not exist', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    existsSyncStub.withArgs(path.resolve('./custom-fields.json')).returns(false)

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(
      core.setFailed.firstCall.args[0],
      'custom-fields-path does not exist'
    )
  })

  it('should fail when custom fields file is invalid JSON', async () => {
    core.getInput.withArgs('custom-fields-path').returns('./custom-fields.json')
    readFileSyncStub.returns('invalid json')

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(
      core.setFailed.firstCall.args[0],
      'Error reading or parsing customFieldsPath'
    )
  })

  it('should fail when clarifications path does not exist', async () => {
    core.getInput
      .withArgs('clarifications-path')
      .returns('./clarifications.json')
    existsSyncStub
      .withArgs(path.resolve('./clarifications.json'))
      .returns(false)

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(
      core.setFailed.firstCall.args[0],
      'clarifications-path does not exist'
    )
  })

  it('should fail when checkLicenses rejects', async () => {
    const error = new Error('License check failed')
    licenseChecker.init.callsFake((options, cb) => {
      cb(error, {})
    })

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(core.setFailed.firstCall.args[0], 'License check failed')
  })

  it('should handle clarificationsPath correctly when file exists', async () => {
    const clarificationsPath = './clarifications.json'

    core.getInput.withArgs('clarifications-path').returns(clarificationsPath)
    existsSyncStub.withArgs(path.resolve(clarificationsPath)).returns(true)

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)
    assert.include(
      JSON.stringify(licenseChecker.init.firstCall.args[0]),
      clarificationsPath
    )
  })

  it('should handle excludePackages correctly when provided', async () => {
    const excludePackages = 'package1,package2'

    core.getInput.withArgs('exclude-packages').returns(excludePackages)
    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)

    const options = licenseChecker.init.firstCall.args[0]

    assert.include(JSON.stringify(options), excludePackages)
  })

  it('should skip excludePackages if not provided', async () => {
    core.getInput.withArgs('exclude-packages').returns('')
    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)

    const options = licenseChecker.init.firstCall.args[0]

    assert.notInclude(JSON.stringify(options), 'excludePackages')
  })

  it('should handle excludePackagesStartingWith correctly when provided', async () => {
    const excludePackagesStartingWith = '@scope,react-'

    core.getInput
      .withArgs('exclude-packages-starting-with')
      .returns(excludePackagesStartingWith)
    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)

    const options = licenseChecker.init.firstCall.args[0]

    assert.include(JSON.stringify(options), excludePackagesStartingWith)
  })

  it('should skip excludePackagesStartingWith if not provided', async () => {
    core.getInput.withArgs('exclude-packages-starting-with').returns('')
    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)

    const options = licenseChecker.init.firstCall.args[0]

    assert.notInclude(JSON.stringify(options), 'excludePackagesStartingWith')
  })

  it('should handle onlyAllow parameter correctly', async () => {
    const onlyAllow = 'MIT,Apache-2.0'

    core.getInput.withArgs('only-allow').returns(onlyAllow)
    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)

    const options = licenseChecker.init.firstCall.args[0]

    assert.include(JSON.stringify(options), onlyAllow)
  })

  it('should handle detailsOutputPath parameter correctly', async () => {
    const detailsOutputPath = './license-details.json'

    core.getInput.withArgs('details-output-path').returns(detailsOutputPath)
    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.notCalled)

    const options = licenseChecker.init.firstCall.args[0]

    assert.include(JSON.stringify(options), detailsOutputPath)
  })

  it('should fail when licenseCheckerSummary is empty', async () => {
    licenseChecker.asSummary.returns('')

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(core.setFailed.firstCall.args[0], 'No licenses found')
  })

  it('should log info with provided options', async () => {
    core.getInput.withArgs('only-allow').returns('MIT')
    core.getInput.withArgs('details-output-path').returns('./details.json')

    await run({ core, licenseChecker })

    const infoCall = core.info
      .getCalls()
      .find(call => call.args[0].includes('Provided options'))
    assert.isDefined(infoCall)
    assert.include(infoCall.args[0], 'MIT')
    assert.include(infoCall.args[0], './details.json')
  })

  it('should log license checker summary when available', async () => {
    const summary = 'License summary with details'
    licenseChecker.asSummary.returns(summary)

    await run({ core, licenseChecker })

    const infoCall = core.info
      .getCalls()
      .find(call => call.args[0].includes(summary))
    assert.isDefined(infoCall)
    assert.include(infoCall.args[0], summary)
  })

  it('should handle errors during execution', async () => {
    licenseChecker.init.throws(new Error('Unexpected error occurred'))

    await run({ core, licenseChecker })

    assert.isTrue(core.setFailed.called)
    assert.include(core.setFailed.firstCall.args[0], 'Error checking licenses')
    assert.include(
      core.setFailed.firstCall.args[0],
      'Unexpected error occurred'
    )
  })
})
