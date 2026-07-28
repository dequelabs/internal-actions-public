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
  regressionSkipReason: string | null
  skippedHeadroom: boolean
  missingKeys: string[]
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

  if (options.regressionSkipReason) {
    lines.push(
      `_Regression check skipped (${options.regressionSkipReason})._`,
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

  if (options.missingKeys.length) {
    lines.push(
      '### Unenforced keys',
      '',
      'Tracked in `limits-path`/baseline but absent from `current-path`, so no budget applied:',
      ''
    )
    for (const key of options.missingKeys) {
      lines.push(`- \`${key}\``)
    }
    lines.push('')
  }

  lines.push(options.failed ? '**Result:** failed' : '**Result:** OK')
  return lines.join('\n')
}
