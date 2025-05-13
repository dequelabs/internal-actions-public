#!/bin/bash

# Test suite for a11y-sla.sh

# --- Test Harness ---
ASSERT_COUNT=0
FAIL_COUNT=0

assert_equals() {
    # Usage: assert_equals "expected" "actual" "message"
    ((ASSERT_COUNT++))
    local expected="$1"
    local actual="$2"
    local message="$3"

    if [ "$expected" == "$actual" ]; then
        echo "✅ PASS: $message"
    else
        echo "❌ FAIL: $message"
        echo "   Expected: '$expected'"
        echo "   Actual:   '$actual'"
        ((FAIL_COUNT++))
    fi
}

assert_contains() {
    # Usage: assert_contains "string" "substring" "message"
    ((ASSERT_COUNT++))
    local string="$1"
    local substring="$2"
    local message="$3"

    if [[ "$string" == *"$substring"* ]]; then
        echo "✅ PASS: $message"
    else
        echo "❌ FAIL: $message"
        echo "   Full string (Actual):"
        echo "$string" # Print the full multi-line string
        echo "   Substring (Expected): '$substring'"
        ((FAIL_COUNT++))
    fi
}

report_summary() {
    echo
    echo "--- Test Summary ---"
    echo "Total Assertions: $ASSERT_COUNT"
    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo "🎉 All tests passed!"
    else
        echo "🔥 $FAIL_COUNT assertion(s) failed."
    fi
    echo
}

# --- Mocks ---
CURL_DELETE_CALLS=0
CURL_POST_CALLS=0
ORIGINAL_CURL_ARGS=""

reset_mock_states() {
    CURL_DELETE_CALLS=0
    CURL_POST_CALLS=0
    ORIGINAL_CURL_ARGS=""

    # Unset GITHUB API related vars
    unset GITHUB_TOKEN GITHUB_REPOSITORY

    # Unset variables used by the new curl mock
    unset MOCK_CURL_ISSUES_PAGE1_RESPONSE
    unset MOCK_CURL_ISSUES_PAGE2_RESPONSE # Add more pages if tests need them
    # Potentially MOCK_CURL_DELETE_RESPONSE_CODE, MOCK_CURL_POST_RESPONSE_CODE etc. if we make those configurable

    # Unset variables used by the date mock
    unset MOCK_CURRENT_TIMESTAMP_EPOCH
    unset MOCK_ISSUE_CREATED_AT MOCK_ISSUE_CREATED_AT_EPOCH MOCK_ISSUE_NUMBER
    
    # Unset legacy TEST_CASE_NAME if it was set (phasing out for curl)
    unset TEST_CASE_NAME 
}

