import type { HeadroomFinding, RegressionFinding, SizeMap } from './types.ts'

export function resolveLimit(
  key: string,
  maxBytes: number | null,
  limits: SizeMap | null
): number | null {
  if (limits && Object.prototype.hasOwnProperty.call(limits, key)) {
    return limits[key]
  }
  return maxBytes
}

export function checkHeadroom(
  current: SizeMap,
  warnRatio: number,
  maxBytes: number | null,
  limits: SizeMap | null
): HeadroomFinding[] {
  if (maxBytes == null && limits == null) {
    return []
  }

  const findings: HeadroomFinding[] = []
  for (const [key, size] of Object.entries(current)) {
    const limit = resolveLimit(key, maxBytes, limits)
    if (limit == null) continue
    const fail = size >= limit
    // Always report a failure; only gate the warn band by warnRatio, so a
    // warnRatio > 1 can never suppress an asset that exceeds the hard limit.
    if (!fail && size < limit * warnRatio) continue
    findings.push({
      key,
      size,
      limit,
      fail
    })
  }
  return findings
}

export function checkRegression(
  current: SizeMap,
  baseline: SizeMap,
  maxIncreaseRatio: number,
  minIncreaseBytes: number
): RegressionFinding[] {
  const findings: RegressionFinding[] = []
  for (const [key, size] of Object.entries(current)) {
    const before = baseline[key]
    if (before == null) continue
    const delta = size - before
    if (delta < minIncreaseBytes) continue
    if (delta < before * maxIncreaseRatio) continue
    findings.push({ key, before, size, delta })
  }
  return findings
}
