// Runtime filename constructors that defeat ncc's static asset tracing.
// ncc recognizes `path.resolve(x, 'package.json')` (and similar) as an asset
// reference and rewrites the call at build time to use a bundled path, which
// breaks runtime filesystem checks. These helpers build the same strings via
// dynamic logic that ncc cannot statically evaluate.

const ENCODED = Buffer.from([
  0x70, 0x61, 0x63, 0x6b, 0x61, 0x67, 0x65, 0x2e, 0x6a, 0x73, 0x6f, 0x6e, 0x00,
  0x6e, 0x6f, 0x64, 0x65, 0x5f, 0x6d, 0x6f, 0x64, 0x75, 0x6c, 0x65, 0x73
])
  .toString('utf8')
  .split('\0')

export function pkgJsonFilename(): string {
  return ENCODED[0]
}

export function nodeModulesDir(): string {
  return ENCODED[1]
}
