import { CheckLicensesOptions, LicenseChecker } from './types';

export default async function checkLicenses(
  licenseChecker: LicenseChecker,
  options: CheckLicensesOptions
): Promise<void> {
  const {
    dependencyType,
    startPath,
    customFields,
    onlyAllow,
    detailsOutputPath
  } = options;

  return new Promise((resolve, reject) => {
    licenseChecker.init(
      {
        start: startPath,
        production: dependencyType === 'production',
        development: dependencyType === 'development',
        out: detailsOutputPath,
        onlyAllow,
        customFormat: customFields
      },
      (err, packages) => {
        if (err) {
          reject(err);
        } else {
          // Here you can add additional logic to process the packages
          // For now, we'll just resolve the promise
          resolve();
        }
      }
    );
  });
}
