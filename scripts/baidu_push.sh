#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$(cd "$SCRIPT_DIR/.." && pwd)"
URLS_FILE="$SCRIPT_DIR/baidu_urls.txt"
LOG_DIR="$SITE/logs"
LOG_FILE="$LOG_DIR/baidu_push.last.log"
EMAIL_FILE="$LOG_DIR/baidu_push_email.last.txt"
# 轮转进度必须放在 logs/ 里：服务器部署 cron 会执行 `git clean -fd`，
# 放在仓库目录下的未跟踪状态文件会被每次部署删掉，导致每天都从第 0 条重新推。
STATE_FILE="${BAIDU_STATE_FILE:-$LOG_DIR/baidu_push.state}"
NOTIFY_EMAIL="${BAIDU_NOTIFY_EMAIL:-1324236706@qq.com}"
SITE_URL="https://tools.treasuregrove.art"
TOKEN="0bHdakIihDkeN4p2"
MAX_PUSH="${BAIDU_MAX_PUSH:-10}"   # 百度普通收录日配额
# 可用 BAIDU_PUSH_ENDPOINT 指向 mock 服务做轮转自测（默认百度正式接口）
PUSH_API="${BAIDU_PUSH_ENDPOINT:-http://data.zz.baidu.com/urls?site=${SITE_URL}&token=${TOKEN}}"

mkdir -p "$LOG_DIR"
# Serialize sync + cursor + request to avoid concurrent duplicate batches.
exec 9>"$LOG_DIR/baidu_push.lock"
flock -n 9 || exit 0
python3 "$SCRIPT_DIR/check_search_index.py" --sync
[[ "$MAX_PUSH" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid BAIDU_MAX_PUSH'; exit 1; }
(( MAX_PUSH <= 10 )) || MAX_PUSH=10
BATCH_FILE=$(mktemp "$LOG_DIR/baidu_batch.XXXXXX")
trap 'rm -f "$BATCH_FILE"' EXIT

if [ ! -f "$URLS_FILE" ]; then
  echo "[$(date '+%F %T')] ERROR: urls file not found" | tee -a "$LOG_FILE"
  exit 1
fi

mapfile -t ALL_URLS < <(grep -vE '^[[:space:]]*$' "$URLS_FILE")
TOTAL=${#ALL_URLS[@]}
[ "$TOTAL" -gt 0 ] || { echo "[$(date '+%F %T')] ERROR: empty urls file" >> "$LOG_FILE"; exit 1; }

IDX=0
[ -f "$STATE_FILE" ] && IDX=$(cat "$STATE_FILE" 2>/dev/null || echo 0)
[[ "$IDX" =~ ^[0-9]+$ ]] || { echo 'Invalid Baidu cursor'; exit 1; }
IDX=$(( IDX % TOTAL ))

# Persist attempted URLs before sending: reruns/timeouts must not exceed 10/day.
# Separate from legacy integer cursor; never reset that cursor on list changes.
BUDGET_FILE="$LOG_DIR/baidu_push.$(date '+%F').attempted"
USED=0
[ ! -f "$BUDGET_FILE" ] || USED=$(cat "$BUDGET_FILE")
[[ "$USED" =~ ^[0-9]+$ ]] || exit 1
(( USED < 10 )) || exit 0
(( MAX_PUSH <= 10 - USED )) || MAX_PUSH=$((10 - USED))
PUSH_URLS=()
for ((i=0; i<MAX_PUSH && i<TOTAL; i++)); do
  PUSH_URLS+=("${ALL_URLS[$(( (IDX + i) % TOTAL ))]}")
done
printf '%s\n' "${PUSH_URLS[@]}" > "$BATCH_FILE"

echo $((USED + ${#PUSH_URLS[@]})) > "$BUDGET_FILE.tmp"
mv "$BUDGET_FILE.tmp" "$BUDGET_FILE"
RESPONSE="$(curl -s -H 'Content-Type:text/plain' --data-binary @"$BATCH_FILE" \
  "$PUSH_API" 2>&1 || true)"

echo "[$(date '+%F %T')] push ${#PUSH_URLS[@]}/${TOTAL} (从 $IDX): $RESPONSE" >> "$LOG_FILE"

SUCCESS=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',0))" 2>/dev/null || echo "0")
REMAIN=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin).get('remain','?'))" 2>/dev/null || echo "?")
MSG=$(echo "$RESPONSE" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('message',d.get('error','')))" 2>/dev/null || echo "$RESPONSE")

# Partial responses do not identify accepted URLs; retain cursor for retry.
if [ "$SUCCESS" -eq "${#PUSH_URLS[@]}" ] 2>/dev/null; then
  if echo $(( (IDX + ${#PUSH_URLS[@]}) % TOTAL )) > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"; then
    NEXT=$(( (IDX + ${#PUSH_URLS[@]}) % TOTAL ))
  else
    NEXT="写入失败(仍是 $IDX)"
    echo "[$(date '+%F %T')] WARN: 无法写入轮转状态 $STATE_FILE，明天会重复推送同一批 URL" >> "$LOG_FILE"
  fi
  SUBJECT="[百度推送成功] ${SUCCESS} 条 (剩余配额 ${REMAIN}) - $(date '+%F %T')"
else
  NEXT="$IDX(未推进)"
  SUBJECT="[百度推送跳过] ${MSG} - $(date '+%F %T')"
fi

cat > "$EMAIL_FILE" <<EOM
百度资源推送报告 ($(date '+%F %T'))
站点: $SITE_URL
本次: ${#PUSH_URLS[@]}/${TOTAL} 条 (轮转起始 $IDX)
成功: $SUCCESS  剩余配额: $REMAIN
下次起始: $NEXT
本次 URL:
$(printf '  %s\n' "${PUSH_URLS[@]}")
消息: $MSG
EOM

if [ -z "${BAIDU_NO_MAIL:-}" ] && command -v mail >/dev/null 2>&1; then
  mail -s "$SUBJECT" "$NOTIFY_EMAIL" < "$EMAIL_FILE" || true
fi
rm -f "$BATCH_FILE"
echo "[$(date '+%F %T')] Done." >> "$LOG_FILE"
