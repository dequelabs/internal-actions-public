import { describe, it } from 'node:test'
import assert from 'node:assert'
import checkOnlyAllow from './checkOnlyAllow.ts'
import type { ModuleInfos } from './types.ts'

describe('checkOnlyAllow', () => {
  it('should not throw when all licenses are allowed', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: 'MIT' },
      'pkg-b@2.0.0': { licenses: 'Apache-2.0' }
    }

    assert.doesNotThrow(() => checkOnlyAllow(merged, 'MIT;Apache-2.0'))
  })

  it('should throw when a license is not allowed', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: 'MIT' },
      'pkg-b@2.0.0': { licenses: 'GPL-3.0' }
    }

    assert.throws(
      () => checkOnlyAllow(merged, 'MIT;Apache-2.0'),
      /pkg-b@2.0.0.*GPL-3.0/
    )
  })

  it('should collect all violations', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: 'GPL-3.0' },
      'pkg-b@2.0.0': { licenses: 'AGPL-3.0' }
    }

    try {
      checkOnlyAllow(merged, 'MIT')
      assert.fail('Expected to throw')
    } catch (err) {
      const message = (err as Error).message
      assert.ok(message.includes('pkg-a@1.0.0'))
      assert.ok(message.includes('pkg-b@2.0.0'))
    }
  })

  it('should not throw when onlyAllow is empty', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: 'GPL-3.0' }
    }

    assert.doesNotThrow(() => checkOnlyAllow(merged, ''))
  })

  it('should not throw when onlyAllow is whitespace', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: 'GPL-3.0' }
    }

    assert.doesNotThrow(() => checkOnlyAllow(merged, '   '))
  })

  it('should match SPDX OR expressions via substring', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: '(MIT OR Apache-2.0)' }
    }

    assert.doesNotThrow(() => checkOnlyAllow(merged, 'MIT'))
  })

  it('should handle array licenses field', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: ['MIT', 'Apache-2.0'] as unknown as string }
    }

    assert.doesNotThrow(() => checkOnlyAllow(merged, 'MIT'))
  })

  it('should treat missing licenses as UNKNOWN', () => {
    const merged: ModuleInfos = {
      'pkg-a@1.0.0': { licenses: '' }
    }

    assert.throws(() => checkOnlyAllow(merged, 'MIT'), /UNKNOWN/)
  })
})
