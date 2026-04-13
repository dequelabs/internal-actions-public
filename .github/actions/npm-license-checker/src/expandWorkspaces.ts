import fs from 'fs'
import path from 'path'
import { globSync } from 'glob'
import yaml from 'js-yaml'

export default function expandWorkspaces(startPath: string): string[] {
  const packageJsonPath = path.join(startPath, 'package.json')

  let patterns: string[] = []

  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      if (Array.isArray(pkg.workspaces)) {
        patterns = pkg.workspaces
      } else if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
        // yarn classic { packages: [...] } format
        patterns = pkg.workspaces.packages
      }
    } catch {
      // Invalid JSON — not a workspace root
      return [startPath]
    }
  }

  // Check for pnpm-workspace.yaml if no workspaces found in package.json
  if (!patterns.length) {
    const pnpmWorkspacePath = path.join(startPath, 'pnpm-workspace.yaml')
    if (fs.existsSync(pnpmWorkspacePath)) {
      const content = fs.readFileSync(pnpmWorkspacePath, 'utf8')
      const parsed = yaml.load(content) as { packages?: string[] } | null
      if (parsed && Array.isArray(parsed.packages)) {
        patterns = parsed.packages
      }
    }
  }

  if (!patterns.length) {
    return [startPath]
  }

  const workspacePaths: string[] = []
  for (const pattern of patterns) {
    const matches = globSync(pattern, { cwd: startPath })
    for (const match of matches) {
      const fullPath = path.resolve(startPath, match)
      if (
        fs.statSync(fullPath).isDirectory() &&
        fs.existsSync(path.join(fullPath, 'package.json'))
      ) {
        workspacePaths.push(fullPath)
      }
    }
  }

  // Root first (for root-level deps), then workspace members
  return [startPath, ...workspacePaths]
}
