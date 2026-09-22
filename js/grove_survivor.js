/**
 * 单目幸存者 — 俯视角自动射击生存
 * WASD 移动 · 自动射击 · 经验升级三选一 · 服务器排行 grove_survivor
 */
const $ = (id) => document.getElementById(id);
const canvas = $('gsCanvas');
const shell = $('gsShell');
const ctx = canvas.getContext('2d');

const el = {
  hud: $('gsHud'),
  time: $('hudTime'),
  kills: $('hudKills'),
  lv: $('hudLv'),
  score: $('hudScore'),
  xp: $('hudXp'),
  hp: $('hudHp'),
  toast: $('hudToast'),
  menu: $('gsMenu'),
  levelup: $('gsLevelup'),
  pause: $('gsPause'),
  over: $('gsOver'),
  board: $('gsBoard'),
  picks: $('picks'),
  report: $('gsReport'),
  name: $('inpName'),
  submitNote: $('submitNote'),
  rankList: $('rankList'),
};

const GAME_ID = 'grove_survivor';

const S = {
  state: 'menu',
  t: 0,
  score: 0,
  kills: 0,
  level: 1,
  xp: 0,
  xpNeed: 8,
  hp: 100,
  hpMax: 100,
  submitted: false,
  pickIndex: 0,
};

const P = {
  x: 0, y: 0,
  r: 14,
  speed: 210,
  fireCd: 0,
  fireRate: 0.42,
  damage: 12,
  bulletSpeed: 420,
  pierce: 0,
  magnet: 70,
  regen: 0,
  multi: 1,
};

const keys = Object.create(null);
const world = {
  enemies: [],
  bullets: [],
  orbs: [],
  parts: [],
  spawnT: 0,
  wave: 0,
};

const UPGRades = [
  { id: 'dmg', name: '强化弹头', desc: '伤害 +6', apply: () => { P.damage += 6; } },
  { id: 'rate', name: '快射', desc: '射速 +18%', apply: () => { P.fireRate = Math.max(0.1, P.fireRate * 0.82); } },
  { id: 'speed', name: '轻步', desc: '移速 +12%', apply: () => { P.speed *= 1.12; } },
  { id: 'hp', name: '硬皮', desc: '生命上限 +20 并回血', apply: () => { P.hpMax += 20; S.hp = Math.min(P.hpMax, S.hp + 20); } },
  { id: 'magnet', name: '磁石', desc: '拾取范围 +40', apply: () => { P.magnet += 40; } },
  { id: 'multi', name: '分裂弹', desc: '同时多 1 发', apply: () => { P.multi += 1; } },
  { id: 'pierce', name: '穿甲', desc: '子弹穿透 +1', apply: () => { P.pierce += 1; } },
  { id: 'regen', name: '再生', desc: '每秒回 0.6 生命', apply: () => { P.regen += 0.6; } },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(Date.now() & 0xffffffff);
const rr = (a, b) => a + (b - a) * rng();

// ─── Input ───
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (S.state === 'levelup') {
    if (e.key === '1') pickUpgrade(0);
    if (e.key === '2') pickUpgrade(1);
    if (e.key === '3') pickUpgrade(2);
  }
  if (e.code === 'Escape') {
    if (S.state === 'playing') pauseGame();
    else if (S.state === 'paused') resumeGame();
  }
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ─── Game loop helpers ───
function resetRun() {
  S.t = 0;
  S.score = 0;
  S.kills = 0;
  S.level = 1;
  S.xp = 0;
  S.xpNeed = 8;
  S.hp = 100;
  S.hpMax = 100;
  S.submitted = false;
  el.submitNote.textContent = '';
  Object.assign(P, {
    x: 0, y: 0, r: 14, speed: 210, fireCd: 0, fireRate: 0.42,
    damage: 12, bulletSpeed: 420, pierce: 0, magnet: 70, regen: 0, multi: 1,
  });
  world.enemies.length = 0;
  world.bullets.length = 0;
  world.orbs.length = 0;
  world.parts.length = 0;
  world.spawnT = 0.5;
  world.wave = 0;
  updateHud();
}

function startGame() {
  resetRun();
  S.state = 'playing';
  showOverlay('play');
}

function pauseGame() {
  if (S.state !== 'playing') return;
  S.state = 'paused';
  showOverlay('pause');
}

function resumeGame() {
  if (S.state !== 'paused') return;
  S.state = 'playing';
  showOverlay('play');
}

function gameOver() {
  S.state = 'over';
  showOverlay('over');
  const mm = Math.floor(S.t / 60);
  const ss = Math.floor(S.t % 60);
  el.report.innerHTML = [
    it('得分', S.score),
    it('存活', mm + ':' + String(ss).padStart(2, '0')),
    it('击杀', S.kills),
    it('等级', S.level),
  ].join('');
  el.name.value = localStorage.getItem('gs_name') || '';
  loadBoard();
}

function it(k, v) {
  return `<div class="it">${k}<b>${v}</b></div>`;
}

function showOverlay(which) {
  el.menu.hidden = which !== 'menu';
  el.levelup.hidden = which !== 'levelup';
  el.pause.hidden = which !== 'pause';
  el.over.hidden = which !== 'over';
  el.board.hidden = which !== 'board';
  el.hud.hidden = which !== 'play' && which !== 'levelup';
}

function updateHud() {
  const mm = Math.floor(S.t / 60);
  const ss = Math.floor(S.t % 60);
  el.time.textContent = mm + ':' + String(ss).padStart(2, '0');
  el.kills.textContent = String(S.kills);
  el.lv.textContent = String(S.level);
  el.score.textContent = String(S.score);
  el.xp.style.transform = `scaleX(${Math.min(1, S.xp / S.xpNeed)})`;
  el.hp.style.transform = `scaleX(${Math.max(0, S.hp / S.hpMax)})`;
}

function toast(t) {
  el.toast.hidden = false;
  el.toast.textContent = t;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.hidden = true; }, 1200);
}

