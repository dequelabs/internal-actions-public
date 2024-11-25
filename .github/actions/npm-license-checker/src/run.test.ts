import 'mocha';
import { assert } from 'chai';
import sinon from 'sinon';
import fs from 'fs';
import path from 'path';
import run from './run';
import {
  Core,
  DependencyType,
  DetailsOutputFormat,
  LicenseChecker,
  ModuleInfos,
} from './types';
import type { InitOpts } from 'license-checker-rseidelsohn';

describe('run', () => {
  let core: sinon.SinonStubbedInstance<Core>;
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>;
  let existsSyncStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;

  beforeEach(() => {
    // Setup core mock
    core = {
      getInput: sinon.stub(),
      setFailed: sinon.stub(),
      info: sinon.stub(),
    };

    // Setup license-checker mock
    licenseChecker = {
      asSummary: sinon.stub().returns('License summary') as sinon.SinonStub<
        [ModuleInfos],
        string
      >,
      init: (sinon.stub<[InitOpts, (err: Error, ret: ModuleInfos) => void]>)().callsFake((options, cb) => {
        cb(
          // The first arg (error) is optional, despite the type definition
          // @ts-ignore
          null,
          {}
        );
      })
    };

    // Setup fs stubs
    existsSyncStub = sinon.stub(fs, 'existsSync').returns(true);
    readFileSyncStub = sinon.stub(fs, 'readFileSync').returns('{}');

    // Default input values
    core.getInput
      .withArgs('dependency-type')
      .returns(DependencyType.Production);
    core.getInput.withArgs('start-path').returns('./package.json');
    core.getInput
      .withArgs('details-output-format')
      .returns(DetailsOutputFormat.JSON);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should run successfully with valid inputs', async () => {
    const mockResult = { 'package@1.0.0': { licenses: 'MIT' } };
    licenseChecker.asSummary.returns('License check completed');

    await run({ core, licenseChecker });

    assert.isFalse(core.setFailed.called);
    assert.isTrue(core.info.calledWith('License check completed'));
  });

  it('should fail with invalid dependency-type', async () => {
    core.getInput.withArgs('dependency-type').returns('invalid-type');

    await run({ core, licenseChecker });

    assert.isTrue(core.setFailed.called);
    assert.include(core.setFailed.firstCall.args[0], 'Invalid dependency-type');
  });

  it('should fail with invalid details-output-format', async () => {
    core.getInput.withArgs('details-output-format').returns('invalid-format');

    await run({ core, licenseChecker });

    assert.isTrue(core.setFailed.called);
    assert.include(
      core.setFailed.firstCall.args[0],
      'Invalid details-output-format'
    );
  });

  it('should fail when start-path does not exist', async () => {
    existsSyncStub.withArgs(path.resolve('./package.json')).returns(false);

    await run({ core, licenseChecker });

    assert.isTrue(core.setFailed.called);
    assert.include(
      core.setFailed.firstCall.args[0],
      'start-path does not exist'
    );
  });

  it('should handle custom fields path correctly', async () => {
    core.getInput
      .withArgs('custom-fields-path')
      .returns('./custom-fields.json');
    readFileSyncStub.returns(
      '{"name":"","version":"","licenses":"","licenseText":""}'
    );

    await run({ core, licenseChecker });

    assert.isFalse(core.setFailed.called);
  });

  it('should fail when custom fields file is invalid JSON', async () => {
    core.getInput
      .withArgs('custom-fields-path')
      .returns('./custom-fields.json');
    readFileSyncStub.returns('invalid json');

    await run({ core, licenseChecker });

    assert.isTrue(core.setFailed.called);
    assert.include(
      core.setFailed.firstCall.args[0],
      'Error reading or parsing customFieldsPath'
    );
  });

  it('should fail when clarifications path does not exist', async () => {
    core.getInput
      .withArgs('clarifications-path')
      .returns('./clarifications.json');
    existsSyncStub
      .withArgs(path.resolve('./clarifications.json'))
      .returns(false);

    await run({ core, licenseChecker });

    assert.isTrue(core.setFailed.called);
    assert.include(
      core.setFailed.firstCall.args[0],
      'clarifications-path does not exist'
    );
  });
});
