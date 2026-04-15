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

  it('should scan directly when local node_modules exists and no ancestor', () => {
    const dir = createFixtureDir()
    fs.mkdirSync(path.join(dir, 'node_modules'))

    const { scanPath, cleanup } = resolveNodeModules(dir)

    assert.strictEqual(scanPath, dir)
    cleanup()
  })

  it('should shallow-copy ancestor node_modules when no local exists', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    fs.mkdirSync(path.join(rootNm, 'is-number'))
    fs.writeFileSync(
      path.join(rootNm, 'is-number', 'package.json'),
      JSON.stringify({ name: 'is-number', version: '7.0.0' })
    )
    fs.writeFileSync(path.join(rootNm, 'is-number', 'LICENSE'), 'MIT License')

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(
      path.join(wsDir, 'package.json'),
      JSON.stringify({ dependencies: { 'is-number': '7.0.0' } })
    )

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.notStrictEqual(scanPath, wsDir)
    assert.strictEqual(fs.existsSync(path.join(scanPath, 'package.json')), true)
    // is-number was shallow-copied (real dir, not symlink)
    const copiedPkg = path.join(scanPath, 'node_modules', 'is-number')
    assert.strictEqual(fs.existsSync(copiedPkg), true)
    assert.strictEqual(fs.lstatSync(copiedPkg).isSymbolicLink(), false)
    const content = JSON.parse(
      fs.readFileSync(path.join(copiedPkg, 'package.json'), 'utf8')
    )
    assert.strictEqual(content.name, 'is-number')
    assert.strictEqual(
      fs.readFileSync(path.join(copiedPkg, 'LICENSE'), 'utf8'),
      'MIT License'
    )

    cleanup()
    assert.strictEqual(fs.existsSync(scanPath), false)
  })

  it('should overlay local overrides on ancestor for partial hoisting', () => {
    const root = createFixtureDir()
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

    // Local override: dep-a@2.0.0
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
    const depB = JSON.parse(
      fs.readFileSync(
        path.join(scanPath, 'node_modules', 'dep-b', 'package.json'),
        'utf8'
      )
    )
    assert.strictEqual(depB.version, '1.0.0')
    const depA = JSON.parse(
      fs.readFileSync(
        path.join(scanPath, 'node_modules', 'dep-a', 'package.json'),
        'utf8'
      )
    )
    assert.strictEqual(depA.version, '2.0.0')
    assert.strictEqual(
      fs
        .lstatSync(path.join(scanPath, 'node_modules', 'dep-a'))
        .isSymbolicLink(),
      false
    )

    cleanup()
  })

  it('should handle scoped packages and skip scoped dotfiles', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, '@scope', 'pkg'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, '@scope', 'pkg', 'package.json'),
      JSON.stringify({ name: '@scope/pkg' })
    )
    // Dotfile inside scoped dir — should be skipped
    fs.writeFileSync(path.join(rootNm, '@scope', '.DS_Store'), '')
    // Non-directory entry in node_modules (e.g. a stray file)
    fs.writeFileSync(path.join(rootNm, 'stray-file.txt'), 'not a package')

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.strictEqual(
      fs.existsSync(
        path.join(scanPath, 'node_modules', '@scope', 'pkg', 'package.json')
      ),
      true
    )

    cleanup()
  })

  it('should skip dotfiles in node_modules', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    fs.mkdirSync(path.join(rootNm, '.bin'))
    fs.mkdirSync(path.join(rootNm, '.cache'))
    fs.mkdirSync(path.join(rootNm, 'real-pkg'))
    fs.writeFileSync(path.join(rootNm, 'real-pkg', 'package.json'), '{}')

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '.bin')),
      false
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', '.cache')),
      false
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'real-pkg')),
      true
    )

    cleanup()
  })

  it('should handle nested node_modules for version conflicts', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, 'dep-a'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, 'dep-a', 'package.json'),
      JSON.stringify({ name: 'dep-a', version: '1.0.0' })
    )
    fs.mkdirSync(path.join(rootNm, 'dep-a', 'node_modules', 'dep-b'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(rootNm, 'dep-a', 'node_modules', 'dep-b', 'package.json'),
      JSON.stringify({ name: 'dep-b', version: '2.0.0' })
    )

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    const nested = JSON.parse(
      fs.readFileSync(
        path.join(
          scanPath,
          'node_modules',
          'dep-a',
          'node_modules',
          'dep-b',
          'package.json'
        ),
        'utf8'
      )
    )
    assert.strictEqual(nested.version, '2.0.0')

    cleanup()
  })

  it('should handle unreadable source node_modules gracefully', () => {
    const root = createFixtureDir()
    // Create an ancestor node_modules that's a FILE (not a dir — readdirSync will throw)
    fs.writeFileSync(path.join(root, 'node_modules'), 'not a dir')

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    // resolveNodeModules finds ancestor (existsSync = true for the file), tries
    // to shallow-copy it, shallowCopyNodeModules catches readdirSync error.
    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.notStrictEqual(scanPath, wsDir)
    // node_modules dir exists but is empty (source was unreadable)
    assert.strictEqual(
      fs.readdirSync(path.join(scanPath, 'node_modules')).length,
      0
    )

    cleanup()
  })

  it('should handle package with no readable license files', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, 'pkg'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, 'pkg', 'package.json'),
      JSON.stringify({ name: 'pkg' })
    )
    // LICENSE is a dir (readFileSync/readdirSync in licenseFiles will behave oddly)
    fs.mkdirSync(path.join(rootNm, 'pkg', 'LICENSE'))

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    // package.json still copied
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'pkg', 'package.json')),
      true
    )

    cleanup()
  })

  it('should handle broken symlinks in node_modules gracefully', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    // A broken symlink
    fs.symlinkSync('/nonexistent/path', path.join(rootNm, 'broken-pkg'))
    // A valid package
    fs.mkdirSync(path.join(rootNm, 'good-pkg'))
    fs.writeFileSync(path.join(rootNm, 'good-pkg', 'package.json'), '{}')

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    // good-pkg should still be copied; broken-pkg should be skipped
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'good-pkg')),
      true
    )
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'broken-pkg')),
      false
    )

    cleanup()
  })

  it('should handle unreadable scoped dir gracefully', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(rootNm)
    // Create a file pretending to be a scoped dir
    fs.writeFileSync(path.join(rootNm, '@broken'), 'not a dir')
    fs.mkdirSync(path.join(rootNm, 'good-pkg'))
    fs.writeFileSync(path.join(rootNm, 'good-pkg', 'package.json'), '{}')

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'node_modules', 'good-pkg')),
      true
    )

    cleanup()
  })

  it('should return startPath when no node_modules found anywhere', () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nm-'))
    tempFixtureDir = isolated
    const deepDir = path.join(isolated, 'a', 'b', 'c')
    fs.mkdirSync(deepDir, { recursive: true })
    fs.writeFileSync(path.join(deepDir, 'package.json'), '{}')

    const { scanPath, cleanup } = resolveNodeModules(deepDir)

    assert.strictEqual(scanPath, deepDir)
    cleanup()
  })

  it('should handle workspace dir without package.json', () => {
    const root = createFixtureDir()
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.mkdirSync(path.join(root, 'node_modules', 'dep-a'))
    fs.writeFileSync(
      path.join(root, 'node_modules', 'dep-a', 'package.json'),
      '{}'
    )

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    assert.notStrictEqual(scanPath, wsDir)
    assert.strictEqual(
      fs.existsSync(path.join(scanPath, 'package.json')),
      false
    )

    cleanup()
  })

  it('should handle yarn workspace with empty local node_modules', () => {
    const root = createFixtureDir()
    const rootNm = path.join(root, 'node_modules')
    fs.mkdirSync(path.join(rootNm, 'is-number'), { recursive: true })
    fs.writeFileSync(
      path.join(rootNm, 'is-number', 'package.json'),
      JSON.stringify({ name: 'is-number', version: '7.0.0' })
    )

    const wsDir = path.join(root, 'packages', 'app-a')
    fs.mkdirSync(wsDir, { recursive: true })
    fs.writeFileSync(path.join(wsDir, 'package.json'), '{}')
    // Local node_modules exists but only has .bin
    fs.mkdirSync(path.join(wsDir, 'node_modules', '.bin'), {
      recursive: true
    })

    const { scanPath, cleanup } = resolveNodeModules(wsDir)

    // Local .bin should be ignored; ancestor packages shallow-copied
    assert.notStrictEqual(scanPath, wsDir)
    assert.strictEqual(
      fs.existsSync(
        path.join(scanPath, 'node_modules', 'is-number', 'package.json')
      ),
      true
    )

    cleanup()
  })
})
