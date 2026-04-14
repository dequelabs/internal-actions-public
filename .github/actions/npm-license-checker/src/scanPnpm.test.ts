import { describe, it } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import path from 'path'
import os from 'os'
import scanPnpm, { defaultReadLicenseInfo } from './scanPnpm.ts'

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

function noPkg(): undefined {
  return undefined
}

describe('scanPnpm', () => {
  it('should parse pnpm licenses output into ModuleInfos', () => {
    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'production',
      exec: fakeExec,
      readLicenseInfo: noLicense,
      readPackageJson: noPkg
    })

    assert.strictEqual(Object.keys(result).length, 3)
    assert.ok('is-odd@3.0.1' in result)
    assert.ok('is-number@6.0.0' in result)
    assert.ok('is-number@7.0.0' in result)
    assert.strictEqual(result['is-odd@3.0.1'].licenses, 'MIT')
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

  it('should propagate other exec errors without stderr', () => {
    const exec = () => {
      const err = new Error('Command failed') as NodeJS.ErrnoException
      err.code = 'ERR_CHILD_PROCESS'
      throw err
    }

    assert.throws(
      () => scanPnpm({ cwd: '/repo', dependencyType: 'all', exec }),
      { message: /pnpm licenses list[\s\S]*failed/ }
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

  it('should populate licenseText and licenseFile from readLicenseInfo', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: (p: string) =>
        p === '/repo/foo'
          ? {
              text: 'MIT License\nCopyright ...',
              filePath: '/repo/foo/LICENSE'
            }
          : undefined,
      readPackageJson: noPkg
    })

    assert.strictEqual(
      result['foo@1.0.0'].licenseText,
      'MIT License\nCopyright ...'
    )
    assert.strictEqual(result['foo@1.0.0'].licenseFile, '/repo/foo/LICENSE')
  })

  it('should handle entries with no path', () => {
    const exec = () =>
      JSON.stringify({
        MIT: [
          {
            name: 'foo',
            versions: ['1.0.0'],
            paths: [],
            license: 'MIT'
          }
        ]
      })

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: noLicense,
      readPackageJson: noPkg
    })

    assert.strictEqual(result['foo@1.0.0'].licenses, 'MIT')
    assert.strictEqual(result['foo@1.0.0'].path, undefined)
  })

  it('should enrich repository from package.json', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: noLicense,
      readPackageJson: () => ({
        repository: { url: 'git+https://github.com/owner/repo.git' }
      })
    })

    assert.strictEqual(
      result['foo@1.0.0'].repository,
      'https://github.com/owner/repo'
    )
  })

  it('should enrich publisher/email/url from object author', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: noLicense,
      readPackageJson: () => ({
        author: { name: 'Alice', email: 'a@b.com', url: 'https://alice.dev' }
      })
    })

    assert.strictEqual(result['foo@1.0.0'].publisher, 'Alice')
    assert.strictEqual(result['foo@1.0.0'].email, 'a@b.com')
    assert.strictEqual(result['foo@1.0.0'].url, 'https://alice.dev')
  })

  it('should parse string author format', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: noLicense,
      readPackageJson: () => ({
        author: 'Alice <a@b.com> (https://alice.dev)'
      })
    })

    assert.strictEqual(result['foo@1.0.0'].publisher, 'Alice')
    assert.strictEqual(result['foo@1.0.0'].email, 'a@b.com')
    assert.strictEqual(result['foo@1.0.0'].url, 'https://alice.dev')
  })

  it('should extract copyright from license text', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: () => ({
        text: 'The MIT License\n\nCopyright (c) 2024 Alice\n\nPermission is hereby granted...',
        filePath: '/repo/foo/LICENSE'
      }),
      readPackageJson: noPkg
    })

    assert.strictEqual(
      result['foo@1.0.0'].copyright,
      'Copyright (c) 2024 Alice'
    )
  })

  it('should populate customFormat keys from package.json', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: noLicense,
      readPackageJson: () => ({ description: 'A great lib' }),
      customFields: { description: '' }
    })

    assert.strictEqual(result['foo@1.0.0'].description, 'A great lib')
  })

  it('should handle missing package.json gracefully', () => {
    const exec = () =>
      JSON.stringify({
        MIT: [
          {
            name: 'foo',
            versions: ['1.0.0'],
            paths: ['/nonexistent/path'],
            license: 'MIT'
          }
        ]
      })

    // Use real defaults (no overrides) — defaultReadPackageJson will catch ENOENT
    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec
    })

    assert.strictEqual(result['foo@1.0.0'].licenses, 'MIT')
    // No enriched fields, no crash
    assert.strictEqual(result['foo@1.0.0'].repository, undefined)
  })

  it('should use customFormat default when key missing from package.json', () => {
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

    const result = scanPnpm({
      cwd: '/repo',
      dependencyType: 'all',
      exec,
      readLicenseInfo: noLicense,
      readPackageJson: () => ({}),
      customFields: { description: 'N/A' }
    })

    assert.strictEqual(result['foo@1.0.0'].description, 'N/A')
  })
})

describe('defaultReadLicenseInfo', () => {
  let tempDir: string

  function createFixture(): string {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'read-license-'))
    return tempDir
  }

  it('should read LICENSE file and return text + path', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'LICENSE'), 'MIT License text')

    const info = defaultReadLicenseInfo(dir)
    assert.strictEqual(info?.text, 'MIT License text')
    assert.strictEqual(info?.filePath, path.join(dir, 'LICENSE'))
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('should return undefined when no license file exists', () => {
    const dir = createFixture()

    assert.strictEqual(defaultReadLicenseInfo(dir), undefined)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('should return undefined when LICENSE file is unreadable', () => {
    const dir = createFixture()
    fs.mkdirSync(path.join(dir, 'LICENSE'))

    assert.strictEqual(defaultReadLicenseInfo(dir), undefined)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('should try multiple filenames', () => {
    const dir = createFixture()
    fs.writeFileSync(path.join(dir, 'COPYING'), 'BSD text')

    const info = defaultReadLicenseInfo(dir)
    assert.strictEqual(info?.text, 'BSD text')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
