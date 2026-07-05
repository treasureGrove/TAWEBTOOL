#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SOURCES_FILE = path.join(ROOT, 'data/wiki_sources.json');
const ENTRIES_FILE = path.join(ROOT, 'data/ta_wiki_entries.json');
const MAX_PER_SOURCE = Number(process.env.WIKI_MAX_PER_SOURCE || 5);

const taKeywords = [
  'render', 'rendering', 'shader', 'material', 'pbr', 'texture', 'gpu', 'graphics',
  'unreal', 'unity', 'directx', 'vulkan', 'gltf', 'mesh', 'asset', 'pipeline',
  'performance', 'optimization', 'ray tracing', 'lighting', 'normal', 'roughness'
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'entry';
}

function idFor(value) {
  const hash = crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 10);
  return slug(value) + '-' + hash;
}

function stripTags(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  return match ? stripTags(match[1]) : '';
}

function textSlice(value, size = 220) {
  const text = stripTags(value);
  if (text.length <= size) return text;
  return text.slice(0, size).replace(/\s+\S*$/, '') + '...';
}

function inferTags(text, defaults = []) {
  const lower = String(text || '').toLowerCase();
  const found = [];
  for (const keyword of taKeywords) {
    if (lower.includes(keyword) && !found.includes(keyword)) {
      found.push(keyword);
    }
  }
  return Array.from(new Set(defaults.concat(found))).slice(0, 8);
}

function isRelevant(text) {
  const lower = String(text || '').toLowerCase();
  return taKeywords.some((keyword) => lower.includes(keyword));
}

function buildContent({ title, summary, sourceUrl, sourceTitle, category, tags }) {
  const tagLine = tags.length ? tags.join(', ') : '未分类标签';
  return [
    '## 自动归纳',
    '',
    summary || '采集器获取到该来源，但没有足够正文生成详细摘要。',
    '',
    '## TA 视角',
    '',
    '- 关注它对渲染质量、性能预算、资产管线或 Shader 实现的影响。',
    '- 阅读原文时优先确认版本、平台和适用限制。',
    '- 如果要落地到项目中，先用小场景验证成本和画质收益。',
    '',
    '## 元信息',
    '',
    `- 分类：${category}`,
    `- 标签：${tagLine}`,
    `- 来源：${sourceTitle || sourceUrl}`,
    sourceUrl ? `- 原文：${sourceUrl}` : ''
  ].filter(Boolean).join('\n');
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

async function fetchText(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TAWEBTOOL-WikiCollector/1.0',
      ...headers
    }
  });
  if (!response.ok) {
    throw new Error(`${url} HTTP ${response.status}`);
  }
  return response.text();
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TAWEBTOOL-WikiCollector/1.0',
      'Accept': 'application/vnd.github+json, application/json',
      ...headers
    }
  });
  if (!response.ok) {
    throw new Error(`${url} HTTP ${response.status}`);
  }
  return response.json();
}

function parseRssItems(xml) {
  const blocks = [...xml.matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const title = firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const link = firstMatch(block, /<link[^>]*href=["']([^"']+)["'][^>]*>/i) || firstMatch(block, /<link[^>]*>([\s\S]*?)<\/link>/i);
    const summary = firstMatch(block, /<description[^>]*>([\s\S]*?)<\/description>/i) || firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) || firstMatch(block, /<content[^>]*>([\s\S]*?)<\/content>/i);
    const publishedAt = firstMatch(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || firstMatch(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i) || firstMatch(block, /<published[^>]*>([\s\S]*?)<\/published>/i);
    return { title, link, summary, publishedAt };
  }).filter((item) => item.title && item.link);
}

