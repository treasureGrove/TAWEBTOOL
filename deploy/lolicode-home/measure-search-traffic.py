#!/usr/bin/env python3
"""Read-only, aggregate-only homepage search-referrer request baseline.

Uses the local OpenSSH ``lolicode`` alias. The remote Python process reads the
existing site access logs and emits aggregate JSON only; it writes no files.
This measures requests, not Search Console impressions, CTR, or unique users.

Example:
  python measure-search-traffic.py --end 2026-10-26 --output before.json
"""
import argparse
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import subprocess
import sys


REMOTE_SOURCE = r'''
from collections import Counter
from datetime import date, datetime, timedelta, timezone
import gzip
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

SG = timezone(timedelta(hours=8))
ENGINES = {
    "google": (
        "google.com", "google.com.hk", "google.com.tw", "google.com.sg",
        "google.co.jp", "google.co.uk", "google.com.au", "google.ca",
        "google.de", "google.fr", "google.co.in", "google.co.kr",
        "google.ru", "google.es", "google.it", "google.nl", "google.com.br",
        "google.ch", "google.se", "google.pl", "google.be", "google.co.nz",
        "google.at", "google.dk", "google.fi", "google.com.my", "google.co.th",
        "google.co.id", "google.com.vn", "google.com.tr", "google.com.mx",
        "google.com.ar", "google.com.ua", "google.ie", "google.pt", "google.co.za",
    ),
    "bing": ("bing.com",),
    "baidu": ("baidu.com",),
    "duckduckgo": ("duckduckgo.com",),
    "yahoo": ("yahoo.com", "yahoo.co.jp", "yahoo.co.uk", "yahoo.com.tw",
              "yahoo.com.hk", "yahoo.com.sg", "yahoo.ca", "yahoo.de", "yahoo.fr"),
    "sogou": ("sogou.com",),
    "so": ("so.com",),
    "shenma": ("sm.cn",),
}
BOT_PATTERN = re.compile(
    r"bot|spider|crawler|slurp|bingpreview|headlesschrome|phantomjs|"
    r"facebookexternalhit|curl/|wget/|python-requests|python-urllib|"
    r"go-http-client|httpclient|axios/|node-fetch|selenium|playwright|puppeteer",
    re.IGNORECASE,
)
LOG_PATTERN = re.compile(
    r'^\S+\s+\S+\s+\S+\s+\[(?P<time>[^\]]+)\]\s+'
    r'"(?P<request>(?:\\.|[^"\\])*)"\s+(?P<status>\d{3})\s+\S+\s+'
    r'"(?P<referrer>(?:\\.|[^"\\])*)"\s+"(?P<ua>(?:\\.|[^"\\])*)"'
)
LOG_NAME_PATTERN = re.compile(r"^lolicode\.access\.log(?:\.\d+(?:\.gz)?)?$")


def engine_for(referrer):
    try:
        parsed = urlsplit(referrer)
        if parsed.scheme.lower() not in ("http", "https"):
            return None
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return None
    for engine, domains in ENGINES.items():
        if any(host == domain or host.endswith("." + domain) for domain in domains):
            return engine
    return None


def homepage_request(request):
    parts = request.split(" ", 2)
    if len(parts) != 3 or parts[0] != "GET":
        return False
    target = parts[1]
    if not target.startswith("/") or target.startswith("//"):
        return False
    try:
        return urlsplit(target).path == "/"
    except ValueError:
        return False


def collect(end_value, day_count):
    end = date.fromisoformat(end_value)
    start = end - timedelta(days=day_count - 1)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(day_count)]
    counts = {day: Counter({engine: 0 for engine in ENGINES}) for day in dates}
    bot_counts = Counter()
    all_log_dates = set()
    failures = 0
    malformed = 0
    parsed_count = 0
    observed_start = None
    observed_end = None
    observed_start_time = None
    observed_end_time = None
    paths = sorted(p for p in Path("/var/log/nginx").glob("lolicode.access.log*")
                   if LOG_NAME_PATTERN.fullmatch(p.name) and p.is_file())
    if not paths:
        raise RuntimeError("No matching site access log files were found")
    for path in paths:
        opener = gzip.open if path.suffix == ".gz" else open
        try:
            with opener(path, "rt", encoding="utf-8", errors="replace") as handle:
                for line in handle:
                    match = LOG_PATTERN.match(line)
                    if not match:
                        malformed += 1
                        continue
                    try:
                        moment = datetime.strptime(match["time"], "%d/%b/%Y:%H:%M:%S %z")
                        local_time = moment.astimezone(SG)
                        local_day = local_time.date()
                    except ValueError:
                        malformed += 1
                        continue
                    parsed_count += 1
                    observed_start = local_day if observed_start is None else min(observed_start, local_day)
                    observed_end = local_day if observed_end is None else max(observed_end, local_day)
                    observed_start_time = local_time if observed_start_time is None else min(observed_start_time, local_time)
                    observed_end_time = local_time if observed_end_time is None else max(observed_end_time, local_time)
                    if local_day < start or local_day > end:
                        continue
                    day = local_day.isoformat()
                    all_log_dates.add(day)
                    if match["status"] not in ("200", "304") or not homepage_request(match["request"]):
                        continue
                    engine = engine_for(match["referrer"])
                    if engine is None:
                        continue
                    if BOT_PATTERN.search(match["ua"]):
                        bot_counts[engine] += 1
                        continue
                    counts[day][engine] += 1
        except (OSError, EOFError):
            failures += 1
    if failures:
        raise RuntimeError("Access log read failed for %d file(s); partial results suppressed" % failures)
    totals = {engine: sum(counts[day][engine] for day in dates) for engine in ENGINES}
    return {
        "schema_version": 1,
        "metric": "nginx_homepage_search_referrer_requests",
        "site": "https://lolicode.com/",
        "timezone": "Asia/Singapore",
        "period": {"start": start.isoformat(), "end": end.isoformat(),
                   "complete_calendar_days": day_count},
        "collected_at": datetime.now(SG).isoformat(timespec="seconds"),
        "definition": {
            "method": "GET", "path": "/", "query_strings_allowed_but_not_recorded": True,
            "statuses": [200, 304], "known_bot_user_agents_filtered": True,
            "referrer_match": "exact allowed domain or dot-delimited subdomain",
            "allowed_referrer_domains": ENGINES,
            "bot_user_agent_pattern": BOT_PATTERN.pattern,
        },
        "totals": {"requests": sum(totals.values()), "by_engine": totals},
        "daily": [{"date": day, "requests": sum(counts[day].values()),
                   "by_engine": dict(counts[day])} for day in dates],
        "excluded_known_bot_requests": {
            "requests": sum(bot_counts.values()),
            "by_engine": {engine: bot_counts[engine] for engine in ENGINES},
        },
        "coverage": {
            "site_log_files_read": len(paths), "parsed_log_records": parsed_count,
            "unparsed_log_records": malformed,
            "earliest_observed_log_date": observed_start.isoformat() if observed_start else None,
            "latest_observed_log_date": observed_end.isoformat() if observed_end else None,
            "earliest_observed_log_time_singapore": observed_start_time.isoformat() if observed_start_time else None,
            "latest_observed_log_time_singapore": observed_end_time.isoformat() if observed_end_time else None,
            "retained_logs_start_after_period_boundary": bool(
                observed_start_time and observed_start_time > datetime.combine(start, datetime.min.time(), SG)
            ),
            "dates_without_any_access_log_records": sorted(set(dates) - all_log_dates),
            "note": "Presence of records does not prove uninterrupted coverage; rotations can leave boundary days partial.",
        },
        "limitations": [
            "Counts logged requests, not Search Console impressions, CTR, search volume, unique visitors, or verified humans.",
            "Referrers and user-agent strings can be absent, spoofed, or misclassified; crawler identities are not verified.",
            "Search traffic with no referrer or an unlisted regional/search domain is excluded.",
            "Includes repeat requests, homepage query strings and www hosts in the shared site log; excludes redirects and non-homepage landings.",
            "No IP addresses, user-agent values, full referrers or search query values leave the server.",
            "Log retention and rotation can make part of the requested period unavailable; day-level presence alone cannot prove complete capture.",
        ],
    }


if __name__ == "__main__":
    try:
        result = collect(sys.argv[1], int(sys.argv[2]))
    except Exception:
        sys.stderr.write("Read-only traffic aggregation failed; no partial data or raw log contents emitted.\n")
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False, indent=2))
'''


