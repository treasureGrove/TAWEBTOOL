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

function compact(value, size = 1200) {
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

  return changed.slice(0, 12);
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
    summary: compact(entry.summary, 500),
    originalExcerpt: compact(section(entry.content, '原文摘录'), 1000),
    articleExplanation: compact(section(entry.content, '文章阐述'), 1000),
    taView: compact(section(entry.content, 'TA 视角'), 1000)
  };
}

function fallbackDigest(rows, collectLog) {
  const lines = [
    '# TA Wiki 自动更新报告',
    '',
    `生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}`,
    '',
    '## 本次具体更新',
    ''
  ];

  if (!rows.length) {
    lines.push('本次采集没有检测到新增或内容变更条目。');
  }

  rows.forEach((row, index) => {
    const entry = row.entry;
    lines.push(`### ${index + 1}. ${entry.title}`);
    lines.push(`- 更新类型：${row.reasons.join('、')}`);
    lines.push(`- 来源：${entry.sourceTitle || '未知'}${entry.sourceUrl ? ` (${entry.sourceUrl})` : ''}`);
    lines.push(`- 分类/标签：${entry.category || '未分类'} / ${(entry.tags || []).slice(0, 6).join('、')}`);
    lines.push(`- 具体内容：${compact(entry.summary, 260) || '无摘要'}`);
    const excerpt = section(entry.content, '原文摘录');
    if (excerpt) lines.push(`- 原文摘录重点：${compact(excerpt.replace(/^>\s*/gm, ''), 360)}`);
    const article = section(entry.content, '文章阐述');
    if (article) lines.push(`- 文章阐述：${compact(article.replace(/^[-*]\s*/gm, ''), 360)}`);
    const ta = section(entry.content, 'TA 视角');
    if (ta) lines.push(`- TA 落地：${compact(ta.replace(/^[-*]\s*/gm, ''), 360)}`);
    lines.push('');
  });

  lines.push('## 采集日志');
  lines.push('```text');
  lines.push(collectLog.trim());
  lines.push('```');
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
          '你必须写简体中文 Markdown 邮件。',
          '禁止只说“更新了条目”这类空话。',
          '每个条目必须说明具体新增/更新了什么知识点、原文摘录说了什么、TA 应该如何落地。',
          '如果信息不足，要明确说不足在哪里，不要编造。'
        ].join('\n')
      },
      {
        role: 'user',
        content: [
          '请根据下面 JSON 生成 TA Wiki 自动更新邮件。',
          '格式要求：',
          '1. 标题：TA Wiki 自动更新报告',
          '2. 开头一句话说明本次更新数量和状态。',
          '3. 对每个条目使用三级标题，逐条写：更新类型、来源、具体更新内容、原文摘录重点、TA 落地建议。',
          '4. 最后给出“需要人工复核”的条目或原因。',
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
  return String(json.choices?.[0]?.message?.content || '').trim();
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
