const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const CHECKER = path.join(__dirname, 'check_search_index.py');
function check(args) {
    return execFileSync(PYTHON, [CHECKER, ...args], { cwd: ROOT, encoding: 'utf8' });
}

const BASE = 'https://tools.treasuregrove.art';
const TOOLS = 'tools_html';
const PRIORITIES = {
    'ai_upscale.html':         { freq: 'weekly',  pri: 0.9 },
    'ai_draw.html':            { freq: 'weekly',  pri: 0.9 },
    'ai_image.html':           { freq: 'weekly',  pri: 0.9 },
    'ai_video.html':           { freq: 'weekly',  pri: 0.9 },
    'resources.html':          { freq: 'monthly', pri: 0.5 },
    'chatgpt.html':            { freq: 'weekly',  pri: 0.8 },
    'compress_image.html':     { freq: 'weekly',  pri: 0.9 },
    'base64_image.html':       { freq: 'weekly',  pri: 0.8 },
    'gif_compress.html':       { freq: 'monthly', pri: 0.8 },
    'combine_rgba.html':       { freq: 'monthly', pri: 0.8 },
    'texture_channel_splitter.html': { freq: 'monthly', pri: 0.8 },
    'pbr_texture_generator.html':    { freq: 'monthly', pri: 0.8 },
    'tiling_texture.html':     { freq: 'monthly', pri: 0.7 },
    'collage_texture.html':    { freq: 'monthly', pri: 0.7 },
    'hdr_editor.html':         { freq: 'monthly', pri: 0.8 },
    'ps_online.html':          { freq: 'monthly', pri: 0.8 },
    'model_previewer.html':    { freq: 'monthly', pri: 0.8 },
    'video_cut.html':          { freq: 'monthly', pri: 0.8 },
    'video_format_cover.html': { freq: 'monthly', pri: 0.8 },
    'video_converter.html':     { freq: 'monthly', pri: 0.8 },
    'sprite_sheet_packer.html':{ freq: 'monthly', pri: 0.8 },
    'sprite_sheet_splitter.html': { freq: 'monthly', pri: 0.8 },
    'shader_library.html':     { freq: 'monthly', pri: 0.8 },
    'glsl_hlsl_converter.html':{ freq: 'monthly', pri: 0.9 },
    'physics_light.html':      { freq: 'monthly', pri: 0.7 },
    'color_space_converter.html': { freq: 'monthly', pri: 0.7 },
    'image_metadata_inspector.html': { freq: 'monthly', pri: 0.7 },
    'TA_wiki.html':            { freq: 'daily',    pri: 0.9 },
    'cloud_music.html':        { freq: 'monthly', pri: 0.5 },
    'about.html':              { freq: 'monthly', pri: 0.4 },
};

// Reuse the checker's canonical, robots and redirect policy before generating.
const actual = JSON.parse(check(['--list-tool-pages']));

const missingInTable = actual.filter(f => !PRIORITIES[f]);
const deadInSitemap = Object.keys(PRIORITIES).filter(f => !actual.includes(f));

if (missingInTable.length) {
    console.warn('WARNING: new files need priority entry:', missingInTable.join(', '));
}
if (deadInSitemap.length) {
    console.warn('WARNING: priority entries omitted (deleted or not indexable):', deadInSitemap.join(', '));
    deadInSitemap.forEach(f => delete PRIORITIES[f]);
}

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

// Homepage
xml += '    <url>\n';
xml += `        <loc>${esc(BASE)}/</loc>\n`;
xml += '        <changefreq>weekly</changefreq>\n';
xml += '        <priority>1.0</priority>\n';
xml += '    </url>\n';

// English homepage is a self-canonical, indexable entry point.
xml += `    <url><loc>${BASE}/en/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;

// Tool pages
for (const file of actual) {
    const p = PRIORITIES[file] || { freq: 'monthly', pri: 0.7 };
    xml += '    <url>\n';
    xml += `        <loc>${esc(BASE)}/${TOOLS}/${esc(file)}</loc>\n`;
    xml += `        <changefreq>${p.freq}</changefreq>\n`;
    xml += `        <priority>${p.pri}</priority>\n`;
    xml += '    </url>\n';
}

xml += '</urlset>\n';

const temporary = fs.mkdtempSync(path.join(ROOT, '.sitemap-'));
try {
    const candidate = path.join(temporary, 'sitemap.xml');
    fs.writeFileSync(candidate, xml, 'utf8');
    process.stdout.write(check(['--sync', '--sitemap-candidate', candidate]));
    console.log('Generated sitemap.xml with', actual.length + 2, 'URLs');
    console.log('  2 homepages +', actual.length, 'tool/about pages');
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
