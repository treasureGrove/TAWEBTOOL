(function () {
  'use strict';

  const STORAGE_KEY = 'ta_wiki_custom_entries';
  const DATA_URL = '../data/ta_wiki_entries.json';

  const state = {
    all: [],
    filtered: [],
    currentId: ''
  };

  const searchInput = document.getElementById('wikiSearch');
  const categorySelect = document.getElementById('wikiCategory');
  const sourceSelect = document.getElementById('wikiSource');
  const statsEl = document.getElementById('wikiStats');
  const listEl = document.getElementById('wikiList');
  const contentEl = document.getElementById('wikiContent');
  const resultHint = document.getElementById('resultHint');

  function safeParse(text, fallback) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function assetPrefix() {
    return window.location.pathname.replace(/\\/g, '/').includes('/tools_html/') ? '../' : '';
  }

  async function loadGeneratedEntries() {
    try {
      const response = await fetch(assetPrefix() + 'data/ta_wiki_entries.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('TA wiki data fallback:', err);
      return Array.isArray(window.TAWikiBuiltinEntries) ? window.TAWikiBuiltinEntries : [];
    }
  }

  function getCustomEntries() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = safeParse(raw, []);
    return Array.isArray(data) ? data.map((item) => ({ ...item, source: item.source || 'custom' })) : [];
  }

  function normalizeEntry(item, index) {
    return {
      id: item.id || 'entry-' + index,
      title: String(item.title || '未命名条目'),
      category: String(item.category || '未分类'),
      tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [],
      summary: String(item.summary || ''),
      content: String(item.content || ''),
      source: item.source || 'generated',
      sourceTitle: item.sourceTitle || item.provider || '',
      sourceUrl: item.sourceUrl || item.url || '',
      quality: item.quality || 'draft',
      updatedAt: item.updatedAt || item.publishedAt || ''
    };
  }

  function dedupeEntries(entries) {
    const seen = new Set();
    const out = [];
    for (let i = 0; i < entries.length; i++) {
      const item = normalizeEntry(entries[i], i);
      const key = item.id || (item.title + '|' + item.category + '|' + item.sourceUrl);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function sourceLabel(source) {
    const map = {
      builtin: '内置',
      generated: '采集',
      collected: '采集',
      github: 'GitHub',
      rss: 'RSS',
      custom: '自定义',
      remote: '远端'
    };
    return map[source] || source || '未知';
  }

  function sourceBucket(source) {
    if (source === 'custom') return 'custom';
    if (source === 'builtin') return 'builtin';
    return 'generated';
  }

  function renderStats() {
    const counts = state.all.reduce((acc, item) => {
      const key = sourceBucket(item.source);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const categories = new Set(state.all.map((item) => item.category));
    statsEl.innerHTML = [
      statCard('总条目', state.all.length),
      statCard('分类', categories.size),
      statCard('自动采集', counts.generated || 0),
      statCard('自定义', counts.custom || 0)
    ].join('');
  }

  function statCard(label, value) {
    return '<div class="wiki-stat"><strong>' + escapeHtml(value) + '</strong><span>' + escapeHtml(label) + '</span></div>';
  }

  function buildCategories(entries) {
    const selected = categorySelect.value || '全部分类';
    const set = new Set(entries.map((item) => item.category).filter(Boolean));
    const options = ['全部分类'].concat(Array.from(set).sort());
    categorySelect.innerHTML = options
      .map((name) => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>')
      .join('');
    if (options.includes(selected)) categorySelect.value = selected;
  }

  function textBlob(item) {
    return [item.title, item.category, item.summary, item.content, item.tags.join(' '), item.sourceTitle].join(' ').toLowerCase();
  }

  function matchScore(item, terms) {
    const text = textBlob(item);
    let score = 0;
    for (let i = 0; i < terms.length; i++) {
      const term = terms[i].toLowerCase();
      if (!term) continue;
      if (!text.includes(term)) return -1;
      if (item.title.toLowerCase().includes(term)) score += 8;
      if (item.tags.join(' ').toLowerCase().includes(term)) score += 5;
      if (item.summary.toLowerCase().includes(term)) score += 3;
      score += 1;
    }
    return score;
  }

  function filterEntries() {
    const terms = searchInput.value.trim().split(/\s+/).filter(Boolean);
    const category = categorySelect.value;
    const source = sourceSelect.value;
    let base = state.all.slice();

    if (category && category !== '全部分类') {
      base = base.filter((item) => item.category === category);
    }

    if (source && source !== 'all') {
      base = base.filter((item) => sourceBucket(item.source) === source);
    }

    if (terms.length) {
      base = base
        .map((item) => ({ item, score: matchScore(item, terms) }))
        .filter((row) => row.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((row) => row.item);
    }

    state.filtered = base;
    renderList(base);
  }

  function renderList(entries) {
    resultHint.textContent = entries.length + ' 条结果';

    if (!entries.length) {
      listEl.innerHTML = '<div class="wiki-item empty"><h3>没有找到匹配内容</h3><p>换一个关键词、分类或来源。</p></div>';
      contentEl.innerHTML = '<div class="wiki-empty">没有匹配条目。</div>';
      return;
    }

    if (!state.currentId || !entries.find((item) => item.id === state.currentId)) {
      state.currentId = entries[0].id;
    }

    listEl.innerHTML = entries.map((item) => {
      const tags = item.tags.slice(0, 4).map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('');
      return [
        '<button type="button" class="wiki-item ' + (item.id === state.currentId ? 'active' : '') + '" data-id="' + escapeHtml(item.id) + '">',
        '<strong>' + escapeHtml(item.title) + '</strong>',
        '<small>' + escapeHtml(item.category) + ' / ' + escapeHtml(sourceLabel(item.source)) + '</small>',
        '<p>' + escapeHtml(item.summary || '暂无摘要') + '</p>',
        '<div class="wiki-tags">' + tags + '</div>',
        '</button>'
      ].join('');
    }).join('');

    renderContent(state.currentId);
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').split(/\r?\n/);
    let html = '';
    let inCode = false;
    let listOpen = false;
    let codeLines = [];

    function closeList() {
      if (listOpen) {
        html += '</ul>';
        listOpen = false;
      }
    }

    function inline(text) {
      return escapeHtml(text)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^```/.test(line.trim())) {
        if (inCode) {
          html += '<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>';
          codeLines = [];
          inCode = false;
        } else {
          closeList();
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      if (!line.trim()) {
        closeList();
        continue;
      }

      if (/^###\s+/.test(line)) {
        closeList();
        html += '<h3>' + inline(line.replace(/^###\s+/, '')) + '</h3>';
      } else if (/^##\s+/.test(line)) {
        closeList();
        html += '<h2>' + inline(line.replace(/^##\s+/, '')) + '</h2>';
      } else if (/^#\s+/.test(line)) {
        closeList();
        html += '<h1>' + inline(line.replace(/^#\s+/, '')) + '</h1>';
      } else if (/^>\s?/.test(line)) {
        closeList();
        html += '<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>';
      } else if (/^\s*[-*]\s+/.test(line)) {
        if (!listOpen) {
          html += '<ul>';
          listOpen = true;
        }
        html += '<li>' + inline(line.replace(/^\s*[-*]\s+/, '')) + '</li>';
      } else {
        closeList();
        html += '<p>' + inline(line) + '</p>';
      }
    }
    closeList();
    if (inCode) html += '<pre><code>' + escapeHtml(codeLines.join('\n')) + '</code></pre>';
    return html;
  }

  function renderContent(id) {
    const item = state.all.find((entry) => entry.id === id);
    if (!item) return;

    const tags = item.tags.map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('');
    const sourceLink = item.sourceUrl
      ? '<a href="' + escapeHtml(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看来源</a>'
      : '';

    contentEl.innerHTML = [
      '<div class="wiki-article-head">',
      '<div>',
      '<h1>' + escapeHtml(item.title) + '</h1>',
      '<p>' + escapeHtml(item.summary || '') + '</p>',
      '</div>',
      sourceLink,
      '</div>',
      '<div class="wiki-article-meta">',
      '<span>' + escapeHtml(item.category) + '</span>',
      '<span>' + escapeHtml(sourceLabel(item.source)) + '</span>',
      item.updatedAt ? '<span>' + escapeHtml(item.updatedAt) + '</span>' : '',
      item.quality ? '<span>' + escapeHtml(item.quality) + '</span>' : '',
      '</div>',
      '<div class="wiki-tags wiki-tags-large">' + tags + '</div>',
      '<div class="wiki-markdown">' + renderMarkdown(item.content) + '</div>'
    ].join('');

    const cards = listEl.querySelectorAll('.wiki-item');
    for (let i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', cards[i].dataset.id === id);
    }
  }

  async function init() {
    const generated = await loadGeneratedEntries();
    const custom = getCustomEntries();
    state.all = dedupeEntries(generated.concat(custom));
    buildCategories(state.all);
    renderStats();
    filterEntries();

    searchInput.addEventListener('input', filterEntries);
    categorySelect.addEventListener('change', filterEntries);
    sourceSelect.addEventListener('change', filterEntries);
    listEl.addEventListener('click', (event) => {
      const item = event.target.closest('.wiki-item');
      if (!item || !item.dataset.id) return;
      state.currentId = item.dataset.id;
      renderContent(state.currentId);
    });
  }

  init();
})();
