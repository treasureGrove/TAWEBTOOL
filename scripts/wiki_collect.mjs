#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(ROOT, '.env'));

const SOURCES_FILE = path.join(ROOT, 'data/wiki_sources.json');
const ENTRIES_FILE = path.join(ROOT, 'data/ta_wiki_entries.json');
const MEMORY_FILE = path.join(ROOT, 'data/wiki_memory.json');
const MAX_PER_SOURCE = Number(process.env.WIKI_MAX_PER_SOURCE || 5);
const AI_API_KEY = process.env.WIKI_AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENCODE_DEEPSEEK_API_KEY || '';
const AI_BASE_URL = (process.env.WIKI_AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const AI_MODEL = process.env.WIKI_AI_MODEL || 'deepseek-v4-flash';
const AI_ENABLED = process.env.WIKI_AI !== '0' && Boolean(AI_API_KEY);
const AI_MAX_ENTRIES = Number(process.env.WIKI_AI_MAX_ENTRIES || 20);
const AI_FILTER_ENABLED = AI_ENABLED && process.env.WIKI_AI_FILTER !== '0';
const MIN_RELEVANCE_SCORE = Number(process.env.WIKI_MIN_RELEVANCE_SCORE || 5);
const KEEP_STALE_ENTRIES = process.env.WIKI_KEEP_STALE === '1';

function loadDotEnv(file) {
  try {
    const text = fsSync.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const key = match[1];
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`[wiki] failed to load .env: ${err.message}`);
  }
}

const taKeywords = [
  'render', 'rendering', 'shader', 'material', 'pbr', 'texture', 'gpu', 'graphics',
  'unreal', 'unity', 'directx', 'vulkan', 'gltf', 'mesh', 'asset', 'pipeline',
  'performance', 'optimization', 'ray tracing', 'lighting', 'normal', 'roughness',
  'opengl', 'webgpu', 'wgsl', 'hlsl', 'glsl', 'brdf', 'fresnel', 'ibl', 'shading'
];

const weightedKeywords = new Map([
  ['shader', 4],
  ['hlsl', 4],
  ['glsl', 4],
  ['wgsl', 4],
  ['pbr', 4],
  ['brdf', 4],
  ['fresnel', 3],
  ['ibl', 3],
  ['rendering', 3],
  ['render pipeline', 4],
  ['gpu performance', 4],
  ['optimization', 2],
  ['texture compression', 4],
  ['normal map', 4],
  ['roughness', 3],
  ['metallic', 3],
  ['material', 2],
  ['mesh', 2],
  ['gltf', 3],
  ['directx', 3],
  ['vulkan', 3],
  ['webgpu', 3],
  ['opengl', 3],
  ['unreal', 2],
  ['unity', 2],
  ['lod', 2],
  ['ray tracing', 3],
  ['lighting', 2],
  ['shading', 3]
]);

