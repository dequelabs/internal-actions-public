import fs from 'node:fs'
import semver from 'semver'
import type { ModuleInfos } from './types.ts'

export interface ExcludeAndClarifyOptions {
  excludePackages?: string
  excludePackagesStartingWith?: string
  clarificationsPath?: string
}

/**
 * Mutates `merged` in-place: removes entries matching exclude filters, then
 * applies any clarifications-file overrides. Used after pnpm scans (which
 * don't natively support these inputs) so the same filtering applies to
 * pnpm- and library-scanned results.
 */
export default function applyExcludesAndClarifications(
  merged: ModuleInfos,
  options: ExcludeAndClarifyOptions
): void {
  const excludeNames = splitList(options.excludePackages)
  const excludePrefixes = splitList(options.excludePackagesStartingWith)

  if (excludeNames.length || excludePrefixes.length) {
    for (const key of Object.keys(merged)) {
      const name = nameFromKey(key)
      if (
        excludeNames.includes(name) ||
        excludePrefixes.some(prefix => name.startsWith(prefix))
      ) {
        delete merged[key]
      }
    }
  }

  if (options.clarificationsPath) {
    const raw = fs.readFileSync(options.clarificationsPath, 'utf8')
    const clarifications = JSON.parse(raw) as Record<
      string,
      Record<string, unknown>
    >
    for (const [spec, override] of Object.entries(clarifications)) {
      const at = spec.lastIndexOf('@')
      if (at <= 0) continue
      const targetName = spec.substring(0, at)
      const range = spec.substring(at + 1)
      for (const [key, info] of Object.entries(merged)) {
        const at2 = key.lastIndexOf('@')
        if (at2 <= 0) continue
        const keyName = key.substring(0, at2)
        const keyVersion = key.substring(at2 + 1)
        if (
          keyName === targetName &&
          semver.valid(keyVersion) &&
          semver.satisfies(keyVersion, range)
        ) {
          Object.assign(info, override)
        }
      }
    }
  }
}

function splitList(value?: string): string[] {
  if (!value) return []
  return value
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

function nameFromKey(key: string): string {
  const at = key.lastIndexOf('@')
  return at > 0 ? key.substring(0, at) : key
}
