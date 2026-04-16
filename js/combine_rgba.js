(function () {
  function $(id) { return document.getElementById(id); }

  const channelIds = ['r', 'g', 'b', 'a'];

  function setStatus(msg) {
    $('rgbaStatus').textContent = msg;
  }

  function readFileAsImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(img);
      };
      img.onerror = (e) => {
        try { URL.revokeObjectURL(url); } catch (e2) {}
        reject(e);
      };
      img.src = url;
    });
  }

  // keep track of object URLs for previews so we can revoke them
  const _previewURLs = {};

  function setDropzonePreview(channel, imgSrc) {
    const dropzone = $(`${channel}Drop`);
    // revoke previous URL for this channel
    if (_previewURLs[channel]) {
      try { URL.revokeObjectURL(_previewURLs[channel]); } catch (e) {}
      delete _previewURLs[channel];
    }

    if (!imgSrc) {
      dropzone.style.backgroundImage = 'none';
      dropzone.classList.remove('has-image');
      return;
    }

    // if imgSrc is a File object (from drop), create an object URL and remember it
    if (imgSrc instanceof File) {
      const url = URL.createObjectURL(imgSrc);
      _previewURLs[channel] = url;
      dropzone.style.backgroundImage = `url(${url})`;
    } else {
      dropzone.style.backgroundImage = `url(${imgSrc})`;
    }
    dropzone.classList.add('has-image');
  }

  function readSourceData(img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
  }

  function wrapUV(uv, mode) {
    if (mode === 'clamp') return Math.max(0, Math.min(1, uv));
    if (mode === 'mirror') {
      const period = ((uv % 2) + 2) % 2;
      return period <= 1 ? period : 2 - period;
    }
    return ((uv % 1) + 1) % 1;
  }

  // sample a specific component from source image data
  // comp: 0=red,1=green,2=blue,3=alpha, 'lum' = luminance from RGB
  function sampleComponent(src, u, v, wrapMode, comp) {
    const uu = wrapUV(u, wrapMode);
    const vv = wrapUV(v, wrapMode);
    const x = Math.min(src.width - 1, Math.max(0, Math.floor(uu * (src.width - 1))));
    const y = Math.min(src.height - 1, Math.max(0, Math.floor(vv * (src.height - 1))));
    const idx = (y * src.width + x) * 4;
    if (comp === 3) return src.data[idx + 3];
    if (comp === 'lum') {
      const r = src.data[idx], g = src.data[idx + 1], b = src.data[idx + 2];
      // standard luminance conversion
      return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return src.data[idx + (comp || 0)];
  }

  function getOutputSize() {
    const size = Math.max(1, Math.min(8192, parseInt($('outSize').value, 10) || 1024));
    $('outSize').value = size;
    return { w: size, h: size };
  }

  function updatePreviewByInput(channel) {
    const input = $(`${channel}Img`);
    const file = input.files[0];
    if (!file) {
      setDropzonePreview(channel, null);
      return;
    }
    // show dropzone preview using the File (so preview URLs are tracked)
    setDropzonePreview(channel, file);
    // still load image for composition
    readFileAsImage(file).then((img) => {
      setStatus(`已加载 ${channel.toUpperCase()} 通道：${file.name}`);
      updateCanvasPreview();
    }).catch(() => {
      setDropzonePreview(channel, null);
      setStatus(`加载 ${channel.toUpperCase()} 通道失败，请检查图片格式。`);
      updateCanvasPreview();
    });
  }

  function bindTileSlider(channel, axis) {
    const slider = $(`${channel}Tile${axis}`);
    const num = $(`${channel}Tile${axis}Num`);
    if (!slider || !num) return;
    slider.addEventListener('input', () => { num.value = slider.value; updateCanvasPreview(); });
    num.addEventListener('input', () => {
      const v = Math.max(-10, Math.min(10, parseFloat(num.value) || 1));
      slider.value = v; num.value = v; updateCanvasPreview();
    });
  }

  function bindDropzone(channel) {
    const input = $(`${channel}Img`);
    const dropzone = $(`${channel}Drop`);

    input.addEventListener('change', () => updatePreviewByInput(channel));

    // update preview when tiling or wrap changes for this channel
    const wrap = $(`${channel}Wrap`);
    const srcCh = $(`${channel}SrcCh`);
    bindTileSlider(channel, 'X');
    bindTileSlider(channel, 'Y');
    if (wrap) wrap.addEventListener('change', updateCanvasPreview);
    if (srcCh) srcCh.addEventListener('change', updateCanvasPreview);

    ['dragenter', 'dragover'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      updatePreviewByInput(channel);
    });
  }

  async function getLoadedImages() {
    const loadByChannel = async (ch) => {
      const file = $(`${ch}Img`).files[0];
      return file ? readFileAsImage(file) : null;
    };
    return {
      r: await loadByChannel('r'),
      g: await loadByChannel('g'),
      b: await loadByChannel('b'),
      a: await loadByChannel('a')
    };
  }

  async function mergeAndDownload() {
    setStatus('正在合成并导出...');
    const imgs = await getLoadedImages();

    const { w, h } = getOutputSize();
    const outCanvas = $('rgbaCanvas');
    outCanvas.width = w;
    outCanvas.height = h;

    // compose into canvas (works with any subset of channels)
    composeToCanvas(imgs, outCanvas);

    const format = $('rgbaFormat').value;
    const quality = Math.max(0.1, Math.min(1, parseFloat($('rgbaQuality').value) || 1));
    const fileName = `combined_rgba_${w}x${h}.${format}`;

    if (format === 'tga') {
      try {
        const blob = TGAEncoder.encodeFromCanvas(outCanvas);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1800);
        setStatus(`导出成功：${fileName}`);
      } catch (e) {
        setStatus('导出 TGA 失败：' + e.message);
      }
      return;
    }

    if (format === 'dds') {
      try {
        const blob = DDSEncoder.encodeFromCanvas(outCanvas, false);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = URL.createObjectURL(blob);
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1800);
        setStatus(`导出成功：${fileName}`);
      } catch (e) {
        setStatus('导出 DDS 失败：' + e.message);
      }
      return;
    }

    const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';

    outCanvas.toBlob((blob) => {
      if (!blob) {
        setStatus('导出失败：当前格式不受支持。');
        return;
      }
      const link = document.createElement('a');
      link.download = fileName;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1800);
      setStatus(`导出成功：${fileName}`);
    }, mime, quality);
  }

  // compose images into provided canvas
  function composeToCanvas(imgs, outCanvas) {
    const outCtx = outCanvas.getContext('2d');
    const w = outCanvas.width, h = outCanvas.height;
    const alphaMult = Math.max(0, Math.min(1, parseFloat($('alphaMult').value) || 1));

    function parseSrcCh(val) { return val === 'lum' ? 'lum' : parseInt(val, 10); }
    const channels = {
      r: imgs.r ? { src: readSourceData(imgs.r), tx: parseFloat($('rTileX').value) || 1, ty: parseFloat($('rTileY').value) || 1, wrap: $('rWrap').value, comp: parseSrcCh($('rSrcCh').value) } : null,
      g: imgs.g ? { src: readSourceData(imgs.g), tx: parseFloat($('gTileX').value) || 1, ty: parseFloat($('gTileY').value) || 1, wrap: $('gWrap').value, comp: parseSrcCh($('gSrcCh').value) } : null,
      b: imgs.b ? { src: readSourceData(imgs.b), tx: parseFloat($('bTileX').value) || 1, ty: parseFloat($('bTileY').value) || 1, wrap: $('bWrap').value, comp: parseSrcCh($('bSrcCh').value) } : null,
      a: imgs.a ? { src: readSourceData(imgs.a), tx: parseFloat($('aTileX').value) || 1, ty: parseFloat($('aTileY').value) || 1, wrap: $('aWrap').value, comp: parseSrcCh($('aSrcCh').value) } : null
    };

    const out = outCtx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const u = x / Math.max(1, w - 1);
        const v = y / Math.max(1, h - 1);
        out.data[i] = channels.r ? sampleComponent(channels.r.src, u * channels.r.tx, v * channels.r.ty, channels.r.wrap, channels.r.comp) : 0;
        out.data[i + 1] = channels.g ? sampleComponent(channels.g.src, u * channels.g.tx, v * channels.g.ty, channels.g.wrap, channels.g.comp) : 0;
        out.data[i + 2] = channels.b ? sampleComponent(channels.b.src, u * channels.b.tx, v * channels.b.ty, channels.b.wrap, channels.b.comp) : 0;
        const rawA = channels.a ? sampleComponent(channels.a.src, u * channels.a.tx, v * channels.a.ty, channels.a.wrap, channels.a.comp) : 255;
        out.data[i + 3] = Math.round(rawA * alphaMult);
      }
    }
    outCtx.putImageData(out, 0, 0);
    return out;
  }

  function bindGlobalControl() {
    $('rgbaPreset').addEventListener('change', (e) => {
      if (e.target.value === 'custom') return;
      const size = parseInt(e.target.value, 10);
      $('outSize').value = size;
    });

    // update preview when size/preset change
    $('rgbaPreset').addEventListener('change', updateCanvasPreview);
    $('outSize').addEventListener('input', updateCanvasPreview);

    $('rgbaQuality').addEventListener('input', (e) => {
      $('rgbaQualityNumber').value = e.target.value;
    });

    $('rgbaQualityNumber').addEventListener('input', (e) => {
      const v = Math.max(0.1, Math.min(1, parseFloat(e.target.value) || 1));
      $('rgbaQuality').value = v;
      $('rgbaQualityNumber').value = v;
    });

    $('alphaMult').addEventListener('input', (e) => {
      $('alphaMultNum').value = e.target.value;
      updateCanvasPreview();
    });
    $('alphaMultNum').addEventListener('input', (e) => {
      const v = Math.max(0, Math.min(1, parseFloat(e.target.value) || 1));
      $('alphaMult').value = v;
      $('alphaMultNum').value = v;
      updateCanvasPreview();
    });

    $('mergeRGBA').addEventListener('click', mergeAndDownload);
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => e.preventDefault());
  }

  // update the canvas preview immediately (works with partial channels)
  async function updateCanvasPreview() {
    const imgs = await getLoadedImages();
    const outCanvas = $('rgbaCanvas');
    const { w, h } = getOutputSize();
    outCanvas.width = w;
    outCanvas.height = h;
    try {
      composeToCanvas(imgs, outCanvas);
      setStatus('预览已更新');
    } catch (e) {
      setStatus('更新预览出错：' + e.message);
    }
  }

  function init() {
    channelIds.forEach(bindDropzone);
    bindGlobalControl();
    // initial preview
    updateCanvasPreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
