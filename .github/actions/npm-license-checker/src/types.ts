import type core from '@actions/core'
import type licenseChecker from 'license-checker-rseidelsohn'

export type Core = Pick<typeof core, 'getInput' | 'info' | 'setFailed'>
export type ModuleInfos = licenseChecker.ModuleInfos
export type LicenseChecker = Pick<typeof licenseChecker, 'init'> & {
  asSummary: (moduleInfos: licenseChecker.ModuleInfos) => string
}

export enum DependencyType {
  Production = 'production',
  Development = 'development',
  All = 'all'
}

export enum DetailsOutputFormat {
  JSON = 'json',
  CSV = 'csv',
  Markdown = 'markdown',
  PlainVertical = 'plainVertical'
}

// This matches the type of the customFormat option in license-checker-rseidelsohn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CustomFields = Record<string, any>

export type CheckLicensesOptions = {
  dependencyType: DependencyType
  startPath: string
  customFields?: CustomFields
  clarificationsPath?: string
  onlyAllow?: string
  detailsOutputPath?: string
  excludePackages?: string
  excludePackagesStartingWith?: string
  detailsOutputFormat: DetailsOutputFormat
}

export interface RunOptions {
  core: Core
  licenseChecker: LicenseChecker
}
