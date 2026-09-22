import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const SCORE_DIR = join(import.meta.dirname, '..', 'data', 'game_scores');
export const SCORE_ENTRIES = join(SCORE_DIR, 'entries.json');
const SCORE_MAX_ENTRIES = 200;
const SCORE_MAX_PER_DAY = 30;
export const ALLOWED_GAMES = new Set(['grove_range', 'grove_survivor']);
export const ALLOWED_ORIGINS = new Set([
  'https://tools.treasuregrove.art',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://localhost:3000',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
]);

function ensureScoreDir() {
  try { mkdirSync(SCORE_DIR, { recursive: true }); } catch { /* ignore */ }
}

function loadScoreEntries() {
  try {
    const list = JSON.parse(readFileSync(SCORE_ENTRIES, 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveScoreEntries(list) {
  ensureScoreDir();
  writeFileSync(SCORE_ENTRIES, JSON.stringify(list, null, 2) + '\n');
}

export function sanitizeName(value) {
  let name = String(value || '');
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code >= 32 && code !== 127) out += name[i];
  }
  out = out.trim().slice(0, 16);
  return out || '匿名';
}

export function clampInt(value, min, max, fallback = 0) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function parseScoreBody(raw) {
  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return { error: '请求格式错误' };
  }

  const game = String(payload.game || 'grove_range');
  if (!ALLOWED_GAMES.has(game)) return { error: '未知游戏' };

  const score = clampInt(payload.score, 0, 5000000, -1);
  if (score < 0) return { error: '无效分数' };

  const wave = clampInt(payload.wave, 0, 999);
  const kills = clampInt(payload.kills, 0, 99999);
  const shots = clampInt(payload.shots, 0, 999999);
  const hits = Math.min(clampInt(payload.hits, 0, shots || 999999), shots || 0);
  const durationMs = clampInt(payload.durationMs, 0, 2 * 60 * 60 * 1000);

  let accuracy = Number(payload.accuracy);
  if (!Number.isFinite(accuracy)) accuracy = shots > 0 ? hits / shots : 0;
  if (accuracy > 1.5) accuracy = accuracy / 100;
  accuracy = Math.max(0, Math.min(1, accuracy));

  // Basic anti-cheat: reject impossible score rates (>10 pts / ms ≈ 10k/sec).
  if (durationMs > 3000 && score / durationMs > 10) {
    return { error: '成绩异常' };
  }

  return {
    entry: {
      id: 'sc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      game,
      name: sanitizeName(payload.name),
      score,
      wave,
      kills,
      shots,
      hits,
      accuracy: Math.round(accuracy * 1000) / 1000,
      durationMs,
      createdAt: new Date().toISOString(),
    },
  };
}

export function insertScoreEntry(entry) {
  ensureScoreDir();
  const list = loadScoreEntries();
  const ip = String(entry.ip || '');
  const day = entry.createdAt.slice(0, 10);
  const todayCount = list.filter((x) => x.ip === ip && String(x.createdAt || '').startsWith(day)).length;
  if (todayCount >= SCORE_MAX_PER_DAY) {
    return { ok: false, error: '今日提交次数已达上限' };
  }

  list.push(entry);
  list.sort((a, b) => b.score - a.score || (new Date(b.createdAt) - new Date(a.createdAt)));
  const trimmed = list.slice(0, SCORE_MAX_ENTRIES);
  saveScoreEntries(trimmed);

  const personalBest = trimmed
    .filter((x) => x.game === entry.game && x.name === entry.name)
    .reduce((m, x) => Math.max(m, x.score), 0);

  const rank = trimmed.findIndex((x) => x.id === entry.id) + 1;
  return { ok: true, rank, personalBest, accepted: true };
}

export function leaderboard(game, limit) {
  return loadScoreEntries()
    .filter((x) => x.game === game)
    .sort((a, b) => b.score - a.score || (new Date(b.createdAt) - new Date(a.createdAt)))
    .slice(0, limit)
    .map((x, i) => ({
      rank: i + 1,
      id: x.id,
      name: x.name,
      score: x.score,
      wave: x.wave,
      kills: x.kills,
      accuracy: x.accuracy,
      durationMs: x.durationMs,
      createdAt: x.createdAt,
    }));
}

export function applyScoreCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', 'https://tools.treasuregrove.art');
  }
}
