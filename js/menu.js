// ─── Menu Data (single source of truth) ───
var MENU_DATA = [
    { name: 'AI工具箱', icon: 'icon-ai', items: [
        { label: 'ChatGPT', href: 'chatgpt.html', keywords: ['聊天', 'AI问答', '大模型', 'LLM', 'gpt', 'claude', '对话', '助手', 'chat', 'ai'] },
        { label: 'AI通用生图', href: 'ai_image.html', keywords: ['AI绘图', 'AI生图', '图片生成', '文生图', 'cogview', '画图', '出图', '生成图片'] },
        { label: 'AI生视频', href: 'ai_video.html', keywords: ['AI视频', '视频生成', '文生视频', 'cogvideox', '生成视频', 'AI短片'] },
        { label: 'AI高清放大', href: 'ai_upscale.html', keywords: ['超分辨率', '图片放大', 'upscale', 'super resolution', '放大', '清晰', 'esrgan', 'real-esrgan', 'waifu', '2x', '4x'] },
        { label: 'AI绘画', href: 'ai_draw.html', keywords: ['文生图', '画图', '生成图片', 'stable diffusion', 'prompt', '绘图', '描画', 'sd', 'txt2img', 'image generation', '绘画', '出图'] },
    ]},
    { name: '图片处理', icon: 'icon-image', items: [
        { label: '图片压缩转换', href: 'compress_image.html', keywords: ['格式转换', 'jpg', 'png', 'webp', 'dds', 'tga', 'convert', 'compress', '压缩', '转格式', 'bmp', 'heic', 'avif', '缩小', '体积', 'convertio'] },
        { label: '图片与Base64互转', href: 'base64_image.html', keywords: ['base64', 'data uri', '图片转码', '编码', '解码', '图片转base64', 'base64转图片', 'encode', 'decode', 'dataurl'] },
        { label: 'GIF压缩器', href: 'gif_compress.html', keywords: ['动图', '压缩', 'gif', 'animated', '动画', '表情包', '帧率', '缩小gif', 'gif缩小', 'gif压缩'] },
        { label: '贴图通道合成', href: 'combine_rgba.html', keywords: ['RGBA', '通道', '合并', 'combine', 'merge', '贴图合成', '打包', 'channel', '金属度粗糙度', 'orm', '合成通道'] },
        { label: '贴图通道分离', href: 'texture_channel_splitter.html', keywords: ['通道分离', '通道拆分', 'RGBA分离', '直方图', 'split', 'extract', '分离', '拆图', 'channel pack', '解包'] },
        { label: 'PBR贴图生成器', href: 'pbr_texture_generator.html', keywords: ['法线', '粗糙度', '金属度', '材质', 'normal', 'roughness', 'metallic', 'ao', 'height', 'displacement', 'pbr', '贴图', '生成'] },
        { label: 'Tiling贴图预览', href: 'tiling_texture.html', keywords: ['无缝', '平铺', 'UV', '接缝', 'tiling', 'seamless', 'tile', '重复', '四方连续', '贴图平铺', '循环'] },
        { label: '拼贴图工具', href: 'collage_texture.html', keywords: ['拼贴', '排列', '网格', 'grid', 'collage', '贴图拼接', '排版', '纹理矩阵', '铺满', '矩阵排列'] },
        { label: 'HDR编辑器', href: 'hdr_editor.html', keywords: ['hdr', '环境贴图', 'exr', 'hdri', '全景', 'env', 'ibl', 'skybox', 'cubemap', '360', 'environ', 'pano'] },
        { label: '在线PS', href: 'ps_online.html', keywords: ['Photoshop', '图片编辑', 'ps', 'photopea', '修图', '图层', '扣图', '去背', 'p图', 'design'] },
    ]},
    { name: '3D工具', icon: 'icon-3d', items: [
        { label: '模型预览器', href: 'model_previewer.html', keywords: ['3D模型', 'glb', 'gltf', 'fbx', 'obj', 'model viewer', '预览', '3d', '三维', 'mesh', '模型查看', 'usdz'] },
    ]},
    { name: '视频处理', icon: 'icon-video', items: [
        { label: '视频剪辑', href: 'video_cut.html', keywords: ['裁剪', '截取', 'mp4', 'cut', 'trim', 'video editor', '切割', '剪辑', 'mov', '片段', '时间轴'] },
        { label: '视频格式转换', href: 'video_format_cover.html', keywords: ['转码', '格式', 'mp4', 'webm', 'avi', 'mov', 'mkv', 'gif', 'convert', '转格式', 'ffmpeg', '编码'] },
    ]},
    { name: '游戏工具', icon: 'icon-game', items: [
        { label: '图集打包工具', href: 'sprite_sheet_packer.html', keywords: ['Sprite', 'Atlas', '图集', '序列帧', 'UI图集', 'spritesheet', 'pack', '贴图集', '合并', 'sprite sheet', '帧动画'] },
        { label: '雪碧图拆分工具', href: 'sprite_sheet_splitter.html', keywords: ['雪碧图', '拆分', 'sprite', '切图', '序列帧拆分', '图集拆分', '切分', '帧动画切图', '自动切图', 'spritesheet拆分'] },
    ]},
    { name: 'TA工具', icon: 'icon-ta', items: [
        { label: 'Shader函数库', href: 'shader_library.html', keywords: ['着色器', 'HLSL', '函数', 'shader', 'glsl', 'cg', '节点', '材质函数', '代码片段', 'snippet', 'library', 'fx'] },
        { label: 'GLSL/HLSL转换器', href: 'glsl_hlsl_converter.html', keywords: ['shader转换', '着色器转换', 'glsl', 'hlsl', 'cg', 'convert', 'translate', '语法转换', 'unity', 'unreal', 'shader language'] },
        { label: '物理光照计算器', href: 'physics_light.html', keywords: ['光照', '曝光', 'lux', 'ev', 'exposure', 'aperture', 'iso', 'fstop', '快门', '光圈', 'photography', '摄影', 'ev100', 'camera'] },
        { label: '色彩空间转换器', href: 'color_space_converter.html', keywords: ['Linear', 'sRGB', 'Gamma', '色彩空间', 'color space', 'aces', 'rec709', 'rec2020', '线性', '伽马', '色调映射', 'tonemap'] },
        { label: '贴图信息查看器', href: 'image_metadata_inspector.html', keywords: ['贴图信息', 'POT', '显存', 'VRAM', '直方图', 'texture info', 'memory', 'histogram', '分辨率', 'mip', 'dpi', '元数据'] },
        { label: 'TA知识库', href: 'TA_wiki.html', keywords: ['wiki', '知识', '技术美术', 'tech art', 'ta', '文档', '手册', 'guide', '教程', '学习', 'reference', '参考'] },
        { label: 'TA资源导航', href: 'resources.html', keywords: ['导航', '资源', 'link', 'navigation', '官网', '图形学', '引擎', 'unity', 'unreal', 'blender', 'substance', 'houdini', 'github', 'shadertoy', 'megascans', 'polyhaven', 'pbr', '材质', '模型', '教程', '社区', 'forum'] },
    ]},
    { name: '和我一起听', icon: 'icon-music', items: [
        { label: '网易云音乐', href: 'cloud_music.html', keywords: ['音乐', '歌曲', '歌单', 'music', 'netease', '播放器', '听歌', 'mp3', 'player', '电台', 'fm'] },
    ]},
    { name: '关于', icon: 'icon-about', items: [
        { label: '关于作者', href: 'about.html', keywords: ['关于', '作者', 'about', 'author', '宝藏小树林', 'treasuregrove', 'bilibili', 'b站', '联系', 'contact', '主页', '个人'] },
    ]},
];

