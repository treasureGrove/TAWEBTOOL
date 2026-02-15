(function () {
  function $(id) { return document.getElementById(id); }

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function saveTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function initWorkbench() {
    const panel = $('panel');
    if (!panel || !panel.dataset.localTool) return;

    const title = panel.dataset.toolTitle || '本地工具';
    panel.innerHTML = `
      <div class="local-workbench">
        <section class="workbench-card">
          <h2>${title} - 本地编辑区</h2>
          <p class="workbench-tip">所有内容都在你的浏览器本地处理，不上传服务器。</p>
          <div class="workbench-toolbar">
            <label>导入文本文件<input id="loadLocalFile" type="file" accept=".txt,.md,.json,.csv,.glsl,.js,.xml,.yaml,.yml,.ini,.cfg,.log"></label>
            <button id="saveLocalFile" class="secondary">导出文本</button>
            <button id="clearEditor" class="danger">清空</button>
          </div>
          <textarea id="localEditor" class="workbench-textarea" placeholder="在这里编辑内容，或导入本地文件..."></textarea>
        </section>
        <section class="workbench-card">
          <h2>${title} - 本地计算区</h2>
          <p class="workbench-tip">支持统计、编码、JSON处理与哈希计算（全部本地执行）。</p>
          <div class="compute-actions">
            <button data-action="stats">字数/行数统计</button>
            <button data-action="jsonFormat">JSON美化</button>
            <button data-action="jsonMinify">JSON压缩</button>
            <button data-action="base64Encode">Base64编码</button>
            <button data-action="base64Decode">Base64解码</button>
            <button data-action="sha256">SHA-256</button>
          </div>
          <div id="computeResult" class="result-box">等待执行...</div>
        </section>
      </div>
    `;

    const editor = $('localEditor');
    const result = $('computeResult');
    const storageKey = `tool-${panel.dataset.localTool}-local-editor`;

    const cached = localStorage.getItem(storageKey);
    if (cached) editor.value = cached;

    editor.addEventListener('input', () => {
      localStorage.setItem(storageKey, editor.value);
    });

    $('loadLocalFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      editor.value = await file.text();
      localStorage.setItem(storageKey, editor.value);
      result.textContent = `已导入: ${file.name} (${file.size} bytes)`;
    });

    $('saveLocalFile').addEventListener('click', () => {
      const fileName = `${panel.dataset.localTool || 'tool'}_local.txt`;
      saveTextFile(fileName, editor.value);
      result.textContent = `已导出: ${fileName}`;
    });

    $('clearEditor').addEventListener('click', () => {
      editor.value = '';
      localStorage.removeItem(storageKey);
      result.textContent = '编辑区已清空';
    });

    panel.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const text = editor.value;
        const action = button.dataset.action;
        try {
          if (action === 'stats') {
            const lines = text ? text.split(/\r?\n/).length : 0;
            const chars = text.length;
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            result.textContent = `字符数: ${chars}\n单词数: ${words}\n行数: ${lines}`;
          } else if (action === 'jsonFormat') {
            result.textContent = JSON.stringify(JSON.parse(text), null, 2);
          } else if (action === 'jsonMinify') {
            result.textContent = JSON.stringify(JSON.parse(text));
          } else if (action === 'base64Encode') {
            result.textContent = btoa(unescape(encodeURIComponent(text)));
          } else if (action === 'base64Decode') {
            result.textContent = decodeURIComponent(escape(atob(text.trim())));
          } else if (action === 'sha256') {
            result.textContent = await sha256(text);
          }
        } catch (error) {
          result.textContent = `执行失败: ${error.message}`;
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', initWorkbench);
})();
