(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var srcImage = null;
  var rafId = null;

  function initDropZone() {
    var dropZone = $('tlDropZone');
    var fileInput = $('tlFileInput');

    dropZone.addEventListener('click', function () { fileInput.click(); });
    dropZone.addEventListener('dragover', function (e) { e.preventDefault(); });
    dropZone.addEventListener('drop', function (e) {
      e.preventDefault();
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
        var c = $('tlSrcCanvas');
        c.width = img.width;
        c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        $('tlInfo').textContent = img.width + '×' + img.height + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
        $('tlExportBtn').disabled = false;
        scheduleRender();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function scheduleRender() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(render);
  }

  function render() {
    if (!srcImage) return;

    var canvas = $('tlPreviewCanvas');
    var container = canvas.parentElement;
    canvas.width = container.clientWidth - 20;
    canvas.height = container.clientHeight - 20;
    if (canvas.width < 100) canvas.width = 800;
    if (canvas.height < 100) canvas.height = 600;

    var ctx = canvas.getContext('2d');
    var tileX = parseFloat($('tlTileX').value);
    var tileY = parseFloat($('tlTileY').value);
    var offsetX = parseFloat($('tlOffsetX').value);
    var offsetY = parseFloat($('tlOffsetY').value);
    var rotation = parseFloat($('tlRotation').value) * Math.PI / 180;
    var blendMode = $('tlBlendMode').value;
    var bgColor = $('tlBgColor').value;
    var showGrid = $('tlShowGrid').checked;
    var showSeam = $('tlShowSeam').checked;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Create tiling pattern
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);

    var imgW = srcImage.width;
    var imgH = srcImage.height;
    var drawW = canvas.width / tileX;
    var drawH = canvas.height / tileY;

    ctx.globalCompositeOperation = blendMode;

    // Calculate tile count with extra for rotation
    var extra = 2;
    var startX = Math.floor(-extra);
    var startY = Math.floor(-extra);
    var endX = Math.ceil(tileX + extra);
    var endY = Math.ceil(tileY + extra);

    for (var ty = startY; ty <= endY; ty++) {
      for (var tx = startX; tx <= endX; tx++) {
        var dx = (tx + offsetX) * drawW;
        var dy = (ty + offsetY) * drawH;
        ctx.drawImage(srcImage, dx, dy, drawW, drawH);
      }
    }

    ctx.globalCompositeOperation = 'source-over';

    // UV grid overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255,255,0,0.4)';
      ctx.lineWidth = 1;
      for (var i = 0; i <= tileX; i++) {
        var x = i * drawW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (var j = 0; j <= tileY; j++) {
        var y = j * drawH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    // Seam highlight
    if (showSeam) {
      ctx.strokeStyle = 'rgba(255,0,0,0.6)';
      ctx.lineWidth = 3;
      for (var i = 1; i < tileX; i++) {
        var x = i * drawW;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (var j = 1; j < tileY; j++) {
        var y = j * drawH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    }

    ctx.restore();

    $('tlPreviewInfo').textContent = '预览: ' + canvas.width + '×' + canvas.height +
      ' | Tiling: ' + tileX.toFixed(1) + '×' + tileY.toFixed(1) +
      ' | 旋转: ' + ($('tlRotation').value) + '°';
  }

  function initControls() {
    var sliders = [
      { id: 'tlTileX', valId: 'tlTileXVal', fmt: function (v) { return parseFloat(v).toFixed(1); } },
      { id: 'tlTileY', valId: 'tlTileYVal', fmt: function (v) { return parseFloat(v).toFixed(1); } },
      { id: 'tlOffsetX', valId: 'tlOffsetXVal', fmt: function (v) { return parseFloat(v).toFixed(2); } },
      { id: 'tlOffsetY', valId: 'tlOffsetYVal', fmt: function (v) { return parseFloat(v).toFixed(2); } },
      { id: 'tlRotation', valId: 'tlRotationVal', fmt: function (v) { return v + '°'; } },
    ];

    sliders.forEach(function (s) {
      var el = $(s.id);
      el.addEventListener('input', function () {
        $(s.valId).textContent = s.fmt(el.value);
        scheduleRender();
      });
    });

    ['tlBlendMode', 'tlBgColor', 'tlShowGrid', 'tlShowSeam'].forEach(function (id) {
      $(id).addEventListener('change', scheduleRender);
      $(id).addEventListener('input', scheduleRender);
    });
  }

  function initExport() {
    $('tlExportBtn').addEventListener('click', function () {
      if (!srcImage) return;
      var size = parseInt($('tlOutSize').value);
      var exportCanvas = document.createElement('canvas');
      exportCanvas.width = size;
      exportCanvas.height = size;

      // Temporarily swap preview canvas
      var origCanvas = $('tlPreviewCanvas');
      var origW = origCanvas.width, origH = origCanvas.height;
      origCanvas.width = size;
      origCanvas.height = size;
      render();

      var a = document.createElement('a');
      a.href = origCanvas.toDataURL('image/png');
      a.download = 'tiling_preview_' + size + '.png';
      a.click();

      // Restore
      origCanvas.width = origW;
      origCanvas.height = origH;
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initDropZone();
    initControls();
    initExport();
    window.addEventListener('resize', scheduleRender);
  });
})();