def main():
    sg = timezone(timedelta(hours=8))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--end", type=date.fromisoformat,
                        default=datetime.now(sg).date() - timedelta(days=1),
                        help="Last complete Singapore date, default yesterday (YYYY-MM-DD)")
    parser.add_argument("--days", type=int, default=14, help="Number of complete calendar days, default 14")
    parser.add_argument("--output", type=Path, help="Optional local JSON output; stdout always contains only aggregate JSON")
    args = parser.parse_args()
    if not 1 <= args.days <= 90:
        parser.error("--days must be between 1 and 90")
    if args.end >= datetime.now(sg).date():
        parser.error("--end must be a complete Singapore date before today")
    result = subprocess.run(
        ["ssh", "-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "lolicode",
         "python3", "-", args.end.isoformat(), str(args.days)],
        input=REMOTE_SOURCE, text=True, encoding="utf-8", capture_output=True, timeout=180,
    )
    if result.returncode:
        sys.stderr.write("SSH read-only traffic aggregation failed (exit %s); raw output suppressed.\n" % result.returncode)
        return 1
    try:
        data = json.loads(result.stdout)
        if data.get("metric") != "nginx_homepage_search_referrer_requests":
            raise ValueError("Unexpected aggregate result")
    except (ValueError, TypeError):
        sys.stderr.write("Aggregation returned invalid JSON; raw output suppressed.\n")
        return 1
    rendered = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)
    return 0


if __name__ == "__main__":
    sys.exit(main())
