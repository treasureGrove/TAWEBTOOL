// Auto-inject waifu element to the page
function initWaifu() {
    console.log('[waifu.js] Initializing waifu...');

    // Check if waifu already exists
    if (document.getElementById('waifu')) {
        console.log('[waifu.js] Waifu already exists, skipping injection');
        return;
    }

    // Create waifu container
    const waifuContainer = document.createElement('div');
    waifuContainer.id = 'waifu';

    // Create waifu-tips
    const waifuTips = document.createElement('div');
    waifuTips.id = 'waifu-tips';

    // Create canvas for live2d
    const canvas = document.createElement('canvas');
    canvas.id = 'live2d';
    canvas.width = 280;
    canvas.height = 250;

    // Create waifu-tool
    const waifuTool = document.createElement('div');
    waifuTool.id = 'waifu-tool';

    // Build element structure
    waifuContainer.appendChild(waifuTips);
    waifuContainer.appendChild(canvas);
    waifuContainer.appendChild(waifuTool);

    // Append to body
    document.body.appendChild(waifuContainer);
    console.log('[waifu.js] Waifu elements injected successfully');

    // Load live2d-widget if not already loaded
    if (!window.live2d && !document.querySelector('script[src*="live2d"]')) {
        console.log('[waifu.js] Loading live2d-widget...');
        const script = document.createElement('script');
        script.src = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/autoload.js';
        script.onerror = function() {
            console.error('[waifu.js] Failed to load live2d-widget');
        };
        script.onload = function() {
            console.log('[waifu.js] live2d-widget loaded successfully');
        };
        document.body.appendChild(script);
    } else {
        console.log('[waifu.js] live2d-widget already loaded or being loaded');
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('[waifu.js] DOMContentLoaded triggered');
    initWaifu();
});

// If script loads after DOMContentLoaded, initialize immediately
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    console.log('[waifu.js] Script loaded after DOMContentLoaded, initializing immediately');
    initWaifu();
}

console.log('[waifu.js] Script loaded');
