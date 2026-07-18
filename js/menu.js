// ─── Menu Data (single source of truth) ───
var MENU_DATA = [
    { name: 'AI工具箱', icon: 'icon-ai', items: [
        { label: 'ChatGPT', href: 'chatgpt.html', keywords: ['聊天', 'AI问答', '大模型', 'LLM', 'gpt', 'claude', '对话', '助手', 'chat', 'ai'] },
        { label: 'AI高清放大', href: 'ai_upscale.html', keywords: ['超分辨率', '图片放大', 'upscale', 'super resolution', '放大', '清晰', 'esrgan', 'real-esrgan', 'waifu', '2x', '4x'] },
        { label: 'AI绘画', href: 'ai_draw.html', keywords: ['文生图', '画图', '生成图片', 'stable diffusion', 'prompt', '绘图', '描画', 'sd', 'txt2img', 'image generation', '绘画', '出图'] },
    ]},
    { name: '图片处理', icon: 'icon-image', items: [
        { label: '图片压缩转换', href: 'compress_image.html', keywords: ['格式转换', 'jpg', 'png', 'webp', 'dds', 'tga', 'convert', 'compress', '压缩', '转格式', 'bmp', 'heic', 'avif', '缩小', '体积', 'convertio'] },
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
        { label: '视频格式转换', href: 'video_format_cover.html', keywords: ['转码', '格式', 'mp4', 'webm', 'convert', 'transcode', 'mkv', 'avi', 'mov', '编码', 'codec', 'h264', 'h265'] },
    ]},
    { name: '游戏工具', icon: 'icon-game', items: [
        { label: '图集打包工具', href: 'sprite_sheet_packer.html', keywords: ['Sprite', 'Atlas', '图集', '序列帧', 'UI图集', 'spritesheet', 'pack', '贴图集', '合并', 'sprite sheet', '帧动画'] },
    ]},
    { name: 'TA工具', icon: 'icon-ta', items: [
        { label: 'Shader函数库', href: 'shader_library.html', keywords: ['着色器', 'HLSL', '函数', 'shader', 'glsl', 'cg', '节点', '材质函数', '代码片段', 'snippet', 'library', 'fx'] },
        { label: 'GLSL/HLSL转换器', href: 'glsl_hlsl_converter.html', keywords: ['shader转换', '着色器转换', 'glsl', 'hlsl', 'cg', 'convert', 'translate', '语法转换', 'unity', 'unreal', 'shader language'] },
        { label: '物理光照计算器', href: 'physics_light.html', keywords: ['光照', '曝光', 'lux', 'ev', 'exposure', 'aperture', 'iso', 'fstop', '快门', '光圈', 'photography', '摄影', 'ev100', 'camera'] },
        { label: '色彩空间转换器', href: 'color_space_converter.html', keywords: ['Linear', 'sRGB', 'Gamma', '色彩空间', 'color space', 'aces', 'rec709', 'rec2020', '线性', '伽马', '色调映射', 'tonemap'] },
        { label: '贴图信息查看器', href: 'image_metadata_inspector.html', keywords: ['贴图信息', 'POT', '显存', 'VRAM', '直方图', 'texture info', 'memory', 'histogram', '分辨率', 'mip', 'dpi', '元数据'] },
        { label: 'TA知识库', href: 'TA_wiki.html', keywords: ['wiki', '知识', '技术美术', 'tech art', 'ta', '文档', '手册', 'guide', '教程', '学习', 'reference', '参考'] },
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

// ─── Inject webfont (霞鹜文楷 LXGW WenKai Screen) ───
(function() {
    var preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = 'https://cdn.jsdelivr.net';
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    var font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://cdn.jsdelivr.net/npm/lxgw-wenkai-screen-webfont@1.7.0/style.css';
    document.head.appendChild(font);
})();

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

function getSearchItems() {
    var prefix = getMenuPathPrefix();
    var results = [];
    for (var i = 0; i < MENU_DATA.length; i++) {
        var category = MENU_DATA[i];
        for (var j = 0; j < category.items.length; j++) {
            var item = category.items[j];
            var keywords = [item.label, category.name, item.href.replace(/\.html$/i, '').replace(/[_-]/g, ' ')]
                .concat(item.keywords || []);
            results.push({
                label: item.label,
                category: category.name,
                href: prefix + item.href,
                keywords: normalizeSearchText(keywords.join(' '))
            });
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
    input.placeholder = '搜索工具 / 分类，按 Enter 打开';
    input.setAttribute('aria-label', '搜索工具');
    input.setAttribute('autocomplete', 'off');

    var dropdown = ensureSearchDropdown(searchWrap);
    var searchItems = getSearchItems();
    var currentMatches = [];

    function refresh() {
        var keyword = normalizeSearchText(input.value);
        currentMatches = keyword ? searchItems.filter(function (item) {
            return item.keywords.indexOf(keyword) >= 0;
        }).slice(0, 8) : [];
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

document.addEventListener('DOMContentLoaded', function () {
    injectMenu();
    markCurrentMenuItem();
    initLeftMenu();
    initTopSearch();
});
