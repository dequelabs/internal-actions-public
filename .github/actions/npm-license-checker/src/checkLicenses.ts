import {
  CheckLicensesOptions,
  Core,
  DependencyType,
  DetailsOutputFormat,
  LicenseChecker,
  ModuleInfos
} from './types'
import { InitOpts } from 'license-checker-rseidelsohn'

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
    json: detailsOutputFormat === DetailsOutputFormat.JSON,
    csv: detailsOutputFormat === DetailsOutputFormat.CSV,
    // @ts-expect-error The markdown option is not typed in license-checker-rseidelsohn
    markdown: detailsOutputFormat === DetailsOutputFormat.Markdown,
    plainVertical: detailsOutputFormat === DetailsOutputFormat.PlainVertical,
    start: startPath,
    production: dependencyType === DependencyType.Production,
    development: dependencyType === DependencyType.Development,
    out: detailsOutputPath,
    onlyAllow,
    customFormat: customFields,
    excludePackages,
    excludePackagesStartingWith,
    clarificationsFile: clarificationsPath,
    summary: true
  }
  core.info(
    `Start checking licenses with the following options:\n${JSON.stringify(licenseCheckerOptions)}`
  )

  return new Promise((resolve, reject) => {
    licenseChecker.init(licenseCheckerOptions, (err, packages) => {
      if (err) {
        reject(err)
      } else {
        resolve(packages)
      }
    })
  })
}
