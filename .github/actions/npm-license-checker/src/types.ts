import type core from '@actions/core'
import type licenseChecker from 'license-checker-rseidelsohn'

export type Core = Pick<typeof core, 'getInput' | 'info' | 'setFailed'>
export type LicenseChecker = Pick<typeof licenseChecker, 'init'>

export enum DependencyType {
	Production = 'production',
	Development = 'development',
	All = 'all'
}

export enum DetailsOutputFormat {
  JSON = 'json',
  CSV = 'csv',
  Markdown = 'markdown'
}

export type CheckLicensesOptions = {
  dependencyType: DependencyType;
  startPath: string;
  customFields?: Record<string, any>;
  onlyAllow?: string;
  detailsOutputPath?: string;
  excludePackages?: string;
  excludePackagesStartingWith?: string;
  detailsOutputFormat: DetailsOutputFormat
};

export interface RunOptions {
  core: Core;
  licenseChecker: LicenseChecker;
}