# Mock for curl
# IMPORTANT: This function needs to be exported to be available in the subshell
curl() {
    ORIGINAL_CURL_ARGS="$*"
    local method_delete=false
    local method_post=false
    local url_issues_fetch=false
    local url_labels_modify=false

    local args_array=("$@")
    for i in "${!args_array[@]}"; do
        if [[ "${args_array[$i]}" == "-X" ]]; then
            local next_idx=$((i + 1))
            if [[ "${args_array[$next_idx]}" == "DELETE" ]]; then method_delete=true; fi
            if [[ "${args_array[$next_idx]}" == "POST" ]]; then method_post=true; fi
            break
        fi
    done
    
    local last_arg="${args_array[-1]}"
    # local second_last_arg="${args_array[-2]}"

    if [[ "$last_arg" == *"issues?state=open"* ]]; then
        url_issues_fetch=true
    # For POST to add labels, the URL is typically followed by -d "data"
    elif $method_post && [[ "${args_array[-2]}" == "-d" && "${args_array[-3]}" == *"issues/"*"/labels" && "${args_array[-3]}" != *"/labels/"* ]]; then 
        # Ensures it's POST to .../issues/123/labels and not .../issues/123/labels/some-label (which isn't used for POST by script)
        url_labels_modify=true
    # For DELETE, URL is the last argument and contains /labels/name
    elif $method_delete && [[ "$last_arg" == *"issues/"*"/labels/"* ]]; then
        url_labels_modify=true
    fi

    if $url_issues_fetch; then
        local page_num="1" # Default to page 1
        # Extract page number: ...&page=N
        # More robust page number extraction
        if [[ "$last_arg" == *'&page='* ]]; then
            local page_part="${last_arg##*&page=}" # Get part after &page=
            # Remove any subsequent query params if present (e.g., &foo=bar)
            page_part="${page_part%%&*}" 
            if [[ "$page_part" =~ ^[0-9]+$ ]]; then # Check if it's numeric
                 page_num="$page_part"
            fi
        fi
        
        local response_var_name="MOCK_CURL_ISSUES_PAGE${page_num}_RESPONSE"

        if [[ -n "${!response_var_name}" ]]; then # Check if the dynamic variable is set
            echo "${!response_var_name}"
        else
            echo "[]" # Default to empty array if specific page response not set
        fi
        return 0
    elif $method_delete && $url_labels_modify; then
        ((CURL_DELETE_CALLS++))
        return 0 # GitHub API returns 204 on success for DELETE
    elif $method_post && $url_labels_modify; then
        ((CURL_POST_CALLS++))
        return 0 # GitHub API returns 200 or 201 on success for POST
    fi

    echo "[Mock curl UNHANDLED call]: $ORIGINAL_CURL_ARGS" >&2
    return 1
}

# Mock for date (remains largely the same, driven by MOCK_* env vars)
# IMPORTANT: This function needs to be exported
date() {
    local original_args=("$@") 
    if [[ "${#original_args[@]}" -eq 2 && "${original_args[0]}" == "-u" && "${original_args[1]}" == "+%s" ]]; then
        echo "$MOCK_CURRENT_TIMESTAMP_EPOCH"
        return 0
    fi
    if [[ -n "$MOCK_ISSUE_CREATED_AT" ]]; then
        if [[ "${#original_args[@]}" -eq 3 && "${original_args[0]}" == "-d" && "${original_args[1]}" == "$MOCK_ISSUE_CREATED_AT" && "${original_args[2]}" == "+%s" ]]; then
            echo "$MOCK_ISSUE_CREATED_AT_EPOCH"
            return 0
        fi
        if [[ "${#original_args[@]}" -eq 6 && \
              "${original_args[0]}" == "-u" && \
              "${original_args[1]}" == "-jf" && \
              "${original_args[2]}" == "%Y-%m-%dT%H:%M:%SZ" && \
              "${original_args[3]}" == "$MOCK_ISSUE_CREATED_AT" && \
              "${original_args[4]}" == "+%s" ]]; then
             echo "$MOCK_ISSUE_CREATED_AT_EPOCH"
             return 0
        fi
         if [[ "${#original_args[@]}" -eq 3 && "${original_args[0]}" == "-d" && "${original_args[1]}" == "$MOCK_ISSUE_CREATED_AT" && "${original_args[2]}" == "+%Y-%m-%d" ]]; then
            echo "${MOCK_ISSUE_CREATED_AT%%T*}"
            return 0
        fi
        if [[ "${#original_args[@]}" -eq 6 && \
              "${original_args[0]}" == "-u" && \
              "${original_args[1]}" == "-jf" && \
              "${original_args[2]}" == "%Y-%m-%dT%H:%M:%SZ" && \
              "${original_args[3]}" == "$MOCK_ISSUE_CREATED_AT" && \
              "${original_args[4]}" == "+%Y-%m-%d" ]]; then
             echo "${MOCK_ISSUE_CREATED_AT%%T*}"
             return 0
        fi
    fi
    echo "[Mock date UNHANDLED]: ${original_args[@]}. MOCK_ISSUE_CREATED_AT='$MOCK_ISSUE_CREATED_AT'" >&2
    command date "${original_args[@]}" # Restore fallback
    return $? # Return actual command's exit code
}

