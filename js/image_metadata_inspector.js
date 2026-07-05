(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var imgData = null;
  var previewCanvas = null;

  function initDropZone() {
    var dropZone = $('miDropZone');
    var fileInput = $('miFileInput');

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

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(2) + ' MB';
  }

  function isPOT(v) {
    return v > 0 && (v & (v - 1)) === 0;
  }

  function gcd(a, b) {
    while (b) { var t = b; b = a % b; a = t; }
    return a;
  }

  function handleFile(file) {
    var fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type || 'unknown',
      lastModified: new Date(file.lastModified).toLocaleString()
    };

    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        fileInfo.width = img.width;
        fileInfo.height = img.height;
        fileInfo.megapixels = ((img.width * img.height) / 1048576).toFixed(2);

        // Draw preview
        previewCanvas = $('miPreviewCanvas');
        previewCanvas.width = img.width;
        previewCanvas.height = img.height;
        previewCanvas.getContext('2d').drawImage(img, 0, 0);

        // Get pixel data
        var ctx = previewCanvas.getContext('2d');
        imgData = ctx.getImageData(0, 0, img.width, img.height);

        // Check if has alpha
        var hasAlpha = false;
        var data = imgData.data;
        for (var i = 3; i < data.length; i += 4) {
          if (data[i] < 255) { hasAlpha = true; break; }
        }
        fileInfo.hasAlpha = hasAlpha;

        // Memory usage
        fileInfo.memoryRaw = img.width * img.height * 4;
        fileInfo.memoryRGB565 = Math.ceil(img.width * img.height * 2);
        fileInfo.memoryDXT1 = Math.ceil(img.width * img.height / 2);
        fileInfo.memoryDXT5 = img.width * img.height;
        fileInfo.memoryASTC4x4 = Math.ceil(img.width * img.height * 0.89);

        renderInfo(fileInfo);
        renderHistogram(imgData);
        initColorPicker(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderInfo(info) {
    var w = info.width, h = info.height;
    var g = gcd(w, h);
    var ratioW = w / g, ratioH = h / g;
    var ratio = ratioW + ':' + ratioH;

    var potW = isPOT(w), potH = isPOT(h);

    var items = [
      { label: '文件名', value: info.name, full: true },
      { label: '文件大小', value: formatSize(info.size) },
      { label: 'MIME类型', value: info.type },
      { label: '宽度', value: w + ' px' + (potW ? ' <span class="mi-pot-badge yes">POT</span>' : ' <span class="mi-pot-badge no">NPOT</span>') },
      { label: '高度', value: h + ' px' + (potH ? ' <span class="mi-pot-badge yes">POT</span>' : ' <span class="mi-pot-badge no">NPOT</span>') },
      { label: '宽高比', value: ratio },
      { label: '总像素', value: info.megapixels + ' MP' },
      { label: 'Alpha通道', value: info.hasAlpha ? '有透明像素' : '完全不透明' },
      { label: '修改时间', value: info.lastModified, full: true },
    ];

    var html = items.map(function (item) {
      return '<div class="mi-info-item' + (item.full ? ' full' : '') + '">' +
        '<div class="label">' + item.label + '</div>' +
        '<div class="value">' + item.value + '</div></div>';
    }).join('');

    $('miInfoGrid').innerHTML = html;

    // Memory estimates
    $('miMemoryGrid').innerHTML = [
      { label: 'RGBA32 (原始)', value: formatSize(info.memoryRaw) },
      { label: 'RGB565', value: formatSize(info.memoryRGB565) },
      { label: 'DXT1 / BC1', value: formatSize(info.memoryDXT1) },
      { label: 'DXT5 / BC3', value: formatSize(info.memoryDXT5) },
      { label: 'ASTC 4×4', value: formatSize(info.memoryASTC4x4) },
      { label: 'ETC2', value: formatSize(Math.ceil(info.width * info.height / 2)) },
    ].map(function (item) {
      return '<div class="mi-info-item"><div class="label">' + item.label + '</div><div class="value">' + item.value + '</div></div>';
    }).join('');

    // Aspect ratio list
    var ratios = ['1:1', '4:3', '3:2', '16:9', '16:10', '21:9', '2:1', '3:1'];
    var ratioHtml = ratios.map(function (r) {
      var parts = r.split(':');
      var match = (parseInt(parts[0]) === ratioW && parseInt(parts[1]) === ratioH);
      return '<span class="mi-ratio-item' + (match ? ' match' : '') + '">' + r + '</span>';
    }).join('');
    $('miRatioList').innerHTML = ratioHtml;
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

  function initColorPicker(img) {
    var canvas = $('miPreviewCanvas');
    var swatch = $('miColorSwatch');
    var colorVals = $('miColorValues');

    canvas.style.cursor = 'crosshair';

    canvas.addEventListener('mousemove', function (e) {
      var rect = canvas.getBoundingClientRect();
      var scaleX = canvas.width / rect.width;
      var scaleY = canvas.height / rect.height;
      var x = Math.floor((e.clientX - rect.left) * scaleX);
      var y = Math.floor((e.clientY - rect.top) * scaleY);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

      var idx = (y * canvas.width + x) * 4;
      var r = imgData.data[idx];
      var g = imgData.data[idx + 1];
      var b = imgData.data[idx + 2];
      var a = imgData.data[idx + 3];

      var hex = '#' + [r,g,b].map(function(v) {
        var h = v.toString(16); return h.length === 1 ? '0' + h : h;
      }).join('');

      swatch.style.background = 'rgba(' + r + ',' + g + ',' + b + ',' + (a/255) + ')';

      var lr = (r/255).toFixed(4), lg = (g/255).toFixed(4), lb = (b/255).toFixed(4);
      colorVals.innerHTML =
        'Pos: ' + x + ', ' + y + '<br>' +
        'Hex: ' + hex.toUpperCase() + '<br>' +
        'RGB: ' + r + ', ' + g + ', ' + b + '<br>' +
        'Alpha: ' + a + ' (' + (a/255*100).toFixed(1) + '%)<br>' +
        'Linear: ' + lr + ', ' + lg + ', ' + lb;
    });

    canvas.addEventListener('mouseleave', function () {
      colorVals.innerHTML = '移动鼠标到图像上拾取颜色';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDropZone();
  });
})();
