// ─── Menu Data (single source of truth) ───
var MENU_DATA = [
    { name: 'AI工具箱', icon: 'icon-ai', items: [
        { label: 'ChatGPT', href: 'chatgpt.html' },
        { label: 'AI高清放大', href: 'ai_upscale.html' },
        { label: 'AI插帧/分辨率', href: 'ai_frame_interpolation.html' },
        { label: 'AI绘画', href: 'ai_draw.html' },
    ]},
    { name: '图片处理', icon: 'icon-image', items: [
        { label: '图片压缩转换', href: 'compress_image.html' },
        { label: 'GIF压缩器', href: 'gif_compress.html' },
        { label: '贴图通道合成', href: 'combine_rgba.html' },
        { label: 'PBR贴图生成器', href: 'pbr_texture_generator.html' },
        { label: 'HDR编辑器', href: 'hdr_editor.html' },
        { label: '在线PS', href: 'ps_online.html' },
    ]},
    { name: '3D工具', icon: 'icon-3d', items: [
        { label: '模型预览器', href: 'model_previewer.html' },
        { label: '3D城市地形下载', href: '3d_city.html' },
    ]},
    { name: '视频处理', icon: 'icon-video', items: [
        { label: '视频剪辑', href: 'video_cut.html' },
        { label: '视频格式转换', href: 'video_format_cover.html' },
    ]},
    { name: 'TA工具', icon: 'icon-ta', items: [
        { label: 'Shader函数库', href: 'shader_library.html' },
        { label: 'GLSL/HLSL转换器', href: 'glsl_hlsl_converter.html' },
        { label: 'UE材质库', href: 'ue_material_picture.html' },
        { label: '物理光照计算器', href: 'physics_light.html' },
        { label: 'TA知识库', href: 'TA_wiki.html' },
    ]},
    { name: '和我一起听', icon: 'icon-music', items: [
        { label: '网易云音乐', href: 'cloud_music.html' },
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
                html += '<li><a href="' + prefix + item.href + '">' + item.label + '</a></li>';
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

document.addEventListener('DOMContentLoaded', function () {
    injectMenu();
    initLeftMenu();
});
