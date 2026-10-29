# LoliCode daily SEO checks and Agent review

This directory contains the fixed PHP CLI, two systemd service/timer pairs,
the existing website Agent's restricted review wrapper, and a guarded installer.
The PHP job checks and submits the homepage; the Agent reviews only its validated
status JSON and writes a private Chinese report. Neither job sends email or uses
an authenticated browser session.

## Installed schedule and first verification

Both timers are enabled and active. Times use `Asia/Shanghai` (UTC+8), matching
the core's `Asia/Singapore` daily submission boundary:

| Host | Timer | Daily time | Execution |
| --- | --- | --- | --- |
| lolicode | `lolicode-daily-seo.timer` | 08:45 | `www-data`, fixed PHP checks and eligible submissions |
| tools | `lolicode-seo-review.timer` | 08:50 | Existing OpenCode 1.18.32, `deepseek/deepseek-flash`, private status review |

At activation on 2026-10-20, the next triggers were 2026-10-21 at 08:45 and
08:50 UTC+8. `Persistent=true` did not trigger an immediate extra run; the original
submission evidence and report remained unchanged. A second sandbox dry run
confirmed `daily_limit` without any API call. Existing root cron entries,
including the 03:17 Wiki task, were preserved.

The tools service reuses the original authentication inode through a read-only
bind, with isolated HOME/XDG paths and no credential copy. Both global and
`seo-review` Agent configuration deny all tools. Runtime inspection confirmed
the final wildcard deny rules; OpenCode's automatic private tool-output
`external_directory` allowance does not grant a read or execution tool.
The process has no Linux capabilities and can write only its own private state.
Reports are mode `0600` at
`/var/lib/lolicode-seo-review/review.latest.json` and
`/var/lib/lolicode-seo-review/review-YYYY-MM-DD.json`.

The first real run on 2026-10-20 checked product **1.0.1** / native **4.1.1**.
IndexNow returned HTTP 200, meaning the request was received, not that the page
was indexed. Google remains sitemap discovery without an automated submission
API. Baidu failed before an HTTP response: a public, credential-free probe
confirmed cURL error 60 and a certificate hostname mismatch for
`data.zz.baidu.com`. Strict HTTPS verification remains enabled; there is no
HTTP fallback or certificate bypass. Its failure and separate successful
IndexNow receipt are retained. The next eligible daily run will retry Baidu.
The actual website Agent successfully generated a Chinese report that preserves
these distinctions and reports the Baidu failure.

The public status route returned HTTP 200 with the exact eight-field schema,
`noindex, nofollow`, `no-store`, and `nosniff`. It exposes no private logs or
credential material. Proofs are in `tmp/lolicode-daily-seo-20261020-v1/`.
The deployed manifest SHA256 is
`1ab8477ea6eff04a67377bd30e47659c38442f5057d6d8a65e74ee547f0855a1`.
This operational documentation update is not part of the deployed payload and
does not change its code or unit hashes.

## Runtime and commands

Requires PHP 8.1+ with cURL, DOM/libxml, posix and the existing Flarum installation.
Run the CLI as `www-data`:

```sh
php run.php --dry-run
php run.php
```

The deployment owner must prepare `/var/lib/lolicode-seo` for `www-data`, mode
`0755`. The private `state/` child is `0700`; its state, event log and lock are
`0600`. The CLI offers no configurable host, submission URL or credential path.
It uses the existing forum's `IndexNow` service without reading or printing its
key. The service is loaded lazily only when a real submission is required.

The bounded `public-status.json` is `0644`, with exactly these fields:
`date`, `site`, `checkedAt`, `health`, `changed`, `productVersion`,
`nativeVersion`, `engineStatus`. `engineStatus` contains only `indexnow`,
`google`, and `baidu` status strings. Check failures use null version/change
fields. The exact noindex route `/.well-known/lolicode-seo-status.json` exposes
only this file; never expose `state/` or `credentials/`. Private digests, headers, response
bodies, error messages, tokens and signatures are absent from this public file.

`--dry-run` performs the public GET checks but never loads Flarum, reads Baidu's
token file, submits a URL, writes state/event/public logs, or consumes the day's
submission. It can create the state directories and lock file. Use the same
`www-data` identity for dry and real execution to avoid ownership conflicts.

## Checks and submission semantics

Each run that acquires the lock and reads valid state checks these resources:

