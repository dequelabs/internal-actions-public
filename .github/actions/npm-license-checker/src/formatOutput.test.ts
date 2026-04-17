import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import formatOutput from './formatOutput.ts'
import type { LicenseChecker, ModuleInfos } from './types.ts'

describe('formatOutput', () => {
  let licenseChecker: sinon.SinonStubbedInstance<LicenseChecker>
  const merged: ModuleInfos = {
    'pkg-a@1.0.0': { licenses: 'MIT' }
  }

  beforeEach(() => {
    licenseChecker = {
      init: sinon.stub(),
      asSummary: sinon.stub(),
      asCSV: sinon
        .stub<Parameters<LicenseChecker['asCSV']>, string>()
        .returns('csv-output'),
      asMarkDown: sinon
        .stub<Parameters<LicenseChecker['asMarkDown']>, string>()
        .returns('markdown-output'),
      asPlainVertical: sinon
        .stub<Parameters<LicenseChecker['asPlainVertical']>, string>()
        .returns('plainvertical-output')
    }
  })

  afterEach(() => {
    sinon.restore()
  })

  it('should return JSON.stringify for JSON format', () => {
    const result = formatOutput(licenseChecker, merged, 'json')

    assert.strictEqual(result, JSON.stringify(merged, null, 2))
  })

  it('should call asCSV for CSV format', () => {
    const customFields = { name: '' }
    const result = formatOutput(licenseChecker, merged, 'csv', customFields)

    assert.strictEqual(result, 'csv-output')
    assert.strictEqual(
      licenseChecker.asCSV.calledOnceWith(merged, customFields),
      true
    )
  })

  it('should call asMarkDown for Markdown format', () => {
    const customFields = { name: '' }
    const result = formatOutput(
      licenseChecker,
      merged,
      'markdown',
      customFields
    )

    assert.strictEqual(result, 'markdown-output')
    assert.strictEqual(
      licenseChecker.asMarkDown.calledOnceWith(merged, customFields),
      true
    )
  })

  it('should call asPlainVertical for PlainVertical format', () => {
    const result = formatOutput(licenseChecker, merged, 'plainVertical')

    assert.strictEqual(result, 'plainvertical-output')
    assert.strictEqual(
      licenseChecker.asPlainVertical.calledOnceWith(merged),
      true
    )
  })
})
