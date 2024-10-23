import fs from 'fs';
import path from 'path';
import { DependencyType, RunOptions } from './types';
import checkLicenses from './checkLicenses';

export default async function run({ core, licenseChecker }: RunOptions) {
  try {
    const dependencyType = core.getInput('dependencyType') as DependencyType;
    const startPath = core.getInput('startPath');
    const customFieldsPath = core.getInput('customFieldsPath');
    const onlyAllow = core.getInput('onlyAllow');
    const detailsOutputPath = core.getInput('detailsOutputPath');

    if (!Object.values(DependencyType).includes(dependencyType)) {
      core.setFailed(
        `Invalid dependencyType: ${dependencyType}. Allowed values are: ${Object.values(
          DependencyType
        ).join(', ')}`
      );
      return;
    }

    if (!fs.existsSync(path.resolve(startPath))) {
      core.setFailed(
        `The file specified by startPath does not exist: ${startPath}`
      );
      return;
    }

    if (customFieldsPath && !fs.existsSync(path.resolve(customFieldsPath))) {
      core.setFailed(
        `The file specified by customFieldsPath does not exist: ${customFieldsPath}`
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
    });
  } catch (error) {
    core.setFailed(`Error checking licenses: ${error as Error}.message`);
  }
}