// ─── Inject favicon ───
(function() {
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.sizes = '32x32';
    var isRoot = !window.location.pathname.replace(/\\/g, '/').includes('/tools_html/');
    link.href = isRoot ? 'assets/images/icon/favicon-32x32.png' : '../assets/images/icon/favicon-32x32.png';
    document.head.appendChild(link);

    var apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.sizes = '180x180';
    apple.href = isRoot ? 'assets/images/icon/apple-touch-icon.png' : '../assets/images/icon/apple-touch-icon.png';
    document.head.appendChild(apple);
})();

// ─── Webfont now loaded via static <link> in <head> ───

// ─── Build sidebar HTML ───
function buildMenuHTML() {
    var isRoot = !window.location.pathname.replace(/\\/g, '/').includes('/tools_html/');
    var prefix = isRoot ? 'tools_html/' : '';

    var html = '<ul class="menu_root">';
    for (var i = 0; i < MENU_DATA.length; i++) {
        var cat = MENU_DATA[i];
        html += '<li class="left_item">';
        html += '<div class="left_icon ' + cat.icon + '"></div>';
        html += '<div class="item_context">' + cat.name + '</div>';
        if (cat.items.length > 0) {
            html += '<ul class="sub_menu">';
            for (var j = 0; j < cat.items.length; j++) {
                var item = cat.items[j];
                html += '<li><a href="' + prefix + item.href + '" data-search="' + escapeHTML([item.label, cat.name, item.href.replace(/\.html$/i, '').replace(/[_-]/g, ' ')].concat(item.keywords || []).join(' ')) + '">' + item.label + '</a></li>';
            }
            html += '</ul>';
        }
        html += '</li>';
    }
    html += '</ul>';
    return html;
}

