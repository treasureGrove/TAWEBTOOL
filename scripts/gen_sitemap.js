const fs = require('fs');
const path = require('path');

const BASE = 'https://tools.treasuregrove.art';
const TOOLS = 'tools_html';
const PRIORITIES = {
    'ai_upscale.html':         { freq: 'weekly',  pri: 0.9 },
    'ai_draw.html':            { freq: 'weekly',  pri: 0.9 },
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

// Build list from actual files on disk, cross-referenced with priority table
const actual = fs.readdirSync(TOOLS)
    .filter(f => f.endsWith('.html'))
    .sort();

const missingInTable = actual.filter(f => !PRIORITIES[f]);
const deadInSitemap = Object.keys(PRIORITIES).filter(f => !actual.includes(f));

if (missingInTable.length) {
    console.warn('WARNING: new files need priority entry:', missingInTable.join(', '));
}
if (deadInSitemap.length) {
    console.warn('WARNING: dead sitemap entries (file deleted):', deadInSitemap.join(', '));
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

fs.writeFileSync('sitemap.xml', xml, 'utf8');
console.log('Generated sitemap.xml with', actual.length + 1, 'URLs');
console.log('  homepage +', actual.length, 'tool/about pages');