--- Test Cases ---
test_no_issues_found() {
    echo
    echo "Running test: test_no_issues_found..."
    reset_mock_states
    export GITHUB_TOKEN="test_token"
    export GITHUB_REPOSITORY="test_owner/test_repo"
    # Configure curl mock: Page 1 returns [], subsequent pages will also default to []
    export MOCK_CURL_ISSUES_PAGE1_RESPONSE="[]"

    export -f curl # Date mock not strictly needed as script exits early

    output=$(bash .github/actions/a11y-sla-breach-labels/scripts/a11y-sla.sh 2>&1)
    exit_code=$?

    assert_contains "$output" "Total Issues Fetched: 0" "Output contains 'Total Issues Fetched: 0'"
    assert_contains "$output" "No issues found with the required labels." "Output contains 'No issues found with the required labels.'"
    assert_equals "0" "$exit_code" "Script exits with status 0"
    assert_equals "0" "$CURL_DELETE_CALLS" "No curl DELETE calls made"
    assert_equals "0" "$CURL_POST_CALLS" "No curl POST calls made"

    echo "Finished test: test_no_issues_found."
}

test_issue_no_impact_label() {
    echo
    echo "Running test: test_issue_no_impact_label..."
    reset_mock_states
    export GITHUB_TOKEN="test_token"
    export GITHUB_REPOSITORY="test_owner/test_repo"
    
    # Date mock config
    export MOCK_ISSUE_NUMBER="789"
    export MOCK_ISSUE_CREATED_AT="2023-01-01T00:00:00Z"
    export MOCK_ISSUE_CREATED_AT_EPOCH="1672531200"
    export MOCK_CURRENT_TIMESTAMP_EPOCH="1673740800" # Jan 15 2023

    # Curl mock config: Page 1 returns one issue, Page 2 (and others) will default to []
    export MOCK_CURL_ISSUES_PAGE1_RESPONSE='[{"number": '${MOCK_ISSUE_NUMBER}', "created_at": "'${MOCK_ISSUE_CREATED_AT}'", "labels": [{"name": "A11y"}, {"name": "VPAT"}]}]'
    # MOCK_CURL_ISSUES_PAGE2_RESPONSE is implicitly "[]" by the new curl mock logic

    export -f curl
    export -f date

    output=$(bash .github/actions/a11y-sla-breach-labels/scripts/a11y-sla.sh 2>&1)
    exit_code=$?

    assert_contains "$output" "Issue #$MOCK_ISSUE_NUMBER has no recognized impact level (Blocker, Critical, Serious, Moderate). Skipping." "Output skips issue with no impact label"
    assert_equals "0" "$exit_code" "Script exits with status 0"
    assert_equals "0" "$CURL_DELETE_CALLS" "No curl DELETE calls made for no impact label"
    assert_equals "0" "$CURL_POST_CALLS" "No curl POST calls made for no impact label"
    assert_contains "$output" "Total Issues Fetched: 1" "Output contains 'Total Issues Fetched: 1'"

    echo "Finished test: test_issue_no_impact_label."
}

