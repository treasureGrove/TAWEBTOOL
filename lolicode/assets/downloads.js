(() => {
  const allowedOrigin = 'https://tools.treasuregrove.art';
  const version = document.getElementById('version');
  const status = document.getElementById('status');
  const installer = document.getElementById('installer');
  const portable = document.getElementById('portable');
  const notes = document.getElementById('notes');
  const retry = document.getElementById('retry');
  let loading = false;
  const disable = () => {
    for (const link of [installer, portable]) {
      link.removeAttribute('href');
      link.setAttribute('aria-disabled', 'true');
    }
  };
  async function load() {
    if (loading) return;
    loading = true;
    retry.hidden = true;
    disable();
    status.textContent = '正在连接发布服务。';
    try {
      const response = await fetch('./updates/latest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('release unavailable');
      const release = await response.json();
      const platform = release.platforms?.['windows-x86_64'];
      if (!/^\d+\.\d+\.\d+$/.test(release.version) || !platform?.signature) throw new Error('invalid release');
      const url = new URL(platform.url);
      const prefix = `/lolicode/releases/${release.version}/`;
      if (url.origin !== allowedOrigin || !url.pathname.startsWith(prefix) || !url.pathname.endsWith('.exe') || url.search || url.hash || url.username || url.password) throw new Error('invalid download URL');
      installer.href = url.href;
      installer.setAttribute('aria-disabled', 'false');
      const portableInfo = release.downloads?.['windows-x86_64-portable'];
      portable.hidden = !portableInfo;
      if (portableInfo) {
        const portableUrl = new URL(portableInfo.url);
        if (portableUrl.origin !== allowedOrigin || portableUrl.pathname !== `${prefix}LoliCode-Portable.zip` || portableUrl.search || portableUrl.hash || portableUrl.username || portableUrl.password) throw new Error('invalid portable URL');
        portable.href = portableUrl.href;
        portable.setAttribute('aria-disabled', 'false');
      }
      version.textContent = `LoliCode ${release.version}`;
      status.textContent = '正式版已发布，可以下载。';
      notes.textContent = typeof release.notes === 'string' && release.notes.trim() ? release.notes : '此版本包含功能改进与问题修复。';
    } catch {
      disable();
      version.textContent = '版本暂未读取成功';
      status.textContent = '暂时无法获取下载信息，请稍后重试。';
      notes.textContent = '发布说明暂不可用。';
      retry.hidden = false;
    } finally {
      loading = false;
    }
  }
  retry.addEventListener('click', () => void load());
  void load();
})();
