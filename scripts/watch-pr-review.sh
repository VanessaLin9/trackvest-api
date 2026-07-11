#!/usr/bin/env bash
set -euo pipefail

PR="${PR:-33}"
REPO="${REPO:-VanessaLin9/trackvest-api}"
INTERVAL_SEC="${INTERVAL_SEC:-360}"

check_pr_review() {
  local comments meta task ready_at after passed changes

  comments=$(gh api "repos/${REPO}/issues/${PR}/comments")
  meta=$(echo "$comments" | jq '
    ([.[] | select(.body | split("\n")[0] | startswith("READY_FOR_REVIEW task="))] | last) as $ready |
    if $ready == null then {task: null, readyAt: null}
    else {
      task: ($ready.body | split("\n")[0] | capture("READY_FOR_REVIEW task=(?<task>[0-9]+)").task),
      readyAt: $ready.created_at
    } end
  ')
  task=$(echo "$meta" | jq -r '.task // empty')
  ready_at=$(echo "$meta" | jq -r '.readyAt // empty')

  if [ -z "$task" ] || [ -z "$ready_at" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR}: no READY_FOR_REVIEW marker found.\",\"status\":\"no_marker\",\"pr\":${PR}}"
    return 1
  fi

  after=$(echo "$comments" | jq --arg readyAt "$ready_at" --arg task "$task" '
    [.[] | select(.created_at > $readyAt)] |
    map(.body | split("\n")[0]) |
    map(select(test("^REVIEW_PASSED task=" + $task + "\\b") or test("^CHANGES_REQUESTED task=" + $task + "\\b")))
  ')
  passed=$(echo "$after" | jq -r --arg task "$task" '[.[] | select(test("^REVIEW_PASSED task=" + $task + "\\b"))] | last // empty')
  changes=$(echo "$after" | jq -r --arg task "$task" '[.[] | select(test("^CHANGES_REQUESTED task=" + $task + "\\b"))] | last // empty')

  if [ -n "$passed" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR} received REVIEW_PASSED for task=${task}: ${passed}. Stop loop and proceed to next task.\",\"status\":\"REVIEW_PASSED\",\"pr\":${PR},\"task\":${task}}"
    return 0
  fi

  if [ -n "$changes" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR} received CHANGES_REQUESTED for task=${task}. Stop loop, fix, re-post READY_FOR_REVIEW, restart loop.\",\"status\":\"CHANGES_REQUESTED\",\"pr\":${PR},\"task\":${task}}"
    return 0
  fi

  echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR} task=${task}: waiting for reviewer after latest READY_FOR_REVIEW.\",\"status\":\"waiting\",\"pr\":${PR},\"task\":${task}}"
  return 1
}

if [ "${1:-loop}" = "once" ]; then
  check_pr_review || true
  exit 0
fi

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S %Z')] PR review watcher: sleeping ${INTERVAL_SEC}s before next check (PR #${PR})..."
  sleep "$INTERVAL_SEC"
  if check_pr_review; then
    exit 0
  fi
done
