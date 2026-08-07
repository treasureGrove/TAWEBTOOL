(function () {
  'use strict';

  // ─── 工具函数 ───
  function $(id) {
    return document.getElementById(id);
  }

  // 将输入值钳制在合理范围内，非法值回退到默认值
  function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (isNaN(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function setStatus(msg) {
    $('ssStatus').textContent = msg;
  }

  function readFileAsImage(file) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(img);
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        reject(new Error('图片解码失败'));
      };
      img.src = url;
    });
  }

  function canvasToBlob(canvas, format) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('Canvas 转 Blob 失败'));
      }, 'image/' + format, format === 'jpeg' ? 0.92 : undefined);
    });
  }

  function triggerDownload(name, blob) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // ─── 全局状态 ───
  let sourceImg = null;      // 原始图片对象
  let sourceFile = null;     // 原始文件（用于命名）
  let selectedIndex = 0;     // 当前选中的帧下标（0 起）
  let _prevDropURL = null;   // dropzone 缩略图 URL，用于释放

  const canvas = $('ssCanvas');
  const ctx = canvas.getContext('2d');

  // 是否已经加载了 JSZip（优先用 zip 打包，否则逐个下载）
  const hasJSZip = typeof window.JSZip !== 'undefined';

  // ─── 网格计算 ───
  // 说明：
  //   offset = 图片四周留白（边框）
  //   padding = 相邻两帧之间的间隔（间距）
  //   cellW/cellH = 按原图等比自动计算的每帧宽高
  function getGrid() {
    const cols = clampInt($('ssCols').value, 1, 256, 1);
    const rows = clampInt($('ssRows').value, 1, 256, 1);
    const padding = clampInt($('ssPadding').value, 0, 128, 0);
    const offset = clampInt($('ssOffset').value, 0, 128, 0);

    const base = { cols, rows, padding, offset };

    if (!sourceImg) return Object.assign({ valid: false, reason: 'no-image' }, base);

    const imgW = sourceImg.width;
    const imgH = sourceImg.height;
    const availW = imgW - 2 * offset - (cols - 1) * padding;
    const availH = imgH - 2 * offset - (rows - 1) * padding;

    if (availW <= 0 || availH <= 0) {
      return Object.assign({ valid: false, reason: 'too-small' }, base);
    }

    return Object.assign({
      valid: true,
      cellW: availW / cols,
      cellH: availH / rows,
    }, base);
  }

  // 由帧下标得到它在原图中的裁切矩形（像素坐标）
  function getFrameRect(index, grid) {
    const c = index % grid.cols;
    const r = Math.floor(index / grid.cols);
    return {
      x: grid.offset + c * (grid.cellW + grid.padding),
      y: grid.offset + r * (grid.cellH + grid.padding),
      w: grid.cellW,
      h: grid.cellH,
    };
  }

  // ─── 预览绘制 ───
  // 把 canvas 内部分辨率调整为能铺满容器且保持原图比例
  function layoutCanvas() {
    const wrap = canvas.parentElement;
    const availW = wrap.clientWidth;
    const availH = wrap.clientHeight;
    if (availW <= 0 || availH <= 0) return;

    const ratio = sourceImg.width / sourceImg.height;
    let w = availW;
    let h = availW / ratio;
    if (h > availH) {
      h = availH;
      w = availH * ratio;
    }
    canvas.width = Math.max(1, Math.round(w));
    canvas.height = Math.max(1, Math.round(h));
    drawPreview();
  }

  function drawPreview() {
    if (!sourceImg || canvas.width < 1) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);

    const grid = getGrid();
    if (!grid.valid) return;

    const scaleX = canvas.width / sourceImg.width;
    const scaleY = canvas.height / sourceImg.height;

    // 半透明深色遮罩，突出被选中的帧
    ctx.fillStyle = 'rgba(7, 20, 17, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 逐帧高亮选中帧
    const total = grid.cols * grid.rows;
    if (selectedIndex < total) {
      const rect = getFrameRect(selectedIndex, grid);
      const px = rect.x * scaleX;
      const py = rect.y * scaleY;
      const pw = rect.w * scaleX;
      const ph = rect.h * scaleY;
      ctx.clearRect(px, py, pw, ph);
      ctx.drawImage(
        sourceImg,
        rect.x, rect.y, rect.w, rect.h,
        px, py, pw, ph
      );
      ctx.strokeStyle = '#26a884';
      ctx.lineWidth = Math.max(2, canvas.width * 0.004);
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    }

    // 绘制所有网格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < grid.cols; c++) {
      const x = (grid.offset + c * (grid.cellW + grid.padding) - grid.padding / 2) * scaleX;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
    }
    for (let r = 1; r < grid.rows; r++) {
      const y = (grid.offset + r * (grid.cellH + grid.padding) - grid.padding / 2) * scaleY;
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
  }

  // 刷新单帧尺寸信息 + 帧总数显示，并根据合法性启用/禁用导出
  function refreshGridInfo() {
    const grid = getGrid();
    const totalEl = $('ssFrameTotal');
    const infoEl = $('ssCellInfo');

    if (!sourceImg) {
      infoEl.textContent = '-';
      totalEl.textContent = '-';
      $('ssExportBtn').disabled = true;
      return;
    }

    if (!grid.valid) {
      infoEl.textContent = '参数超出范围';
      totalEl.textContent = '-';
      $('ssExportBtn').disabled = true;
      setStatus('网格参数不合理：请检查列数 / 行数 / 间距 / 边框，保证剩余区域大于 0。');
      return;
    }

    const total = grid.cols * grid.rows;
    const round = function (n) { return n % 1 === 0 ? n : n.toFixed(1); };
    infoEl.textContent = round(grid.cellW) + ' × ' + round(grid.cellH);
    totalEl.textContent = String(total);
    $('ssExportBtn').disabled = false;

    // 同步帧序号输入框范围
    if (selectedIndex >= total) selectedIndex = 0;
    $('ssFrameIndex').value = String(selectedIndex + 1);
    setStatus('已加载 ' + sourceFile.name + '，共 ' + total + ' 帧。');
  }

  // ─── 帧选中 ───
  function selectFrame(index, grid) {
    const g = grid || getGrid();
    const total = g.valid ? g.cols * g.rows : 1;
    selectedIndex = Math.max(0, Math.min(index, total - 1));
    $('ssFrameIndex').value = String(selectedIndex + 1);
    drawPreview();
  }

  // ─── 上传处理 ───
  function handleFile(file) {
    if (!file) return;
    if (!file.type || file.type.indexOf('image/') !== 0) {
      setStatus('请选择图片文件（JPG / PNG / WEBP 等）。');
      return;
    }

    setStatus('正在加载 ' + file.name + ' ...');
    readFileAsImage(file).then(function (img) {
      sourceImg = img;
      sourceFile = file;
      selectedIndex = 0;

      // 在 dropzone 上显示缩略图
      const dropzone = $('ssDropZone');
      if (_prevDropURL) URL.revokeObjectURL(_prevDropURL);
      const url = URL.createObjectURL(file);
      _prevDropURL = url;
      dropzone.style.backgroundImage = 'url(' + url + ')';
      dropzone.classList.add('has-image');

      // 用原图名作为导出前缀
      const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fa5-]+/g, '_') || 'sprite';
      dropzone.dataset.baseName = baseName;

      refreshGridInfo();
      layoutCanvas();
    }).catch(function () {
      setStatus('图片加载失败，请检查文件格式是否正确。');
    });
  }

  function bindDropzone() {
    const dropzone = $('ssDropZone');
    const input = $('ssFileInput');

    // 点击上传
    dropzone.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      handleFile(input.files[0]);
      input.value = '';
    });

    // 拖拽上传
    dropzone.addEventListener('dragover', function (e) {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(file);
    });
  }

  // ─── 导出 ───
  async function exportAll() {
    const grid = getGrid();
    if (!sourceImg || !grid.valid) {
      setStatus('请先上传雪碧图并确认网格参数正确。');
      return;
    }

    const total = grid.cols * grid.rows;
    const format = $('ssFormat').value;
    const ext = format === 'jpeg' ? 'jpg' : format;
    const baseName = ($('ssDropZone').dataset.baseName || 'sprite');
    const useZip = hasJSZip;

    let zip = null;
    if (useZip) zip = new window.JSZip();

    const btn = $('ssExportBtn');
    btn.disabled = true;

    try {
      for (let i = 0; i < total; i++) {
        const rect = getFrameRect(i, grid);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(rect.w));
        c.height = Math.max(1, Math.round(rect.h));
        const cctx = c.getContext('2d');
        cctx.imageSmoothingEnabled = true;
        cctx.imageSmoothingQuality = 'high';
        cctx.drawImage(sourceImg, rect.x, rect.y, rect.w, rect.h, 0, 0, c.width, c.height);

        const name = baseName + '_' + String(i).padStart(3, '0') + '.' + ext;
        const blob = await canvasToBlob(c, format);

        if (useZip) {
          zip.file(name, blob);
        } else {
          // 未加载 JSZip：逐个触发下载，留出间隔避免浏览器拦截批量下载
          triggerDownload(name, blob);
          await new Promise(function (r) { setTimeout(r, 250); });
        }
        setStatus('导出中 ' + (i + 1) + ' / ' + total + ' ...');
      }

      if (useZip) {
        setStatus('正在压缩打包...');
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(baseName + '_frames.zip', zipBlob);
        setStatus('已导出 ' + total + ' 帧 → ' + baseName + '_frames.zip');
      } else {
        setStatus('已逐个下载 ' + total + ' 帧（未加载 JSZip，使用逐个下载方案）。');
      }
    } catch (e) {
      setStatus('导出失败：' + (e && e.message ? e.message : '未知错误'));
    } finally {
      btn.disabled = false;
      refreshGridInfo();
    }
  }

  // ─── 事件绑定 ───
  function bindControls() {
    // 网格参数变化时重新计算与重绘
    ['ssCols', 'ssRows', 'ssPadding', 'ssOffset'].forEach(function (id) {
      const el = $(id);
      el.addEventListener('input', function () {
        refreshGridInfo();
        drawPreview();
      });
    });

    // 帧序号输入：直接跳转高亮对应帧
    $('ssFrameIndex').addEventListener('input', function () {
      const grid = getGrid();
      if (!grid.valid) return;
      const v = clampInt(this.value, 1, grid.cols * grid.rows, selectedIndex + 1);
      selectFrame(v - 1, grid);
    });

    // 上一帧 / 下一帧
    $('ssPrevBtn').addEventListener('click', function () {
      selectFrame(selectedIndex - 1);
    });
    $('ssNextBtn').addEventListener('click', function () {
      selectFrame(selectedIndex + 1);
    });

    // 点击预览图：按点击位置定位到对应帧
    canvas.addEventListener('click', function (e) {
      const grid = getGrid();
      if (!sourceImg || !grid.valid) return;
      const rect = canvas.getBoundingClientRect();
      const imgX = (e.clientX - rect.left) * (sourceImg.width / canvas.width);
      const imgY = (e.clientY - rect.top) * (sourceImg.height / canvas.height);
      const c = Math.floor((imgX - grid.offset) / (grid.cellW + grid.padding));
      const r = Math.floor((imgY - grid.offset) / (grid.cellH + grid.padding));
      if (c >= 0 && c < grid.cols && r >= 0 && r < grid.rows) {
        selectFrame(r * grid.cols + c, grid);
      }
    });

    // 导出
    $('ssExportBtn').addEventListener('click', exportAll);

    // 窗口尺寸变化时重排画布
    window.addEventListener('resize', function () {
      if (sourceImg) layoutCanvas();
    });
  }

  // ─── 初始化 ───
  function init() {
    bindDropzone();
    bindControls();
    refreshGridInfo();
    if (!hasJSZip) {
      $('ssDropHint').textContent = '支持 JPG / PNG / WEBP（未加载 JSZip，将逐个下载导出）';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