// ─── Inject sidebar ───
function injectMenu() {
    var container = document.querySelector('.left_menu');
    if (!container) return;
    if (!container.querySelector('.menu_root')) {
        container.innerHTML = buildMenuHTML();
    }
}

function markCurrentMenuItem() {
    var current = window.location.pathname.replace(/\\/g, '/').split('/').pop() || 'index.html';
    var links = document.querySelectorAll('.left_menu .sub_menu a');
    for (var i = 0; i < links.length; i++) {
        var href = (links[i].getAttribute('href') || '').split('?')[0].split('#')[0].replace(/\\/g, '/').split('/').pop();
        if (href && href === current) {
            links[i].classList.add('active-link');
            var item = links[i].closest('.left_item');
            if (item) {
                item.classList.add('active');
                item.classList.add('open');
            }
        }
    }
}

// ─── Accordion toggle ───
function initLeftMenu() {
    var menuRoot = document.querySelector('.menu_root');
    if (!menuRoot) return;
    menuRoot.addEventListener('click', onMenuRootClick);
}

function onMenuRootClick(event) {
    if (event.target.closest('.sub_menu a')) return;
    var clickedItem = event.target.closest('.left_item');
    if (!clickedItem) return;
    var subMenu = clickedItem.querySelector('.sub_menu');
    if (!subMenu) return;
    closeOtherItems(clickedItem);
    clickedItem.classList.toggle('open');
}

function closeOtherItems(currentItem) {
    var allItems = document.querySelectorAll('.left_item');
    for (var i = 0; i < allItems.length; i++) {
        if (allItems[i] !== currentItem) {
            allItems[i].classList.remove('open');
        }
    }
}



// ─── Global tool search ───
function normalizeSearchText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function getMenuPathPrefix() {
    var isRoot = !window.location.pathname.replace(/\\/g, '/').includes('/tools_html/');
    return isRoot ? 'tools_html/' : '';
}

// 异步加载 TA 资源数据（仅在未加载时按需触发，浏览器会缓存）
// 加载完成后 window.TA_RESOURCES / window.fuzzyBestScore 将可用
function ensureResourcesData(onReady) {
    if (window.TA_RESOURCES && window.fuzzyBestScore) {
        if (onReady) onReady();
        return;
    }
    var isRoot = !window.location.pathname.replace(/\\/g, '/').includes('/tools_html/');
    var script = document.createElement('script');
    script.src = (isRoot ? '' : '../') + 'js/resources_data.js';
    script.onload = function () { if (onReady) onReady(); };
    script.onerror = function () { if (onReady) onReady(); }; // 容错：失败也继续
    document.head.appendChild(script);
}

