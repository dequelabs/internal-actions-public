import { CheckLicensesOptions, DependencyType, DetailsOutputFormat, LicenseChecker, ModuleInfos } from './types';


export default async function checkLicenses(
  licenseChecker: LicenseChecker,
  options: CheckLicensesOptions
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
  } = options;

  return new Promise((resolve, reject) => {
    licenseChecker.init(
      {
        json: detailsOutputFormat === DetailsOutputFormat.JSON,
        csv: detailsOutputFormat === DetailsOutputFormat.CSV,
        // @ts-ignore
        markdown: detailsOutputFormat === DetailsOutputFormat.Markdown,
        start: startPath,
        production: dependencyType === DependencyType.Production,
        development: dependencyType === DependencyType.Development,
        out: detailsOutputPath,
        onlyAllow,
        customFormat: customFields,
        excludePackages,
        excludePackagesStartingWith,
        clarificationsFile: clarificationsPath
      },
      (err, packages) => {
        if (err) {
          reject(err);
        } else {
          resolve(packages);
        }
      }
    );
  });
}
