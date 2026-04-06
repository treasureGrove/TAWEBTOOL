(function () {
  const PLAYER_WINDOW_NAME = 'tawebtool-cloud-music-float-player';
  const CONFIG_KEY = 'tawebtool.cloudMusic.config';
  const STATE_KEY = 'tawebtool.cloudMusic.state';

  const fallbackTracks = [
    { id: 1, name: 'Dreams (Demo)', artist: 'SoundHelix', duration: 372000, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
    { id: 2, name: 'Skyline (Demo)', artist: 'SoundHelix', duration: 331000, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
    { id: 3, name: 'Night Walk (Demo)', artist: 'SoundHelix', duration: 303000, url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' }
  ];

  const config = {
    apiBase: 'http://127.0.0.1:3000',
    cookie: ''
  };

  const state = {
    profile: null,
    playlists: [],
    activePlaylistId: null,
    tracks: [...fallbackTracks],
    activeIndex: 0,
    playing: false,
    popupOnline: false,
    loading: false,
    statusText: '请先配置 API 并检测登录。'
  };

  function loadLocal() {
    try {
      const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
      const s = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      if (c.apiBase) config.apiBase = c.apiBase;
      if (c.cookie) config.cookie = c.cookie;
      if (typeof s.activeIndex === 'number') state.activeIndex = s.activeIndex;
      if (typeof s.playing === 'boolean') state.playing = s.playing;
    } catch (error) {
      console.warn('cloud_music loadLocal failed', error);
    }
  }

  function saveLocal() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(STATE_KEY, JSON.stringify({
      activeIndex: state.activeIndex,
      playing: state.playing,
      activePlaylistId: state.activePlaylistId
    }));
  }

  function qs(params) {
    const q = new URLSearchParams();
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    });
    return q.toString();
  }

  async function apiGet(path, params = {}) {
    const p = { ...params, timestamp: Date.now() };
    if (config.cookie) p.cookie = config.cookie;
    const query = qs(p);
    const url = `${config.apiBase}${path}${query ? `?${query}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  }

  function msToClock(ms) {
    const sec = Math.floor((ms || 0) / 1000);
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  function artistName(any) {
    if (!any) return '-';
    if (Array.isArray(any.ar)) return any.ar.map((x) => x.name).join('/');
    if (Array.isArray(any.artists)) return any.artists.map((x) => x.name).join('/');
    if (Array.isArray(any.song?.artists)) return any.song.artists.map((x) => x.name).join('/');
    return any.artist || '-';
  }

  function normalizeTrack(raw) {
    const source = raw.song || raw.data || raw;
    return {
      id: source.id,
      name: source.name,
      artist: artistName(source),
      duration: source.dt || source.duration || 0,
      url: source.url || null
    };
  }

  async function checkLoginStatus() {
    state.loading = true;
    state.statusText = '正在检测登录...';
    render();
    try {
      const data = await apiGet('/login/status');
      const profile = data.data?.profile || data.profile || null;
      state.profile = profile;
      if (profile && profile.userId) {
        state.statusText = `已登录：${profile.nickname} (uid=${profile.userId})`;
        await loadUserPlaylists(profile.userId);
      } else {
        state.statusText = '未检测到登录态，请检查 cookie（MUSIC_U 等）';
      }
    } catch (error) {
      state.statusText = `登录检测失败：${error.message}`;
    } finally {
      state.loading = false;
      saveLocal();
      render();
    }
  }

  async function loadUserPlaylists(uid) {
    try {
      const data = await apiGet('/user/playlist', { uid, limit: 100 });
      state.playlists = data.playlist || [];
      if (!state.activePlaylistId && state.playlists[0]) state.activePlaylistId = state.playlists[0].id;
    } catch (error) {
      state.statusText = `读取歌单失败：${error.message}`;
    }
  }

  async function loadPlaylistTracks(playlistId) {
    if (!playlistId) return;
    state.loading = true;
    state.statusText = '正在读取歌单歌曲...';
    render();
    try {
      const data = await apiGet('/playlist/track/all', { id: playlistId, limit: 500 });
      const tracks = (data.songs || []).map(normalizeTrack).filter((x) => x.id);
      state.tracks = tracks.length ? tracks : [...fallbackTracks];
      state.activePlaylistId = playlistId;
      state.activeIndex = 0;
      state.statusText = `歌单加载完成，共 ${state.tracks.length} 首`;
      saveLocal();
      render();
      syncPopup('sync', true);
    } catch (error) {
      state.statusText = `读取歌单歌曲失败：${error.message}`;
      state.loading = false;
      render();
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadRecentPlayed() {
    state.loading = true;
    state.statusText = '正在读取最近播放...';
    render();
    try {
      const data = await apiGet('/record/recent/song', { limit: 100 });
      const list = data.data?.list || [];
      const tracks = list.map(normalizeTrack).filter((x) => x.id);
      if (tracks.length) {
        state.tracks = tracks;
        state.activeIndex = 0;
        state.statusText = `已加载最近播放 ${tracks.length} 首（第一首视作当前播放参考）`;
        syncPopup('sync', false);
      } else {
        state.statusText = '最近播放为空';
      }
      saveLocal();
    } catch (error) {
      state.statusText = `读取最近播放失败：${error.message}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function ensureTrackUrl(track) {
    if (track.url) return track.url;
    const data = await apiGet('/song/url/v1', { id: track.id, level: 'standard' });
    const url = data.data?.[0]?.url || null;
    if (!url) throw new Error('该歌曲未获取到可播放 URL（可能需要 VIP 或版权限制）');
    track.url = url;
    return url;
  }

  function getPopup() {
    return window.open('', PLAYER_WINDOW_NAME);
  }

  function popupExists() {
    const pop = getPopup();
    return Boolean(pop && !pop.closed);
  }

  function openPopup() {
    const popup = window.open('', PLAYER_WINDOW_NAME, 'width=420,height=700,left=80,top=80');
    if (!popup) {
      alert('浏览器阻止了弹窗，请允许后重试。');
      return;
    }

    const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>一起听悬浮播放器</title><style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,\"Microsoft YaHei\",sans-serif}
    body{padding:14px;background:#111827;color:#f8fafc}
    .card{border:1px solid #374151;border-radius:12px;padding:14px;background:#1f2937}
    .title{font-size:18px;font-weight:700}.meta{font-size:12px;color:#cbd5e1;margin-top:4px}
    .ops{display:flex;gap:8px;margin:12px 0}button{border:none;border-radius:999px;padding:7px 12px;background:#ef4444;color:#fff;cursor:pointer}
    .list{max-height:320px;overflow:auto;display:grid;gap:6px}.item{padding:8px;border-radius:8px;background:#374151;cursor:pointer;font-size:13px}.item.active{background:#b91c1c}
    audio{width:100%;margin:8px 0}.tip{font-size:12px;color:#cbd5e1}
    </style></head><body><div class="card"><div id="title" class="title">-</div><div id="meta" class="meta">-</div><audio id="audio" controls></audio><div class="ops"><button id="prev">上一首</button><button id="toggle">播放</button><button id="next">下一首</button></div><div id="list" class="list"></div><div class="tip">关闭主页面后此窗口仍可继续播放。</div></div>
    <script>
    let tracks=[],activeIndex=0,playing=false;
    const title=document.getElementById('title');const meta=document.getElementById('meta');const audio=document.getElementById('audio');const list=document.getElementById('list');const toggle=document.getElementById('toggle');
    function render(){const cur=tracks[activeIndex]||{};title.textContent=cur.name||'-';meta.textContent=(cur.artist||'-')+' · '+((cur.duration?Math.floor(cur.duration/60000).toString().padStart(2,'0')+':'+Math.floor((cur.duration/1000)%60).toString().padStart(2,'0'):'--:--'));toggle.textContent=playing?'暂停':'播放';list.innerHTML=tracks.map((t,i)=>'<div class="item '+(i===activeIndex?'active':'')+'" data-i="'+i+'">'+(t.name||'-')+' · '+(t.artist||'-')+'</div>').join('');Array.from(list.children).forEach((el)=>el.onclick=()=>{activeIndex=Number(el.dataset.i);notify('pick')});}
    function notify(action){if(window.opener){window.opener.postMessage({source:'cloud-popup',action,activeIndex,playing},'*');}}
    document.getElementById('prev').onclick=()=>notify('prev');document.getElementById('next').onclick=()=>notify('next');toggle.onclick=()=>notify('toggle');
    window.addEventListener('message',async(e)=>{const d=e.data||{};if(d.source!=='cloud-main')return;if(Array.isArray(d.tracks))tracks=d.tracks;if(typeof d.activeIndex==='number')activeIndex=d.activeIndex;if(typeof d.playing==='boolean')playing=d.playing;if(d.url){audio.src=d.url;if(playing){try{await audio.play()}catch(e){}}}else if(!playing){audio.pause()}render();});
    audio.onplay=()=>{playing=true;notify('play')};audio.onpause=()=>{playing=false;notify('pause')};audio.onended=()=>notify('ended');
    </script></body></html>`;

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    state.popupOnline = true;
    render();
  }

  async function syncPopup(action = 'sync', autoOpen = false) {
    if (autoOpen && !popupExists()) openPopup();
    const popup = getPopup();
    if (!popup || popup.closed) {
      state.popupOnline = false;
      render();
      return;
    }
    state.popupOnline = true;
    const current = state.tracks[state.activeIndex];
    let url = null;
    if (current) {
      try {
        url = await ensureTrackUrl(current);
      } catch (error) {
        state.statusText = error.message;
      }
    }
    popup.postMessage({
      source: 'cloud-main',
      action,
      tracks: state.tracks,
      activeIndex: state.activeIndex,
      playing: state.playing,
      url
    }, '*');
    render();
  }

  async function syncInlinePlayer() {
    const audio = document.getElementById('inlineAudio');
    const cur = state.tracks[state.activeIndex];
    if (!audio || !cur) return;

    try {
      const url = await ensureTrackUrl(cur);
      if (audio.dataset.trackId !== String(cur.id) || audio.src !== url) {
        audio.src = url;
        audio.dataset.trackId = String(cur.id);
      }
      if (state.playing) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch (error) {
      state.playing = false;
      state.statusText = error.message;
      render();
    }
  }

  function getFilteredTracks() {
    const input = document.getElementById('cloudSearchInput');
    const keyword = (input?.value || '').trim().toLowerCase();
    if (!keyword) return state.tracks;
    return state.tracks.filter((t) => `${t.name} ${t.artist}`.toLowerCase().includes(keyword));
  }

  function currentTrack() {
    return state.tracks[state.activeIndex] || { name: '-', artist: '-', duration: 0 };
  }

  function render() {
    const app = document.getElementById('cloudMusicApp');
    const me = state.profile;
    const cur = currentTrack();
    const filtered = getFilteredTracks();

    app.innerHTML = `
      <section class="cm-layout">
        <header class="cm-hero">
          <div>
            <h1>网易云音乐（API版）</h1>
            <p>支持读取账号歌单、最近播放，点击歌曲即可直接播放。</p>
            <p class="cm-status-line">${state.loading ? '加载中...' : state.statusText}</p>
          </div>
          <div class="cm-account">${me ? `账号：${me.nickname} (uid=${me.userId})` : '账号：未登录'}</div>
        </header>

        <section class="cm-grid-2">
          <div class="cm-card">
            <h3>1) API 配置</h3>
            <label>API Base URL</label>
            <input id="apiBaseInput" class="cm-input" value="${config.apiBase}" placeholder="http://127.0.0.1:3000">
            <label>Cookie (建议至少包含 MUSIC_U，必要时带 __csrf)</label>
            <textarea id="cookieInput" class="cm-textarea" placeholder="MUSIC_U=...; __csrf=...">${config.cookie}</textarea>
            <div class="cm-row">
              <button id="saveConfigBtn">保存配置</button>
              <button id="checkLoginBtn">检测登录</button>
            </div>
            <p class="cm-tip">说明：网易云没有公开官方开放 API。这里使用社区常见的开源 API 网关方案对接。</p>
          </div>

          <div class="cm-card">
            <h3>2) 我的数据</h3>
            <div class="cm-row">
              <button id="loadRecentBtn">读取最近播放</button>
              <button id="openPopupBtn">${state.popupOnline ? '聚焦悬浮窗' : '打开悬浮窗(可选)'}</button>
            </div>
            <ul id="playlistList" class="cm-list"></ul>
          </div>
        </section>

        <section class="cm-grid-2">
          <div class="cm-card">
            <h3>歌曲列表</h3>
            <ul id="trackList" class="cm-track-list"></ul>
          </div>
          <div class="cm-card">
            <h3>正在播放（页面控制）</h3>
            <div class="cm-now">${cur.name}</div>
            <div>${cur.artist} · ${msToClock(cur.duration)}</div>
            <audio id="inlineAudio" class="cm-inline-audio" controls></audio>
            <div class="cm-row">
              <button id="prevBtn">上一首</button>
              <button id="toggleBtn">${state.playing ? '暂停' : '播放'}</button>
              <button id="nextBtn">下一首</button>
              <button id="syncPopupBtn">同步到悬浮窗(可选)</button>
            </div>
            <p class="cm-tip">提示：点击左侧歌曲会立即切换并在本页面播放；悬浮窗仅作为可选扩展。</p>
          </div>
        </section>
      </section>
    `;

    const playlistEl = document.getElementById('playlistList');
    playlistEl.innerHTML = state.playlists.map((p) => `
      <li class="${p.id === state.activePlaylistId ? 'active' : ''}" data-id="${p.id}">
        <span>${p.name}</span><span>${p.trackCount || 0} 首</span>
      </li>
    `).join('') || '<li>暂无歌单（先点击“检测登录”）</li>';

    playlistEl.querySelectorAll('li[data-id]').forEach((el) => {
      el.addEventListener('click', () => loadPlaylistTracks(el.dataset.id));
    });

    const trackEl = document.getElementById('trackList');
    trackEl.innerHTML = filtered.map((t) => {
      const idx = state.tracks.findIndex((x) => x.id === t.id);
      return `<li class="${idx === state.activeIndex ? 'active' : ''}" data-idx="${idx}"><span>${t.name}</span><span>${t.artist}</span><span>${msToClock(t.duration)}</span></li>`;
    }).join('') || '<li>暂无歌曲</li>';

    trackEl.querySelectorAll('li[data-idx]').forEach((el) => {
      el.addEventListener('click', async () => {
        state.activeIndex = Number(el.dataset.idx);
        state.playing = true;
        saveLocal();
        render();
        await syncInlinePlayer();
        if (popupExists()) await syncPopup('sync', false);
      });
    });

    document.getElementById('saveConfigBtn').addEventListener('click', () => {
      config.apiBase = document.getElementById('apiBaseInput').value.trim().replace(/\/$/, '');
      config.cookie = document.getElementById('cookieInput').value.trim();
      saveLocal();
      state.statusText = '配置已保存';
      render();
    });

    document.getElementById('checkLoginBtn').addEventListener('click', checkLoginStatus);
    document.getElementById('loadRecentBtn').addEventListener('click', loadRecentPlayed);

    document.getElementById('openPopupBtn').addEventListener('click', async () => {
      if (!popupExists()) openPopup();
      else getPopup().focus();
      await syncPopup('sync', true);
    });

    document.getElementById('prevBtn').addEventListener('click', async () => {
      state.activeIndex = (state.activeIndex - 1 + state.tracks.length) % state.tracks.length;
      state.playing = true;
      saveLocal();
      render();
      await syncInlinePlayer();
      if (popupExists()) await syncPopup('prev', false);
    });

    document.getElementById('nextBtn').addEventListener('click', async () => {
      state.activeIndex = (state.activeIndex + 1) % state.tracks.length;
      state.playing = true;
      saveLocal();
      render();
      await syncInlinePlayer();
      if (popupExists()) await syncPopup('next', false);
    });

    document.getElementById('toggleBtn').addEventListener('click', async () => {
      state.playing = !state.playing;
      saveLocal();
      render();
      await syncInlinePlayer();
      if (popupExists()) await syncPopup('toggle', false);
    });

    document.getElementById('syncPopupBtn').addEventListener('click', async () => {
      await syncPopup('sync', true);
    });

    const inlineAudio = document.getElementById('inlineAudio');
    if (inlineAudio) {
      inlineAudio.onplay = async () => {
        if (!state.playing) {
          state.playing = true;
          saveLocal();
          render();
          if (popupExists()) await syncPopup('play', false);
        }
      };
      inlineAudio.onpause = async () => {
        if (state.playing) {
          state.playing = false;
          saveLocal();
          render();
          if (popupExists()) await syncPopup('pause', false);
        }
      };
      inlineAudio.onended = async () => {
        state.activeIndex = (state.activeIndex + 1) % state.tracks.length;
        state.playing = true;
        saveLocal();
        render();
        await syncInlinePlayer();
        if (popupExists()) await syncPopup('ended', false);
      };
    }

    syncInlinePlayer();
  }

  function bindEvents() {
    window.addEventListener('message', async (event) => {
      const d = event.data || {};
      if (d.source !== 'cloud-popup') return;
      if (d.action === 'prev') state.activeIndex = (state.activeIndex - 1 + state.tracks.length) % state.tracks.length;
      if (d.action === 'next' || d.action === 'ended') state.activeIndex = (state.activeIndex + 1) % state.tracks.length;
      if (d.action === 'toggle') state.playing = !state.playing;
      if (d.action === 'pick' && typeof d.activeIndex === 'number') state.activeIndex = d.activeIndex;
      if (d.action === 'play') state.playing = true;
      if (d.action === 'pause') state.playing = false;
      saveLocal();
      render();
      await syncInlinePlayer();
      await syncPopup('sync', false);
    });

    const search = document.getElementById('cloudSearchInput');
    if (search) search.addEventListener('input', render);
  }

  function init() {
    loadLocal();
    bindEvents();
    state.popupOnline = popupExists();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
