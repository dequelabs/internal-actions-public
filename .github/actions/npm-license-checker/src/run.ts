import fs from 'fs'
import path from 'path'
import checkLicensesRaw from './checkLicensesRaw.ts'
import checkOnlyAllow from './checkOnlyAllow.ts'
import formatOutput from './formatOutput.ts'
import defaultExpandWorkspaces from './expandWorkspaces.ts'
import defaultResolveNodeModules from './resolveNodeModules.ts'
import {
  DEPENDENCY_TYPES,
  DETAILS_OUTPUT_FORMATS,
  type DependencyType,
  type RunOptions,
  type DetailsOutputFormat,
  type CustomFields,
  type CheckLicensesRawOptions,
  type ModuleInfos
} from './types.ts'

export default async function run({
  core,
  licenseChecker,
  expandWorkspaces = defaultExpandWorkspaces,
  resolveNodeModules = defaultResolveNodeModules
}: RunOptions) {
  try {
    const dependencyType = core.getInput('dependency-type') as DependencyType
    const startPath = core.getInput('start-path')
    const startPaths = core.getInput('start-paths')
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

    if (!DEPENDENCY_TYPES.includes(dependencyType)) {
      core.setFailed(
        `Invalid dependency-type: ${dependencyType}. Allowed values are: ${DEPENDENCY_TYPES.join(', ')}`
      )
      return
    }

    if (!DETAILS_OUTPUT_FORMATS.includes(detailsOutputFormat)) {
      core.setFailed(
        `Invalid details-output-format: ${detailsOutputFormat}. Allowed values are: ${DETAILS_OUTPUT_FORMATS.join(', ')}`
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

    // Determine user-provided paths
    let userPaths: string[]
    if (startPaths.trim().length > 0) {
      userPaths = startPaths
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0)

      if (!userPaths.length) {
        core.setFailed('start-paths is provided but contains no valid paths')
        return
      }
    } else {
      userPaths = [startPath]
    }

    // Validate all user-provided paths exist and contain a package.json
    const inputName =
      startPaths.trim().length > 0 ? 'start-paths' : 'start-path'
    for (const p of userPaths) {
      if (!fs.existsSync(path.resolve(p))) {
        core.setFailed(`${inputName} "${p}" does not exist`)
        return
      }
      if (!fs.existsSync(path.resolve(p, 'package.json'))) {
        core.setFailed(
          `${inputName} "${p}" does not contain a package.json file`
        )
        return
      }
    }

    // Smart scan: expand workspaces, resolve node_modules, scan each
    const allResults: ModuleInfos[] = []
    for (const p of userPaths) {
      const expanded = expandWorkspaces(path.resolve(p))
      for (const wsPath of expanded) {
        const { scanPath, cleanup } = resolveNodeModules(wsPath)
        try {
          const rawOptions: CheckLicensesRawOptions = {
            startPath: scanPath,
            dependencyType,
            customFields,
            ...(excludePackages.trim().length && { excludePackages }),
            ...(excludePackagesStartingWith.trim().length && {
              excludePackagesStartingWith
            }),
            ...(clarificationsPath.trim().length && { clarificationsPath })
          }
          const result = await checkLicensesRaw(
            licenseChecker,
            rawOptions,
            core
          )
          allResults.push(result)
        } finally {
          cleanup()
        }
      }
    }

    const merged: ModuleInfos = Object.assign({}, ...allResults)

    try {
      checkOnlyAllow(merged, onlyAllow)
    } catch (error) {
      core.setFailed((error as Error).message)
      return
    }

    if (detailsOutputPath) {
      const formatted = formatOutput(
        licenseChecker,
        merged,
        detailsOutputFormat,
        customFields
      )
      fs.writeFileSync(path.resolve(detailsOutputPath), formatted, 'utf8')
    }

    const licenseCheckerSummary = licenseChecker.asSummary(merged)
    if (licenseCheckerSummary.length) {
      core.info(`License checker summary:\n${licenseCheckerSummary}`)
    } else {
      throw new Error('No licenses found')
    }
  } catch (error) {
    core.setFailed(`Error checking licenses: ${(error as Error).message}`)
  }
}