const noisePatterns = [
  /adblock/i,
  /cookie/i,
  /subscribe/i,
  /newsletter/i,
  /privacy policy/i,
  /sign in/i,
  /log in/i,
  /whitelisting this site/i,
  /press release/i,
  /we are hiring/i,
  /job opening/i,
  /career/i,
  /coupon/i,
  /sale/i,
  /sponsored/i
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
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
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

function compactText(value) {
  return stripTags(value)
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  return match ? stripTags(match[1]) : '';
}

function textSlice(value, size = 220) {
  const text = compactText(value);
  if (text.length <= size) return text;
  return text.slice(0, size).replace(/\s+\S*$/, '') + '...';
}

function extractReadableText(html) {
  const body =
    firstMatch(html, /<article[^>]*>([\s\S]*?)<\/article>/i) ||
    firstMatch(html, /<main[^>]*>([\s\S]*?)<\/main>/i) ||
    firstMatch(html, /<body[^>]*>([\s\S]*?)<\/body>/i) ||
    html;
  return compactText(body);
}

function splitSentences(value) {
  return compactText(value)
    .split(/(?<=[.!?。！？])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 24)
    .filter((line) => !noisePatterns.some((pattern) => pattern.test(line)));
}

function pickRelevantSentences(value, limit = 4) {
  const sentences = splitSentences(value);
  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: taKeywords.reduce((score, keyword) => (
        sentence.toLowerCase().includes(keyword) ? score + 1 : score
      ), 0)
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter((row) => row.score > 0)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map((row) => row.sentence);
  return ranked.length ? ranked : sentences.slice(0, limit);
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

function relevanceScore(text) {
  const lower = compactText(text).toLowerCase();
  let score = 0;
  for (const [keyword, weight] of weightedKeywords.entries()) {
    if (lower.includes(keyword)) score += weight;
  }
  if (/\b(api|backend|database|frontend|css|react|vue)\b/i.test(lower) && score < 8) score -= 2;
  if (noisePatterns.some((pattern) => pattern.test(lower))) score -= 3;
  return Math.max(0, score);
}

function prefilterRelevant(text) {
  return relevanceScore(text) >= MIN_RELEVANCE_SCORE;
}

function buildArticleNotes({ title, text, category, tags }) {
  const lower = [title, text, tags.join(' ')].join(' ').toLowerCase();
  const notes = [];

  if (/(pbr|brdf|material|roughness|metallic|normal|texture)/i.test(lower)) {
    notes.push('这类内容应优先映射到材质输入、贴图通道、采样空间和美术制作规范，避免只停留在算法名词。');
  }
  if (/(performance|optimization|gpu|profiler|draw|bandwidth|memory)/i.test(lower)) {
    notes.push('性能相关内容需要区分 CPU 提交、GPU 执行、带宽、显存和同步等待，定位时先用帧分析工具拆 Pass。');
  }
  if (/(shader|hlsl|glsl|wgsl|compute|pipeline)/i.test(lower)) {
    notes.push('Shader 或管线内容落地前要确认目标平台、渲染管线版本、变体数量和调试工具支持。');
  }
  if (/(gltf|mesh|asset|lod|pipeline|unity|unreal)/i.test(lower)) {
    notes.push('资产管线类内容适合转成命名、导入、压缩、LOD、预算和自动检查规则。');
  }

  if (!notes.length) {
    notes.push(`这篇内容被归到“${category}”，适合作为 TA 知识库的外部参考，再结合项目平台和引擎版本判断适用范围。`);
  }

  return notes.slice(0, 3);
}

function buildContent({ title, summary, sourceUrl, sourceTitle, category, tags, originalText }) {
  const tagLine = tags.length ? tags.join(', ') : '未分类标签';
  const excerptLines = pickRelevantSentences(originalText || summary, 4);
  const articleNotes = buildArticleNotes({
    title,
    text: [summary, originalText].join(' '),
    category,
    tags
  });

  return [
    '## 自动归纳',
    '',
    summary || '采集器获取到该来源，但没有足够正文生成详细摘要。',
    '',
    '## 原文摘录',
    '',
    excerptLines.length
      ? excerptLines.map((line) => `> ${textSlice(line, 260)}`).join('\n\n')
      : '> 该来源没有提供足够可读取正文，请打开原文查看完整上下文。',
    '',
    '## 文章阐述',
    '',
    ...articleNotes.map((line) => `- ${line}`),
    '',
    '## TA 视角',
    '',
    '- 关注它对渲染质量、性能预算、资产管线或 Shader 实现的影响。',
    '- 阅读原文时优先确认版本、平台和适用限制。',
    '- 如果要落地到项目中，先用小场景验证成本和画质收益。',
    '- 把可复用结论沉淀成材质模板、导入规则、性能预算或检查脚本。',
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

function memoryPrompt(memory) {
  if (!memory || typeof memory !== 'object') return '';
  return [
    `目标：${(memory.goals || []).join('；')}`,
    `收录：${(memory.include || []).join('，')}`,
    `排除：${(memory.exclude || []).join('，')}`,
    memory.style ? `写作风格：摘要=${memory.style.summary || ''}；文章阐述=${memory.style.article || ''}；TA视角=${memory.style.ta || ''}` : '',
    memory.quality ? `质量阈值：score>=${memory.quality.minScore || 7}，confidence>=${memory.quality.minConfidence || 0.65}` : ''
  ].filter(Boolean).join('\n');
}

function parseJsonObject(value) {
  const text = String(value || '').trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    const match = /\{[\s\S]*\}/.exec(text);
    return match ? JSON.parse(match[0]) : {};
  }
}

async function callAiJson(messages) {
  const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AI_API_KEY}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 1200,
      stream: false
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  const payload = await response.json();
  return parseJsonObject(payload?.choices?.[0]?.message?.content || '{}');
}

function replaceMarkdownSection(markdown, heading, replacementLines) {
  const replacement = [`## ${heading}`, '', ...replacementLines].join('\n');
  const pattern = new RegExp(`## ${heading}\\n[\\s\\S]*?(?=\\n## |$)`);
  if (pattern.test(markdown)) return markdown.replace(pattern, replacement);
  return `${markdown.trim()}\n\n${replacement}`;
}

async function enrichEntryWithAi(entry, memory) {
  const sourceText = [
    `标题：${entry.title}`,
    `分类：${entry.category}`,
    `标签：${(entry.tags || []).join(', ')}`,
    `摘要：${entry.summary}`,
    '',
    entry.content
  ].join('\n');

  const result = await callAiJson([
    {
      role: 'system',
      content: [
        '你是技术美术（TA）知识库编辑。',
        memoryPrompt(memory),
        '请基于输入内容生成中文 JSON，不要输出 markdown 代码块。',
        'JSON 字段：summary:string, article:string, ta:string[]。',
        'summary 控制在 120 字内；article 用 2 到 4 段解释文章讲了什么、为什么重要、适用边界；ta 给 3 到 5 条可落地检查建议。',
        '不要编造原文没有的信息；如果信息不足，明确说需要打开原文确认。'
      ].join('\n')
    },
    {
      role: 'user',
      content: sourceText.slice(0, 12000)
    }
  ]);

  const summary = String(result.summary || entry.summary || '').trim();
  const article = String(result.article || '').trim();
  const ta = Array.isArray(result.ta) ? result.ta.map((item) => String(item).trim()).filter(Boolean) : [];

  if (summary) entry.summary = textSlice(summary, 220);
  if (article) {
    entry.content = replaceMarkdownSection(entry.content, '文章阐述', article.split(/\n+/).filter(Boolean));
  }
  if (ta.length) {
    entry.content = replaceMarkdownSection(entry.content, 'TA 视角', ta.map((line) => `- ${line.replace(/^[-*]\s*/, '')}`));
  }
  entry.quality = 'ai-draft';
  entry.aiModel = AI_MODEL;
  entry.aiUpdatedAt = today();
  return entry;
}

async function enrichEntriesWithAi(entries, memory) {
  if (!AI_ENABLED) {
    console.log('[wiki] AI enrichment skipped: set WIKI_AI_API_KEY or DEEPSEEK_API_KEY to enable.');
    return entries;
  }

  const out = [];
  let used = 0;
  for (const entry of entries) {
    if (used >= AI_MAX_ENTRIES) {
      out.push(entry);
      continue;
    }
    try {
      out.push(await enrichEntryWithAi(entry, memory));
      used += 1;
      console.log(`[wiki] AI enriched: ${entry.title}`);
    } catch (err) {
      console.warn(`[wiki] AI enrich failed: ${entry.title}: ${err.message}`);
      out.push(entry);
    }
  }
  return out;
}

async function classifyCandidateWithAi({ title, summary, text, source, memory }) {
  if (!AI_FILTER_ENABLED) {
    const localScore = relevanceScore([title, summary, text].join(' '));
    const relevant = localScore >= MIN_RELEVANCE_SCORE;
    return {
      include: relevant,
      category: source.category || '自动采集',
      tags: inferTags([title, summary, text].join(' '), source.tags || []),
      reason: relevant ? `local-score:${localScore}` : `local-score-rejected:${localScore}`,
      score: localScore,
      confidence: relevant ? 0.6 : 0
    };
  }

  const localScore = relevanceScore([title, summary, text].join(' '));
  if (localScore < Math.max(3, MIN_RELEVANCE_SCORE - 2)) {
    return {
      include: false,
      category: source.category || '自动采集',
      tags: [],
      reason: `local-prescreen-rejected:${localScore}`,
      score: localScore,
      confidence: 0
    };
  }

  const result = await callAiJson([
    {
      role: 'system',
      content: [
        '你是技术美术（TA）知识库的文章筛选器。',
        memoryPrompt(memory),
        '请严格判断候选内容是否值得收录到 TA 知识库。',
        '只收录和实时渲染、图形学、Shader、材质、贴图、GPU 性能、引擎渲染管线、资产管线、DCC 到引擎流程、TA 工具链有关的内容。',
        '必须满足：有可复用知识点，能沉淀成规范/排查方法/实现经验/性能结论；只提到产品发布、版本新闻、营销介绍、招聘、普通编程文章都不要收录。',
        '如果只是仓库说明、新闻摘要、下载页、首页导航、会议预告，include 必须为 false。',
        '输出 JSON：include:boolean, score:number, confidence:number, category:string, tags:string[], contentType:string, reason:string。',
        'score 0-10，低于 7 不应收录；confidence 0-1，低于 0.65 不应收录。',
        'contentType 可选：教程、技术文章、规范、论文笔记、工具文档、性能分析、其它。',
        'category 用中文短分类；tags 最多 8 个。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        `来源：${source.title || source.id || ''}`,
        `标题：${title}`,
        `摘要：${summary}`,
        '',
        compactText(text).slice(0, 6000)
      ].join('\n')
    }
  ]);

  const score = Number(result.score || 0);
  const confidence = Number(result.confidence || 0);
  return {
    include: Boolean(result.include) && score >= 7 && confidence >= 0.65,
    category: String(result.category || source.category || '自动采集').trim(),
    tags: Array.isArray(result.tags)
      ? result.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
      : inferTags([title, summary, text].join(' '), source.tags || []),
    reason: String(result.reason || '').trim(),
    score,
    confidence,
    contentType: String(result.contentType || '').trim()
  };
}

function parseRssItems(xml) {
  const blocks = [...xml.matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return blocks.map((block) => {
    const title = firstMatch(block, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const link = firstMatch(block, /<link[^>]*href=["']([^"']+)["'][^>]*>/i) || firstMatch(block, /<link[^>]*>([\s\S]*?)<\/link>/i);
    const content = firstMatch(block, /<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) || firstMatch(block, /<content[^>]*>([\s\S]*?)<\/content>/i);
    const summary = firstMatch(block, /<description[^>]*>([\s\S]*?)<\/description>/i) || firstMatch(block, /<summary[^>]*>([\s\S]*?)<\/summary>/i) || content;
    const publishedAt = firstMatch(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || firstMatch(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i) || firstMatch(block, /<published[^>]*>([\s\S]*?)<\/published>/i);
    return { title, link, summary, content, publishedAt };
  }).filter((item) => item.title && item.link);
}

async function collectRss(source) {
  const xml = await fetchText(source.url);
  const entries = [];
  const candidates = parseRssItems(xml).slice(0, MAX_PER_SOURCE * 3);
  for (const item of candidates) {
    if (!AI_FILTER_ENABLED && !prefilterRelevant([item.title, item.summary, item.content].join(' '))) continue;
    const verdict = await classifyCandidateWithAi({
      title: item.title,
      summary: item.summary,
      text: item.content || item.summary,
      source,
      memory: source.memory
    });
    if (!verdict.include) continue;

    const tags = verdict.tags.length ? verdict.tags : inferTags([item.title, item.summary].join(' '), source.tags || []);
    entries.push({
        id: idFor(item.link || item.title),
        title: item.title,
        category: verdict.category || source.category || '自动采集',
        tags,
        summary: textSlice(item.summary || item.title),
        content: buildContent({
          title: item.title,
          summary: textSlice(item.summary || item.title, 420),
          originalText: item.content || item.summary || item.title,
          sourceUrl: item.link,
          sourceTitle: source.title,
          category: verdict.category || source.category || '自动采集',
          tags
        }),
        source: 'rss',
        sourceId: source.id,
        sourceTitle: source.title,
        sourceUrl: item.link,
        quality: 'draft',
        updatedAt: item.publishedAt ? new Date(item.publishedAt).toISOString().slice(0, 10) : today(),
        filterReason: verdict.reason,
        relevanceScore: verdict.score,
        filterConfidence: verdict.confidence,
        contentType: verdict.contentType
    });
    if (entries.length >= MAX_PER_SOURCE) break;
  }
  return entries;
}

async function collectPage(source) {
  const html = await fetchText(source.url);
  const title = firstMatch(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || source.title;
  const readableText = extractReadableText(html);
  const summary = firstMatch(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) || textSlice(readableText);
  const verdict = await classifyCandidateWithAi({ title, summary, text: readableText, source, memory: source.memory });
  if (!verdict.include) return [];
  const tags = verdict.tags.length ? verdict.tags : inferTags([title, summary, readableText].join(' '), source.tags || []);
  return [{
    id: idFor(source.url),
    title,
    category: verdict.category || source.category || '自动采集',
    tags,
    summary: textSlice(summary),
    content: buildContent({
      title,
      summary: textSlice(summary, 420),
      originalText: readableText,
      sourceUrl: source.url,
      sourceTitle: source.title,
      category: verdict.category || source.category || '自动采集',
      tags
    }),
    source: 'collected',
    sourceId: source.id,
    sourceTitle: source.title,
    sourceUrl: source.url,
    quality: 'draft',
    updatedAt: today(),
    filterReason: verdict.reason,
    relevanceScore: verdict.score,
    filterConfidence: verdict.confidence,
    contentType: verdict.contentType
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
  const fullText = [repo.description, readmeText].filter(Boolean).join('\n\n');
  const verdict = await classifyCandidateWithAi({ title, summary, text: fullText, source, memory: source.memory });
  if (!verdict.include) return [];
  const tags = verdict.tags.length ? verdict.tags : inferTags([title, repo.description, readmeText].join(' '), source.tags || []);
  return [{
    id: idFor(repo.html_url),
    title,
    category: verdict.category || source.category || 'GitHub',
    tags,
    summary,
    content: buildContent({
      title,
      summary: textSlice(fullText, 520),
      originalText: fullText,
      sourceUrl: repo.html_url,
      sourceTitle: 'GitHub / ' + repo.full_name,
      category: verdict.category || source.category || 'GitHub',
      tags
    }),
    source: 'github',
    sourceId: source.id,
    sourceTitle: 'GitHub / ' + repo.full_name,
    sourceUrl: repo.html_url,
    quality: 'draft',
    updatedAt: repo.pushed_at ? repo.pushed_at.slice(0, 10) : today(),
    filterReason: verdict.reason,
    relevanceScore: verdict.score,
    filterConfidence: verdict.confidence,
    contentType: verdict.contentType
  }];
}

async function collectSource(source) {
  if (source.type === 'rss') return collectRss(source);
  if (source.type === 'page') return collectPage(source);
  if (source.type === 'github_repo') return collectGithubRepo(source);
  console.warn(`skip unsupported source type: ${source.type}`);
  return [];
}

function mergeEntries(existing, incoming, sources) {
  const activeIds = new Set(sources.map((source) => source.id).filter(Boolean));
  const activeTitles = new Set(sources.map((source) => source.title).filter(Boolean));
  const idByTitle = new Map(sources.map((source) => [source.title, source.id]).filter((row) => row[0] && row[1]));
  const base = KEEP_STALE_ENTRIES ? existing : existing.filter((item) => (
    (item.sourceId && activeIds.has(item.sourceId)) ||
    (!item.sourceId && item.sourceTitle && activeTitles.has(item.sourceTitle))
  ));
  const map = new Map();
  for (const item of base) {
    const sourceId = item.sourceId || idByTitle.get(item.sourceTitle) || '';
    map.set(item.id || idFor(item.sourceUrl || item.title), sourceId ? { ...item, sourceId } : item);
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
  const memory = await readJson(MEMORY_FILE, {});
  const sources = Array.isArray(config.sources) ? config.sources : [];
  sources.forEach((source) => {
    source.memory = memory;
  });
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

  const enriched = await enrichEntriesWithAi(collected, memory);
  const merged = mergeEntries(existing, enriched, sources);
  await fs.writeFile(ENTRIES_FILE, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  console.log(`[wiki] wrote ${merged.length} entries to ${path.relative(ROOT, ENTRIES_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
