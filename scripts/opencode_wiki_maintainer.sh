#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$SITE/logs"
RUN_ID="$(date '+%Y%m%d-%H%M%S')"
COLLECT_LOG="$LOG_DIR/wiki_collect.last.log"
COLLECT_STDOUT="$LOG_DIR/wiki_collect.stdout.last.log"
OPEN_CODE_LOG="$LOG_DIR/opencode_wiki_maintainer.last.log"
OPEN_CODE_CLEAN="$LOG_DIR/opencode_wiki_maintainer.clean.last.log"
EMAIL_DIGEST="$LOG_DIR/wiki_email_digest.last.md"
REPORT="$LOG_DIR/wiki_maintainer_report.last.md"
mkdir -p "$LOG_DIR"
cd "$SITE"

if [ -f /etc/profile ]; then set +u; source /etc/profile >/dev/null 2>&1 || true; set -u; fi
if [ -f /root/.bashrc ]; then set +u; source /root/.bashrc >/dev/null 2>&1 || true; set -u; fi
if [ -f "$SITE/.env" ]; then set -a; source "$SITE/.env"; set +a; fi
if [ -z "${DEEPSEEK_API_KEY:-}" ] && [ -z "${WIKI_AI_API_KEY:-}" ] && [ -f /root/.local/share/opencode/auth.json ]; then
  DEEPSEEK_API_KEY="$(node -e 'const fs=require("fs"); const p="/root/.local/share/opencode/auth.json"; const a=JSON.parse(fs.readFileSync(p,"utf8")); process.stdout.write((a.deepseek&&a.deepseek.key)||"");' 2>/dev/null || true)"
  export DEEPSEEK_API_KEY
fi

export WIKI_AI_MODEL="${WIKI_AI_MODEL:-deepseek-v4-flash}"
export WIKI_AI_FILTER="${WIKI_AI_FILTER:-1}"
export WIKI_MIN_RELEVANCE_SCORE="${WIKI_MIN_RELEVANCE_SCORE:-5}"
export WIKI_AI_MAX_ENTRIES="${WIKI_AI_MAX_ENTRIES:-20}"
export WIKI_NOTIFY_EMAIL="${WIKI_NOTIFY_EMAIL:-1324236706@qq.com}"

sync_git_after_update() {
  if ! command -v git >/dev/null 2>&1 || [ ! -d "$SITE/.git" ]; then
    echo "- Git sync: skipped, git repository not found"
    return 0
  fi

  git config user.name "${GIT_AUTHOR_NAME:-treasure-grove}" >/dev/null
  git config user.email "${GIT_AUTHOR_EMAIL:-1324236706@qq.com}" >/dev/null

  if git remote get-url origin >/dev/null 2>&1; then
    git pull --rebase --autostash origin "$(git branch --show-current)" || {
      echo "- Git sync: pull --rebase failed"
      return 1
    }
  fi

  git add \
    .gitignore \
    css/TA_wiki.css \
    data/ta_wiki_entries.json \
    data/wiki_sources.json \
    data/wiki_memory.json \
    data/wiki_images \
    js/ta_wiki.js \
    scripts/wiki_collect.mjs \
    scripts/wiki_email_digest.mjs \
    scripts/run_wiki_collect.sh \
    scripts/opencode_wiki_maintainer.sh \
    tools_html/TA_wiki.html

  if git diff --cached --quiet; then
    echo "- Git sync: no changes"
    return 0
  fi

  git commit -m "自动更新 TA Wiki 知识库 $(date '+%F %T')" || {
    echo "- Git sync: commit failed"
    return 1
  }

  if git remote get-url origin >/dev/null 2>&1; then
    git push origin "$(git branch --show-current)" || {
      echo "- Git sync: push failed"
      return 1
    }
  fi

  echo "- Git sync: committed and pushed"
}

if [ -f data/ta_wiki_entries.json ]; then
  cp data/ta_wiki_entries.json "$LOG_DIR/ta_wiki_entries.before.json"
else
  printf '[]\n' > "$LOG_DIR/ta_wiki_entries.before.json"
fi

