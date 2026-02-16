(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatMessage(content) {
    return escapeHtml(content).replace(/\n/g, '<br>');
  }

  function initChatgptTool(host) {
    host.innerHTML = `
      <div class="chat-tool">
        <div id="chatMessages" class="chat-messages" aria-live="polite"></div>
        <div id="chatEmptyState" class="chat-empty-state">
          <h2>今天想聊点什么？</h2>
          <p>免登录即可使用，支持连续上下文对话。</p>
          <div class="quick-prompts">
            <button type="button" data-prompt="帮我做一个今天的学习计划">学习计划</button>
            <button type="button" data-prompt="给我一段 JavaScript 面试题">前端面试</button>
            <button type="button" data-prompt="帮我优化一个产品功能文案">文案优化</button>
          </div>
        </div>
        <div class="chat-input-wrap">
          <textarea id="chatInput" placeholder="输入消息，Enter 发送，Shift+Enter 换行"></textarea>
          <div class="chat-input-toolbar">
            <span class="hint">已接入智谱 GLM-4.7-Flash，免登录使用，避免输入敏感信息。</span>
            <div>
              <button id="clearChat" class="ghost-btn" type="button">清空对话</button>
              <button id="sendChat" type="button">发送</button>
            </div>
          </div>
        </div>
      </div>
    `;

    const messageBox = $('chatMessages');
    const input = $('chatInput');
    const sendBtn = $('sendChat');
    const clearBtn = $('clearChat');
    const emptyState = $('chatEmptyState');
    const storeKey = 'tool-chatgpt-messages';
    const systemPrompt = '你是一个简洁、友好的中文 AI 助手。';
    const zhipuApiKey = '48ca4cce66704a418ec6e25f2f4d5cdd.tCF9NFIxQjsM8ucW';
    let pending = false;
    let history = [];

    function persist() {
      localStorage.setItem(storeKey, JSON.stringify(history));
    }

    function updateEmptyState() {
      emptyState.style.display = history.length ? 'none' : 'block';
      messageBox.style.display = history.length ? 'flex' : 'none';
    }

    function normalizeAssistantContent(content) {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .map((item) => (typeof item === 'string' ? item : item?.text || ''))
          .filter(Boolean)
          .join('\n');
      }
      return '';
    }

    function renderMessage(role, content, isLoading = false) {
      const item = document.createElement('article');
      item.className = `chat-message ${role}`;
      item.innerHTML = `
        <strong>${role === 'user' ? '你' : 'ChatGPT'}</strong>
        <p>${isLoading ? '<span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span>' : formatMessage(content)}</p>
      `;
      messageBox.appendChild(item);
      messageBox.scrollTop = messageBox.scrollHeight;
      return item;
    }

    function appendMessage(role, content, save = true) {
      renderMessage(role, content);
      if (!save) return;
      history.push({ role, content });
      persist();
      updateEmptyState();
    }

    function loadHistory() {
      try {
        history = JSON.parse(localStorage.getItem(storeKey) || '[]');
      } catch (_) {
        history = [];
      }

      history.forEach((msg) => renderMessage(msg.role, msg.content));
      updateEmptyState();
    }

    function clearChat() {
      history = [];
      localStorage.removeItem(storeKey);
      messageBox.innerHTML = '';
      updateEmptyState();
    }

    async function sendMessage(textFromPrompt) {
      if (pending) return;

      const text = (textFromPrompt || input.value).trim();
      if (!text) return;

      appendMessage('user', text);
      input.value = '';
      pending = true;
      sendBtn.disabled = true;
      const loadingNode = renderMessage('assistant', '', true);

      try {
        const messages = [{ role: 'system', content: systemPrompt }, ...history].slice(-20);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let res;
        try {
          res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${zhipuApiKey}`
            },
            body: JSON.stringify({
              model: 'glm-4.7-flash',
              messages,
              temperature: 0.7,
              stream: false
            }),
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeout);
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const apiMsg = data?.error?.message || data?.message || `HTTP ${res.status}`;
          throw new Error(apiMsg);
        }

        const answer = normalizeAssistantContent(data?.choices?.[0]?.message?.content).trim() || '暂时没有生成内容，请稍后再试。';
        loadingNode.remove();
        appendMessage('assistant', answer);
      } catch (err) {
        loadingNode.remove();
        const message = err?.name === 'AbortError' ? '请求超时，请稍后重试。' : `请求失败：${err.message}。请稍后重试。`;
        appendMessage('assistant', message);
      } finally {
        pending = false;
        sendBtn.disabled = false;
      }
    }

    sendBtn.addEventListener('click', () => sendMessage());
    clearBtn.addEventListener('click', clearChat);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    host.querySelectorAll('.quick-prompts button').forEach((btn) => {
      btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
    });

    loadHistory();
  }

  window.initChatgptTool = initChatgptTool;
})();
