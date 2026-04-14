import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import scanPnpm, { defaultReadLicenseText } from './scanPnpm.ts'

const sampleOutput = JSON.stringify({
  MIT: [
    {
      name: 'is-odd',
      versions: ['3.0.1'],
      paths: ['/repo/node_modules/.pnpm/is-odd@3.0.1/node_modules/is-odd'],
      license: 'MIT',
      author: 'Jon Schlinkert',
      homepage: 'https://github.com/jonschlinkert/is-odd'
    },
    {
      name: 'is-number',
      versions: ['6.0.0', '7.0.0'],
      paths: [
        '/repo/node_modules/.pnpm/is-number@6.0.0/node_modules/is-number',
        '/repo/node_modules/.pnpm/is-number@7.0.0/node_modules/is-number'
      ],
      license: 'MIT',
      author: 'Jon Schlinkert',
      homepage: 'https://github.com/jonschlinkert/is-number'
    }
  ]
})

function fakeExec(): string {
  return sampleOutput
}

function noLicense(): undefined {
  return undefined
}

describe('scanPnpm', () => {
  it('should parse pnpm licenses output into ModuleInfos', () => {
    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'production',
      exec: fakeExec,
      readLicenseText: noLicense
    })

    assert.strictEqual(Object.keys(result).length, 3)
    assert.ok('is-odd@3.0.1' in result)
    assert.ok('is-number@6.0.0' in result)
    assert.ok('is-number@7.0.0' in result)
    assert.strictEqual(result['is-odd@3.0.1'].licenses, 'MIT')
    assert.strictEqual(result['is-odd@3.0.1'].publisher, 'Jon Schlinkert')
  })

  it('should pass --prod when dependency type is production', () => {
    let capturedArgs: string[] = []
    const spy = (_f: string, args: string[]) => {
      capturedArgs = args
      return '{}'
    }

    scanPnpm({ cwd: '/repo', dependencyType: 'production', exec: spy })

    assert.ok(capturedArgs.includes('--prod'))
  })

  it('should not pass --prod when dependency type is all', () => {
    let capturedArgs: string[] = []
    const spy = (_f: string, args: string[]) => {
      capturedArgs = args
      return '{}'
    }

    scanPnpm({ cwd: '/repo', dependencyType: 'all', exec: spy })

    assert.ok(!capturedArgs.includes('--prod'))
  })

  it('should pass --filter when filter is provided', () => {
    let capturedArgs: string[] = []
    const spy = (_f: string, args: string[]) => {
      capturedArgs = args
      return '{}'
    }

    scanPnpm({
      cwd: '/repo',
      filter: './packages/app-b',
      dependencyType: 'production',
      exec: spy
    })

    assert.ok(capturedArgs.includes('--filter'))
    assert.ok(capturedArgs.includes('./packages/app-b'))
  })

  it('should pass -r when recursive is true', () => {
    let capturedArgs: string[] = []
    const spy = (_f: string, args: string[]) => {
      capturedArgs = args
      return '{}'
    }

    scanPnpm({
      cwd: '/repo',
      dependencyType: 'production',
      recursive: true,
      exec: spy
    })

    assert.ok(capturedArgs.includes('-r'))
  })

  it('should not pass -r when recursive is false or omitted', () => {
    let capturedArgs: string[] = []
    const spy = (_f: string, args: string[]) => {
      capturedArgs = args
      return '{}'
    }

    scanPnpm({ cwd: '/repo', dependencyType: 'production', exec: spy })

    assert.ok(!capturedArgs.includes('-r'))
  })

  it('should throw actionable error when pnpm not found', () => {
    const exec = () => {
      const err = new Error('spawn pnpm ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    }

    assert.throws(
      () => scanPnpm({ cwd: '/repo', dependencyType: 'all', exec }),
      { message: /pnpm is required.*pnpm\/action-setup/ }
    )
  })

  it('should propagate other exec errors with stderr', () => {
    const exec = () => {
      const err = new Error('Command failed') as NodeJS.ErrnoException & {
        stderr: string
      }
      err.code = 'ERR_CHILD_PROCESS'
      err.stderr = 'some pnpm error output'
      throw err
    }

    assert.throws(
      () => scanPnpm({ cwd: '/repo', dependencyType: 'all', exec }),
      {
        message: /pnpm licenses list[\s\S]*failed[\s\S]*some pnpm error output/
      }
    )
  })

  it('should use readLicenseText to populate licenseText', () => {
    const exec = () =>
      JSON.stringify({
        MIT: [
          {
            name: 'foo',
            versions: ['1.0.0'],
            paths: ['/repo/foo'],
            license: 'MIT'
          }
        ]
      })

    const readLicenseText = (p: string) =>
      p === '/repo/foo' ? 'MIT License\nCopyright ...' : undefined

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseText
    })

    assert.strictEqual(
      result['foo@1.0.0'].licenseText,
      'MIT License\nCopyright ...'
    )
  })

  it('should return empty licenseText when no LICENSE file exists', () => {
    const exec = () =>
      JSON.stringify({
        MIT: [
          {
            name: 'bar',
            versions: ['2.0.0'],
            paths: ['/repo/bar'],
            license: 'MIT'
          }
        ]
      })

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseText: noLicense
    })

    assert.strictEqual(result['bar@2.0.0'].licenseText, '')
  })
})

describe('defaultReadLicenseText', () => {
  let tempDir: string

  function createFixture(): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-license-'))
    return tempDir
  }

  it('should read LICENSE file', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License text')

    assert.strictEqual(defaultReadLicenseText(dir), 'MIT License text')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('should return undefined when no license file exists', () => {
    const dir = createFixture()

    assert.strictEqual(defaultReadLicenseText(dir), undefined)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('should return undefined when LICENSE file is unreadable', () => {
    const dir = createFixture()
    // Create a directory named LICENSE (readFileSync will throw)
    fs.mkdirSync(path.join(dir, 'LICENSE'))

    assert.strictEqual(defaultReadLicenseText(dir), undefined)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('should try multiple filenames', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'COPYING'), 'BSD text')

    assert.strictEqual(defaultReadLicenseText(dir), 'BSD text')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