async function collectRss(source) {
  const xml = await fetchText(source.url);
  return parseRssItems(xml)
    .filter((item) => isRelevant([item.title, item.summary].join(' ')))
    .slice(0, MAX_PER_SOURCE)
    .map((item) => {
      const tags = inferTags([item.title, item.summary].join(' '), source.tags || []);
      return {
        id: idFor(item.link || item.title),
        title: item.title,
        category: source.category || '自动采集',
        tags,
        summary: textSlice(item.summary || item.title),
        content: buildContent({
          title: item.title,
          summary: textSlice(item.summary || item.title, 420),
          sourceUrl: item.link,
          sourceTitle: source.title,
          category: source.category || '自动采集',
          tags
        }),
        source: 'rss',
        sourceTitle: source.title,
        sourceUrl: item.link,
        quality: 'draft',
        updatedAt: item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : today()
      };
    });
}

async function collectPage(source) {
  const html = await fetchText(source.url);
  const title = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || source.title;
  const summary = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || textSlice(html);
  const tags = inferTags([title, summary].join(' '), source.tags || []);
  return [{
    id: idFor(source.url),
    title,
    category: source.category || '自动采集',
    tags,
    summary: textSlice(summary),
    content: buildContent({
      title,
      summary: textSlice(summary, 420),
      sourceUrl: source.url,
      sourceTitle: source.title,
      category: source.category || '自动采集',
      tags
    }),
    source: 'collected',
    sourceTitle: source.title,
    sourceUrl: source.url,
    quality: 'draft',
    updatedAt: today()
  }];
}

async function collectGithubRepo(source) {
  const token = process.env.GITHUB_TOKEN || '';
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const repoUrl = `https://api.github.com/repos/${source.owner}/${source.repo}`;
  const repo = await fetchJson(repoUrl, headers);
  let readmeText = '';
  try {
    const readme = await fetchJson(`${repoUrl}/readme`, headers);
    if (readme && readme.content) {
      readmeText = Buffer.from(readme.content, 'base64').toString('utf8');
    }
  } catch (err) {
    readmeText = '';
  }

  const title = source.title || repo.full_name;
  const summary = textSlice(repo.description || readmeText || title, 240);
  const tags = inferTags([title, repo.description, readmeText].join(' '), source.tags || []);
  return [{
    id: idFor(repo.html_url),
    title,
    category: source.category || 'GitHub',
    tags,
    summary,
    content: buildContent({
      title,
      summary: textSlice([repo.description, readmeText].filter(Boolean).join('\n\n'), 520),
      sourceUrl: repo.html_url,
      sourceTitle: 'GitHub / ' + repo.full_name,
      category: source.category || 'GitHub',
      tags
    }),
    source: 'github',
    sourceTitle: 'GitHub / ' + repo.full_name,
    sourceUrl: repo.html_url,
    quality: 'draft',
    updatedAt: repo.pushed_at ? repo.pushed_at.slice(0, 10) : today()
  }];
}

async function collectSource(source) {
  if (source.type === 'rss') return collectRss(source);
  if (source.type === 'page') return collectPage(source);
  if (source.type === 'github_repo') return collectGithubRepo(source);
  console.warn(`skip unsupported source type: ${source.type}`);
  return [];
}

function mergeEntries(existing, incoming) {
  const map = new Map();
  for (const item of existing) {
    map.set(item.id || idFor(item.sourceUrl || item.title), item);
  }
  for (const item of incoming) {
    const key = item.id || idFor(item.sourceUrl || item.title);
    map.set(key, { ...map.get(key), ...item });
  }
  return Array.from(map.values()).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

async function main() {
  const config = await readJson(SOURCES_FILE, { sources: [] });
  const existing = await readJson(ENTRIES_FILE, []);
  const sources = Array.isArray(config.sources) ? config.sources : [];
  const collected = [];

  for (const source of sources) {
    try {
      const entries = await collectSource(source);
      collected.push(...entries);
      console.log(`[wiki] ${source.id}: ${entries.length} entries`);
    } catch (err) {
      console.warn(`[wiki] ${source.id} failed: ${err.message}`);
    }
  }

  const merged = mergeEntries(existing, collected);
  await fs.writeFile(ENTRIES_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`[wiki] wrote ${merged.length} entries to ${path.relative(ROOT, ENTRIES_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
