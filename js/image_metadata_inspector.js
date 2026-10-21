(function () {
  'use strict';
  var budget = window.TextureBudget;
  var entries = [], selectedId = null, imgData = null, working = false;
  var batchGeneration = 0, previewGeneration = 0, nextId = 0;
  var MAX_FILES = 50, MAX_BYTES = 32 * 1048576, MAX_PIXELS = 16777216;
  function $(id) { return document.getElementById(id); }
  function node(tag, text, className) {
    var element = document.createElement(tag);
    if (text != null) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KiB';
    return (bytes / 1048576).toFixed(2) + ' MiB';
  }
  function isPOT(value) { return value > 0 && (value & (value - 1)) === 0; }
  function gcd(a, b) { while (b) { var t = b; b = a % b; a = t; } return a; }
  function card(label, value, className) {
    var element = node('div', null, 'mi-info-item' + (className ? ' ' + className : ''));
    element.append(node('div', label, 'label'), node('div', value, 'value'));
    return element;
  }
  function status(message, error) {
    $('miStatus').textContent = message;
    $('miStatus').classList.toggle('error', !!error);
  }
  function settings() { return { format: $('miFormat').value, mips: $('miMipmaps').checked }; }
  function readyEntries() { return entries.filter(function (entry) { return entry.ready && !entry.error; }); }
  function updateControls() {
    $('miFileInput').disabled = working;
    $('miDemo').disabled = working || entries.length >= MAX_FILES;
    $('miExport').disabled = working || !readyEntries().length;
    $('miClear').disabled = !entries.length;
    $('miDropZone').setAttribute('aria-disabled', String(working));
  }
  function renderBatch() {
    var config = settings(), good = readyEntries(), total = 0, disk = 0;
    good.forEach(function (entry) {
      total += budget.estimate(entry.width, entry.height, config.format, config.mips).bytes;
      disk += entry.size;
    });
    var limit = $('miBudget').valueAsNumber;
    var validLimit = Number.isFinite(limit) && limit > 0 && limit <= 65536 && $('miBudget').validity.valid;
    var remaining = limit * 1048576 - total;
    $('miSummary').replaceChildren(
      card('可用贴图', good.length + ' 张'), card('源文件总大小', formatSize(disk)),
      card('预计显存 · ' + budget.formats[config.format].label, formatSize(total)),
      card(validLimit ? (remaining < 0 ? '超出预算' : '预算剩余') : '预算设置',
        validLimit ? formatSize(Math.abs(remaining)) : '请输入有效正数', validLimit && remaining < 0 ? 'over' : '')
    );
    $('miBudget').setAttribute('aria-invalid', String(!validLimit));
    var sorted = entries.slice().sort(function (a, b) {
      if ($('miSort').value === 'name') return a.name.localeCompare(b.name, 'zh-CN');
      var aBytes = a.ready && !a.error ? budget.estimate(a.width, a.height, config.format, config.mips).bytes : -1;
      var bBytes = b.ready && !b.error ? budget.estimate(b.width, b.height, config.format, config.mips).bytes : -1;
      return bBytes - aBytes || a.id - b.id;
    });
    var fragment = document.createDocumentFragment();
    sorted.forEach(function (entry) {
      var row = node('tr'), nameCell = node('td');
      row.setAttribute('aria-selected', String(entry.id === selectedId));
      if (entry.ready && !entry.error) {
        var button = node('button', entry.name);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(entry.id === selectedId));
        button.addEventListener('click', function () { selectEntry(entry); });
        nameCell.append(button);
      } else nameCell.textContent = entry.name;
      row.append(nameCell);
      row.append(node('td', entry.width ? entry.width + ' × ' + entry.height : '—'));
      row.append(node('td', formatSize(entry.size)));
      row.append(node('td', entry.ready && !entry.error ? formatSize(budget.estimate(entry.width, entry.height, config.format, config.mips).bytes) : '—'));
      var notes = entry.error ? [entry.error] : (entry.ready ? budget.warnings(entry, config.format) : ['读取中…']);
      if (entry.ready && !entry.error) notes.unshift(entry.hasAlpha ? '含透明像素' : '不透明');
      row.append(node('td', notes.join('；'), entry.error || notes.length > 1 ? 'mi-warning' : ''));
      fragment.append(row);
    });
    if (!entries.length) {
      var empty = node('tr'), emptyCell = node('td', '拖入一组贴图，或载入示例试试看。');
      emptyCell.colSpan = 5; empty.append(emptyCell); fragment.append(empty);
    }
    $('miBatchRows').replaceChildren(fragment);
    var selected = entries.find(function (entry) { return entry.id === selectedId; });
    if (selected && selected.ready && !selected.error) renderMemory(selected);
    updateControls();
  }
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var image = new Image(), url = URL.createObjectURL(file);
      var timer = setTimeout(function () { image.onload = image.onerror = null; image.src = ''; URL.revokeObjectURL(url); reject(new Error('图片解码超时，请尝试转换为 PNG / JPG')); }, 15000);
      image.onload = function () {
        clearTimeout(timer);
        resolve({ image: image, close: function () { URL.revokeObjectURL(url); image.src = ''; } });
      };
      image.onerror = function () { clearTimeout(timer); URL.revokeObjectURL(url); reject(new Error('图片无法解码，可能已损坏或浏览器不支持')); };
      image.src = url;
    });
  }
  async function readPixels(file) {
    if (file.size > MAX_BYTES) throw new Error('超过单张 32 MiB 限制');
    if (file.type ? !/^image\/(png|jpeg|webp|bmp|gif|avif|x-ms-bmp)$/i.test(file.type) : !/\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(file.name)) throw new Error('不支持此格式，请先转为 PNG / JPG / WebP');
    var loaded = await loadImage(file), canvas = document.createElement('canvas');
    try {
      var width = loaded.image.naturalWidth, height = loaded.image.naturalHeight;
      if (!width || !height || width * height > MAX_PIXELS || width > 16384 || height > 16384) throw new Error('图片过大：单张像素总量最多 16,777,216，单边最多 16,384');
      canvas.width = width; canvas.height = height;
      var context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
      context.drawImage(loaded.image, 0, 0);
      var pixels = context.getImageData(0, 0, width, height);
      var hasAlpha = false, hasPartialAlpha = false;
      for (var i = 3; i < pixels.data.length; i += 4) {
        if (pixels.data[i] < 255) hasAlpha = true;
        if (pixels.data[i] > 0 && pixels.data[i] < 255) { hasPartialAlpha = true; break; }
      }
      return { width: width, height: height, hasAlpha: hasAlpha, hasPartialAlpha: hasPartialAlpha, pixels: pixels };
    } finally { loaded.close(); canvas.width = canvas.height = 1; }
  }
  async function addFiles(files) {
    if (working) { status('当前一组正在读取，请完成后再追加。'); return; }
    if (!files.length) { status('请选择或拖入图片文件。'); return; }
    var available = MAX_FILES - entries.length;
    var selectedFiles = Array.from(files).slice(0, available);
    if (!selectedFiles.length) { status('当前组已达 50 张，请清空后开始新的一组。', true); return; }
    var token = ++batchGeneration, skipped = files.length - selectedFiles.length;
    var pending = selectedFiles.map(function (file) { return { id: ++nextId, name: file.name, size: file.size, file: file }; });
    entries.push.apply(entries, pending); working = true; renderBatch();
    for (var i = 0; i < pending.length; i++) {
      if (token !== batchGeneration) return;
      status('正在读取 ' + (i + 1) + ' / ' + pending.length + '：' + pending[i].name);
      try {
        var result = await readPixels(pending[i].file);
        if (token !== batchGeneration) return;
        Object.assign(pending[i], { width: result.width, height: result.height, hasAlpha: result.hasAlpha, hasPartialAlpha: result.hasPartialAlpha, ready: true });
        result = null;
      } catch (error) {
        if (token !== batchGeneration) return;
        pending[i].error = error.message; pending[i].file = null;
      }
      renderBatch();
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    if (token !== batchGeneration) return;
    working = false; renderBatch();
    if (selectedId === null && readyEntries().length) await selectEntry(readyEntries()[0]);
    if (token !== batchGeneration) return;
    var failed = entries.filter(function (entry) { return entry.error; }).length;
    status('检查完成：' + readyEntries().length + ' 张可用' + (failed ? '，' + failed + ' 张未计入预算（见列表原因）' : '') + (skipped ? '；超出组上限的 ' + skipped + ' 张未添加' : '') + '。可切换格式、调整预算或导出 CSV。', failed > 0 || skipped > 0);
  }
  async function selectEntry(entry) {
    var token = ++previewGeneration;
    selectedId = entry.id; imgData = null;
    $('miPreviewCanvas').width = 256;
    $('miHistCanvas').width = 256;
    $('miPreviewTitle').textContent = '预览 · ' + entry.name;
    $('miInfoGrid').replaceChildren(card('状态', '正在读取预览…', 'full'));
    $('miColorValues').textContent = '移动鼠标或触摸图像拾取颜色';
    renderBatch();
    try {
      var result = await readPixels(entry.file);
      if (token !== previewGeneration || !entries.includes(entry)) return;
      imgData = result.pixels;
      var canvas = $('miPreviewCanvas');
      canvas.width = result.width; canvas.height = result.height;
      canvas.getContext('2d').putImageData(imgData, 0, 0);
      renderInfo(entry); renderHistogram(imgData);
    } catch (error) {
      if (token !== previewGeneration) return;
      $('miInfoGrid').replaceChildren(card('预览失败', error.message, 'full'));
      status('预览失败：' + error.message, true);
    }
  }
  function renderMemory(info) {
    var config = settings(), fragment = document.createDocumentFragment();
    Object.keys(budget.formats).forEach(function (key) {
      fragment.append(card(budget.formats[key].label, formatSize(budget.estimate(info.width, info.height, key, config.mips).bytes), key === config.format ? 'mi-memory-selected' : ''));
    });
    $('miMemoryGrid').replaceChildren(fragment);
    $('miMemoryNote').textContent = config.mips ? '包含完整 Mipmap 链，共 ' + budget.estimate(info.width, info.height, config.format, true).levels + ' 层。高亮项为当前预算格式。' : '仅计顶层，不含 Mipmap。高亮项为当前预算格式。';
  }
  function renderInfo(info) {
    var divisor = gcd(info.width, info.height), ratio = info.width / divisor + ':' + info.height / divisor;
    var fragment = document.createDocumentFragment();
    [ ['文件名', info.name, 'full'], ['文件大小', formatSize(info.size)], ['MIME 类型', info.file.type || '浏览器未提供'],
      ['宽度', info.width + ' px · ' + (isPOT(info.width) ? 'POT' : 'NPOT')], ['高度', info.height + ' px · ' + (isPOT(info.height) ? 'POT' : 'NPOT')],
      ['宽高比', ratio], ['总像素', (info.width * info.height / 1000000).toFixed(2) + ' MP'], ['透明像素', info.hasAlpha ? (info.hasPartialAlpha ? '含半透明' : '含全透明像素') : '无'],
      ['文件修改时间', new Date(info.file.lastModified).toLocaleString(), 'full']
    ].forEach(function (item) { fragment.append(card(item[0], item[1], item[2])); });
    $('miInfoGrid').replaceChildren(fragment);
    $('miRatioList').replaceChildren.apply($('miRatioList'), ['1:1', '4:3', '3:2', '16:9', '16:10', '21:9', '2:1', '3:1'].map(function (value) { return node('span', value, 'mi-ratio-item' + (value === ratio ? ' match' : '')); }));
    renderMemory(info);
  }
  function renderHistogram(imageData) {
    var canvas = $('miHistCanvas');
    canvas.width = 256;
    canvas.height = 120;
    var ctx = canvas.getContext('2d');
    var W = 256, H = 120;
    var data = imageData.data;

    var histR = new Array(256).fill(0);
    var histG = new Array(256).fill(0);
    var histB = new Array(256).fill(0);
    var histL = new Array(256).fill(0);

    for (var i = 0; i < data.length; i += 4) {
      histR[data[i]]++;
      histG[data[i+1]]++;
      histB[data[i+2]]++;
      var lum = Math.round(0.2126 * data[i] + 0.7152 * data[i+1] + 0.0722 * data[i+2]);
      histL[Math.min(255, lum)]++;
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    var maxVal = 0;
    for (var i = 0; i < 256; i++) {
      maxVal = Math.max(maxVal, histL[i], histR[i], histG[i], histB[i]);
    }
    if (maxVal === 0) return;

    function drawChannel(hist, color) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var i = 0; i < 256; i++) {
        var h = (hist[i] / maxVal) * (H - 4);
        ctx.lineTo(i, H - h);
      }
      ctx.lineTo(255, H);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawChannel(histR, '#ef4444');
    drawChannel(histG, '#22c55e');
    drawChannel(histB, '#3b82f6');
    drawChannel(histL, '#e2e8f0');
  }

  function pickColor(event) {
    if (!imgData) return;
    var canvas = $('miPreviewCanvas'), rect = canvas.getBoundingClientRect();
    var x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width);
    var y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    var index = (y * canvas.width + x) * 4;
    var r = imgData.data[index], g = imgData.data[index + 1], b = imgData.data[index + 2], a = imgData.data[index + 3];
    var hex = '#' + [r, g, b].map(function (value) { return value.toString(16).padStart(2, '0'); }).join('').toUpperCase();
    $('miColorSwatch').style.background = 'rgba(' + [r, g, b, a / 255].join(',') + ')';
    $('miColorValues').textContent = 'Pos: ' + x + ', ' + y + '\nHex: ' + hex + '\nRGB: ' + [r, g, b].join(', ') + '\nAlpha: ' + a + ' (' + (a / 255 * 100).toFixed(1) + '%)\nLinear sRGB: ' + [r, g, b].map(function (value) { return budget.srgbToLinear(value).toFixed(4); }).join(', ') + '\n（画布 sRGB 像素按传递函数解码）';
  }
  function clearBatch() {
    batchGeneration++; previewGeneration++; entries = []; selectedId = null; imgData = null; working = false;
    $('miFileInput').value = '';
    $('miPreviewCanvas').width = $('miHistCanvas').width = 256;
    $('miPreviewTitle').textContent = '预览（鼠标或触摸取色）';
    $('miInfoGrid').replaceChildren(card('提示', '请添加贴图以查看详细信息', 'full'));
    $('miMemoryGrid').replaceChildren(card('提示', '请添加贴图以比较显存', 'full'));
    $('miRatioList').replaceChildren();
    $('miColorValues').textContent = '移动鼠标或触摸图像拾取颜色';
    $('miColorSwatch').style.background = '#000';
    renderBatch(); status('已清空，可添加新的一组贴图。');
  }
  async function demo() {
    var token = batchGeneration;
    $('miDemo').disabled = true;
    try {
      var files = [];
      for (var sample of [{ name: 'albedo-1024.png', width: 1024, height: 1024, color: '#808080' }, { name: 'normal-512.png', width: 512, height: 512, color: '#8080ff' }, { name: 'ui-alpha-65x33.png', width: 65, height: 33, color: 'rgba(38,168,132,0.5)' }]) {
        var canvas = document.createElement('canvas'); canvas.width = sample.width; canvas.height = sample.height;
        var context = canvas.getContext('2d'); context.fillStyle = sample.color; context.fillRect(0, 0, sample.width, sample.height);
        var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
        if (!blob) throw new Error('浏览器无法创建示例图片');
        files.push(new File([blob], sample.name, { type: 'image/png' }));
        canvas.width = canvas.height = 1;
      }
      if (token === batchGeneration) await addFiles(files);
    } catch (error) { status(error.message, true); }
    finally { updateControls(); }
  }
  function init() {
    Object.keys(budget.formats).forEach(function (key) { var option = node('option', budget.formats[key].label); option.value = key; $('miFormat').append(option); });
    $('miFormat').value = 'bc7';
    ['miFormat', 'miMipmaps', 'miSort'].forEach(function (id) { $(id).addEventListener('change', renderBatch); });
    $('miBudget').addEventListener('input', renderBatch);
    var zone = $('miDropZone'), input = $('miFileInput');
    zone.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!working) input.click(); } });
    zone.addEventListener('dragover', function (event) { event.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function () { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function (event) { event.preventDefault(); zone.classList.remove('drag-over'); addFiles(event.dataTransfer.files); });
    input.addEventListener('change', function () { var files = Array.from(input.files); input.value = ''; addFiles(files); });
    $('miClear').addEventListener('click', clearBatch);
    $('miDemo').addEventListener('click', demo);
    $('miExport').addEventListener('click', function () {
      var config = settings();
      var blob = new Blob([budget.toCSV(entries, config.format, config.mips)], { type: 'text/csv;charset=utf-8' });
      var url = URL.createObjectURL(blob), link = node('a');
      link.href = url; link.download = 'texture-budget.csv'; document.body.append(link); link.click(); link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      status('CSV 已导出，包含当前格式、Mipmap 设置、字节数及逐图检查结果。');
    });
    $('miPreviewCanvas').style.cursor = 'crosshair';
    $('miPreviewCanvas').addEventListener('pointermove', pickColor);
    $('miPreviewCanvas').addEventListener('pointerdown', pickColor);
    renderBatch();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
