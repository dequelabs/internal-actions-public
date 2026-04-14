import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { DependencyType, ModuleInfos } from './types.ts'

interface PnpmLicenseEntry {
  name: string
  versions: string[]
  paths: string[]
  license: string
  author?: string
  homepage?: string
  description?: string
}

type PnpmLicensesOutput = Record<string, PnpmLicenseEntry[]>

export interface ScanPnpmOptions {
  cwd: string
  filter?: string
  dependencyType: DependencyType
  /** Override for testing — defaults to child_process.execFileSync. */
  exec?: (file: string, args: string[], opts: object) => string
  /** Override for testing — defaults to reading LICENSE from disk. */
  readLicenseText?: (pkgPath: string) => string | undefined
}

/**
 * Run `pnpm licenses list --json` for the given context and convert the output
 * to the same `ModuleInfos` shape as the standard scan path. License text is
 * read from each package's path (pnpm's CLI doesn't include it in JSON output).
 */
export default function scanPnpm(opts: ScanPnpmOptions): ModuleInfos {
  const exec = opts.exec ?? defaultExec
  const readLicense = opts.readLicenseText ?? defaultReadLicenseText

  const args: string[] = []
  if (opts.filter) {
    args.push('--filter', opts.filter)
  }
  args.push('licenses', 'list', '--json', '--long')
  if (opts.dependencyType === 'production') args.push('--prod')

  let stdout: string
  try {
    stdout = exec('pnpm', args, {
      cwd: opts.cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (err) {
    const e = err as NodeJS.ErrnoException & {
      stderr?: Buffer | string
    }
    if (e.code === 'ENOENT') {
      throw new Error(
        'pnpm is required to scan a pnpm-managed project but was not found ' +
          'on PATH. Install pnpm in your workflow (for example, add a step ' +
          '"uses: pnpm/action-setup@v4") and retry.'
      )
    }
    const stderr = (e.stderr || '').toString().trim()
    throw new Error(
      `\`pnpm licenses list\` failed: ${e.message}` +
        (stderr ? `\n${stderr}` : '')
    )
  }

  return parsePnpmOutput(stdout, readLicense)
}

function defaultExec(file: string, args: string[], opts: object): string {
  return execFileSync(
    file,
    args,
    opts as Parameters<typeof execFileSync>[2]
  ) as string
}

function parsePnpmOutput(
  stdout: string,
  readLicense: (pkgPath: string) => string | undefined
): ModuleInfos {
  const parsed: PnpmLicensesOutput = JSON.parse(stdout)
  const result: ModuleInfos = {}

  for (const entries of Object.values(parsed)) {
    for (const entry of entries) {
      for (let i = 0; i < entry.versions.length; i++) {
        const version = entry.versions[i]
        const pkgPath = entry.paths[i]
        const key = `${entry.name}@${version}`
        result[key] = {
          name: entry.name,
          version,
          licenses: entry.license,
          ...(entry.author && { publisher: entry.author }),
          ...(entry.homepage && { url: entry.homepage }),
          ...(pkgPath && { path: pkgPath }),
          ...(pkgPath && {
            licenseText: readLicense(pkgPath) || ''
          })
        }
      }
    }
  }
  return result
}

// Common license/notice filenames packages ship.
const LICENSE_FILE_NAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENCE.txt',
  'COPYING',
  'COPYING.md'
]

export function defaultReadLicenseText(pkgPath: string): string | undefined {
  for (const name of LICENSE_FILE_NAMES) {
    const candidate = pkgPath + path.sep + name
    if (fs.existsSync(candidate)) {
      try {
        return fs.readFileSync(candidate, 'utf8')
      } catch {
        return undefined
      }
    }
  }
  return undefined
}