// ─── Entities ───
function spawnEnemy() {
  const a = rr(0, Math.PI * 2);
  const d = 380 + rr(0, 80);
  const tier = 1 + Math.floor(S.t / 25);
  const kind = tier >= 4 && rng() < 0.15 ? 'brute' : tier >= 2 && rng() < 0.25 ? 'fast' : 'norm';
  const hp = kind === 'brute' ? 55 + tier * 12 : kind === 'fast' ? 12 + tier * 3 : 18 + tier * 5;
  world.enemies.push({
    x: P.x + Math.cos(a) * d,
    y: P.y + Math.sin(a) * d,
    r: kind === 'brute' ? 22 : kind === 'fast' ? 10 : 14,
    hp,
    maxHp: hp,
    speed: kind === 'brute' ? 55 : kind === 'fast' ? 130 : 80,
    dmg: kind === 'brute' ? 18 : kind === 'fast' ? 8 : 10,
    kind,
    hit: 0,
  });
}

function shoot() {
  let target = null;
  let best = 280;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - P.x, e.y - P.y);
    if (d < best) { best = d; target = e; }
  }
  if (!target) return;
  const n = P.multi;
  for (let i = 0; i < n; i++) {
    const spread = (i - (n - 1) / 2) * 0.12;
    const ang = Math.atan2(target.y - P.y, target.x - P.x) + spread;
    world.bullets.push({
      x: P.x, y: P.y,
      vx: Math.cos(ang) * P.bulletSpeed,
      vy: Math.sin(ang) * P.bulletSpeed,
      r: 4,
      dmg: P.damage,
      pierce: P.pierce,
      life: 1.2,
    });
  }
}

function burst(x, y, color, n = 6) {
  for (let i = 0; i < n; i++) {
    const a = rr(0, Math.PI * 2);
    const s = rr(40, 160);
    world.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rr(0.2, 0.45), color });
  }
}

