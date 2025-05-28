import * as core from '@actions/core'
import * as licenseChecker from 'license-checker-rseidelsohn'
import run from './run'
import { LicenseChecker } from './types'

run({ core, licenseChecker: licenseChecker as LicenseChecker })
