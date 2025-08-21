import { join, resolve } from 'path'
import type { Core, FileSystem } from './types'

interface WorkspaceDependencies {
  [key: string]: string
}
interface DependenciesByWorkspaces {
  [key: string]: WorkspaceDependencies
}

export default async function run(core: Core, fileSystem: FileSystem) {
  try {
    const defaultTempPackageName = 'temp-license-check'
    const workspacePathList = core.getInput('workspace-path-list', {
      required: true
    })
    const outputPath = (
      core.getInput('output-path') || `./${defaultTempPackageName}`
    ).trim()
    const {
      existsSync,
      readFileSync,
      writeFileSync,
      mkdirSync,
      symlinkSync,
      lstatSync
    } = fileSystem

    if (!existsSync('./node_modules')) {
      core.setFailed(
        'The `node_modules` directory not found in the root directory. Please install all dependencies before this action.'
      )
      return
    }

    const workspacePaths = workspacePathList
      .split(',')
      .map(path => path.trim())
      .filter(path => path.length)

    if (!workspacePaths.length) {
      core.setFailed(
        'No workspace paths provided. Please specify at least one valid workspace path in the `workspace-path-list` input.'
      )
      return
    }

    core.info(`Provided workspaces: ${JSON.stringify(workspacePaths)}`)

    // Create output directory
    mkdirSync(outputPath, { recursive: true })

    let mergedDependencies: WorkspaceDependencies = {}
    const dependenciesByWorkspaces: DependenciesByWorkspaces = {}

    for (const workspacePath of workspacePaths) {
      core.info(`Processing the workspace: ${workspacePath}...`)

      const packageJsonPath = join(workspacePath, 'package.json')

      if (!existsSync(packageJsonPath)) {
        core.warning(
          `The "package.json" file is not found in the "${workspacePath}" workspace. Skipping...`
        )
        continue
      }

      try {
        const packageJsonContent = readFileSync(packageJsonPath, 'utf8')

        if (!packageJsonContent.length) {
          core.warning(
            `The "package.json" file in the "${workspacePath}" workspace is empty. Skipping...`
          )
          continue
        }

        const packageData = JSON.parse(packageJsonContent)
        const dependencies = packageData.dependencies || {}

        mergedDependencies = {
          ...mergedDependencies,
          ...dependencies
        }
        dependenciesByWorkspaces[packageData.name || workspacePath] =
          dependencies || {}

        core.info(
          `The dependencies (${Object.keys(dependencies).length} items) from the "${workspacePath}" workspace are merged successfully.`
        )
      } catch (error) {
        core.setFailed(
          `Failed to process "${packageJsonPath}": ${(error as Error).message}`
        )
        return
      }
    }

    core.info(
      `Total merged dependencies: \n${JSON.stringify(mergedDependencies)}`
    )

    if (!Object.keys(mergedDependencies).length) {
      core.setFailed('No production dependencies found in any workspace')
      return
    }

    // Create temporary package.json with the production dependencies
    const tempPackageJson = {
      name: defaultTempPackageName,
      dependencies: mergedDependencies
    }
    const tempPackageJsonPath = join(outputPath, 'package.json')

    core.info(
      `Creating temporary "${tempPackageJsonPath}" file with the production dependencies...`
    )

    writeFileSync(tempPackageJsonPath, JSON.stringify(tempPackageJson, null, 2))

    core.info(`Temporary package.json created successfully`)

    // Create symlink to node_modules
    const nodeModulesSymlinkPath = join(outputPath, 'node_modules')

    symlinkSync(resolve('./node_modules'), nodeModulesSymlinkPath, 'dir')

    // Verify symlink was created
    if (!lstatSync(nodeModulesSymlinkPath).isSymbolicLink()) {
      core.setFailed(
        `Failed to create symlink to temporary "${nodeModulesSymlinkPath}" directory`
      )
      return
    }

    core.info(
      `Successfully created temporary "${tempPackageJsonPath}" file with merged dependencies from all workspaces`
    )
    core.info(
      `Production dependencies by workspaces: \n${JSON.stringify(dependenciesByWorkspaces, null, 2)}`
    )
    core.info(
      `Grouped production dependencies: \n${JSON.stringify(mergedDependencies, null, 2)}`
    )

    core.setOutput('temp-path', outputPath)
  } catch (error) {
    core.setFailed((error as Error).message)
  }
}
