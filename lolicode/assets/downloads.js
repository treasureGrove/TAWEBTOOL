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
  const notes = document.getElementById("notes");
  const retry = document.getElementById("retry");
  const releaseVersion = document.getElementById("release-version");
  const releaseDate = document.getElementById("release-date");
  let loading = false;

  function disable() {
    for (const link of [installer, portable, githubBackup]) {
      if (!link) continue;
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.setAttribute("tabindex", "-1");
    }
    portable.hidden = true;
    if (githubBackup) githubBackup.hidden = true;
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

  function githubInstallerUrl(info, releaseVersion) {
    const filename = `LoliCode-${releaseVersion}-Windows-x64-Setup.exe`;
    const expected = `https://github.com/treasureGrove/LoliCode-Releases/releases/download/lolicode-v${releaseVersion}/${filename}`;
    if (
      !info ||
      typeof info !== "object" ||
      Array.isArray(info) ||
      info.name !== filename ||
      info.url !== expected ||
      !Number.isSafeInteger(info.bytes) ||
      info.bytes <= 0 ||
      typeof info.sha256 !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(info.sha256)
    ) {
      throw new Error("invalid GitHub backup");
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
      const installerUrl = downloadUrl(platform.url, release.version);
      const portableInfo = release.downloads?.["windows-x86_64-portable"];
      const portableUrl = portableInfo
        ? downloadUrl(portableInfo.url, release.version, true)
        : null;
      const githubInfo = release.downloads?.["windows-x86_64-installer-github"];
      const githubUrl = githubInfo === undefined
        ? null
        : githubInstallerUrl(githubInfo, release.version);

      // Activate links only after the complete manifest has passed validation.
      enable(installer, installerUrl);
      if (portableUrl) enable(portable, portableUrl);
      if (githubUrl && githubBackup) enable(githubBackup, githubUrl);
      version.textContent = `LoliCode ${release.version}`;
      releaseVersion.textContent = `v${release.version}`;
      status.dataset.state = "ready";
      status.textContent = "正式版已发布 · 推荐安装版，支持应用内更新。";
      notes.textContent =
        typeof release.notes === "string" && release.notes.trim()
          ? release.notes
          : "此版本包含功能改进与问题修复。";
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
