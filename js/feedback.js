(function () {
  'use strict';
  if (window.__feedbackInjected) return;
  window.__feedbackInjected = true;

  var MAX_IMAGES = 3;
  var MAX_SIDE = 1600;
  var images = [];

  var style = document.createElement('style');
  style.textContent = [
    '.fb-fab{position:fixed;right:18px;bottom:18px;z-index:9998;display:inline-flex;align-items:center;gap:8px;height:44px;padding:0 18px;border:none;border-radius:22px;cursor:pointer;color:#fff;font-size:14px;font-weight:700;background:linear-gradient(135deg,#168f72,#0e6b55);box-shadow:0 6px 20px rgba(14,107,85,.35);transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s}',
    '.fb-fab:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(14,107,85,.45)}',
    '.fb-fab svg{width:18px;height:18px;flex:0 0 auto}',
    '.fb-overlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(15,30,26,.42);backdrop-filter:blur(4px)}',
    '.fb-overlay.open{display:flex}',
    '.fb-modal{width:100%;max-width:480px;max-height:90vh;overflow-y:auto;border-radius:16px;background:rgba(255,255,255,.97);box-shadow:0 20px 60px rgba(10,30,25,.35);color:#1f2933;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
    '.fb-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 0}',
    '.fb-head h2{margin:0;font-size:18px;font-weight:700}',
    '.fb-close{border:none;background:transparent;cursor:pointer;font-size:22px;color:#667085;line-height:1;padding:4px}',
    '.fb-close:hover{color:#1f2933}',
    '.fb-body{padding:14px 22px 22px;display:grid;gap:12px}',
    '.fb-field{display:grid;gap:6px}',
    '.fb-field label{font-size:13px;font-weight:600;color:#344054}',
    '.fb-field label small{color:#98a2b3;font-weight:400}',
    '.fb-field input,.fb-field select,.fb-field textarea{width:100%;box-sizing:border-box;border:1px solid #d0d5dd;border-radius:9px;padding:9px 11px;font-size:14px;color:#1f2933;background:#fff;font-family:inherit}',
    '.fb-field input:focus,.fb-field select:focus,.fb-field textarea:focus{outline:none;border-color:#168f72;box-shadow:0 0 0 3px rgba(22,143,114,.12)}',
    '.fb-field textarea{min-height:96px;resize:vertical}',
    '.fb-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
    '.fb-images{display:flex;flex-wrap:wrap;gap:8px}',
    '.fb-thumb{position:relative;width:72px;height:72px;border-radius:9px;overflow:hidden;border:1px solid #d0d5dd;background:#f2f4f7}',
    '.fb-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
    '.fb-thumb button{position:absolute;top:2px;right:2px;width:20px;height:20px;border:none;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:12px;line-height:1;cursor:pointer}',
    '.fb-add{border:1px dashed #c3cbd6;border-radius:9px;background:#fff;cursor:pointer;color:#667085;font-size:12px;display:inline-flex;align-items:center;justify-content:center;width:72px;height:72px}',
    '.fb-add:hover{border-color:#168f72;color:#168f72}',
    '.fb-submit{border:none;border-radius:10px;height:42px;cursor:pointer;color:#fff;font-size:15px;font-weight:700;background:linear-gradient(135deg,#168f72,#0e6b55);box-shadow:0 4px 12px rgba(14,107,85,.25);transition:transform .2s,box-shadow .2s}',
    '.fb-submit:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(14,107,85,.35)}',
    '.fb-submit:disabled{opacity:.6;cursor:not-allowed;transform:none}',
    '.fb-msg{display:none;font-size:13px;line-height:1.5;padding:10px 12px;border-radius:9px}',
    '.fb-msg.ok{display:block;color:#0e6b55;background:#e8f6f1}',
    '.fb-msg.err{display:block;color:#b42318;background:#fef3f2}',
    '@media (max-width:560px){.fb-row{grid-template-columns:1fr}}'
  ].join('\n');
  document.head.appendChild(style);

  var fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fb-fab';
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>反馈</span>';
  document.body.appendChild(fab);

  var overlay = document.createElement('div');
  overlay.className = 'fb-overlay';
  overlay.innerHTML = [
    '<div class="fb-modal" role="dialog" aria-modal="true">',
    '  <div class="fb-head">',
    '    <h2>意见反馈</h2>',
    '    <button type="button" class="fb-close" aria-label="关闭">&times;</button>',
    '  </div>',
    '  <div class="fb-body">',
    '    <div class="fb-field">',
    '      <label>邮箱 <small>(必填，方便回复你)</small></label>',
    '      <input type="email" id="fbEmail" placeholder="you@example.com" autocomplete="email">',
    '    </div>',
    '    <div class="fb-row">',
    '      <div class="fb-field">',
    '        <label>QQ <small>(选填)</small></label>',
    '        <input type="text" id="fbQq" placeholder="选填">',
    '      </div>',
    '      <div class="fb-field">',
    '        <label>微信 <small>(选填)</small></label>',
    '        <input type="text" id="fbWechat" placeholder="选填">',
    '      </div>',
    '    </div>',
    '    <div class="fb-field">',
    '      <label>反馈类型</label>',
    '      <select id="fbType">',
    '        <option value="bug">问题反馈 (Bug)</option>',
    '        <option value="suggestion">功能建议</option>',
    '        <option value="other">其他</option>',
    '      </select>',
    '    </div>',
    '    <div class="fb-field">',
    '      <label>反馈内容 <small>(必填)</small></label>',
    '      <textarea id="fbMessage" placeholder="请描述遇到的问题或建议，越详细越好～"></textarea>',
    '    </div>',
    '    <div class="fb-field">',
    '      <label>截图 <small>(选填，最多 3 张)</small></label>',
    '      <div class="fb-images" id="fbImages"></div>',
    '      <input type="file" id="fbFileInput" accept="image/*" multiple style="display:none">',
    '    </div>',
    '    <div class="fb-msg" id="fbMsg"></div>',
    '    <button type="button" class="fb-submit" id="fbSubmit">提交反馈</button>',
    '  </div>',
    '</div>'
  ].join('\n');
  document.body.appendChild(overlay);

  var emailEl = overlay.querySelector('#fbEmail');
  var qqEl = overlay.querySelector('#fbQq');
  var wechatEl = overlay.querySelector('#fbWechat');
  var typeEl = overlay.querySelector('#fbType');
  var messageEl = overlay.querySelector('#fbMessage');
  var imagesEl = overlay.querySelector('#fbImages');
  var fileInput = overlay.querySelector('#fbFileInput');
  var msgEl = overlay.querySelector('#fbMsg');
  var submitBtn = overlay.querySelector('#fbSubmit');

  function open() {
    overlay.classList.add('open');
    msgEl.className = 'fb-msg';
    msgEl.textContent = '';
    setTimeout(function () { emailEl.focus(); }, 50);
  }
  function close() {
    overlay.classList.remove('open');
  }

  fab.addEventListener('click', open);
  overlay.querySelector('.fb-close').addEventListener('click', close);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });

  function renderImages() {
    imagesEl.innerHTML = '';
    images.forEach(function (dataUrl, index) {
      var thumb = document.createElement('div');
      thumb.className = 'fb-thumb';
      thumb.innerHTML = '<img src="' + dataUrl + '" alt=""><button type="button" aria-label="删除">&times;</button>';
      thumb.querySelector('button').addEventListener('click', function () {
        images.splice(index, 1);
        renderImages();
      });
      imagesEl.appendChild(thumb);
    });
    if (images.length < MAX_IMAGES) {
      var add = document.createElement('button');
      add.type = 'button';
      add.className = 'fb-add';
      add.textContent = '+ 图片';
      add.addEventListener('click', function () { fileInput.click(); });
      imagesEl.appendChild(add);
    }
  }

  function compressImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (w > MAX_SIDE || h > MAX_SIDE) {
            var scale = Math.min(MAX_SIDE / w, MAX_SIDE / h);
            w = Math.max(1, Math.round(w * scale));
            h = Math.max(1, Math.round(h * scale));
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          cb(canvas.toDataURL('image/jpeg', 0.85));
        } catch (err) {
          cb(null);
        }
      };
      img.onerror = function () { cb(null); };
      img.src = e.target.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  fileInput.addEventListener('change', function () {
    var files = Array.prototype.slice.call(fileInput.files || []);
    var remain = MAX_IMAGES - images.length;
    if (remain <= 0) { fileInput.value = ''; return; }
    var todo = files.slice(0, remain);
    var done = 0;
    todo.forEach(function (file) {
      if (file.size > 10 * 1024 * 1024) {
        showMsg('图片 "' + file.name + '" 超过 10MB，已跳过', true);
        done++;
        if (done === todo.length) { fileInput.value = ''; renderImages(); }
        return;
      }
      compressImage(file, function (dataUrl) {
        if (dataUrl) images.push(dataUrl);
        done++;
        if (done === todo.length) {
          fileInput.value = '';
          renderImages();
        }
      });
    });
  });

  function showMsg(text, isErr) {
    msgEl.className = 'fb-msg ' + (isErr ? 'err' : 'ok');
    msgEl.textContent = text;
  }

  submitBtn.addEventListener('click', function () {
    var email = emailEl.value.trim();
    var message = messageEl.value.trim();

    if (!email) { showMsg('请填写邮箱地址', true); emailEl.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showMsg('邮箱格式不正确', true); emailEl.focus(); return; }
    if (!message) { showMsg('请填写反馈内容', true); messageEl.focus(); return; }

    var payload = {
      email: email,
      qq: qqEl.value.trim(),
      wechat: wechatEl.value.trim(),
      type: typeEl.value,
      message: message,
      images: images,
      page: window.location.href
    };

    submitBtn.disabled = true;
    submitBtn.textContent = '提交中...';

    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (resp) {
      return resp.json().then(function (data) { return { ok: resp.ok, data: data }; });
    }).then(function (r) {
      if (r.ok) {
        showMsg('反馈已提交，感谢你的帮助！', false);
        emailEl.value = '';
        qqEl.value = '';
        wechatEl.value = '';
        messageEl.value = '';
        images = [];
        renderImages();
      } else {
        showMsg((r.data && r.data.error && r.data.error.message) || '提交失败，请稍后重试', true);
      }
    }).catch(function () {
      showMsg('网络错误，请稍后重试', true);
    }).then(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = '提交反馈';
    });
  });

  renderImages();
})();
