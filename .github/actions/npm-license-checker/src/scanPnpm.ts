import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
// @ts-expect-error No type declarations for this internal module
import { licenseFiles } from 'license-checker-rseidelsohn/lib/license-files.js'
import type { CustomFields, DependencyType, ModuleInfos } from './types.ts'

// Built at runtime so ncc doesn't pattern-match `path.join(x, 'package.json')`
// and rewrite it to point at a bundled asset.
const PKG_JSON = 'package' + '.json'

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

/** A per-module entry being assembled on the pnpm path. */
type PackageInfo = Record<string, unknown>

export interface ScanPnpmOptions {
  cwd: string
  filter?: string
  dependencyType: DependencyType
  recursive?: boolean
  customFields?: CustomFields
  /** Override for testing — defaults to child_process.execFileSync. */
  exec?: (file: string, args: string[], opts: object) => string
  /** Override for testing — defaults to reading from disk. */
  readLicenseInfo?: (
    pkgPath: string
  ) => { text: string; filePath: string } | undefined
  /** Override for testing — defaults to reading package.json from disk. */
  readPackageJson?: (pkgPath: string) => Record<string, unknown> | undefined
}

/**
 * Run `pnpm licenses list --json` and convert to `ModuleInfos`, enriched with
 * the same fields the library scan path produces (repository, publisher, email,
 * copyright, customFormat keys, etc.) by reading each package's package.json.
 */
export default function scanPnpm(opts: ScanPnpmOptions): ModuleInfos {
  const exec = opts.exec ?? defaultExec
  const readLicense = opts.readLicenseInfo ?? defaultReadLicenseInfo
  const readPkg = opts.readPackageJson ?? defaultReadPackageJson

  const args: string[] = []
  if (opts.filter) {
    args.push('--filter', opts.filter)
  }
  if (opts.recursive) {
    args.push('-r')
  }
  args.push('licenses', 'list', '--json', '--long')
  if (opts.dependencyType === 'production') args.push('--prod')
  if (opts.dependencyType === 'development') args.push('--dev')

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

  return parsePnpmOutput(stdout, readLicense, readPkg, opts.customFields)
}

function defaultExec(file: string, args: string[], opts: object): string {
  return execFileSync(
    file,
    args,
    opts as Parameters<typeof execFileSync>[2]
  ) as string
}

/**
 * Parses `pnpm licenses list --json` output and builds up a `ModuleInfos`
 * map, expanding each entry's version list into one per-version record and
 * enriching it from the installed package's `package.json`.
 */
function parsePnpmOutput(
  stdout: string,
  readLicense: (
    pkgPath: string
  ) => { text: string; filePath: string } | undefined,
  readPkg: (pkgPath: string) => Record<string, unknown> | undefined,
  customFields?: CustomFields
): ModuleInfos {
  const parsed: PnpmLicensesOutput = JSON.parse(stdout)
  const result: ModuleInfos = {}

  for (const entries of Object.values(parsed)) {
    for (const entry of entries) {
      for (let i = 0; i < entry.versions.length; i++) {
        const version = entry.versions[i]
        const pkgPath = entry.paths[i]
        const key = `${entry.name}@${version}`

        const licenseInfo = pkgPath ? readLicense(pkgPath) : undefined

        const info: PackageInfo = {
          name: entry.name,
          version,
          licenses: entry.license,
          ...(pkgPath && { path: pkgPath }),
          ...(licenseInfo && { licenseText: licenseInfo.text }),
          ...(licenseInfo && { licenseFile: licenseInfo.filePath })
        }

        if (pkgPath) {
          enrichFromPackageJson(info, readPkg(pkgPath), customFields)
        }

        if (info.licenseText) {
          const copyright = extractCopyright(info.licenseText as string)
          if (copyright) info.copyright = copyright
        }

        result[key] = info
      }
    }
  }
  return result
}

/**
 * Mirrors the per-module population in license-checker-rseidelsohn's
 * `recursivelyCollectAllDependencies` (in lib/index.js) so that pnpm output
 * has the same shape as the library's on the npm/yarn path. Reads repository,
 * publisher/email/url, and any customFormat keys from the installed
 * package's `package.json`.
 */
