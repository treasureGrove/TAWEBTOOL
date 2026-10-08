/* 服务意向：纯文本需求模板生成，globalThis.ServicesIntent 导出（无网络请求、不采集联系方式） */
(function (root) {
    'use strict';
    var FORUM = 'https://lolicode.com/t/ta';
    function clean(v) { return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/\r?\n/g, ' ').trim() || '（未填写）'; }
    function buildTemplate(f) {
        f = f || {};
        return [
            '【TA 服务需求讨论】',
            '说明：现阶段仅为需求讨论，产品尚未开售、不收费、不承诺接单。',
            '任务类型：' + clean(f.task),
            '引擎/版本：' + clean(f.engine),
            '规模/频率：' + clean(f.scale),
            '期望结果：' + clean(f.expected),
            '可公开样例：' + clean(f.sample),
            '提醒：私有项目请勿公开代码、凭据或未授权资产。',
            '发帖方式：复制本文后请自行登录 ' + FORUM + ' 发帖，本页不会代为提交。'
        ].join('\n');
    }
    function readForm(doc) {
        var g = function (id) { var el = doc.getElementById(id); return el ? el.value : ''; };
        return { task: g('svc-task'), engine: g('svc-engine'), scale: g('svc-scale'), expected: g('svc-expected'), sample: g('svc-sample') };
    }
    function setStatus(tip, text, state) {
        if (!tip) return;
        tip.textContent = text;
        if (state && typeof tip.setAttribute === 'function') tip.setAttribute('data-state', state);
    }
    function init(doc) {
        var btn = doc.getElementById('svc-generate'), out = doc.getElementById('svc-output'), tip = doc.getElementById('svc-tip');
        if (!btn || !out) return;
        var result = doc.getElementById('svc-result');
        var copyBtn = doc.getElementById('svc-copy');

        function copy() {
            var done = function () { setStatus(tip, '已复制到剪贴板。请到论坛 TA 区发帖，本页不会代为提交。', 'ok'); };
            var fail = function () {
                setStatus(tip, '复制失败，请手动全选下方文本框复制后，自行登录 ' + FORUM + ' 发帖。', 'error');
                if (typeof out.focus === 'function') out.focus();
                if (typeof out.select === 'function') out.select();
            };
            try {
                var clip = root.navigator && root.navigator.clipboard;
                if (clip && typeof clip.writeText === 'function') Promise.resolve(clip.writeText(out.value)).then(done, fail);
                else fail();
            } catch (_) { fail(); }
        }

        function reveal() {
            if (result) result.hidden = false;
            if (result && typeof result.scrollIntoView === 'function') {
                try { result.scrollIntoView({ block: 'nearest' }); } catch (_) {}
            }
        }

        btn.addEventListener('click', function () {
            var form = readForm(doc);
            if (!form.task.trim()) {
                setStatus(tip, '请先填写「任务类型」，再生成需求文本。', 'error');
                var first = doc.getElementById('svc-task');
                if (first && typeof first.focus === 'function') first.focus();
                return;
            }
            out.value = buildTemplate(form);
            reveal();
            copy();
        });

        if (copyBtn && typeof copyBtn.addEventListener === 'function') copyBtn.addEventListener('click', function () { if (!out.value) out.value = buildTemplate(readForm(doc)); copy(); });
    }
    root.ServicesIntent = { buildTemplate: buildTemplate, readForm: readForm, init: init, FORUM: FORUM };
    if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', function () { init(document); });
})(typeof globalThis !== 'undefined' ? globalThis : this);
