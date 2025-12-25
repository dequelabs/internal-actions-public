import core from '@actions/core'
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  lstatSync,
  rmSync
} from 'fs'

export type Core = Pick<
  typeof core,
  'getInput' | 'info' | 'setFailed' | 'warning' | 'setOutput'
>

export interface FileSystem {
  readFileSync: typeof readFileSync
  writeFileSync: typeof writeFileSync
  mkdirSync: typeof mkdirSync
  existsSync: typeof existsSync
  symlinkSync: typeof symlinkSync
  lstatSync: typeof lstatSync
  rmSync: typeof rmSync
}
