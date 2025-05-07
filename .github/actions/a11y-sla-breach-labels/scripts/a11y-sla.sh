#!/bin/bash

set -eo pipefail

echo "🚀 Fetching open issues from GitHub API (handling pagination)..."

# Define SLA Thresholds based on impact levels (in weeks)
declare -A LABEL_THRESHOLDS=( ["Blocker"]=4 ["Critical"]=10 ["Serious"]=20 ["Moderate"]=30 )

# SLA Labels (only these should be removed/updated)
SLA_LABELS=("SLA P1" "SLA P2" "SLA P3" "SLA Breach")

# Required labels for filtering issues
REQUIRED_LABELS=("A11y" "VPAT")
LABELS_QUERY=$(IFS=,; echo "${REQUIRED_LABELS[*]}")

PAGE=1
ALL_ISSUES="[]"
CURRENT_TIMESTAMP=$(date -u +%s)

# Fetch issues (with pagination)
while :; do
  echo "🔄 Fetching page $PAGE..."
  RESPONSE=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/issues?state=open&labels=$LABELS_QUERY&per_page=100&page=$PAGE")

  if [[ "$(echo "$RESPONSE" | jq '. | length')" -eq 0 ]]; then
    echo "✅ No more issues to fetch."
    break
  fi

  ALL_ISSUES=$(echo "$ALL_ISSUES $RESPONSE" | jq -s 'add')
  ((PAGE++))
done

TOTAL_ISSUES=$(echo "$ALL_ISSUES" | jq '. | length')
echo "📊 Total Issues Fetched: $TOTAL_ISSUES"

if [[ "$TOTAL_ISSUES" -eq 0 ]]; then
  echo "⚠️ No issues found with the required labels."
  exit 0
fi

declare -A GROUPED_ISSUES

# Process each issue
mapfile -t ISSUES < <(echo "$ALL_ISSUES" | jq -c '.[]')

for issue in "${ISSUES[@]}"; do
  CREATED_AT=$(echo "$issue" | jq -r '.created_at')
  ISSUE_NUMBER=$(echo "$issue" | jq -r '.number')
  CREATED_DATE=$(date -d "$CREATED_AT" +"%Y-%m-%d" 2>/dev/null || date -u -jf "%Y-%m-%dT%H:%M:%SZ" "$CREATED_AT" +"%Y-%m-%d")
  CREATED_TIMESTAMP=$(date -d "$CREATED_AT" +%s 2>/dev/null || date -u -jf "%Y-%m-%dT%H:%M:%SZ" "$CREATED_AT" +%s)
  DAYS_OLD=$(( (CURRENT_TIMESTAMP - CREATED_TIMESTAMP) / 86400 ))
  WEEKS_OLD=$(( DAYS_OLD / 7 ))

  LABELS=$(echo "$issue" | jq -r '[.labels[].name] | join(", ")')

  # Determine impact level
  IMPACT_LEVEL=""
  for level in "${!LABEL_THRESHOLDS[@]}"; do
    if echo "$issue" | jq -e --arg level "$level" '.labels[].name | ascii_downcase | select(. == ($level | ascii_downcase))' > /dev/null; then
      IMPACT_LEVEL="$level"
      break
    fi
  done

  if [[ -z "$IMPACT_LEVEL" ]]; then
    echo "⚠️ Issue #$ISSUE_NUMBER has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping."
    continue
  fi

  IMPACT_SLA=${LABEL_THRESHOLDS[$IMPACT_LEVEL]}

  # Determine the appropriate SLA label
  NEW_SLA=""
  if (( WEEKS_OLD >= IMPACT_SLA )); then
    NEW_SLA="SLA Breach"
  elif (( WEEKS_OLD >= IMPACT_SLA - 1 )); then
    NEW_SLA="SLA P1"
  elif (( WEEKS_OLD >= IMPACT_SLA - 2 )); then
    NEW_SLA="SLA P2"
  elif (( WEEKS_OLD >= IMPACT_SLA - 3 )); then
    NEW_SLA="SLA P3"
  fi

  # Determine current SLA labels and which ones to remove
  CURRENT_SLA=""
  REMOVE_LABELS=()

  for sla_label in "${SLA_LABELS[@]}"; do
    if echo "$issue" | jq -e --arg label "$sla_label" '.labels[].name | select(. == $label)' > /dev/null; then
      CURRENT_SLA="$sla_label"
      REMOVE_LABELS+=("$sla_label")
    fi
  done

  if [[ "$NEW_SLA" != "$CURRENT_SLA" && -n "$NEW_SLA" ]]; then
    echo "🔄 Updating SLA label for Issue #$ISSUE_NUMBER: Removing [$CURRENT_SLA] → Adding [$NEW_SLA]"

    # Remove only SLA labels one-by-one
    for label in "${REMOVE_LABELS[@]}"; do
      echo "🚫 Removing label: $label from Issue #$ISSUE_NUMBER"
      curl -s -X DELETE -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/labels/$(echo "$label" | sed 's/ /%20/g')" > /dev/null
    done

    # Add new SLA label
    echo "➕ Adding new label: $NEW_SLA"
    curl -s -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/labels" \
      -d "{\"labels\":[\"$NEW_SLA\"]}" > /dev/null
  else
    echo "✅ Issue #$ISSUE_NUMBER already has correct SLA label: $NEW_SLA. No changes needed."
  fi

  # Group issues by SLA label
  GROUPED_ISSUES["$NEW_SLA"]+=$'\n'"Issue #$ISSUE_NUMBER - Created: $CREATED_DATE - Week #: $WEEKS_OLD - Labels: $LABELS"
done

# Print grouped issues summary
for sla in "${!GROUPED_ISSUES[@]}"; do
  echo -e "\n🔹 Group: $sla"
  echo -e "${GROUPED_ISSUES[$sla]}"
done