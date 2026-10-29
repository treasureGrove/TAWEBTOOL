#!/usr/bin/env python3
"""Use the existing website model to review only a fixed, allowlisted JSON status."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import HTTPRedirectHandler, Request, build_opener
import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import uuid

ROOT = Path("/var/lib/lolicode-seo-review")
STATUS_URL = "https://lolicode.com/.well-known/lolicode-seo-status.json"
MODEL = "deepseek/deepseek-flash"
STATUS_KEYS = {
    "date", "site", "checkedAt", "health", "changed", "engineStatus",
    "productVersion", "nativeVersion",
}
ENGINE_STATES = {
    "indexnow": {"received", "received_pending_validation", "failed", "unchanged", "not_submitted"},
    "google": {"sitemap_available_no_api", "not_configured"},
    "baidu": {
        "received", "failed", "quota_exhausted", "configuration_invalid",
        "unchanged", "not_submitted", "not_configured",
    },
}
SYSTEM_PROMPT = (
    "你是 LoliCode 官网每日 SEO 状态复核员。只依据用户提供的固定 JSON 状态，"
    "用简短中文说明今日检查、内容是否变化、各搜索引擎提交状态。"
    "不得调用工具，不得访问文件或网页，不得发帖、发送消息或执行任何提交。"
    "received 仅表示提交请求被接收，不表示已经收录；"
    "sitemap_available_no_api 和 not_configured 说明 API 未配置，不能写成已自动提交。"
    "degraded 是当前配置下的正常有限能力结果，无须制造告警。"
    "不推测排名、收录结果、访问量或未来完成时间。输出最多 300 个中文字符。"
)
OPENCODE_CONFIG = {
    "permission": {"*": "deny"},
    "share": "disabled",
    "autoupdate": False,
    "agent": {
        "seo-review": {
            "mode": "primary",
            "description": "Read-only review of a fixed SEO status JSON supplied in the prompt",
            "prompt": SYSTEM_PROMPT,
            "permission": {"*": "deny"},
        }
    },
}


class StatusError(Exception):
    """A fixed category safe to place in the private operational log."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def validate_status(value, now=None):
    if not isinstance(value, dict) or set(value) != STATUS_KEYS:
        raise StatusError("unexpected_status_fields")
    if value["site"] != "https://lolicode.com/":
        raise StatusError("unexpected_site")
    now = now or datetime.now(timezone(timedelta(hours=8)))
    if value["date"] != now.astimezone(timezone(timedelta(hours=8))).date().isoformat():
        raise StatusError("status_is_not_for_today")
    if not isinstance(value["checkedAt"], str) or len(value["checkedAt"]) > 40:
        raise StatusError("invalid_check_time")
    try:
        checked = datetime.fromisoformat(value["checkedAt"].replace("Z", "+00:00"))
    except ValueError:
        raise StatusError("invalid_check_time")
    if checked.tzinfo is None:
        raise StatusError("check_time_needs_timezone")
    age = (now - checked).total_seconds()
    if age < -300 or age > 10800:
        raise StatusError("stale_or_future_status")
    if not isinstance(value["health"], str) or value["health"] not in {
        "degraded", "check_failed", "submission_failed"
    }:
        raise StatusError("unexpected_health")
    if value["changed"] is not None and not isinstance(value["changed"], bool):
        raise StatusError("unexpected_changed_value")
    for name in ["productVersion", "nativeVersion"]:
        version = value[name]
        if version is not None and (
            not isinstance(version, str) or len(version) > 80
            or not re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)"
                                r"(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?", version)
        ):
            raise StatusError("unexpected_version")
    engines = value["engineStatus"]
    if not isinstance(engines, dict) or set(engines) != set(ENGINE_STATES):
        raise StatusError("unexpected_engines")
    for name, allowed in ENGINE_STATES.items():
        if not isinstance(engines[name], str) or engines[name] not in allowed:
            raise StatusError("unexpected_engine_state")
    return value


