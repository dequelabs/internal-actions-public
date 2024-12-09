name: Generate Third-Party Credits

on:
push:
branches: - '\*\*' - '!master' - '!release' - '!develop'

jobs:
generate-credits:
runs-on: ubuntu-latest
steps: - uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '18'

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
