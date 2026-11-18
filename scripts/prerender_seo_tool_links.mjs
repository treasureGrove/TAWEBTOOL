#!/usr/bin/env node
/**
 * 把「文章页 → 工具页」互链区块预渲染进静态 HTML。
 *
 * 背景：js/seo_tool_link.js 已经会在浏览器里匹配相关工具并渲染，但那是客户端渲染，
 * 百度这类不执行 JS 的爬虫一条内链都看不到。这里把同一块内容写成静态 HTML，
 * JS 端检测到已存在就跳过，两边的视觉保持一致。
 *
 * 为什么用显式映射而不是继续用关键词打分：英文页的短词（image / video / draw）
 * 会把工具误命中到完全不相关的文章上（Shader 文章里出现尸潮小游戏）。
 * 这张表按 slug 一一对应，中英文共用，改起来也直白。
 *
 * 用法：
 *   node scripts/prerender_seo_tool_links.mjs           # 写入
 *   node scripts/prerender_seo_tool_links.mjs --check   # 只报告差异（有待更新时退出码 1）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_META } from './tool_meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const START = '<!-- related-tools:start -->';
const END = '<!-- related-tools:end -->';

/** 英文卡片标题；与 js/seo_tool_link.js 的 EN_NAMES 保持一致。 */
const EN_NAMES = {
  'ai_image.html': 'AI Text-to-Image',
  'ai_video.html': 'AI Text-to-Video',
  'ai_upscale.html': 'AI Image Upscaler',
  'ai_draw.html': 'AI Painting',
  'chatgpt.html': 'ChatGPT',
  'cloud_music.html': 'NetEase Music',
  'compress_image.html': 'Image Compressor & Converter',
  'base64_image.html': 'Image / Base64 Converter',
  'gif_compress.html': 'GIF Compressor',
  'combine_rgba.html': 'RGBA Channel Packer',
  'texture_channel_splitter.html': 'Texture Channel Splitter',
  'pbr_texture_generator.html': 'PBR Texture Generator',
  'tiling_texture.html': 'Tiling Texture Preview',
  'collage_texture.html': 'Texture Collage Grid',
  'hdr_editor.html': 'HDR Editor',
  'ps_online.html': 'Online Photoshop',
  'watermark_remover.html': 'Watermark Remover',
  'model_previewer.html': '3D Model Viewer',
  'gltf_optimizer.html': 'glTF Compressor & LOD',
  'video_cut.html': 'Video Cutter',
  'video_format_cover.html': 'Video Converter',
  'sprite_sheet_packer.html': 'Sprite Sheet Packer',
  'sprite_sheet_splitter.html': 'Sprite Sheet Splitter',
  'shader_library.html': 'Shader Function Library',
  'glsl_hlsl_converter.html': 'GLSL / HLSL Converter',
  'physics_light.html': 'Physical Light Calculator',
  'color_space_converter.html': 'Color Space Converter',
  'image_metadata_inspector.html': 'Texture Info Inspector'
};

/** 没有对口工具时给几个通用入口，保证文章页仍有通向工具的内链。 */
const FALLBACK = ['pbr_texture_generator.html', 'compress_image.html', 'model_previewer.html'];

/**
 * 文章 slug → 相关工具（最多 3 个）。中英文页共用同一份映射。
 * 空数组表示这个话题确实没有对应工具，走 FALLBACK。
 */
