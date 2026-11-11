import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import run from './run.ts'
import type { Core, FileSystem } from './types.ts'

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
  let rmSyncSpy: sinon.SinonSpy

  beforeEach(() => {
    sinon
      .stub(process, 'env')
      .value({ ...process.env, GITHUB_WORKSPACE: '/workspace/repo' })

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
    rmSyncSpy = sinon.spy()

    fileSystem = {
      existsSync: existsSyncStub,
      readFileSync: readFileSyncStub,
      writeFileSync: writeFileSyncSpy,
      mkdirSync: mkdirSyncSpy,
      symlinkSync: symlinkSyncSpy,
      lstatSync: lstatSyncStub,
      rmSync: rmSyncSpy
    }
  })

  afterEach(() => sinon.restore())

  describe('Success scenarios', () => {
    it('should merge dependencies from multiple workspaces', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, workspace2')
      getInputStub.withArgs('output-path').returns('./output')

      existsSyncStub.withArgs('./node_modules').returns(true)

      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)
      readFileSyncStub
        .withArgs('/workspace/repo/workspace1/package.json', 'utf8')
        .returns(
          JSON.stringify({
            dependencies: {
              lodash: '^4.17.21',
              axios: '^1.0.0'
            }
          })
        )

      existsSyncStub
        .withArgs('/workspace/repo/workspace2/package.json')
        .returns(true)
      readFileSyncStub
        .withArgs('/workspace/repo/workspace2/package.json', 'utf8')
        .returns(
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

      assert.strictEqual(
        mkdirSyncSpy.calledOnceWithExactly('/workspace/repo/output', {
          recursive: true
        }),
        true
      )
      assert.strictEqual(writeFileSyncSpy.calledOnce, true)

      const [writePath, writeContent] = writeFileSyncSpy.firstCall.args

      assert.strictEqual(writePath, '/workspace/repo/output/package.json')

      const writtenPackage = JSON.parse(writeContent)

      assert.deepStrictEqual(writtenPackage.dependencies, {
        lodash: '^4.17.21', // Comes from the first workspace
        axios: '^2.0.0', // Comes from the second workspace, overrides the first
        express: '^4.18.0' // Comes from the second workspace
      })

      assert.strictEqual(symlinkSyncSpy.calledOnce, true)
      assert.strictEqual(
        symlinkSyncSpy.firstCall.args[1],
        '/workspace/repo/output/node_modules'
      )
      assert.strictEqual(
        setOutputSpy.calledOnceWithExactly('temp-path', './output'),
        true
      )
      assert.strictEqual(setFailedSpy.notCalled, true)
    })

    it('should remove existing symlink before creating new one', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('./output')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/output/node_modules')
        .returns(true) // Symlink already exists

      readFileSyncStub
        .withArgs('/workspace/repo/workspace1/package.json', 'utf8')
        .returns(
          JSON.stringify({
            dependencies: {
              lodash: '^4.17.21'
            }
          })
        )

      lstatSyncStub.returns({
        isSymbolicLink: () => true
      })

      await run(core, fileSystem)

      assert.strictEqual(
        rmSyncSpy.calledOnceWithExactly('/workspace/repo/output/node_modules', {
          recursive: true,
          force: true
        }),
        true
      )
      assert.ok(
        infoSpy.calledWith(
          'Removing existing "output/node_modules" before creating symlink...'
        )
      )
      assert.strictEqual(symlinkSyncSpy.calledOnce, true)
      assert.strictEqual(
        setOutputSpy.calledOnceWithExactly('temp-path', './output'),
        true
      )
      assert.strictEqual(setFailedSpy.notCalled, true)
    })

    it('should accept an absolute output path inside the workspace', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('/workspace/repo/output')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)
      readFileSyncStub
        .withArgs('/workspace/repo/workspace1/package.json', 'utf8')
        .returns(JSON.stringify({ dependencies: { lodash: '^4.17.21' } }))

      lstatSyncStub.returns({ isSymbolicLink: () => true })

      await run(core, fileSystem)

      assert.strictEqual(
        writeFileSyncSpy.firstCall.args[0],
        '/workspace/repo/output/package.json'
      )
      assert.strictEqual(
        setOutputSpy.calledOnceWithExactly(
          'temp-path',
          '/workspace/repo/output'
        ),
        true
      )
      assert.strictEqual(setFailedSpy.notCalled, true)
    })
  })

  describe('Error scenarios', () => {
    it('should fail if node_modules does not exist', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')

      existsSyncStub.withArgs('./node_modules').returns(false)

      await run(core, fileSystem)

      assert.strictEqual(setFailedSpy.calledOnce, true)
      assert.ok(setFailedSpy.firstCall.args[0].includes('node_modules'))
    })

    it('should warn if workspace package.json not found', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(false)

      lstatSyncStub.returns({ isSymbolicLink: () => true })

      await run(core, fileSystem)

      assert.strictEqual(warningSpy.calledOnce, true)
      assert.ok(warningSpy.firstCall.args[0].includes('package.json'))
    })

    it('should fail if no dependencies found in any workspace', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)

      readFileSyncStub.returns(JSON.stringify({ name: 'test' }))

      await run(core, fileSystem)

      assert.strictEqual(setFailedSpy.calledOnce, true)
      assert.ok(
        setFailedSpy.firstCall.args[0].includes('No production dependencies')
      )
    })

    it('should handle JSON parse errors gracefully', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, workspace2')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace2/package.json')
        .returns(true)

      // Not valid JSON in workspace1
      readFileSyncStub
        .withArgs('/workspace/repo/workspace1/package.json', 'utf8')
        .returns('invalid json')

      // Valid JSON in workspace2
      readFileSyncStub
        .withArgs('/workspace/repo/workspace2/package.json', 'utf8')
        .returns(
          JSON.stringify({
            dependencies: { express: '^4.18.0' }
          })
        )

      lstatSyncStub.returns({ isSymbolicLink: () => true })

      await run(core, fileSystem)

      assert.strictEqual(setFailedSpy.calledOnce, true)
      assert.ok(
        setFailedSpy.firstCall.args[0].startsWith(
          'Failed to process "workspace1/package.json"'
        )
      )
      assert.strictEqual(setOutputSpy.notCalled, true)
    })

    it('should fail if symlink creation fails', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')

      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)

      readFileSyncStub.returns(
        JSON.stringify({
          dependencies: { lodash: '^4.17.21' }
        })
      )

      lstatSyncStub.returns({
        isSymbolicLink: () => false
      })

      await run(core, fileSystem)

      assert.strictEqual(setFailedSpy.calledOnce, true)
      assert.ok(setFailedSpy.firstCall.args[0].includes('symlink'))
    })

    it('should handle empty workspace list', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('  ,  ,  ')

      existsSyncStub.withArgs('./node_modules').returns(true)

      await run(core, fileSystem)

      assert.strictEqual(setFailedSpy.calledOnce, true)
      assert.ok(setFailedSpy.firstCall.args[0].includes('No workspace paths'))
    })

    it('should fail before writing anything if a workspace path is outside the workspace', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, ../other')
      getInputStub.withArgs('output-path').returns('./output')

      existsSyncStub.withArgs('./node_modules').returns(true)

      await run(core, fileSystem)

      assert.strictEqual(
        setFailedSpy.calledOnceWithExactly(
          'workspace-path-list must be inside the workspace: ../other'
        ),
        true
      )
      assert.strictEqual(mkdirSyncSpy.notCalled, true)
      assert.strictEqual(readFileSyncStub.notCalled, true)
      assert.strictEqual(writeFileSyncSpy.notCalled, true)
      assert.strictEqual(setOutputSpy.notCalled, true)
    })

    it('should fail before writing anything if the output path is outside the workspace', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('/tmp/output')

      existsSyncStub.withArgs('./node_modules').returns(true)

      await run(core, fileSystem)

      assert.strictEqual(
        setFailedSpy.calledOnceWithExactly(
          'output-path must be inside the workspace: /tmp/output'
        ),
        true
      )
      assert.strictEqual(mkdirSyncSpy.notCalled, true)
      assert.strictEqual(writeFileSyncSpy.notCalled, true)
      assert.strictEqual(setOutputSpy.notCalled, true)
    })

    it('should handle unexpected errors in catch block', async () => {
      const errorMessage = 'Unexpected filesystem error'

      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1')
      getInputStub.withArgs('output-path').returns('./output')
      existsSyncStub.withArgs('./node_modules').returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)
      readFileSyncStub
        .withArgs('/workspace/repo/workspace1/package.json', 'utf8')
        .returns(
          JSON.stringify({
            dependencies: { lodash: '^4.17.21' }
          })
        )

      mkdirSyncSpy = sinon.stub().throws(new Error(errorMessage))
      fileSystem.mkdirSync = mkdirSyncSpy

      await run(core, fileSystem)

      assert.strictEqual(setFailedSpy.calledOnceWithExactly(errorMessage), true)
      assert.strictEqual(setOutputSpy.notCalled, true)
    })

    it('should skip all empty package.json files and fail if no dependencies found', async () => {
      getInputStub
        .withArgs('workspace-path-list', { required: true })
        .returns('workspace1, workspace2, workspace3')
      getInputStub.withArgs('output-path').returns('./output')

      existsSyncStub.withArgs('./node_modules').returns(true)

      existsSyncStub
        .withArgs('/workspace/repo/workspace1/package.json')
        .returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace2/package.json')
        .returns(true)
      existsSyncStub
        .withArgs('/workspace/repo/workspace3/package.json')
        .returns(true)

      readFileSyncStub
        .withArgs('/workspace/repo/workspace1/package.json', 'utf8')
        .returns('')
      readFileSyncStub
        .withArgs('/workspace/repo/workspace2/package.json', 'utf8')
        .returns('')
      readFileSyncStub
        .withArgs('/workspace/repo/workspace3/package.json', 'utf8')
        .returns('')

      await run(core, fileSystem)

      // Should warn for each empty package.json
      assert.strictEqual(warningSpy.callCount, 3)

      assert.strictEqual(setFailedSpy.calledOnce, true)
      assert.ok(
        setFailedSpy.firstCall.args[0].includes('No production dependencies')
      )
    })
  })
})
