// Official live2d-widget models list
const WAIFU_MODELS = [
    'tororo',
    'epsilon2.1',
    'pio',
    'izumi',
    'koharu',
    'shizuku',
    'Pio',
    'z16'
];

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

    // Create waifu-tool
    const waifuTool = document.createElement('div');
    waifuTool.id = 'waifu-tool';

    // Build element structure
    waifuContainer.appendChild(waifuTips);
    waifuContainer.appendChild(waifuTool);

    // Append to body
    document.body.appendChild(waifuContainer);
    console.log('[waifu.js] Waifu elements injected successfully');

    // Check if current page is index.html and set model
    const isIndexPage = window.location.pathname.endsWith('index.html') ||
                        window.location.pathname.endsWith('/') ||
                        window.location.pathname === '';

    if (isIndexPage) {
        // Random select a model for index page
        const randomModel = WAIFU_MODELS[Math.floor(Math.random() * WAIFU_MODELS.length)];
        console.log('[waifu.js] Index page detected, loading random model: ' + randomModel);
        window.waifuPath = `https://cdn.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/assets/${randomModel}.model.json`;
    } else {
        console.log('[waifu.js] Non-index page, using default model');
    }

    // Load live2d-widget autoload script
    console.log('[waifu.js] Loading live2d-widget autoload...');
    const script = document.createElement('script');
    script.src = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/autoload.js?t=' + Date.now();
    script.onerror = function() {
        console.error('[waifu.js] Failed to load live2d-widget');
    };
    script.onload = function() {
        console.log('[waifu.js] live2d-widget loaded successfully');
    };
    document.body.appendChild(script);
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('[waifu.js] DOMContentLoaded triggered');
    setTimeout(initWaifu, 100);
});

// If script loads after DOMContentLoaded, initialize immediately
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    console.log('[waifu.js] Script loaded after DOMContentLoaded, initializing immediately');
    setTimeout(initWaifu, 100);
}

console.log('[waifu.js] Script loaded');
