(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var sprites = [];
  var packedResult = null;

  // ── MaxRects Bin Packing ──
  function maxRectsPack(rects, binW, binH) {
    var freeRects = [{ x: 0, y: 0, w: binW, h: binH }];
    var placed = [];

    // Sort by area desc
    rects.sort(function (a, b) { return (b.w * b.h) - (a.w * a.h); });

    for (var i = 0; i < rects.length; i++) {
      var rect = rects[i];
      var bestScore1 = Infinity, bestScore2 = Infinity;
      var bestRect = null, bestFree = null;

      for (var j = 0; j < freeRects.length; j++) {
        var free = freeRects[j];
        if (free.w >= rect.w && free.h >= rect.h) {
          var leftoverH = Math.abs(free.w - rect.w);
          var leftoverV = Math.abs(free.h - rect.h);
          var shortSide = Math.min(leftoverH, leftoverV);
          var longSide = Math.max(leftoverH, leftoverV);
          if (shortSide < bestScore1 || (shortSide === bestScore1 && longSide < bestScore2)) {
            bestScore1 = shortSide;
            bestScore2 = longSide;
            bestRect = { x: free.x, y: free.y, w: rect.w, h: rect.h };
            bestFree = j;
          }
        }
      }

      if (bestRect && bestFree !== null) {
        bestRect.id = rect.id;
        placed.push(bestRect);
        splitFreeRect(freeRects[bestFree], bestRect, freeRects);
        freeRects.splice(bestFree, 1);
        pruneFreeRects(freeRects);
      }
    }

    return placed;
  }

  function splitFreeRect(free, used, freeRects) {
    // Right remainder
    if (used.x < free.x + free.w && used.x + used.w > free.x &&
        used.y < free.y + free.h && used.y + used.h > free.y) {
      // Top
      if (used.y > free.y) {
        freeRects.push({ x: free.x, y: free.y, w: free.w, h: used.y - free.y });
      }
      // Bottom
      if (used.y + used.h < free.y + free.h) {
        freeRects.push({ x: free.x, y: used.y + used.h, w: free.w, h: free.y + free.h - used.y - used.h });
      }
      // Left
      if (used.x > free.x) {
        freeRects.push({ x: free.x, y: free.y, w: used.x - free.x, h: free.h });
      }
      // Right
      if (used.x + used.w < free.x + free.w) {
        freeRects.push({ x: used.x + used.w, y: free.y, w: free.x + free.w - used.x - used.w, h: free.h });
      }
    }
  }

  function pruneFreeRects(freeRects) {
    for (var i = 0; i < freeRects.length; i++) {
      for (var j = i + 1; j < freeRects.length; j++) {
        if (isContained(freeRects[i], freeRects[j])) { freeRects.splice(i, 1); i--; break; }
        if (isContained(freeRects[j], freeRects[i])) { freeRects.splice(j, 1); j--; }
      }
    }
  }

  function isContained(a, b) {
    return a.x >= b.x && a.y >= b.y &&
           a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  }

  // ── UI ──
  function initDropZone() {
    var dropZone = $('ssDropZone');
    var fileInput = $('ssFileInput');

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); });
  }

  function handleFiles(fileList) {
    var files = Array.from(fileList).filter(function (f) { return f.type.startsWith('image/'); });
    var loaded = 0;
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          sprites.push({ name: file.name, img: img, w: img.width, h: img.height });
          loaded++;
          if (loaded === files.length) renderSpriteList();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderSpriteList() {
    var list = $('ssSpriteList');
    list.innerHTML = '';
    sprites.forEach(function (sp, idx) {
      var div = document.createElement('div');
      div.className = 'ss-sprite-item';
      div.innerHTML = '<img src="' + sp.img.src + '">' +
        '<span class="name">' + sp.name + '</span>' +
        '<span class="size">' + sp.w + '×' + sp.h + '</span>' +
        '<button class="remove" data-idx="' + idx + '">✕</button>';
      list.appendChild(div);
    });
    list.querySelectorAll('.remove').forEach(function (btn) {
      btn.addEventListener('click', function () {
        sprites.splice(parseInt(btn.dataset.idx), 1);
        renderSpriteList();
      });
    });
    $('ssPackBtn').disabled = sprites.length === 0;
    $('ssSpriteCount').textContent = sprites.length + ' 张精灵';
  }

  function pack() {
    if (sprites.length === 0) return;

    var padding = parseInt($('ssPadding').value) || 2;
    var sizeMode = $('ssSizeMode').value;
    var binW, binH;

    var rects = sprites.map(function (sp, i) {
      return { id: i, w: sp.w + padding, h: sp.h + padding };
    });

    if (sizeMode === 'auto') {
      // Estimate power-of-two size
      var totalArea = 0;
      rects.forEach(function (r) { totalArea += r.w * r.h; });
      var side = Math.ceil(Math.sqrt(totalArea * 1.3));
      binW = binH = nextPow2(side);
      if (binW > 4096) binW = binH = 4096;
    } else {
      var parts = sizeMode.split('x');
      binW = parseInt(parts[0]);
      binH = parseInt(parts[1]);
    }

    var placed = maxRectsPack(rects, binW, binH);

    if (placed.length < sprites.length) {
      // Try larger size
      binW = Math.min(binW * 2, 8192);
      binH = Math.min(binH * 2, 8192);
      rects = sprites.map(function (sp, i) { return { id: i, w: sp.w + padding, h: sp.h + padding }; });
      placed = maxRectsPack(rects, binW, binH);
    }

    var canvas = $('ssOutCanvas');
    canvas.width = binW;
    canvas.height = binH;
    var ctx = canvas.getContext('2d');

    var bgColorEl = document.querySelector('input[name="ssBg"]:checked');
    var bgColor = bgColorEl ? bgColorEl.value : 'transparent';
    if (bgColor === 'transparent') {
      ctx.clearRect(0, 0, binW, binH);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, binW, binH);
    }

    var jsonData = { frames: {}, meta: { size: { w: binW, h: binH }, padding: padding } };

    placed.forEach(function (p) {
      var sp = sprites[p.id];
      ctx.drawImage(sp.img, p.x, p.y);
      jsonData.frames[sp.name] = {
        frame: { x: p.x, y: p.y, w: sp.w, h: sp.h },
        sourceSize: { w: sp.w, h: sp.h }
      };
    });

    packedResult = jsonData;
    $('ssOutInfo').textContent = '输出: ' + binW + '×' + binH + ' | 放置 ' + placed.length + '/' + sprites.length + ' 张';
    $('ssJsonBox').textContent = JSON.stringify(jsonData, null, 2);
    $('ssDlSheetBtn').disabled = false;
    $('ssDlJsonBtn').disabled = false;
  }

  function nextPow2(v) {
    v--;
    v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16;
    return v + 1;
  }

  function downloadSheet() {
    var canvas = $('ssOutCanvas');
    var fmt = $('ssOutFormat').value;
    var mime = fmt === 'png' ? 'image/png' : 'image/webp';
    var a = document.createElement('a');
    a.href = canvas.toDataURL(mime);
    a.download = 'spritesheet.' + fmt;
    a.click();
  }

  function downloadJson() {
    if (!packedResult) return;
    var blob = new Blob([JSON.stringify(packedResult, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'spritesheet.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDropZone();
    $('ssPackBtn').addEventListener('click', pack);
    $('ssDlSheetBtn').addEventListener('click', downloadSheet);
    $('ssDlJsonBtn').addEventListener('click', downloadJson);
    $('ssClearBtn').addEventListener('click', function () {
      sprites = [];
      renderSpriteList();
    });
  });
})();
