(function () {
  'use strict';

  const state = {
    all: [],
    filtered: [],
    currentId: '',
    mode: 'all'
  };

  const searchInput = document.getElementById('wikiSearch');
  const categorySelect = document.getElementById('wikiCategory');
  const sourceSelect = document.getElementById('wikiSource');
  const statsEl = document.getElementById('wikiStats');
  const topicsEl = document.getElementById('wikiTopics');
  const modesEl = document.getElementById('wikiModes');
  const listEl = document.getElementById('wikiList');
  const contentEl = document.getElementById('wikiContent');
  const resultHint = document.getElementById('resultHint');

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

  async function loadCollectedEntries() {
    try {
      const response = await fetch(assetPrefix() + 'data/ta_wiki_entries.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.warn('TA wiki data fallback:', err);
      return [];
    }
  }

  function getBuiltinEntries() {
    return Array.isArray(window.TAWikiBuiltinEntries) ? window.TAWikiBuiltinEntries : [];
  }

  function normalizeEntry(item, index) {
    const source = item.source || 'generated';
    const sourceUrl = item.sourceUrl || item.url || '';
    const quality = item.quality || 'draft';
    return {
      id: item.id || 'entry-' + index,
      title: String(item.title || '未命名条目'),
      category: String(item.category || '未分类'),
      tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean) : [],
      summary: String(item.summary || ''),
      content: String(item.content || ''),
      source,
      sourceTitle: item.sourceTitle || item.provider || '',
      sourceUrl,
      quality,
      updatedAt: item.updatedAt || item.publishedAt || '',
      aiModel: item.aiModel || '',
      filterReason: item.filterReason || '',
      entryType: inferEntryType(source, quality, sourceUrl)
    };
  }

  function inferEntryType(source, quality, sourceUrl) {
    if (source === 'builtin') return 'knowledge';
    if (quality === 'ai-draft') return 'ai';
    return sourceUrl ? 'article' : 'knowledge';
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
      search: '网络发现',
      github: 'GitHub',
      rss: 'RSS',
      remote: '远端'
    };
    return map[source] || source || '未知';
  }

  function typeLabel(type) {
    const map = {
      knowledge: '基础知识',
      article: '外部文章',
      ai: 'AI整理'
    };
    return map[type] || '条目';
  }

  function qualityLabel(item) {
    if (item.source === 'builtin') return '内置校对';
    if (item.quality === 'ai-draft') return 'DeepSeek 整理';
    if (item.quality === 'draft') return '自动草稿';
    return item.quality || '自动整理';
  }

  function sourceBucket(source) {
    if (source === 'builtin') return 'builtin';
    return 'generated';
  }

  function renderStats() {
    const counts = state.all.reduce((acc, item) => {
      const key = item.entryType;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const categories = new Set(state.all.map((item) => item.category));
    statsEl.innerHTML = [
      statCard('总条目', state.all.length),
      statCard('分类', categories.size),
      statCard('基础知识', counts.knowledge || 0),
      statCard('外部文章', (counts.article || 0) + (counts.ai || 0))
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

  function renderTopics() {
    const categoryCounts = new Map();
    const tagCounts = new Map();
    state.all.forEach((item) => {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) || 0) + 1);
      item.tags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
    });

    const categories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const tags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    topicsEl.innerHTML = [
      '<div class="wiki-topic-block"><strong>专题入口</strong><div>',
      categories.map(([name, count]) => (
        '<button type="button" data-category="' + escapeHtml(name) + '">' +
        escapeHtml(name) + '<span>' + escapeHtml(count) + '</span></button>'
      )).join(''),
      '</div></div>',
      '<div class="wiki-topic-block"><strong>高频标签</strong><div>',
      tags.map(([name, count]) => (
        '<button type="button" data-tag="' + escapeHtml(name) + '">' +
        escapeHtml(name) + '<span>' + escapeHtml(count) + '</span></button>'
      )).join(''),
      '</div></div>'
    ].join('');
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
    const mode = state.mode;
    let base = state.all.slice();

    if (mode !== 'all') {
      base = base.filter((item) => item.entryType === mode);
    }

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
    resultHint.textContent = entries.length + ' 条';

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
        '<em>' + escapeHtml(typeLabel(item.entryType)) + '</em>',
        '<strong>' + escapeHtml(item.title) + '</strong>',
        '<small>' + escapeHtml(item.category) + ' / ' + escapeHtml(sourceLabel(item.source)) + ' / ' + escapeHtml(qualityLabel(item)) + '</small>',
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
    const headingCount = {};

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

    function headingId(text) {
      const base = String(text || '')
        .trim()
        .toLowerCase()
        .replace(/<[^>]+>/g, '')
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
      headingCount[base] = (headingCount[base] || 0) + 1;
      return headingCount[base] === 1 ? base : base + '-' + headingCount[base];
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
        const text = line.replace(/^###\s+/, '');
        html += '<h3 id="' + escapeHtml(headingId(text)) + '">' + inline(text) + '</h3>';
      } else if (/^##\s+/.test(line)) {
        closeList();
        const text = line.replace(/^##\s+/, '');
        html += '<h2 id="' + escapeHtml(headingId(text)) + '">' + inline(text) + '</h2>';
      } else if (/^#\s+/.test(line)) {
        closeList();
        const text = line.replace(/^#\s+/, '');
        html += '<h1 id="' + escapeHtml(headingId(text)) + '">' + inline(text) + '</h1>';
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

  function extractHeadings(markdown) {
    const seen = {};
    return String(markdown || '').split(/\r?\n/).reduce((out, line) => {
      const match = /^(##|###)\s+(.+)$/.exec(line.trim());
      if (!match) return out;
      const text = match[2].trim();
      const base = text
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';
      seen[base] = (seen[base] || 0) + 1;
      out.push({
        level: match[1].length,
        text,
        id: seen[base] === 1 ? base : base + '-' + seen[base]
      });
      return out;
    }, []);
  }

  function renderToc(item) {
    const headings = extractHeadings(item.content).slice(0, 12);
    if (!headings.length) return '<p class="wiki-empty">暂无目录</p>';
    return '<nav class="wiki-toc">' + headings.map((heading) => (
      '<a class="level-' + escapeHtml(heading.level) + '" href="#' + escapeHtml(heading.id) + '">' +
      escapeHtml(heading.text) +
      '</a>'
    )).join('') + '</nav>';
  }

  function relatedEntries(item) {
    const tagSet = new Set(item.tags);
    return state.all
      .filter((entry) => entry.id !== item.id)
      .map((entry) => {
        const tagScore = entry.tags.reduce((score, tag) => score + (tagSet.has(tag) ? 2 : 0), 0);
        const categoryScore = entry.category === item.category ? 3 : 0;
        return { entry, score: tagScore + categoryScore };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((row) => row.entry);
  }

  function renderRelated(item) {
    const related = relatedEntries(item);
    if (!related.length) return '<p class="wiki-empty">暂无相关条目</p>';
    return [
      '<div class="wiki-related">',
      related.map((entry) => [
        '<button type="button" data-related-id="' + escapeHtml(entry.id) + '">',
        '<span>' + escapeHtml(typeLabel(entry.entryType)) + '</span>',
        '<strong>' + escapeHtml(entry.title) + '</strong>',
        '<small>' + escapeHtml(entry.category) + '</small>',
        '</button>'
      ].join('')).join(''),
      '</div>'
    ].join('');
  }

  function renderContent(id) {
    const item = state.all.find((entry) => entry.id === id);
    if (!item) return;

    const tags = item.tags.map((tag) => '<span>' + escapeHtml(tag) + '</span>').join('');
    const sourceLink = item.sourceUrl
      ? '<a href="' + escapeHtml(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer">查看来源</a>'
      : '';

    contentEl.classList.add('transitioning');

    const html = [
      '<div class="wiki-doc-shell">',
      '<main class="wiki-doc-main">',
      '<div class="wiki-article-head">',
      '<h1>' + escapeHtml(item.title) + '</h1>',
      '<p>' + escapeHtml(item.summary || '') + '</p>',
      '<div class="wiki-article-meta">',
      '<span>' + escapeHtml(typeLabel(item.entryType)) + '</span>',
      '<span>' + escapeHtml(item.category) + '</span>',
      '<span>' + escapeHtml(sourceLabel(item.source)) + '</span>',
      item.updatedAt ? '<span>' + escapeHtml(item.updatedAt) + '</span>' : '',
      '<span>' + escapeHtml(qualityLabel(item)) + '</span>',
      item.aiModel ? '<span>' + escapeHtml(item.aiModel) + '</span>' : '',
      '</div>',
      '<div class="wiki-tags wiki-tags-large">' + tags + '</div>',
      sourceLink ? sourceLink.replace('<a ', '<a class="wiki-source-link" ') : '',
      '</div>',
      '<div class="wiki-markdown">' + renderMarkdown(item.content) + '</div>',
      '</main>',
      '<aside class="wiki-doc-side">',
      '<section class="wiki-side-section"><h2>本文目录</h2>' + renderToc(item) + '</section>',
      '<section class="wiki-side-section"><h2>相关条目</h2>' + renderRelated(item) + '</section>',
      '</aside>',
      '</div>'
    ].join('');

    contentEl.innerHTML = html;
    contentEl.scrollTop = 0;

    requestAnimationFrame(function () {
      contentEl.classList.remove('transitioning');
    });

    var cards = listEl.querySelectorAll('.wiki-item');
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle('active', cards[i].dataset.id === id);
    }

    scrollActiveIntoView();
  }

  function scrollActiveIntoView() {
    var activeCard = listEl.querySelector('.wiki-item.active');
    if (!activeCard) return;
    var listRect = listEl.getBoundingClientRect();
    var cardRect = activeCard.getBoundingClientRect();
    if (cardRect.top < listRect.top || cardRect.bottom > listRect.bottom) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  async function init() {
    const builtin = getBuiltinEntries();
    const collected = await loadCollectedEntries();
    state.all = dedupeEntries(builtin.concat(collected));
    buildCategories(state.all);
    renderStats();
    renderTopics();
    filterEntries();

    searchInput.addEventListener('input', debounce(filterEntries, 180));
    categorySelect.addEventListener('change', filterEntries);
    sourceSelect.addEventListener('change', filterEntries);
    modesEl.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-mode]');
      if (!btn) return;
      state.mode = btn.dataset.mode;
      Array.from(modesEl.querySelectorAll('button')).forEach((item) => {
        item.classList.toggle('active', item === btn);
      });
      filterEntries();
    });
    topicsEl.addEventListener('click', (event) => {
      const categoryBtn = event.target.closest('button[data-category]');
      const tagBtn = event.target.closest('button[data-tag]');
      if (categoryBtn) {
        categorySelect.value = categoryBtn.dataset.category;
        filterEntries();
      }
      if (tagBtn) {
        searchInput.value = tagBtn.dataset.tag;
        filterEntries();
      }
    });
    listEl.addEventListener('click', (event) => {
      const item = event.target.closest('.wiki-item');
      if (!item || !item.dataset.id) return;
      state.currentId = item.dataset.id;
      renderContent(state.currentId);
    });
    contentEl.addEventListener('click', (event) => {
      const related = event.target.closest('button[data-related-id]');
      if (!related) return;
      state.currentId = related.dataset.relatedId;
      renderContent(state.currentId);
    });
  }

  init();
})();