function getSearchItems() {
    var prefix = getMenuPathPrefix();
    var globalKeywords = 'TA工具箱 技术美术工具箱 TAWebTool TA Toolbox 宝藏小树林 技术美术工具 treasuregrove tools';
    var results = [];
    for (var i = 0; i < MENU_DATA.length; i++) {
        var category = MENU_DATA[i];
        for (var j = 0; j < category.items.length; j++) {
            var item = category.items[j];
            var fields = [item.label, category.name, item.href.replace(/\.html$/i, '').replace(/[_-]/g, ' ')]
                .concat(item.keywords || [])
                .concat([globalKeywords]);
            results.push({
                label: item.label,
                category: category.name,
                href: prefix + item.href,
                keywords: normalizeSearchText(fields.join(' ')),
                _fields: fields
            });
        }
    }

    // 合并 TA 资源导航里的站点（仅在 resources_data.js 已加载时）
    if (window.TA_RESOURCES && window.TA_RESOURCES.length) {
        for (var k = 0; k < window.TA_RESOURCES.length; k++) {
            var cat = window.TA_RESOURCES[k];
            var sites = cat.sites || [];
            for (var m = 0; m < sites.length; m++) {
                var site = sites[m];
                var siteFields = [site.name, site.desc || '', cat.name].concat(site.keywords || []);
                results.push({
                    label: site.name,
                    category: '资源导航',
                    href: prefix + 'resources.html?kw=' + encodeURIComponent(site.name),
                    keywords: normalizeSearchText(siteFields.join(' ')),
                    _fields: siteFields,
                    isResource: true
                });
            }
        }
    }
    return results;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"]/g, function (char) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char];
    });
}

function highlightMatch(text, keyword) {
    if (!keyword) return escapeHTML(text);
    var lowerText = text.toLowerCase();
    var lowerKeyword = keyword.toLowerCase();
    var start = lowerText.indexOf(lowerKeyword);
    if (start < 0) return escapeHTML(text);
    var end = start + keyword.length;
    return escapeHTML(text.slice(0, start)) + '<mark>' + escapeHTML(text.slice(start, end)) + '</mark>' + escapeHTML(text.slice(end));
}

function ensureSearchDropdown(searchWrap) {
    var dropdown = searchWrap.querySelector('.top_search_results');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'top_search_results';
        dropdown.setAttribute('role', 'listbox');
        dropdown.hidden = true;
        searchWrap.appendChild(dropdown);
    }
    return dropdown;
}

function renderSearchResults(dropdown, matches, keyword) {
    if (!keyword) {
        dropdown.hidden = true;
        dropdown.innerHTML = '';
        return;
    }

    if (matches.length === 0) {
        dropdown.hidden = false;
        dropdown.innerHTML = '<div class="top_search_empty">没有找到相关工具</div>';
        return;
    }

    dropdown.hidden = false;
    dropdown.innerHTML = matches.map(function (item, index) {
        return '<a class="top_search_result" role="option" data-index="' + index + '" href="' + escapeHTML(item.href) + '">' +
            '<span class="top_search_result_title">' + highlightMatch(item.label, keyword) + '</span>' +
            '<span class="top_search_result_meta">' + escapeHTML(item.category) + '</span>' +
            '</a>';
    }).join('');
}

function updateMenuSearchState(keyword) {
    var normalizedKeyword = normalizeSearchText(keyword);
    var leftItems = document.querySelectorAll('.left_item');

    for (var i = 0; i < leftItems.length; i++) {
        var categoryEl = leftItems[i];
        var titleEl = categoryEl.querySelector('.item_context');
        var categoryName = normalizeSearchText(titleEl ? titleEl.textContent : '');
        var links = categoryEl.querySelectorAll('.sub_menu a');
        var categoryMatched = normalizedKeyword && categoryName.indexOf(normalizedKeyword) >= 0;
        var visibleCount = 0;

        for (var j = 0; j < links.length; j++) {
            var link = links[j];
            var linkText = normalizeSearchText(link.getAttribute('data-search') || (link.textContent + ' ' + link.getAttribute('href')));
            var matched = !normalizedKeyword || categoryMatched || linkText.indexOf(normalizedKeyword) >= 0;
            link.parentElement.classList.toggle('search-hidden', !matched);
            if (matched) visibleCount++;
        }

        var shouldShowCategory = !normalizedKeyword || categoryMatched || visibleCount > 0;
        categoryEl.classList.toggle('search-hidden', !shouldShowCategory);
        categoryEl.classList.toggle('search-match', Boolean(normalizedKeyword && (categoryMatched || visibleCount > 0)));
        if (normalizedKeyword && visibleCount > 0) {
            categoryEl.classList.add('open');
            categoryEl.classList.add('search-opened');
        } else if (!normalizedKeyword) {
            categoryEl.classList.remove('search-match');
            if (categoryEl.classList.contains('search-opened')) {
                categoryEl.classList.remove('open');
                categoryEl.classList.remove('search-opened');
            }
        }
    }
}

