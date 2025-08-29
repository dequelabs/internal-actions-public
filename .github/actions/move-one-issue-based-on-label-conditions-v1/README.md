# move-one-issue-based-on-label-conditions-v1

This is a composite action that checks multiple label conditions and moves the issue to the appropriate column in the project board

## Inputs

| Name                 | Required | Description                                                   | Default |
| -------------------- | -------- | ------------------------------------------------------------- | ------- |
| `gh-token`           | Yes      | A GitHub token with the required permissions                  | NA      |
| `issue-number`       | Yes      | The issue number to check and move if it matches any          | NA      |
| `issue-organization` | Yes      | The issue organization name                                   | NA      |
| `issue-repo`         | Yes      | The issue repository name                                     | NA      |
| `issue-url`          | Yes      | The issue URL to move it to another column                    | NA      |
| `project-number`     | Yes      | The project number of the project board                       | NA      |
| `team-label`         | Yes      | The team label name to work only with the team-related issues | NA      |

## Example usage

```yaml
name: Check an issue is closed or labeled and move it

on:
  issues:
    types:
      - closed
      - labeled

concurrency:
  # This concurrency group is used to ensure that only one instance of the workflow runs for a specific issue at a time.
  # It will cancel any in-progress runs if a new event occurs for the same issue.
  group: '${{ github.workflow }}-${{ github.event.issue.number }}'
  cancel-in-progress: ${{ github.event_name == 'issues' }}

jobs:
  check-issue-is-closed-or-labeled:
    runs-on: ubuntu-latest
    timeout-minutes: 7
    outputs:
      criteria-met: ${{ steps.check-issue-criteria.outputs.criteria-met }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v5
        with:
          # Fetch all history
          fetch-depth: 0

      - name: Check an issue is closed or labeled
        id: check-issue-criteria
        run: |
          CRITERIA_MET="false"

          ACTION="${{ github.event.action }}"
          STATE_REASON="${{ github.event.issue.state_reason }}"
          LABEL="${{ github.event.label.name }}"

          if [[ "$ACTION" == "closed" && "$STATE_REASON" == "completed" ]]; then
            CRITERIA_MET="true"
          fi

          if [[ "$ACTION" == "labeled" &&
            ("$LABEL" == "DesignSignoff: passed" ||
               "$LABEL" == "QA: passed" ||
               "$LABEL" == "Docs: done") ]]; then
            CRITERIA_MET="true"
          fi

          echo "criteria-met=$CRITERIA_MET" >> $GITHUB_OUTPUT
        shell: bash

  process-issue:
    needs: check-issue-is-closed-or-labeled
    if: needs.check-issue-is-closed-or-labeled.outputs.criteria-met == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 7
    steps:
      - uses: dequelabs/internal-actions-public/.github/actions/move-one-issue-based-on-label-conditions-v1@main
        with:
          gh-token: ${{ secrets.GH_TOKEN }}
          issue-number: ${{ github.event.issue.number }}
          issue-organization: ${{ github.repository_owner }}
          issue-repo: ${{ github.event.repository.name }}
          issue-url: ${{ github.event.issue.html_url }}
          project-number: 123
          team-label: 'some-team-label'
    env:
      # Required for GH CLI
      GH_TOKEN: ${{ secrets.GH_TOKEN }}
```
