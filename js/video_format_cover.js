// ─── 视频格式转换 — FFmpeg Worker 架构 ───
(function () {
    'use strict';
    function $(id) { return document.getElementById(id); }
    function q(sel) { return document.querySelector(sel); }

    var prefix = (window.location.pathname.replace(/\\/g, '/').includes('/tools_html/')) ? '../' : '';
    var formatExt = { mp4: 'mp4', webm: 'webm', gif: 'gif', avi: 'avi', mov: 'mov', mkv: 'mkv' };
    var formatMime = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif', avi: 'video/x-msvideo', mov: 'video/quicktime', mkv: 'video/x-matroska' };

    var worker = null;
    var state = { file: null, processing: false, cancelled: false, isGif: false, workerReady: false };

    function log(msg, type) {
        var t = new Date().toLocaleTimeString();
        var icon = type === 'error' ? 'X' : type === 'success' ? 'OK' : '  ';
        var el = $('vfcLog');
        el.textContent += '[' + t + '] ' + icon + ' ' + msg + '\n';
        el.scrollTop = el.scrollHeight;
    }
    function setProgress(pct) {
        $('vfcProgressFill').style.width = Math.round(pct) + '%';
        $('vfcProgressText').textContent = Math.round(pct) + '%';
    }
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(2) + ' MB';
    }
    function getFormat() {
        var el = q('input[name="fmt"]:checked');
        return el ? el.value : 'mp4';
    }

    // ── Engine badge ──
    var engineBadge = $('vfcEngineBadge');
    function setBadge(text, cls) {
        engineBadge.textContent = text;
        engineBadge.className = 'vfc-badge ' + (cls || 'loading');
    }

    // ── Worker init ──
    function initWorker() {
        if (worker) return;
        setBadge('加载 FFmpeg...', 'loading');
        log('启动 FFmpeg Worker...');

        var workerUrl = prefix + '../js/video_format_worker.js';
        worker = new Worker(workerUrl);
        worker.onmessage = function (e) {
            var d = e.data;
            if (d.type === 'ready') {
                state.workerReady = true;
                setBadge('引擎就绪', 'ready');
                $('vfcConvertBtn').disabled = !state.file;
                log('FFmpeg 引擎就绪', 'success');
            } else if (d.type === 'log') {
                log(d.data);
            } else if (d.type === 'progress') {
                setProgress(d.data);
            } else if (d.type === 'result') {
                handleResult(new Uint8Array(d.data));
            } else if (d.type === 'error') {
                if (!state.cancelled) log('失败: ' + d.data, 'error');
                state.processing = false;
                $('vfcConvertBtn').disabled = false;
                $('vfcCancelBtn').disabled = true;
            }
        };
    }

    function handleResult(outData) {
        var format = getFormat();
        var blob = new Blob([outData.buffer], { type: formatMime[format] });
        var dlName = state.file.name.replace(/\.[^.]+$/, '') + '.' + formatExt[format];
        $('vfcResultSection').style.display = '';
        var url = URL.createObjectURL(blob);
        if (format === 'gif') {
            $('vfcResultGif').src = url; $('vfcResultGif').hidden = false;
            $('vfcResultVideo').hidden = true;
        } else {
            $('vfcResultVideo').src = url; $('vfcResultVideo').hidden = false;
            $('vfcResultGif').hidden = true;
        }
        var dl = $('vfcDownload');
        dl.href = url; dl.download = dlName;
        dl.textContent = '下载 ' + dlName + ' (' + (blob.size / 1048576).toFixed(2) + ' MB)';
        dl.hidden = false;
        setProgress(100);
        log('转换完成: ' + dlName, 'success');
        state.processing = false;
        $('vfcConvertBtn').disabled = false;
        $('vfcCancelBtn').disabled = true;
    }

    initWorker();

    // ── Upload ──
    var dropzone = $('vfcDropzone'), fileInput = $('vfcFile');
    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('dragover'); });
    dropzone.addEventListener('drop', function (e) {
        e.preventDefault(); dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    function handleFile(file) {
        state.file = file;
        state.isGif = (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif'));
        var url = URL.createObjectURL(file);
        $('vfcPreview').hidden = true; $('vfcPreviewGif').hidden = true;

        if (state.isGif) {
            $('vfcPreviewGif').src = url; $('vfcPreviewGif').hidden = false;
            $('vfcDropInner').style.display = 'none';
            var img = new Image();
            img.onload = function () {
                $('vfcMeta').textContent = file.name + ' | ' + formatSize(file.size) + ' | GIF | ' + img.naturalWidth + 'x' + img.naturalHeight;
                log('GIF 已加载: ' + file.name, 'success');
            };
            img.src = url;
            q('input[name="fmt"][value="mp4"]').checked = true;
        } else {
            $('vfcPreview').src = url; $('vfcPreview').hidden = false;
            $('vfcDropInner').style.display = 'none';
            $('vfcPreview').onloadedmetadata = function () {
                $('vfcMeta').textContent = file.name + ' | ' + formatSize(file.size) + ' | ' + $('vfcPreview').videoWidth + 'x' + $('vfcPreview').videoHeight + ' | ' + $('vfcPreview').duration.toFixed(1) + 's';
                log('视频已加载: ' + file.name, 'success');
                $('vfcEnd').value = $('vfcPreview').duration.toFixed(1) || '';
            };
        }
        if (state.workerReady) $('vfcConvertBtn').disabled = false;
    }

    // ── Presets ──
    document.querySelectorAll('.vfc-preset-bar button').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.vfc-preset-bar button').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            $('vfcWidth').value = btn.dataset.w;
            $('vfcHeight').value = btn.dataset.h;
        });
    });

    // ── Convert ──
    $('vfcConvertBtn').addEventListener('click', startConvert);
    $('vfcCancelBtn').addEventListener('click', function () {
        state.cancelled = true;
        log('已取消', 'warn');
    });

    async function startConvert() {
        if (!state.file) { log('请先选择文件', 'error'); return; }
        if (!state.workerReady) { log('引擎未就绪', 'error'); return; }
        if (state.processing) { log('已有任务进行中', 'warn'); return; }

        state.processing = true; state.cancelled = false;
        $('vfcConvertBtn').disabled = true;
        $('vfcCancelBtn').disabled = false;
        $('vfcResultSection').style.display = 'none';
        $('vfcProgressSection').style.display = '';
        setProgress(0); $('vfcLog').textContent = '';

        var format = getFormat();
        var outW = parseInt($('vfcWidth').value) || 0;
        var outH = parseInt($('vfcHeight').value) || 0;
        var fps = parseInt($('vfcFps').value) || 0;
        var bitrate = parseFloat($('vfcBitrate').value) || 4;
        var startT = parseFloat($('vfcStart').value) || 0;
        var endT = parseFloat($('vfcEnd').value) || 0;

        try {
            var fileBuf = await state.file.arrayBuffer();
            var fileData = new Uint8Array(fileBuf);
            log('输入: ' + formatSize(fileData.byteLength));

            var inName = 'in.' + state.file.name.split('.').pop().toLowerCase();
            var outName = 'out.' + formatExt[format];
            var args = ['-i', inName];

            if (startT > 0) args.push('-ss', startT.toFixed(3));
            if (endT > 0) args.push('-t', (endT - startT).toFixed(3));

            if (outW > 0 && outH > 0) args.push('-vf', 'scale=' + outW + ':' + outH);
            else if (outW > 0) args.push('-vf', 'scale=' + outW + ':-2');
            else if (outH > 0) args.push('-vf', 'scale=-2:' + outH);

            if (fps > 0) args.push('-r', String(fps));

            if (format === 'mp4') {
                args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-b:v', bitrate + 'M', '-pix_fmt', 'yuv420p');
            } else if (format === 'webm') {
                args.push('-c:v', 'libvpx-vp9', '-b:v', bitrate + 'M');
            } else if (format === 'gif') {
                args.push('-f', 'gif');
            } else {
                args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
            }

            args.push('-an', '-y', outName);

            worker.postMessage({
                type: 'run',
                inName: inName,
                outName: outName,
                args: args,
                fileData: fileData
            }, [fileData.buffer]);

        } catch (e) {
            log('失败: ' + (e.message || String(e)), 'error');
            state.processing = false;
            $('vfcConvertBtn').disabled = false;
            $('vfcCancelBtn').disabled = true;
        }
    }
})();