function initTopSearch() {
    var searchWrap = document.querySelector('.top_search');
    if (!searchWrap) return;
    var input = searchWrap.querySelector('input');
    if (!input) return;

    input.type = 'search';
    input.placeholder = '搜索工具 / 资源 / 分类，按 Enter 打开';
    input.setAttribute('aria-label', '搜索工具');
    input.setAttribute('autocomplete', 'off');

    var dropdown = ensureSearchDropdown(searchWrap);
    var searchItems = getSearchItems();
    var currentMatches = [];

    function scoreItem(item, keyword) {
        if (typeof window.fuzzyBestScore === 'function' && item._fields) {
            return window.fuzzyBestScore(keyword, item._fields);
        }
        return item.keywords.indexOf(keyword) >= 0 ? 1 : 0;
    }

    function refresh() {
        var keyword = normalizeSearchText(input.value);
        if (!keyword) {
            currentMatches = [];
            renderSearchResults(dropdown, currentMatches, keyword);
            updateMenuSearchState(keyword);
            return;
        }

        // 模糊匹配 + 评分排序
        var scored = [];
        for (var i = 0; i < searchItems.length; i++) {
            var item = searchItems[i];
            var score = scoreItem(item, keyword);
            if (score > 0) scored.push({ item: item, score: score });
        }
        scored.sort(function (a, b) {
            if (b.score !== a.score) return b.score - a.score;
            // 同分时普通工具优先于资源条目
            var aPriority = a.item.isResource ? 1 : 0;
            var bPriority = b.item.isResource ? 1 : 0;
            if (aPriority !== bPriority) return aPriority - bPriority;
            return 0;
        });
        currentMatches = scored.slice(0, 10).map(function (s) { return s.item; });

        renderSearchResults(dropdown, currentMatches, keyword);
        updateMenuSearchState(keyword);
    }

    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);
    input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && currentMatches.length > 0) {
            event.preventDefault();
            window.location.href = currentMatches[0].href;
        }
        if (event.key === 'Escape') {
            input.value = '';
            refresh();
            input.blur();
        }
    });

    document.addEventListener('click', function (event) {
        if (!searchWrap.contains(event.target)) {
            dropdown.hidden = true;
        }
    });

    // 异步加载资源数据后重建搜索项，确保任意页面都能搜到资源站点
    ensureResourcesData(function () {
        searchItems = getSearchItems();
        if (normalizeSearchText(input.value)) refresh();
    });
}

// ─── Page Transition System ───
// Minimal: just navigate. Entry animations on each page handle the reveal.
(function () {
    function isInternalLink(href) {
        if (!href) return false;
        if (href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return false;
        if (href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return false;
        try {
            var url = new URL(href, window.location.href);
            return url.origin === window.location.origin && /\.html(\?.*)?(#.*)?$/.test(url.pathname);
        } catch (e) {
            return false;
        }
    }

    document.addEventListener('click', function (event) {
        var anchor = event.target.closest('a');
        if (!anchor) return;
        var href = anchor.getAttribute('href');
        if (!isInternalLink(href)) return;
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        window.location.href = href;
    });
})();

function loadFeedbackWidget() {
    var isRoot = !window.location.pathname.replace(/\\/g, '/').includes('/tools_html/');
    var script = document.createElement('script');
    script.src = (isRoot ? '' : '../') + 'js/feedback.js';
    script.async = true;
    script.onerror = function () { /* 反馈入口加载失败不影响主功能 */ };
    document.head.appendChild(script);
}

document.addEventListener('DOMContentLoaded', function () {
    injectMenu();
    markCurrentMenuItem();
    initLeftMenu();
    initTopSearch();
    loadFeedbackWidget();
});
