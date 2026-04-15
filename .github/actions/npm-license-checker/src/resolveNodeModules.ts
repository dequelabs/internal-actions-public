import fs from 'fs'
import path from 'path'
import os from 'os'
// @ts-expect-error No type declarations for this internal module
import { licenseFiles } from 'license-checker-rseidelsohn/lib/license-files.js'
import type { ResolvedNodeModules } from './types.ts'
import { pkgJsonFilename, nodeModulesDir } from './nccEscape.ts'

export default function resolveNodeModules(
  startPath: string
): ResolvedNodeModules {
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

  // Ancestor exists (with or without local overrides). Build a temp dir with
  // shallow copies of package metadata (package.json + license files) from
  // the ancestor, overlaid with any local overrides.
  //
  // We use COPIES rather than symlinks because read-installed-packages sets
  // obj.link on any path where lstat reports a symbolic link, which stops its
  // dependency walk-up and prevents resolution of hoisted transitive deps.
  // Copies lstat as regular files/dirs, keeping walk-up intact.
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-scan-'))

  const srcPkgJson = startPath + path.sep + pkgJsonFilename()
  if (fs.existsSync(srcPkgJson)) {
    fs.copyFileSync(srcPkgJson, tempDir + path.sep + pkgJsonFilename())
  }

  const tempNodeModules = tempDir + path.sep + nodeModulesDir()
  fs.mkdirSync(tempNodeModules)

  // Copy ancestor's packages first (the hoisted base)
  shallowCopyNodeModules(ancestorNodeModules!, tempNodeModules)

  // Overlay local overrides (for partial hoisting — local wins)
  if (hasLocalNodeModules) {
    shallowCopyNodeModules(localNodeModules, tempNodeModules)
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

// ---------------------------------------------------------------------------
// Shallow copy — copies only package.json + license files for each package,
// NOT the full package content. This is enough for license-checker to scan.
// ---------------------------------------------------------------------------

function shallowCopyNodeModules(source: string, target: string): void {
  let entries: string[]
  try {
    entries = fs.readdirSync(source)
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue

    const srcPath = path.join(source, entry)
    const tgtPath = path.join(target, entry)

    if (entry.startsWith('@')) {
      // Scoped package dir — recurse into sub-entries
      fs.mkdirSync(tgtPath, { recursive: true })
      let scopedEntries: string[]
      try {
        scopedEntries = fs.readdirSync(srcPath)
      } catch {
        continue
      }
      for (const sub of scopedEntries) {
        if (sub.startsWith('.')) continue
        copyPackageMetadata(path.join(srcPath, sub), path.join(tgtPath, sub))
      }
    } else {
      copyPackageMetadata(srcPath, tgtPath)
    }
  }
}

function copyPackageMetadata(srcPkg: string, tgtPkg: string): void {
  // Resolve symlinks so we read from the real package dir
  let realSrc: string
  try {
    realSrc = fs.realpathSync(srcPkg)
  } catch {
    return // broken symlink or inaccessible
  }

  if (!fs.statSync(realSrc).isDirectory()) return

  fs.mkdirSync(tgtPkg, { recursive: true })

  // Copy package.json
  const pkgJson = path.join(realSrc, pkgJsonFilename())
  if (fs.existsSync(pkgJson)) {
    fs.copyFileSync(pkgJson, path.join(tgtPkg, pkgJsonFilename()))
  }

  // Copy license files
  const matched = licenseFiles(fs.readdirSync(realSrc)) as string[]
  for (const file of matched) {
    const src = path.join(realSrc, file)
    if (fs.existsSync(src) && fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(tgtPkg, file))
    }
  }

  // Recursively handle nested node_modules (version conflicts)
  const nestedNm = path.join(realSrc, nodeModulesDir())
  if (fs.existsSync(nestedNm)) {
    const nestedTarget = path.join(tgtPkg, nodeModulesDir())
    fs.mkdirSync(nestedTarget, { recursive: true })
    shallowCopyNodeModules(nestedNm, nestedTarget)
  }
}
