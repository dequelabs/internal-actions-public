# npm-license-checker

A GitHub action to check 3rd-party licenses and output a report of licenses used

## Inputs

| Name                             | Required | Description                                                                                                                          | Default                               |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `dependency-type`                | No       | Type of dependencies to include: production \| development \| all                                                                    | `all`                                 |
| `start-path`                     | No       | The path to begin scanning for licenses                                                                                              | `./`                                  |
| `custom-fields-path`             | No       | A path to a file to customize the detail output. See: https://www.npmjs.com/package/license-checker-rseidelsohn#custom-format        | NA                                    |
| `clarifications-path`            | No       | A path to a file that contains license clarifications. See: https://www.npmjs.com/package/license-checker-rseidelsohn#clarifications | NA                                    |
| `only-allow`                     | No       | A semicolon-separated list of allowed licenses                                                                                       | [List of common open source licenses] |
| `details-output-path`            | No       | The path to output details (e.g. ./licenseData.json)                                                                                 | NA                                    |
| `details-output-format`          | No       | The format to output the results in (csv \| json \| markdown \| plainVertical)                                                       | `json`                                |
| `exclude-packages`               | No       | A semicolon-separated list of packages to exclude (e.g., 'axe-core;axe-devtools-app;react-wai-accordion')                            | NA                                    |
| `exclude-packages-starting-with` | No       | A semicolon-separated list of package name prefixes to exclude (e.g., '@deque/;@types/')                                             | NA                                    |

## Example usage

```yaml
name: Generate Third-Party Credits

on:
  push:
    # Run on all feature branches except main, release, and develop
    branches:
      - '**'
      - '!main'
      - '!release'
      - '!develop'

concurrency:
  # This concurrency group is used to ensure that only one instance of the workflow runs for a specific feature branch at a time.
  group: '${{ github.workflow }}-${{ github.ref_name }}'
  # It will cancel any in-progress runs for this group if a new event occurs for the same feature branch.
  cancel-in-progress: true

jobs:
  generate-credits:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v5

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        timeout-minutes: 10

      - name: Generating ./app credits
        uses: dequelabs/internal-actions-public/.github/actions/npm-license-checker@main # we can run it from `main` since this is internal GHA
        with:
          start-path: './app' # Path to scan for licenses from "repo-name/app" folder
          dependency-type: 'production'
          exclude-packages: 'axe-core;axe-devtools-app;react-wai-accordion'
          exclude-packages-starting-with: '@deque/;@types/'
          details-output-path: './app/credits.json'
          details-output-format: 'json'
          clarifications-path: './app/licenseClarifications.json'

      # We run this before auto-commit to ensure credits.json is formatted before auto-commit checks for diffs
      - name: Formatting credits files
        run: git add . && yarn lint-staged --allow-empty

      - name: Check for changes in credits files after formatting
        id: check-git-changes
        run: |
          if [ -z "$(git status --porcelain)" ]; then
            echo "No changes detected in credits files."
            echo "has_changes=false" >> $GITHUB_OUTPUT
          else
            echo "Changes detected in credits files. Creating a commit..."
            echo "has_changes=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit and push credits files if changed
        if: steps.check-git-changes.outputs.has_changes == 'true'
        uses: stefanzweifel/git-auto-commit-action@04702edda442b2e678b25b537cec683a1493fcb9 # tag=v7.1.0
        with:
          branch: ${{ github.ref_name }}
          commit_message: ':robot: Update "credits" file'
          # we don't need to run pre-commit hook because we run lint-staged in the step "name: Formatting credits files"
          commit_options: '--no-verify'
          file_pattern: './app/src/credits.json'
```

## Example usage if a repo uses [workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)

```yaml
name: Generate Third-Party Credits

on:
  push:
    # Run on all feature branches except main, release, and develop
    branches:
      - '**'
      - '!main'
      - '!release'
      - '!develop'

concurrency:
  # This concurrency group is used to ensure that only one instance of the workflow runs for a specific feature branch at a time.
  group: '${{ github.workflow }}-${{ github.ref_name }}'
  # It will cancel any in-progress runs for this group if a new event occurs for the same feature branch.
  cancel-in-progress: true

jobs:
  generate-credits:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      APP_PATH: './app'
    steps:
      - uses: actions/checkout@v5

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci
        timeout-minutes: 10

      - name: Creating temporary package.json for ${{ env.APP_PATH }} workspace
        id: app-temp-package
        uses: dequelabs/internal-actions-public/.github/actions/create-temp-package-json-v1@main # we can run it from `main` since this is internal GHA
        with:
          workspace-path-list: ${{ env.APP_PATH }}
          output-path: '${{ env.APP_PATH }}_temp_license_check'

      - name: Generating ${{ env.APP_PATH }} credits
        uses: dequelabs/internal-actions-public/.github/actions/npm-license-checker@main # we can run it from `main` since this is internal GHA
        with:
          start-path: ${{ steps.app-temp-package.outputs.temp-path }}
          dependency-type: 'production'
          exclude-packages: 'axe-core;axe-devtools-app;react-wai-accordion'
          exclude-packages-starting-with: '@deque/;@types/'
          details-output-path: '${{ env.APP_PATH }}/credits.json'
          details-output-format: 'json'
          clarifications-path: '${{ env.APP_PATH }}/licenseClarifications.json'

      - name: Clean up temporary ${{ steps.app-temp-package.outputs.temp-path }} directory
        run: rm -rf ${{ steps.app-temp-package.outputs.temp-path }}

      # We run this before auto-commit to ensure credits.json is formatted before auto-commit checks for diffs
      - name: Formatting credits files
        run: git add . && yarn lint-staged --allow-empty

      - name: Check for changes in credits files after formatting
        id: check-git-changes
        run: |
          if [ -z "$(git status --porcelain)" ]; then
            echo "No changes detected in credits files."
            echo "has_changes=false" >> $GITHUB_OUTPUT
          else
            echo "Changes detected in credits files. Creating a commit..."
            echo "has_changes=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit and push credits files if changed
        if: steps.check-git-changes.outputs.has_changes == 'true'
        uses: stefanzweifel/git-auto-commit-action@04702edda442b2e678b25b537cec683a1493fcb9 # tag=v7.1.0
        with:
          branch: ${{ github.ref_name }}
          commit_message: ':robot: Update "credits" file'
          # we don't need to run pre-commit hook because we run lint-staged in the step "name: Formating credits files"
          commit_options: '--no-verify'
          file_pattern: '**/credits.json'
```
