#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES_FILE = path.join(ROOT, 'data/ta_wiki_entries.json');
const BEFORE_FILE = path.join(ROOT, 'logs/ta_wiki_entries.before.json');
const COLLECT_LOG = path.join(ROOT, 'logs/wiki_collect.last.log');
const OUT_FILE = path.join(ROOT, 'logs/wiki_email_digest.last.md');

loadDotEnv(path.join(ROOT, '.env'));

const AI_API_KEY = process.env.WIKI_AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENCODE_DEEPSEEK_API_KEY || '';
const AI_BASE_URL = (process.env.WIKI_AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const AI_MODEL = process.env.WIKI_AI_MODEL || 'deepseek-v4-flash';

function loadDotEnv(file) {
  try {
    const text = fsSync.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[match[1]]) process.env[match[1]] = value;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[wiki-mail] failed to load .env: ${err.message}`);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readText(file, fallback = '') {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return fallback;
  }
}

function compact(value, size = 900) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= size) return text;
  return text.slice(0, size).replace(/\s+\S*$/, '') + '...';
}

function section(markdown, title) {
  const pattern = new RegExp(`(?:^|\\n)##\\s+${escapeRegExp(title)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i');
  const match = pattern.exec(String(markdown || ''));
  return match ? match[1].trim() : '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripMarkdown(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function changedEntries(before, after, collectLog) {
  const beforeMap = new Map(before.map((entry) => [entry.id, entry]));
  const aiTitles = new Set([...collectLog.matchAll(/\[wiki\] AI enriched: (.+)$/gm)].map((match) => match[1].trim()));
  const changed = [];

  for (const entry of after) {
    const old = beforeMap.get(entry.id);
    const reasons = [];
    if (!old) reasons.push('新增入库');
    if (old && old.summary !== entry.summary) reasons.push('摘要更新');
    if (old && old.content !== entry.content) reasons.push('正文更新');
    if (old && old.quality !== entry.quality) reasons.push(`质量状态 ${old.quality || 'unknown'} -> ${entry.quality || 'unknown'}`);
    if (aiTitles.has(entry.title)) reasons.push('DeepSeek 精炼');
    if (reasons.length) changed.push({ entry, reasons });
  }

  if (!changed.length && aiTitles.size) {
    for (const title of aiTitles) {
      const entry = after.find((item) => item.title === title);
      if (entry) changed.push({ entry, reasons: ['DeepSeek 精炼'] });
    }
  }

  return changed.slice(0, 10);
}

function entryForPrompt(row) {
  const entry = row.entry;
  return {
    title: entry.title,
    updateReasons: row.reasons,
    category: entry.category,
    tags: entry.tags || [],
    quality: entry.quality,
    aiModel: entry.aiModel || '',
    relevanceScore: entry.relevanceScore,
    filterConfidence: entry.filterConfidence,
    filterReason: entry.filterReason || '',
    sourceTitle: entry.sourceTitle || '',
    sourceUrl: entry.sourceUrl || '',
    summary: compact(entry.summary, 420),
    originalExcerpt: compact(section(entry.content, '原文摘录').replace(/^>\s*/gm, ''), 700),
    articleExplanation: compact(section(entry.content, '文章阐述').replace(/^[-*]\s*/gm, ''), 700),
    taView: compact(section(entry.content, 'TA 视角').replace(/^[-*]\s*/gm, ''), 700)
  };
}

function fallbackDigest(rows, collectLog) {
  const lines = [
    'TA Wiki 自动更新报告',
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
    '',
    `本次检测到 ${rows.length} 条新增或更新内容。`,
    ''
  ];

  if (!rows.length) {
    lines.push('本次没有检测到新增或内容变更条目。');
  }

  rows.forEach((row, index) => {
    const entry = row.entry;
    lines.push(`${index + 1}. ${entry.title}`);
    lines.push(`更新类型：${row.reasons.join('、')}`);
    lines.push(`来源：${entry.sourceTitle || '未知'}${entry.sourceUrl ? ` (${entry.sourceUrl})` : ''}`);
    lines.push(`分类：${entry.category || '未分类'}`);
    lines.push(`具体内容：${compact(entry.summary, 220) || '暂无摘要'}`);
    const excerpt = section(entry.content, '原文摘录');
    if (excerpt) lines.push(`原文重点：${compact(excerpt.replace(/^>\s*/gm, ''), 280)}`);
    const article = section(entry.content, '文章阐述');
    if (article) lines.push(`文章说明：${compact(article.replace(/^[-*]\s*/gm, ''), 280)}`);
    const ta = section(entry.content, 'TA 视角');
    if (ta) lines.push(`TA 落地：${compact(ta.replace(/^[-*]\s*/gm, ''), 280)}`);
    lines.push('');
  });

  lines.push('采集状态：');
  lines.push(compact(collectLog, 800) || '无采集日志。');
  return lines.join('\n');
}

async function askDeepSeek(rows, collectLog) {
  if (!AI_API_KEY || !rows.length) return '';
  const payload = {
    model: AI_MODEL,
    messages: [
      {
        role: 'system',
        content: [
          '你是 TA Wiki 的中文邮件编辑。',
          '请写普通邮件正文，不要写 Markdown。',
          '不要使用 #、###、**、表格、代码块。',
          '语言要简单、清楚、像正常邮件通知。',
          '每条更新都要说明具体更新了什么，不要只说“更新了某个条目”。',
          '每条都要包含：更新类型、来源、具体内容、原文重点、TA 怎么用。',
          '如果信息不足，要直接写“需要打开原文确认”，不要编造。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '请根据下面 JSON 生成一封纯文本中文邮件。',
          '推荐格式：',
          'TA Wiki 自动更新报告',
          '本次更新了 X 条内容。',
          '',
          '1. 条目标题',
          '更新类型：...',
          '来源：...',
          '具体内容：...',
          '原文重点：...',
          'TA 怎么用：...',
          '',
          '最后写“需要人工复核”：列出需要确认的点。',
          '',
          JSON.stringify({
            generatedAt: new Date().toISOString(),
            collectLog,
            entries: rows.map(entryForPrompt)
          }, null, 2)
        ].join('\n')
      }
    ],
    temperature: 0.2
  };

  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`DeepSeek mail digest failed: ${response.status} ${await response.text()}`);
  }
  const json = await response.json();
  return stripMarkdown(json.choices?.[0]?.message?.content || '');
}

async function main() {
  const before = await readJson(BEFORE_FILE, []);
  const after = await readJson(ENTRIES_FILE, []);
  const collectLog = await readText(COLLECT_LOG);
  const rows = changedEntries(before, after, collectLog);

  let digest = '';
  try {
    digest = await askDeepSeek(rows, collectLog);
  } catch (err) {
    console.warn(`[wiki-mail] ${err.message}`);
  }
  if (!digest) digest = fallbackDigest(rows, collectLog);

  await fs.writeFile(OUT_FILE, digest + '\n', 'utf8');
  process.stdout.write(digest + '\n');
}

main().catch((err) => {
  console.error(`[wiki-mail] ${err.stack || err.message}`);
  process.exit(1);
});
