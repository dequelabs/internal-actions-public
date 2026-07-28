import fs from 'node:fs'
import path from 'node:path'
import { checkHeadroom, checkRegression, findMissingKeys } from './check.ts'
import {
  buildStepSummary,
  formatHeadroomLine,
  formatRegressionLines
} from './format.ts'
import { parseBoolean, parseBytes, parseRatio, parseSizeMap } from './parse.ts'
import type { Core, SizeMap } from './types.ts'

type ReadMapResult =
  | { map: SizeMap; error: null }
  | { map: null; error: string }

function readOptionalMap(filePath: string, label: string): ReadMapResult {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    return { map: null, error: `${label} not found at ${filePath}` }
  }
  try {
    const raw = fs.readFileSync(resolved, 'utf8')
    return { map: parseSizeMap(raw, label), error: null }
  } catch (error) {
    return { map: null, error: (error as Error).message }
  }
}

export default async function run(core: Core): Promise<void> {
  try {
    const currentPath = core.getInput('current-path', { required: true })
    const baselinePath = core.getInput('baseline-path') || ''
    const maxIncreaseRatio = parseRatio(
      core.getInput('max-increase-ratio') || '0.1',
      'max-increase-ratio'
    )
    const minIncreaseBytes = parseBytes(
      core.getInput('min-increase-bytes') || '150kb'
    )
    const failOnMissingBaseline = parseBoolean(
      core.getInput('fail-on-missing-baseline') || 'false'
    )
    const warnRatio = parseRatio(
      core.getInput('warn-ratio') || '0.85',
      'warn-ratio'
    )
    const maxBytesInput = core.getInput('max-bytes') || ''
    const limitsPath = core.getInput('limits-path') || ''

    const maxBytes = maxBytesInput.trim() ? parseBytes(maxBytesInput) : null

    const currentResolved = path.resolve(currentPath)
    if (!fs.existsSync(currentResolved)) {
      core.setFailed(
        `current-path does not exist: ${currentPath}. Emit a size map before running this action.`
      )
      return
    }

    let current: SizeMap
    try {
      current = parseSizeMap(
        fs.readFileSync(currentResolved, 'utf8'),
        'current-path'
      )
    } catch (error) {
      core.setFailed((error as Error).message)
      return
    }

    let limits: SizeMap | null = null
    if (limitsPath.trim()) {
      const result = readOptionalMap(limitsPath, 'limits-path')
      if (result.map == null) {
        core.setFailed(result.error)
        return
      }
      limits = result.map
    }

    const skippedHeadroom = maxBytes == null && limits == null
    const headroom = checkHeadroom(current, warnRatio, maxBytes, limits)

    let regressionSkipReason: string | null = null
    let regressions: ReturnType<typeof checkRegression> = []
    let baseline: SizeMap | null = null

    if (!baselinePath.trim()) {
      // An omitted baseline-path is a deliberate headroom-only setup, so it is
      // not warned about — but pairing it with fail-on-missing-baseline is a
      // contradiction that would otherwise fail open.
      if (failOnMissingBaseline) {
        core.setFailed(
          'fail-on-missing-baseline is true but no baseline-path was provided.'
        )
        return
      }
      regressionSkipReason = 'no baseline-path was provided'
    } else {
      const baselineResult = readOptionalMap(baselinePath, 'baseline-path')
      if (baselineResult.map == null) {
        regressionSkipReason = baselineResult.error
        if (failOnMissingBaseline) {
          core.setFailed(baselineResult.error)
          return
        }
        core.warning(baselineResult.error)
      } else {
        baseline = baselineResult.map
        regressions = checkRegression(
          current,
          baseline,
          maxIncreaseRatio,
          minIncreaseBytes
        )
      }
    }

    const missingKeys = [
      ...new Set([
        ...findMissingKeys(current, limits),
        ...findMissingKeys(current, baseline)
      ])
    ]
    if (missingKeys.length) {
      core.warning(
        `Tracked but absent from current-path, so unenforced: ${missingKeys.join(', ')}`
      )
    }

    if (headroom.length) {
      core.info('Headroom:')
      for (const finding of headroom) {
        const line = formatHeadroomLine(finding)
        // Failures are the findings that break the build, so they get the
        // louder annotation; the warn band is advisory.
        if (finding.fail) {
          core.error(line)
        } else {
          core.warning(line)
        }
      }
    } else if (!skippedHeadroom) {
      core.info('Headroom: all assets within the warn band.')
    } else {
      core.info('Headroom: skipped (no max-bytes or limits-path).')
    }

    if (regressionSkipReason) {
      core.info(`Regression: skipped (${regressionSkipReason}).`)
    } else if (regressions.length) {
      core.info('Significant increases vs baseline:')
      for (const line of formatRegressionLines(regressions)) {
        core.error(line)
      }
    } else {
      core.info('Regression: no significant increases vs baseline.')
    }

    const failed = headroom.some(f => f.fail) || regressions.length > 0

    const summary = buildStepSummary({
      headroom,
      regressions,
      regressionSkipReason,
      skippedHeadroom,
      missingKeys,
      failed
    })
    await core.summary.addRaw(summary).write()

    if (failed) {
      core.setFailed(
        'Bundle budget check failed. Investigate the growth or, if intentional, raise the budget / refresh the baseline.'
      )
      return
    }

    core.info('Bundle budget OK.')
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}
