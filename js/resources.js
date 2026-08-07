(function () {
  'use strict';

  /* ============================================================
     TA 资源导航 - 页面渲染
     数据来源：window.TA_RESOURCES（由 resources_data.js 提供）
     搜索：使用 window.fuzzyBestScore 做模糊匹配 + 评分排序
     URL 参数：?kw=xxx 自动填充搜索框并过滤
     ============================================================ */

  function $(id) { return document.getElementById(id); }

  function getData() {
    return (window.TA_RESOURCES && window.TA_RESOURCES.length) ? window.TA_RESOURCES : [];
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function normalizeText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  // 给每条站点附加一个 _fields 数组，便于 fuzzyBestScore 调用
  function decorateSites() {
    var cats = getData();
    for (var i = 0; i < cats.length; i++) {
      var sites = cats[i].sites || [];
      for (var j = 0; j < sites.length; j++) {
        var s = sites[j];
        s._fields = [s.name, s.desc || ''].concat(s.keywords || []);
        s._kw = normalizeText(s._fields.join(' '));
      }
    }
  }

  function extractDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  }

  function countAll() {
    var total = 0;
    var cats = getData();
    for (var i = 0; i < cats.length; i++) total += (cats[i].sites || []).length;
    return total;
  }

  /* ---------- 渲染分类标签 ---------- */
  function renderCategoryTabs() {
    var box = $('resCats');
    if (!box) return;
    var cats = getData();
    var html = '<button class="res-cat-btn active" data-cat="all">全部<span class="res-cat-count">' + countAll() + '</span></button>';
    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      html += '<button class="res-cat-btn" data-cat="' + c.id + '">' +
        escapeHTML(c.name) +
        '<span class="res-cat-count">' + (c.sites || []).length + '</span>' +
        '</button>';
    }
    box.innerHTML = html;
  }

  /* ---------- 对单条站点计算 fuzzy 分数 ---------- */
  function scoreSite(site, keyword) {
    if (!keyword) return 1;
    if (typeof window.fuzzyBestScore !== 'function') {
      return site._kw.indexOf(keyword) >= 0 ? 1 : 0;
    }
    return window.fuzzyBestScore(keyword, site._fields);
  }

  /* ---------- 渲染卡片网格（支持模糊匹配 + 排序） ---------- */
  function renderGrid(filter) {
    filter = filter || { cat: 'all', kw: '' };
    var grid = $('resGrid');
    if (!grid) return;

    var cats = getData();
    var html = '';
    var shown = 0;
    var hasKeyword = !!filter.kw;

    for (var i = 0; i < cats.length; i++) {
      var c = cats[i];
      if (filter.cat !== 'all' && filter.cat !== c.id) continue;

      // 计算每条站点的分数
      var scored = [];
      var sites = c.sites || [];
      for (var j = 0; j < sites.length; j++) {
        var s = sites[j];
        var score = scoreSite(s, filter.kw);
        if (!hasKeyword || score > 0) {
          scored.push({ site: s, score: score });
        }
      }
      if (scored.length === 0) continue;

      // 有搜索词时按相关度降序，无搜索时保持原顺序
      if (hasKeyword) {
        scored.sort(function (a, b) {
          if (b.score !== a.score) return b.score - a.score;
          // 同分时按名字字母序
          return a.site.name.localeCompare(b.site.name, 'zh');
        });
      }

      shown += scored.length;

      html += '<section class="res-section" data-cat="' + c.id + '">' +
        '<header class="res-section-head">' +
        '<h2 class="res-section-title">' + escapeHTML(c.name) +
        '<span class="res-section-badge">' + scored.length + '</span></h2>' +
        '<p class="res-section-desc">' + escapeHTML(c.desc || '') + '</p>' +
        '</header>' +
        '<div class="res-cards">';

      for (var k = 0; k < scored.length; k++) {
        html += renderCard(scored[k].site);
      }

      html += '</div></section>';
    }

    if (!html) {
      html = '<div class="res-empty">未找到匹配的资源，换个关键词试试～</div>';
    }

    grid.innerHTML = html;

    var countEl = $('resCount');
    if (countEl) countEl.textContent = shown;
  }

  function renderCard(site) {
    var domain = extractDomain(site.url);
    var tagsHTML = '';
    if (site.free) {
      tagsHTML += '<span class="res-tag res-tag-free" title="免费">免费</span>';
    }
    if (site.lang) {
      tagsHTML += '<span class="res-tag res-tag-lang">' + escapeHTML(site.lang) + '</span>';
    }
    var favicon = 'https://icons.duckduckgo.com/ip3/' + domain + '.ico';
    var initials = site.icon || site.name.charAt(0).toUpperCase();

    return '<a class="res-card" href="' + escapeHTML(site.url) + '" target="_blank" rel="noopener noreferrer" ' +
      'data-kw="' + escapeHTML(site._kw) + '">' +
      '<span class="res-card-icon" aria-hidden="true">' +
        '<img class="res-card-favicon" alt="" src="' + favicon + '" ' +
          'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'res-card-icon-fallback\');" loading="lazy" decoding="async">' +
        '<span class="res-card-emoji">' + escapeHTML(initials) + '</span>' +
      '</span>' +
      '<span class="res-card-body">' +
        '<span class="res-card-title">' + escapeHTML(site.name) + '</span>' +
        '<span class="res-card-desc">' + escapeHTML(site.desc || '') + '</span>' +
        '<span class="res-card-meta">' +
          '<span class="res-card-domain">' + escapeHTML(domain) + '</span>' +
          tagsHTML +
        '</span>' +
      '</span>' +
      '<span class="res-card-arrow" aria-hidden="true">↗</span>' +
    '</a>';
  }

  /* ---------- 统计概览 ---------- */
  function renderStats() {
    var el = $('resStats');
    if (!el) return;
    var cats = getData();
    var catCount = cats.length;
    var siteCount = countAll();
    var freeCount = 0;
    for (var i = 0; i < cats.length; i++) {
      var sites = cats[i].sites || [];
      for (var j = 0; j < sites.length; j++) {
        if (sites[j].free) freeCount++;
      }
    }
    el.innerHTML =
      '<span class="res-stat-item"><span class="res-stat-num">' + catCount + '</span><span class="res-stat-label">分类</span></span>' +
      '<span class="res-stat-item"><span class="res-stat-num">' + siteCount + '</span><span class="res-stat-label">资源</span></span>' +
      '<span class="res-stat-item"><span class="res-stat-num">' + freeCount + '</span><span class="res-stat-label">免费</span></span>';
  }

  /* ---------- 从 URL ?kw=xxx 读取初始关键词 ---------- */
  function readInitialKeyword() {
    try {
      var params = new URLSearchParams(window.location.search);
      var kw = params.get('kw') || params.get('q') || '';
      return normalizeText(kw);
    } catch (e) {
      return '';
    }
  }

  /* ---------- 初始化交互 ---------- */
  function init() {
    decorateSites();

    renderStats();
    renderCategoryTabs();

    var currentFilter = { cat: 'all', kw: readInitialKeyword() };

    var searchEl = $('resSearch');
    if (searchEl) {
      if (currentFilter.kw) searchEl.value = currentFilter.kw;
      searchEl.addEventListener('input', function () {
        currentFilter.kw = normalizeText(searchEl.value);
        renderGrid(currentFilter);
      });
    }

    var catsEl = $('resCats');
    if (catsEl) {
      catsEl.addEventListener('click', function (event) {
        var btn = event.target.closest('.res-cat-btn');
        if (!btn) return;
        var btns = catsEl.querySelectorAll('.res-cat-btn');
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
        btn.classList.add('active');
        currentFilter.cat = btn.getAttribute('data-cat') || 'all';
        renderGrid(currentFilter);
      });
    }

    renderGrid(currentFilter);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
