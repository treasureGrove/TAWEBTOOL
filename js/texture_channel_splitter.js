(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var srcImage = null;
  var channelData = { r: null, g: null, b: null, a: null };

  function initDropZone() {
    var dropZone = $('spDropZone');
    var fileInput = $('spFileInput');

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function () { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        srcImage = img;
        drawPreview(img);
        $('spSplitBtn').disabled = false;
        $('spInfo').textContent = file.name + ' (' + img.width + '×' + img.height + ', ' + formatSize(file.size) + ')';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function drawPreview(img) {
    var canvas = $('spSrcCanvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
  }

  function splitChannels() {
    if (!srcImage) return;
    var w = srcImage.width, h = srcImage.height;
    var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width = w; tmpCanvas.height = h;
    var ctx = tmpCanvas.getContext('2d');
    ctx.drawImage(srcImage, 0, 0);
    var imgData = ctx.getImageData(0, 0, w, h);
    var data = imgData.data;

    var channels = ['r', 'g', 'b', 'a'];
    var mode = $('spGrayMode').value;

    channels.forEach(function (ch, ci) {
      var canvas = $('spCh_' + ch);
      canvas.width = w; canvas.height = h;
      var chCtx = canvas.getContext('2d');
      var chData = chCtx.createImageData(w, h);
      var out = chData.data;

      var hist = new Array(256).fill(0);
      var min = 255, max = 0, sum = 0;

      for (var i = 0; i < data.length; i += 4) {
        var v = data[i + ci];
        hist[v]++;
        if (v < min) min = v;
        if (v > max) max = v;
        sum += v;

        if (mode === 'gray') {
          out[i] = v; out[i+1] = v; out[i+2] = v; out[i+3] = 255;
        } else {
          out[i] = ci === 0 ? v : 0;
          out[i+1] = ci === 1 ? v : 0;
          out[i+2] = ci === 2 ? v : 0;
          out[i+3] = ci === 3 ? v : 255;
        }
      }

      chCtx.putImageData(chData, 0, 0);
      channelData[ch] = canvas;

      // Stats
      var avg = sum / (w * h);
      $('spStats_' + ch).textContent = 'Min: ' + min + ' | Max: ' + max + ' | Avg: ' + avg.toFixed(1);

      // Histogram
      drawHistogram($('spHist_' + ch), hist, ch);
    });

    $('spDlAllBtn').style.display = 'inline-block';
  }

  function drawHistogram(canvas, hist, channel) {
    canvas.width = 256;
    canvas.height = 100;
    var ctx = canvas.getContext('2d');
    var W = 256, H = 100;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    var maxVal = Math.max.apply(null, hist);
    if (maxVal === 0) return;

    var colors = { r: '#ef4444', g: '#22c55e', b: '#3b82f6', a: '#a855f7' };
    ctx.fillStyle = colors[channel] || '#94a3b8';
    ctx.globalAlpha = 0.8;

    for (var i = 0; i < 256; i++) {
      var h = (hist[i] / maxVal) * (H - 4);
      ctx.fillRect(i, H - h, 1, h);
    }
    ctx.globalAlpha = 1;
  }

  function downloadChannel(ch) {
    var canvas = channelData[ch];
    if (!canvas) return;
    var fmt = $('spOutFormat').value;
    var mimeType = fmt === 'png' ? 'image/png' : fmt === 'webp' ? 'image/webp' : 'image/jpeg';
    var ext = fmt;
    var a = document.createElement('a');
    a.href = canvas.toDataURL(mimeType, 0.95);
    a.download = 'channel_' + ch + '.' + ext;
    a.click();
  }

  function downloadAll() {
    ['r', 'g', 'b', 'a'].forEach(function (ch) { downloadChannel(ch); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDropZone();
    $('spSplitBtn').addEventListener('click', splitChannels);
    $('spDlAllBtn').addEventListener('click', downloadAll);

    ['r', 'g', 'b', 'a'].forEach(function (ch) {
      var btn = $('spDlBtn_' + ch);
      if (btn) btn.addEventListener('click', function () { downloadChannel(ch); });
    });
  });
})();
