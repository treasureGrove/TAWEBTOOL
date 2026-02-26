(function () {
  function getPhotopeaUrl() {
    const defaultImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgQxMIOIAAAAASUVORK5CYII=';

    const config = {
      files: [defaultImageDataUrl],
      environment: {
        intro: false
      },
      script: 'app.activeDocument && app.activeDocument.layers && app.activeDocument.layers[0] && (app.activeDocument.layers[0].name = "Layer 0");'
    };

    return `https://www.photopea.com#${encodeURIComponent(JSON.stringify(config))}`;
  }

  function init() {
    const frame = document.getElementById('photopeaFrame');
    const fallback = document.getElementById('photopeaFallback');
    if (!frame || !fallback) return;

    const editorUrl = getPhotopeaUrl();
    frame.src = editorUrl;
    fallback.href = editorUrl;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
