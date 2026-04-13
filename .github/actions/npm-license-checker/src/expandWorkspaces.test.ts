import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import expandWorkspaces from './expandWorkspaces.ts'

describe('expandWorkspaces', () => {
  let tempDir: string

  function createFixture(): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-ws-test-'))
    return tempDir
  }

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should return [startPath] when no package.json exists', () => {
    const dir = createFixture()

    const result = expandWorkspaces(dir)

    assert.deepStrictEqual(result, [dir])
  })

  it('should return [startPath] when package.json has no workspaces', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'my-project' })
    )

    const result = expandWorkspaces(dir)

    assert.deepStrictEqual(result, [dir])
  })

  it('should expand npm/yarn workspaces array', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] })
    )
    fs.mkdirSync(path.join(dir, 'packages', 'app-a'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'app-a', 'package.json'), '{}')
    fs.mkdirSync(path.join(dir, 'packages', 'app-b'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'app-b', 'package.json'), '{}')

    const result = expandWorkspaces(dir)

    assert.strictEqual(result.length, 3)
    assert.strictEqual(result[0], dir)
    const rest = result.slice(1).join(',')
    assert.ok(rest.includes('app-a'))
    assert.ok(rest.includes('app-b'))
  })

  it('should expand yarn classic workspaces object format', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['apps/*'] } })
    )
    fs.mkdirSync(path.join(dir, 'apps', 'web'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'apps', 'web', 'package.json'), '{}')

    const result = expandWorkspaces(dir)

    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0], dir)
    assert.ok(result[1].includes('web'))
  })

  it('should expand pnpm-workspace.yaml', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root' })
    )
    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      "packages:\n  - 'packages/*'\n"
    )
    fs.mkdirSync(path.join(dir, 'packages', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'lib', 'package.json'), '{}')

    const result = expandWorkspaces(dir)

    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0], dir)
    assert.ok(result[1].includes('lib'))
  })

  it('should handle pnpm-workspace.yaml without packages field', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'root' })
    )
    fs.writeFileSync(
      path.join(dir, 'pnpm-workspace.yaml'),
      'catalog:\n  react: ^18.0.0\n'
    )

    const result = expandWorkspaces(dir)

    assert.deepStrictEqual(result, [dir])
  })

  it('should skip directories without package.json', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] })
    )
    fs.mkdirSync(path.join(dir, 'packages', 'app-a'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'app-a', 'package.json'), '{}')
    // shared has no package.json
    fs.mkdirSync(path.join(dir, 'packages', 'shared'), { recursive: true })

    const result = expandWorkspaces(dir)

    assert.strictEqual(result.length, 2)
    assert.strictEqual(result[0], dir)
    assert.ok(result[1].includes('app-a'))
  })

  it('should skip non-directory glob matches', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*'] })
    )
    fs.mkdirSync(path.join(dir, 'packages'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'README.md'), '')

    const result = expandWorkspaces(dir)

    assert.deepStrictEqual(result, [dir])
  })

  it('should return [startPath] when workspaces array is empty', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ workspaces: [] })
    )

    const result = expandWorkspaces(dir)

    assert.deepStrictEqual(result, [dir])
  })

  it('should return [startPath] when package.json is invalid JSON', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'package.json'), 'not json')

    const result = expandWorkspaces(dir)

    assert.deepStrictEqual(result, [dir])
  })

  it('should handle multiple glob patterns', () => {
    const dir = createFixture()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ workspaces: ['packages/*', 'apps/*'] })
    )
    fs.mkdirSync(path.join(dir, 'packages', 'lib'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'packages', 'lib', 'package.json'), '{}')
    fs.mkdirSync(path.join(dir, 'apps', 'web'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'apps', 'web', 'package.json'), '{}')

    const result = expandWorkspaces(dir)

    assert.strictEqual(result.length, 3)
  })
})
