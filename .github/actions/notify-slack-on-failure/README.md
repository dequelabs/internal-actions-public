# Notify Slack on Failure

This action sends a notification to a Slack channel when a GitHub Action fails.

## Inputs

| Name                | Required | Description                                       | Default                   |
| ------------------- | -------- | ------------------------------------------------- | ------------------------- |
| `slack_webhook_url` | Yes      | The Slack webhook URL to send notifications to.   | NA                        |
| `title`             | Yes      | The title of the Slack notification.              | NA                        |
| `slack_channel`     | Yes      | The Slack channel to send the notification to.    | NA                        |
| `slack_message`     | No       | The message to include in the Slack notification. | 'Go check what happened.' |

## Example Usage

```yaml
uses: dequelabs/internal-actions-public/.github/actions/notify-slack-on-failure@<sha>
with:
  slack_webhook_url: ${{ secrets.SLACK_WEBHOOK_URL }}
  title: 'Drinking instant coffee is a crime'
  slack_channel: <your-slack-channel>
```
