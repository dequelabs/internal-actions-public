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

  // Local node_modules covers this path — scan directly. This handles:
  //   - single projects (local exists, no ancestor relevant)
  //   - pnpm workspace members (own node_modules)
  //   - create-temp-package-json output (local is a symlink to ancestor)
  // Partial hoisting (local has some deps, rest are hoisted to ancestor) is a
  // known limitation: we'd miss the hoisted deps. Callers that need this can
  // install via pnpm or set up a merged node_modules themselves.
  if (hasLocalNodeModules) {
    return { scanPath: startPath, cleanup: () => {} }
  }

  // No local node_modules and no ancestor — scan as-is, let the library error
  if (!ancestorNodeModules) {
    return { scanPath: startPath, cleanup: () => {} }
  }

  // No local node_modules but ancestor exists (npm/yarn workspace member with
  // all deps hoisted to the root). Create a temp dir with the workspace's
  // package.json and a single symlink to the ancestor's node_modules.
  //
  // We symlink the whole directory (not per-package) because read-installed-
  // packages sets obj.link when a package path lstats as a symlink, which
  // stops its dependency walk-up. A single node_modules-level symlink keeps
  // individual packages looking like regular directories.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-scan-'))

  const srcPkgJson = startPath + path.sep + pkgJsonFilename()
  if (fs.existsSync(srcPkgJson)) {
    fs.copyFileSync(srcPkgJson, tempDir + path.sep + pkgJsonFilename())
  }

  fs.symlinkSync(
    ancestorNodeModules,
    tempDir + path.sep + nodeModulesDir(),
    'dir'
  )

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
