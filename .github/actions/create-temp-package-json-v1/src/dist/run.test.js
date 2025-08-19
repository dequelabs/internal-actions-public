"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const sinon_1 = __importDefault(require("sinon"));
const chai_1 = require("chai");
const run_1 = __importDefault(require("./run"));
describe('run', () => {
    let core;
    let fileSystem;
    let getInputStub;
    let setOutputSpy;
    let setFailedSpy;
    let infoSpy;
    let warningSpy;
    let existsSyncStub;
    let readFileSyncStub;
    let writeFileSyncSpy;
    let mkdirSyncSpy;
    let symlinkSyncSpy;
    let lstatSyncStub;
    beforeEach(() => {
        getInputStub = sinon_1.default.stub();
        setOutputSpy = sinon_1.default.spy();
        setFailedSpy = sinon_1.default.spy();
        infoSpy = sinon_1.default.spy();
        warningSpy = sinon_1.default.spy();
        core = {
            getInput: getInputStub,
            setOutput: setOutputSpy,
            setFailed: setFailedSpy,
            info: infoSpy,
            warning: warningSpy
        };
        existsSyncStub = sinon_1.default.stub();
        readFileSyncStub = sinon_1.default.stub();
        writeFileSyncSpy = sinon_1.default.spy();
        mkdirSyncSpy = sinon_1.default.spy();
        symlinkSyncSpy = sinon_1.default.spy();
        lstatSyncStub = sinon_1.default.stub();
        fileSystem = {
            existsSync: existsSyncStub,
            readFileSync: readFileSyncStub,
            writeFileSync: writeFileSyncSpy,
            mkdirSync: mkdirSyncSpy,
            symlinkSync: symlinkSyncSpy,
            lstatSync: lstatSyncStub
        };
    });
    afterEach(sinon_1.default.restore);
    describe('Success scenarios', () => {
        it('should merge dependencies from multiple workspaces', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1, workspace2');
            getInputStub.withArgs('output-path').returns('./output');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(true);
            readFileSyncStub.withArgs('workspace1/package.json', 'utf8').returns(JSON.stringify({
                dependencies: {
                    lodash: '^4.17.21',
                    axios: '^1.0.0'
                }
            }));
            existsSyncStub.withArgs('workspace2/package.json').returns(true);
            readFileSyncStub.withArgs('workspace2/package.json', 'utf8').returns(JSON.stringify({
                dependencies: {
                    express: '^4.18.0',
                    axios: '^2.0.0'
                }
            }));
            lstatSyncStub.returns({
                isSymbolicLink: () => true
            });
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(mkdirSyncSpy.calledOnceWithExactly('./output', { recursive: true }));
            chai_1.assert.isTrue(writeFileSyncSpy.calledOnce);
            const [writePath, writeContent] = writeFileSyncSpy.firstCall.args;
            chai_1.assert.equal(writePath, 'output/package.json');
            const writtenPackage = JSON.parse(writeContent);
            chai_1.assert.deepEqual(writtenPackage.dependencies, {
                lodash: '^4.17.21',
                axios: '^2.0.0',
                express: '^4.18.0'
            });
            chai_1.assert.isTrue(symlinkSyncSpy.calledOnce);
            chai_1.assert.isTrue(setOutputSpy.calledOnceWithExactly('temp-path', './output'));
            chai_1.assert.isTrue(setFailedSpy.notCalled);
        });
    });
    describe('Error scenarios', () => {
        it('should fail if node_modules does not exist', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1');
            existsSyncStub.withArgs('./node_modules').returns(false);
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(setFailedSpy.calledOnce);
            chai_1.assert.include(setFailedSpy.firstCall.args[0], 'node_modules');
        });
        it('should warn if workspace package.json not found', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1');
            getInputStub.withArgs('output-path').returns('');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(false);
            lstatSyncStub.returns({ isSymbolicLink: () => true });
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(warningSpy.calledOnce);
            chai_1.assert.include(warningSpy.firstCall.args[0], 'package.json');
        });
        it('should fail if no dependencies found in any workspace', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(true);
            readFileSyncStub.returns(JSON.stringify({ name: 'test' }));
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(setFailedSpy.calledOnce);
            chai_1.assert.include(setFailedSpy.firstCall.args[0], 'No production dependencies');
        });
        it('should handle JSON parse errors gracefully', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1, workspace2');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(true);
            existsSyncStub.withArgs('workspace2/package.json').returns(true);
            readFileSyncStub
                .withArgs('workspace1/package.json', 'utf8')
                .returns('invalid json');
            readFileSyncStub.withArgs('workspace2/package.json', 'utf8').returns(JSON.stringify({
                dependencies: { express: '^4.18.0' }
            }));
            lstatSyncStub.returns({ isSymbolicLink: () => true });
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(warningSpy.calledOnce);
            chai_1.assert.include(warningSpy.firstCall.args[0], 'workspace1/package.json');
            chai_1.assert.isTrue(setOutputSpy.calledOnce);
        });
        it('should fail if symlink creation fails', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(true);
            readFileSyncStub.returns(JSON.stringify({
                dependencies: { lodash: '^4.17.21' }
            }));
            lstatSyncStub.returns({
                isSymbolicLink: () => false
            });
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(setFailedSpy.calledOnce);
            chai_1.assert.include(setFailedSpy.firstCall.args[0], 'symlink');
        });
        it('should handle empty workspace list', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('  ,  ,  ');
            existsSyncStub.withArgs('./node_modules').returns(true);
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(setFailedSpy.calledOnce);
            chai_1.assert.include(setFailedSpy.firstCall.args[0], 'No workspace paths');
        });
        it('should handle unexpected errors in catch block', async () => {
            const errorMessage = 'Unexpected filesystem error';
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1');
            getInputStub.withArgs('output-path').returns('./output');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(true);
            readFileSyncStub.withArgs('workspace1/package.json', 'utf8').returns(JSON.stringify({
                dependencies: { lodash: '^4.17.21' }
            }));
            mkdirSyncSpy = sinon_1.default.stub().throws(new Error(errorMessage));
            fileSystem.mkdirSync = mkdirSyncSpy;
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.isTrue(setFailedSpy.calledOnceWithExactly(errorMessage));
            chai_1.assert.isTrue(setOutputSpy.notCalled);
        });
        it('should skip all empty package.json files and fail if no dependencies found', async () => {
            getInputStub
                .withArgs('workspace-path-list', { required: true })
                .returns('workspace1, workspace2, workspace3');
            getInputStub.withArgs('output-path').returns('./output');
            existsSyncStub.withArgs('./node_modules').returns(true);
            existsSyncStub.withArgs('workspace1/package.json').returns(true);
            existsSyncStub.withArgs('workspace2/package.json').returns(true);
            existsSyncStub.withArgs('workspace3/package.json').returns(true);
            readFileSyncStub.withArgs('workspace1/package.json', 'utf8').returns('');
            readFileSyncStub.withArgs('workspace2/package.json', 'utf8').returns('');
            readFileSyncStub.withArgs('workspace3/package.json', 'utf8').returns('');
            await (0, run_1.default)(core, fileSystem);
            chai_1.assert.equal(warningSpy.callCount, 3);
            chai_1.assert.isTrue(setFailedSpy.calledOnce);
            chai_1.assert.include(setFailedSpy.firstCall.args[0], 'No production dependencies');
        });
    });
});
//# sourceMappingURL=run.test.js.map