import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { resolveWorkspacePath } from './resolveWorkspacePath.ts'

describe('resolveWorkspacePath', () => {
  const workspace = path.resolve('/workspace/repo')
  let originalWorkspace: string | undefined

  beforeEach(() => {
    originalWorkspace = process.env.GITHUB_WORKSPACE
    process.env.GITHUB_WORKSPACE = workspace
  })

  afterEach(() => {
    if (originalWorkspace === undefined) {
      delete process.env.GITHUB_WORKSPACE
    } else {
      process.env.GITHUB_WORKSPACE = originalWorkspace
    }
  })

  it('resolves a relative path against the workspace', () => {
    assert.equal(
      resolveWorkspacePath('dist/sizes.json', 'current-path'),
      path.join(workspace, 'dist/sizes.json')
    )
  })

  it('accepts an absolute path inside the workspace', () => {
    const inside = path.join(workspace, 'sizes.json')
    assert.equal(resolveWorkspacePath(inside, 'current-path'), inside)
  })

  it('accepts a file name that starts with two dots', () => {
    assert.equal(
      resolveWorkspacePath('..sizes.json', 'current-path'),
      path.join(workspace, '..sizes.json')
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
    delete process.env.GITHUB_WORKSPACE
    assert.equal(
      resolveWorkspacePath('sizes.json', 'current-path'),
      path.join(process.cwd(), 'sizes.json')
    )
  })
})