const ARTICLE_TOOLS = {
  // ── TA 术语百科 ──
  'what-is-pbr': ['pbr_texture_generator.html'],
  'normal-map': ['pbr_texture_generator.html', 'model_previewer.html'],
  'roughness-metallic-workflow': ['pbr_texture_generator.html', 'combine_rgba.html'],
  'draw-call-optimization': ['gltf_optimizer.html'],
  'lod-level-of-detail': ['gltf_optimizer.html', 'model_previewer.html'],
  mipmap: ['image_metadata_inspector.html'],
  'srgb-vs-linear': ['color_space_converter.html'],
  'gamma-correction': ['color_space_converter.html'],
  'tone-mapping': ['color_space_converter.html', 'hdr_editor.html'],
  'hdr-hdri': ['hdr_editor.html'],
  brdf: ['shader_library.html'],
  'ibl-image-based-lighting': ['hdr_editor.html'],
  ssao: [],
  'anti-aliasing-comparison': [],
  'texture-compression-format': ['image_metadata_inspector.html', 'compress_image.html'],
  'alpha-blending': [],
  'z-fighting': [],
  'shadow-map': [],
  'vertex-vs-fragment-shader': ['shader_library.html', 'glsl_hlsl_converter.html'],
  'uv-mapping': ['model_previewer.html', 'tiling_texture.html'],
  'lightmap-baking': [],
  'occlusion-culling': [],
  'gpu-instancing': [],
  'forward-vs-deferred-rendering': [],
  bloom: [],
  'fresnel-effect': ['shader_library.html'],
  'subsurface-scattering': [],
  anisotropy: ['pbr_texture_generator.html', 'shader_library.html'],
  'texel-density': ['image_metadata_inspector.html'],
  'uv-overlap': [],
  'normal-map-format': ['pbr_texture_generator.html', 'model_previewer.html'],
  'bc-texture-compression': ['image_metadata_inspector.html', 'compress_image.html'],
  'render-target': [],
  'g-buffer': [],
  'shader-complexity-optimization': ['shader_library.html'],
  overdraw: [],
  'fill-rate': [],
  'batch-rendering': [],
  'srgb-texture-workflow': ['color_space_converter.html', 'image_metadata_inspector.html'],
  'hdr-render-pipeline': ['hdr_editor.html', 'color_space_converter.html'],
  'aces-color-management': ['color_space_converter.html', 'hdr_editor.html'],
  'color-grading': ['color_space_converter.html'],
  'post-processing-stack': [],
  'depth-buffer': [],
  'stencil-buffer': [],
  cubemap: ['hdr_editor.html'],
  'reflection-probe': ['hdr_editor.html'],
  'screen-space-reflection': [],
  'parallax-mapping': ['pbr_texture_generator.html'],
  tessellation: [],
  'skeletal-animation': ['model_previewer.html'],
  'blend-shape': ['model_previewer.html'],
  'compute-shader': ['shader_library.html', 'glsl_hlsl_converter.html'],
  'ray-tracing-basics': [],
  'dlss-fsr-upscaling': ['ai_upscale.html'],
  'variable-rate-shading': [],
  'mesh-shader': ['model_previewer.html', 'shader_library.html'],
  'gpu-driven-rendering': [],

  // ── 工具教程 ──
  'how-to-use-glsl-hlsl-converter': ['glsl_hlsl_converter.html', 'shader_library.html'],
  'how-to-generate-pbr-texture': ['pbr_texture_generator.html', 'combine_rgba.html', 'texture_channel_splitter.html'],
  'how-to-upscale-image-ai': ['ai_upscale.html'],
  'how-to-compress-image': ['compress_image.html'],
  'how-to-split-texture-channel': ['texture_channel_splitter.html', 'combine_rgba.html'],
  'how-to-preview-3d-model': ['model_previewer.html', 'gltf_optimizer.html'],
  'how-to-edit-hdr': ['hdr_editor.html'],
  'how-to-pack-sprite-sheet': ['sprite_sheet_packer.html', 'sprite_sheet_splitter.html'],
  'how-to-convert-video-format': ['video_format_cover.html', 'video_cut.html'],
  'how-to-convert-color-space': ['color_space_converter.html', 'physics_light.html'],
  'how-to-ai-draw': ['ai_draw.html'],
  'how-to-ai-image': ['ai_image.html'],
  'how-to-chatgpt': ['chatgpt.html'],
  'how-to-ai-video': ['ai_video.html'],
  'how-to-base64-image': ['base64_image.html'],
  'how-to-gif-compress': ['gif_compress.html'],
  'how-to-combine-rgba': ['combine_rgba.html', 'texture_channel_splitter.html'],
  'how-to-tiling-texture': ['tiling_texture.html'],
  'how-to-collage-texture': ['collage_texture.html'],
  'how-to-ps-online': ['ps_online.html'],
  'how-to-sprite-sheet-splitter': ['sprite_sheet_splitter.html', 'sprite_sheet_packer.html'],
  'how-to-shader-library': ['shader_library.html', 'glsl_hlsl_converter.html'],
  'how-to-physics-light': ['physics_light.html'],
  'how-to-image-metadata': ['image_metadata_inspector.html'],
  'how-to-cloud-music': ['cloud_music.html']
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function labelFor(file, isEn) {
  if (isEn) {
    if (!EN_NAMES[file]) throw new Error(`缺少英文标题: ${file}`);
    return EN_NAMES[file];
  }
  const meta = TOOL_META[file];
  if (!meta) throw new Error(`tool_meta.mjs 里没有: ${file}`);
  return meta.name;
}

function block(isEn, toolFiles) {
  const cards = toolFiles.map((file) => {
    const sub = isEn ? 'Free · In-browser · No install' : '免费 · 浏览器打开即用';
    return `      <a class="seo-tool-card" href="/tools_html/${esc(file)}"><b>${esc(labelFor(file, isEn))}</b><span>${sub}</span></a>`;
  }).join('\n');
  const heading = isEn ? 'Try These Free Tools' : '边学边试：免费在线工具';
  const moreHref = isEn ? '/en/' : '/';
  const moreText = isEn ? 'TA Toolbox — 20+ free technical artist tools' : 'TA工具箱 — 20+ 款免费技术美术工具';
  return [
    START,
    '    <section class="seo-tools">',
    `      <h2>${heading}</h2>`,
    '      <div class="seo-tool-cards">',
    cards,
    '      </div>',
    `      <p class="seo-tools-more"><a href="${moreHref}">${moreText}</a></p>`,
    '    </section>',
    END
  ].join('\n');
}

function processFile(rel) {
  const abs = path.join(ROOT, rel);
  const original = fs.readFileSync(abs, 'utf8');
  if (!/<article[\s>]/i.test(original)) return { rel, status: 'skip', reason: 'no <article>' };

  const isEn = /<html[^>]+lang=["']en["']/i.test(original);
  const slug = path.basename(rel, '.html');
  const mapped = ARTICLE_TOOLS[slug];
  if (mapped === undefined) return { rel, status: 'skip', reason: `映射表缺少 slug: ${slug}` };
  const toolFiles = mapped.length ? mapped : FALLBACK;

  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const fresh = block(isEn, toolFiles).split('\n').join(eol);

  let text = original;
  const marked = new RegExp(`${START}[\\s\\S]*?${END}`);
  if (marked.test(text)) {
    text = text.replace(marked, fresh);
  } else {
    // 放在「相关词条」之前：先给能动手的工具，再给延伸阅读。
    const related = text.search(/^\s*<section class="seo-related"/m);
    if (related !== -1) {
      text = `${text.slice(0, related)}${fresh}${eol}${text.slice(related)}`;
    } else {
      const closeArticle = text.lastIndexOf('</article>');
      if (closeArticle === -1) return { rel, status: 'skip', reason: 'no insertion anchor' };
      text = `${text.slice(0, closeArticle)}${fresh}${eol}  ${text.slice(closeArticle)}`;
    }
  }

  if (text === original) return { rel, status: 'ok' };
  if (!CHECK) fs.writeFileSync(abs, text, 'utf8');
  return { rel, status: 'updated', tools: toolFiles, fallback: !mapped.length };
}

function targets() {
  const out = [];
  for (const dir of ['seo', 'en/seo']) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const name of fs.readdirSync(abs).sort()) {
      if (!name.endsWith('.html') || name === 'index.html') continue;
      out.push(`${dir}/${name}`);
    }
  }
  return out;
}

const results = targets().map(processFile);
const updated = results.filter((r) => r.status === 'updated');
const skipped = results.filter((r) => r.status === 'skip');
const fallback = updated.filter((r) => r.fallback);
console.log(`[seo-tools] 扫描 ${results.length} 篇：${CHECK ? '待更新' : '更新'} ${updated.length}、已是最新 ${results.length - updated.length - skipped.length}、跳过 ${skipped.length}（其中走通用兜底 ${fallback.length}）`);
if (process.argv.includes('--verbose')) {
  for (const r of updated) console.log(`  ~ ${r.rel}  →  ${r.tools.join(', ')}${r.fallback ? '  [fallback]' : ''}`);
}
for (const r of skipped) console.log(`  ! ${r.rel} (${r.reason})`);
if (CHECK && updated.length) process.exit(1);
