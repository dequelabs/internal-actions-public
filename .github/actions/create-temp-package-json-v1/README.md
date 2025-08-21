# create-temp-package-json-v1

A GitHub Action to create a temporary `package.json` with production dependencies from specified workspaces.

## Inputs

| Name                  | Required | Description                                                                              | Default              |
| --------------------- | -------- | ---------------------------------------------------------------------------------------- | -------------------- |
| `workspace-path-list` | Yes      | Path list to the workspaces package.json (must be comma separated "./service, ./client") | NA                   |
| `output-path`         | No       | Path where to create temporary package.json                                              | ./temp-license-check |

## Outputs

| Name        | Description                                               |
| ----------- | --------------------------------------------------------- |
| `temp-path` | Path to the created temporary directory of `package.json` |

## Example usage

This action is used in the `license-check` job of the workflow that checks the licenses of NPM packages. It creates a temporary `package.json`
file that includes only the production dependencies from the specified workspaces.

```yaml
jobs:
  license-check:
    runs-on: ubuntu-latest
    timeout-minutes: 6
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/install-deps
        with:
          AGORA_NPM_AUTH: ${{ secrets.AGORA_NPM_AUTH }}
        timeout-minutes: 10

      - name: Create temporary package.json
        id: temp-package
        uses: dequelabs/internal-actions-public/.github/actions/create-temp-package-json-v1@main
        with:
          workspace-path-list: './service, ./client'

      - name: Check NPM licenses
        uses: dequelabs/internal-actions-public/.github/actions/npm-license-checker@main
        with:
          only-allow: 'AFL-2.1;AFL-3.0;AMPAS;Apache-2.0;Artistic-1.0;Artistic-2.0;Apache-1.1;Beerware;BSL-1.0;BSD-2-Clause;BSD-3-Clause;BSD-2-Clause-Patent;CC-BY-1.0;CC-BY-2.0;CC-BY-2.5;CC-BY-3.0;CC-BY-4.0;JSON;FTL;HPND;ImageMagick;ISC;libtiff;LPL-1.02;MS-PL;MIT;MIT-CMU;NCSA;NIST-Software;OpenSSL;PHP-3.0;PostgreSQL;TCP-wrappers;UPL-1.0;W3C-20150513;WTFPL;Xnet;Zend-2.0;Zlib;ZPL-2.0;0BSD;CC0-1.0;Unlicense;Python-2.0;BlueOak-1.0.0'
          start-path: ${{ steps.temp-package.outputs.temp-path }}
          dependency-type: 'production'
          exclude-packages: 'axe-core'
          exclude-packages-starting-with: '@deque/'
          details-output-format: 'json'
```
