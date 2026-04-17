import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import detectPnpm, { findPnpmWorkspaceRoot } from './detectPnpm.ts'

describe('detectPnpm', () => {
  let tempDir: string

  function createFixture(): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-pnpm-'))
    return tempDir
  }

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should detect .pnpm dir in node_modules', () => {
    const dir = createFixture()
    fs.mkdirSync(path.join(dir, 'node_modules', '.pnpm'), { recursive: true })

    assert.strictEqual(detectPnpm(dir), true)
  })

  it('should detect pnpm-workspace.yaml', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), '')

    assert.strictEqual(detectPnpm(dir), true)
  })

  it('should detect pnpm-lock.yaml', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')

    assert.strictEqual(detectPnpm(dir), true)
  })

  it('should detect pnpm in an ancestor', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    const child = path.join(dir, 'packages', 'app-a')
    fs.mkdirSync(child, { recursive: true })

    assert.strictEqual(detectPnpm(child), true)
  })

  it('should return false when no pnpm signals', () => {
    const dir = createFixture()
    fs.mkdirSync(path.join(dir, 'node_modules'))

    assert.strictEqual(detectPnpm(dir), false)
  })
})

describe('findPnpmWorkspaceRoot', () => {
  let tempDir: string

  function createFixture(): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'find-pnpm-root-'))
    return tempDir
  }

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('should find workspace root from a child dir', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), '')
    const child = path.join(dir, 'packages', 'app-a')
    fs.mkdirSync(child, { recursive: true })

    assert.strictEqual(findPnpmWorkspaceRoot(child), dir)
  })

  it('should find workspace root when at the root', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), '')

    assert.strictEqual(findPnpmWorkspaceRoot(dir), dir)
  })

  it('should return null when not in a workspace', () => {
    const dir = createFixture()

    assert.strictEqual(findPnpmWorkspaceRoot(dir), null)
  })
})
