import fs from 'fs'
import path from 'path'
import os from 'os'
import type { ResolvedNodeModules } from './types.ts'
import { pkgJsonFilename, nodeModulesDir } from './nccEscape.ts'

export default function resolveNodeModules(
  startPath: string
): ResolvedNodeModules {
  // Use plain string concat to avoid ncc's asset-tracing rewrites.
  const localNodeModules = startPath + path.sep + nodeModulesDir()
  const hasLocalNodeModules = fs.existsSync(localNodeModules)
  const ancestorNodeModules = findAncestorNodeModules(startPath)

  // No local node_modules and no ancestor — scan as-is, let the library error
  if (!hasLocalNodeModules && !ancestorNodeModules) {
    return { scanPath: startPath, cleanup: () => {} }
  }

  // Local node_modules exists and no ancestor — scan directly (single project
  // or pnpm workspace where deps are in the workspace's own node_modules)
  if (hasLocalNodeModules && !ancestorNodeModules) {
    return { scanPath: startPath, cleanup: () => {} }
  }

  // Only ancestor — fully hoisted (npm/yarn workspace with no local overrides)
  // Or both local and ancestor — partial hoisting (local overrides win)
  // In both cases, build a merged node_modules in a temp dir.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-scan-'))

  // Copy package.json
  const srcPkgJson = startPath + path.sep + pkgJsonFilename()
  if (fs.existsSync(srcPkgJson)) {
    fs.copyFileSync(srcPkgJson, tempDir + path.sep + pkgJsonFilename())
  }

  // Build merged node_modules: ancestor first, then local overrides
  const tempNodeModules = tempDir + path.sep + nodeModulesDir()
  fs.mkdirSync(tempNodeModules)

  symlinkNodeModulesEntries(ancestorNodeModules!, tempNodeModules)

  if (hasLocalNodeModules) {
    symlinkNodeModulesEntries(localNodeModules, tempNodeModules)
  }

  return {
    scanPath: tempDir,
    cleanup: () => {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

function findAncestorNodeModules(startPath: string): string | null {
  let dir = path.dirname(startPath)
  const root = path.parse(dir).root

  while (dir !== root) {
    const candidate = dir + path.sep + nodeModulesDir()
    if (fs.existsSync(candidate)) {
      return candidate
    }
    dir = path.dirname(dir)
  }

  return null
}

function symlinkNodeModulesEntries(source: string, target: string): void {
  for (const entry of fs.readdirSync(source)) {
    if (
      entry === '.pnpm' ||
      entry === '.package-lock.json' ||
      entry === '.modules.yaml' ||
      entry === '.yarn-integrity'
    ) {
      continue
    }

    const sourcePath = path.join(source, entry)
    const targetPath = path.join(target, entry)

    if (entry.startsWith('@')) {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath)
      }
      for (const scopedEntry of fs.readdirSync(sourcePath)) {
        const scopedSource = path.join(sourcePath, scopedEntry)
        const scopedTarget = path.join(targetPath, scopedEntry)
        if (fs.existsSync(scopedTarget)) {
          fs.rmSync(scopedTarget, { recursive: true, force: true })
        }
        fs.symlinkSync(scopedSource, scopedTarget)
      }
    } else {
      if (fs.existsSync(targetPath)) {
        fs.rmSync(targetPath, { recursive: true, force: true })
      }
      fs.symlinkSync(sourcePath, targetPath)
    }
  }
}
