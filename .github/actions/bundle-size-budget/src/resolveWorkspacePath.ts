import path from 'node:path'

/**
 * Resolves a path input against the GitHub workspace and rejects paths that point outside it.
 *
 * @param input - The path from the action input, relative or absolute.
 * @param label - The input name, used in the error message.
 * @returns The absolute path inside the workspace.
 * @throws When the resolved path is outside the workspace.
 */
export function resolveWorkspacePath(input: string, label: string): string {
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd())
  const resolved = path.resolve(workspace, input)
  const relative = path.relative(workspace, resolved)
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`${label} must be inside the workspace: ${input}`)
  }
  return resolved
}
