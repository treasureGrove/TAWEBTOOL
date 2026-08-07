(function () {
  function $(id) { return document.getElementById(id); }

  // ─── 状态提示 ───
  // 在指定状态容器中显示消息，并根据类型切换颜色样式
  function setStatus(el, msg, type) {
    el.textContent = msg;
    el.classList.remove('is-error', 'is-success');
    if (type) el.classList.add(type === 'error' ? 'is-error' : 'is-success');
  }

  // ─── 格式化文件大小（B / KB / MB） ───
  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ─── 复制到剪贴板（带降级方案） ───
  // 优先使用 navigator.clipboard，失败时回退到 document.execCommand('copy')
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        () => true,
        () => fallbackCopy(text)
      );
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  // ─── 触发浏览器下载 ───
  function triggerDownload(href, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = href;
    link.click();
    setTimeout(() => { try { URL.revokeObjectURL(href); } catch (e) {} }, 1800);
  }

  // ─── Tab 切换（图片转Base64 / Base64转图片） ───
  function initTabs() {
    const tabs = Array.from(document.querySelectorAll('.b64-tab'));
    const panes = Array.from(document.querySelectorAll('.b64-pane'));
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-tab');
        tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
        panes.forEach((p) => p.classList.toggle('is-active', p.getAttribute('data-pane') === key));
      });
    });
  }

  // ─── 读取图片尺寸（加载后返回宽高） ───
  function getImageSize(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // ════════════════════════════════════════
  // 方向一：图片 → Base64
  // ════════════════════════════════════════
  const statusEl = $('b64Status');
  const outputEl = $('b64Output');
  let currentDataUrl = '';       // 当前图片对应的 Data URI
  let currentFile = null;        // 当前选择的图片文件

  // 单文件大小上限（10MB），过大时提示用户
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatus(statusEl, '请选择有效的图片文件。', 'error');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus(statusEl, '文件过大（超过 10MB），生成的 Base64 文本会非常长，请谨慎处理。', 'error');
      return;
    }

    const dropzone = $('b64Dropzone');
    const preview = $('b64Preview');
    const stats = $('b64Stats');
    currentFile = file;

    // 用 FileReader 读取为 Data URI
    const reader = new FileReader();
    reader.onload = () => {
      currentDataUrl = reader.result;
      outputEl.value = currentDataUrl;

      // 预览
      preview.src = currentDataUrl;
      preview.hidden = false;
      preview.classList.add('has-image');
      dropzone.querySelector('span').style.opacity = '0.1';

      // 大小统计
      $('b64StatName').textContent = file.name;
      $('b64StatMime').textContent = file.type || '未知';
      $('b64StatBytes').textContent = formatBytes(file.size);
      $('b64StatLen').textContent = (currentDataUrl.length).toLocaleString() + ' 字符';
      $('b64StatSize').textContent = '加载中...';
      stats.hidden = false;

      getImageSize(currentDataUrl).then((size) => {
        $('b64StatSize').textContent = size ? size.width + ' x ' + size.height : '未知';
      });

      $('b64Download').disabled = false;
      setStatus(statusEl, '转换完成，点击"复制结果"即可使用。', 'success');
    };
    reader.onerror = () => {
      setStatus(statusEl, '读取图片失败，请重试。', 'error');
    };
    reader.readAsDataURL(file);
  }

  function initToBase64() {
    const input = $('b64FileInput');
    const dropzone = $('b64Dropzone');

    input.addEventListener('change', () => {
      handleFile(input.files[0]);
      input.value = '';
    });

    // 拖拽上传
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
      if (file && file.type.startsWith('image/')) {
        handleFile(file);
      }
    });

    // 复制结果
    $('b64Copy').addEventListener('click', async () => {
      if (!outputEl.value) {
        setStatus(statusEl, '没有可复制的内容，请先上传图片。', 'error');
        return;
      }
      const ok = await copyText(outputEl.value);
      setStatus(statusEl, ok ? '已复制到剪贴板。' : '复制失败，请手动选择文本复制。', ok ? 'success' : 'error');
    });

    // 下载图片（还原原始文件）
    $('b64Download').addEventListener('click', () => {
      if (!currentFile) return;
      const url = URL.createObjectURL(currentFile);
      triggerDownload(url, currentFile.name || 'image');
    });

    // 清空
    $('b64Clear').addEventListener('click', () => {
      currentDataUrl = '';
      currentFile = null;
      outputEl.value = '';
      input.value = '';
      const preview = $('b64Preview');
      preview.hidden = true;
      preview.classList.remove('has-image');
      preview.removeAttribute('src');
      $('b64Dropzone').querySelector('span').style.opacity = '';
      $('b64Stats').hidden = true;
      $('b64Download').disabled = true;
      setStatus(statusEl, '已清空。');
    });
  }

  // ════════════════════════════════════════
  // 方向二：Base64 → 图片
  // ════════════════════════════════════════
  const decodeStatusEl = $('b64DecodeStatus');
  const decodeInputEl = $('b64Input');
  let decodedUrl = '';   // 解析成功后的 Data URI（用于下载）
  let decodedFile = null;

  // 规范化输入的 Base64：
  //  - 保留 data:image/... 前缀，直接使用
  //  - 纯 Base64 时自动拼接 data:image/png;base64 前缀尝试预览
  function normalizeBase64(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(text)) {
      return { url: text, mime: text.match(/^data:([^;,]+)/i)[1] };
    }
    // 去掉可能的空白字符（如复制产生的换行）后再校验
    const compact = text.replace(/\s+/g, '');
    const b64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;
    if (b64Pattern.test(compact)) {
      return { url: 'data:image/png;base64,' + compact, mime: 'image/png（自动识别）' };
    }
    return null;
  }

  function initToImage() {
    $('b64Decode').addEventListener('click', () => {
      const parsed = normalizeBase64(decodeInputEl.value);
      if (!parsed) {
        setStatus(decodeStatusEl, '无法识别的 Base64 文本，请检查格式。', 'error');
        $('b64DecodedPreview').hidden = true;
        $('b64DecodeStats').hidden = true;
        decodedUrl = '';
        decodedFile = null;
        $('b64DlDecoded').disabled = true;
        return;
      }

      const img = $('b64DecodedPreview');
      const stats = $('b64DecodeStats');
      const mime = parsed.mime;
      const len = decodeInputEl.value.replace(/\s+/g, '').length;

      decodedUrl = parsed.url;

      // 尝试解码为 Blob（用于下载还原原图）
      try {
        const b64Body = parsed.url.slice(parsed.url.indexOf('base64,') + 7);
        const bin = atob(b64Body);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const realMime = mime.startsWith('image/') ? mime : 'image/png';
        decodedFile = new Blob([bytes], { type: realMime });
      } catch (e) {
        decodedFile = null;
      }

      // 预览
      img.onload = () => {
        $('b64DecodeMime').textContent = mime;
        $('b64DecodeSize').textContent = img.naturalWidth + ' x ' + img.naturalHeight;
        $('b64DecodeLen').textContent = len.toLocaleString() + ' 字符';
        stats.hidden = false;
        $('b64DlDecoded').disabled = false;
        // 自适应预览：图片小于等于容器时等比缩放填满；否则保持原始尺寸，容器滚动查看
        const box = img.parentElement;
        if (box) {
          const bw = box.clientWidth - 16;
          const bh = box.clientHeight - 16;
          if (img.naturalWidth <= bw && img.naturalHeight <= bh) {
            img.classList.add('fit');
          } else {
            img.classList.remove('fit');
          }
        }
        setStatus(decodeStatusEl, '解析成功，图片已还原。', 'success');
      };
      img.onerror = () => {
        setStatus(decodeStatusEl, 'Base64 无法解码为有效图片，请检查内容是否完整。', 'error');
        stats.hidden = true;
        $('b64DlDecoded').disabled = true;
        img.hidden = true;
        const empty = document.querySelector('.b64-preview-empty');
        if (empty) empty.style.display = 'block';
      };
      img.src = parsed.url;
      img.hidden = false;
      document.querySelector('.b64-preview-empty').style.display = 'none';
    });

    // 下载还原的图片
    $('b64DlDecoded').addEventListener('click', () => {
      if (!decodedFile) return;
      const url = URL.createObjectURL(decodedFile);
      const ext = (decodedFile.type || 'image/png').split('/')[1] || 'png';
      triggerDownload(url, 'decoded_image.' + ext);
      setStatus(decodeStatusEl, '已开始下载还原的图片。', 'success');
    });

    // 清空
    $('b64ClearDecoded').addEventListener('click', () => {
      decodeInputEl.value = '';
      const img = $('b64DecodedPreview');
      img.hidden = true;
      img.removeAttribute('src');
      $('b64DecodeStats').hidden = true;
      document.querySelector('.b64-preview-empty').style.display = '';
      decodedUrl = '';
      decodedFile = null;
      $('b64DlDecoded').disabled = true;
      setStatus(decodeStatusEl, '已清空。');
    });
  }

  // ─── 初始化 ───
  function init() {
    initTabs();
    initToBase64();
    initToImage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
