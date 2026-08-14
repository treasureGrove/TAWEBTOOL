#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="$SITE/logs"
RUN_LOG="$LOG_DIR/wiki_collect.last.log"
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

status=0
/usr/local/bin/node scripts/wiki_collect.mjs > "$RUN_LOG" 2>&1 || status=$?

if command -v chown >/dev/null 2>&1 && [ -f data/ta_wiki_entries.json ]; then
  chown www:www data/ta_wiki_entries.json 2>/dev/null || true
  if [ -d data/wiki_images ]; then
    chown -R www:www data/wiki_images 2>/dev/null || true
  fi
fi

if [ -n "${WIKI_NOTIFY_EMAIL:-}" ] && command -v mail >/dev/null 2>&1; then
  if [ "$status" -eq 0 ]; then
    subject="[TAWiki] update completed $(date '+%F %T')"
  else
    subject="[TAWiki] update failed $(date '+%F %T')"
  fi
  {
    echo "Site: $SITE"
    echo "Status: $status"
    echo
    tail -120 "$RUN_LOG"
  } | mail -s "$subject" "$WIKI_NOTIFY_EMAIL" || true
fi

cat "$RUN_LOG"
exit "$status"
