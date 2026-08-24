#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
URLS_FILE="$SCRIPT_DIR/baidu_urls.txt"
STATE_FILE="$SCRIPT_DIR/.baidu_push_state"
LOG_DIR="$SITE/logs"
LOG_FILE="$LOG_DIR/baidu_push.last.log"
EMAIL_FILE="$LOG_DIR/baidu_push_email.last.txt"
NOTIFY_EMAIL="${BAIDU_NOTIFY_EMAIL:-1324236706@qq.com}"
SITE_URL="https://tools.treasuregrove.art"
TOKEN="0bHdakIihDkeN4p2"
MAX_PUSH="${BAIDU_MAX_PUSH:-10}"   # 百度普通收录日配额

mkdir -p "$LOG_DIR"

if [ ! -f "$URLS_FILE" ]; then
  echo "[$(date '+%F %T')] ERROR: urls file not found" | tee -a "$LOG_FILE"
  exit 1
fi

mapfile -t ALL_URLS < <(grep -vE '^[[:space:]]*$' "$URLS_FILE")
TOTAL=${#ALL_URLS[@]}
[ "$TOTAL" -gt 0 ] || { echo "[$(date '+%F %T')] ERROR: empty urls file" >> "$LOG_FILE"; exit 1; }

IDX=0
[ -f "$STATE_FILE" ] && IDX=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
IDX=$(( IDX % TOTAL ))

PUSH_URLS=()
for ((i=0; i<MAX_PUSH && i<TOTAL; i++)); do
  PUSH_URLS+=("${ALL_URLS[$(( (IDX + i) % TOTAL ))]}")
done
printf '%s\n' "${PUSH_URLS[@]}" > /tmp/baidu_push_batch.txt

RESPONSE="$(curl -s -H 'Content-Type:text/plain' --data-binary @/tmp/baidu_push_batch.txt \
  "http://data.zz.baidu.com/urls?site=${SITE_URL}&token=${TOKEN}" 2>&1 || true)"

echo "[$(date '+%F %T')] push ${#PUSH_URLS[@]}/${TOTAL} (从 $IDX): $RESPONSE" >> "$LOG_FILE"

SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',0))" 2>/dev/null || echo "0")
REMAIN=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('remain','?'))" 2>/dev/null || echo "?")
MSG=$(echo "$RESPONSE" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('message',d.get('error','')))" 2>/dev/null || echo "$RESPONSE")

if [ "$SUCCESS" -gt 0 ] 2>/dev/null; then
  echo $(( (IDX + MAX_PUSH) % TOTAL )) > "$STATE_FILE"
  SUBJECT="[百度推送成功] ${SUCCESS} 条 (剩余配额 ${REMAIN}) - $(date '+%F %T')"
else
  SUBJECT="[百度推送跳过] ${MSG} - $(date '+%F %T')"
fi

cat > "$EMAIL_FILE" <<EOM
百度资源推送报告 ($(date '+%F %T'))
站点: $SITE_URL
本次: ${#PUSH_URLS[@]}/${TOTAL} 条 (轮转起始 $IDX)
成功: $SUCCESS  剩余配额: $REMAIN
消息: $MSG
EOM

if command -v mail >/dev/null 2>&1; then
  mail -s "$SUBJECT" "$NOTIFY_EMAIL" < "$EMAIL_FILE" || true
fi
rm -f /tmp/baidu_push_batch.txt
echo "[$(date '+%F %T')] Done." >> "$LOG_FILE"
