#!/usr/bin/env python3
"""Apply the homepage refresh to the exact live base, preserving existing guides."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

BATCH = "20261120-home-atelier-v2"
PAYLOAD = Path("/root/lolicode-" + BATCH)
SITE = Path("/var/www/lolicode-site/releases") / BATCH
SNIPPET = Path("/etc/nginx/snippets/lolicode-home-production-20261016-home-v3.conf")
TEST = Path("/etc/nginx/sites-available/test.conf")
MAIN = Path("/etc/nginx/sites-available/lolicode.conf")
PREVIEW = Path("/etc/nginx/snippets/lolicode-home-atelier-preview-20261120.conf")
LOCK = Path("/run/lock/lolicode-forum-maintenance.lock")
FLAG = Path("/var/www/ops/MAINTENANCE_ON")
EXPECTED = {
    "snippet": "e42acc23f4a88f1c10e80dbd3c59d4d3a4258586d8a015651fb42a72cecb0bdc",
    "main": "53513f0be19f511936092f6b32e17efe84b840f3b6547a877d80b705a764fe6d",
    "test": "7b100ffa18ac9aeb7b6df73553e07f60b13991ad938fe2587162acb74766d321",
}
ASSETS = {"desktop-assets/home-20261120-atelier.css"}
PRESERVED = ("/cli/", "/cli/latest.json", "/sitemap-desktop.xml", "/desktop-assets/downloads.js", "/desktop-assets/motion.js", "/guides/anime-ai/", "/guides/ai-roleplay/", "/guides/windows-ai-coding/")


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def plain(path):
    require(stat.S_ISREG(path.lstat().st_mode) and not path.is_symlink(), f"Expected regular file: {path}")
    return path.read_bytes()


def atomic(path, data, mode=0o600):
    require(not path.is_symlink() and path.parent.resolve() == path.parent, f"Unsafe target: {path}")
    fd, name = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            os.fchmod(stream.fileno(), mode)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def immutable(path, data, mode=0o600):
    if path.exists() or path.is_symlink():
        require(plain(path) == data, f"Immutable file differs: {path}")
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
        atomic(path, data, mode)


def replace_once(data, before, after):
    require(data.count(before) == 1, f"Expected one marker: {before[:90]!r}")
    return data.replace(before, after)


def location(config, route):
    blocks = re.findall(rb"(?ms)^location " + re.escape(route.encode()) + rb" \{\n.*?^\}\n", config)
    require(len(blocks) == 1, f"Expected one location: {route}")
    return blocks[0]


def root_for(config):
    match = re.search(rb"\n    root (/var/www/lolicode-site/releases/[A-Za-z0-9_-]+);", location(config, "= /"))
    require(match is not None, "Missing homepage release root")
    return Path(match[1].decode())


def candidate_snippet(before):
    require(b"/desktop-assets/home-20261120-atelier.css" not in before, "Refresh already configured")
    block = location(before, "= /")
    changed = replace_once(block, str(root_for(before)).encode(), str(SITE).encode())
    assets = f'''\nlocation = /desktop-assets/home-20261120-atelier.css {{
    root {SITE};
    try_files $uri =404;
    autoindex off;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    add_header X-Content-Type-Options nosniff always;
}}
'''.encode()
    return replace_once(before, block, changed) + assets


def homepage(before, edits):
    require(len(edits) == 4, "Expected four homepage insertions")
    after = before
    newline = "\r\n" if before.count(b"\r\n") > before.count(b"\n") / 2 else "\n"
    for marker, replacement in edits:
        marker = marker.replace("\n", newline)
        replacement = replacement.replace("\n", newline)
        after = replace_once(after, marker.encode(), replacement.encode())
    return after


def payload(digest):
    raw = plain(PAYLOAD / "manifest.json")
    require(sha(raw) == digest, "Manifest changed")
    manifest = json.loads(raw)
    require(manifest["batch"] == BATCH and set(manifest["files"]) == ASSETS | {"homepage-edits.json"}, "Unexpected payload")
    files = {}
    for name, expected in manifest["files"].items():
        files[name] = plain(PAYLOAD / "site" / name)
        require(sha(files[name]) == expected, f"Payload changed: {name}")
    return files


def fetch(host, route):
    with urlopen(Request(f"https://{host}{route}", headers={"Cache-Control": "no-cache"}), timeout=20) as response:
        data = response.read()
        require(response.status == 200, f"HTTP failed: {route}")
        return data, response.headers


def prepare(files, digest):
    before = plain(SNIPPET)
    actual = {"snippet": sha(before), "main": sha(plain(MAIN)), "test": sha(plain(TEST))}
    require(actual == EXPECTED, "Production baseline changed; inspect before preparing")
    original = plain(root_for(before) / "index.html")
    baseline = {**actual, "manifest": digest, "homepage": sha(original)}
    immutable(PAYLOAD / "baseline.json", (json.dumps(baseline, sort_keys=True) + "\n").encode())
    immutable(PAYLOAD / "snippet.before", before)
    immutable(PAYLOAD / "test.before", plain(TEST))
    immutable(PAYLOAD / "index.before", original)
    immutable(PAYLOAD / "snippet.after", candidate_snippet(before))
    deployed = {name: data for name, data in files.items() if name in ASSETS}
    deployed["index.html"] = homepage(original, json.loads(files["homepage-edits.json"]))
    for name, data in deployed.items():
        immutable(SITE / name, data, 0o644)
    immutable(PAYLOAD / "site-sha.json", (json.dumps({name: sha(data) for name, data in deployed.items()}, sort_keys=True) + "\n").encode())
    with ThreadPoolExecutor(max_workers=4) as pool:
        preserved = dict(pool.map(lambda route: (route, sha(fetch("lolicode.com", route)[0])), PRESERVED))
    immutable(PAYLOAD / "preserved.json", (json.dumps(preserved, sort_keys=True) + "\n").encode())
    print(json.dumps({"status": "prepared", "baseline": baseline, "preservedRoutes": len(preserved)}), flush=True)


def preview_config(before):
    after = candidate_snippet(before)
    root = location(after, "= /")
    root = root[:-2] + b'    add_header X-Robots-Tag "noindex, nofollow" always;\n}\n'
    blocks = re.findall(rb"(?ms)^location (?:\^~|=) /desktop-assets/[^\n]* \{\n.*?^\}\n", after)
    return b"\n".join([root, *blocks, location(before, "= /downloads/updates/latest.json")])


def reload():
    subprocess.run(["nginx", "-t"], check=True)
    subprocess.run(["systemctl", "reload", "nginx"], check=True)


def swap(path, before, after):
    require(plain(path) == before, f"Concurrent change: {path}")
    mode = stat.S_IMODE(path.stat().st_mode)
    atomic(path, after, mode)
    try:
        reload()
    except BaseException:
        require(plain(path) == after, "Concurrent change during failed reload")
        atomic(path, before, mode)
        reload()
        raise


def verify(host, preview=False):
    files = json.loads(plain(PAYLOAD / "site-sha.json"))
    paths = {"/" if name == "index.html" else "/" + name: digest for name, digest in files.items()}
    if not preview:
        paths.update(json.loads(plain(PAYLOAD / "preserved.json")))

    def check(item):
        route, digest = item
        for attempt in range(12):
            try:
                data, headers = fetch(host, route)
                require(sha(data) == digest, f"Unexpected published bytes: {route}")
                if preview and route == "/":
                    require("noindex" in headers.get("X-Robots-Tag", ""), "Preview is indexable")
                if route.endswith(".js"):
                    require("javascript" in headers.get("Content-Type", ""), "Incorrect JavaScript MIME")
                return {"path": route, "sha256": sha(data)}
            except (URLError, RuntimeError):
                if attempt == 11:
                    raise
                time.sleep(0.5)
    with ThreadPoolExecutor(max_workers=4) as pool:
        checks = list(pool.map(check, paths.items()))
    for route in ("/all", "/api", "/sitemap.xml", "/downloads/updates/latest.json"):
        data, _ = fetch(host, route)
        if route.endswith("latest.json"):
            require(json.loads(data).get("version"), "Invalid desktop update feed")
        checks.append({"path": route, "status": 200})
    data, _ = fetch(host, "/api/discussions?sort=-lastPostedAt&page%5Blimit%5D=3")
    require(isinstance(json.loads(data).get("data"), list), "Invalid public community feed")
    return checks


def run(action, digest):
    files = payload(digest)
    if action == "prepare":
        return prepare(files, digest)
    baseline = json.loads(plain(PAYLOAD / "baseline.json"))
    require(baseline["manifest"] == digest and sha(plain(MAIN)) == baseline["main"], "Main config or payload drifted")
    before, after = plain(PAYLOAD / "snippet.before"), plain(PAYLOAD / "snippet.after")
    test_before = plain(PAYLOAD / "test.before")
    anchor = b"    include /etc/nginx/snippets/forum-test-noindex-locations.conf;"
    test_after = replace_once(test_before, anchor, f"    include {PREVIEW};\n".encode() + anchor)
    if action == "preview":
        require(plain(SNIPPET) == before, "Production drifted before preview")
        immutable(PREVIEW, preview_config(before), 0o644)
        swap(TEST, test_before, test_after)
        return
    if action == "verify-preview":
        require(plain(TEST) == test_after, "Preview config drifted")
        proof = {"manifest": digest, "checks": verify("test.lolicode.com", True)}
        atomic(PAYLOAD / "preview-proof.json", (json.dumps(proof, sort_keys=True) + "\n").encode())
        print(json.dumps({"status": "preview_passed", **proof}), flush=True)
        return
    if action == "restore-preview":
        return swap(TEST, test_after, test_before)
    require(plain(TEST) == test_before, "Restore the test site first")
    if action == "rollback":
        return swap(SNIPPET, after, before)
    require(action == "production", "Unknown action")
    require(sha(plain(root_for(before) / "index.html")) == baseline["homepage"], "Original homepage drifted")
    require(json.loads(plain(PAYLOAD / "preview-proof.json"))["manifest"] == digest, "Missing exact preview proof")
    swap(SNIPPET, before, after)
    try:
        proof = {"manifest": digest, "snippetSha256": sha(after), "checks": verify("lolicode.com")}
    except BaseException:
        swap(SNIPPET, after, before)
        raise
    atomic(PAYLOAD / "production-proof.json", (json.dumps(proof, sort_keys=True) + "\n").encode())
    print(json.dumps({"status": "published", **proof}), flush=True)


if __name__ == "__main__":
    import fcntl
    allowed = {"prepare", "preview", "verify-preview", "restore-preview", "production", "rollback"}
    require(os.geteuid() == 0 and len(sys.argv) == 3 and sys.argv[1] in allowed, "Expected ACTION MANIFEST_SHA as root")
    require(re.fullmatch(r"[a-f0-9]{64}", sys.argv[2]), "Expected manifest SHA256")
    require(PAYLOAD.resolve() == PAYLOAD and stat.S_IMODE(PAYLOAD.stat().st_mode) == 0o700, "Expected private payload")
    with LOCK.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(not FLAG.exists() and not FLAG.is_symlink(), "Existing maintenance is active")
        run(sys.argv[1], sys.argv[2])
