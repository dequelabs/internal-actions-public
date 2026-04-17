import fs from 'node:fs'
import path from 'node:path'
import checkLicenses from './checkLicenses.ts'
import defaultDetectPnpm, {
  findPnpmWorkspaceRoot as defaultFindPnpmWorkspaceRoot
} from './detectPnpm.ts'
import defaultScanPnpm from './scanPnpm.ts'
import applyExcludesAndClarifications from './applyExcludesAndClarifications.ts'
import checkOnlyAllow from './checkOnlyAllow.ts'
import formatOutput from './formatOutput.ts'
import {
  DEPENDENCY_TYPES,
  DETAILS_OUTPUT_FORMATS,
  type DependencyType,
  type RunOptions,
  type DetailsOutputFormat,
  type CustomFields,
  type CheckLicensesOptions,
  type ModuleInfos
} from './types.ts'

export default async function run({
  core,
  licenseChecker,
  detectPnpm = defaultDetectPnpm,
  findPnpmWorkspaceRoot = defaultFindPnpmWorkspaceRoot,
  scanPnpm = defaultScanPnpm
}: RunOptions) {
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
      return
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

    const resolvedStart = path.resolve(startPath)
    // Accept either a directory or a `package.json` file; reject any other
    // file type so callers get an actionable error instead of a confusing
    // downstream failure.
    let absPath: string
    try {
      absPath = normalizeScanPath(resolvedStart)
    } catch (error) {
      core.setFailed((error as Error).message)
      return
    }

    // Route pnpm-managed projects to `pnpm licenses list` because the
    // library's `read-installed-packages` cannot walk pnpm's `.pnpm`
    // sibling layout. Everything else uses the library's normal flow.
    if (detectPnpm(absPath)) {
      let result: ModuleInfos
      try {
        const wsRoot = findPnpmWorkspaceRoot(absPath)
        const isWorkspaceMember = wsRoot !== null && wsRoot !== absPath
        const isWorkspaceRoot = wsRoot !== null && wsRoot === absPath
        const cwd = isWorkspaceMember ? wsRoot : absPath
        const filter = isWorkspaceMember
          ? './' + path.relative(wsRoot, absPath)
          : undefined

        result = scanPnpm({
          cwd,
          filter,
          dependencyType,
          recursive: isWorkspaceRoot,
          customFields
        })
      } catch (error) {
        core.setFailed((error as Error).message)
        return
      }

      // pnpm CLI doesn't natively support our exclude/clarifications inputs.
      try {
        applyExcludesAndClarifications(result, {
          ...(excludePackages.trim().length && { excludePackages }),
          ...(excludePackagesStartingWith.trim().length && {
            excludePackagesStartingWith
          }),
          ...(clarificationsPath.trim().length && { clarificationsPath })
        })
      } catch (error) {
        core.setFailed(
          `Error applying excludes/clarifications: ${(error as Error).message}`
        )
        return
      }

      try {
        checkOnlyAllow(result, onlyAllow)
      } catch (error) {
        core.setFailed((error as Error).message)
        return
      }

      if (detailsOutputPath) {
        const formatted = formatOutput(
          licenseChecker,
          result,
          detailsOutputFormat,
          customFields
        )
        fs.writeFileSync(path.resolve(detailsOutputPath), formatted, 'utf8')
      }

      const summary = licenseChecker.asSummary(result)
      if (summary.length) {
        core.info(`License checker summary:\n${summary}`)
      } else {
        throw new Error('No licenses found')
      }
      return
    }

    const options: CheckLicensesOptions = {
      startPath: absPath,
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

/**
 * Accept either a directory or a `package.json` file. Returns the directory
 * to scan (the file's parent dir when handed a `package.json`). Throws with
 * an actionable error for any other file type.
 */
function normalizeScanPath(resolved: string): string {
  let stats: fs.Stats
  try {
    stats = fs.statSync(resolved)
  } catch {
    // Upstream existence check already ran; anything unreadable here is a
    // transient / permission issue — bubble the original path and let the
    // downstream scan produce its own error.
    return resolved
  }
  if (stats.isDirectory()) return resolved
  if (path.basename(resolved) === 'package.json') return path.dirname(resolved)
  throw new Error(
    `start-path must be a directory or a package.json file, got: ${resolved}`
  )
}