function levelUp() {
  S.level += 1;
  S.xp -= S.xpNeed;
  S.xpNeed = Math.floor(S.xpNeed * 1.35 + 4);
  S.state = 'levelup';
  showOverlay('levelup');
  // 3 random unique upgrades
  const pool = [...UPGRades];
  const picks = [];
  while (picks.length < 3 && pool.length) {
    picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  S.currentPicks = picks;
  el.picks.innerHTML = picks.map((p, i) =>
    `<button class="gs-pick" data-i="${i}"><b>${i + 1}. ${p.name}</b><span>${p.desc}</span></button>`
  ).join('');
  [...el.picks.querySelectorAll('.gs-pick')].forEach((b) => {
    b.addEventListener('click', () => pickUpgrade(Number(b.dataset.i)));
  });
}

function pickUpgrade(i) {
  if (S.state !== 'levelup') return;
  const u = S.currentPicks && S.currentPicks[i];
  if (u) {
    u.apply();
    toast(u.name);
  }
  S.state = 'playing';
  showOverlay('play');
  if (S.xp >= S.xpNeed) levelUp();
}

// ─── Update ───
function tick(dt) {
  S.t += dt;
  S.score += dt * 10;

  // move
  let dx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let dy = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (dx || dy) {
    const l = Math.hypot(dx, dy);
    dx /= l; dy /= l;
  }
  P.x += dx * P.speed * dt;
  P.y += dy * P.speed * dt;

  // soft arena bound
  const maxR = 900;
  const d = Math.hypot(P.x, P.y);
  if (d > maxR) { P.x = (P.x / d) * maxR; P.y = (P.y / d) * maxR; }

  if (P.regen) S.hp = Math.min(P.hpMax, S.hp + P.regen * dt);

  // spawn
  world.spawnT -= dt;
  if (world.spawnT <= 0) {
    const n = 1 + Math.floor(S.t / 40);
    for (let i = 0; i < n; i++) spawnEnemy();
    world.wave += 1;
    world.spawnT = Math.max(0.35, 1.4 - S.t * 0.008);
  }

  // shoot
  P.fireCd -= dt;
  if (P.fireCd <= 0) {
    shoot();
    P.fireCd = P.fireRate;
  }

  // bullets
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    let dead = b.life <= 0;
    for (const e of world.enemies) {
      if (e.hp <= 0) continue;
      const dd = Math.hypot(e.x - b.x, e.y - b.y);
      if (dd < e.r + b.r) {
        e.hp -= b.dmg;
        e.hit = 0.08;
        burst(b.x, b.y, '#baffea', 3);
        if (e.hp <= 0) {
          S.kills += 1;
          S.score += e.kind === 'brute' ? 40 : e.kind === 'fast' ? 18 : 12;
          burst(e.x, e.y, e.kind === 'brute' ? '#ff7a55' : '#8fad78', 8);
          world.orbs.push({ x: e.x, y: e.y, r: 5, xp: e.kind === 'brute' ? 5 : 1 });
        }
        if (b.pierce > 0) b.pierce -= 1;
        else { dead = true; break; }
      }
    }
    if (dead) world.bullets.splice(i, 1);
  }

  // enemies
  for (let i = world.enemies.length - 1; i >= 0; i--) {
    const e = world.enemies[i];
    if (e.hp <= 0) { world.enemies.splice(i, 1); continue; }
    e.hit = Math.max(0, e.hit - dt);
    const a = Math.atan2(P.y - e.y, P.x - e.x);
    e.x += Math.cos(a) * e.speed * dt;
    e.y += Math.sin(a) * e.speed * dt;
    const dd = Math.hypot(e.x - P.x, e.y - P.y);
    if (dd < e.r + P.r) {
      S.hp -= e.dmg * dt * 1.6;
      if (S.hp <= 0) {
        S.hp = 0;
        updateHud();
        gameOver();
        return;
      }
    }
  }

  // orbs
  for (let i = world.orbs.length - 1; i >= 0; i--) {
    const o = world.orbs[i];
    const dd = Math.hypot(o.x - P.x, o.y - P.y);
    if (dd < P.magnet) {
      const a = Math.atan2(P.y - o.y, P.x - o.x);
      const sp = 180 + (P.magnet - dd) * 2;
      o.x += Math.cos(a) * sp * dt;
      o.y += Math.sin(a) * sp * dt;
    }
    if (dd < P.r + o.r) {
      S.xp += o.xp;
      world.orbs.splice(i, 1);
      if (S.xp >= S.xpNeed) {
        levelUp();
        updateHud();
        return;
      }
    }
  }

  // parts
  for (let i = world.parts.length - 1; i >= 0; i--) {
    const p = world.parts[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) world.parts.splice(i, 1);
  }

  updateHud();
}

