import { formatBytes } from './parse.ts'
import type { HeadroomFinding, RegressionFinding } from './types.ts'

export function formatHeadroomLine(f: HeadroomFinding): string {
  const icon = f.fail ? '❌' : '⚠️'
  const relation = f.fail ? 'meets or exceeds' : 'is approaching'
  return `${icon} ${f.key} — ${formatBytes(f.size)} / ${formatBytes(f.limit)} (${relation} the limit)`
}

export function formatHeadroomLines(findings: HeadroomFinding[]): string[] {
  return findings.map(formatHeadroomLine)
}

export function formatRegressionLines(findings: RegressionFinding[]): string[] {
  return findings.map(r => {
    // A baseline of 0 (new-from-empty asset) has no meaningful percentage.
    const pct =
      r.before > 0 ? `, +${((r.delta / r.before) * 100).toFixed(1)}%` : ''
    return `❌ ${r.key} — ${formatBytes(r.before)} → ${formatBytes(r.size)} (+${formatBytes(r.delta)}${pct})`
  })
}

export function buildStepSummary(options: {
  headroom: HeadroomFinding[]
  regressions: RegressionFinding[]
  skippedRegression: boolean
  skippedHeadroom: boolean
  failed: boolean
}): string {
  const lines: string[] = ['## Bundle size budget', '']

  if (options.skippedHeadroom) {
    lines.push(
      '_Headroom check skipped (no `max-bytes` or `limits-path`)._',
      ''
    )
  } else if (options.headroom.length === 0) {
    lines.push('### Headroom', '', 'All assets are within the warn band.', '')
  } else {
    lines.push('### Headroom', '')
    for (const line of formatHeadroomLines(options.headroom)) {
      lines.push(`- ${line}`)
    }
    lines.push('')
  }

  if (options.skippedRegression) {
    lines.push(
      '_Regression check skipped (baseline missing or unreadable)._',
      ''
    )
  } else if (options.regressions.length === 0) {
    lines.push('### Significant increases vs baseline', '', 'None.', '')
  } else {
    lines.push('### Significant increases vs baseline', '')
    for (const line of formatRegressionLines(options.regressions)) {
      lines.push(`- ${line}`)
    }
    lines.push('')
  }

  lines.push(options.failed ? '**Result:** failed' : '**Result:** OK')
  return lines.join('\n')
}
