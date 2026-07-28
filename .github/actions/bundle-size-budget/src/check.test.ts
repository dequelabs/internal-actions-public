import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkHeadroom,
  checkRegression,
  findMissingKeys,
  resolveLimit
} from './check.ts'

describe('resolveLimit', () => {
  it('prefers per-key limits over maxBytes', () => {
    assert.equal(resolveLimit('a', 100, { a: 50 }), 50)
    assert.equal(resolveLimit('b', 100, { a: 50 }), 100)
    assert.equal(resolveLimit('a', null, { a: 50 }), 50)
    assert.equal(resolveLimit('a', null, null), null)
  })
})

describe('checkHeadroom', () => {
  it('skips when no limits are configured', () => {
    assert.deepEqual(checkHeadroom({ a: 1000 }, 0.85, null, null), [])
  })

  it('ignores sizes below the warn band', () => {
    assert.deepEqual(checkHeadroom({ a: 80 }, 0.85, 100, null), [])
  })

  it('warns in the warn band and fails at/over the limit', () => {
    const findings = checkHeadroom(
      { warn: 90, fail: 100, over: 120 },
      0.85,
      100,
      null
    )
    assert.deepEqual(findings, [
      { key: 'warn', size: 90, limit: 100, fail: false },
      { key: 'fail', size: 100, limit: 100, fail: true },
      { key: 'over', size: 120, limit: 100, fail: true }
    ])
  })

  it('still fails at/over the limit when warnRatio > 1', () => {
    const findings = checkHeadroom({ under: 105, over: 120 }, 1.5, 100, null)
    assert.deepEqual(findings, [
      { key: 'under', size: 105, limit: 100, fail: true },
      { key: 'over', size: 120, limit: 100, fail: true }
    ])
  })

  it('uses per-key limits and skips keys without a limit when maxBytes is null', () => {
    const findings = checkHeadroom({ a: 90, b: 1000 }, 0.85, null, { a: 100 })
    assert.deepEqual(findings, [
      { key: 'a', size: 90, limit: 100, fail: false }
    ])
  })
})

describe('findMissingKeys', () => {
  it('returns tracked keys that are absent from current', () => {
    assert.deepEqual(findMissingKeys({ a: 1 }, { a: 2, b: 3 }), ['b'])
  })

  it('returns nothing for a null map or a fully covered map', () => {
    assert.deepEqual(findMissingKeys({ a: 1 }, null), [])
    assert.deepEqual(findMissingKeys({ a: 1, b: 2 }, { a: 2 }), [])
  })
})

describe('checkRegression', () => {
  it('ignores new keys and small growth', () => {
    assert.deepEqual(
      checkRegression({ a: 1100, b: 5000 }, { a: 1000 }, 0.1, 200),
      []
    )
  })

  it('fails when both absolute and ratio thresholds are met', () => {
    assert.deepEqual(checkRegression({ a: 1200 }, { a: 1000 }, 0.1, 150), [
      { key: 'a', before: 1000, size: 1200, delta: 200 }
    ])
  })

  it('requires both thresholds', () => {
    // Large absolute, small ratio
    assert.deepEqual(checkRegression({ a: 1100 }, { a: 1000 }, 0.2, 50), [])
    // Large ratio, small absolute
    assert.deepEqual(checkRegression({ a: 120 }, { a: 100 }, 0.1, 50), [])
  })
})