// ─── Render ───
function draw() {
  const w = canvas.width;
  const h = canvas.height;
  const camX = P.x - w / 2;
  const camY = P.y - h / 2;

  ctx.fillStyle = '#0c1a16';
  ctx.fillRect(0, 0, w, h);

  // grid
  ctx.strokeStyle = 'rgba(38,168,132,0.08)';
  ctx.lineWidth = 1;
  const g = 48;
  const ox = -camX % g;
  const oy = -camY % g;
  ctx.beginPath();
  for (let x = ox; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let y = oy; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();

  const sx = (x) => x - camX;
  const sy = (y) => y - camY;

  // orbs
  for (const o of world.orbs) {
    ctx.fillStyle = '#7dffd2';
    ctx.beginPath();
    ctx.arc(sx(o.x), sy(o.y), o.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies
  for (const e of world.enemies) {
    const x = sx(e.x), y = sy(e.y);
    ctx.fillStyle = e.hit > 0 ? '#ffffff' : e.kind === 'brute' ? '#c45c3a' : e.kind === 'fast' ? '#9ccc3a' : '#6f9a62';
    ctx.beginPath();
    if (e.kind === 'fast') {
      ctx.moveTo(x, y - e.r);
      ctx.lineTo(x + e.r, y + e.r);
      ctx.lineTo(x - e.r, y + e.r);
      ctx.closePath();
    } else {
      ctx.arc(x, y, e.r, 0, Math.PI * 2);
    }
    ctx.fill();
    // eye
    ctx.fillStyle = e.kind === 'brute' ? '#ff5a3c' : '#ffc857';
    ctx.beginPath();
    ctx.arc(x, y - e.r * 0.2, Math.max(2, e.r * 0.18), 0, Math.PI * 2);
    ctx.fill();
  }

  // bullets
  ctx.fillStyle = '#baffea';
  for (const b of world.bullets) {
    ctx.beginPath();
    ctx.arc(sx(b.x), sy(b.y), b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // parts
  for (const p of world.parts) {
    ctx.globalAlpha = Math.max(0, p.life / 0.4);
    ctx.fillStyle = p.color;
    ctx.fillRect(sx(p.x) - 2, sy(p.y) - 2, 4, 4);
  }
  ctx.globalAlpha = 1;

  // player
  const px = sx(P.x), py = sy(P.y);
  ctx.fillStyle = '#2fd4a4';
  ctx.beginPath();
  ctx.arc(px, py, P.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e8fff8';
  ctx.lineWidth = 2;
  ctx.stroke();
  // muzzle hint toward nearest
  let tx = px, ty = py - 20;
  let best = 280;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - P.x, e.y - P.y);
    if (d < best) { best = d; tx = sx(e.x); ty = sy(e.y); }
  }
  ctx.strokeStyle = 'rgba(186,255,234,0.35)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px + (tx - px) * 0.25, py + (ty - py) * 0.25);
  ctx.stroke();
}

function resize() {
  const w = shell.clientWidth || 800;
  const h = shell.clientHeight || 520;
  canvas.width = w;
  canvas.height = h;
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (S.state === 'playing') tick(dt);
  if (S.state !== 'menu') draw();
  else {
    // idle bg
    ctx.fillStyle = '#0c1a16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// ─── Scores ───
function loadBoard() {
  fetch(`/api/scores?game=${GAME_ID}&limit=10`)
    .then((r) => r.json())
    .then((d) => renderBoard(d.scores || []))
    .catch(() => {
      const list = JSON.parse(localStorage.getItem('gs_board') || '[]');
      renderBoard(list.slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 })));
    });
}

function renderBoard(scores) {
  if (!scores.length) {
    el.rankList.innerHTML = '<li><span class="r">—</span><span class="m">暂无记录</span><span class="p"></span></li>';
    return;
  }
  el.rankList.innerHTML = scores.map((s) => {
    const t = Math.floor((s.durationMs || 0) / 1000);
    return `<li><span class="r">${s.rank}</span><span class="m">${escapeHtml(s.name || '匿名')} · ${t}s · Lv${s.wave || s.level || 1}</span><span class="p">${s.score}</span></li>`;
  }).join('');
}

function escapeHtml(v) {
  return String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function submitScore() {
  if (S.submitted) return;
  const name = (el.name.value || '匿名').trim().slice(0, 16) || '匿名';
  localStorage.setItem('gs_name', name);
  const payload = {
    game: GAME_ID,
    name,
    score: Math.floor(S.score),
    wave: S.level,
    kills: S.kills,
    shots: 0,
    hits: 0,
    accuracy: 0,
    durationMs: Math.floor(S.t * 1000),
  };
  try {
    const res = await fetch('/api/scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || '失败');
    S.submitted = true;
    el.submitNote.textContent = data.rank ? `已上榜 · 第 ${data.rank} 名` : '已保存';
    loadBoard();
  } catch (e) {
    el.submitNote.textContent = '上传失败：' + e.message;
  }
}

// ─── Buttons ───
$('btnStart').addEventListener('click', startGame);
$('btnResume').addEventListener('click', resumeGame);
$('btnRestart').addEventListener('click', startGame);
$('btnRetry').addEventListener('click', startGame);
$('btnSubmit').addEventListener('click', submitScore);
$('btnBoard').addEventListener('click', () => { showOverlay('board'); loadBoard(); });
$('btnBoardOver').addEventListener('click', () => { showOverlay('board'); loadBoard(); });
$('btnBoardClose').addEventListener('click', () => showOverlay(S.state === 'over' ? 'over' : 'menu'));
$('btnBoardRefresh').addEventListener('click', loadBoard);

// test hooks
window.__THREE_GAME_DIAGNOSTICS__ = {
  get state() { return S.state; },
  get score() { return S.score; },
  get kills() { return S.kills; },
  get level() { return S.level; },
  get t() { return S.t; },
  get enemies() { return world.enemies.length; },
};
window.__THREE_GAME_TEST_HOOKS__ = {
  seed(n) { rng = mulberry32(Number(n) || 1); return { seed: n }; },
  setState(name) {
    if (name === 'menu') { S.state = 'menu'; showOverlay('menu'); }
    else if (name === 'active-play' || name === 'playing') startGame();
    else if (name === 'paused') { if (S.state !== 'playing') startGame(); pauseGame(); }
    else if (name === 'gameover' || name === 'fail') { if (S.state !== 'playing') startGame(); S.hp = 0; gameOver(); }
    else return { state: name, ok: false };
    return { state: name, ok: true, gameState: S.state };
  },
  setPausedForScreenshot(v) {
    if (v) S.state = 'paused';
    return { state: S.state, pausedForScreenshot: !!v };
  },
  setReducedMotion() { return { reducedMotion: true }; },
  hideDebugUi() { return { hidden: true }; },
};

resize();
showOverlay('menu');
requestAnimationFrame(frame);
