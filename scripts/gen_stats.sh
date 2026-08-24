#!/usr/bin/env bash
set -euo pipefail
SITE="/www/wwwroot/tools.treasuregrove.art"
mkdir -p "$SITE/stats"
/usr/bin/goaccess /www/wwwlogs/tools.treasuregrove.art.log --log-format=COMBINED -o "$SITE/stats/index.html" --agent-list 2>/dev/null
chown -R www:www "$SITE/stats"