test_issue_new_no_sla() {
    echo
    echo "Running test: test_issue_new_no_sla..."
    reset_mock_states
    export GITHUB_TOKEN="test_token"
    export GITHUB_REPOSITORY="test_owner/test_repo"
    
    # Date mock config: Issue created 1 day ago (0 weeks old)
    export MOCK_ISSUE_NUMBER="456"
    export MOCK_ISSUE_CREATED_AT="2023-01-14T00:00:00Z" 
    export MOCK_ISSUE_CREATED_AT_EPOCH="1673654400" # Epoch for 2023-01-14T00:00:00Z
    export MOCK_CURRENT_TIMESTAMP_EPOCH="1673740800" # Epoch for 2023-01-15T00:00:00Z

    # Curl mock config: Page 1 returns one new issue with a Blocker label
    # Labels: A11y, VPAT, Blocker
    export MOCK_CURL_ISSUES_PAGE1_RESPONSE='[{"number": '${MOCK_ISSUE_NUMBER}', "created_at": "'${MOCK_ISSUE_CREATED_AT}'", "labels": [{"name": "A11y"}, {"name": "VPAT"}, {"name": "Blocker"}]}]'
    # Page 2+ defaults to []

    export -f curl
    export -f date

    output=$(bash .github/actions/a11y-sla-breach-labels/scripts/a11y-sla.sh 2>&1)
    exit_code=$?

    assert_contains "$output" "Total Issues Fetched: 1" "Output contains 'Total Issues Fetched: 1'"
    # Expecting message like: ✅ Issue #456 already has correct SLA label: . No changes needed.
    # The script outputs this when NEW_SLA is empty and CURRENT_SLA is also empty.
    assert_contains "$output" "Issue #$MOCK_ISSUE_NUMBER already has correct SLA label: . No changes needed." "Output shows no changes needed for new issue"
    assert_equals "0" "$exit_code" "Script exits with status 0"
    assert_equals "0" "$CURL_DELETE_CALLS" "No curl DELETE calls made for new issue"
    assert_equals "0" "$CURL_POST_CALLS" "No curl POST calls made for new issue"
    
    echo "Finished test: test_issue_new_no_sla."
}

test_issue_gets_sla_p3() {
    echo
    echo "Running test: test_issue_gets_sla_p3..."
    reset_mock_states
    export GITHUB_TOKEN="test_token"
    export GITHUB_REPOSITORY="test_owner/test_repo"
    
    # Date mock config: Critical issue (10w SLA defined in a11y-sla.sh), created 7 weeks ago
    export MOCK_ISSUE_NUMBER="101"
    export MOCK_ISSUE_CREATED_AT="2023-01-01T00:00:00Z" 
    export MOCK_ISSUE_CREATED_AT_EPOCH="1672531200" # Epoch for 2023-01-01T00:00:00Z
    # Current time = 7 weeks (49 days) later. 1672531200 + (49 * 86400) = 1672531200 + 4233600 = 1676764800
    export MOCK_CURRENT_TIMESTAMP_EPOCH="1676764800" # Epoch for 2023-02-19T00:00:00Z

    # Curl mock config: Page 1 returns one issue needing P3
    # Labels: A11y, VPAT, Critical. No pre-existing SLA labels.
    export MOCK_CURL_ISSUES_PAGE1_RESPONSE='[{"number": '${MOCK_ISSUE_NUMBER}', "created_at": "'${MOCK_ISSUE_CREATED_AT}'", "labels": [{"name": "A11y"}, {"name": "VPAT"}, {"name": "Critical"}]}]'
    # MOCK_CURL_ISSUES_PAGE2_RESPONSE defaults to []
    
    export -f curl
    export -f date

    output=$(bash .github/actions/a11y-sla-breach-labels/scripts/a11y-sla.sh 2>&1)
    exit_code=$?

    echo "Output: $output"
    assert_contains "$output" "Total Issues Fetched: 1" "Output contains 'Total Issues Fetched: 1'"
    # Expecting message like: 🔄 Updating SLA label for Issue #101: Removing [] → Adding [SLA P3]
    assert_contains "$output" "Updating SLA label for Issue #$MOCK_ISSUE_NUMBER: Removing [] → Adding [SLA P3]" "Output shows SLA P3 being added"
    assert_equals "0" "$exit_code" "Script exits with status 0"
    assert_equals "0" "$CURL_DELETE_CALLS" "No curl DELETE calls made for P3 add"
    assert_equals "1" "$CURL_POST_CALLS" "One curl POST call made for P3 add"
    
    echo "Finished test: test_issue_gets_sla_p3."
}

# --- Run Tests ---
# Ensure script is executable: chmod +x a11y-sla.test.sh
# To run: ./a11y-sla.test.sh

# Call tests
test_no_issues_found
test_issue_no_impact_label
test_issue_new_no_sla
# test_issue_gets_sla_p3

# Final summary and exit
report_summary
if [ "$FAIL_COUNT" -eq 0 ]; then
    exit 0
else
    exit 1
fi 