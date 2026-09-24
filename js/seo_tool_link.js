// ─── SEO 文章页 → 工具页互链组件 ───
// 依赖 menu.js 提供的 MENU_DATA（单一数据源），在 /seo/ 与 /en/seo/ 文章页自动渲染
// 按文章标题/关键词智能匹配相关工具，无匹配时展示热门工具兜底。
(function () {
    if (typeof MENU_DATA === 'undefined') return;
    var isEn = /^en/i.test(document.documentElement.lang || '');

    var EN_NAMES = {
        'chatgpt.html': 'ChatGPT',
        'ai_image.html': 'AI Text-to-Image',
        'ai_video.html': 'AI Text-to-Video',
        'ai_upscale.html': 'AI Image Upscaler',
        'ai_draw.html': 'AI Painting',
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
        'model_previewer.html': '3D Model Viewer',
        'gltf_optimizer.html': 'glTF Compressor & LOD',
        'video_cut.html': 'Video Cutter',
        'video_format_cover.html': 'Video Converter',
        'lead_canticle.html': 'Lead Canticle (Game)',
        'grove_range.html': 'Zombie Waves FPS (Game)',
        'grove_survivor.html': 'Survivor Roguelite (Game)',
        'sprite_sheet_packer.html': 'Sprite Sheet Packer',
        'sprite_sheet_splitter.html': 'Sprite Sheet Splitter',
        'shader_library.html': 'Shader Function Library',
        'glsl_hlsl_converter.html': 'GLSL / HLSL Converter',
        'physics_light.html': 'Physical Light Calculator',
        'color_space_converter.html': 'Color Space Converter',
        'image_metadata_inspector.html': 'Texture Info Inspector',
        'TA_wiki.html': 'TA Wiki',
        'resources.html': 'TA Resource Directory',
        'cloud_music.html': 'NetEase Music',
        'about.html': 'About'
    };

    var HOT = ['pbr_texture_generator.html', 'ai_upscale.html', 'compress_image.html',
               'model_previewer.html', 'glsl_hlsl_converter.html', 'TA_wiki.html'];

    function norm(s) { return String(s || '').toLowerCase(); }

    function pageTokens() {
        var meta = document.querySelector('meta[name="keywords"]');
        var text = norm(document.title + ' ' + (meta ? meta.content || '' : ''));
        return text.split(/[,，、;；\s|/]+/).filter(function (t) { return t.length > 1; });
    }

    function collectTools() {
        var tools = [];
        for (var i = 0; i < MENU_DATA.length; i++) {
            var cat = MENU_DATA[i];
            for (var j = 0; j < cat.items.length; j++) {
                var it = cat.items[j];
                tools.push({ href: it.href, label: it.label, en: EN_NAMES[it.href] || it.label, category: cat.name, keywords: (it.keywords || []).map(norm) });
            }
        }
        return tools;
    }

    function matchTools(tools, tokens) {
        var scored = [];
        for (var i = 0; i < tools.length; i++) {
            var t = tools[i];
            var hay = t.keywords.join(' ') + ' ' + norm(t.label);
            var score = 0;
            for (var k = 0; k < tokens.length; k++) {
                var tok = tokens[k];
                if (tok.length < 2) continue;
                // 英文短词（如 3d、map）子串误命中率高，跳过；中文两字词保留
                if (/^[\x20-\x7e]+$/.test(tok) && tok.length < 3) continue;
                if (hay.indexOf(tok) >= 0) score += tok.length >= 4 ? 2 : 1;
            }
            // 工具关键词（英文长词）出现在文章文本里，反向加分
            var pageText = norm(document.title + ' ' + (document.querySelector('meta[name="description"]') || {}).content);
            for (var w = 0; w < t.keywords.length; w++) {
                var kw = t.keywords[w];
                if (kw.length >= 4 && pageText.indexOf(kw) >= 0) score += 2;
            }
            if (score > 0) scored.push({ tool: t, score: score });
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, 4).map(function (s) { return s.tool; });
    }

    function hotTools(tools) {
        var byHref = {};
        tools.forEach(function (t) { byHref[t.href] = t; });
        return HOT.map(function (h) { return byHref[h]; }).filter(Boolean);
    }

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
    }

    function render() {
        var article = document.querySelector('main article') || document.querySelector('article');
        if (!article || article.querySelector('.seo-tools')) return;
        var tools = collectTools();
        var picked = matchTools(tools, pageTokens());
        if (picked.length === 0) picked = hotTools(tools);
        if (picked.length === 0) return;

        var cards = picked.map(function (t) {
            var name = isEn ? t.en : t.label;
            return '<a class="seo-tool-card" href="/tools_html/' + esc(t.href) + '">' +
                '<b>' + esc(name) + '</b>' +
                '<span>' + (isEn ? 'Free · In-browser · No install' : '免费 · 浏览器打开即用') + '</span></a>';
        }).join('');

        var section = document.createElement('section');
        section.className = 'seo-tools';
        section.innerHTML =
            '<h2>' + (isEn ? 'Try These Free Tools' : '边学边试：免费在线工具') + '</h2>' +
            '<div class="seo-tool-cards">' + cards + '</div>' +
            '<p class="seo-tools-more"><a href="/' + (isEn ? 'en/' : '') + '">' +
            (isEn ? 'TA Toolbox — 20+ free technical artist tools' : 'TA工具箱 — 20+ 款免费技术美术工具') +
            '</a></p>';

        var related = article.querySelector('.seo-related');
        if (related) related.parentNode.insertBefore(section, related);
        else article.appendChild(section);
    }

    function injectStyles() {
        var style = document.createElement('style');
        style.textContent = [
            '.seo-tools{margin:36px 0 8px;padding:20px;border:1px solid #e5e7eb;border-radius:12px;background:#fff}',
            '.seo-tools h2{margin:0 0 14px;font-size:18px;color:#1f2328}',
            '.seo-tool-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}',
            '.seo-tool-card{display:flex;flex-direction:column;gap:4px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;text-decoration:none;transition:border-color .15s,background .15s}',
            '.seo-tool-card:hover{border-color:#4f6ef7;background:#f0f3ff}',
            '.seo-tool-card b{font-size:14px;color:#1f2328}',
            '.seo-tool-card span{font-size:12px;color:#6b7280}',
            '.seo-tools-more{margin:14px 0 0;font-size:13px}',
            '.seo-tools-more a{color:#4f6ef7}'
        ].join('\n');
        document.head.appendChild(style);
    }

    injectStyles();
    render();
})();
