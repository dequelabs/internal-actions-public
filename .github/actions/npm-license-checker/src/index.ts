import * as core from '@actions/core';
import * as licenseChecker from 'license-checker-rseidelsohn';
import run from './run';

run({ core, licenseChecker });
