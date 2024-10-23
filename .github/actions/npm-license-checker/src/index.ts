import * as core from '@actions/core';
import licenseChecker from 'license-checker';
import run from './run';

run({ core, licenseChecker });
