(function () {
  function $(id) { return document.getElementById(id); }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function formatPlainMessage(content) {
    return escapeHtml(content).replace(/\n/g, '<br>');
  }

  const markdownOptions = {
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false
  };

  const markdownSanitizeOptions = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
      'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'sup', 'sub'
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class', 'src', 'alt', 'loading']
  };

  function renderMarkdown(content) {
    const text = String(content ?? '');
    const parser = window.marked && (window.marked.parse || window.marked);
    if (typeof parser !== 'function') {
      return formatPlainMessage(text);
    }
    const raw = parser(text, markdownOptions);
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(raw, markdownSanitizeOptions);
    }
    return formatPlainMessage(text);
  }

  function initChatgptTool(host) {
    host.innerHTML = `
      <div class="chat-tool">
        <div id="chatMessages" class="chat-messages" aria-live="polite"></div>
        <div id="chatEmptyState" class="chat-empty-state">
          <div class="chat-home">
            <div class="chat-home-header">
              <span class="chat-home-badge">ChatGPT</span>
              <h2>今天想聊点什么？</h2>
              <p>免登录即可使用，支持连续上下文对话。</p>
            </div>
            <div class="quick-prompts">
              <button type="button" class="prompt-card" data-prompt="帮我做一个今天的学习计划">
                <span class="prompt-title">学习计划</span>
                <span class="prompt-desc">快速生成今日学习安排。</span>
              </button>
              <button type="button" class="prompt-card" data-prompt="给我 5 道 TA 技术美术面试题，并附带参考答案">
                <span class="prompt-title">TA 技术美术面试</span>
                <span class="prompt-desc">覆盖渲染、Shader、管线相关高频题。</span>
              </button>
              <button type="button" class="prompt-card" data-prompt="帮我优化一段产品功能文案，面向新手用户">
                <span class="prompt-title">文案优化</span>
                <span class="prompt-desc">更清晰、更易懂的表达。</span>
              </button>
              <button type="button" class="prompt-card" data-prompt="把下面的会议记录整理成三点结论和待办清单">
                <span class="prompt-title">会议总结</span>
                <span class="prompt-desc">快速提炼重点与行动项。</span>
              </button>
              <button type="button" class="prompt-card" data-prompt="请帮我优化一个 PBR 材质的渲染表现，给出排查清单和可操作建议">
                <span class="prompt-title">材质优化</span>
                <span class="prompt-desc">PBR 渲染表现排查与改进。</span>
              </button>
              <button type="button" class="prompt-card" data-prompt="请给出一个 TA 项目性能优化的排查流程，包含渲染、Shader、贴图与批次">
                <span class="prompt-title">TA 性能优化</span>
                <span class="prompt-desc">渲染/Shader/贴图/批次优化路径。</span>
              </button>
            </div>
          </div>
        </div>
        <div class="chat-input-wrap">
          <div class="chat-input-shell">
            <textarea id="chatInput" placeholder="向 ChatGPT 发送消息"></textarea>
            <button id="sendChat" class="send-btn" type="button" aria-label="发送">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M4 10h10M11 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
          <div class="chat-input-toolbar">
            <span class="hint">已接入智谱 GLM-4.7-Flash，免登录使用，避免输入敏感信息。</span>
            <button id="clearChat" class="ghost-btn" type="button">清空对话</button>
          </div>
        </div>
      </div>
    `;

    const messageBox = $('chatMessages');
    const input = $('chatInput');
    const sendBtn = $('sendChat');
    const clearBtn = $('clearChat');
    const emptyState = $('chatEmptyState');
    const chatTool = host.querySelector('.chat-tool');
    const storeKey = 'tool-chatgpt-messages';
    const systemPrompt = '你是一个简洁、友好的中文 AI 助手。';
    const zhipuApiKey = '48ca4cce66704a418ec6e25f2f4d5cdd.tCF9NFIxQjsM8ucW';
    const requestTimeoutMs = 60000;
    const timeoutRetryLimit = 1;
    let pending = false;
    let history = [];

    function persist() {
      localStorage.setItem(storeKey, JSON.stringify(history));
    }

    function updateEmptyState() {
      emptyState.style.display = history.length ? 'none' : 'flex';
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
      const bodyHtml = isLoading
        ? '<span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span>'
        : renderMarkdown(content);
      item.innerHTML = `
        <div class="chat-message-header">
          <span class="chat-role">${role === 'user' ? '你' : 'ChatGPT'}</span>
        </div>
        <div class="chat-message-body">${bodyHtml}</div>
      `;
      messageBox.appendChild(item);
      item.querySelectorAll('a').forEach((link) => {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      });
      item.querySelectorAll('img').forEach((img) => {
        if (!img.getAttribute('loading')) {
          img.loading = 'lazy';
        }
        img.addEventListener('load', scrollToBottom);
      });
      scrollToBottom();
      return item;
    }

    function updateSendState() {
      sendBtn.disabled = pending || !input.value.trim();
    }

    function scrollToBottom() {
      requestAnimationFrame(() => {
        messageBox.scrollTop = messageBox.scrollHeight;
      });
    }

    function autoResizeInput() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
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
      updateSendState();
      scrollToBottom();
    }

    async function sendMessage(textFromPrompt) {
      if (pending) return;

      const text = (textFromPrompt || input.value).trim();
      if (!text) return;

      appendMessage('user', text);
      input.value = '';
      autoResizeInput();
      pending = true;
      updateSendState();
      const loadingNode = renderMessage('assistant', '', true);

      try {
        const messages = [{ role: 'system', content: systemPrompt }, ...history].slice(-20);
        let res;
        for (let attempt = 0; attempt <= timeoutRetryLimit; attempt += 1) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
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
            break;
          } catch (err) {
            if (err?.name === 'AbortError' && attempt < timeoutRetryLimit) {
              continue;
            }
            throw err;
          } finally {
            clearTimeout(timeout);
          }
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
        updateSendState();
      }
    }

    sendBtn.addEventListener('click', () => sendMessage());
    clearBtn.addEventListener('click', clearChat);
    input.addEventListener('input', () => {
      autoResizeInput();
      updateSendState();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage();
      }
    });
    if (chatTool) {
      chatTool.addEventListener('wheel', (event) => {
        if (event.defaultPrevented) return;
        if (event.target.closest('.chat-messages')) return;
        if (event.target.closest('#chatInput') && input.scrollHeight > input.clientHeight) return;
        if (messageBox.scrollHeight <= messageBox.clientHeight) return;
        messageBox.scrollTop += event.deltaY;
        event.preventDefault();
      }, { passive: false });
    }

    host.querySelectorAll('.quick-prompts button').forEach((btn) => {
      btn.addEventListener('click', () => sendMessage(btn.dataset.prompt));
    });

    loadHistory();
    autoResizeInput();
    updateSendState();
    scrollToBottom();
  }

  window.initChatgptTool = initChatgptTool;
})();
