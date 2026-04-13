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

  it('should scan directly when node_modules exists and no ancestor', () => {
    // Simulate a standalone project (node_modules at root of temp dir)
    const dir = createFixtureDir()
    fs.mkdirSync(path.join(dir, 'node_modules'))

    const { scanPath, cleanup } = resolveNodeModules(dir)

    assert.strictEqual(scanPath, dir)
    cleanup() // no-op
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
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'is-number')),
      true
    )

    cleanup()
    assert.strictEqual(fs.existsSync(scanPath), false)
  })

  it('should merge local and ancestor node_modules for partial hoisting', () => {
    const root = createFixtureDir()
    // Root has dep-a@1.0.0
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, 'dep-a'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, 'dep-a', 'package.json'),
      JSON.stringify({ name: 'dep-a', version: '1.0.0' })
    )
    fs.mkdirSync(path.join(rootNm, 'dep-b'))
    fs.writeFileSync(
      path.join(rootNm, 'dep-b', 'package.json'),
      JSON.stringify({ name: 'dep-b', version: '1.0.0' })
    )

    // Workspace has local dep-a@2.0.0 override
    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')
    const wsNm = path.join(wsDir, 'node_modules')
    fs.mkdirSync(path.join(wsNm, 'dep-a'), { recursive: true })
    fs.writeFileSync(
      path.join(wsNm, 'dep-a', 'package.json'),
      JSON.stringify({ name: 'dep-a', version: '2.0.0' })
    )

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.notStrictEqual(scanPath, wsDir)
    // Should have dep-b from ancestor
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'dep-b')),
      true
    )
    // dep-a should be the local override (pointing to workspace's version)
    const depATarget = fs.readlinkSync(
      path.join(scanPath, 'node_modules', 'dep-a')
    )
    assert.ok(depATarget.includes(path.join('app-a', 'node_modules', 'dep-a')))

    cleanup()
  })

  it('should handle scoped packages', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, '@scope', 'pkg'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, '@scope', 'pkg', 'package.json'),
      JSON.stringify({ name: '@scope/pkg' })
    )

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '@scope', 'pkg')),
      true
    )

    cleanup()
  })

  it('should handle scoped package overrides in partial hoisting', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, '@scope', 'pkg'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, '@scope', 'pkg', 'package.json'),
      JSON.stringify({ version: '1.0.0' })
    )

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')
    // Local scoped override
    const wsNm = path.join(wsDir, 'node_modules')
    fs.mkdirSync(path.join(wsNm, '@scope', 'pkg'), { recursive: true })
    fs.writeFileSync(
      path.join(wsNm, '@scope', 'pkg', 'package.json'),
      JSON.stringify({ version: '2.0.0' })
    )

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    const target = fs.readlinkSync(
      path.join(scanPath, 'node_modules', '@scope', 'pkg')
    )
    assert.ok(target.includes(path.join('app-a', 'node_modules')))

    cleanup()
  })

  it('should skip .pnpm, .package-lock.json, .modules.yaml, .yarn-integrity', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    fs.mkdirSync(path.join(rootNm, '.pnpm'))
    fs.writeFileSync(path.join(rootNm, '.package-lock.json'), '{}')
    fs.writeFileSync(path.join(rootNm, '.modules.yaml'), '')
    fs.writeFileSync(path.join(rootNm, '.yarn-integrity'), '')
    fs.mkdirSync(path.join(rootNm, 'is-number'))

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '.pnpm')),
      false
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '.package-lock.json')),
      false
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '.modules.yaml')),
      false
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '.yarn-integrity')),
      false
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'is-number')),
      true
    )

    cleanup()
  })

  it('should return startPath when no ancestor node_modules found', () => {
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
