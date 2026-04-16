// 自动注入 waifu（二次元人物）元素到页面中
function initWaifu() {
    // 检查 waifu 是否已存在
    if (document.getElementById('waifu')) {
        return;
    }

    // 创建 waifu 容器
    const waifuContainer = document.createElement('div');
    waifuContainer.id = 'waifu';

    // 创建 waifu-tips
    const waifuTips = document.createElement('div');
    waifuTips.id = 'waifu-tips';

    // 创建 waifu-tool
    const waifuTool = document.createElement('div');
    waifuTool.id = 'waifu-tool';

    // 组织元素结构
    waifuContainer.appendChild(waifuTips);
    waifuContainer.appendChild(waifuTool);

    // 添加到 body
    document.body.appendChild(waifuContainer);
}

// DOMContentLoaded 时初始化
document.addEventListener('DOMContentLoaded', initWaifu);

// 如果脚本在 DOMContentLoaded 之后加载，立即初始化
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initWaifu();
}
