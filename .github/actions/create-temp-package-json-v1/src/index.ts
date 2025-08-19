import * as core from '@actions/core'
// We don't have to use streams because "package.json" files are less than 64 Kb
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
  lstatSync
} from 'fs'
import run from './run'

// The FS functions (like readFileSync, writeFileSync, etc.) are used as arguments to stub them in unit-tests
// In the FS library functions are non-configurable and non-writable
run(core, {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  symlinkSync,
  lstatSync
})
