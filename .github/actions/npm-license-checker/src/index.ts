import * as core from '@actions/core'
import * as licenseChecker from 'license-checker-rseidelsohn'
import run from './run.ts'
import type { LicenseChecker } from './types.ts'

run({ core, licenseChecker: licenseChecker as LicenseChecker })