def fetch_status():
    request = Request(STATUS_URL, headers={
        "User-Agent": "LoliCode-SEO-Review/1.0",
        "Accept": "application/json",
        "Cache-Control": "no-cache",
    })
    try:
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            if response.status != 200 or response.geturl() != STATUS_URL:
                raise StatusError("unexpected_status_response")
            if response.headers.get_content_type() != "application/json":
                raise StatusError("unexpected_status_content_type")
            raw = response.read(8193)
        if len(raw) > 8192:
            raise StatusError("status_too_large")
        return validate_status(json.loads(raw))
    except StatusError:
        raise
    except Exception:
        raise StatusError("status_fetch_failed")


def extract_report(stdout):
    chunks = []
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(event, dict):
            continue
        if event.get("type") == "error":
            raise StatusError("agent_report_failed")
        if event.get("type") == "text":
            part = event.get("part")
            if isinstance(part, dict) and isinstance(part.get("text"), str):
                chunks.append(part["text"])
    report = "\n".join(chunks).strip()
    if not report or len(report) > 3000:
        raise StatusError("agent_report_missing_or_too_long")
    return report


def run_agent(status):
    if not (ROOT / "data/opencode/auth.json").is_file():
        raise StatusError("existing_auth_mount_unavailable")
    env = os.environ.copy()
    env.update({
        "HOME": str(ROOT / "home"),
        "XDG_DATA_HOME": str(ROOT / "data"),
        "XDG_CONFIG_HOME": str(ROOT / "config"),
        "XDG_CACHE_HOME": str(ROOT / "cache"),
        "XDG_STATE_HOME": str(ROOT / "state"),
        "OPENCODE_CONFIG_CONTENT": json.dumps(OPENCODE_CONFIG, ensure_ascii=False),
        "NO_COLOR": "1",
    })
    prompt = "以下是固定程序生成且已验证字段的今日状态。请只复核，不执行任何动作：\n" + json.dumps(
        status, ensure_ascii=False, separators=(",", ":")
    )
    try:
        result = subprocess.run(
            ["/usr/local/bin/opencode", "run", "--format", "json",
             "--agent", "seo-review", "--model", MODEL,
             "--dir", str(ROOT / "work"), prompt],
            cwd=ROOT / "work", env=env, capture_output=True, text=True, timeout=180,
        )
    except subprocess.TimeoutExpired:
        raise StatusError("agent_report_timed_out")
    except Exception:
        raise StatusError("agent_process_failed")
    if result.returncode != 0:
        # Never copy raw provider stderr, authorization headers, or prompts to logs.
        raise StatusError("agent_process_failed")
    return extract_report(result.stdout)


def atomic_json(path, value):
    data = (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with temporary.open("xb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.chmod(0o600)
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--validate-file", type=Path)
    args = parser.parse_args()
    if args.validate_file:
        validate_status(json.loads(args.validate_file.read_bytes()))
        print(json.dumps({"passed": True, "validationOnly": True}))
        return 0
    ROOT.mkdir(mode=0o700, exist_ok=True)
    with (ROOT / "review.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return 75
        now = datetime.now(timezone(timedelta(hours=8))).isoformat()
        try:
            status = fetch_status()
            report = run_agent(status)
            result = {"checkedAt": now, "status": "reported", "model": MODEL,
                      "sourceStatus": status, "report": report}
            atomic_json(ROOT / "review.latest.json", result)
            atomic_json(ROOT / ("review-" + status["date"] + ".json"), result)
            print(json.dumps({"status": "reported", "date": status["date"], "model": MODEL}))
            return 0
        except StatusError as error:
            atomic_json(ROOT / "review.latest.json",
                        {"checkedAt": now, "status": "failed", "reason": str(error)})
            print(json.dumps({"status": "failed", "reason": str(error)}))
            return 1


if __name__ == "__main__":
    sys.exit(main())
