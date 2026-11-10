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
      resolveWorkspacePath('dist/sizes.json', 'current-path'),
      '/workspace/repo/dist/sizes.json'
    )
  })

  it('accepts an absolute path inside the workspace', () => {
    assert.equal(
      resolveWorkspacePath('/workspace/repo/sizes.json', 'current-path'),
      '/workspace/repo/sizes.json'
    )
  })

  it('accepts a file name that starts with two dots', () => {
    assert.equal(
      resolveWorkspacePath('..sizes.json', 'current-path'),
      '/workspace/repo/..sizes.json'
    )
  })

  it('rejects a relative path that escapes the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('../other/sizes.json', 'current-path'),
      /current-path must be inside the workspace: \.\.\/other\/sizes\.json/
    )
  })

  it('rejects the parent of the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('..', 'limits-path'),
      /limits-path must be inside the workspace/
    )
  })

  it('rejects an absolute path outside the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('/etc/passwd', 'baseline-path'),
      /baseline-path must be inside the workspace: \/etc\/passwd/
    )
  })

  it('falls back to the current directory when GITHUB_WORKSPACE is unset', () => {
    envStub.value({})
    sinon.stub(process, 'cwd').returns('/runner/work')
    assert.equal(
      resolveWorkspacePath('sizes.json', 'current-path'),
      '/runner/work/sizes.json'
    )
  })
})
