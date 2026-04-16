// Auto-inject waifu element to the page
function initWaifu() {
    // Check if waifu already exists
    if (document.getElementById('waifu')) {
        return;
    }

    // Create waifu container
    const waifuContainer = document.createElement('div');
    waifuContainer.id = 'waifu';

    // Create waifu-tips
    const waifuTips = document.createElement('div');
    waifuTips.id = 'waifu-tips';

    // Create waifu-tool
    const waifuTool = document.createElement('div');
    waifuTool.id = 'waifu-tool';

    // Build element structure
    waifuContainer.appendChild(waifuTips);
    waifuContainer.appendChild(waifuTool);

    // Append to body
    document.body.appendChild(waifuContainer);

    // Load live2d-widget if not already loaded
    if (!window.live2d) {
        const script = document.createElement('script');
        script.src = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/autoload.js';
        document.body.appendChild(script);
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initWaifu);

// If script loads after DOMContentLoaded, initialize immediately
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    initWaifu();
}
