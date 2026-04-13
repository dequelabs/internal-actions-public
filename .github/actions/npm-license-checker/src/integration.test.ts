import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import run from './run.ts'
import * as licenseCheckerModule from 'license-checker-rseidelsohn'
import type { Core, LicenseChecker, ModuleInfos } from './types.ts'

/**
 * Integration tests that exercise the real `run` function end-to-end
 * against real node_modules trees created by npm, pnpm, and yarn v1.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.name === 'node_modules') continue
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function packageNames(result: ModuleInfos): string[] {
  return Object.keys(result).map(key => {
    const atIndex = key.lastIndexOf('@')
    return atIndex > 0 ? key.substring(0, atIndex) : key
  })
}

function makeCore(inputs: Record<string, string>): Core {
  return {
    getInput: (name: string) => inputs[name] || '',
    info: () => {},
    setFailed: (msg: string | Error) => {
      throw new Error(`setFailed: ${msg}`)
    }
  }
}

async function runAndGetResult(
  startPaths: string,
  dependencyType: string
): Promise<ModuleInfos> {
  const outputPath = path.join(os.tmpdir(), `license-output-${Date.now()}.json`)

  const core = makeCore({
    'start-paths': startPaths,
    'start-path': './',
    'dependency-type': dependencyType,
    'details-output-path': outputPath,
    'details-output-format': 'json',
    'custom-fields-path': '',
    'clarifications-path': '',
    'only-allow': '',
    'exclude-packages': '',
    'exclude-packages-starting-with': ''
  })

  await run({ core, licenseChecker: licenseCheckerModule as LicenseChecker })

  const result = JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  fs.rmSync(outputPath, { force: true })
  return result
}

interface PackageManagerConfig {
  name: string
  installCommand: string
  singleFixture: string
  workspacesFixture: string
  singleFixturePrefix: string
}

const packageManagers: PackageManagerConfig[] = [
  {
    name: 'npm',
    installCommand: 'npm ci',
    singleFixture: 'npm-single',
    workspacesFixture: 'npm-workspaces',
    singleFixturePrefix: '@deque/npm-license-checker-action-npm-single-fixture@'
  },
  {
    name: 'pnpm',
    installCommand: 'pnpm install --frozen-lockfile',
    singleFixture: 'pnpm-single',
    workspacesFixture: 'pnpm-workspaces',
    singleFixturePrefix:
      '@deque/npm-license-checker-action-pnpm-single-fixture@'
  },
  {
    name: 'yarn v1',
    installCommand: 'yarn install --frozen-lockfile',
    singleFixture: 'yarn-single',
    workspacesFixture: 'yarn-workspaces',
    singleFixturePrefix:
      '@deque/npm-license-checker-action-yarn-single-fixture@'
  }
]

for (const pm of packageManagers) {
  describe(`${pm.name} integration`, { timeout: 60_000 }, () => {
    let tempDir: string

    function installFixture(fixtureName: string): string {
      const fixtureSource = path.join(FIXTURES_DIR, fixtureName)
      tempDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `license-checker-${fixtureName}-`)
      )

      copyDirSync(fixtureSource, tempDir)

      execSync(pm.installCommand, {
        cwd: tempDir,
        stdio: 'pipe'
      })

      return tempDir
    }

    afterEach(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true })
      }
    })

    describe('single project', () => {
      let projectDir: string

      beforeEach(() => {
        projectDir = installFixture(pm.singleFixture)
      })

      it('should find production dependencies', async () => {
        const result = await runAndGetResult(projectDir, 'production')
        const names = packageNames(result)

        assert.ok(names.includes('is-number'))
        assert.ok(!names.includes('is-plain-object'))
      })

      it('should find all dependencies', async () => {
        const result = await runAndGetResult(projectDir, 'all')
        const names = packageNames(result)

        assert.ok(names.includes('is-number'))
        assert.ok(names.includes('is-plain-object'))
      })

      it('should report correct license types', async () => {
        const result = await runAndGetResult(projectDir, 'all')

        for (const [pkg, info] of Object.entries(result)) {
          if (pkg.startsWith(pm.singleFixturePrefix)) continue
          assert.ok(info.licenses, `${pkg} should have a license`)
          assert.strictEqual(
            info.licenses,
            'MIT',
            `unexpected license for ${pkg}: ${info.licenses}`
          )
        }
      })
    })

    describe('workspaces', () => {
      let projectDir: string

      beforeEach(() => {
        projectDir = installFixture(pm.workspacesFixture)
      })

      it('should find all prod deps when scanning from root', async () => {
        const result = await runAndGetResult(projectDir, 'production')
        const names = packageNames(result)

        assert.ok(names.includes('is-number'))
        assert.ok(names.includes('is-odd'))
        assert.ok(!names.includes('is-plain-object'))
        assert.ok(!names.includes('is-even'))
      })

      it('should find prod deps for a single workspace (app-a)', async () => {
        const appADir = path.join(projectDir, 'packages', 'app-a')
        const result = await runAndGetResult(appADir, 'production')
        const names = packageNames(result)

        assert.ok(names.includes('is-number'))
        assert.ok(!names.includes('is-plain-object'))
        assert.ok(!names.includes('is-odd'))
      })

      it('should find prod deps for a single workspace (app-b)', async () => {
        const appBDir = path.join(projectDir, 'packages', 'app-b')
        const result = await runAndGetResult(appBDir, 'production')
        const names = packageNames(result)

        assert.ok(names.includes('is-odd'))
        assert.ok(!names.includes('is-even'))
      })

      it('should find combined prod deps when scanning multiple workspaces', async () => {
        const appADir = path.join(projectDir, 'packages', 'app-a')
        const appBDir = path.join(projectDir, 'packages', 'app-b')
        const result = await runAndGetResult(
          `${appADir}, ${appBDir}`,
          'production'
        )
        const names = packageNames(result)

        assert.ok(names.includes('is-number'))
        assert.ok(names.includes('is-odd'))
        assert.ok(!names.includes('is-plain-object'))
        assert.ok(!names.includes('is-even'))
      })
    })
  })
}
