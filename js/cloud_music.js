/* ============================================================
   TA工具箱 - 和我一起听（网易云音乐）
   API: 自部署 NeteaseCloudMusicApi @ tools.treasuregrove.art/music
   功能：扫码登录 / 用户歌单 / 每日推荐 / 私人FM / 完整播放器
   ============================================================ */
(function () {
  'use strict';

  var API_BASE = 'https://tools.treasuregrove.art/music';
  var LS_COOKIE_KEY = 'tawebtool.music.cookie';

  var USER_ID = 131100731; // 站长网易云 uid（用于公开歌单）
  var DOMAIN = /^https?:\/\/([^/]+)/i;

  /* ── 全局状态 ── */
  var state = {
    profile: null,          // { nickname, userId, avatarUrl }
    playlists: [],          // 用户歌单列表
    activeSource: 'playlist', // 'playlist' | 'daily' | 'fm'
    activePlaylistId: null,
    tracks: [],             // 当前列表
    activeIndex: 0,
    playing: false,
    loading: false,
    statusText: '',
    search: ''
  };

  /* ── DOM helpers ── */
  function $(id) { return document.getElementById(id); }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60).toString().padStart(2, '0');
    var s = (sec % 60).toString().padStart(2, '0');
    return m + ':' + s;
  }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* ── API helpers ── */
  async function apiGet(path, params) {
    var url = API_BASE + path;
    if (params && Object.keys(params).length) {
      var qs = new URLSearchParams();
      Object.keys(params).forEach(function (k) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') qs.set(k, params[k]);
      });
      url += '?' + qs.toString();
    }
    var res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var json = await res.json();
    if (json.code !== 200) throw new Error(json.message || json.msg || '接口错误 ' + json.code);
    return json;
  }

  // 处理歌曲直链：http -> https
  function toHttps(url) {
    if (!url) return '';
    return url.replace(/^http:/i, 'https:');
  }

  /* ── 数据规范化 ── */
  function normSong(raw) {
    var s = raw.song || raw;
    var ar = s.ar || s.artists || [];
    return {
      id: s.id,
      name: s.name,
      artist: ar.map(function (a) { return a.name; }).join(' / ') || s.artist || '未知',
      album: (s.al && s.al.name) || (s.album && s.album.name) || '',
      pic: (s.al && s.al.picUrl) || (s.album && s.album.picUrl) || (s.picUrl) || '',
      duration: s.dt || s.duration || 0,
      url: ''
    };
  }

  /* ── 状态渲染 ── */
  function render() {
    renderHeader();
    renderSources();
    renderTrackList();
    renderPlayer();
  }

  function renderHeader() {
    var me = state.profile;
    var el = $('cmAccount');
    if (!el) return;
    if (me) {
      el.innerHTML =
        '<img class="cm-avatar" src="' + escapeHTML(toHttps(me.avatarUrl)) + '" alt="">' +
        '<span class="cm-account-name">' + escapeHTML(me.nickname) + '</span>' +
        '<button id="cmLogoutBtn" class="cm-btn cm-btn-ghost cm-btn-sm">退出</button>';
      var logout = $('cmLogoutBtn');
      if (logout) logout.addEventListener('click', logoutAccount);
    } else {
      el.innerHTML = '<button id="cmLoginBtn" class="cm-btn cm-btn-ghost cm-btn-sm">扫码登录</button>';
      var login = $('cmLoginBtn');
      if (login) login.addEventListener('click', openLoginModal);
    }
  }

  function renderSources() {
    var el = $('cmSources');
    if (!el) return;
    var tabs = [
      { id: 'playlist', name: '歌单' },
      { id: 'daily', name: '每日推荐' },
      { id: 'fm', name: '私人FM' }
    ];
    el.innerHTML = tabs.map(function (t) {
      return '<button class="cm-source-btn' + (state.activeSource === t.id ? ' active' : '') + '" data-source="' + t.id + '">' + t.name + '</button>';
    }).join('');
    el.querySelectorAll('.cm-source-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.activeSource = btn.dataset.source;
        loadSource();
      });
    });
  }

  function renderTrackList() {
    var el = $('cmTrackList');
    if (!el) return;
    if (state.loading) {
      el.innerHTML = '<div class="cm-empty">加载中...</div>';
      return;
    }
    if (!state.tracks.length) {
      el.innerHTML = '<div class="cm-empty">暂无歌曲</div>';
      return;
    }
    var kw = state.search.toLowerCase().trim();
    var html = '';
    var shown = 0;
    state.tracks.forEach(function (t, i) {
      if (kw && !(t.name + ' ' + t.artist).toLowerCase().includes(kw)) return;
      shown++;
      html +=
        '<div class="cm-track-item' + (i === state.activeIndex ? ' active' : '') + '" data-index="' + i + '">' +
        '<span class="cm-track-idx">' + (i + 1) + '</span>' +
        '<img class="cm-track-pic" src="' + escapeHTML(toHttps(t.pic)) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<span class="cm-track-info">' +
        '<span class="cm-track-name">' + escapeHTML(t.name) + '</span>' +
        '<span class="cm-track-artist">' + escapeHTML(t.artist) + '</span>' +
        '</span>' +
        '<span class="cm-track-dur">' + fmtTime(t.duration / 1000) + '</span>' +
        '</div>';
    });
    el.innerHTML = shown ? html : '<div class="cm-empty">未找到匹配的歌曲</div>';

    el.querySelectorAll('.cm-track-item').forEach(function (item) {
      item.addEventListener('click', function () {
        state.activeIndex = Number(item.dataset.index);
        state.playing = true;
        play();
      });
    });
  }

  function renderPlayer() {
    var cur = state.tracks[state.activeIndex] || {};

    // 头部小黑胶封面装饰
    var coverEl = $('vinylCover');
    if (coverEl) coverEl.style.backgroundImage = cur.pic ? 'url(' + toHttps(cur.pic) + ')' : '';
    var vinyl = $('vinyl');
    if (vinyl) vinyl.classList.toggle('spinning', state.playing);

    // 右侧大封面 + 播放信息
    var ctlName = $('cmControlName');
    var ctlArtist = $('cmControlArtist');
    var ctlImg = $('cmCoverImg');
    if (ctlName) ctlName.textContent = cur.name || '选择一首歌';
    if (ctlArtist) ctlArtist.textContent = cur.artist || '开始你的音乐之旅';
    if (ctlImg) ctlImg.src = cur.pic ? toHttps(cur.pic) : '';
    var disc = $('cmCoverDisc');
    if (disc) disc.classList.toggle('spinning', state.playing);

    // 动态氛围背景（封面模糊，通过 CSS 变量注入避免覆盖遮罩）
    var ambient = $('cmAmbient');
    if (ambient) {
      ambient.style.setProperty('--cm-cover', cur.pic
        ? 'url("' + toHttps(cur.pic) + '")'
        : 'none');
    }

    // 播放/暂停 SVG 图标切换
    var toggle = $('cmPlayBtn');
    if (toggle) {
      var playIcon = toggle.querySelector('.cm-ico-play');
      var pauseIcon = toggle.querySelector('.cm-ico-pause');
      if (playIcon) playIcon.style.display = state.playing ? 'none' : '';
      if (pauseIcon) pauseIcon.style.display = state.playing ? '' : 'none';
    }
  }

  /* ── 播放逻辑 ── */
  var audio = new Audio();
  var audioReady = false;

  function audioEvents() {
    var prog = $('cmProgress');
    var curEl = $('cmTimeCur');
    var durEl = $('cmTimeDur');

    audio.ontimeupdate = function () {
      var d = audio.duration || 0;
      if (curEl) curEl.textContent = fmtTime(audio.currentTime);
      if (durEl) durEl.textContent = fmtTime(d);
      if (prog) {
        var pct = d ? (audio.currentTime / d) * 100 : 0;
        prog.value = pct;
        prog.style.setProperty('--value', pct + '%');
      }
    };
    audio.onloadedmetadata = function () {
      if (durEl) durEl.textContent = fmtTime(audio.duration || 0);
    };
    audio.onended = function () {
      next();
    };
    audio.onplay = function () {
      state.playing = true;
      render();
    };
    audio.onpause = function () {
      state.playing = false;
      render();
    };
    audio.onerror = function () {
      state.statusText = '播放失败：该歌曲可能受版权或 VIP 限制';
      renderStatus();
    };

    if (prog) {
      prog.addEventListener('input', function () {
        if (audio.duration) audio.currentTime = (prog.value / 100) * audio.duration;
      });
    }
  }

  async function loadTrackUrl(t) {
    if (t.url) return t.url;
    var data = await apiGet('/song/url', { id: t.id, br: 320000 });
    var url = data.data && data.data[0] ? data.data[0].url : '';
    t.url = toHttps(url);
    return t.url;
  }

  async function play() {
    var cur = state.tracks[state.activeIndex];
    if (!cur) return;
    try {
      state.statusText = '正在加载歌曲...';
      renderStatus();
      var url = await loadTrackUrl(cur);
      if (!url) {
        state.statusText = '无法获取播放地址（可能需 VIP）';
        renderStatus();
        return;
      }
      if (audio.src !== url) {
        audio.src = url;
        audio.load();
      }
      await audio.play();
      state.playing = true;
      state.statusText = '正在播放：' + cur.name;
      render();
    } catch (e) {
      state.playing = false;
      state.statusText = '播放失败：' + e.message;
      renderStatus();
    }
  }

  function prev() {
    if (!state.tracks.length) return;
    state.activeIndex = (state.activeIndex - 1 + state.tracks.length) % state.tracks.length;
    state.playing = true;
    play();
  }

  function next() {
    if (!state.tracks.length) return;
    state.activeIndex = (state.activeIndex + 1) % state.tracks.length;
    state.playing = true;
    play();
  }

  function togglePlay() {
    if (audio.src && !audio.paused) {
      audio.pause();
      state.playing = false;
    } else if (audio.src) {
      audio.play().catch(function () {});
      state.playing = true;
    } else {
      state.playing = true;
      play();
    }
    render();
  }

  /* ── 内容源加载 ── */
  function loadSource() {
    if (state.activeSource === 'playlist') {
      loadPlaylists();
    } else if (state.activeSource === 'daily') {
      loadDaily();
    } else if (state.activeSource === 'fm') {
      loadFM();
    }
  }

  async function loadPlaylists() {
    state.loading = true;
    state.statusText = '正在加载歌单...';
    renderStatus();
    try {
      var uid = state.profile ? state.profile.userId : USER_ID;
      var data = await apiGet('/user/playlist', { uid: uid, limit: 100 });
      state.playlists = data.playlist || [];
      // 加载当前选中的歌单（或默认第一个非收藏歌单）
      var target = state.activePlaylistId;
      if (!target || !state.playlists.some(function (p) { return p.id === target; })) {
        var favorite = state.playlists.find(function (p) { return String(p.name).indexOf('喜欢的音乐') >= 0; });
        target = favorite ? favorite.id : (state.playlists[0] ? state.playlists[0].id : null);
      }
      if (!target) {
        state.tracks = [];
        state.statusText = '没有可用歌单';
        renderStatus();
        render();
        return;
      }
      renderPlaylistSelect();
      var selWrap = $('cmPlaylistSelectWrap');
      if (selWrap) selWrap.style.display = 'block';
      await loadPlaylistTracks(target);
    } catch (e) {
      state.statusText = '加载歌单失败：' + e.message;
      renderStatus();
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadPlaylistTracks(id) {
    state.activePlaylistId = id;
    state.loading = true;
    state.statusText = '正在读取歌单歌曲...';
    renderStatus();
    try {
      var data = await apiGet('/playlist/track/all', { id: id, limit: 500 });
      var list = data.songs || data.playlist && data.playlist.tracks || [];
      state.tracks = list.map(normSong).filter(function (t) { return t.id; });
      state.activeIndex = 0;
      state.statusText = '歌单共 ' + state.tracks.length + ' 首';
      render();
    } catch (e) {
      state.statusText = '读取歌单失败：' + e.message;
      renderStatus();
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadDaily() {
    state.loading = true;
    state.statusText = '正在加载每日推荐...';
    renderStatus();
    try {
      var data = await apiGet('/recommend/songs');
      var list = data.data && data.data.dailySongs || [];
      state.tracks = list.map(normSong).filter(function (t) { return t.id; });
      state.activeIndex = 0;
      state.statusText = '每日推荐 · 共 ' + state.tracks.length + ' 首';
      render();
    } catch (e) {
      state.statusText = '加载每日推荐失败：' + e.message;
      renderStatus();
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadFM() {
    state.loading = true;
    state.statusText = '正在加载私人FM...';
    renderStatus();
    try {
      var data = await apiGet('/personal_fm');
      var list = data.data || [];
      state.tracks = list.map(normSong).filter(function (t) { return t.id; });
      state.activeIndex = 0;
      state.statusText = '私人FM · 共 ' + state.tracks.length + ' 首';
      render();
    } catch (e) {
      state.statusText = '加载私人FM失败：' + e.message;
      renderStatus();
    } finally {
      state.loading = false;
      render();
    }
  }

  function renderStatus() {
    var el = $('cmStatusText');
    if (el) el.textContent = state.statusText;
  }

  /* ── 登录 / 登出 ── */
  function openLoginModal() {
    var overlay = $('cmLoginOverlay');
    if (overlay) overlay.style.display = 'flex';
    startQRLogin();
  }

  function closeLoginModal() {
    var overlay = $('cmLoginOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  var qrTimer = null;
  var qrKey = '';

  async function startQRLogin() {
    var img = $('cmQRImg');
    var hint = $('cmQRHint');
    if (img) img.src = '';
    if (hint) hint.textContent = '正在生成二维码...';

    try {
      var keyData = await apiGet('/login/qr/key', { timestamp: Date.now() });
      qrKey = keyData.data && keyData.data.unikey;
      if (!qrKey) throw new Error('未获取到二维码 key');

      // 生成二维码图片（用 API 的 qr create 返回 base64，或本地生成）
      var createData = await apiGet('/login/qr/create', { key: qrKey, qrimg: true });
      var qrImgData = createData.data && createData.data.qrimg;
      if (qrImgData && img) {
        img.src = qrImgData;
      } else {
        // fallback: 生成二维码链接跳转
        var qrUrl = createData.data && createData.data.qrurl;
        if (img) img.src = buildQrCode(qrUrl);
      }
      if (hint) hint.textContent = '请使用网易云音乐 App 扫码登录';
      pollQR();
    } catch (e) {
      if (hint) hint.textContent = '生成二维码失败：' + e.message;
    }
  }

  // 用 API 提供的 qrimg（base64 data URI）或本地 QR 图
  function buildQrCode(text) {
    // 若本地无 qrcode 库，返回一个占位：使用 api.injahow 的 qr 生成图（已废弃），
    // 这里直接用 qr.create 的 qrimg，已在主流程使用。此函数为兜底。
    return text || '';
  }

  function pollQR() {
    if (qrTimer) clearInterval(qrTimer);
    qrTimer = setInterval(async function () {
      if (!$('cmLoginOverlay') || $('cmLoginOverlay').style.display === 'none') {
        clearInterval(qrTimer);
        return;
      }
      try {
        var data = await apiGet('/login/qr/check', { key: qrKey, timestamp: Date.now() });
        var code = data.code;
        var hint = $('cmQRHint');
        if (code === 800) {
          if (hint) hint.textContent = '二维码已过期，请刷新重试';
          clearInterval(qrTimer);
        } else if (code === 801) {
          if (hint) hint.textContent = '等待扫码...';
        } else if (code === 802) {
          if (hint) hint.textContent = '已扫码，请确认登录';
        } else if (code === 803) {
          if (hint) hint.textContent = '登录成功！';
          clearInterval(qrTimer);
          // 保存 cookie（API 已通过 Set-Cookie 下发，浏览器自动保存）
          await checkLogin();
          closeLoginModal();
          loadPlaylists();
        }
      } catch (e) {
        // 轮询出错忽略，继续
      }
    }, 2000);
  }

  async function checkLogin() {
    try {
      var data = await apiGet('/login/status');
      var profile = data.data && data.data.profile;
      state.profile = profile || null;
      return state.profile;
    } catch (e) {
      state.profile = null;
      return null;
    }
  }

  function logoutAccount() {
    state.profile = null;
    state.playlists = [];
    state.tracks = [];
    state.activeIndex = 0;
    audio.pause();
    render();
    loadPlaylists();
  }

  /* ── 其它交互 ── */
  function initControls() {
    var prevBtn = $('cmPrevBtn');
    var nextBtn = $('cmNextBtn');
    var playBtn = $('cmPlayBtn');
    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (playBtn) playBtn.addEventListener('click', togglePlay);

    // 搜索
    var search = $('cmSearch');
    if (search) search.addEventListener('input', function () {
      state.search = search.value;
      renderTrackList();
    });

    // 歌单下拉
    var sel = $('cmPlaylistSelect');
    if (sel) sel.addEventListener('change', function () {
      if (sel.value) loadPlaylistTracks(sel.value);
    });

    // 邀请好友
    var invite = $('copyLinkBtn');
    if (invite) invite.addEventListener('click', copyLink);

    // 关闭登录弹窗
    var close = $('cmLoginClose');
    if (close) close.addEventListener('click', closeLoginModal);
    var overlay = $('cmLoginOverlay');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeLoginModal();
    });

    audioEvents();
  }

  function copyLink() {
    var btn = $('copyLinkBtn');
    var url = window.location.href;
    function done() {
      btn.textContent = '✓ 已复制';
      btn.classList.add('copied');
      setTimeout(function () { btn.textContent = '🔗 邀请好友'; btn.classList.remove('copied'); }, 2000);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url); done(); });
    } else {
      fallbackCopy(url); done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function renderPlaylistSelect() {
    var sel = $('cmPlaylistSelect');
    if (!sel) return;
    sel.innerHTML = state.playlists.map(function (p) {
      return '<option value="' + p.id + '"' + (p.id === state.activePlaylistId ? ' selected' : '') + '>' + escapeHTML(p.name) + ' (' + (p.trackCount || 0) + '首)</option>';
    }).join('');
  }

  /* ── 初始化 ── */
  async function init() {
    initControls();
    render();
    await checkLogin();
    renderHeader();
    loadSource();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
