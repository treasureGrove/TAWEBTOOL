(function () {
    'use strict';

    function assetPrefix() {
        return window.location.pathname.replace(/\\/g, '/').includes('/tools_html/') ? '../' : '';
    }

    function template() {
        return [
            '<div class="vc-app">',
            '  <header class="vc-head">',
            '    <div class="vc-title">',
            '      <h1>视频剪辑</h1>',
            '      <span class="vc-status" id="vcStatus">未导入素材</span>',
            '    </div>',
            '    <div class="vc-actions">',
            '      <button class="vc-btn" id="vcPickBtn" type="button">导入视频</button>',
            '      <button class="vc-btn vc-primary" id="vcRunBtn" type="button" disabled>开始处理</button>',
            '      <button class="vc-btn vc-danger" id="vcStopBtn" type="button" disabled>终止任务</button>',
            '      <input id="vcFile" type="file" accept="video/*,audio/*" hidden>',
            '    </div>',
            '  </header>',
            '  <main class="vc-layout">',
            '    <section class="vc-preview-pane">',
            '      <div class="vc-dropzone" id="vcDropzone">',
            '        <div class="vc-empty" id="vcEmpty">',
            '          <strong>拖拽视频到这里</strong>',
            '          <span>文件只在浏览器本地处理。剪辑、去音轨、抽音频和截图通过 FFmpeg.wasm 执行。</span>',
            '        </div>',
            '        <video class="vc-video" id="vcVideo" controls playsinline hidden></video>',
            '      </div>',
            '      <div class="vc-timeline">',
            '        <div class="vc-timebar">',
            '          <span id="vcStartText">00:00.000</span>',
            '          <span id="vcDurationText">未选择区间</span>',
            '          <span id="vcEndText">00:00.000</span>',
            '        </div>',
            '        <div class="vc-range">',
            '          <input id="vcStartRange" type="range" min="0" max="0" step="0.01" value="0" disabled>',
            '          <input id="vcEndRange" type="range" min="0" max="0" step="0.01" value="0" disabled>',
            '        </div>',
            '      </div>',
            '    </section>',
            '    <aside class="vc-pane vc-settings-pane">',
            '      <section class="vc-section">',
            '        <h2>素材信息</h2>',
            '        <div class="vc-meta">',
            '          <b>文件</b><span id="vcMetaName">-</span>',
            '          <b>大小</b><span id="vcMetaSize">-</span>',
            '          <b>分辨率</b><span id="vcMetaRes">-</span>',
            '          <b>时长</b><span id="vcMetaDuration">-</span>',
            '        </div>',
            '      </section>',
            '      <section class="vc-section">',
            '        <h2>剪辑参数</h2>',
            '        <div class="vc-field">',
            '          <label for="vcMode">处理模式</label>',
            '          <select id="vcMode">',
            '            <option value="trim">裁剪片段</option>',
            '            <option value="mute">裁剪并移除音轨</option>',
            '            <option value="audio">提取选中区间音频</option>',
            '            <option value="snapshot">截取当前帧 PNG</option>',
            '            <option value="gif">导出 GIF 动图</option>',
            '          </select>',
            '        </div>',
            '        <div class="vc-two">',
            '          <div class="vc-field">',
            '            <label for="vcStartInput">开始秒数</label>',
            '            <input id="vcStartInput" type="number" min="0" step="0.001" value="0" disabled>',
            '          </div>',
            '          <div class="vc-field">',
            '            <label for="vcEndInput">结束秒数</label>',
            '            <input id="vcEndInput" type="number" min="0" step="0.001" value="0" disabled>',
            '          </div>',
            '        </div>',
            '        <div class="vc-field">',
            '          <label for="vcFileBase">导出文件名</label>',
            '          <input id="vcFileBase" type="text" value="video_cut" disabled>',
            '        </div>',
            '      </section>',
            '      <section class="vc-section" id="vcExportSection">',
            '        <h2>导出设置</h2>',
            '        <div class="vc-field" id="vcFormatField">',
            '          <label for="vcFormat">导出格式</label>',
            '          <select id="vcFormat">',
            '            <option value="source">保持源格式</option>',
            '            <option value="mp4" selected>MP4 / H.264</option>',
            '            <option value="mov">MOV / H.264</option>',
            '          </select>',
            '        </div>',
            '        <div class="vc-field" id="vcEncodeField">',
            '          <label for="vcEncodeMode">编码方式</label>',
            '          <select id="vcEncodeMode">',
            '            <option value="copy">快速裁剪，不重编码</option>',
            '            <option value="encode" selected>重编码，可改格式/尺寸</option>',
            '          </select>',
            '        </div>',
            '        <div class="vc-two" id="vcVideoExportGrid">',
            '          <div class="vc-field">',
            '            <label for="vcResolution">分辨率</label>',
            '            <select id="vcResolution">',
            '              <option value="source">原始</option>',
            '              <option value="1080">1080p</option>',
            '              <option value="720" selected>720p</option>',
            '              <option value="480">480p</option>',
            '              <option value="custom">自定义宽度</option>',
            '            </select>',
            '          </div>',
            '          <div class="vc-field">',
            '            <label for="vcFps">帧率</label>',
            '            <select id="vcFps">',
            '              <option value="source" selected>原始</option>',
            '              <option value="60">60 FPS</option>',
            '              <option value="30">30 FPS</option>',
            '              <option value="24">24 FPS</option>',
            '              <option value="15">15 FPS</option>',
            '            </select>',
            '          </div>',
            '        </div>',
            '        <div class="vc-two">',
            '          <div class="vc-field" id="vcCustomWidthField">',
            '            <label for="vcCustomWidth">自定义宽度</label>',
            '            <input id="vcCustomWidth" type="number" min="160" max="3840" step="2" value="1280" disabled>',
            '          </div>',
            '          <div class="vc-field" id="vcQualityField">',
            '            <label for="vcQuality">质量 CRF</label>',
            '            <input id="vcQuality" type="number" min="16" max="35" step="1" value="23" disabled>',
            '          </div>',
            '        </div>',
            '        <div class="vc-field" id="vcAudioField">',
            '          <label for="vcAudioMode">音频策略</label>',
            '          <select id="vcAudioMode" disabled>',
            '            <option value="keep" selected>保留音频</option>',
            '            <option value="mute">移除音频</option>',
            '          </select>',
            '        </div>',
            '        <p class="vc-note" id="vcExportHint">快速裁剪适合只截片段；选择重编码后可改格式、分辨率、帧率和质量。</p>',
            '      </section>',
            '    </aside>',
            '    <aside class="vc-pane vc-output-pane">',
            '      <section class="vc-section">',
            '        <h2>处理进度</h2>',
            '        <div class="vc-progress"><span id="vcProgressFill"></span></div>',
            '        <pre class="vc-log" id="vcLog">等待导入素材...</pre>',
            '      </section>',
            '      <section class="vc-section">',
            '        <h2>输出结果</h2>',
            '        <div class="vc-result" id="vcResult" hidden>',
            '          <video id="vcResultVideo" controls playsinline hidden></video>',
            '          <img id="vcResultImage" alt="截图预览" hidden>',
            '          <a class="vc-download" id="vcDownload" href="#" download>下载文件</a>',
            '        </div>',
            '        <p class="vc-note" id="vcResultNote">处理完成后会在这里生成预览和下载链接。</p>',
            '      </section>',
            '    </aside>',
            '  </main>',
            '</div>'
        ].join('');
    }

    function initVideoCutNative(host) {
        if (!host) return;
        host.innerHTML = template();

        var prefix = assetPrefix();
        var ffmpegWorker = null;
        var workerReady = false;
        var workerCallbacks = {};
        var objectUrl = '';
        var resultUrl = '';
        var state = {
            file: null,
            duration: 0,
            videoWidth: 0,
            videoHeight: 0,
            processing: false,
            inputName: 'input.bin'
        };

        var el = {
            status: host.querySelector('#vcStatus'),
            pickBtn: host.querySelector('#vcPickBtn'),
            runBtn: host.querySelector('#vcRunBtn'),
            stopBtn: host.querySelector('#vcStopBtn'),
            file: host.querySelector('#vcFile'),
            dropzone: host.querySelector('#vcDropzone'),
            empty: host.querySelector('#vcEmpty'),
            video: host.querySelector('#vcVideo'),
            startRange: host.querySelector('#vcStartRange'),
            endRange: host.querySelector('#vcEndRange'),
            startText: host.querySelector('#vcStartText'),
            endText: host.querySelector('#vcEndText'),
            durationText: host.querySelector('#vcDurationText'),
            name: host.querySelector('#vcMetaName'),
            size: host.querySelector('#vcMetaSize'),
            res: host.querySelector('#vcMetaRes'),
            dur: host.querySelector('#vcMetaDuration'),
            mode: host.querySelector('#vcMode'),
            startInput: host.querySelector('#vcStartInput'),
            endInput: host.querySelector('#vcEndInput'),
            fileBase: host.querySelector('#vcFileBase'),
            exportSection: host.querySelector('#vcExportSection'),
            formatField: host.querySelector('#vcFormatField'),
            format: host.querySelector('#vcFormat'),
            encodeField: host.querySelector('#vcEncodeField'),
            encodeMode: host.querySelector('#vcEncodeMode'),
            videoExportGrid: host.querySelector('#vcVideoExportGrid'),
            resolution: host.querySelector('#vcResolution'),
            fps: host.querySelector('#vcFps'),
            customWidthField: host.querySelector('#vcCustomWidthField'),
            customWidth: host.querySelector('#vcCustomWidth'),
            qualityField: host.querySelector('#vcQualityField'),
            quality: host.querySelector('#vcQuality'),
            audioField: host.querySelector('#vcAudioField'),
            audioMode: host.querySelector('#vcAudioMode'),
            exportHint: host.querySelector('#vcExportHint'),
            progress: host.querySelector('#vcProgressFill'),
            log: host.querySelector('#vcLog'),
            result: host.querySelector('#vcResult'),
            resultVideo: host.querySelector('#vcResultVideo'),
            resultImage: host.querySelector('#vcResultImage'),
            download: host.querySelector('#vcDownload'),
            resultNote: host.querySelector('#vcResultNote')
        };

        function log(message) {
            var time = new Date().toLocaleTimeString();
            el.log.textContent += '[' + time + '] ' + message + '\n';
            el.log.scrollTop = el.log.scrollHeight;
        }

        function setProgress(value) {
            var pct = Math.max(0, Math.min(100, Math.round(value || 0)));
            el.progress.style.width = pct + '%';
        }

        function formatTime(seconds) {
            if (!isFinite(seconds) || seconds < 0) seconds = 0;
            var ms = Math.floor((seconds % 1) * 1000);
            var total = Math.floor(seconds);
            var h = Math.floor(total / 3600);
            var m = Math.floor((total % 3600) / 60);
            var s = total % 60;
            var base = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(3, '0');
            return h > 0 ? String(h).padStart(2, '0') + ':' + base : base;
        }

        function clamp(value, min, max) {
            return Math.max(min, Math.min(max, value));
        }

        function extFromName(name) {
            var match = /\.([a-z0-9]+)$/i.exec(name || '');
            return match ? match[1].toLowerCase() : 'mp4';
        }

        function safeBaseName(name) {
            return (name || 'video_cut').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'video_cut';
        }

        function outputExt(mode) {
            var ext = extFromName(state.file && state.file.name);
            if (mode === 'snapshot') return 'png';
            if (mode === 'gif') return 'gif';
            if (mode === 'audio') {
                if (ext === 'mp4' || ext === 'm4v' || ext === 'mov') return 'm4a';
                if (ext === 'webm') return 'webm';
                return 'mka';
            }
            if (el.format.value === 'source') {
                if ((mode === 'trim' || mode === 'mute') && el.encodeMode && el.encodeMode.value === 'encode' && ext === 'webm') {
                    return 'mp4';
                }
                return ext;
            }
            return el.format.value;
        }

        function isVideoMode() {
            var mode = el.mode.value;
            return mode === 'trim' || mode === 'mute' || mode === 'gif';
        }

        function selectedScaleFilter() {
            var value = el.resolution.value;
            if (value === 'source') return '';
            var width = 0;
            if (value === 'custom') {
                width = parseInt(el.customWidth.value, 10) || 0;
            } else {
                var targetH = parseInt(value, 10) || 0;
                if (targetH > 0 && state.videoWidth && state.videoHeight) {
                    width = Math.round(state.videoWidth * (targetH / state.videoHeight));
                }
            }
            if (!width) return '';
            if (width % 2) width += 1;
            return 'scale=' + width + ':-2';
        }

        function videoFilters(mode) {
            var filters = [];
            var scale = selectedScaleFilter();
            if (scale) filters.push(scale);
            if (el.fps.value !== 'source') filters.push('fps=' + el.fps.value);
            if (mode === 'gif') {
                if (!filters.some(function (item) { return item.indexOf('fps=') === 0; })) filters.push('fps=12');
            }
            return filters.join(',');
        }

        function shouldEncode(mode) {
            if (mode === 'gif' || mode === 'snapshot') return true;
            if (mode === 'mute') return el.encodeMode.value === 'encode';
            if (el.encodeMode.value === 'encode') return true;
            if (el.format.value !== 'source') return true;
            if (el.resolution.value !== 'source') return true;
            if (el.fps.value !== 'source') return true;
            return false;
        }

        function updateExportControls() {
            var mode = el.mode.value;
            var videoMode = isVideoMode();
            var snapshot = mode === 'snapshot';
            var audio = mode === 'audio';
            var gif = mode === 'gif';
            var encode = shouldEncode(mode);
            var busy = state.processing;

            el.exportSection.hidden = false;
            el.formatField.hidden = snapshot || audio || gif;
            el.encodeField.hidden = snapshot || audio || gif;
            el.videoExportGrid.hidden = snapshot || audio;
            el.customWidthField.hidden = snapshot || audio;
            el.qualityField.hidden = snapshot || audio || el.encodeMode.value === 'copy';
            el.audioField.hidden = snapshot || audio || gif;

            el.endInput.disabled = !state.file || snapshot || busy;
            el.endRange.disabled = !state.file || snapshot || busy;
            el.format.disabled = !state.file || !videoMode || gif || busy;
            el.encodeMode.disabled = !state.file || !videoMode || gif || busy;
            el.resolution.disabled = !state.file || snapshot || audio || (!encode && !gif) || busy;
            el.fps.disabled = !state.file || snapshot || audio || (!encode && !gif) || busy;
            el.customWidth.disabled = !state.file || el.resolution.value !== 'custom' || snapshot || audio || (!encode && !gif) || busy;
            el.quality.disabled = !state.file || snapshot || audio || el.encodeMode.value === 'copy' || busy;
            el.audioMode.disabled = !state.file || snapshot || audio || gif || busy;

            if (mode === 'mute') el.audioMode.value = 'mute';
            if (gif) {
                el.exportHint.textContent = 'GIF 会重编码，建议选择 15 秒以内片段，并使用 480p 或自定义较小宽度。';
            } else if (audio) {
                el.exportHint.textContent = '音频提取会优先复制源音轨，不重新压缩。';
            } else if (snapshot) {
                el.exportHint.textContent = '截图导出为 PNG，使用开始秒数作为截帧时间点。';
            } else if (el.encodeMode.value === 'copy') {
                el.exportHint.textContent = '快速裁剪不重编码，速度最快、画质无损，但不能改变格式、分辨率或帧率。';
            } else {
                el.exportHint.textContent = '重编码可改格式、分辨率、帧率和质量；CRF 越小质量越高、文件越大。';
            }
        }

        function updateRangeLabels() {
            var start = parseFloat(el.startInput.value) || 0;
            var end = parseFloat(el.endInput.value) || 0;
            start = clamp(start, 0, state.duration);
            end = clamp(end, start + 0.01, state.duration);
            el.startInput.value = start.toFixed(3);
            el.endInput.value = end.toFixed(3);
            el.startRange.value = start;
            el.endRange.value = end;
            el.startText.textContent = formatTime(start);
            el.endText.textContent = formatTime(end);
            el.durationText.textContent = '选中 ' + formatTime(end - start);
        }

        function enableControls(enabled) {
            el.runBtn.disabled = !enabled || state.processing;
            el.startRange.disabled = !enabled;
            el.endRange.disabled = !enabled;
            el.startInput.disabled = !enabled;
            el.endInput.disabled = !enabled;
            el.fileBase.disabled = !enabled;
            updateExportControls();
        }

        function resetResult() {
            if (resultUrl) URL.revokeObjectURL(resultUrl);
            resultUrl = '';
            el.result.hidden = true;
            el.resultVideo.hidden = true;
            el.resultImage.hidden = true;
            el.resultVideo.removeAttribute('src');
            el.resultImage.removeAttribute('src');
            el.download.href = '#';
            el.download.removeAttribute('download');
            el.resultNote.hidden = false;
        }

        function setFile(file) {
            if (!file) return;
            state.file = file;
            state.inputName = 'input.' + extFromName(file.name);
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            objectUrl = URL.createObjectURL(file);
            el.video.src = objectUrl;
            el.video.hidden = false;
            el.empty.hidden = true;
            el.status.textContent = file.name;
            el.name.textContent = file.name;
            el.size.textContent = (file.size / 1048576).toFixed(2) + ' MB';
            el.res.textContent = '读取中';
            el.dur.textContent = '读取中';
            el.fileBase.value = safeBaseName(file.name) + '_cut';
            el.log.textContent = '';
            setProgress(0);
            resetResult();
            log('素材已导入: ' + file.name);
        }

        function initWorker() {
            if (ffmpegWorker) return;
            ffmpegWorker = new Worker(prefix + '../js/video_cut_worker.js');
            ffmpegWorker.onmessage = function (e) {
                var d = e.data;
                if (d.type === 'ready') {
                    workerReady = true;
                    log('FFmpeg Worker 就绪');
                } else if (d.type === 'log') {
                    log(d.data);
                } else if (d.type === 'progress') {
                    setProgress(8 + d.data * 0.88);
                } else if (d.type === 'result') {
                    setProgress(96);
                    if (workerCallbacks.resolve) workerCallbacks.resolve(new Uint8Array(d.data));
                    workerCallbacks = {};
                } else if (d.type === 'error') {
                    if (workerCallbacks.reject) { workerCallbacks.reject(new Error(d.data)); }
                    else { log('Worker 错误: ' + d.data); }
                    workerCallbacks = {};
                }
            };
        }

        async function ensureFFmpeg() {
            if (!ffmpegWorker) initWorker();
            if (workerReady) return;
            return new Promise(function (resolve) {
                var check = setInterval(function () {
                    if (workerReady) { clearInterval(check); resolve(); }
                }, 100);
            });
        }

        function readFileAsUint8Array(file) {
            return new Promise(function (resolve, reject) {
                var reader = new FileReader();
                reader.onload = function () { resolve(new Uint8Array(reader.result)); };
                reader.onerror = function () { reject(new Error('读取文件失败')); };
                reader.readAsArrayBuffer(file);
            });
        }

        function runFFmpeg(args, outputName) {
            return new Promise(async function (resolve, reject) {
                await ensureFFmpeg();
                workerCallbacks = { resolve: resolve, reject: reject };
                var data = await readFileAsUint8Array(state.file);
                setProgress(4);
                ffmpegWorker.postMessage({
                    type: 'run',
                    inName: state.inputName,
                    outName: outputName,
                    args: args,
                    fileData: data
                }, [data.buffer]);
            });
        }

        function buildArgs(mode, outputName) {
            var start = parseFloat(el.startInput.value) || 0;
            var end = parseFloat(el.endInput.value) || state.duration;
            var duration = Math.max(0.01, end - start);
            var args = ['-ss', start.toFixed(3), '-t', duration.toFixed(3), '-i', state.inputName];
            var ext = outputExt(mode);
            var filters = videoFilters(mode);
            var encode = shouldEncode(mode);
            var crf = String(parseInt(el.quality.value, 10) || 23);

            if (mode === 'snapshot') {
                return ['-ss', start.toFixed(3), '-i', state.inputName, '-frames:v', '1', '-update', '1', outputName];
            }
            if (mode === 'gif') {
                args = args.concat(['-an']);
                if (filters) args = args.concat(['-vf', filters]);
                return args.concat([outputName]);
            }
            if (mode === 'mute') {
                if (!encode) {
                    return args.concat(['-map', '0:v:0', '-c:v', 'copy', '-an', '-avoid_negative_ts', 'make_zero', outputName]);
                }
                args = args.concat(['-map', '0:v:0']);
                if (filters) args = args.concat(['-vf', filters]);
                args = args.concat(videoEncodeArgs(ext, crf), ['-an', '-avoid_negative_ts', 'make_zero', outputName]);
                return args;
            }
            if (mode === 'audio') {
                return args.concat(['-vn', '-map', '0:a:0?', '-c:a', 'copy', outputName]);
            }
            if (!encode) {
                return args.concat(['-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero', outputName]);
            }
            args = args.concat(['-map', '0:v:0']);
            if (el.audioMode.value === 'keep') args = args.concat(['-map', '0:a:0?']);
            if (filters) args = args.concat(['-vf', filters]);
            args = args.concat(videoEncodeArgs(ext, crf));
            if (el.audioMode.value === 'keep') {
                args = args.concat(audioEncodeArgs(ext));
            } else {
                args = args.concat(['-an']);
            }
            return args.concat(['-avoid_negative_ts', 'make_zero', outputName]);
        }

        function videoEncodeArgs(ext, crf) {
            return ['-c:v', 'libx264', '-crf', crf, '-preset', 'veryfast', '-pix_fmt', 'yuv420p'];
        }

        function audioEncodeArgs(ext) {
            return ['-c:a', 'aac', '-b:a', '160k'];
        }

        function showResult(bytes, filename, mode) {
            var ext = outputExt(mode);
            var type = mode === 'snapshot' ? 'image/png' : 'video/' + ext;
            if (mode === 'gif') type = 'image/gif';
            if (mode === 'audio') type = ext === 'm4a' ? 'audio/mp4' : 'audio/' + ext;
            if (ext === 'mov') type = 'video/quicktime';
            var blob = new Blob([bytes], { type: type });
            resultUrl = URL.createObjectURL(blob);
            el.result.hidden = false;
            el.resultNote.hidden = true;
            if (mode === 'snapshot' || mode === 'gif') {
                el.resultImage.src = resultUrl;
                el.resultImage.hidden = false;
                el.resultVideo.hidden = true;
            } else {
                el.resultVideo.src = resultUrl;
                el.resultVideo.hidden = false;
                el.resultImage.hidden = true;
            }
            el.download.href = resultUrl;
            el.download.download = filename;
            el.download.textContent = '下载 ' + filename + ' (' + (blob.size / 1048576).toFixed(2) + ' MB)';
        }

        async function startProcess() {
            if (!state.file || state.processing) return;
            state.processing = true;
            resetResult();
            setProgress(0);
            enableControls(true);
            el.runBtn.disabled = true;
            el.stopBtn.disabled = false;
            var mode = el.mode.value;
            var ext = outputExt(mode);
            var base = safeBaseName(el.fileBase.value);
            var outputName = 'output.' + ext;
            var downloadName = base + '_' + mode + '.' + ext;
            try {
                var args = buildArgs(mode, outputName);
                var output = await runFFmpeg(args, outputName);
                showResult(output, downloadName, mode);
                setProgress(100);
                log('处理完成: ' + downloadName);
            } catch (err) {
                setProgress(0);
                log('处理失败: ' + err.message);
            } finally {
                state.processing = false;
                el.stopBtn.disabled = true;
                enableControls(!!state.file);
            }
        }

        el.pickBtn.addEventListener('click', function () { el.file.click(); });
        el.file.addEventListener('change', function () {
            if (el.file.files && el.file.files[0]) setFile(el.file.files[0]);
        });
        el.dropzone.addEventListener('dragover', function (event) {
            event.preventDefault();
            el.dropzone.classList.add('is-dragover');
        });
        el.dropzone.addEventListener('dragleave', function () {
            el.dropzone.classList.remove('is-dragover');
        });
        el.dropzone.addEventListener('drop', function (event) {
            event.preventDefault();
            el.dropzone.classList.remove('is-dragover');
            if (event.dataTransfer.files && event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]);
        });

        el.video.addEventListener('loadedmetadata', function () {
            state.duration = el.video.duration || 0;
            state.videoWidth = el.video.videoWidth || 0;
            state.videoHeight = el.video.videoHeight || 0;
            el.res.textContent = state.videoWidth && state.videoHeight ? state.videoWidth + ' x ' + state.videoHeight : '-';
            el.dur.textContent = formatTime(state.duration);
            el.startRange.max = state.duration;
            el.endRange.max = state.duration;
            el.startInput.max = state.duration;
            el.endInput.max = state.duration;
            el.startInput.value = '0.000';
            el.endInput.value = state.duration.toFixed(3);
            el.startRange.value = 0;
            el.endRange.value = state.duration;
            enableControls(true);
            updateRangeLabels();
            updateExportControls();
        });

        el.startRange.addEventListener('input', function () {
            var end = parseFloat(el.endInput.value) || state.duration;
            el.startInput.value = clamp(parseFloat(el.startRange.value) || 0, 0, end - 0.01).toFixed(3);
            updateRangeLabels();
            el.video.currentTime = parseFloat(el.startInput.value) || 0;
        });
        el.endRange.addEventListener('input', function () {
            var start = parseFloat(el.startInput.value) || 0;
            el.endInput.value = clamp(parseFloat(el.endRange.value) || state.duration, start + 0.01, state.duration).toFixed(3);
            updateRangeLabels();
        });
        el.startInput.addEventListener('change', updateRangeLabels);
        el.endInput.addEventListener('change', updateRangeLabels);
        el.mode.addEventListener('change', function () {
            if (el.mode.value === 'snapshot') {
                el.endInput.disabled = true;
                el.endRange.disabled = true;
                el.durationText.textContent = '截图时间 ' + el.startText.textContent;
            } else {
                enableControls(!!state.file);
                updateRangeLabels();
            }
            updateExportControls();
        });
        el.format.addEventListener('change', updateExportControls);
        el.encodeMode.addEventListener('change', updateExportControls);
        el.resolution.addEventListener('change', updateExportControls);
        el.fps.addEventListener('change', updateExportControls);
        el.audioMode.addEventListener('change', updateExportControls);
        el.runBtn.addEventListener('click', startProcess);
        el.stopBtn.addEventListener('click', function () {
            if (state.processing) {
                if (ffmpegWorker) ffmpegWorker.terminate();
                log('任务已终止');
            }
        });

        enableControls(false);
        updateExportControls();
        window.addEventListener('beforeunload', function () {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            if (resultUrl) URL.revokeObjectURL(resultUrl);
        });
    }

    window.initVideoCutNative = initVideoCutNative;

    function boot() {
        var root = document.getElementById('vcToolRoot');
        if (root) initVideoCutNative(root);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
