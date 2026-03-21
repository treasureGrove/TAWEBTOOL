(function () {
  const STORAGE_KEY = 'ta_wiki_custom_entries';
  const FORUM_CONFIG_KEY = 'ta_wiki_forum_config';

  const form = document.getElementById('entryForm');
  const formMsg = document.getElementById('formMsg');
  const syncMsg = document.getElementById('syncMsg');
  const entryList = document.getElementById('entryList');
  const entryCount = document.getElementById('entryCount');
  const clearAllBtn = document.getElementById('clearAll');
  const exportJsonBtn = document.getElementById('exportJson');

  const forumReadApiUrlInput = document.getElementById('forumReadApiUrl');
  const forumWriteApiUrlInput = document.getElementById('forumWriteApiUrl');
  const forumTokenInput = document.getElementById('forumToken');
  const externalWikiUrlInput = document.getElementById('externalWikiUrl');
  const externalLinkEnabledInput = document.getElementById('externalLinkEnabled');
  const externalOnlyModeInput = document.getElementById('externalOnlyMode');
  const saveForumConfigBtn = document.getElementById('saveForumConfig');
  const testForumConnectionBtn = document.getElementById('testForumConnection');
  const pullFromRemoteBtn = document.getElementById('pullFromRemote');
  const pushLatestBtn = document.getElementById('pushLatest');

  function safeParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function loadEntries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = safeParse(raw, []);
    return Array.isArray(data) ? data : [];
  }

  function saveEntries(entries) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }

  function loadForumConfig() {
    const raw = localStorage.getItem(FORUM_CONFIG_KEY);
    const data = safeParse(raw, {});
    return {
      readApiUrl: data.readApiUrl || '',
      writeApiUrl: data.writeApiUrl || '',
      token: data.token || '',
      externalWikiUrl: data.externalWikiUrl || '',
      externalLinkEnabled: Boolean(data.externalLinkEnabled),
      externalOnlyMode: Boolean(data.externalOnlyMode)
    };
  }

  function saveForumConfig(config) {
    localStorage.setItem(FORUM_CONFIG_KEY, JSON.stringify(config));
  }

  function createId(prefix) {
    const head = prefix || 'custom';
    return `${head}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function buildHeaders() {
    const token = forumTokenInput.value.trim();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  function normalizeRemoteEntries(payload) {
    if (!Array.isArray(payload)) return [];

    const normalized = [];
    for (let i = 0; i < payload.length; i++) {
      const item = payload[i] || {};
      if (!item.title || !item.category || !item.content) continue;
      normalized.push({
        id: createId('remote'),
        remoteId: item.id || item.remoteId || '',
        title: String(item.title).trim(),
        category: String(item.category).trim(),
        tags: Array.isArray(item.tags) ? item.tags.map((x) => String(x).trim()).filter(Boolean) : [],
        summary: item.summary ? String(item.summary).trim() : '',
        content: String(item.content),
        source: 'remote'
      });
    }
    return normalized;
  }

  function mergeEntries(localEntries, remoteEntries) {
    const exists = new Set();
    for (let i = 0; i < localEntries.length; i++) {
      const item = localEntries[i];
      exists.add(`${item.title}||${item.category}||${item.content}`);
      if (item.remoteId) exists.add(`remoteId:${item.remoteId}`);
    }

    const merged = localEntries.slice();
    let added = 0;
    for (let i = 0; i < remoteEntries.length; i++) {
      const item = remoteEntries[i];
      const key = `${item.title}||${item.category}||${item.content}`;
      const remoteKey = item.remoteId ? `remoteId:${item.remoteId}` : '';
      if (exists.has(key) || (remoteKey && exists.has(remoteKey))) continue;
      merged.unshift(item);
      exists.add(key);
      if (remoteKey) exists.add(remoteKey);
      added += 1;
    }

    return { merged, added };
  }

  async function fetchRemoteEntries() {
    const readApiUrl = forumReadApiUrlInput.value.trim();
    if (!readApiUrl) throw new Error('请先填写读取 API 地址。');

    const response = await fetch(readApiUrl, {
      method: 'GET',
      headers: buildHeaders()
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`读取失败 HTTP ${response.status}: ${text || '远端返回错误'}`);
    }

    const payload = await response.json();
    return normalizeRemoteEntries(payload);
  }

  async function postToRemote(entry) {
    const writeApiUrl = forumWriteApiUrlInput.value.trim();
    if (!writeApiUrl) throw new Error('请先填写写入 API 地址。');

    const response = await fetch(writeApiUrl, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        title: entry.title,
        category: entry.category,
        tags: entry.tags || [],
        summary: entry.summary || '',
        content: entry.content || '',
        source: 'TAWEBTOOL'
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`写入失败 HTTP ${response.status}: ${text || '远端返回错误'}`);
    }
  }

  function render() {
    const entries = loadEntries();
    entryCount.textContent = `${entries.length} 条`;

    if (!entries.length) {
      entryList.innerHTML = '<p>暂无自定义条目。</p>';
      return;
    }

    entryList.innerHTML = entries.map((item) => `
      <div class="entry-row" data-id="${item.id}">
        <strong>${item.title}</strong>
        <p>分类：${item.category || '未分类'} ｜ 标签：${(item.tags || []).join(', ') || '无'}</p>
        <button type="button" data-remove="${item.id}">删除</button>
      </div>
    `).join('');
  }

  function initForumConfig() {
    const cfg = loadForumConfig();
    forumReadApiUrlInput.value = cfg.readApiUrl;
    forumWriteApiUrlInput.value = cfg.writeApiUrl;
    forumTokenInput.value = cfg.token;
    externalWikiUrlInput.value = cfg.externalWikiUrl;
    externalLinkEnabledInput.checked = cfg.externalLinkEnabled;
    externalOnlyModeInput.checked = cfg.externalOnlyMode;
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    const title = document.getElementById('title').value.trim();
    const category = document.getElementById('category').value.trim();
    const tags = document.getElementById('tags').value.trim();
    const summary = document.getElementById('summary').value.trim();
    const content = document.getElementById('content').value.trim();

    if (!title || !category || !content) {
      formMsg.textContent = '请填写标题、分类和正文。';
      return;
    }

    const entries = loadEntries();
    entries.unshift({
      id: createId('custom'),
      title,
      category,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      summary,
      content,
      source: 'local'
    });

    saveEntries(entries);
    form.reset();
    formMsg.textContent = '保存成功，返回 TA知识库 页面即可搜索到新内容。';
    render();
  });

  entryList.addEventListener('click', function (event) {
    const id = event.target.getAttribute('data-remove');
    if (!id) return;

    const entries = loadEntries().filter((item) => item.id !== id);
    saveEntries(entries);
    render();
  });

  clearAllBtn.addEventListener('click', function () {
    localStorage.removeItem(STORAGE_KEY);
    render();
    formMsg.textContent = '已清空全部自定义条目。';
  });

  exportJsonBtn.addEventListener('click', function () {
    const entries = loadEntries();
    downloadJson('ta-wiki-custom-entries.json', entries);
    formMsg.textContent = `已导出 ${entries.length} 条自定义知识为 JSON。`;
  });

  saveForumConfigBtn.addEventListener('click', function () {
    const config = {
      readApiUrl: forumReadApiUrlInput.value.trim(),
      writeApiUrl: forumWriteApiUrlInput.value.trim(),
      token: forumTokenInput.value.trim(),
      externalWikiUrl: externalWikiUrlInput.value.trim(),
      externalLinkEnabled: externalLinkEnabledInput.checked,
      externalOnlyMode: externalOnlyModeInput.checked
    };
    saveForumConfig(config);
    syncMsg.textContent = '远端权限与外部链接配置已保存到当前浏览器。';
  });

  testForumConnectionBtn.addEventListener('click', async function () {
    try {
      const items = await fetchRemoteEntries();
      syncMsg.textContent = `读取成功：远端返回 ${items.length} 条可用知识。`;
    } catch (err) {
      syncMsg.textContent = `读取失败：${err.message}`;
    }
  });

  pullFromRemoteBtn.addEventListener('click', async function () {
    try {
      const remoteEntries = await fetchRemoteEntries();
      const localEntries = loadEntries();
      const result = mergeEntries(localEntries, remoteEntries);
      saveEntries(result.merged);
      render();
      syncMsg.textContent = `拉取完成：新增 ${result.added} 条，当前本地共 ${result.merged.length} 条。`;
    } catch (err) {
      syncMsg.textContent = `拉取失败：${err.message}`;
    }
  });

  pushLatestBtn.addEventListener('click', async function () {
    const entries = loadEntries();
    if (!entries.length) {
      syncMsg.textContent = '没有可推送的自定义条目，请先新增或先拉取。';
      return;
    }

    try {
      await postToRemote(entries[0]);
      syncMsg.textContent = `推送成功：${entries[0].title}`;
    } catch (err) {
      syncMsg.textContent = `推送失败：${err.message}`;
    }
  });

  initForumConfig();
  render();
})();
