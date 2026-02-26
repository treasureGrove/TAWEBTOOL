(function () {
  function $(id) { return document.getElementById(id); }

  const channelIds = ['r', 'g', 'b', 'a'];

  function setStatus(msg) {
    $('rgbaStatus').textContent = msg;
  }

  function readFileAsImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function setDropzonePreview(channel, imgSrc) {
    const dropzone = $(`${channel}Drop`);
    if (!imgSrc) {
      dropzone.style.backgroundImage = 'none';
      dropzone.classList.remove('has-image');
      return;
    }
    dropzone.style.backgroundImage = `url(${imgSrc})`;
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

  function sampleGray(src, u, v, wrapMode) {
    const uu = wrapUV(u, wrapMode);
    const vv = wrapUV(v, wrapMode);
    const x = Math.min(src.width - 1, Math.max(0, Math.floor(uu * (src.width - 1))));
    const y = Math.min(src.height - 1, Math.max(0, Math.floor(vv * (src.height - 1))));
    const idx = (y * src.width + x) * 4;
    return src.data[idx];
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

    readFileAsImage(file).then((img) => {
      setDropzonePreview(channel, img.src);
      setStatus(`已加载 ${channel.toUpperCase()} 通道：${file.name}`);
    }).catch(() => {
      setDropzonePreview(channel, null);
      setStatus(`加载 ${channel.toUpperCase()} 通道失败，请检查图片格式。`);
    });
  }

  function bindDropzone(channel) {
    const input = $(`${channel}Img`);
    const dropzone = $(`${channel}Drop`);

    input.addEventListener('change', () => updatePreviewByInput(channel));

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
    setStatus('正在合成...');
    const imgs = await getLoadedImages();
    if (!imgs.r || !imgs.g || !imgs.b) {
      setStatus('请至少上传 R/G/B 三张灰度贴图。');
      return;
    }

    const { w, h } = getOutputSize();
    const outCanvas = $('rgbaCanvas');
    const outCtx = outCanvas.getContext('2d');
    outCanvas.width = w;
    outCanvas.height = h;

    const channels = {
      r: { src: readSourceData(imgs.r), tx: parseFloat($('rTileX').value) || 1, ty: parseFloat($('rTileY').value) || 1, wrap: $('rWrap').value },
      g: { src: readSourceData(imgs.g), tx: parseFloat($('gTileX').value) || 1, ty: parseFloat($('gTileY').value) || 1, wrap: $('gWrap').value },
      b: { src: readSourceData(imgs.b), tx: parseFloat($('bTileX').value) || 1, ty: parseFloat($('bTileY').value) || 1, wrap: $('bWrap').value },
      a: imgs.a ? { src: readSourceData(imgs.a), tx: parseFloat($('aTileX').value) || 1, ty: parseFloat($('aTileY').value) || 1, wrap: $('aWrap').value } : null
    };

    const out = outCtx.createImageData(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const u = x / Math.max(1, w - 1);
        const v = y / Math.max(1, h - 1);
        out.data[i] = sampleGray(channels.r.src, u * channels.r.tx, v * channels.r.ty, channels.r.wrap);
        out.data[i + 1] = sampleGray(channels.g.src, u * channels.g.tx, v * channels.g.ty, channels.g.wrap);
        out.data[i + 2] = sampleGray(channels.b.src, u * channels.b.tx, v * channels.b.ty, channels.b.wrap);
        out.data[i + 3] = channels.a ? sampleGray(channels.a.src, u * channels.a.tx, v * channels.a.ty, channels.a.wrap) : 255;
      }
    }
    outCtx.putImageData(out, 0, 0);

    const format = $('rgbaFormat').value;
    const quality = Math.max(0.1, Math.min(1, parseFloat($('rgbaQuality').value) || 1));
    const mime = format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const fileName = `combined_rgba_${w}x${h}.${format}`;

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

  function bindGlobalControl() {
    $('rgbaPreset').addEventListener('change', (e) => {
      if (e.target.value === 'custom') return;
      const size = parseInt(e.target.value, 10);
      $('outSize').value = size;
    });

    $('rgbaQuality').addEventListener('input', (e) => {
      $('rgbaQualityNumber').value = e.target.value;
    });

    $('rgbaQualityNumber').addEventListener('input', (e) => {
      const v = Math.max(0.1, Math.min(1, parseFloat(e.target.value) || 1));
      $('rgbaQuality').value = v;
      $('rgbaQualityNumber').value = v;
    });

    $('mergeRGBA').addEventListener('click', mergeAndDownload);
    document.body.addEventListener('dragover', (e) => e.preventDefault());
    document.body.addEventListener('drop', (e) => e.preventDefault());
  }

  function init() {
    channelIds.forEach(bindDropzone);
    bindGlobalControl();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
