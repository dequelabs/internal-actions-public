import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sinon from 'sinon'
import run from './run.ts'
import type { Core } from './types.ts'

type SummaryStub = {
  addRaw: sinon.SinonStub
  write: sinon.SinonStub
}

describe('run', () => {
  let core: sinon.SinonStubbedInstance<Core> & { summary: SummaryStub }
  let tmpDir: string
  let inputs: Record<string, string>

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-size-budget-'))
    inputs = {
      'current-path': '',
      'baseline-path': path.join(tmpDir, 'missing.json'),
      'max-increase-ratio': '0.1',
      'min-increase-bytes': '150kb',
      'fail-on-missing-baseline': 'false',
      'warn-ratio': '0.85',
      'max-bytes': '',
      'limits-path': ''
    }

    const summary: SummaryStub = {
      addRaw: sinon.stub().returnsThis(),
      write: sinon.stub().resolves()
    }

    core = {
      getInput: sinon.stub().callsFake((name: string) => inputs[name] ?? ''),
      info: sinon.stub(),
      warning: sinon.stub(),
      error: sinon.stub(),
      setFailed: sinon.stub(),
      summary
    } as unknown as sinon.SinonStubbedInstance<Core> & { summary: SummaryStub }
  })

  afterEach(() => {
    sinon.restore()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeJson(name: string, value: unknown): string {
    const filePath = path.join(tmpDir, name)
    fs.writeFileSync(filePath, JSON.stringify(value))
    return filePath
  }

  it('fails when current-path is missing', async () => {
    inputs['current-path'] = path.join(tmpDir, 'nope.json')
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.setFailed.firstCall.args[0] as string, /does not exist/)
  })

  it('fails when current-path is invalid JSON', async () => {
    const current = path.join(tmpDir, 'bad.json')
    fs.writeFileSync(current, '{')
    inputs['current-path'] = current
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.setFailed.firstCall.args[0] as string, /Could not parse/)
  })

  it('fails when limits-path is missing', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 1 })
    inputs['limits-path'] = path.join(tmpDir, 'limits-missing.json')
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.setFailed.firstCall.args[0] as string, /limits-path/)
  })

  it('skips regression when baseline is missing and still passes headroom', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['max-bytes'] = '100'
    await run(core)
    assert.equal(core.setFailed.called, false)
    assert.equal(core.warning.called, true)
    assert.match(
      core.warning.firstCall.args[0] as string,
      /baseline|not found/i
    )
    assert.equal(core.summary.write.calledOnce, true)
  })

  it('fails when baseline is missing and fail-on-missing-baseline is true', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['fail-on-missing-baseline'] = 'true'
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
  })

  it('warns on headroom without failing under the hard limit', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 90 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 90 })
    inputs['max-bytes'] = '100'
    await run(core)
    assert.equal(core.setFailed.called, false)
    assert.equal(core.warning.called, true)
    assert.match(
      core.warning.firstCall.args[0] as string,
      /approaching the limit/
    )
  })

  it('fails when headroom exceeds the absolute limit', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 120 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 100 })
    inputs['max-bytes'] = '100'
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(
      core.setFailed.firstCall.args[0] as string,
      /Bundle budget check failed/
    )
  })

  it('uses limits-path overrides for headroom', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 50, b: 200 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 50, b: 200 })
    inputs['max-bytes'] = '1000'
    inputs['limits-path'] = writeJson('limits.json', { b: 100 })
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
  })

  it('fails on significant regressions', async () => {
    inputs['current-path'] = writeJson('current.json', {
      a: 1000 + 200 * 1024
    })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 1000 })
    // ratio is huge; absolute threshold is 150kb
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
  })

  it('passes when growth is under both thresholds', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 1100 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 1000 })
    inputs['min-increase-bytes'] = '200'
    await run(core)
    assert.equal(core.setFailed.called, false)
    assert.match(
      core.info
        .getCalls()
        .map(c => c.args[0])
        .join('\n') as string,
      /Bundle budget OK/
    )
  })

  it('skips headroom when no limits are configured', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 10 })
    await run(core)
    assert.equal(core.setFailed.called, false)
    assert.match(
      core.info
        .getCalls()
        .map(c => c.args[0])
        .join('\n') as string,
      /Headroom: skipped/
    )
  })

  it('fails on invalid max-bytes input', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 1 })
    inputs['max-bytes'] = 'nope'
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.setFailed.firstCall.args[0] as string, /Invalid|Unknown/)
  })

  it('warns and skips regression when baseline JSON is invalid', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    const baseline = path.join(tmpDir, 'baseline.json')
    fs.writeFileSync(baseline, '{')
    inputs['baseline-path'] = baseline
    inputs['max-bytes'] = '100'
    await run(core)
    assert.equal(core.setFailed.called, false)
    assert.equal(core.warning.called, true)
    assert.match(core.warning.firstCall.args[0] as string, /Could not parse/)
  })

  it('fails when limits-path JSON is invalid', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 1 })
    const limits = path.join(tmpDir, 'limits.json')
    fs.writeFileSync(limits, '{')
    inputs['limits-path'] = limits
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.setFailed.firstCall.args[0] as string, /Could not parse/)
  })

  it('applies default input fallbacks when optional inputs are empty', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 10 })
    inputs['max-increase-ratio'] = ''
    inputs['min-increase-bytes'] = ''
    inputs['fail-on-missing-baseline'] = ''
    inputs['warn-ratio'] = ''
    inputs['max-bytes'] = ''
    inputs['limits-path'] = ''
    await run(core)
    assert.equal(core.setFailed.called, false)
  })

  it('logs both warn and fail headroom findings in one run', async () => {
    inputs['current-path'] = writeJson('current.json', { warn: 90, fail: 120 })
    inputs['baseline-path'] = writeJson('baseline.json', {
      warn: 90,
      fail: 120
    })
    inputs['max-bytes'] = '100'
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.warning.firstCall.args[0] as string, /⚠️ warn/)
    assert.match(core.error.firstCall.args[0] as string, /❌ fail/)
  })

  it('reports regressions as errors so they show up as annotations', async () => {
    inputs['current-path'] = writeJson('current.json', {
      a: 1000 + 200 * 1024
    })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 1000 })
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.error.firstCall.args[0] as string, /❌ a/)
  })

  it('runs headroom only, without warning, when baseline-path is omitted', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['baseline-path'] = ''
    inputs['max-bytes'] = '100'
    await run(core)
    assert.equal(core.setFailed.called, false)
    assert.equal(core.warning.called, false)
    assert.match(
      core.info
        .getCalls()
        .map(c => c.args[0])
        .join('\n') as string,
      /Regression: skipped \(no baseline-path was provided\)/
    )
  })

  it('fails when fail-on-missing-baseline is true but baseline-path is omitted', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['baseline-path'] = ''
    inputs['fail-on-missing-baseline'] = 'true'
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(
      core.setFailed.firstCall.args[0] as string,
      /no baseline-path was provided/
    )
  })

  it('warns about limits and baseline keys that are absent from current', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 10, gone: 20 })
    inputs['limits-path'] = writeJson('limits.json', { a: 100, renamed: 100 })
    await run(core)
    assert.equal(core.setFailed.called, false)
    const warning = core.warning.firstCall.args[0] as string
    assert.match(warning, /unenforced/)
    assert.match(warning, /renamed/)
    assert.match(warning, /gone/)
  })

  it('fails when writing the step summary throws', async () => {
    inputs['current-path'] = writeJson('current.json', { a: 10 })
    inputs['baseline-path'] = writeJson('baseline.json', { a: 10 })
    core.summary.write.rejects(new Error('summary boom'))
    await run(core)
    assert.equal(core.setFailed.calledOnce, true)
    assert.match(core.setFailed.firstCall.args[0] as string, /summary boom/)
  })
})
