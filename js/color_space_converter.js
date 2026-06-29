(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // ── Color math utilities ──
  function srgbToLinear(c) {
    c = c / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function linearToSrgb(c) {
    c = Math.max(0, Math.min(1, c));
    return c <= 0.0031308 ? c * 12.92 * 255 : (1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
  }

  function gammaEncode(c, gamma) {
    return Math.pow(Math.max(0, Math.min(1, c)), 1 / gamma) * 255;
  }

  function gammaDecode(c, gamma) {
    return Math.pow(c / 255, gamma);
  }

  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.slice(0, 2), 16);
    var g = parseInt(hex.slice(2, 4), 16);
    var b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
      var h = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }

  function luminance(r, g, b) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // ── Draw transfer curve chart ──
  function drawCurveChart(canvas) {
    var ctx = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var pad = 40;
    var pw = W - pad * 2, ph = H - pad * 2;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var x = pad + (pw / 4) * i;
      var y = pad + (ph / 4) * i;
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, pad + ph); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(pad + pw, y); ctx.stroke();
    }

    // Diagonal reference
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, pad + ph);
    ctx.lineTo(pad + pw, pad);
    ctx.stroke();
    ctx.setLineDash([]);

    // Curves
    var curves = [
      { name: 'Linear', color: '#94a3b8', fn: function (v) { return v; } },
      { name: 'sRGB', color: '#22d3ee', fn: function (v) { return linearToSrgb(v * 255) / 255; } },
      { name: 'Gamma 2.2', color: '#f472b6', fn: function (v) { return Math.pow(v, 1/2.2); } },
      { name: 'Gamma 1.8', color: '#a78bfa', fn: function (v) { return Math.pow(v, 1/1.8); } }
    ];

    curves.forEach(function (curve) {
      ctx.strokeStyle = curve.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var i = 0; i <= 200; i++) {
        var t = i / 200;
        var x = pad + t * pw;
        var y = pad + (1 - curve.fn(t)) * ph;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // Axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Input', pad + pw / 2, H - 8);
    ctx.save();
    ctx.translate(12, pad + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Output', 0, 0);
    ctx.restore();

    // Tick labels
    for (var i = 0; i <= 4; i++) {
      ctx.fillText((i / 4).toFixed(2), pad + (pw / 4) * i, pad + ph + 16);
      ctx.fillText((1 - i / 4).toFixed(2), pad - 20, pad + (ph / 4) * i + 4);
    }

    return curves;
  }

  // ── Init manual converter ──
  function initManualConverter() {
    var hexInput = $('csHexInput');
    var rInput = $('csR'), gInput = $('csG'), bInput = $('csB');
    var preview = $('csColorPreview');
    var resultBox = $('csManualResults');

    function update() {
      var r, g, b;
      if (hexInput.value && /^#?[0-9a-f]{3,6}$/i.test(hexInput.value)) {
        var rgb = hexToRgb(hexInput.value);
        r = rgb[0]; g = rgb[1]; b = rgb[2];
        rInput.value = r; gInput.value = g; bInput.value = b;
      } else {
        r = parseInt(rInput.value) || 0;
        g = parseInt(gInput.value) || 0;
        b = parseInt(bInput.value) || 0;
      }
      r = Math.max(0, Math.min(255, r));
      g = Math.max(0, Math.min(255, g));
      b = Math.max(0, Math.min(255, b));

      var hex = rgbToHex(r, g, b);
      preview.style.background = hex;

      var lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
      var lum = luminance(lr, lg, lb);

      resultBox.innerHTML = [
        '<div class="cs-result-item"><div class="label">sRGB (0-255)</div><div class="value">' + r + ', ' + g + ', ' + b + '</div></div>',
        '<div class="cs-result-item"><div class="label">Hex</div><div class="value">' + hex.toUpperCase() + '</div></div>',
        '<div class="cs-result-item"><div class="label">Linear (0-1)</div><div class="value">' + lr.toFixed(4) + ', ' + lg.toFixed(4) + ', ' + lb.toFixed(4) + '</div></div>',
        '<div class="cs-result-item"><div class="label">Linear (0-255)</div><div class="value">' + Math.round(lr*255) + ', ' + Math.round(lg*255) + ', ' + Math.round(lb*255) + '</div></div>',
        '<div class="cs-result-item"><div class="label">Luminance (Linear)</div><div class="value">' + lum.toFixed(4) + '</div></div>',
        '<div class="cs-result-item"><div class="label">Gamma 2.2</div><div class="value">' + gammaEncode(lr, 2.2).toFixed(1) + ', ' + gammaEncode(lg, 2.2).toFixed(1) + ', ' + gammaEncode(lb, 2.2).toFixed(1) + '</div></div>',
        '<div class="cs-result-item"><div class="label">Normalized sRGB (0-1)</div><div class="value">' + (r/255).toFixed(4) + ', ' + (g/255).toFixed(4) + ', ' + (b/255).toFixed(4) + '</div></div>',
        '<div class="cs-result-item"><div class="label">HSL</div><div class="value">' + rgbToHsl(r, g, b) + '</div></div>',
      ].join('');
    }

    hexInput.addEventListener('input', update);
    [rInput, gInput, bInput].forEach(function (el) { el.addEventListener('input', update); });
    update();
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return Math.round(h * 360) + '°, ' + Math.round(s * 100) + '%, ' + Math.round(l * 100) + '%';
  }

  // ── Init curve chart ──
  function initCurveChart() {
    var canvas = $('csCurveCanvas');
    canvas.width = 480;
    canvas.height = 320;
    var curves = drawCurveChart(canvas);

    var legend = $('csCurveLegend');
    legend.innerHTML = curves.map(function (c) {
      return '<span><span class="dot" style="background:' + c.color + '"></span>' + c.name + '</span>';
    }).join('');
  }

  // ── Init gamma slider preview ──
  function initGammaPreview() {
    var slider = $('csGammaSlider');
    var valEl = $('csGammaVal');
    var canvas = $('csGammaBarCanvas');
    if (!canvas) return;
    canvas.width = 400;
    canvas.height = 40;

    function draw() {
      var gamma = parseFloat(slider.value);
      valEl.textContent = gamma.toFixed(2);
      var ctx = canvas.getContext('2d');
      var W = canvas.width, H = canvas.height;
      for (var x = 0; x < W; x++) {
        var t = x / (W - 1);
        var v = Math.pow(t, 1 / gamma);
        var c = Math.round(v * 255);
        ctx.fillStyle = 'rgb(' + c + ',' + c + ',' + c + ')';
        ctx.fillRect(x, 0, 1, H);
      }
    }

    slider.addEventListener('input', draw);
    draw();
  }

  // ── Image color space converter ──
  var srcImage = null;

  function initImageConverter() {
    var dropZone = $('csImgDropZone');
    var fileInput = $('csImgFile');
    var convertBtn = $('csConvertBtn');
    var downloadBtn = $('csDownloadBtn');

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
    convertBtn.addEventListener('click', convertImage);
    downloadBtn.addEventListener('click', downloadResult);
  }

  function handleFile(file) {
    if (!file.type.startsWith('image/')) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        srcImage = img;
        var canvas = $('csSrcCanvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        $('csConvertBtn').disabled = false;
        $('csImgInfo').textContent = file.name + ' (' + img.width + '×' + img.height + ')';
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function convertImage() {
    if (!srcImage) return;
    var fromSpace = $('csFromSpace').value;
    var toSpace = $('csToSpace').value;
    var gamma = parseFloat($('csImgGamma').value) || 2.2;

    var srcCanvas = $('csSrcCanvas');
    var srcCtx = srcCanvas.getContext('2d');
    var imgData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
    var data = imgData.data;

    var outCanvas = $('csOutCanvas');
    outCanvas.width = srcCanvas.width;
    outCanvas.height = srcCanvas.height;
    var outCtx = outCanvas.getContext('2d');
    var outData = outCtx.createImageData(outCanvas.width, outCanvas.height);
    var out = outData.data;

    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i+1], b = data[i+2];
      var lr, lg, lb;

      // Decode to linear
      if (fromSpace === 'srgb') {
        lr = srgbToLinear(r); lg = srgbToLinear(g); lb = srgbToLinear(b);
      } else if (fromSpace === 'gamma') {
        lr = gammaDecode(r, gamma); lg = gammaDecode(g, gamma); lb = gammaDecode(b, gamma);
      } else {
        lr = r / 255; lg = g / 255; lb = b / 255;
      }

      // Encode from linear
      if (toSpace === 'srgb') {
        out[i] = Math.round(linearToSrgb(lr));
        out[i+1] = Math.round(linearToSrgb(lg));
        out[i+2] = Math.round(linearToSrgb(lb));
      } else if (toSpace === 'gamma') {
        out[i] = Math.round(gammaEncode(lr, gamma));
        out[i+1] = Math.round(gammaEncode(lg, gamma));
        out[i+2] = Math.round(gammaEncode(lb, gamma));
      } else {
        out[i] = Math.round(lr * 255);
        out[i+1] = Math.round(lg * 255);
        out[i+2] = Math.round(lb * 255);
      }
      out[i+3] = data[i+3];
    }

    outCtx.putImageData(outData, 0, 0);
    $('csDownloadBtn').disabled = false;
  }

  function downloadResult() {
    var canvas = $('csOutCanvas');
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'color_space_converted.png';
    a.click();
  }

  // ── Init all ──
  document.addEventListener('DOMContentLoaded', function () {
    initManualConverter();
    initCurveChart();
    initGammaPreview();
    initImageConverter();
  });
})();
