(() => {
  "use strict";
  // Page metadata selects a named profile, never an arbitrary feed or host.
  const profiles = {
    tools: { feed: "./updates/latest.json" },
    home: { feed: "/downloads/updates/latest.json" },
  };
  const profileName =
    document.querySelector('meta[name="lolicode-download-profile"]')?.content ||
    "tools";
  const profile = Object.hasOwn(profiles, profileName)
    ? profiles[profileName]
    : null;
  const downloadRoots = new Map([
    ["https://tools.treasuregrove.art", "/lolicode/releases/"],
    ["https://lolicode.com", "/downloads/releases/"],
    ["https://github.com", "/treasureGrove/LoliCode-Releases/releases/download/lolicode-v"],
  ]);
  const version = document.getElementById("version");
  const status = document.getElementById("status");
  const installer = document.getElementById("installer");
  const portable = document.getElementById("portable");
  const githubBackup = document.getElementById("github-backup");
  const tencentDownloads = document.getElementById("tencent-downloads");
  const tencentInstaller = document.getElementById("tencent-installer");
  const tencentPortable = document.getElementById("tencent-portable");
  const notes = document.getElementById("notes");
  const retry = document.getElementById("retry");
  const releaseVersion = document.getElementById("release-version");
  const releaseDate = document.getElementById("release-date");
  let loading = false;

  function renderNotes(value, currentVersion) {
    // A deliberately small text-only renderer: release metadata never becomes
    // HTML, links, styles or executable Markdown. Keep long details out of the
    // primary reading path while retaining them behind a keyboard-native control.
    const text = typeof value === "string" && value.trim()
      ? value.slice(0, 32000).trim()
      : "此版本包含功能改进与问题修复。";
    const blocks = [];
    let paragraph = [];
    let list = null;
    const node = (tag, content) => {
      const element = document.createElement(tag);
      element.textContent = content;
      return element;
    };
    const flush = () => {
      if (paragraph.length) blocks.push(node("p", paragraph.join(" ")));
      paragraph = [];
      list = null;
    };
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      const heading = /^#{1,6}\s+(.+)$/.exec(trimmed);
      const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
      if (!trimmed) { flush(); continue; }
      if (heading) {
        flush();
        if (heading[1] !== `LoliCode ${currentVersion}`) blocks.push(node("h3", heading[1]));
      } else if (bullet) {
        if (paragraph.length) flush();
        if (!list) { list = document.createElement("ul"); blocks.push(list); }
        list.append(node("li", bullet[1]));
      } else {
        list = null;
        paragraph.push(trimmed);
      }
    }
    flush();
    if (blocks.length <= 1) { notes.replaceChildren(...blocks); return; }
    const extra = document.createElement("details");
    extra.className = "release-notes-extra";
    extra.append(node("summary", "完整更新说明"), ...blocks.slice(1));
    notes.replaceChildren(blocks[0], extra);
  }

  function disable() {
    for (const link of [installer, portable, githubBackup, tencentInstaller, tencentPortable]) {
      if (!link) continue;
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
    }
    portable.hidden = true;
    for (const link of [githubBackup, tencentInstaller, tencentPortable]) {
      if (link) link.hidden = true;
    }
    if (tencentDownloads) tencentDownloads.hidden = true;
  }

  function enable(link, url) {
    link.href = url;
    link.setAttribute("aria-disabled", "false");
    link.removeAttribute("tabindex");
    link.hidden = false;
  }

  function downloadUrl(value, releaseVersion, portableArchive = false) {
    if (typeof value !== "string") throw new Error("invalid download URL");
    const url = new URL(value);
    const root = downloadRoots.get(url.origin);
    if (!root) throw new Error("invalid download origin");
    const prefix = `${root}${releaseVersion}/`;
    const filename = url.pathname.slice(prefix.length);
    const expectedPath = portableArchive
      ? url.pathname === `${prefix}LoliCode-Portable.zip`
      : url.pathname.startsWith(prefix) && url.pathname.endsWith(".exe") &&
        (url.origin !== "https://github.com" || /^[A-Za-z0-9][A-Za-z0-9._-]*\.exe$/.test(filename));
    if (
      !expectedPath ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    ) {
      throw new Error("invalid download URL");
    }
    return url.href;
  }

  function artifactMetadata(info, filename) {
    return info !== null && typeof info === "object" && !Array.isArray(info)
      && info.name === filename && Number.isSafeInteger(info.bytes) && info.bytes > 0
      && typeof info.sha256 === "string" && /^[a-fA-F0-9]{64}$/.test(info.sha256);
  }

  function githubInstallerUrl(info, releaseVersion) {
    const filename = `LoliCode-${releaseVersion}-Windows-x64-Setup.exe`;
    const expected = `https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v${releaseVersion}/${filename}`;
    if (!artifactMetadata(info, filename) || info.url !== expected) {
      throw new Error("invalid GitHub backup");
    }
    return info.url;
  }

  function tencentDownloadUrl(info, primaryArtifact, primaryUrl, releaseVersion, portableArchive = false) {
    const filename = portableArchive ? "LoliCode-Portable.zip"
      : `LoliCode-${releaseVersion}-Windows-x64-Setup.exe`;
    const expected = `https://lolicode.com/downloads/tencent/${releaseVersion}/${filename}`;
    if (!artifactMetadata(info, filename) || !artifactMetadata(primaryArtifact, filename)
      || info.url !== expected || info.bytes !== primaryArtifact.bytes
      || info.sha256.toLowerCase() !== primaryArtifact.sha256.toLowerCase()) {
      throw new Error("invalid Tencent download");
    }
    const primary = new URL(primaryUrl);
    const primaryRoot = downloadRoots.get(primary.origin);
    if (!primaryRoot || primary.pathname !== `${primaryRoot}${releaseVersion}/${filename}`) {
      throw new Error("Tencent artifact does not match the primary download");
    }
    return info.url;
  }

  async function load() {
    if (loading) return;
    loading = true;
    retry.hidden = true;
    disable();
    status.dataset.state = "loading";
    status.textContent = "正在连接发布服务…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      if (!profile) throw new Error("invalid download profile");
      const response = await fetch(profile.feed, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("release unavailable");
      const release = await response.json();
      const platform = release?.platforms?.["windows-x86_64"];
      if (
        !/^\d+\.\d+\.\d+$/.test(release?.version) ||
        typeof platform?.signature !== "string" ||
        !platform.signature.trim()
      ) {
        throw new Error("invalid release");
      }
      const publicVersion = release.productVersion ?? release.version;
      if (!/^\d+\.\d+\.\d+$/.test(publicVersion)) throw new Error("invalid product version");
      const [buildMajor, buildMinor, buildPatch] = release.version.split(".").map(Number);
      const expectedPublic = buildMajor >= 4 && buildMinor >= 1
        ? `${buildMajor - 3}.${buildMinor - 1}.${buildPatch}` : release.version;
      if (publicVersion !== expectedPublic) throw new Error("product/build version mismatch");
      const installerUrl = downloadUrl(platform.url, publicVersion);
      const portableInfo = release.downloads?.["windows-x86_64-portable"];
      const portableUrl = portableInfo
        ? downloadUrl(portableInfo.url, publicVersion, true)
        : null;
      const githubInfo = release.downloads?.["windows-x86_64-installer-github"];
      const githubUrl = githubInfo === undefined
        ? null
        : githubInstallerUrl(githubInfo, publicVersion);
      const tencentInstallerInfo = release.downloads?.["windows-x86_64-installer-tencent"];
      const tencentInstallerUrl = tencentInstallerInfo === undefined
        ? null
        : tencentDownloadUrl(tencentInstallerInfo, githubInfo, installerUrl, publicVersion);
      const tencentPortableInfo = release.downloads?.["windows-x86_64-portable-tencent"];
      const tencentPortableUrl = tencentPortableInfo === undefined
        ? null
        : tencentDownloadUrl(tencentPortableInfo, portableInfo, portableUrl, publicVersion, true);

      // Activate links only after the complete manifest has passed validation.
      enable(installer, installerUrl);
      if (portableUrl) enable(portable, portableUrl);
      if (githubUrl && githubBackup) enable(githubBackup, githubUrl);
      if (tencentInstallerUrl && tencentInstaller) enable(tencentInstaller, tencentInstallerUrl);
      if (tencentPortableUrl && tencentPortable) enable(tencentPortable, tencentPortableUrl);
      if (tencentDownloads) {
        tencentDownloads.hidden = !((tencentInstallerUrl && tencentInstaller)
          || (tencentPortableUrl && tencentPortable));
      }
      version.textContent = `LoliCode ${publicVersion}`;
      releaseVersion.textContent = `v${publicVersion}`;
      status.dataset.state = "ready";
      status.textContent = "正式版已发布 · 推荐安装版，支持应用内更新。";
      renderNotes(release.notes, publicVersion);
      const date =
        typeof release.pub_date === "string"
          ? new Date(release.pub_date)
          : null;
      if (date && Number.isFinite(date.getTime())) {
        releaseDate.dateTime = date.toISOString();
        releaseDate.textContent = new Intl.DateTimeFormat("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "Asia/Singapore",
        }).format(date);
        releaseDate.hidden = false;
      } else {
        releaseDate.hidden = true;
      }
    } catch {
      disable();
      version.textContent = "暂时无法读取版本";
      releaseVersion.textContent = "版本信息暂不可用";
      releaseDate.hidden = true;
      status.dataset.state = "error";
      status.textContent = "暂时无法获取下载信息，请重试，或稍后回来。";
      notes.textContent =
        "发布说明暂不可用，可通过「全部更新」查看项目发布记录。";
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
      loading = false;
    }
  }

  retry.addEventListener("click", () => void load());
  void load();
})();
