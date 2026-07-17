import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildStepSummary,
  formatHeadroomLines,
  formatRegressionLines
} from './format.ts'

describe('formatHeadroomLines', () => {
  it('formats warn and fail findings', () => {
    assert.deepEqual(
      formatHeadroomLines([
        { key: 'a', size: 90, limit: 100, fail: false },
        { key: 'b', size: 100, limit: 100, fail: true }
      ]),
      [
        '⚠️ a — 90 B / 100 B (is approaching the limit)',
        '❌ b — 100 B / 100 B (meets or exceeds the limit)'
      ]
    )
  })
})

describe('formatRegressionLines', () => {
  it('formats deltas with percent', () => {
    assert.deepEqual(
      formatRegressionLines([
        { key: 'a', before: 1000, size: 1200, delta: 200 }
      ]),
      ['❌ a — 1000 B → 1.2 KB (+200 B, +20.0%)']
    )
  })

  it('omits percent when the baseline size is 0', () => {
    assert.deepEqual(
      formatRegressionLines([{ key: 'a', before: 0, size: 200, delta: 200 }]),
      ['❌ a — 0 B → 200 B (+200 B)']
    )
  })
})

describe('buildStepSummary', () => {
  it('covers skipped, empty, and finding branches', () => {
    const skipped = buildStepSummary({
      headroom: [],
      regressions: [],
      skippedRegression: true,
      skippedHeadroom: true,
      failed: false
    })
    assert.match(skipped, /Headroom check skipped/)
    assert.match(skipped, /Regression check skipped/)
    assert.match(skipped, /\*\*Result:\*\* OK/)

    const ok = buildStepSummary({
      headroom: [],
      regressions: [],
      skippedRegression: false,
      skippedHeadroom: false,
      failed: false
    })
    assert.match(ok, /within the warn band/)
    assert.match(ok, /None\./)

    const failed = buildStepSummary({
      headroom: [{ key: 'a', size: 100, limit: 100, fail: true }],
      regressions: [{ key: 'a', before: 50, size: 100, delta: 50 }],
      skippedRegression: false,
      skippedHeadroom: false,
      failed: true
    })
    assert.match(failed, /meets or exceeds the limit/)
    assert.match(failed, /\+50 B/)
    assert.match(failed, /\*\*Result:\*\* failed/)
  })
})
