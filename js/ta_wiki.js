(function () {
  const STORAGE_KEY = 'ta_wiki_custom_entries';
  const FORUM_CONFIG_KEY = 'ta_wiki_forum_config';

  const state = {
    all: [],
    filtered: [],
    currentId: ''
  };

  const searchInput = document.getElementById('wikiSearch');
  const categorySelect = document.getElementById('wikiCategory');
  const listEl = document.getElementById('wikiList');
  const contentEl = document.getElementById('wikiContent');
  const resultHint = document.getElementById('resultHint');
  const toolbarEl = document.querySelector('.wiki-toolbar');
  const layoutEl = document.querySelector('.wiki-layout');

  function safeParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function getForumConfig() {
    const raw = localStorage.getItem(FORUM_CONFIG_KEY);
    const data = safeParse(raw, {});
    return {
      externalWikiUrl: data.externalWikiUrl || '',
      externalLinkEnabled: Boolean(data.externalLinkEnabled),
      externalOnlyMode: Boolean(data.externalOnlyMode)
    };
  }

  function renderExternalLinkMode() {
    const config = getForumConfig();
    if (!config.externalLinkEnabled || !config.externalWikiUrl) {
      return;
    }

    const banner = document.createElement('div');
    banner.className = 'external-link-banner';
    banner.innerHTML = `
      <p>当前已接入外部知识库：<strong>${config.externalWikiUrl}</strong></p>
      <a href="${config.externalWikiUrl}" target="_blank" rel="noopener noreferrer">打开外部知识库</a>
    `;

    const panel = document.getElementById('panel');
    panel.insertBefore(banner, toolbarEl);

    if (config.externalOnlyMode) {
      toolbarEl.style.display = 'none';
      layoutEl.style.display = 'none';

      const onlyBox = document.createElement('section');
      onlyBox.className = 'external-only-box';
      onlyBox.innerHTML = `
        <h2>已启用外部知识库链接模式</h2>
        <p>此页面仅保留外部入口，本地知识条目已隐藏。点击下方按钮进入外部服务器。</p>
        <a href="${config.externalWikiUrl}" target="_blank" rel="noopener noreferrer">前往外部知识库</a>
      `;
      panel.appendChild(onlyBox);
      return true;
    }

    return false;
  }

  function getCustomEntries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = safeParse(raw, []);
    return Array.isArray(data) ? data : [];
  }

  function getAllEntries() {
    const builtin = Array.isArray(window.TAWikiBuiltinEntries) ? window.TAWikiBuiltinEntries : [];
    const custom = getCustomEntries();
    return builtin.concat(custom);
  }

  function buildCategories(entries) {
    const set = new Set(entries.map((item) => item.category).filter(Boolean));
    const options = ['全部分类'].concat(Array.from(set).sort());
    categorySelect.innerHTML = options
      .map((name) => `<option value="${name}">${name}</option>`)
      .join('');
  }

  function renderList(entries) {
    if (!entries.length) {
      listEl.innerHTML = '<div class="wiki-item"><h3>没有找到匹配内容</h3><p>请尝试更换关键词或分类。</p></div>';
      contentEl.innerHTML = '没有匹配条目。';
      resultHint.textContent = '0 条结果';
      return;
    }

    resultHint.textContent = `共 ${entries.length} 条结果`;

    listEl.innerHTML = entries.map((item) => `
      <div class="wiki-item ${item.id === state.currentId ? 'active' : ''}" data-id="${item.id}">
        <h3>${item.title}</h3>
        <p>${item.summary || ''}</p>
      </div>
    `).join('');

    if (!state.currentId || !entries.find((x) => x.id === state.currentId)) {
      state.currentId = entries[0].id;
    }

    renderContent(state.currentId, entries);
  }

  function renderContent(id, entries) {
    const item = entries.find((x) => x.id === id);
    if (!item) return;

    const tags = Array.isArray(item.tags) ? item.tags.join(' / ') : '';
    const markdown = `# ${item.title}\n\n> 分类：${item.category || '未分类'}  ${tags ? `| 标签：${tags}` : ''}\n\n${item.content || ''}`;
    contentEl.innerHTML = marked.parse(markdown);

    const cards = listEl.querySelectorAll('.wiki-item');
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', cards[i].dataset.id === id);
    }
  }

  function filterEntries() {
    const keyword = searchInput.value.trim();
    const category = categorySelect.value;
    const base = category && category !== '全部分类'
      ? state.all.filter((item) => item.category === category)
      : state.all.slice();

    if (!keyword) {
      state.filtered = base;
      renderList(state.filtered);
      return;
    }

    const fuse = new Fuse(base, {
      keys: ['title', 'summary', 'content', 'tags', 'category'],
      threshold: 0.35,
      ignoreLocation: true,
      minMatchCharLength: 1
    });

    state.filtered = fuse.search(keyword).map((r) => r.item);
    renderList(state.filtered);
  }

  function init() {
    const onlyExternal = renderExternalLinkMode();
    if (onlyExternal) return;

    state.all = getAllEntries();
    buildCategories(state.all);
    state.filtered = state.all.slice();
    renderList(state.filtered);

    searchInput.addEventListener('input', filterEntries);
    categorySelect.addEventListener('change', filterEntries);

    listEl.addEventListener('click', (event) => {
      const item = event.target.closest('.wiki-item');
      if (!item) return;
      state.currentId = item.dataset.id;
      renderContent(state.currentId, state.filtered);
    });
  }

  init();
})();
