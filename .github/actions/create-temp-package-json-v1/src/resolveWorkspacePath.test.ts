import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import { resolveWorkspacePath } from './resolveWorkspacePath.ts'

describe('resolveWorkspacePath', () => {
  let envStub: sinon.SinonStub

  beforeEach(() => {
    envStub = sinon
      .stub(process, 'env')
      .value({ ...process.env, GITHUB_WORKSPACE: '/workspace/repo' })
  })

  afterEach(() => sinon.restore())

  it('resolves a relative path against the workspace', () => {
    assert.equal(
      resolveWorkspacePath('packages/app', 'workspace-path-list'),
      '/workspace/repo/packages/app'
    )
  })

  it('accepts an absolute path inside the workspace', () => {
    assert.equal(
      resolveWorkspacePath('/workspace/repo/output', 'output-path'),
      '/workspace/repo/output'
    )
  })

  it('accepts a directory name that starts with two dots', () => {
    assert.equal(
      resolveWorkspacePath('..app', 'workspace-path-list'),
      '/workspace/repo/..app'
    )
  })

  it('rejects a relative path that escapes the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('../other/app', 'workspace-path-list'),
      /workspace-path-list must be inside the workspace: \.\.\/other\/app/
    )
  })

  it('rejects the parent of the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('..', 'output-path'),
      /output-path must be inside the workspace/
    )
  })

  it('rejects an absolute path outside the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('/tmp/output', 'output-path'),
      /output-path must be inside the workspace: \/tmp\/output/
    )
  })

  it('rejects an absolute path in a sibling folder that shares the workspace prefix', () => {
    assert.throws(
      () => resolveWorkspacePath('/workspace/repo-evil/output', 'output-path'),
      /output-path must be inside the workspace: \/workspace\/repo-evil\/output/
    )
  })

  it('rejects a relative path to a sibling folder that shares the workspace prefix', () => {
    assert.throws(
      () => resolveWorkspacePath('../repo-evil/app', 'workspace-path-list'),
      /workspace-path-list must be inside the workspace: \.\.\/repo-evil\/app/
    )
  })

  it('falls back to the current directory when GITHUB_WORKSPACE is unset', () => {
    envStub.value({})
    sinon.stub(process, 'cwd').returns('/runner/work')
    assert.equal(
      resolveWorkspacePath('packages/app', 'workspace-path-list'),
      '/runner/work/packages/app'
    )
  })
})
