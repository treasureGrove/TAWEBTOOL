(function () {
    var TOOL_DESC = {
        'chatgpt.html': 'AI 对话与问答助手',
        'ai_upscale.html': '超分辨率无损放大图片',
        'ai_draw.html': '文生图在线 AI 绘画',
        'compress_image.html': '批量压缩与格式转换',
        'gif_compress.html': 'GIF 动图压缩优化',
        'combine_rgba.html': 'RGBA 通道打包合成',
        'texture_channel_splitter.html': '拆分查看贴图通道',
        'pbr_texture_generator.html': '法线 / 粗糙度一键生成',
        'tiling_texture.html': '无缝平铺与接缝检查',
        'collage_texture.html': '网格拼贴排列贴图',
        'hdr_editor.html': 'HDRI 环境贴图编辑',
        'ps_online.html': '浏览器里的 Photoshop',
        'model_previewer.html': 'GLB / FBX / OBJ 在线预览',
        'video_cut.html': '在线视频剪辑截取',
        'video_format_cover.html': '视频转码格式转换',
        'sprite_sheet_packer.html': '序列帧图集打包',
        'shader_library.html': '常用 Shader 函数速查',
        'glsl_hlsl_converter.html': '着色器语言互转',
        'physics_light.html': '曝光 / 散射物理计算',
        'color_space_converter.html': 'Linear / sRGB / ACES 转换',
        'image_metadata_inspector.html': '分辨率 / 显存 / 直方图',
        'TA_wiki.html': '每日自动更新的 TA 知识',
        'cloud_music.html': '网易云歌单一起听',
        'about.html': '认识一下站长'
    };

    var CAT_CLASS = {
        'AI工具箱': 'cat-ai',
        '图片处理': 'cat-image',
        '3D工具': 'cat-3d',
        '视频处理': 'cat-video',
        '游戏工具': 'cat-game',
        'TA工具': 'cat-ta',
        '和我一起听': 'cat-music',
        '关于': 'cat-about'
    };

    function render() {
        var root = document.getElementById('home_sections');
        if (!root || typeof MENU_DATA === 'undefined') return;
        var prefix = typeof getMenuPathPrefix === 'function' ? getMenuPathPrefix() : 'tools_html/';

        var toolCount = 0;
        var html = '';
        var delay = 0.25;

        for (var i = 0; i < MENU_DATA.length; i++) {
            var cat = MENU_DATA[i];
            if (!cat.items || cat.items.length === 0) continue;
            var catCls = CAT_CLASS[cat.name] || 'cat-ta';

            html += '<section class="home-section ' + catCls + '" style="animation-delay:' + delay.toFixed(2) + 's">';
            html += '<h2 class="home-section-title"><span class="home-section-icon ' + cat.icon + '"></span>' + escapeHTML(cat.name) + '<span class="home-section-count">' + cat.items.length + '</span></h2>';
            html += '<div class="home-grid">';

            for (var j = 0; j < cat.items.length; j++) {
                var item = cat.items[j];
                var desc = TOOL_DESC[item.href] || '';
                html += '<a class="home-card" href="' + prefix + item.href + '">';
                html += '<span class="home-card-icon ' + cat.icon + '"></span>';
                html += '<span class="home-card-body">';
                html += '<span class="home-card-title">' + escapeHTML(item.label) + '</span>';
                if (desc) html += '<span class="home-card-desc">' + escapeHTML(desc) + '</span>';
                html += '</span>';
                html += '<span class="home-card-arrow">→</span>';
                html += '</a>';
                if (cat.name !== '关于') toolCount++;
            }

            html += '</div></section>';
            delay += 0.07;
        }

        root.innerHTML = html;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', render);
    } else {
        render();
    }
})();
