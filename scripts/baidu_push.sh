#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
URLS_FILE="$SCRIPT_DIR/baidu_urls.txt"
LOG_DIR="$SITE/logs"
LOG_FILE="$LOG_DIR/baidu_push.last.log"
EMAIL_FILE="$LOG_DIR/baidu_push_email.last.txt"
NOTIFY_EMAIL="${BAIDU_NOTIFY_EMAIL:-1324236706@qq.com}"
SITE_URL="https://tools.treasuregrove.art"
TOKEN="0bHdakIihDkeN4p2"

mkdir -p "$LOG_DIR"

if [ ! -f "$URLS_FILE" ]; then
  echo "[$(date '+%F %T')] ERROR: urls file not found: $URLS_FILE" | tee -a "$LOG_FILE"
  exit 1
fi

RESPONSE="$(curl -s -H 'Content-Type:text/plain' --data-binary @"$URLS_FILE" \
  "http://data.zz.baidu.com/urls?site=${SITE_URL}&token=${TOKEN}" 2>&1)"

echo "[$(date '+%F %T')] Push result: $RESPONSE" >> "$LOG_FILE"

SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',0))" 2>/dev/null || echo "0")
REMAIN=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('remain','?'))" 2>/dev/null || echo "?")
ERROR_MSG=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','')); print(d.get('error',''))" 2>/dev/null || echo "$RESPONSE")

if [ "$SUCCESS" -gt 0 ] 2>/dev/null; then
  SUBJECT="[百度推送成功] 成功推送 ${SUCCESS} 条URL - $(date '+%F %T')"
else
  SUBJECT="[百度推送失败] 需要检查 - $(date '+%F %T')"
fi

cat > "$EMAIL_FILE" <<EOF
百度资源推送报告 ($(date '+%F %T'))
================================
站点: $SITE_URL
推送URL数: $(wc -l < "$URLS_FILE")
成功: $SUCCESS
剩余配额: $REMAIN
错误信息: $ERROR_MSG

推送的URL列表:
EOF
cat "$URLS_FILE" >> "$EMAIL_FILE"

if command -v mail >/dev/null 2>&1; then
  mail -s "$SUBJECT" "$NOTIFY_EMAIL" < "$EMAIL_FILE" || true
fi

echo "[$(date '+%F %T')] Done. email sent to $NOTIFY_EMAIL" >> "$LOG_FILE"
