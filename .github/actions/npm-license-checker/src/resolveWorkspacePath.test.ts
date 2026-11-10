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
      resolveWorkspacePath(
        'licenses/clarifications.json',
        'clarifications-path'
      ),
      '/workspace/repo/licenses/clarifications.json'
    )
  })

  it('accepts an absolute path inside the workspace', () => {
    assert.equal(
      resolveWorkspacePath('/workspace/repo/package.json', 'start-path'),
      '/workspace/repo/package.json'
    )
  })

  it('accepts a file name that starts with two dots', () => {
    assert.equal(
      resolveWorkspacePath('..details.json', 'details-output-path'),
      '/workspace/repo/..details.json'
    )
  })

  it('rejects a relative path that escapes the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('../other/package.json', 'start-path'),
      /start-path must be inside the workspace: \.\.\/other\/package\.json/
    )
  })

  it('rejects the parent of the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('..', 'start-path'),
      /start-path must be inside the workspace/
    )
  })

  it('rejects an absolute path outside the workspace', () => {
    assert.throws(
      () => resolveWorkspacePath('/etc/passwd', 'custom-fields-path'),
      /custom-fields-path must be inside the workspace: \/etc\/passwd/
    )
  })

  it('falls back to the current directory when GITHUB_WORKSPACE is unset', () => {
    envStub.value({})
    sinon.stub(process, 'cwd').returns('/runner/work')
    assert.equal(
      resolveWorkspacePath('package.json', 'start-path'),
      '/runner/work/package.json'
    )
  })
})
