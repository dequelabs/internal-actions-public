import fs from 'fs'
import path from 'path'
import checkLicenses from './checkLicenses'
import {
  DependencyType,
  RunOptions,
  DetailsOutputFormat,
  CustomFields,
  CheckLicensesOptions
} from './types'

export default async function run({ core, licenseChecker }: RunOptions) {
  try {
    const dependencyType = core.getInput('dependency-type') as DependencyType
    const startPath = core.getInput('start-path')
    const customFieldsPath = core.getInput('custom-fields-path')
    const clarificationsPath = core.getInput('clarifications-path')
    const onlyAllow = core.getInput('only-allow')
    const detailsOutputPath = core.getInput('details-output-path')
    const detailsOutputFormat = core.getInput(
      'details-output-format'
    ) as DetailsOutputFormat
    const excludePackages = core.getInput('exclude-packages')
    const excludePackagesStartingWith = core.getInput(
      'exclude-packages-starting-with'
    )

    if (!Object.values(DependencyType).includes(dependencyType)) {
      core.setFailed(
        `Invalid dependency-type: ${dependencyType}. Allowed values are: ${Object.values(
          DependencyType
        ).join(', ')}`
      )
      return
    }

    if (!Object.values(DetailsOutputFormat).includes(detailsOutputFormat)) {
      core.setFailed(
        `Invalid details-output-format: ${detailsOutputFormat}. Allowed values are: ${Object.values(
          DetailsOutputFormat
        ).join(', ')}`
      )
      return
    }

    if (!fs.existsSync(path.resolve(startPath))) {
      core.setFailed(
        `The file specified by start-path does not exist: ${startPath}`
      )
      return
    }

    if (customFieldsPath && !fs.existsSync(path.resolve(customFieldsPath))) {
      core.setFailed(
        `The file specified by custom-fields-path does not exist: ${customFieldsPath}`
      )
      return
    }

    if (
      clarificationsPath &&
      !fs.existsSync(path.resolve(clarificationsPath))
    ) {
      core.setFailed(
        `The file specified by clarifications-path does not exist: ${clarificationsPath}`
      )
    }

    let customFields: CustomFields | undefined = {
      name: '',
      version: '',
      licenses: '',
      licenseText: ''
    }
    if (customFieldsPath) {
      core.info(
        `Provided custom fields path "${customFieldsPath}", reading custom fields...`
      )
      try {
        const customFieldsContent = fs.readFileSync(
          path.resolve(customFieldsPath),
          'utf8'
        )
        customFields = JSON.parse(customFieldsContent)
        core.info(`Custom fields: ${customFieldsContent}`)
      } catch (error) {
        core.setFailed(
          `Error reading or parsing customFieldsPath: ${
            (error as Error).message
          }`
        )
        return
      }
    }

    const options: CheckLicensesOptions = {
      startPath,
      dependencyType,
      customFields,
      onlyAllow,
      detailsOutputPath,
      detailsOutputFormat,
      ...(excludePackages.trim().length && { excludePackages }),
      ...(excludePackagesStartingWith.trim().length && {
        excludePackagesStartingWith
      }),
      ...(clarificationsPath.trim().length && { clarificationsPath })
    }
    core.info(`Provided options:\n${JSON.stringify(options)}`)

    const result = await checkLicenses(licenseChecker, options, core)
    const licenseCheckerSummary = licenseChecker.asSummary(result)
    const hasLicenseCheckerSummary = !!licenseCheckerSummary.length

    if (hasLicenseCheckerSummary) {
      core.info(`License checker summary:\n${licenseCheckerSummary}`)
    } else {
      throw new Error('No licenses found')
    }
  } catch (error) {
    core.setFailed(`Error checking licenses: ${(error as Error).message}`)
  }
}
