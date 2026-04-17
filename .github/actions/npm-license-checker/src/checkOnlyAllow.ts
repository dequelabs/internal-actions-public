import type { ModuleInfos } from './types.ts'

export default function checkOnlyAllow(
  merged: ModuleInfos,
  onlyAllow: string
): void {
  if (!onlyAllow.trim().length) return

  const allowedLicenses = onlyAllow
    .split(';')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const violations: string[] = []

  for (const [packageName, info] of Object.entries(merged)) {
    const currentLicense = Array.isArray(info.licenses)
      ? info.licenses.join(', ')
      : info.licenses || 'UNKNOWN'

    const isAllowed = allowedLicenses.some(allowed =>
      currentLicense.includes(allowed)
    )
    if (!isAllowed) {
      violations.push(`"${packageName}" has license "${currentLicense}"`)
    }
  }

  if (violations.length) {
    throw new Error(
      `The following packages have licenses not permitted by the onlyAllow list:\n${violations.join('\n')}`
    )
  }
}
