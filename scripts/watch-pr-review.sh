#!/usr/bin/env bash
set -euo pipefail

PR="${PR:-33}"
REPO="${REPO:-VanessaLin9/trackvest-api}"
INTERVAL_SEC="${INTERVAL_SEC:-360}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${LOG_FILE:-${SCRIPT_DIR}/../.cursor/pr-review-watcher.log}"

log() {
  local line="[$(date '+%Y-%m-%d %H:%M:%S %Z')] $*"
  echo "$line"
  mkdir -p "$(dirname "$LOG_FILE")"
  echo "$line" >>"$LOG_FILE"
}

emit_tick() {
  local json="$1"
  log "$json"
}

check_pr_review() {
  local comments meta task ready_at after passed changes

  log "PR review watcher: checking PR #${PR} (repo=${REPO})..."
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
    emit_tick "AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR}: no READY_FOR_REVIEW marker found.\",\"status\":\"no_marker\",\"pr\":${PR}}"
    log "PR #${PR}: no READY_FOR_REVIEW marker found."
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
    emit_tick "AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR} received REVIEW_PASSED for task=${task}: ${passed}. Stop loop and proceed to next task.\",\"status\":\"REVIEW_PASSED\",\"pr\":${PR},\"task\":${task}}"
    log "PR #${PR} task=${task}: REVIEW_PASSED — stopping watcher."
    return 0
  fi

  if [ -n "$changes" ]; then
    emit_tick "AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR} received CHANGES_REQUESTED for task=${task}. Stop loop, fix, re-post READY_FOR_REVIEW, restart loop.\",\"status\":\"CHANGES_REQUESTED\",\"pr\":${PR},\"task\":${task}}"
    log "PR #${PR} task=${task}: CHANGES_REQUESTED — stopping watcher."
    return 0
  fi

  emit_tick "AGENT_LOOP_TICK_PR_REVIEW {\"prompt\":\"PR #${PR} task=${task}: waiting for reviewer after latest READY_FOR_REVIEW.\",\"status\":\"waiting\",\"pr\":${PR},\"task\":${task}}"
  log "PR #${PR} task=${task}: still waiting for reviewer."
  return 1
}

if [ "${1:-loop}" = "once" ]; then
  check_pr_review || true
  exit 0
fi

log "PR review watcher started (PR #${PR}, interval=${INTERVAL_SEC}s, log=${LOG_FILE})"

while true; do
  if check_pr_review; then
    exit 0
  fi
  log "PR review watcher: sleeping ${INTERVAL_SEC}s before next check..."
  sleep "$INTERVAL_SEC"
done
