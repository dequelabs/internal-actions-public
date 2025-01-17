# npm-license-checker
A GitHub action to check 3rd-party licenses and output a report of licenses used

## Inputs
| Name | Required | Description | Default |
| ---- | -------- | ----------- | ------- |
| `dependency-type` | No | Type of dependencies to include: production \| development \| all | `all` |
| `start-path` | No | The path to begin scanning for licenses | `./` |
| `custom-fields-path` | No | A path to a file to customize the detail output. See: https://www.npmjs.com/package/license-checker-rseidelsohn#custom-format | NA |
| `clarifications-path` | No | A path to a file that contains license clarifications. See: https://www.npmjs.com/package/license-checker-rseidelsohn#clarifications | NA |
| `only-allow` | No | A semicolon-separated list of allowed licenses | [List of common open source licenses] |
| `details-output-path` | No | The path to output details (e.g. ./licenseData.json) | NA |
| `details-output-format` | No | The format to output the results in (csv \| json \| markdown) | `json` |
| `exclude-packages` | No | A comma-separated list of packages to exclude | NA |
| `exclude-packages-starting-with` | No | A comma-separated list of package name prefixes to exclude | NA |

## Example usage
```yaml
name: Generate Third-Party Credits

on:
  push:
    branches:
      - '**'
      - '!master'
      - '!release'
      - '!develop'

jobs:
  generate-credits:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - uses: dequelabs/internal-actions-public/.github/actions/npm-license-checker@e1010db9d38031a9fe150a1808dbf714f324cdcd
        with:
          dependency-type: 'production'
          details-output-path: './app/src/credits.json'
          exclude-packages: 'axe-core;axe-devtools-app;react-wai-accordion'
          exclude-packages-starting-with: '@deque/'
          details-output-format: 'json'
          clarifications-path: './app/licenseClarifications.json'
          start-path: './app'

      - name: Commit and push if changed
        uses: stefanzweifel/git-auto-commit-action@8621497c8c39c72f3e2a999a26b4ca1b5058a842
        with:
          commit_message: 'Update credits.json'
          file_pattern: './app/src/credits.json'
```
