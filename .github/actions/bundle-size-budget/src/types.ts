import type core from '@actions/core'

export type SizeMap = Record<string, number>

export type Core = Pick<
  typeof core,
  'getInput' | 'info' | 'warning' | 'error' | 'setFailed' | 'summary'
>

export type HeadroomFinding = {
  key: string
  size: number
  limit: number
  fail: boolean
}

export type RegressionFinding = {
  key: string
  before: number
  size: number
  delta: number
}
