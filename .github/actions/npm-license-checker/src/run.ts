import fs from 'fs';
import path from 'path';
import { DependencyType, RunOptions } from './types';
import checkLicenses from './checkLicenses';

export default async function run({ core, licenseChecker }: RunOptions) {
  try {
    const dependencyType = core.getInput('dependency-type') as DependencyType;
    const startPath = core.getInput('start-path');
    const customFieldsPath = core.getInput('custom-fields-path');
    const onlyAllow = core.getInput('only-allow');
    const detailsOutputPath = core.getInput('details-output-path');
    const excludePackages = core.getInput('exclude-packages');
    const excludePackagesStartingWith = core.getInput('exclude-packages-starting-with')

    if (!Object.values(DependencyType).includes(dependencyType)) {
      core.setFailed(
        `Invalid dependency-type: ${dependencyType}. Allowed values are: ${Object.values(
          DependencyType
        ).join(', ')}`
      );
      return;
    }

    if (!fs.existsSync(path.resolve(startPath))) {
      core.setFailed(
        `The file specified by start-path does not exist: ${startPath}`
      );
      return;
    }

    if (customFieldsPath && !fs.existsSync(path.resolve(customFieldsPath))) {
      core.setFailed(
        `The file specified by custom-fields-path does not exist: ${customFieldsPath}`
      );
      return;
    }

    let customFields: Record<string, any> | undefined = {
      name: '',
      version: '',
      licenses: '',
      licenseText: ''
    };
    if (customFieldsPath) {
      try {
        const customFieldsContent = fs.readFileSync(
          path.resolve(customFieldsPath),
          'utf8'
        );
        customFields = JSON.parse(customFieldsContent);
      } catch (error) {
        core.setFailed(
          `Error reading or parsing customFieldsPath: ${
            (error as Error).message
          }`
        );
        return;
      }
    }

    await checkLicenses(licenseChecker, {
      startPath,
      dependencyType,
      customFields,
      onlyAllow,
      detailsOutputPath,
      excludePackages,
      excludePackagesStartingWith
    });
  } catch (error) {
    core.setFailed(`Error checking licenses: ${(error as Error).message}`);
  }
}
