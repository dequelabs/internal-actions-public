import fs from 'fs'
import path from 'path'

// Constructed at runtime to keep ncc's static analyzer from reaching for the
// repo's own pnpm artifacts at build time.
const NODE_MODULES = ['node', 'modules'].join('_')
const PNPM_DIR = '.' + 'pnpm'
const PNPM_WORKSPACE = ['pnpm-workspace', 'yaml'].join('.')
const PNPM_LOCK = ['pnpm-lock', 'yaml'].join('.')

/**
 * Returns true if startPath (or any ancestor) shows pnpm-managed install
 * signals: a `node_modules/.pnpm/` dir, a `pnpm-workspace.yaml`, or a
 * `pnpm-lock.yaml`.
 */
export default function detectPnpm(startPath: string): boolean {
  let dir = path.resolve(startPath)
  const root = path.parse(dir).root

  while (dir !== root) {
    if (fs.existsSync(dir + path.sep + NODE_MODULES + path.sep + PNPM_DIR)) {
      return true
    }
    if (fs.existsSync(dir + path.sep + PNPM_WORKSPACE)) return true
    if (fs.existsSync(dir + path.sep + PNPM_LOCK)) return true
    dir = path.dirname(dir)
  }
  return false
}

/**
 * Walks up from startPath to find the directory containing
 * `pnpm-workspace.yaml`. Returns null if not in a pnpm workspace.
 */
export function findPnpmWorkspaceRoot(startPath: string): string | null {
  let dir = path.resolve(startPath)
  const root = path.parse(dir).root
  while (dir !== root) {
    if (fs.existsSync(dir + path.sep + PNPM_WORKSPACE)) return dir
    dir = path.dirname(dir)
  }
  return null
}
