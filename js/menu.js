// ─── Menu Data (single source of truth) ───
var MENU_DATA = [
    { name: 'AI工具箱', icon: 'icon-ai', items: [
        { label: 'ChatGPT', href: 'chatgpt.html', keywords: ['聊天', 'AI问答', '大模型'] },
        { label: 'AI高清放大', href: 'ai_upscale.html', keywords: ['超分辨率', '图片放大', 'upscale'] },
        { label: 'AI绘画', href: 'ai_draw.html', keywords: ['文生图', '画图', '生成图片'] },
    ]},
    { name: '图片处理', icon: 'icon-image', items: [
        { label: '图片压缩转换', href: 'compress_image.html', keywords: ['格式转换', 'jpg', 'png', 'webp', 'dds', 'tga'] },
        { label: 'GIF压缩器', href: 'gif_compress.html', keywords: ['动图', '压缩'] },
        { label: '贴图通道合成', href: 'combine_rgba.html', keywords: ['RGBA', '通道', '合并'] },
        { label: '贴图通道分离', href: 'texture_channel_splitter.html', keywords: ['通道分离', '通道拆分', 'RGBA分离', '直方图'] },
        { label: 'PBR贴图生成器', href: 'pbr_texture_generator.html', keywords: ['法线', '粗糙度', '金属度', '材质'] },
        { label: 'Tiling贴图预览', href: 'tiling_texture.html', keywords: ['无缝', '平铺', 'UV', '接缝', 'tiling'] },
        { label: 'HDR编辑器', href: 'hdr_editor.html', keywords: ['hdr', '环境贴图', 'exr'] },
        { label: '在线PS', href: 'ps_online.html', keywords: ['Photoshop', '图片编辑'] },
    ]},
    { name: '3D工具', icon: 'icon-3d', items: [
        { label: '模型预览器', href: 'model_previewer.html', keywords: ['3D模型', 'glb', 'gltf', 'fbx'] },
        { label: '3D城市地形下载', href: '3d_city.html', keywords: ['地图', '地形', '建筑', '城市'] },
    ]},
    { name: '视频处理', icon: 'icon-video', items: [
        { label: '视频剪辑', href: 'video_cut.html', keywords: ['裁剪', '截取', 'mp4'] },
        { label: '视频格式转换', href: 'video_format_cover.html', keywords: ['转码', '格式', 'mp4', 'webm'] },
    ]},
    { name: '游戏工具', icon: 'icon-game', items: [
        { label: '图集打包工具', href: 'sprite_sheet_packer.html', keywords: ['Sprite', 'Atlas', '图集', '序列帧', 'UI图集'] },
    ]},
    { name: 'TA工具', icon: 'icon-ta', items: [
        { label: 'Shader函数库', href: 'shader_library.html', keywords: ['着色器', 'HLSL', '函数'] },
        { label: 'GLSL/HLSL转换器', href: 'glsl_hlsl_converter.html', keywords: ['shader转换', '着色器转换'] },
        { label: '物理光照计算器', href: 'physics_light.html', keywords: ['光照', '曝光', 'lux', 'ev'] },
        { label: '色彩空间转换器', href: 'color_space_converter.html', keywords: ['Linear', 'sRGB', 'Gamma', '色彩空间'] },
        { label: '贴图信息查看器', href: 'image_metadata_inspector.html', keywords: ['贴图信息', 'POT', '显存', 'VRAM', '直方图'] },
        { label: 'TA知识库', href: 'TA_wiki.html', keywords: ['wiki', '知识', '技术美术'] },
    ]},
    { name: '和我一起听', icon: 'icon-music', items: [
        { label: '网易云音乐', href: 'cloud_music.html', keywords: ['音乐', '歌曲', '歌单'] },
    ]},
    { name: '关于', icon: 'icon-about', items: [] },
];

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
