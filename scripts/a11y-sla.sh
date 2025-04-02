#!/bin/bash

set -e

        echo "🚀 Fetching open issues from GitHub API (handling pagination)..."

        # Define SLA Thresholds based on impact levels (weeks)
        declare -A LABEL_THRESHOLDS=( ["Blocker"]=4 ["Critical"]=10 ["Serious"]=20 ["Moderate"]=30 )

        # SLA Labels
        SLA_LABELS=("SLA P1" "SLA P2" "SLA P3" "SLA Breach")

        # Required labels for filtering
        REQUIRED_LABELS=("A11y" "VPAT")
        LABELS_QUERY=$(IFS=,; echo "${REQUIRED_LABELS[*]}")  # Convert to "A11y,VPAT"

        PAGE=1
        ALL_ISSUES="[]"
        CURRENT_TIMESTAMP=$(date -u +%s)

        # Fetch issues with pagination
        while :; do
          echo "🔄 Fetching page $PAGE..."
          RESPONSE=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" \
            -H "Accept: application/vnd.github.v3+json" \
            "https://api.github.com/repos/$GITHUB_REPOSITORY/issues?state=open&labels=$LABELS_QUERY&per_page=100&page=$PAGE")

          # Break if no more issues
          if [[ "$(echo "$RESPONSE" | jq '. | length')" -eq 0 ]]; then
            echo "✅ No more issues to fetch. Exiting loop."
            break
          fi

          # Merge response
          ALL_ISSUES=$(echo "$ALL_ISSUES $RESPONSE" | jq -s 'add')

          ((PAGE++))
        done

        # Get issue count
        TOTAL_ISSUES=$(echo "$ALL_ISSUES" | jq '. | length')
        echo "📊 Total Issues Fetched: $TOTAL_ISSUES"

        if [[ "$TOTAL_ISSUES" -eq 0 ]]; then
          echo "⚠️ No issues found with the required labels."
          exit 0
        fi

        declare -A GROUPED_ISSUES

        # Process issues
        mapfile -t ISSUES < <(echo "$ALL_ISSUES" | jq -c '.[]')

        for issue in "${ISSUES[@]}"; do
          CREATED_AT=$(echo "$issue" | jq -r '.created_at')
          ISSUE_NUMBER=$(echo "$issue" | jq -r '.number')

          # Convert date to readable format
          CREATED_DATE=$(date -d "$CREATED_AT" +"%Y-%m-%d" 2>/dev/null || date -u -jf "%Y-%m-%dT%H:%M:%SZ" "$CREATED_AT" +"%Y-%m-%d")

          # Calculate issue age in weeks
          CREATED_TIMESTAMP=$(date -d "$CREATED_AT" +%s 2>/dev/null || date -u -jf "%Y-%m-%dT%H:%M:%SZ" "$CREATED_AT" +%s)
          DAYS_OLD=$(( (CURRENT_TIMESTAMP - CREATED_TIMESTAMP) / 86400 ))
          WEEKS_OLD=$(( DAYS_OLD / 7 ))

          # Fetch issue labels
          LABELS=$(echo "$issue" | jq -r '[.labels[].name] | join(", ")')

          # Determine impact level
          IMPACT_LEVEL=""
          for level in "${!LABEL_THRESHOLDS[@]}"; do
            if [[ "$LABELS" == *"$level"* ]]; then
              IMPACT_LEVEL="$level"
              break
            fi
          done

          if [[ -z "$IMPACT_LEVEL" ]]; then
            echo "⚠️ Issue #$ISSUE_NUMBER has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping."
            continue
          fi

          # Define SLA thresholds based on impact
          IMPACT_SLA=${LABEL_THRESHOLDS[$IMPACT_LEVEL]}

          # Determine the correct SLA label
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

          # Check current SLA labels and store them in an array for removal
          CURRENT_SLA=""
          REMOVE_LABELS=()

          for sla_label in "${SLA_LABELS[@]}"; do
            if [[ "$LABELS" == *"$sla_label"* ]]; then
              CURRENT_SLA="$sla_label"
              REMOVE_LABELS+=("$sla_label")  # Store the label to remove later
            fi
          done

          # If SLA P1/P2/P3 exists and it's within range, skip adding SLA Breach
          if [[ "$NEW_SLA" == "SLA Breach" && "$CURRENT_SLA" != "" && "$CURRENT_SLA" != "SLA Breach" ]]; then
            echo "✅ Issue #$ISSUE_NUMBER is within SLA ($CURRENT_SLA). No breach applied."
            continue
          fi

          # If SLA needs updating, remove old SLA labels and apply the new one
          if [[ "$NEW_SLA" != "$CURRENT_SLA" ]]; then
            echo "🔄 Updating SLA label for Issue #$ISSUE_NUMBER: Removing [$CURRENT_SLA] → Adding [$NEW_SLA]"

            # Remove old SLA labels in one API call
            if [[ ${#REMOVE_LABELS[@]} -gt 0 ]]; then
              LABELS_JSON=$(printf '"%s",' "${REMOVE_LABELS[@]}" | sed 's/,$//')
              echo "🚫 Removing labels: ${REMOVE_LABELS[*]} from Issue #$ISSUE_NUMBER"
              curl -s -X DELETE -H "Authorization: Bearer $GITHUB_TOKEN" \
                   -H "Accept: application/vnd.github.v3+json" \
                   "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/labels" \
                   -d "{\"labels\":[$LABELS_JSON]}"
            fi

            # Add new SLA label
            curl -s -X POST -H "Authorization: Bearer $GITHUB_TOKEN" \
                 -H "Accept: application/vnd.github.v3+json" \
                 "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$ISSUE_NUMBER/labels" \
                 -d "{\"labels\":[\"$NEW_SLA\"]}"
          else
            echo "✅ Issue #$ISSUE_NUMBER already has correct SLA label: $NEW_SLA. No changes needed."
          fi

          # Group issues by SLA label
          GROUPED_ISSUES["$NEW_SLA"]+=$'\n'"Issue #$ISSUE_NUMBER - Created: $CREATED_DATE - Week #: $WEEKS_OLD - Labels: $LABELS"
        done

        # Print grouped issues
        for sla in "${!GROUPED_ISSUES[@]}"; do
          echo -e "\n🔹 Group: $sla"
          echo -e "${GROUPED_ISSUES[$sla]}"
        done
