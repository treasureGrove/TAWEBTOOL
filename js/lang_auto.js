/**
 * 多语言自动切换：根据访客 IP 所在国家/地区判断语言，
 * 在首页自动跳转到对应语言版本，并记住用户手动选择。
 * 仅首页自动跳转，避免破坏深层链接与 SEO。
 */
(function () {
  var KEY = 'taw_lang_pref';
  var ZH = ['CN', 'HK', 'TW', 'MO', 'SG', 'MY'];

  // 手动切换（供页面上的 中/EN 链接调用）
  window.switchLang = function (lang) {
    localStorage.setItem(KEY, lang);
    var path = location.pathname;
    if (lang === 'en') {
      if (path !== '/en/' && path !== '/en/index.html') location.href = '/en/';
    } else {
      if (path !== '/' && path !== '/index.html') location.href = '/';
    }
  };

  // 已手动选择过则不再自动跳转
  if (localStorage.getItem(KEY)) return;

  var path = location.pathname;
  var onHome = path === '/' || path === '/index.html';
  var onEn = path === '/en/' || path === '/en/index.html';
  if (!onHome && !onEn) return; // 只处理首页

  function detect(cb) {
    var apis = [
      { url: 'https://ipwho.is/', parse: function (d) { return d && d.country_code; } },
      { url: 'https://ipapi.co/json/', parse: function (d) { return d && d.country_code; } }
    ];
    var i = 0;
    (function tryNext() {
      if (i >= apis.length) { cb(''); return; }
      var a = apis[i++];
      var xhr = new XMLHttpRequest();
      xhr.onload = function () {
        try { cb(a.parse(JSON.parse(xhr.responseText)) || ''); } catch (e) { tryNext(); }
      };
      xhr.onerror = tryNext;
      xhr.timeout = 3500;
      xhr.ontimeout = tryNext;
      xhr.open('GET', a.url, true);
      xhr.send();
    })();
  }

  detect(function (cc) {
    if (!cc) return;
    cc = cc.toUpperCase();
    var isZh = ZH.indexOf(cc) >= 0;
    if (onHome && !isZh) {
      localStorage.setItem(KEY, 'en');
      location.href = '/en/';
    } else if (onEn && isZh) {
      localStorage.setItem(KEY, 'zh');
      location.href = '/';
    }
  });
})();
