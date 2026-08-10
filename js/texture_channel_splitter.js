(function () {
  'use strict';

  var MAX_PIXELS = 67108864;
  var CHANNELS = [
    { key: 'r', index: 0, tint: [255, 0, 0], color: '#e64c59' },
    { key: 'g', index: 1, tint: [0, 255, 0], color: '#29a96b' },
    { key: 'b', index: 2, tint: [0, 0, 255], color: '#4288e8' },
    { key: 'a', index: 3, tint: [170, 95, 255], color: '#9b67dd' }
  ];

  var state = {
    width: 0,
    height: 0,
    pixels: null,
    fileName: '',
    fileSize: 0,
    ready: false,
    busy: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function getMode() {
    var selected = document.querySelector('input[name="spGrayMode"]:checked');
    return selected ? selected.value : 'gray';
  }

  function getAlphaMode() {
    var selected = document.querySelector('input[name="spAlphaMode"]:checked');
    return selected ? selected.value : 'value';
  }

  function setStatus(type, message) {
    var status = $('spStatus');
    status.className = 'sp-status is-' + type;
    $('spStatusText').textContent = message;
  }

  function setBusy(busy) {
    state.busy = busy;
    $('spSplitBtn').disabled = busy || !state.pixels;
    $('spFileInput').disabled = busy;
    if (busy) {
      $('spSplitBtn').querySelector('span').textContent = '正在生成...';
    } else {
      $('spSplitBtn').querySelector('span').textContent = state.ready ? '重新生成通道' : '生成四个通道';
    }
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  }

  function isSupportedFile(file) {
    var name = (file && file.name ? file.name : '').toLowerCase();
    return Boolean(file && (
      /^image\/(png|jpeg|webp|bmp|x-ms-bmp)$/i.test(file.type || '') ||
      /\.(png|jpe?g|webp|bmp|tga|targa)$/i.test(name)
    ));
  }

  function validatePixels(width, height, pixels) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
      throw new Error('图片尺寸无效');
    }
    if (width * height > MAX_PIXELS) {
      throw new Error('图片像素超过 6400 万，浏览器可能无法安全处理');
    }
    if (!pixels || pixels.length !== width * height * 4) {
      throw new Error('像素数据长度异常，文件可能已损坏');
    }
  }

  async function decodeBrowserImage(file) {
    var bitmap = null;
    var objectUrl = '';
    var image = null;

    try {
      if ('createImageBitmap' in window) {
        try {
          bitmap = await createImageBitmap(file, {
            colorSpaceConversion: 'none',
            premultiplyAlpha: 'none'
          });
        } catch (optionError) {
          bitmap = await createImageBitmap(file);
        }
      } else {
        objectUrl = URL.createObjectURL(file);
        image = await new Promise(function (resolve, reject) {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error('浏览器无法解码该图片')); };
          img.src = objectUrl;
        });
      }

      var source = bitmap || image;
      var width = source.width || source.naturalWidth;
      var height = source.height || source.naturalHeight;
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('无法创建图片处理画布');
      context.drawImage(source, 0, 0, width, height);
      var imageData = context.getImageData(0, 0, width, height);
      return { width: width, height: height, data: imageData.data };
    } finally {
      if (bitmap && typeof bitmap.close === 'function') bitmap.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function decodeFile(file) {
    var lowerName = (file.name || '').toLowerCase();
    if (/\.(tga|targa)$/i.test(lowerName)) {
      if (typeof TGADecoder === 'undefined') throw new Error('TGA 解码器未加载');
      return TGADecoder.createImageDataFromFile(file);
    }
    return decodeBrowserImage(file);
  }

  function inspectAlpha(pixels) {
    var min = 255;
    var max = 0;
    var transparent = 0;
    for (var i = 3; i < pixels.length; i += 4) {
      var alpha = pixels[i];
      if (alpha < min) min = alpha;
      if (alpha > max) max = alpha;
      if (alpha < 255) transparent++;
    }
    return {
      min: min,
      max: max,
      transparent: transparent,
      label: transparent ? '有 (' + min + '–' + max + ')' : '无 / 全白'
    };
  }

  function drawSourcePreview() {
    var canvas = $('spSrcCanvas');
    canvas.width = state.width;
    canvas.height = state.height;
    var context = canvas.getContext('2d');
    var imageData = context.createImageData(state.width, state.height);
    imageData.data.set(state.pixels);
    context.putImageData(imageData, 0, 0);
  }

  function updateSourceCard() {
    var alpha = inspectAlpha(state.pixels);
    $('spSourceName').textContent = state.fileName;
    $('spSourceName').title = state.fileName;
    $('spSourceDimensions').textContent = state.width + '×' + state.height;
    $('spSourceSize').textContent = formatSize(state.fileSize);
    $('spSourceAlpha').textContent = alpha.label;
    $('spDropZone').hidden = true;
    $('spSrcPreview').hidden = false;
    drawSourcePreview();
  }

  async function handleFile(file) {
    if (!isSupportedFile(file)) {
      setStatus('error', '不支持此格式，请选择 PNG / JPG / WEBP / BMP / TGA');
      return;
    }

    setBusy(true);
    setStatus('loading', '正在读取 ' + file.name + '...');

    try {
      var decoded = await decodeFile(file);
      validatePixels(decoded.width, decoded.height, decoded.data);

      state.width = decoded.width;
      state.height = decoded.height;
      state.pixels = decoded.data instanceof Uint8ClampedArray
        ? decoded.data
        : new Uint8ClampedArray(decoded.data);
      state.fileName = file.name;
      state.fileSize = file.size;
      state.ready = false;

      updateSourceCard();
      resetOutputs();
      setBusy(false);
      await splitChannels();
    } catch (error) {
      console.error('贴图读取失败:', error);
      setBusy(false);
      setStatus('error', error && error.message ? error.message : '图片读取失败');
    }
  }

  function createChannelImageData(context, channel, mode, alphaMode) {
    var imageData = context.createImageData(state.width, state.height);
    var output = imageData.data;
    var source = state.pixels;
    var histogram = new Uint32Array(256);
    var min = 255;
    var max = 0;
    var sum = 0;
    var active = 0;
    var tint = channel.tint;

    for (var i = 0; i < source.length; i += 4) {
      var value = source[i + channel.index];
      histogram[value]++;
      if (value < min) min = value;
      if (value > max) max = value;
      if (value > 0) active++;
      sum += value;

      if (channel.key === 'a' && alphaMode === 'opacity') {
        output[i] = 255;
        output[i + 1] = 255;
        output[i + 2] = 255;
        output[i + 3] = value;
      } else if (mode === 'color') {
        output[i] = Math.round(value * tint[0] / 255);
        output[i + 1] = Math.round(value * tint[1] / 255);
        output[i + 2] = Math.round(value * tint[2] / 255);
        output[i + 3] = 255;
      } else {
        output[i] = value;
        output[i + 1] = value;
        output[i + 2] = value;
        output[i + 3] = 255;
      }
    }

    return {
      imageData: imageData,
      histogram: histogram,
      min: min,
      max: max,
      average: sum / (state.width * state.height),
      active: active / (state.width * state.height)
    };
  }

  async function splitChannels() {
    if (!state.pixels || state.busy) return;

    setBusy(true);
    setStatus('loading', '正在计算四个通道与数值分布...');
    await nextFrame();

    try {
      var mode = getMode();
      var alphaMode = getAlphaMode();
      CHANNELS.forEach(function (channel) {
        var canvas = $('spCh_' + channel.key);
        canvas.width = state.width;
        canvas.height = state.height;
        var context = canvas.getContext('2d');
        var result = createChannelImageData(context, channel, mode, alphaMode);
        context.putImageData(result.imageData, 0, 0);

        $('spMin_' + channel.key).textContent = result.min;
        $('spMax_' + channel.key).textContent = result.max;
        $('spAvg_' + channel.key).textContent = result.average.toFixed(1);
        $('spActive_' + channel.key).textContent = (result.active * 100).toFixed(1) + '%';
        $('spCard_' + channel.key).classList.add('is-ready');
        $('spDlBtn_' + channel.key).disabled = false;
        drawHistogram($('spHist_' + channel.key), result.histogram, channel.color);
      });

      state.ready = true;
      $('spDlAllBtn').disabled = false;
      setStatus(
        'success',
        '已完成 · ' + state.width + '×' + state.height + ' · ' +
        (mode === 'gray' ? '灰度显示' : '通道着色') + ' · Alpha ' +
        (alphaMode === 'opacity' ? '透明度预览' : '数值预览')
      );
    } catch (error) {
      console.error('通道分离失败:', error);
      state.ready = false;
      setStatus('error', error && error.message ? error.message : '通道生成失败');
    } finally {
      setBusy(false);
    }
  }

  function drawHistogram(canvas, histogram, color) {
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var width = Math.max(256, Math.round((canvas.clientWidth || 320) * ratio));
    var height = Math.max(48, Math.round((canvas.clientHeight || 49) * ratio));
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');

    var gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#131b19');
    gradient.addColorStop(1, '#1b2623');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = 'rgba(255,255,255,.055)';
    context.lineWidth = 1;
    for (var grid = 1; grid < 4; grid++) {
      var gridX = Math.round(width * grid / 4) + .5;
      context.beginPath();
      context.moveTo(gridX, 0);
      context.lineTo(gridX, height);
      context.stroke();
    }

    var maxCount = 0;
    for (var i = 0; i < 256; i++) {
      if (histogram[i] > maxCount) maxCount = histogram[i];
    }
    if (!maxCount) return;

    var barWidth = width / 256;
    var logMax = Math.log1p(maxCount);
    context.fillStyle = color;
    context.globalAlpha = .9;
    for (var value = 0; value < 256; value++) {
      var normalized = Math.log1p(histogram[value]) / logMax;
      var barHeight = Math.max(histogram[value] ? 1 : 0, normalized * (height - 5));
      context.fillRect(value * barWidth, height - barHeight, Math.max(1, barWidth), barHeight);
    }
    context.globalAlpha = 1;
  }

  function drawEmptyHistogram(canvas) {
    var width = 512;
    var height = 80;
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    var gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#131b19');
    gradient.addColorStop(1, '#1b2623');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(255,255,255,.055)';
    for (var i = 1; i < 4; i++) {
      var x = Math.round(width * i / 4) + .5;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  }

  function resetOutputs() {
    state.ready = false;
    $('spDlAllBtn').disabled = true;
    CHANNELS.forEach(function (channel) {
      var canvas = $('spCh_' + channel.key);
      canvas.width = 1;
      canvas.height = 1;
      canvas.getContext('2d').clearRect(0, 0, 1, 1);
      $('spCard_' + channel.key).classList.remove('is-ready');
      $('spDlBtn_' + channel.key).disabled = true;
      $('spMin_' + channel.key).textContent = '—';
      $('spMax_' + channel.key).textContent = '—';
      $('spAvg_' + channel.key).textContent = '—';
      $('spActive_' + channel.key).textContent = '—';
      drawEmptyHistogram($('spHist_' + channel.key));
    });
  }

  function resetAll() {
    state.width = 0;
    state.height = 0;
    state.pixels = null;
    state.fileName = '';
    state.fileSize = 0;
    state.ready = false;
    $('spSrcPreview').hidden = true;
    $('spDropZone').hidden = false;
    $('spFileInput').value = '';
    resetOutputs();
    setBusy(false);
    setStatus('idle', '等待选择源贴图');
  }

  function formatSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function safeBaseName(fileName) {
    var base = (fileName || 'texture').replace(/\.[^.]+$/, '');
    base = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
    return base || 'texture';
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('浏览器未能生成导出文件'));
      }, mimeType, quality);
    });
  }

  function createGrayscaleExportCanvas(channelIndex) {
    var canvas = document.createElement('canvas');
    canvas.width = state.width;
    canvas.height = state.height;
    var context = canvas.getContext('2d');
    var imageData = context.createImageData(state.width, state.height);
    var output = imageData.data;

    for (var i = 0; i < state.pixels.length; i += 4) {
      var value = state.pixels[i + channelIndex];
      output[i] = value;
      output[i + 1] = value;
      output[i + 2] = value;
      output[i + 3] = 255;
    }
    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  async function exportChannel(channelKey) {
    if (!state.ready) return null;
    var channel = CHANNELS.find(function (item) { return item.key === channelKey; });
    if (!channel) throw new Error('未知通道：' + channelKey);
    var canvas = createGrayscaleExportCanvas(channel.index);
    var format = $('spOutFormat').value;
    var blob;

    if (format === 'tga') {
      if (typeof TGAEncoder === 'undefined') throw new Error('TGA 编码器未加载');
      blob = TGAEncoder.encodeFromCanvas(canvas);
    } else {
      var mimeTypes = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
      blob = await canvasToBlob(canvas, mimeTypes[format], .95);
    }

    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = safeBaseName(state.fileName) + '_' + channelKey.toUpperCase() + '.' + format;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    return blob;
  }

  async function downloadChannel(channelKey) {
    try {
      await exportChannel(channelKey);
      setStatus('success', channelKey.toUpperCase() + ' 通道已导出');
    } catch (error) {
      console.error('通道导出失败:', error);
      setStatus('error', error && error.message ? error.message : '导出失败');
    }
  }

  async function downloadAll() {
    if (!state.ready || state.busy) return;
    setStatus('loading', '正在准备四个通道文件...');
    try {
      for (var i = 0; i < CHANNELS.length; i++) {
        await exportChannel(CHANNELS[i].key);
        await new Promise(function (resolve) { setTimeout(resolve, 120); });
      }
      setStatus('success', '四个通道已全部导出');
    } catch (error) {
      console.error('批量导出失败:', error);
      setStatus('error', error && error.message ? error.message : '批量导出失败');
    }
  }

  function bindEvents() {
    var dropZone = $('spDropZone');
    var fileInput = $('spFileInput');

    dropZone.addEventListener('dragover', function (event) {
      event.preventDefault();
      if (!state.busy) dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', function () {
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', function (event) {
      event.preventDefault();
      dropZone.classList.remove('drag-over');
      if (!state.busy && event.dataTransfer.files.length) handleFile(event.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
      fileInput.value = '';
    });

    window.addEventListener('dragover', function (event) { event.preventDefault(); });
    window.addEventListener('drop', function (event) { event.preventDefault(); });
    $('spResetBtn').addEventListener('click', resetAll);
    $('spSplitBtn').addEventListener('click', splitChannels);
    $('spDlAllBtn').addEventListener('click', downloadAll);

    document.querySelectorAll('input[name="spGrayMode"], input[name="spAlphaMode"]').forEach(function (input) {
      input.addEventListener('change', function () {
        if (state.pixels && !state.busy) splitChannels();
      });
    });

    CHANNELS.forEach(function (channel) {
      $('spDlBtn_' + channel.key).addEventListener('click', function () {
        downloadChannel(channel.key);
      });
    });
  }

  function init() {
    bindEvents();
    resetOutputs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