status=0
WIKI_NOTIFY_EMAIL="" "$SCRIPT_DIR/run_wiki_collect.sh" > "$COLLECT_STDOUT" 2>&1 || status=$?

digest_status=0
/usr/local/bin/node scripts/wiki_email_digest.mjs > "$EMAIL_DIGEST" 2>&1 || digest_status=$?

{
  echo "# TA Wiki Maintainer Report"
  echo
  echo "- Run ID: $RUN_ID"
  echo "- Site: $SITE"
  echo "- Collect status: $status"
  echo "- Mail digest status: $digest_status"
  echo "- Time: $(date '+%F %T %z')"
  echo
  echo "## Chinese Mail Digest"
  cat "$EMAIL_DIGEST" || true
  echo
  echo "## Collector Output"
  echo '```text'
  tail -160 "$COLLECT_LOG" || true
  echo '```'
} > "$REPORT"

opencode_status=0
if command -v opencode >/dev/null 2>&1; then
  prompt="You are maintaining the TA Wiki in this project. Read data/ta_wiki_entries.json, data/wiki_sources.json, data/wiki_memory.json if present, and the latest collector log at logs/wiki_collect.last.log. Do not edit files in this scheduled run. Output only a concise maintenance note in Simplified Chinese Markdown covering: 1) newly collected useful graphics knowledge, 2) rejected or weak content patterns if visible, 3) whether the wiki page needs UI/framework improvements later, 4) next actions. Keep it practical for a technical artist."
  if command -v script >/dev/null 2>&1; then
    timeout 180s script -q -e -c "opencode run \"$prompt\" --auto -m deepseek/deepseek-v4-flash --dir \"$SITE\"" "$OPEN_CODE_LOG" >/dev/null 2>&1 || opencode_status=$?
  else
    timeout 180s opencode run "$prompt" --auto -m "deepseek/deepseek-v4-flash" --dir "$SITE" > "$OPEN_CODE_LOG" 2>&1 || opencode_status=$?
  fi
  perl -pe 's/\e\[[0-9;?]*[ -\/]*[@-~]//g' "$OPEN_CODE_LOG" | grep -v '^Script started' | grep -v '^Script done' > "$OPEN_CODE_CLEAN" || true
  {
    echo
    echo "## OpenCode AI Note"
    cat "$OPEN_CODE_CLEAN" || true
  } >> "$REPORT"
else
  opencode_status=127
  {
    echo
    echo "## OpenCode AI Note"
    echo "opencode command was not found."
  } >> "$REPORT"
fi

{
  echo
  echo "## Status"
  echo "- OpenCode status: $opencode_status"
} >> "$REPORT"

git_status=0
if [ "$status" -eq 0 ] && [ "$digest_status" -eq 0 ] && [ "$opencode_status" -eq 0 ]; then
  {
    echo
    echo "## Git Sync"
    sync_git_after_update
  } >> "$REPORT" 2>&1 || git_status=$?
else
  git_status=1
  {
    echo
    echo "## Git Sync"
    echo "- Git sync: skipped because update did not fully succeed"
  } >> "$REPORT"
fi

if command -v chown >/dev/null 2>&1; then
  chown -R www:www "$LOG_DIR" 2>/dev/null || true
  chown www:www data/ta_wiki_entries.json 2>/dev/null || true
fi

if [ -n "${WIKI_NOTIFY_EMAIL:-}" ] && command -v mail >/dev/null 2>&1; then
  if [ "$status" -eq 0 ] && [ "$digest_status" -eq 0 ] && [ "$opencode_status" -eq 0 ] && [ "$git_status" -eq 0 ]; then
    subject="TA Wiki 自动更新报告 $(date '+%F %T')"
  else
    subject="TA Wiki 自动更新需要检查 $(date '+%F %T')"
  fi
  mail -s "$subject" "$WIKI_NOTIFY_EMAIL" < "$EMAIL_DIGEST" || true
fi

cat "$REPORT"
if [ "$status" -ne 0 ]; then exit "$status"; fi
if [ "$digest_status" -ne 0 ]; then exit "$digest_status"; fi
if [ "$git_status" -ne 0 ]; then exit "$git_status"; fi
exit "$opencode_status"
