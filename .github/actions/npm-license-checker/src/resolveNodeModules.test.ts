import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import resolveNodeModules from './resolveNodeModules.ts'

describe('resolveNodeModules', () => {
  let tempFixtureDir: string

  function createFixtureDir(): string {
    tempFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-nm-test-'))
    return tempFixtureDir
  }

  afterEach(() => {
    if (tempFixtureDir && fs.existsSync(tempFixtureDir)) {
      fs.rmSync(tempFixtureDir, { recursive: true, force: true })
    }
  })

  it('should scan directly when local node_modules exists', () => {
    const dir = createFixtureDir()
    fs.mkdirSync(path.join(dir, 'node_modules'))

    const { scanPath, cleanup } = resolveNodeModules(dir)

    assert.strictEqual(scanPath, dir)
    cleanup() // no-op
  })

  it('should scan directly when local node_modules is a symlink', () => {
    // Covers the create-temp-package-json pattern: startPath has a
    // node_modules symlink pointing at the ancestor's node_modules.
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    fs.mkdirSync(path.join(rootNm, 'dep-a'))

    const wsDir = path.join(root, 'temp-license-check')
    fs.mkdirSync(wsDir)
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')
    fs.symlinkSync(rootNm, path.join(wsDir, 'node_modules'), 'dir')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.strictEqual(scanPath, wsDir)
    cleanup()
  })

  it('should create temp dir when no local node_modules but ancestor exists', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    fs.mkdirSync(path.join(rootNm, 'is-number'))
    fs.writeFileSync(
      path.join(rootNm, 'is-number', 'package.json'),
      JSON.stringify({ name: 'is-number', version: '7.0.0' })
    )

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(
      path.join(wsDir, 'package.json'),
      JSON.stringify({ dependencies: { 'is-number': '7.0.0' } })
    )

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.notStrictEqual(scanPath, wsDir)
    assert.strictEqual(fs.existsSync(path.join(scanPath, 'package.json')), true)
    // node_modules should be a single symlink to the ancestor
    const nmPath = path.join(scanPath, 'node_modules')
    assert.strictEqual(fs.lstatSync(nmPath).isSymbolicLink(), true)
    assert.strictEqual(fs.readlinkSync(nmPath), rootNm)
    // The symlinked node_modules should contain the ancestor's packages
    assert.strictEqual(fs.existsSync(path.join(nmPath, 'is-number')), true)

    cleanup()
    assert.strictEqual(fs.existsSync(scanPath), false)
  })

  it('should return startPath when no node_modules found anywhere', () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nm-'))
    tempFixtureDir = isolated
    const deepDir = path.join(isolated, 'a', 'b', 'c')
    fs.mkdirSync(deepDir, { recursive: true })
    fs.writeFileSync(path.join(deepDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(deepDir)

    assert.strictEqual(scanPath, deepDir)
    cleanup() // no-op
  })

  it('should copy package.json to temp dir', () => {
    const root = createFixtureDir()
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.mkdirSync(path.join(root, 'node_modules', 'dep-a'))

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    const originalPkg = JSON.stringify({
      name: 'app-a',
      dependencies: { 'dep-a': '1.0.0' }
    })
    fs.writeFileSync(path.join(wsDir, 'package.json'), originalPkg)

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    const copiedPkg = fs.readFileSync(
      path.join(scanPath, 'package.json'),
      'utf8'
    )
    assert.strictEqual(copiedPkg, originalPkg)

    cleanup()
  })

  it('should handle workspace dir without package.json', () => {
    const root = createFixtureDir()
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.mkdirSync(path.join(root, 'node_modules', 'dep-a'))

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    // No package.json

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.notStrictEqual(scanPath, wsDir)
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'package.json')),
      false
    )

    cleanup()
  })
})
