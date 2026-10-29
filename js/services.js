/* Local demand drafts only: no request submission, storage, or automatic copy. */
(function (root) {
    'use strict';
    var FORUM = 'https://lolicode.com/t/ta';
    var EXAMPLES = {
        texture: {task: '按项目规范批量打包 ORM 贴图', problem: '每张贴图都要手动选择通道、导出和重命名，数量多时容易漏处理。', expected: '选择一组贴图后生成 ORM，保持原始尺寸，并列出缺失通道。', engine: 'UE 5.4 / Windows', scale: '约 300 张 2K 贴图，每周处理一次', constraints: '输出名称保留 _ORM 后缀', sample: '使用自生成的灰度测试图演示'},
        sprite: {task: '批量整理序列帧并接入引擎导入流程', problem: '拆分后仍需手动调整文件名、帧顺序和导入设置，重复处理容易出错。', expected: '按顺序导出图片与通用元数据，给出目标引擎的导入步骤，并用测试动画验证播放结果。', engine: 'Unity / UE，请改成实际版本', scale: '约 20 组动画，每组 64 帧', constraints: '命名与帧序必须可预测', sample: '使用自制的测试序列帧演示'},
        project: {task: '整理模型与贴图的项目检查规则', problem: '资产导入后才发现尺寸、命名或材质约定不一致，目前依靠人工检查。', expected: '根据确认的规则列出问题资产和原因，用公开测试资产核对检查结果。', engine: '请填写实际引擎、版本与平台', scale: '约 100 个资产，每次提交前检查', constraints: '先确认最小检查范围与报告格式', sample: '使用可公开的测试模型与贴图'}
    };
    var FIELDS = ['task', 'problem', 'expected', 'engine', 'scale', 'constraints', 'sample'];

    function clean(value, multiline) {
        var text = String(value == null ? '' : value).replace(/\r\n?/g, '\n')
            .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
        return (multiline ? text : text.replace(/\s+/g, ' ')) || '（待补充）';
    }
    function buildTemplate(fields) {
        var f = fields || {};
        var intent = f.intent === 'custom' ? 'TA 定制咨询' : '工具改进需求';
        return [
            '【' + intent + '】' + clean(f.task), '',
            '当前问题 / 现有流程：', clean(f.problem, true),
            '', '期望结果 / 验收方式：', clean(f.expected, true),
            '', '工具 / 引擎 / 版本：' + clean(f.engine),
            '规模 / 使用频率：' + clean(f.scale), '项目约束：' + clean(f.constraints),
            '可公开样例：' + clean(f.sample), '',
            '这是一份需求讨论稿，方案、交付范围与时间待讨论确认。'
        ].join('\n');
    }
    function readForm(doc) {
        var selected = doc.querySelector('input[name="svc-intent"]:checked');
        var fields = {intent: selected && selected.value === 'custom' ? 'custom' : 'improvement'};
        FIELDS.forEach(function (name) {
            var el = doc.getElementById('svc-' + name);
            fields[name] = el ? el.value : '';
        });
        return fields;
    }
    function init(doc) {
        var form = doc.getElementById('svc-form');
        var out = doc.getElementById('svc-output');
        var generateBtn = doc.getElementById('svc-generate');
        if (!form || !out || !generateBtn || form.dataset.initialized) return;
        form.dataset.initialized = 'true';
        var result = doc.getElementById('svc-result');
        var empty = doc.getElementById('svc-preview-empty');
        var badge = doc.getElementById('svc-draft-state');
        var tip = doc.getElementById('svc-tip');
        var copyTip = doc.getElementById('svc-copy-tip');
        var copyBtn = doc.getElementById('svc-copy');
        var snapshot = null;
        function status(el, text, state) {
            if (!el) return;
            el.textContent = text;
            el.dataset.state = state || '';
        }
        function fingerprint() { return JSON.stringify(readForm(doc)); }
        function refreshState() {
            if (snapshot === null) return;
            var stale = fingerprint() !== snapshot;
            status(badge, stale ? '内容已修改' : '已生成', stale ? 'stale' : 'ready');
            generateBtn.textContent = stale ? '更新讨论稿 →' : '重新生成讨论稿 →';
            copyBtn.textContent = stale ? '更新并复制' : '复制讨论稿';
            if (stale) {
                status(tip, '内容已修改。重新生成，或点击「更新并复制」获取最新内容。', 'stale');
                status(copyTip, '上方预览是上一版，复制时会先按当前填写内容更新。', 'stale');
            } else {
                if (tip.dataset.state === 'stale') status(tip, '讨论稿与当前填写内容一致。', 'ok');
                if (copyTip.dataset.state === 'stale') status(copyTip, '', '');
            }
        }
        function generate(scroll) {
            var fields = readForm(doc);
            var invalid = !fields.task.trim() ? 'task' : !fields.problem.trim() ? 'problem' : '';
            FIELDS.forEach(function (name) {
                var el = doc.getElementById('svc-' + name);
                if (el) el.removeAttribute('aria-invalid');
            });
            if (invalid) {
                var message = invalid === 'task' ? '请先填写一句话标题。' : '请描述「现在卡在哪里」，方便开始讨论。';
                status(tip, message, 'error');
                status(copyTip, message, 'error');
                var first = doc.getElementById('svc-' + invalid);
                first.setAttribute('aria-invalid', 'true');
                first.focus();
                return false;
            }
            out.value = buildTemplate(fields);
            snapshot = fingerprint();
            result.hidden = false;
            empty.hidden = true;
            status(tip, '讨论稿已生成。检查预览后，再复制到论坛。', 'ok');
            status(copyTip, '', '');
            refreshState();
            if (scroll && root.matchMedia && root.matchMedia('(max-width: 1239px)').matches) {
                result.scrollIntoView({block: 'start', behavior: 'auto'});
            }
            return true;
        }
        generateBtn.addEventListener('click', function () { generate(true); });
        form.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
                    && event.target.tagName === 'INPUT' && event.target.type !== 'radio') {
                event.preventDefault();
                generate(true);
            }
        });
        form.addEventListener('input', refreshState);
        form.addEventListener('change', refreshState);
        copyBtn.addEventListener('click', function () {
            if ((snapshot === null || fingerprint() !== snapshot) && !generate(false)) return;
            var text = out.value;
            var copiedSnapshot = snapshot;
            function fail() {
                status(copyTip, '浏览器未允许复制。已选中讨论稿，请手动复制。', 'error');
                out.focus(); out.select();
            }
            var clip = root.navigator && root.navigator.clipboard;
            if (!clip || typeof clip.writeText !== 'function') { fail(); return; }
            copyBtn.disabled = true;
            Promise.resolve().then(function () { return clip.writeText(text); }).then(function () {
                if (fingerprint() !== copiedSnapshot) {
                    refreshState();
                    status(copyTip, '已复制旧版；当前内容有变化，请再次复制最新讨论稿。', 'stale');
                } else {
                    status(copyTip, '已复制。到论坛点击「发布主题」，选择「TA知识」标签并粘贴。', 'ok');
                }
            }, fail).then(function () { copyBtn.disabled = false; });
        });
        doc.querySelectorAll('[data-intent]').forEach(function (link) {
            link.addEventListener('click', function () {
                var radio = doc.querySelector('input[name="svc-intent"][value="' + link.dataset.intent + '"]');
                if (radio) radio.checked = true;
                refreshState();
                doc.getElementById('svc-task').focus({preventScroll: true});
            });
        });
        doc.querySelectorAll('[data-topic]').forEach(function (button) {
            button.addEventListener('click', function () {
                var example = EXAMPLES[button.dataset.topic];
                if (!example) return;
                var filled = false;
                FIELDS.forEach(function (name) {
                    var el = doc.getElementById('svc-' + name);
                    if (el && !el.value.trim() && example[name]) { el.value = example[name]; filled = true; }
                });
                refreshState();
                status(tip, filled ? '示例已填入空白项，已有内容已保留。请改成你的实际需求。' : '已有填写内容已保留，你可以直接修改并生成讨论稿。', '');
                form.scrollIntoView({block: 'start', behavior: 'auto'});
                doc.getElementById('svc-task').focus({preventScroll: true});
            });
        });
        var feedback = doc.getElementById('svc-feedback');
        if (feedback) feedback.addEventListener('click', function () {
            var fab = doc.querySelector('.fb-fab');
            if (fab) fab.click();
            else status(doc.getElementById('svc-feedback-tip'), '反馈入口暂未加载。请使用页面右下角的反馈按钮，或到论坛说明问题。', 'error');
        });
        generateBtn.disabled = false;
    }
    root.ServicesIntent = {buildTemplate: buildTemplate, readForm: readForm, init: init, FORUM: FORUM};
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document); });
        else init(document);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
