/* ============================================================
 *  Video Cut — 纯浏览器本地视频剪辑工具
 *  参考: 专业网页剪辑器 UI/UX
 *  功能: 裁剪 / 截图 / 提取音频 / 静音 / 变速
 * ============================================================ */
(function () {
    'use strict';

    /* ---------- DOM ---------- */
    var $ = function (id) { return document.getElementById(id); };

    var fileInput    = $('vcFileInput');
    var importBtn    = $('vcImportBtn');
    var exportBtn    = $('vcExportBtn');
    var dropzone     = $('vcDropzone');
    var emptyState   = $('vcEmptyState');
    var video        = $('vcVideo');
    var videoInfo    = $('vcVideoInfo');
    var playerCtrl   = $('vcPlayerControls');
    var timeline     = $('vcTimeline');
    var timelineTrack = $('vcTimelineTrack');
    var thumbStrip   = $('vcThumbStrip');
    var timelineClick = $('vcTimelineClick');
    var trimRegion   = $('vcTrimRegion');
    var handleL      = $('vcTrimHandleL');
    var handleR      = $('vcTrimHandleR');
    var playhead     = $('vcPlayhead');
    var playBtn      = $('vcPlayBtn');
    var playIcon     = $('vcPlayIcon');
    var pauseIcon    = $('vcPauseIcon');
    var muteBtn      = $('vcMuteBtn');
    var volumeSlider = $('vcVolume');
    var fullscreenBtn = $('vcFullscreenBtn');
    var curTimeEl    = $('vcCurrentTime');
    var totalTimeEl  = $('vcTotalTime');
    var labelStart   = $('vcTimeLabelStart');
    var labelEnd     = $('vcTimeLabelEnd');

    /* tool tabs & panels */
    var tabs = document.querySelectorAll('.vc-tab');
    var panels = document.querySelectorAll('.vc-tool-panel');

    /* trim */
    var trimStartInput = $('vcTrimStart');
    var trimEndInput   = $('vcTrimEnd');
    var trimDurEl      = $('vcTrimDuration');
    var trimPreviewBtn = $('vcTrimPreview');

    /* snapshot */
    var snapTimeInput  = $('vcSnapTime');
    var snapFormatSel  = $('vcSnapFormat');
    var snapQualityRng = $('vcSnapQuality');
    var snapQualityVal = $('vcSnapQualityVal');
    var snapQualityFld = $('vcSnapQualityField');
    var snapGoBtn      = $('vcSnapGo');

    /* audio */
    var audioRangeEl = $('vcAudioRange');

    /* speed */
    var speedRng  = $('vcSpeedRate');
    var speedVal = $('vcSpeedVal');
    var speedPresets = document.querySelectorAll('.vc-speed-presets button');

    /* export modal */
    var exportModal       = $('vcExportModal');
    var exportConfirmBtn  = $('vcExportConfirmBtn');
    var exportCancelBtn   = $('vcExportCancelBtn');
    var exportCloseBtn     = $('vcExportCloseBtn');
    var qualitySelect     = $('vcQualitySelect');
    var resSelect         = $('vcResSelect');
    var progressSection   = $('vcProgressSection');
    var progressFill      = $('vcProgressFill');
    var progressLabel     = $('vcProgressLabel');
    var progressPct       = $('vcProgressPct');
    var exportSettings    = $('vcExportSettings');
    var resultSection     = $('vcResultSection');
    var resultVideo       = $('vcResultVideo');
    var downloadBtn       = $('vcDownloadBtn');

    /* ---------- state ---------- */
    var state = {
        file: null,
        objectURL: null,
        duration: 0,
        trimStart: 0,
        trimEnd: 0,
        currentTab: 'trim',
        exportMode: 'trim',
        resultBlob: null,
        resultExt: 'webm'
    };

    /* ---------- helpers ---------- */
    function fmtTime(s) {
        if (!isFinite(s) || s < 0) s = 0;
        var m = Math.floor(s / 60);
        var sec = Math.floor(s % 60);
        return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    function clamp(v, lo, hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    function setProgress(pct, label) {
        progressFill.style.width = pct + '%';
        progressPct.textContent = Math.round(pct) + '%';
        if (label) progressLabel.textContent = label;
    }

    function getMimeType() {
        var types = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm'
        ];
        for (var i = 0; i < types.length; i++) {
            if (MediaRecorder.isTypeSupported(types[i])) return types[i];
        }
        return 'video/webm';
    }

    function setupCanvas(targetWidth) {
        var aspect = video.videoHeight / video.videoWidth || 0.5625;
        var w = targetWidth || video.videoWidth || 1280;
        var h = Math.round(w * aspect);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        return { canvas: canvas, ctx: ctx, w: w, h: h };
    }

    /* ---------- file import ---------- */
    function handleFile(file) {
        if (!file) return;
        if (file.type.indexOf('video') === -1) {
            alert('请选择视频文件');
            return;
        }
        if (state.objectURL) URL.revokeObjectURL(state.objectURL);
        state.file = file;
        state.objectURL = URL.createObjectURL(file);
        video.src = state.objectURL;
        video.load();
    }

    video.addEventListener('loadedmetadata', function () {
        state.duration = video.duration;
        state.trimStart = 0;
        state.trimEnd = video.duration;
        totalTimeEl.textContent = fmtTime(video.duration);
        curTimeEl.textContent = '00:00';
        videoInfo.textContent = file.name + ' · ' + Math.round(file.size / 1048576) + 'MB · ' +
            video.videoWidth + 'x' + video.videoHeight;
        labelStart.textContent = fmtTime(0);
        labelEnd.textContent = fmtTime(video.duration);
        trimEndInput.max = video.duration;
        trimStartInput.max = video.duration;
        trimStartInput.value = 0;
        trimEndInput.value = video.duration;
        trimDurEl.textContent = fmtTime(video.duration);
        audioRangeEl.textContent = '完整 (' + fmtTime(video.duration) + ')';
        updateTrimUI();
        generateThumbnails();
        emptyState.style.display = 'none';
        video.style.display = '';
        playerCtrl.style.display = '';
        timeline.style.display = '';
    });

    video.addEventListener('timeupdate', function () {
        curTimeEl.textContent = fmtTime(video.currentTime);
        if (video.duration > 0) {
            playhead.style.left = (video.currentTime / video.duration * 100) + '%';
        }
    });

    video.addEventListener('play', function () {
        playIcon.style.display = 'none';
        pauseIcon.style.display = '';
    });

    video.addEventListener('pause', function () {
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';
    });

    video.addEventListener('ended', function () {
        playIcon.style.display = '';
        pauseIcon.style.display = 'none';
    });

    /* ---------- import button & dropzone ---------- */
    importBtn.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
    });

    dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.classList.add('vc-dragover');
    });
    dropzone.addEventListener('dragleave', function () {
        dropzone.classList.remove('vc-dragover');
    });
    dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('vc-dragover');
        var f = e.dataTransfer.files[0];
        if (f) handleFile(f);
    });

    /* ---------- player controls ---------- */
    playBtn.addEventListener('click', function () {
        if (video.paused) video.play(); else video.pause();
    });

    muteBtn.addEventListener('click', function () {
        video.muted = !video.muted;
        muteBtn.textContent = video.muted ? '🔇' : '🔊';
    });

    volumeSlider.addEventListener('input', function () {
        video.volume = volumeSlider.value / 100;
    });

    fullscreenBtn.addEventListener('click', function () {
        if (video.requestFullscreen) video.requestFullscreen();
        else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
    });

    /* keyboard shortcuts */
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
        if (e.code === 'Space') {
            e.preventDefault();
            if (video.paused) video.play(); else video.pause();
        } else if (e.code === 'ArrowLeft') {
            video.currentTime = Math.max(0, video.currentTime - 5);
        } else if (e.code === 'ArrowRight') {
            video.currentTime = Math.min(video.duration, video.currentTime + 5);
        }
    });

    /* ---------- timeline ---------- */
    timelineClick.addEventListener('click', function (e) {
        var rect = timelineClick.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        video.currentTime = pct * video.duration;
    });

    function generateThumbnails() {
        thumbStrip.innerHTML = '';
        var count = 12;
        var seeker = document.createElement('video');
        seeker.src = state.objectURL;
        seeker.muted = true;
        seeker.crossOrigin = 'anonymous';

        var canvas = document.createElement('canvas');
        var thumbW = 80;
        canvas.width = thumbW;
        canvas.height = thumbW * (video.videoHeight / video.videoWidth) || 45;
        var ctx = canvas.getContext('2d');

        for (var i = 0; i < count; i++) {
            (function (idx) {
                var img = document.createElement('img');
                img.className = 'vc-thumb';
                thumbStrip.appendChild(img);
                seeker.currentTime = (idx + 0.5) / count * state.duration;
                seeker.addEventListener('seeked', function handler() {
                    seeker.removeEventListener('seeked', handler);
                    ctx.drawImage(seeker, 0, 0, canvas.width, canvas.height);
                    img.src = canvas.toDataURL();
                });
            })(i);
        }
    }

    /* ---------- trim handles ---------- */
    function updateTrimUI() {
        var lpct = state.trimStart / state.duration * 100;
        var rpct = state.trimEnd / state.duration * 100;
        trimRegion.style.left = lpct + '%';
        trimRegion.style.width = (rpct - lpct) + '%';
        handleL.style.left = lpct + '%';
        handleR.style.left = rpct + '%';
        labelStart.textContent = fmtTime(state.trimStart);
        labelEnd.textContent = fmtTime(state.trimEnd);
        trimStartInput.value = state.trimStart.toFixed(1);
        trimEndInput.value = state.trimEnd.toFixed(1);
        trimDurEl.textContent = fmtTime(state.trimEnd - state.trimStart);
    }

    function startDrag(handle, isLeft) {
        var rect = timelineTrack.getBoundingClientRect();
        function onMove(e) {
            var clientX = e.touches ? e.touches[0].clientX : e.clientX;
            var pct = (clientX - rect.left) / rect.width;
            var t = clamp(pct * state.duration, 0, state.duration);
            if (isLeft) {
                state.trimStart = clamp(t, 0, state.trimEnd - 0.1);
            } else {
                state.trimEnd = clamp(t, state.trimStart + 0.1, state.duration);
            }
            updateTrimUI();
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    }

    handleL.addEventListener('mousedown', function (e) { e.preventDefault(); startDrag(handleL, true); });
    handleR.addEventListener('mousedown', function (e) { e.preventDefault(); startDrag(handleR, false); });
    handleL.addEventListener('touchstart', function (e) { e.preventDefault(); startDrag(handleL, true); });
    handleR.addEventListener('touchstart', function (e) { e.preventDefault(); startDrag(handleR, false); });

    trimStartInput.addEventListener('input', function () {
        var v = parseFloat(trimStartInput.value);
        if (!isNaN(v)) { state.trimStart = clamp(v, 0, state.trimEnd - 0.1); updateTrimUI(); }
    });
    trimEndInput.addEventListener('input', function () {
        var v = parseFloat(trimEndInput.value);
        if (!isNaN(v)) { state.trimEnd = clamp(v, state.trimStart + 0.1, state.duration); updateTrimUI(); }
    });

    trimPreviewBtn.addEventListener('click', function () {
        video.currentTime = state.trimStart;
        video.play();
    });

    /* ---------- tab switching ---------- */
    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            tabs.forEach(function (t) { t.classList.remove('vc-tab-active'); });
            panels.forEach(function (p) { p.classList.remove('vc-panel-active'); });
            tab.classList.add('vc-tab-active');
            var target = tab.getAttribute('data-panel');
            var panel = document.querySelector('[data-panel-id="' + target + '"]');
            if (panel) panel.classList.add('vc-panel-active');
            state.currentTab = target;
        });
    });

    /* ---------- snapshot ---------- */
    snapQualityRng.addEventListener('input', function () {
        snapQualityVal.textContent = snapQualityRng.value + '%';
        snapQualityFld.style.display = snapFormatSel.value === 'jpeg' ? '' : 'none';
    });
    snapFormatSel.addEventListener('change', function () {
        snapQualityFld.style.display = snapFormatSel.value === 'jpeg' ? '' : 'none';
    });

    snapGoBtn.addEventListener('click', function () {
        if (!state.file) return;
        var t = parseFloat(snapTimeInput.value) || 0;
        t = clamp(t, 0, state.duration);

        setProgress(5, '截取帧...');
        exportSettings.style.display = 'none';
        progressSection.style.display = '';
        resultSection.style.display = 'none';
        exportModal.style.display = '';

        var seeker = document.createElement('video');
        seeker.src = state.objectURL;
        seeker.muted = true;
        seeker.currentTime = t;
        seeker.addEventListener('seeked', function () {
            var cv = setupCanvas(video.videoWidth);
            cv.ctx.drawImage(seeker, 0, 0, cv.w, cv.h);
            var fmt = snapFormatSel.value;
            var q = parseInt(snapQualityRng.value) / 100;
            var dataUrl = cv.canvas.toDataURL('image/' + fmt, q);
            setProgress(80, '生成图片...');
            var a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'snapshot_' + Math.round(t) + 's.' + fmt;
            setProgress(100, '完成');
            setTimeout(function () {
                progressSection.style.display = 'none';
                exportSettings.style.display = '';
                exportModal.style.display = 'none';
                a.click();
            }, 600);
        });
        seeker.addEventListener('error', function () {
            setProgress(0, '错误');
            progressLabel.textContent = '截取帧失败';
        });
    });

    /* ---------- speed ---------- */
    speedRng.addEventListener('input', function () {
        speedVal.textContent = parseFloat(speedRng.value).toFixed(1) + 'x';
    });
    speedPresets.forEach(function (btn) {
        btn.addEventListener('click', function () {
            speedRng.value = btn.getAttribute('data-speed');
            speedVal.textContent = parseFloat(speedRng.value).toFixed(1) + 'x';
        });
    });

    /* ---------- export modal ---------- */
    exportBtn.addEventListener('click', function () {
        if (!state.file) { alert('请先导入视频'); return; }
        state.exportMode = state.currentTab;
        exportSettings.style.display = '';
        progressSection.style.display = 'none';
        resultSection.style.display = 'none';
        exportModal.style.display = '';
    });

    exportCancelBtn.addEventListener('click', function () {
        exportModal.style.display = 'none';
    });
    exportCloseBtn.addEventListener('click', function () {
        exportModal.style.display = 'none';
    });

    exportConfirmBtn.addEventListener('click', function () {
        exportSettings.style.display = 'none';
        progressSection.style.display = '';
        setProgress(0, '准备中...');

        if (state.exportMode === 'trim') doTrim();
        else if (state.exportMode === 'audio') doExtractAudio();
        else if (state.exportMode === 'mute') doMute();
        else if (state.exportMode === 'speed') doSpeed();
        else doTrim();
    });

    /* click outside modal to close */
    exportModal.addEventListener('click', function (e) {
        if (e.target === exportModal) exportModal.style.display = 'none';
    });

    /* ---------- cancel button in progress ---------- */
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'vc-btn vc-btn-cancel';
    cancelBtn.textContent = '取消';
    cancelBtn.style.marginTop = '12px';
    cancelBtn.addEventListener('click', function () {
        exportModal.style.display = 'none';
        setProgress(0, '已取消');
    });
    progressSection.appendChild(cancelBtn);

    /* ---------- processing: trim ---------- */
    function doTrim() {
        setProgress(5, '准备裁剪...');
        var cs = setupCanvas(parseInt(resSelect.value) || video.videoWidth);
        var fps = 30;
        var stream = cs.canvas.captureStream(fps);
        var audioStream = null;
        var combined = stream;

        try {
            audioStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
            var audioTracks = audioStream.getAudioTracks();
            if (audioTracks.length) {
                audioTracks.forEach(function (at) { stream.addTrack(at); });
            }
        } catch (e) { /* no audio */ }

        var mimeType = getMimeType();
        var rec = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: parseInt(qualitySelect.value) });
        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
            var blob = new Blob(chunks, { type: mimeType });
            setProgress(100, '完成');
            showResult(blob, 'webm');
        };
        rec.onerror = function () { reject(new Error('录制失败')); };

        video.currentTime = state.trimStart;
        video.play();
        rec.start();

        function checkTime() {
            if (video.currentTime >= state.trimEnd || video.paused) {
                video.pause();
                rec.stop();
                setProgress(95, '正在编码...');
                return;
            }
            cs.ctx.drawImage(video, 0, 0, cs.w, cs.h);
            var pct = 10 + (video.currentTime - state.trimStart) / (state.trimEnd - state.trimStart) * 80;
            setProgress(pct, '裁剪中...');
            requestAnimationFrame(checkTime);
        }
        video.addEventListener('seeked', function onSeeked() {
            video.removeEventListener('seeked', onSeeked);
            checkTime();
        });
    }

    /* ---------- processing: extract audio ---------- */
    function doExtractAudio() {
        setProgress(5, '提取音频...');
        try {
            var AudioCtx = window.AudioContext || window.webkitAudioContext;
            var audioCtx = new AudioCtx();
            var source = audioCtx.createMediaElementSource(video);
            var dest = audioCtx.createMediaStreamDestination();
            source.connect(dest);
            source.connect(audioCtx.destination);

            var rec = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
            var chunks = [];
            rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
            rec.onstop = function () {
                audioCtx.close();
                var blob = new Blob(chunks, { type: 'audio/webm' });
                setProgress(100, '完成');
                showResult(blob, 'webm', true);
            };
            rec.onerror = function () { audioCtx.close(); reject(new Error('音频录制失败')); };

            video.currentTime = state.trimStart;
            video.play();
            rec.start();

            function checkTime() {
                if (video.currentTime >= state.trimEnd || video.paused) {
                    video.pause();
                    rec.stop();
                    setProgress(95, '正在编码...');
                    return;
                }
                var pct = 10 + (video.currentTime - state.trimStart) / (state.trimEnd - state.trimStart) * 80;
                setProgress(pct, '录制音频...');
                requestAnimationFrame(checkTime);
            }
            video.addEventListener('seeked', function onSeeked() {
                video.removeEventListener('seeked', onSeeked);
                checkTime();
            });
        } catch (err) {
            setProgress(0, '错误');
            progressLabel.textContent = '错误: ' + err.message;
        }
    }

    /* ---------- processing: mute ---------- */
    function doMute() {
        setProgress(5, '生成静音视频...');
        var cs = setupCanvas(parseInt(resSelect.value) || video.videoWidth);
        var fps = 30;
        var stream = cs.canvas.captureStream(fps);
        var mimeType = getMimeType();
        var rec = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: parseInt(qualitySelect.value) });
        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
            var blob = new Blob(chunks, { type: mimeType });
            setProgress(100, '完成');
            showResult(blob, 'webm');
        };
        rec.onerror = function () { reject(new Error('录制失败')); };

        video.currentTime = state.trimStart;
        video.muted = true;
        video.play();
        rec.start();

        function checkTime() {
            if (video.currentTime >= state.trimEnd || video.pause) {
                video.pause();
                rec.stop();
                setProgress(95, '正在编码...');
                return;
            }
            cs.ctx.drawImage(video, 0, 0, cs.w, cs.h);
            var pct = 10 + (video.currentTime - state.trimStart) / (state.trimEnd - state.trimStart) * 80;
            setProgress(pct, '录制静音视频...');
            requestAnimationFrame(checkTime);
        }
        video.addEventListener('seeked', function onSeeked() {
            video.removeEventListener('seeked', onSeeked);
            checkTime();
        });
    }

    /* ---------- processing: speed ---------- */
    function doSpeed() {
        setProgress(5, '变速处理...');
        var rate = parseFloat(speedRng.value);
        var cs = setupCanvas(parseInt(resSelect.value) || video.videoWidth);
        var fps = 30;
        var stream = cs.canvas.captureStream(fps);

        try {
            var aStream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
            var aTracks = aStream.getAudioTracks();
            if (aTracks.length) aTracks.forEach(function (at) { stream.addTrack(at); });
        } catch (e) { /* no audio */ }

        var mimeType = getMimeType();
        var rec = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: parseInt(qualitySelect.value) });
        var chunks = [];
        rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
            var blob = new Blob(chunks, { type: mimeType });
            setProgress(100, '完成');
            showResult(blob, 'webm');
        };
        rec.onerror = function () { reject(new Error('录制失败')); };

        video.currentTime = state.trimStart;
        video.playbackRate = rate;
        video.play();
        rec.start();

        function checkTime() {
            if (video.currentTime >= state.trimEnd || video.paused) {
                video.pause();
                rec.stop();
                video.playbackRate = 1;
                setProgress(95, '正在编码...');
                return;
            }
            cs.ctx.drawImage(video, 0, 0, cs.w, cs.h);
            var pct = 10 + (video.currentTime - state.trimStart) / (state.trimEnd - state.trimStart) * 80;
            setProgress(Math.min(pct, 95), '变速录制中...');
            requestAnimationFrame(checkTime);
        }
        video.addEventListener('seeked', function onSeeked() {
            video.removeEventListener('seeked', onSeeked);
            checkTime();
        });
    }

    /* ---------- show result ---------- */
    function showResult(blob, ext, isAudio) {
        state.resultBlob = blob;
        state.resultExt = ext;
        if (resultVideo.src) URL.revokeObjectURL(resultVideo.src);
        resultVideo.src = URL.createObjectURL(blob);
        resultVideo.style.display = '';
        progressSection.style.display = 'none';
        resultSection.style.display = '';
        downloadBtn.textContent = '下载' + (isAudio ? '音频' : '视频');
    }

    downloadBtn.addEventListener('click', function () {
        if (!state.resultBlob) return;
        var a = document.createElement('a');
        a.href = URL.createObjectURL(state.resultBlob);
        a.download = 'export_' + state.exportMode + '.' + state.resultExt;
        a.click();
    });

    /* ---------- init ---------- */
    video.style.display = 'none';
    playerCtrl.style.display = 'none';
    timeline.style.display = 'none';

})();
