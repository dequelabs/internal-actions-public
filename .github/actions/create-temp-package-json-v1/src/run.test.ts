import 'mocha'
import sinon from 'sinon'
import { assert } from 'chai'
import run from './run'
import type { Core, FileSystem } from './types'

describe('run', () => {
  let core: Core
  let fileSystem: FileSystem

  let getInputStub: sinon.SinonStub
  let setOutputSpy: sinon.SinonSpy
  let setFailedSpy: sinon.SinonSpy
  let infoSpy: sinon.SinonSpy
  let warningSpy: sinon.SinonSpy

  let existsSyncStub: sinon.SinonStub
  let readFileSyncStub: sinon.SinonStub
  let writeFileSyncSpy: sinon.SinonSpy
  let mkdirSyncSpy: sinon.SinonSpy
  let symlinkSyncSpy: sinon.SinonSpy
  let lstatSyncStub: sinon.SinonStub

  beforeEach(() => {
    getInputStub = sinon.stub()
    setOutputSpy = sinon.spy()
    setFailedSpy = sinon.spy()
    infoSpy = sinon.spy()
    warningSpy = sinon.spy()

    core = {
      getInput: getInputStub,
      setOutput: setOutputSpy,
      setFailed: setFailedSpy,
      info: infoSpy,
      warning: warningSpy
    }

    existsSyncStub = sinon.stub()
    readFileSyncStub = sinon.stub()
    writeFileSyncSpy = sinon.spy()
    mkdirSyncSpy = sinon.spy()
    symlinkSyncSpy = sinon.spy()
    lstatSyncStub = sinon.stub()

    fileSystem = {
      existsSync: existsSyncStub,
      readFileSync: readFileSyncStub,
      writeFileSync: writeFileSyncSpy,
      mkdirSync: mkdirSyncSpy,
      symlinkSync: symlinkSyncSpy,
      lstatSync: lstatSyncStub
    }
  })

  afterEach(sinon.restore)

  describe('Success scenarios', () => {
    it('should merge dependencies from multiple workspaces', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, workspace2')
      getInputStub.withArgs('output-path').returns('./output')

      existsSyncStub.withArgs('./node_modules').returns(true)

      existsSyncStub.withArgs('workspace1/package.json').returns(true)
      readFileSyncStub.withArgs('workspace1/package.json', 'utf8').returns(
        JSON.stringify({
          dependencies: {
            lodash: '^4.17.21',
            axios: '^1.0.0'
          }
        })
      )

      existsSyncStub.withArgs('workspace2/package.json').returns(true)
      readFileSyncStub.withArgs('workspace2/package.json', 'utf8').returns(
        JSON.stringify({
          dependencies: {
            express: '^4.18.0',
            axios: '^2.0.0'
          }
        })
      )

      lstatSyncStub.returns({
        isSymbolicLink: () => true
      })

      await run(core, fileSystem)

      assert.isTrue(
        mkdirSyncSpy.calledOnceWithExactly('./output', { recursive: true })
      )
      assert.isTrue(writeFileSyncSpy.calledOnce)

      const [writePath, writeContent] = writeFileSyncSpy.firstCall.args

      assert.equal(writePath, 'output/package.json')

      const writtenPackage = JSON.parse(writeContent)

      assert.deepEqual(writtenPackage.dependencies, {
        lodash: '^4.17.21', // Comes from the first workspace
        axios: '^2.0.0', // Comes from the second workspace, overrides the first
        express: '^4.18.0' // Comes from the second workspace
      })

      assert.isTrue(symlinkSyncSpy.calledOnce)
      assert.isTrue(setOutputSpy.calledOnceWithExactly('temp-path', './output'))
      assert.isTrue(setFailedSpy.notCalled)
    })
  })

  describe('Error scenarios', () => {
    it('should fail if node_modules does not exist', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')

      existsSyncStub.withArgs('./node_modules').returns(false)

      await run(core, fileSystem)

      assert.isTrue(setFailedSpy.calledOnce)
      assert.include(setFailedSpy.firstCall.args[0], 'node_modules')
    })

    it('should warn if workspace package.json not found', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub.withArgs('workspace1/package.json').returns(false)

      lstatSyncStub.returns({ isSymbolicLink: () => true })

      await run(core, fileSystem)

      assert.isTrue(warningSpy.calledOnce)
      assert.include(warningSpy.firstCall.args[0], 'package.json')
    })

    it('should fail if no dependencies found in any workspace', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub.withArgs('workspace1/package.json').returns(true)

      readFileSyncStub.returns(JSON.stringify({ name: 'test' }))

      await run(core, fileSystem)

      assert.isTrue(setFailedSpy.calledOnce)
      assert.include(
        setFailedSpy.firstCall.args[0],
        'No production dependencies'
      )
    })

    it('should handle JSON parse errors gracefully', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, workspace2')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub.withArgs('workspace1/package.json').returns(true)
      existsSyncStub.withArgs('workspace2/package.json').returns(true)

      // Not valid JSON in workspace1
      readFileSyncStub
        .withArgs('workspace1/package.json', 'utf8')
        .returns('invalid json')

      // Valid JSON in workspace2
      readFileSyncStub.withArgs('workspace2/package.json', 'utf8').returns(
        JSON.stringify({
          dependencies: { express: '^4.18.0' }
        })
      )

      lstatSyncStub.returns({ isSymbolicLink: () => true })

      await run(core, fileSystem)

      assert.isTrue(warningSpy.calledOnce)
      assert.include(warningSpy.firstCall.args[0], 'workspace1/package.json')
      assert.isTrue(setOutputSpy.calledOnce)
    })

    it('should fail if symlink creation fails', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub.withArgs('workspace1/package.json').returns(true)

      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' }
        })
      )

      lstatSyncStub.returns({
        isSymbolicLink: () => false
      })

      await run(core, fileSystem)

      assert.isTrue(setFailedSpy.calledOnce)
      assert.include(setFailedSpy.firstCall.args[0], 'symlink')
    })

    it('should handle empty workspace list', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('  ,  ,  ')

      existsSyncStub.withArgs('./node_modules').returns(true)

      await run(core, fileSystem)

      assert.isTrue(setFailedSpy.calledOnce)
      assert.include(setFailedSpy.firstCall.args[0], 'No workspace paths')
    })

    it('should handle unexpected errors in catch block', async () => {
      const errorMessage = 'Unexpected filesystem error'

      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('./output')
      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub.withArgs('workspace1/package.json').returns(true)
      readFileSyncStub.withArgs('workspace1/package.json', 'utf8').returns(
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' }
        })
      )

      mkdirSyncSpy = sinon.stub().throws(new Error(errorMessage))
      fileSystem.mkdirSync = mkdirSyncSpy

      await run(core, fileSystem)

      assert.isTrue(setFailedSpy.calledOnceWithExactly(errorMessage))
      assert.isTrue(setOutputSpy.notCalled)
    })

    it('should skip all empty package.json files and fail if no dependencies found', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, workspace2, workspace3')
      getInputStub.withArgs('output-path').returns('./output')

      existsSyncStub.withArgs('./node_modules').returns(true)

      existsSyncStub.withArgs('workspace1/package.json').returns(true)
      existsSyncStub.withArgs('workspace2/package.json').returns(true)
      existsSyncStub.withArgs('workspace3/package.json').returns(true)

      readFileSyncStub.withArgs('workspace1/package.json', 'utf8').returns('')
      readFileSyncStub.withArgs('workspace2/package.json', 'utf8').returns('')
      readFileSyncStub.withArgs('workspace3/package.json', 'utf8').returns('')

      await run(core, fileSystem)

      // Should warn for each empty package.json
      assert.equal(warningSpy.callCount, 3)

      assert.isTrue(setFailedSpy.calledOnce)
      assert.include(
        setFailedSpy.firstCall.args[0],
        'No production dependencies'
      )
    })
  })
})
