#!/usr/bin/env node
/**
 * 程序化 SEO 生成器
 * 用 DeepSeek 批量生成长尾词条页（TA 术语百科 + 工具教程），
 * 输出中文(/seo/) + 英文(/en/seo/) 静态页，含 FAQPage/HowTo 结构化数据，
 * 并更新 sitemap 与推送清单。
 * 复用会话前缀缓存以控制成本。
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://tools.treasuregrove.art';
const SEO_DIR = path.join(ROOT, 'seo');
const EN_SEO_DIR = path.join(ROOT, 'en', 'seo');
const SITEMAP_FILE = path.join(ROOT, 'sitemap-seo.xml');

loadDotEnv(path.join(ROOT, '.env'));
// 回退到 opencode auth.json（与 run_wiki_collect.sh 一致）
if (!process.env.WIKI_AI_API_KEY && !process.env.DEEPSEEK_API_KEY && !process.env.OPENCODE_DEEPSEEK_API_KEY) {
  try {
    const a = JSON.parse(fsSync.readFileSync('/root/.local/share/opencode/auth.json', 'utf8'));
    if (a && a.deepseek && a.deepseek.key) process.env.DEEPSEEK_API_KEY = a.deepseek.key;
  } catch {}
}
const AI_API_KEY = process.env.WIKI_AI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENCODE_DEEPSEEK_API_KEY || '';
const AI_BASE_URL = (process.env.WIKI_AI_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
const AI_MODEL = process.env.WIKI_AI_MODEL || 'deepseek-v4-pro';
const AI_ENABLED = Boolean(AI_API_KEY);

function loadDotEnv(file) {
  try {
    const text = fsSync.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(t);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}

// ───────────────────────── 主题清单 ─────────────────────────
const TOPICS = [
  // TA 术语百科
  { slug: 'what-is-pbr', type: 'glossary', term: 'PBR 物理渲染', query: 'PBR是什么 基于物理的渲染 金属度粗糙度工作流' },
  { slug: 'normal-map', type: 'glossary', term: '法线贴图', query: '法线贴图是什么 原理 切线空间' },
  { slug: 'roughness-metallic-workflow', type: 'glossary', term: '金属度粗糙度工作流', query: '金属度粗糙度工作流 metallic roughness' },
  { slug: 'draw-call-optimization', type: 'glossary', term: 'Draw Call 优化', query: 'Draw Call 是什么 如何优化 合批' },
  { slug: 'lod-level-of-detail', type: 'glossary', term: 'LOD 细节层次', query: 'LOD 是什么 细节层次模型' },
  { slug: 'mipmap', type: 'glossary', term: 'Mipmap 多级渐远纹理', query: 'Mipmap 是什么 作用 摩尔纹' },
  { slug: 'srgb-vs-linear', type: 'glossary', term: 'sRGB 与线性色彩空间', query: 'sRGB 线性色彩空间 gamma 区别' },
  { slug: 'gamma-correction', type: 'glossary', term: '伽马校正', query: '伽马校正 gamma correction 是什么' },
  { slug: 'tone-mapping', type: 'glossary', term: '色调映射', query: '色调映射 tonemapping ACES 是什么' },
  { slug: 'hdr-hdri', type: 'glossary', term: 'HDR 与 HDRI', query: 'HDR HDRI 环境贴图 是什么' },
  { slug: 'brdf', type: 'glossary', term: 'BRDF', query: 'BRDF 是什么 双向反射分布函数' },
  { slug: 'ibl-image-based-lighting', type: 'glossary', term: 'IBL 基于图像的光照', query: 'IBL 基于图像的光照 是什么' },
  { slug: 'ssao', type: 'glossary', term: 'SSAO 环境光遮蔽', query: 'SSAO 屏幕空间环境光遮蔽 是什么' },
  { slug: 'anti-aliasing-comparison', type: 'glossary', term: '抗锯齿 MSAA/FXAA/TAA', query: 'MSAA FXAA TAA 抗锯齿 区别' },
  { slug: 'texture-compression-format', type: 'glossary', term: '贴图压缩格式', query: '贴图压缩 DXT ETC ASTC 区别' },
  { slug: 'alpha-blending', type: 'glossary', term: 'Alpha 混合与透明排序', query: 'Alpha 混合 透明排序 是什么' },
  { slug: 'z-fighting', type: 'glossary', term: 'Z-Fighting 深度冲突', query: 'Z-fighting 深度冲突 解决' },
  { slug: 'shadow-map', type: 'glossary', term: '阴影贴图', query: '阴影贴图 shadow map 原理' },
  { slug: 'vertex-vs-fragment-shader', type: 'glossary', term: '顶点着色器与片元着色器', query: '顶点着色器 片元着色器 区别' },
  { slug: 'uv-mapping', type: 'glossary', term: 'UV 映射与展开', query: 'UV 映射 展开 是什么' },
  { slug: 'lightmap-baking', type: 'glossary', term: '光照贴图烘焙', query: '光照贴图 lightmap 烘焙 是什么' },
  { slug: 'occlusion-culling', type: 'glossary', term: '遮挡剔除', query: '遮挡剔除 occlusion culling 是什么' },
  { slug: 'gpu-instancing', type: 'glossary', term: 'GPU Instancing', query: 'GPU Instancing 实例化 是什么' },
  { slug: 'forward-vs-deferred-rendering', type: 'glossary', term: '前向渲染与延迟渲染', query: '前向渲染 延迟渲染 区别 优缺点' },
  { slug: 'bloom', type: 'glossary', term: 'Bloom 泛光', query: 'Bloom 泛光 效果 是什么' },
  { slug: 'fresnel-effect', type: 'glossary', term: '菲涅尔效应', query: '菲涅尔效应 fresnel 是什么' },
  { slug: 'subsurface-scattering', type: 'glossary', term: '次表面散射 SSS', query: '次表面散射 SSS 是什么 皮肤' },
  { slug: 'anisotropy', type: 'glossary', term: '各向异性高光', query: '各向异性 anisotropy 高光 是什么' },
  // 工具教程
  { slug: 'how-to-use-glsl-hlsl-converter', type: 'tutorial', term: 'GLSL/HLSL 着色器转换', query: '如何用 GLSL 转 HLSL 着色器转换器' },
  { slug: 'how-to-generate-pbr-texture', type: 'tutorial', term: 'PBR 贴图生成', query: '如何生成 PBR 贴图 法线 粗糙度 金属度' },
  { slug: 'how-to-upscale-image-ai', type: 'tutorial', term: 'AI 图片无损放大', query: '如何无损放大图片 AI 超分辨率' },
  { slug: 'how-to-compress-image', type: 'tutorial', term: '图片压缩与格式转换', query: '如何压缩图片 转换格式 webp' },
  { slug: 'how-to-split-texture-channel', type: 'tutorial', term: '贴图通道拆分与合成', query: '如何拆分 合成贴图通道 RGBA' },
  { slug: 'how-to-preview-3d-model', type: 'tutorial', term: '3D 模型在线预览', query: '如何在线预览 3D 模型 glb fbx obj' },
  { slug: 'how-to-edit-hdr', type: 'tutorial', term: 'HDR/HDRI 环境贴图编辑', query: '如何编辑 HDR HDRI 环境贴图' },
  { slug: 'how-to-pack-sprite-sheet', type: 'tutorial', term: '图集打包 Sprite Sheet', query: '如何打包图集 sprite sheet' },
  { slug: 'how-to-convert-video-format', type: 'tutorial', term: '视频格式转换', query: '如何转换视频格式 mp4 webm' },
  { slug: 'how-to-convert-color-space', type: 'tutorial', term: '色彩空间转换', query: '如何转换色彩空间 linear sRGB gamma' },
];

// ───────────────────────── AI 会话 ─────────────────────────
function estimateTokens(text) {
  const v = String(text || '');
  const cjk = (v.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
  return Math.ceil(cjk + (v.length - cjk) / 4);
}

function createAiSession(systemPrompt, maxTokens = 4000) {
  const MAX_SESSION_TOKENS = 40000;
  let messages = [{ role: 'system', content: systemPrompt }];
  let tokenCount = estimateTokens(systemPrompt);
  return {
    async chat(userContent) {
      if (tokenCount + estimateTokens(userContent) > MAX_SESSION_TOKENS) {
        messages = [{ role: 'system', content: systemPrompt }];
        tokenCount = estimateTokens(systemPrompt);
      }
      messages.push({ role: 'user', content: userContent });
      tokenCount += estimateTokens(userContent);
      const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
        body: JSON.stringify({ model: AI_MODEL, messages, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, max_tokens: maxTokens, stream: false })
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`AI HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content || '{}';
      let ac = '{}';
      try { ac = JSON.stringify(JSON.parse(raw)); } catch { ac = '{}'; }
      messages.push({ role: 'assistant', content: ac });
      tokenCount += estimateTokens(ac);
      return parseJson(raw);
    }
  };
}

function parseJson(value) {
  const text = String(value || '').trim();
  try { return JSON.parse(text); } catch { const m = /\{[\s\S]*\}/.exec(text); return m ? JSON.parse(m[0]) : {}; }
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ───────────────────────── Markdown → HTML（极简） ─────────────────────────
function mdToHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  let html = '';
  let inUl = false;
  const closeUl = () => { if (inUl) { html += '</ul>\n'; inUl = false; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^###\s+/.test(line)) { closeUl(); html += `<h3>${esc(line.replace(/^###\s+/, ''))}</h3>\n`; }
    else if (/^##\s+/.test(line)) { closeUl(); html += `<h2>${esc(line.replace(/^##\s+/, ''))}</h2>\n`; }
    else if (/^#\s+/.test(line)) { closeUl(); html += `<h2>${esc(line.replace(/^#\s+/, ''))}</h2>\n`; }
    else if (/^[-*]\s+/.test(line)) { if (!inUl) { html += '<ul>\n'; inUl = true; } html += `<li>${esc(line.replace(/^[-*]\s+/, ''))}</li>\n`; }
    else if (/^\d+[.)]\s+/.test(line)) { if (!inUl) { html += '<ol>\n'; inUl = true; } html += `<li>${esc(line.replace(/^\d+[.)]\s+/, ''))}</li>\n`; }
    else if (!line.trim()) { closeUl(); }
    else { closeUl(); html += `<p>${esc(line)}</p>\n`; }
  }
  closeUl();
  return html;
}

// ───────────────────────── HTML 模板 ─────────────────────────
function renderPage({ lang, slug, type, title, summary, contentHtml, faq, related, date, keywords }) {
  const en = lang === 'en';
  const dir = en ? EN_SEO_DIR : SEO_DIR;
  const url = `${BASE}/${en ? 'en/' : ''}seo/${slug}.html`;
  const prefix = en ? '/en' : '';
  const homeLabel = en ? 'TA Toolbox Home' : 'TA工具箱首页';
  const typeLabel = en ? (type === 'glossary' ? 'TA Glossary' : 'Tool Tutorial') : (type === 'glossary' ? 'TA 术语百科' : '工具教程');

  const relatedLinks = (related || []).map((r) => {
    const t = TOPICS.find((x) => x.slug === r);
    if (!t) return '';
    const label = en ? t.term : t.term;
    return `<a href="${BASE}/${en ? 'en/' : ''}seo/${r}.html">${esc(label)}</a>`;
  }).filter(Boolean).join(' · ');

  const faqHtml = (faq || []).map((f) => `<div class="faq-item"><h3>${esc(f.q)}</h3><p>${esc(f.a)}</p></div>`).join('\n');

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: homeLabel, item: BASE + '/' },
          { '@type': 'ListItem', position: 2, name: typeLabel, item: `${BASE}/${en ? 'en/' : ''}seo/` },
          { '@type': 'ListItem', position: 3, name: title }
        ]
      },
      {
        '@type': type === 'tutorial' ? 'HowTo' : 'Article',
        name: title,
        headline: title,
        description: summary,
        inLanguage: en ? 'en' : 'zh-CN',
        url,
        datePublished: date,
        dateModified: date,
        mainEntityOfPage: url
      }
    ]
  };
  if (faq && faq.length) {
    schema['@graph'].push({
      '@type': 'FAQPage',
      mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    });
  }

  return `<!DOCTYPE html>
<html lang="${en ? 'en' : 'zh-CN'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}${en ? ' - TA Toolbox' : ' - TA工具箱'}</title>
<meta name="description" content="${esc(summary)}">
<meta name="keywords" content="${esc(keywords)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
${en ? `<link rel="alternate" hreflang="zh-CN" href="${BASE}/seo/${slug}.html">` : `<link rel="alternate" hreflang="en" href="${BASE}/en/seo/${slug}.html">`}
<link rel="alternate" hreflang="x-default" href="${BASE}/seo/${slug}.html">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/images/icon/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="96x96" href="/assets/images/icon/favicon-96x96.png">
<link rel="stylesheet" href="/css/seo.css">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<script>
var _hmt = _hmt || [];
(function() { var hm = document.createElement("script"); hm.src = "https://hm.baidu.com/hm.js?44913dba4cac18ed4047e7273adfaab7"; var s = document.getElementsByTagName("script")[0]; s.parentNode.insertBefore(hm, s); })();
</script>
</head>
<body>
<header class="seo-header">
  <a class="seo-logo" href="/">${en ? 'TA Toolbox' : 'TA工具箱'}</a>
  <nav><a href="${prefix}/seo/">${typeLabel}</a> · <a href="${en ? '/tools_html/TA_wiki.html' : '/tools_html/TA_wiki.html'}">${en ? 'TA Wiki' : 'TA知识库'}</a></nav>
</header>
<main class="seo-main">
  <article>
    <p class="seo-crumb"><a href="/">${homeLabel}</a> / <a href="${prefix}/seo/">${typeLabel}</a></p>
    <h1>${esc(title)}</h1>
    <p class="seo-meta">${date}</p>
    <div class="seo-content">
${contentHtml}
    </div>
    ${faqHtml ? `<section class="seo-faq"><h2>${en ? 'FAQ' : '常见问题'}</h2>\n${faqHtml}\n</section>` : ''}
    ${relatedLinks ? `<section class="seo-related"><h2>${en ? 'Related' : '相关词条'}</h2><p>${relatedLinks}</p></section>` : ''}
  </article>
</main>
<footer class="seo-footer">
  <p>${en ? 'Part of TA Toolbox by TreasureGrove' : 'TA工具箱 · 宝藏小树林出品'} · <a href="/">${homeLabel}</a></p>
</footer>
</body>
</html>`;
}

// ───────────────────────── 生成逻辑 ─────────────────────────
async function main() {
  if (!AI_ENABLED) {
    console.error('[seo] 未配置 API key，退出');
    process.exit(1);
  }
  const glossarySys = '你是技术美术(TA)知识百科编辑。根据给定术语生成一篇面向中文搜索的中文词条。输出 JSON：{"title":完整标题,"summary":"150字内描述(用作meta description)","content":"Markdown正文,用##分小节,3-6个小节,800-1200字,面向搜索意图","faq":[{"q":"问题","a":"回答"}3-5条],"related":["相关词条slug列表,从候选里选3-5个"],"keywords":"逗号分隔关键词"}。只输出 JSON，不要代码块。';
  const tutorialSys = '你是技术美术(TA)工具教程编辑。根据给定工具写一篇中文使用教程。输出 JSON：{"title":"完整标题(含工具名+用途)","summary":"150字内描述","content":"Markdown正文,用##分小节,含使用步骤,800-1200字","faq":[{"q":"问题","a":"回答"}3-5条],"related":["相关教程slug列表,选3-5个"],"keywords":"逗号分隔关键词"}。只输出 JSON，不要代码块。';
  const translateSys = '你是中英翻译。把给定的中文词条 JSON 翻译成英文。输出 JSON：{"title":"英文标题","summary":"英文描述","content":"英文Markdown正文","faq":[{"q":"英文问题","a":"英文回答"}],"keywords":"english,comma,keywords"}。只输出 JSON。';

  const glossarySession = createAiSession(glossarySys);
  const tutorialSession = createAiSession(tutorialSys);
  const translateSession = createAiSession(translateSys);

  const slugList = TOPICS.map((t) => t.slug).join(', ');
  const date = new Date().toISOString().slice(0, 10);

  await fs.mkdir(SEO_DIR, { recursive: true });
  await fs.mkdir(EN_SEO_DIR, { recursive: true });

  const results = [];
  let ok = 0;
  for (const topic of TOPICS) {
    try {
      const session = topic.type === 'glossary' ? glossarySession : tutorialSession;
      const prompt = `术语/主题：${topic.term}\n搜索意图：${topic.query}\nslug：${topic.slug}\n候选相关 slug（供 related 挑选）：${slugList}`;
      const cn = await session.chat(prompt);
      const title = String(cn.title || topic.term).trim();
      const summary = String(cn.summary || '').trim();
      const contentHtml = mdToHtml(cn.content);
      const faq = Array.isArray(cn.faq) ? cn.faq.map((f) => ({ q: String(f.q || ''), a: String(f.a || '') })).filter((f) => f.q && f.a) : [];
      const related = Array.isArray(cn.related) ? cn.related.filter((r) => slugList.includes(r)).slice(0, 5) : [];
      const keywords = String(cn.keywords || topic.term).trim();

      // 英文翻译
      let en = {};
      try {
        en = await translateSession.chat(JSON.stringify({ title, summary, content: cn.content, faq, keywords }));
      } catch (e) {
        console.warn(`[seo] EN translate failed for ${topic.slug}: ${e.message}`);
      }

      const cnHtml = renderPage({ lang: 'zh', slug: topic.slug, type: topic.type, title, summary: summary || title, contentHtml, faq, related, date, keywords });
      await fs.writeFile(path.join(SEO_DIR, `${topic.slug}.html`), cnHtml, 'utf8');

      let enHtml = null;
      if (en && en.title) {
        enHtml = renderPage({ lang: 'en', slug: topic.slug, type: topic.type, title: String(en.title).trim(), summary: String(en.summary || '').trim(), contentHtml: mdToHtml(en.content), faq: Array.isArray(en.faq) ? en.faq.map((f) => ({ q: String(f.q || ''), a: String(f.a || '') })).filter((f) => f.q && f.a) : [], related, date, keywords: String(en.keywords || '').trim() });
        await fs.writeFile(path.join(EN_SEO_DIR, `${topic.slug}.html`), enHtml, 'utf8');
      }

      results.push({ slug: topic.slug, url: `${BASE}/seo/${topic.slug}.html`, enUrl: en && en.title ? `${BASE}/en/seo/${topic.slug}.html` : null, title });
      ok++;
      console.log(`[seo] ok ${topic.slug} (${en && en.title ? 'zh+en' : 'zh'})`);
    } catch (e) {
      console.warn(`[seo] FAILED ${topic.slug}: ${e.message}`);
    }
  }

  // 索引页
  await writeIndexPages(results);

  // sitemap
  await writeSitemap(results);

  // 推送清单
  const urls = results.map((r) => r.url).concat(results.filter((r) => r.enUrl).map((r) => r.enUrl));
  await fs.writeFile(path.join(ROOT, 'scripts', 'seo_urls.txt'), urls.join('\n') + '\n', 'utf8');

  console.log(`[seo] done. 生成 ${ok}/${TOPICS.length} 词条，共 ${urls.length} 个 URL`);
}

async function writeIndexPages(results) {
  const date = new Date().toISOString().slice(0, 10);
  for (const en of [false, true]) {
    const dir = en ? EN_SEO_DIR : SEO_DIR;
    const prefix = en ? '/en' : '';
    const home = en ? 'TA Toolbox' : 'TA工具箱';
    const list = results.map((r) => `<li><a href="${prefix}/seo/${r.slug}.html">${esc(r.title)}</a></li>`).join('\n');
    const html = `<!DOCTYPE html>
<html lang="${en ? 'en' : 'zh-CN'}">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${en ? 'TA Glossary & Tutorials' : 'TA 术语百科与工具教程'} - ${home}</title>
<meta name="description" content="${en ? 'Technical artist glossary and tool tutorials' : '技术美术术语百科与工具使用教程合集'}">
<link rel="canonical" href="${BASE}${prefix}/seo/">
<link rel="stylesheet" href="/css/seo.css">
<script>var _hmt=_hmt||[];(function(){var hm=document.createElement("script");hm.src="https://hm.baidu.com/hm.js?44913dba4cac18ed4047e7273adfaab7";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(hm,s);})();</script>
</head>
<body>
<header class="seo-header"><a class="seo-logo" href="/">${home}</a></header>
<main class="seo-main"><h1>${en ? 'TA Glossary & Tutorials' : 'TA 术语百科与工具教程'}</h1>
<ul class="seo-index">${list}</ul></main>
<footer class="seo-footer"><p>${home} · <a href="/">${en ? 'Home' : '首页'}</a></p></footer>
</body>
</html>`;
    await fs.writeFile(path.join(dir, 'index.html'), html, 'utf8');
  }
}

async function writeSitemap(results) {
  const date = new Date().toISOString().slice(0, 10);
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const r of results) {
    xml += `  <url><loc>${esc(r.url)}</loc><lastmod>${date}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
    if (r.enUrl) xml += `  <url><loc>${esc(r.enUrl)}</loc><lastmod>${date}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>\n`;
  }
  xml += '</urlset>\n';
  await fs.writeFile(SITEMAP_FILE, xml, 'utf8');
  console.log(`[seo] sitemap-seo.xml written with ${results.length * 2} URLs`);
}

main().catch((err) => { console.error(err); process.exit(1); });
