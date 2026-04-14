import type core from '@actions/core'
import type * as licenseChecker from 'license-checker-rseidelsohn'

export type Core = Pick<typeof core, 'getInput' | 'info' | 'setFailed'>
export type ModuleInfos = licenseChecker.ModuleInfos
export type LicenseChecker = Pick<typeof licenseChecker, 'init'> & {
  asSummary: (moduleInfos: licenseChecker.ModuleInfos) => string
  asCSV: (
    sorted: licenseChecker.ModuleInfos,
    customFormat?: CustomFields,
    csvComponentPrefix?: string
  ) => string
  asMarkDown: (
    sorted: licenseChecker.ModuleInfos,
    customFormat?: CustomFields
  ) => string
  asPlainVertical: (sorted: licenseChecker.ModuleInfos) => string
}

export const DEPENDENCY_TYPES = ['production', 'all'] as const
export type DependencyType = (typeof DEPENDENCY_TYPES)[number]

export const DETAILS_OUTPUT_FORMATS = [
  'json',
  'csv',
  'markdown',
  'plainVertical'
] as const
export type DetailsOutputFormat = (typeof DETAILS_OUTPUT_FORMATS)[number]

// This matches the type of the customFormat option in license-checker-rseidelsohn
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CustomFields = Record<string, any>

export type CheckLicensesRawOptions = {
  dependencyType: DependencyType
  startPath: string
  customFields?: CustomFields
  clarificationsPath?: string
  excludePackages?: string
  excludePackagesStartingWith?: string
}

export interface ResolvedNodeModules {
  scanPath: string
  cleanup: () => void
}

export interface ScanPnpmOptions {
  cwd: string
  filter?: string
  dependencyType: DependencyType
  recursive?: boolean
}

export interface RunOptions {
  core: Core
  licenseChecker: LicenseChecker
  expandWorkspaces?: (startPath: string) => string[]
  resolveNodeModules?: (startPath: string) => ResolvedNodeModules
  detectPnpm?: (startPath: string) => boolean
  findPnpmWorkspaceRoot?: (startPath: string) => string | null
  scanPnpm?: (opts: ScanPnpmOptions) => ModuleInfos
}