function enrichFromPackageJson(
  info: PackageInfo,
  pkg: Record<string, unknown> | undefined,
  customFields?: CustomFields
): void {
  if (!pkg) return

  // repository — mirrors getRepositoryUrl() in
  // license-checker-rseidelsohn/lib/indexHelpers.js. Normalizes git+ssh,
  // git+https, git://, and git@ URLs to plain https and strips ".git".
  const repo = pkg.repository as { url?: string } | string | undefined
  const repoUrl = typeof repo === 'object' ? repo?.url : undefined
  if (typeof repoUrl === 'string') {
    info.repository = repoUrl
      .replace('git+ssh://git@', 'git://')
      .replace('git+https://github.com', 'https://github.com')
      .replace('git://github.com', 'https://github.com')
      .replace('git@github.com:', 'https://github.com/')
      .replace(/\.git$/, '')
  }

  // author → publisher/email/url — mirrors getAuthorDetails() in
  // license-checker-rseidelsohn/lib/indexHelpers.js. Handles both the object
  // form ({name, email, url}) and the "Name <email> (url)" string form.
  const author = pkg.author as
    | { name?: string; email?: string; url?: string }
    | string
    | undefined
  if (typeof author === 'object' && author) {
    if (author.name) info.publisher = author.name
    if (author.email) info.email = author.email
    if (author.url && !info.url) info.url = author.url
  } else if (typeof author === 'string' && author) {
    const nameMatch = author.match(/^([^<(]+)/)
    if (nameMatch) info.publisher = nameMatch[1].trim()
    const emailMatch = author.match(/<([^>]+)>/)
    if (emailMatch) info.email = emailMatch[1]
    const urlMatch = author.match(/\(([^)]+)\)/)
    if (urlMatch && !info.url) info.url = urlMatch[1]
  }

  // customFormat keys — mirrors the `Object.keys(options.customFormat)`
  // fallthrough block near the end of `recursivelyCollectAllDependencies` in
  // license-checker-rseidelsohn/lib/index.js: for each key, use the value
  // from package.json if it's a string, else the caller-supplied default.
  if (customFields) {
    for (const [key, defaultVal] of Object.entries(customFields)) {
      if (info[key] === undefined) {
        const pkgVal = pkg[key]
        info[key] = typeof pkgVal === 'string' ? pkgVal : defaultVal
      }
    }
  }
}

/**
 * Ports `getLinesWithCopyright` from
 * license-checker-rseidelsohn/lib/indexHelpers.js. Keeps the same paragraph-
 * split + "opyright"-prefix heuristic so the `copyright` field matches what
 * the library produces on the npm/yarn path.
 */
function extractCopyright(licenseText: string): string | undefined {
  const paragraphs = licenseText
    .replace(/\r\n/g, '\n')
    .split('\n\n')
    .filter(
      p =>
        p.startsWith('opyright', 1) &&
        !p.startsWith('opyright notice', 1) &&
        !p.startsWith('opyright and related rights', 1)
    )
  if (!paragraphs.length) return undefined
  return paragraphs[0].replace(/\n/g, '. ').trim()
}

/**
 * Reads the first license-like file in a package directory. Uses the
 * library's `licenseFiles()` helper so the filename-matching heuristic
 * (LICENSE, LICENCE, LICENSE.md, COPYING, etc.) stays in parity with the
 * npm/yarn path. Exported for tests.
 */
export function defaultReadLicenseInfo(
  pkgPath: string
): { text: string; filePath: string } | undefined {
  try {
    const matched = licenseFiles(fs.readdirSync(pkgPath)) as string[]
    if (!matched.length) return undefined
    const filePath = path.join(pkgPath, matched[0])
    return { text: fs.readFileSync(filePath, 'utf8'), filePath }
  } catch {
    return undefined
  }
}

function defaultReadPackageJson(
  pkgPath: string
): Record<string, unknown> | undefined {
  try {
    return JSON.parse(fs.readFileSync(pkgPath + path.sep + PKG_JSON, 'utf8'))
  } catch {
    return undefined
  }
}
