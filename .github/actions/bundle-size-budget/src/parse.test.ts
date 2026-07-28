import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBytes,
  parseBoolean,
  parseBytes,
  parseRatio,
  parseSizeMap
} from './parse.ts'

describe('parseBytes', () => {
  it('parses plain integers', () => {
    assert.equal(parseBytes('153600'), 153600)
  })

  it('parses kb/mb/gb suffixes', () => {
    assert.equal(parseBytes('150kb'), 150 * 1024)
    assert.equal(parseBytes('7mb'), 7 * 1024 ** 2)
    assert.equal(parseBytes('1gb'), 1024 ** 3)
    assert.equal(parseBytes('1.5 MB'), Math.round(1.5 * 1024 ** 2))
  })

  it('rejects invalid values', () => {
    assert.throws(() => parseBytes(''), /Empty/)
    assert.throws(() => parseBytes('abc'), /Invalid/)
    assert.throws(() => parseBytes('-1'), /Invalid/)
    assert.throws(() => parseBytes('10xb'), /Unknown/)
    assert.throws(() => parseBytes(`${'9'.repeat(400)}`), /Invalid/)
  })
})

describe('parseRatio', () => {
  it('parses non-negative numbers', () => {
    assert.equal(parseRatio('0.85', 'warn-ratio'), 0.85)
  })

  it('rejects invalid ratios', () => {
    assert.throws(() => parseRatio('nope', 'warn-ratio'), /Invalid warn-ratio/)
    assert.throws(() => parseRatio('-1', 'warn-ratio'), /Invalid warn-ratio/)
  })
})

describe('parseBoolean', () => {
  it('treats true case-insensitively', () => {
    assert.equal(parseBoolean('true'), true)
    assert.equal(parseBoolean('TRUE'), true)
    assert.equal(parseBoolean('false'), false)
    assert.equal(parseBoolean(''), false)
  })
})

describe('parseSizeMap', () => {
  it('parses a flat map', () => {
    assert.deepEqual(parseSizeMap('{"a": 1, "b": 2}', 'current'), {
      a: 1,
      b: 2
    })
  })

  it('rejects invalid JSON and shapes', () => {
    assert.throws(() => parseSizeMap('{', 'current'), /Could not parse/)
    assert.throws(() => parseSizeMap('[]', 'current'), /JSON object/)
    assert.throws(() => parseSizeMap('{"a":"x"}', 'current'), /non-negative/)
    assert.throws(() => parseSizeMap('{"a":-1}', 'current'), /non-negative/)
  })
})

describe('formatBytes', () => {
  it('formats across units', () => {
    assert.equal(formatBytes(512), '512 B')
    assert.equal(formatBytes(2048), '2.0 KB')
    assert.equal(formatBytes(2 * 1024 ** 2), '2.00 MB')
    assert.equal(formatBytes(3 * 1024 ** 3), '3.00 GB')
  })
})
