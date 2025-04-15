# 🏷️ A11y SLA Label Automation

This GitHub Action automatically adds SLA labels like **SLA P1**, **SLA P2**, **SLA Breach**, etc., based on how old an issue is and its **impact level**.

---

## ✅ What It Does

- Looks for open issues with the labels: `A11y` and `VPAT`
- Checks for impact level labels: `Blocker`, `Critical`, `Serious`, `Moderate`
- Calculates the age of the issue (in weeks)
- Adds or updates one of the following SLA labels:
  - **SLA P3** – 3 weeks before the breach deadline
  - **SLA P2** – 2 weeks before the breach deadline
  - **SLA P1** – 1 week before the breach deadline
  - **SLA Breach** – if the issue has passed the deadline
- Removes any previously applied SLA labels if necessary

---

## 📊 SLA Thresholds by Impact Level

Each impact level has its own SLA breach threshold:

- `Blocker` → breaches in **4 weeks**
- `Critical` → breaches in **10 weeks**
- `Serious` → breaches in **20 weeks**
- `Moderate` → breaches in **30 weeks**

---

## 🚀 Execution Code Example

Create a workflow file (e.g. `.github/workflows/a11y-sla-labels.yml`) in your target repo:

```yaml
name: A11y SLA Label Bot

on:
  schedule:
    - cron: '0 0 * * *'  # Runs daily at midnight UTC
  workflow_dispatch:

jobs:
  sla-check:
    runs-on: ubuntu-latest
    name: Label SLA status on open issues

    steps:
      - name: Run SLA Label Script
        uses: dequelabs/internal-actions-public/.github/actions/a11y-sla-breach-labels@<commit-hash> # Replace <commit-hash> with the commit hash you want to use (typically the latest commit in the main branch)
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```
---

## 🧪 How to Test It
- Add the a11y-sla-labels.yml file to your repo under .github/workflows/
- Go to the Actions tab in GitHub
- Click “Run workflow” to test it manually, or wait for the next scheduled run
- Check the logs and open issues to see updated SLA labels