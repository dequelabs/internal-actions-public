import type {
  CheckLicensesOptions,
  Core,
  LicenseChecker,
  ModuleInfos
} from './types.ts'
import type { InitOpts } from 'license-checker-rseidelsohn'

export default async function checkLicenses(
  licenseChecker: LicenseChecker,
  options: CheckLicensesOptions,
  core: Core
): Promise<ModuleInfos> {
  const {
    dependencyType,
    startPath,
    customFields,
    onlyAllow,
    detailsOutputPath,
    excludePackages,
    excludePackagesStartingWith,
    detailsOutputFormat,
    clarificationsPath
  } = options

  const licenseCheckerOptions: InitOpts = {
    json: detailsOutputFormat === 'json',
    csv: detailsOutputFormat === 'csv',
    // @ts-expect-error The markdown option is not typed in license-checker-rseidelsohn
    markdown: detailsOutputFormat === 'markdown',
    plainVertical: detailsOutputFormat === 'plainVertical',
    start: startPath,
    production: dependencyType === 'production',
    development: dependencyType === 'development',
    out: detailsOutputPath,
    onlyAllow,
    customFormat: customFields,
    excludePackages,
    excludePackagesStartingWith,
    clarificationsFile: clarificationsPath
  }
  core.info(
    `Start checking licenses with the following options:\n${JSON.stringify(licenseCheckerOptions)}`
  )

  return new Promise((resolve, reject) => {
    licenseChecker.init(licenseCheckerOptions, (err: Error, packages: ModuleInfos) => {
      if (err) {
        reject(err)
      } else {
        resolve(packages)
      }
    })
  })
}
