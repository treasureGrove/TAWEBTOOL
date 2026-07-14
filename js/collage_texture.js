(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // ── State ──
  var sprites = [];       // [{ name, dataUrl, img, w, h }]
  var resultCanvas = null;
  var zoomLevel = 1;

  // ── DOM refs ──
  var dropZone = $('clDropZone');
  var fileInput = $('clFileInput');
  var spriteList = $('clSpriteList');
  var countEl = $('clCount');
  var colsInput = $('clCols');
  var rowsInput = $('clRows');
  var outWidthInput = $('clOutWidth');
  var outSizeEl = $('clOutSize');
  var cellInfoEl = $('clCellInfo');
  var keepAspectCheck = $('clKeepAspect');
  var downloadBtn = $('clDownloadBtn');
  var clearBtn = $('clClearBtn');
  var formatSelect = $('clFormat');
  var previewCanvas = $('clPreview');
  var infoEl = $('clInfo');
  var zoomOutBtn = $('clZoomOut');
  var zoomInBtn = $('clZoomIn');
  var zoomFitBtn = $('clZoomFit');
  var zoomLabel = $('clZoomLabel');

  var keepAspectRatio = false;

  // ── Update output size display ──
  function updateOutSize() {
    var cols = parseInt(colsInput.value) || 3;
    var rows = parseInt(rowsInput.value) || 3;
    var size = parseInt(outWidthInput.value) || 1024;
    var gap = 0;
    var totalW = size, totalH = size;
    var cellW = totalW / cols;
    var cellH = totalH / rows;
    var cellWi = Math.floor(cellW);
    var cellHi = Math.floor(cellH);
    cellInfoEl.textContent = cellWi + '×' + cellHi;
    outSizeEl.textContent = totalW + ' × ' + totalH;
    return { w: totalW, h: totalH, cols: cols, rows: rows, cellW: cellW, cellH: cellH, gap: gap };
  }

  // ── Render sprite list ──
  function renderSpriteList() {
    countEl.textContent = sprites.length + ' 张';
    var html = '';
    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      html += '<div class="cl-sprite-item">' +
        '<span class="idx">#' + (i + 1) + '</span>' +
        '<img src="' + s.dataUrl + '" alt="">' +
        '<span class="name" title="' + escapeHTML(s.name) + '">' + escapeHTML(s.name) + '</span>' +
        '<span class="size">' + s.w + '×' + s.h + '</span>' +
        '<button class="remove" data-idx="' + i + '">✕</button>' +
        '</div>';
    }
    if (sprites.length === 0) {
      html = '<p style="font-size:12px;color:var(--app-muted);text-align:center;padding:12px;">暂无贴图，请上传</p>';
    }
    spriteList.innerHTML = html;

    // Bind remove buttons
    var btns = spriteList.querySelectorAll('.remove');
    for (var j = 0; j < btns.length; j++) {
      btns[j].addEventListener('click', function (e) {
        var idx = parseInt(this.getAttribute('data-idx'));
        sprites.splice(idx, 1);
        renderSpriteList();
        updateButtons();
        if (sprites.length > 0) { generateCollage(); }
        else {
          resultCanvas = null;
          var cc = previewCanvas.getContext('2d');
          previewCanvas.width = 512; previewCanvas.height = 512;
          cc.clearRect(0, 0, 512, 512);
          zoomLevel = 1; zoomLabel.textContent = '100%';
          infoEl.textContent = '上传贴图开始';
        }
      });
    }

    updateButtons();
  }

  function updateButtons() {
    downloadBtn.disabled = (resultCanvas === null);
  }

  // ── Load image from file ──
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          resolve({ name: file.name, dataUrl: e.target.result, img: img, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Add files ──
  function addFiles(files) {
    var promises = [];
    for (var i = 0; i < files.length; i++) {
      if (files[i].type.match(/^image\//)) {
        promises.push(loadImage(files[i]));
      }
    }
    if (promises.length === 0) return;
    Promise.all(promises).then(function (results) {
      sprites = sprites.concat(results);
      renderSpriteList();
      if (sprites.length > 0) generateCollage();
    }).catch(function (err) {
      console.error('Failed to load images:', err);
    });
  }

  // ── Generate collage ──
  function generateCollage() {
    if (sprites.length === 0) return;

    var s = updateOutSize(), cols = s.cols, rows = s.rows, cellW = s.cellW, cellH = s.cellH, gap = s.gap, totalW = s.w, totalH = s.h;

    // Create offscreen canvas
    var offCanvas = document.createElement('canvas');
    offCanvas.width = totalW;
    offCanvas.height = totalH;
    var offCtx = offCanvas.getContext('2d');

    // Canvas starts transparent (alpha=0).
    var totalCells = cols * rows;

    for (var i = 0; i < totalCells; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var sx = Math.round(col * cellW);
      var sy = Math.round(row * cellH);
      var nextSx = Math.round((col + 1) * cellW);
      var nextSy = Math.round((row + 1) * cellH);
      var dw = nextSx - sx;
      var dh = nextSy - sy;

      if (i >= sprites.length) {
        // Empty cell — fully transparent (alpha=0), CSS checkerboard shows through
        continue;
      }

      var sprite = sprites[i];
      offCtx.save();
      offCtx.beginPath();
      offCtx.rect(sx, sy, dw, dh);
      offCtx.clip();

      if (keepAspectRatio) {
        var sc = Math.min(dw / sprite.w, dh / sprite.h);
        offCtx.drawImage(sprite.img, sx + (dw - sprite.w * sc) / 2, sy + (dh - sprite.h * sc) / 2, sprite.w * sc, sprite.h * sc);
      } else {
        offCtx.drawImage(sprite.img, sx, sy, dw, dh);
      }

      offCtx.restore();
    }

    resultCanvas = offCanvas;
    zoomFit();
    updateButtons();

    // Update info
    var usedCells = Math.min(sprites.length, totalCells);
    infoEl.textContent = '已生成 ' + totalW + '×' + totalH + ' | ' + usedCells + '/' + totalCells + ' 格' + (keepAspectRatio ? ' | 等比' : '');
  }

  // ── Render preview ──
  function getWrapSize() {
    var wrap = previewCanvas.parentElement; // .cl-canvas-wrap
    if (!wrap) return { w: 600, h: 400 };
    var w = wrap.clientWidth;
    var h = wrap.clientHeight;
    if (w <= 0 || h <= 0) {
      // Fallback on first render: use panel dimensions
      var panel = document.getElementById('panel');
      if (panel) {
        var pr = panel.getBoundingClientRect();
        w = pr.width - 360;  // minus left panel
        h = pr.height - 220; // minus head + bottom bar
      }
    }
    return { w: Math.max(w, 200), h: Math.max(h, 120) };
  }

  function renderPreview() {
    if (!resultCanvas) return;

    var wrapSize = getWrapSize();
    var rw = resultCanvas.width;
    var rh = resultCanvas.height;
    var fitScale = Math.min(wrapSize.w / rw, wrapSize.h / rh);
    var scale = Math.min(fitScale, zoomLevel);

    // Set pixel buffer for rendering quality; CSS handles display size
    var dw = Math.round(rw * scale);
    var dh = Math.round(rh * scale);
    var c = previewCanvas;
    c.width = dw;
    c.height = dh;

    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(resultCanvas, 0, 0, dw, dh);

    zoomLabel.textContent = Math.round(scale * 100) + '%';
  }

  // ── Zoom ──
  function setZoom(z) {
    zoomLevel = Math.max(0.1, Math.min(3, z));
    renderPreview();
  }

  function zoomFit() {
    if (!resultCanvas) return;
    zoomLevel = 999; // renderPreview caps at fit-to-wrap scale
    renderPreview();
  }

  // ── Download ──
  function downloadFile() {
    if (!resultCanvas) return;
    var fmt = formatSelect.value;
    if (fmt === 'tga') {
      var blob = TGAEncoder.encodeFromCanvas(resultCanvas);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.download = 'collage_' + resultCanvas.width + 'x' + resultCanvas.height + '.tga';
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      var link = document.createElement('a');
      link.download = 'collage_' + resultCanvas.width + 'x' + resultCanvas.height + '.png';
      link.href = resultCanvas.toDataURL('image/png');
      link.click();
    }
  }

  // ── Event bindings ──
  // Drop zone click
  dropZone.addEventListener('click', function () { fileInput.click(); });

  // File input change
  fileInput.addEventListener('change', function () {
    if (fileInput.files.length > 0) {
      addFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  // Drag & drop
  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  });

  // Clear
  clearBtn.addEventListener('click', function () {
    sprites = [];
    resultCanvas = null;
    renderSpriteList();
    updateButtons();
    var ctx = previewCanvas.getContext('2d');
    previewCanvas.width = 512;
    previewCanvas.height = 512;
    ctx.clearRect(0, 0, 512, 512);
    zoomLevel = 1;
    zoomLabel.textContent = '100%';
    infoEl.textContent = '等待上传贴图…';
  });

  // Grid inputs — auto regenerate
  function autoGenerate() {
    if (sprites.length > 0) generateCollage();
  }
  colsInput.addEventListener('input', function () {
    updateOutSize();
    autoGenerate();
  });
  rowsInput.addEventListener('input', function () {
    updateOutSize();
    autoGenerate();
  });
  outWidthInput.addEventListener('input', function () {
    updateOutSize();
    autoGenerate();
  });

  // Keep aspect ratio
  keepAspectCheck.addEventListener('change', function () {
    keepAspectRatio = keepAspectCheck.checked;
    autoGenerate();
  });

  // Download
  downloadBtn.addEventListener('click', downloadFile);

  // Zoom
  zoomOutBtn.addEventListener('click', function () { setZoom(zoomLevel - 0.25); });
  zoomInBtn.addEventListener('click', function () { setZoom(zoomLevel + 0.25); });
  zoomFitBtn.addEventListener('click', zoomFit);

  // ── Init ──
  updateOutSize();
  renderSpriteList();

  // ── Escape HTML helper ──
  function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }
})();