- `https://lolicode.com/`: HTTP 200, exactly one correct canonical, no noindex.
- `https://lolicode.com/robots.txt`: HTTP 200, required resources permitted for
  Googlebot, Bingbot and Baiduspider.
- `https://lolicode.com/sitemap-desktop.xml`: HTTP 200, valid ordinary `urlset`,
  exactly one homepage entry, no off-domain URLs or XML entity declarations.
- `https://lolicode.com/desktop-assets/site-icon-512.png`: HTTP 200, 512px PNG.
- `https://lolicode.com/downloads/updates/latest.json`: HTTP 200 and valid
  product/native semver plus installer URL and SHA256 when supplied.

The digest covers the actual HTML, icon PNG and sitemap bytes, plus only stable
release-feed fields: product/native versions, Windows installer URL and installer
download URL/SHA256 when present. Feed notes, timestamps and signatures are not
hashed or published. Versions are validated rather than fixed to today's release.
The core does not rewrite content or invent sitemap `lastmod`. Only the canonical
homepage can be submitted. The initial eligible real run submits once; an
unchanged digest after a confirmed receipt is checked but skipped later.

A nonblocking lock prevents overlapping runs. A durable submission attempt is
reserved before either submission API, using the **Asia/Singapore** calendar date.
Subsequent real submissions on that date are skipped, including after a failed or
interrupted API attempt. Public GET checks still run and refresh the summary's
timestamp, versions and health; a successful repeat returns
`already_submitted_today` with both submission engines marked `not_submitted`.
The original submission attempt and successful digest are preserved, so a later
revision is never represented as having received the earlier receipt.
An earlier unchanged/check-failed run does not consume
that allowance: the first changed revision later that day may still be submitted.
After an API attempt, recovery/retry happens the next day; there is no force flag
or automatic same-day resubmission. Check/API failures never advance the
corresponding engine's successful digest.

IndexNow HTTP 200 means received, not indexed. HTTP 202 is recorded as pending
key validation and remains eligible for retry the next day; it does not become
the successful content baseline.

Google reports `not_configured` in the private result and
`sitemap_available_no_api` in a successful public check. It makes no authenticated
Google API request. A missing Baidu credential file also reports `not_configured`.
These expected limitations result in `health: degraded`, with exit 0 when checks
and any configured submissions succeed.

Baidu is configured only by
`/var/lib/lolicode-seo/credentials/baidu.json`, containing exactly the root site
value `https://lolicode.com` and its token. Keep `credentials/` mode `0700` and the
file `0600`, owned by `www-data`. The adapter fixes HTTPS
`data.zz.baidu.com/urls`, enables TLS verification, disables redirects, sends
only the homepage and uses a 15-second timeout/64 KiB response limit. It retains
only numeric HTTP/success/remain/error values and controlled status strings.
Only HTTP 200 with `success: 1` establishes its successful baseline. A quota or
configuration error remains a visible failure; it is not retried that day.

The two engines have separate successful digests, so one engine's failure never
erases the other's successful receipt. Neither adapter reuses tool-site
credentials, Google Indexing API, authenticated browser sessions or the site's
model API key. Existing Search Console/Baidu sitemap subscriptions remain separate.

Outputs contain only dates, fixed URLs, content digests, status codes and bounded
error identifiers. They do not contain keys, raw HTML, HTTP response bodies,
exception messages or model credentials.

## Exit codes

| Exit | Meaning |
| --- | --- |
| 0 | Submitted receipt, pending validation, unchanged, daily duplicate, or successful dry run |
| 2 | Public-page validation/check failure |
| 3 | IndexNow or Baidu transport/API/configuration/quota failure |
| 4 | Private state or log failure |
| 64 | Invalid arguments or execution identity |
| 75 | Another run holds the lock |

Inspect `status` in the JSON result as well as the exit code. An interrupted
`submitting` attempt represents an unknown outcome; do not label it successful or
automatically retry that day. A locked run leaves the last public timestamp
unchanged. A same-day duplicate submission performs fresh checks and updates it.

## Offline tests

```sh
php test.php
```

Tests inject both HTTP and IndexNow dependencies, never include `run.php`, never
boot Flarum and never make network requests. They use isolated temporary
directories and cover locking, local-date deduplication, first/changed/unchanged
content, dry runs, validation failures, unsuccessful receipts, pending responses
feed-only changes, Baidu configuration/receipts/quota failures, public-summary
field and permission boundaries, and output sanitization.

All 37 offline tests passed for the deployed core. The subsequent documentation
update changes no tested code.
