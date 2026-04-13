import type {
  CheckLicensesRawOptions,
  Core,
  LicenseChecker,
  ModuleInfos
} from './types.ts'
import type { InitOpts } from 'license-checker-rseidelsohn'

export default async function checkLicensesRaw(
  licenseChecker: LicenseChecker,
  options: CheckLicensesRawOptions,
  core: Core
): Promise<ModuleInfos> {
  const {
    dependencyType,
    startPath,
    customFields,
    excludePackages,
    excludePackagesStartingWith,
    clarificationsPath
  } = options

  // We intentionally omit the library's output options (json, csv, markdown,
  // plainVertical, out) and its onlyAllow option. We need to scan multiple
  // paths and merge the results before producing output or checking the
  // allow-list, so we handle formatting (via formatOutput) and validation
  // (via checkOnlyAllow) ourselves after merging. The library's onlyAllow
  // also calls process.exit(1) on violations, which we need to avoid.
  const licenseCheckerOptions: InitOpts = {
    start: startPath,
    production: dependencyType === 'production',
    customFormat: customFields,
    excludePackages,
    excludePackagesStartingWith,
    clarificationsFile: clarificationsPath
  }

  core.info(
    `Scanning licenses in "${startPath}" with options:\n${JSON.stringify(licenseCheckerOptions)}`
  )

  return new Promise((resolve, reject) => {
    licenseChecker.init(
      licenseCheckerOptions,
      (err: Error | null, packages: ModuleInfos) => {
        if (err) {
          reject(err)
        } else {
          resolve(packages)
        }
      }
    )
  })
}
