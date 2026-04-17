import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import fs from 'node:fs'
import applyExcludesAndClarifications from './applyExcludesAndClarifications.ts'
import type { ModuleInfos } from './types.ts'

describe('applyExcludesAndClarifications', () => {
  let readFileSyncStub: sinon.SinonStub

  beforeEach(() => {
    readFileSyncStub = sinon.stub(fs, 'readFileSync')
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should exclude packages by name', () => {
    const merged: ModuleInfos = {
      'foo@1.0.0': { licenses: 'MIT' },
      'bar@2.0.0': { licenses: 'MIT' },
      'baz@3.0.0': { licenses: 'MIT' },
      unversioned: { licenses: 'MIT' }
    }

    applyExcludesAndClarifications(merged, {
      excludePackages: 'foo;baz;unversioned'
    })

    assert.deepStrictEqual(Object.keys(merged), ['bar@2.0.0'])
  })

  it('should exclude packages starting with prefix', () => {
    const merged: ModuleInfos = {
      '@scope/foo@1.0.0': { licenses: 'MIT' },
      '@scope/bar@2.0.0': { licenses: 'MIT' },
      'other@3.0.0': { licenses: 'MIT' }
    }

    applyExcludesAndClarifications(merged, {
      excludePackagesStartingWith: '@scope/'
    })

    assert.deepStrictEqual(Object.keys(merged), ['other@3.0.0'])
  })

  it('should apply clarifications file overrides via semver match', () => {
    const merged: ModuleInfos = {
      'foo@1.2.3': { licenses: 'UNKNOWN' },
      'bar@2.0.0': { licenses: 'Apache-2.0' }
    }

    readFileSyncStub.returns(
      JSON.stringify({
        'foo@^1.0.0': { licenses: 'MIT', licenseText: 'Clarified MIT' }
      })
    )

    applyExcludesAndClarifications(merged, {
      clarificationsPath: './clarifications.json'
    })

    assert.strictEqual(merged['foo@1.2.3'].licenses, 'MIT')
    assert.strictEqual(merged['foo@1.2.3'].licenseText, 'Clarified MIT')
    // bar should be unaffected
    assert.strictEqual(merged['bar@2.0.0'].licenses, 'Apache-2.0')
  })

  it('should not apply clarifications when version does not match range', () => {
    const merged: ModuleInfos = {
      'foo@2.0.0': { licenses: 'UNKNOWN' }
    }

    readFileSyncStub.returns(
      JSON.stringify({
        'foo@^1.0.0': { licenses: 'MIT' }
      })
    )

    applyExcludesAndClarifications(merged, {
      clarificationsPath: './clarifications.json'
    })

    assert.strictEqual(merged['foo@2.0.0'].licenses, 'UNKNOWN')
  })

  it('should skip merged entries with malformed key during clarification', () => {
    const merged: ModuleInfos = {
      noversion: { licenses: 'MIT' }
    }

    readFileSyncStub.returns(
      JSON.stringify({
        'noversion@^1.0.0': { licenses: 'Apache-2.0' }
      })
    )

    applyExcludesAndClarifications(merged, {
      clarificationsPath: './clarifications.json'
    })

    assert.strictEqual(merged['noversion'].licenses, 'MIT')
  })

  it('should skip clarifications entries with malformed key', () => {
    const merged: ModuleInfos = {
      'foo@1.0.0': { licenses: 'MIT' }
    }

    readFileSyncStub.returns(
      JSON.stringify({
        'no-at-sign': { licenses: 'Apache-2.0' }
      })
    )

    applyExcludesAndClarifications(merged, {
      clarificationsPath: './clarifications.json'
    })

    assert.strictEqual(merged['foo@1.0.0'].licenses, 'MIT')
  })

  it('should skip when version is not valid semver', () => {
    const merged: ModuleInfos = {
      'foo@not-a-version': { licenses: 'UNKNOWN' }
    }

    readFileSyncStub.returns(
      JSON.stringify({
        'foo@^1.0.0': { licenses: 'MIT' }
      })
    )

    applyExcludesAndClarifications(merged, {
      clarificationsPath: './clarifications.json'
    })

    assert.strictEqual(merged['foo@not-a-version'].licenses, 'UNKNOWN')
  })

  it('should do nothing when no options provided', () => {
    const merged: ModuleInfos = {
      'foo@1.0.0': { licenses: 'MIT' }
    }

    applyExcludesAndClarifications(merged, {})

    assert.strictEqual(Object.keys(merged).length, 1)
  })
})
