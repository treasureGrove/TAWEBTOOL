// Load live2d-widget from CDN
// The CDN's autoload.js handles all DOM creation (including canvas) internally
function initWaifu() {
    if (document.querySelector('script[src*="live2d-widget"]')) {
        return;
    }
    // Randomize model on each page load (7 model groups in live2d_api)
    localStorage.setItem('modelId', Math.floor(Math.random() * 7));
    localStorage.setItem('modelTexturesId', 0);

    const script = document.createElement('script');
    script.src = 'https://fastly.jsdelivr.net/gh/stevenjoezhang/live2d-widget@latest/autoload.js';
    script.onerror = function() {
        console.error('[waifu.js] Failed to load live2d-widget');
    };
    document.body.appendChild(script);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWaifu);
} else {
    initWaifu();
}
