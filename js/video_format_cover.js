// ─── 视频格式转换工具 (纯浏览器本地) ───
(function () {
    'use strict';

    function $(id) { return document.getElementById(id); }

    var state = {
        file: null,
        videoEl: null,
        processing: false,
        cancelled: false
    };

    var fileInput   = $('vfcFile');
    var dropzone    = $('vfcDropzone');
    var preview     = $('vfcPreview');
    var metaEl      = $('vfcMeta');
    var logEl       = $('vfcLog');
    var progressWrap = $('vfcProgressWrap');
    var progressFill = $('vfcProgressFill');
    var progressText = $('vfcProgressText');
    var resultSection = $('vfcResultSection');
    var resultVideo = $('vfcResultVideo');
    var resultGif   = $('vfcResultGif');
    var downloadLink = $('vfcDownload');
    var convertBtn  = $('vfcConvertBtn');
    var cancelBtn   = $('vfcCancelBtn');

    function log(msg, type) {
        var time = new Date().toLocaleTimeString();
        var icon = { info: 'ℹ️', success: '✅', error: '❌', warn: '⚠️' }[type || 'info'] || 'ℹ️';
        logEl.textContent += time + ' ' + icon + ' ' + msg + '\n';
        logEl.scrollTop = logEl.scrollHeight;
    }

    function setProgress(pct) {
        var n = Math.max(0, Math.min(100, Math.floor(pct)));
        progressFill.style.width = n + '%';
        progressText.textContent = n + '%';
        progressWrap.style.display = 'flex';
    }

    function resetResult() {
        resultSection.style.display = 'none';
        resultVideo.hidden = true;
        resultGif.hidden = true;
        downloadLink.hidden = true;
        downloadLink.href = '#';
    }

    function showResult(blob, filename, isGif) {
        resultSection.style.display = 'block';
        var url = URL.createObjectURL(blob);
        if (isGif) {
            resultGif.src = url;
            resultGif.hidden = false;
            resultVideo.hidden = true;
        } else {
            resultVideo.src = url;
            resultVideo.hidden = false;
            resultGif.hidden = true;
        }
        downloadLink.href = url;
        downloadLink.download = filename;
        downloadLink.textContent = '💾 下载 ' + filename + ' (' + (blob.size / 1048576).toFixed(2) + ' MB)';
        downloadLink.hidden = false;
    }

    // ── File input / drag-drop ──
    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('dragover', function (e) {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', function () {
        dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', function (e) {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    });
    fileInput.addEventListener('change', function () {
        if (fileInput.files && fileInput.files[0]) {
            handleFile(fileInput.files[0]);
        }
    });

    function handleFile(file) {
        state.file = file;
        var url = URL.createObjectURL(file);
        preview.src = url;
        preview.hidden = false;
        dropzone.classList.add('has-video');

        preview.onloadedmetadata = function () {
            state.videoEl = preview;
            metaEl.textContent = '📹 ' + file.name + ' | ' +
                (file.size / 1048576).toFixed(2) + ' MB | ' +
                preview.videoWidth + '×' + preview.videoHeight + ' | ' +
                preview.duration.toFixed(1) + 's';
            log('文件已加载: ' + file.name, 'success');
            $('vfcEnd').value = preview.duration.toFixed(1);
        };
    }

    // ── Convert ──
    convertBtn.addEventListener('click', startConvert);
    cancelBtn.addEventListener('click', function () {
        state.cancelled = true;
        if (state.videoEl) { state.videoEl.pause(); }
        log('任务已取消', 'warn');
    });

    async function startConvert() {
        if (state.processing) { log('已有任务进行中', 'warn'); return; }
        if (!state.videoEl) { log('请先选择视频文件', 'error'); return; }

        state.processing = true;
        state.cancelled = false;
        convertBtn.disabled = true;
        resetResult();
        setProgress(0);
        logEl.textContent = '';

        var format  = $('vfcFormat').value;
        var bitrate = parseFloat($('vfcBitrate').value) * 1000000;
        var outW    = parseInt($('vfcWidth').value) || 0;
        var fps     = parseInt($('vfcFps').value) || 0;
        var startT  = parseFloat($('vfcStart').value) || 0;
        var endT    = parseFloat($('vfcEnd').value) || state.videoEl.duration;

        if (startT >= endT) {
            log('开始时间必须小于结束时间', 'error');
            state.processing = false;
            convertBtn.disabled = false;
            return;
        }

        try {
            if (format === 'gif') {
                await convertToGif(state.videoEl, startT, endT, outW, fps);
            } else {
                await convertToWebM(state.videoEl, format, bitrate, outW, fps, startT, endT);
            }
        } catch (err) {
            log('转换失败: ' + err.message, 'error');
            console.error(err);
        } finally {
            state.processing = false;
            convertBtn.disabled = false;
            if (state.videoEl) { state.videoEl.pause(); state.videoEl.currentTime = 0; }
        }
    }

    // ── WebM conversion via Canvas + MediaRecorder ──
    function convertToWebM(video, format, bitrate, outW, fps, startT, endT) {
        return new Promise(function (resolve, reject) {
            log('开始转换为 ' + format.toUpperCase() + '...');
            setProgress(5);

            var sw = outW > 0 ? outW : video.videoWidth;
            var sh = outW > 0 ? Math.round(video.videoHeight * (outW / video.videoWidth)) : video.videoHeight;
            // Ensure even dimensions
            sw = sw & ~1; sh = sh & ~1;
            var targetFps = fps > 0 ? fps : 30;

            var canvas = document.createElement('canvas');
            canvas.width = sw;
            canvas.height = sh;
            var ctx = canvas.getContext('2d');

            var stream = canvas.captureStream(targetFps);

            var mimeType = 'video/webm';
            if (format === 'webm' && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) {
                mimeType = 'video/webm;codecs=vp9,opus';
            } else if (format === 'webm-vp8' && MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
                mimeType = 'video/webm;codecs=vp8,opus';
            }

            var recorder = new MediaRecorder(stream, {
                mimeType: mimeType,
                videoBitsPerSecond: bitrate
            });

            var chunks = [];
            recorder.ondataavailable = function (e) {
                if (e.data.size > 0) chunks.push(e.data);
            };
            recorder.onstop = function () {
                var blob = new Blob(chunks, { type: 'video/webm' });
                setProgress(100);
                log('转换完成: ' + (blob.size / 1048576).toFixed(2) + ' MB', 'success');
                var fname = 'converted_' + Date.now() + '.webm';
                showResult(blob, fname, false);
                resolve(blob);
            };
            recorder.onerror = function (e) { reject(new Error('MediaRecorder error')); };

            video.muted = true;
            video.currentTime = startT;

            video.ontimeupdate = function () {
                if (state.cancelled) {
                    recorder.stop();
                    video.pause();
                    video.ontimeupdate = null;
                    video.onended = null;
                    return;
                }
                if (video.currentTime >= endT) {
                    recorder.stop();
                    video.pause();
                    video.muted = false;
                    video.ontimeupdate = null;
                    video.onended = null;
                    return;
                }
                ctx.drawImage(video, 0, 0, sw, sh);
                var pct = 5 + ((video.currentTime - startT) / (endT - startT)) * 90;
                setProgress(pct);
            };
            video.onended = function () {
                recorder.stop();
                video.muted = false;
                video.ontimeupdate = null;
                video.onended = null;
            };

            recorder.start(100);
            setProgress(10);
            video.play();
        });
    }

    // ── GIF conversion via Canvas frame capture ──
    // Uses a simplified approach: captures frames as PNG data, then assembles
    // using a minimal GIF encoder built inline.
    function convertToGif(video, startT, endT, outW, fps) {
        return new Promise(function (resolve, reject) {
            log('开始转换为 GIF...');
            setProgress(5);

            var w = outW > 0 ? outW : Math.min(video.videoWidth, 480);
            var h = outW > 0 ? Math.round(video.videoHeight * (outW / video.videoWidth)) : Math.min(video.videoHeight, 360);
            w = w & ~1; h = h & ~1;
            var targetFps = fps > 0 ? fps : 10;
            var frameDelay = 1000 / targetFps;
            var totalFrames = Math.ceil((endT - startT) * targetFps);

            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');

            var frames = [];
            var frameIndex = 0;

            video.muted = true;
            video.currentTime = startT;

            function captureNextFrame() {
                if (state.cancelled) {
                    video.pause();
                    video.muted = false;
                    video.ontimeupdate = null;
                    reject(new Error('已取消'));
                    return;
                }
                if (video.currentTime >= endT || frameIndex >= totalFrames) {
                    // Build GIF
                    buildGifBlob(frames, w, h, frameDelay, function (blob) {
                        setProgress(100);
                        log('GIF 转换完成: ' + (blob.size / 1048576).toFixed(2) + ' MB, ' + frames.length + ' 帧', 'success');
                        var fname = 'output_' + Date.now() + '.gif';
                        showResult(blob, fname, true);
                        resolve(blob);
                    });
                    video.muted = false;
                    return;
                }

                ctx.drawImage(video, 0, 0, w, h);
                var imgData = ctx.getImageData(0, 0, w, h);
                frames.push(imgData);
                frameIndex++;

                var pct = 5 + (frameIndex / totalFrames) * 70;
                setProgress(pct);
                log('捕获帧 ' + frameIndex + '/' + totalFrames, 'info');

                // Seek to next frame time
                var nextTime = startT + (frameIndex / targetFps);
                if (nextTime < endT) {
                    video.currentTime = nextTime;
                    video.onseeked = function () {
                        video.onseeked = null;
                        captureNextFrame();
                    };
                } else {
                    captureNextFrame(); // will trigger build
                }
            }

            video.onseeked = function () {
                video.onseeked = null;
                captureNextFrame();
            };
            // Trigger first seek
            video.currentTime = startT;
        });
    }

    // ── Minimal GIF89a encoder ──
    function buildGifBlob(frames, w, h, delay, callback) {
        // Quantize first frame to get global palette
        var palette = buildPalette(frames[0]);
        var buf = [];

        // Header
        writeStr(buf, 'GIF89a');
        // Logical Screen Descriptor
        writeU16(buf, w);
        writeU16(buf, h);
        buf.push(0xF7); // GCT flag, 8 bits (256 colors)
        buf.push(0);    // bg color index
        buf.push(0);    // pixel aspect ratio

        // Global Color Table (256 * 3 bytes)
        for (var i = 0; i < 256; i++) {
            buf.push(palette[i * 3] || 0);
            buf.push(palette[i * 3 + 1] || 0);
            buf.push(palette[i * 3 + 2] || 0);
        }

        // Netscape Application Extension for looping
        buf.push(0x21, 0xFF, 0x0B);
        writeStr(buf, 'NETSCAPE2.0');
        buf.push(0x03, 0x01);
        writeU16(buf, 0); // loop count 0 = infinite
        buf.push(0x00);

        // Each frame
        for (var f = 0; f < frames.length; f++) {
            // Graphic Control Extension
            buf.push(0x21, 0xF9, 0x04);
            buf.push(0x00); // no transparency
            writeU16(buf, Math.round(delay / 10)); // delay in centiseconds
            buf.push(0x00); // transparent color index
            buf.push(0x00); // terminator

            // Image Descriptor
            buf.push(0x2C);
            writeU16(buf, 0); // left
            writeU16(buf, 0); // top
            writeU16(buf, w);
            writeU16(buf, h);
            buf.push(0x00); // no local color table

            // LZW Minimum Code Size
            var minCodeSize = 8;
            buf.push(minCodeSize);

            // LZW encode
            var indices = quantizeFrame(frames[f], palette);
            var lzwData = lzwEncode(indices, minCodeSize);
            // Write sub-blocks
            var offset = 0;
            while (offset < lzwData.length) {
                var chunkSize = Math.min(255, lzwData.length - offset);
                buf.push(chunkSize);
                for (var c = 0; c < chunkSize; c++) {
                    buf.push(lzwData[offset + c]);
                }
                offset += chunkSize;
            }
            buf.push(0x00); // block terminator
        }

        // Trailer
        buf.push(0x3B);

        var blob = new Blob([new Uint8Array(buf)], { type: 'image/gif' });
        callback(blob);
    }

    function writeStr(buf, str) {
        for (var i = 0; i < str.length; i++) buf.push(str.charCodeAt(i));
    }
    function writeU16(buf, val) {
        buf.push(val & 0xFF);
        buf.push((val >> 8) & 0xFF);
    }

    // Simple median-cut palette (reduced to 256 colors)
    function buildPalette(imgData) {
        var data = imgData.data;
        var buckets = [[]];
        for (var i = 0; i < data.length; i += 16) { // sample every 4th pixel
            buckets[0].push([data[i], data[i+1], data[i+2]]);
        }
        // Split buckets until we have 256
        while (buckets.length < 256) {
            var maxRange = -1, maxIdx = 0;
            for (var b = 0; b < buckets.length; b++) {
                var r = colorRange(buckets[b]);
                if (r.range > maxRange) { maxRange = r.range; maxIdx = b; r.ch = r.ch; }
            }
            var bucket = buckets[maxIdx];
            if (bucket.length < 2) break;
            var ch = colorRange(bucket).ch;
            bucket.sort(function (a, b) { return a[ch] - b[ch]; });
            var mid = Math.floor(bucket.length / 2);
            var newBucket = bucket.splice(mid);
            buckets.push(newBucket);
        }
        var palette = new Uint8Array(256 * 3);
        for (var p = 0; p < buckets.length && p < 256; p++) {
            var avg = avgColor(buckets[p]);
            palette[p * 3] = avg[0];
            palette[p * 3 + 1] = avg[1];
            palette[p * 3 + 2] = avg[2];
        }
        return palette;
    }

    function colorRange(bucket) {
        if (!bucket.length) return { range: 0, ch: 0 };
        var minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
        for (var i = 0; i < bucket.length; i++) {
            var c = bucket[i];
            if (c[0] < minR) minR = c[0]; if (c[0] > maxR) maxR = c[0];
            if (c[1] < minG) minG = c[1]; if (c[1] > maxG) maxG = c[1];
            if (c[2] < minB) minB = c[2]; if (c[2] > maxB) maxB = c[2];
        }
        var rR = maxR - minR, rG = maxG - minG, rB = maxB - minB;
        if (rR >= rG && rR >= rB) return { range: rR, ch: 0 };
        if (rG >= rR && rG >= rB) return { range: rG, ch: 1 };
        return { range: rB, ch: 2 };
    }

    function avgColor(bucket) {
        if (!bucket.length) return [0, 0, 0];
        var r = 0, g = 0, b = 0;
        for (var i = 0; i < bucket.length; i++) {
            r += bucket[i][0]; g += bucket[i][1]; b += bucket[i][2];
        }
        return [Math.round(r / bucket.length), Math.round(g / bucket.length), Math.round(b / bucket.length)];
    }

    function quantizeFrame(imgData, palette) {
        var data = imgData.data;
        var len = data.length / 4;
        var indices = new Uint8Array(len);
        // Build lookup cache for speed
        var cache = {};
        for (var i = 0; i < len; i++) {
            var r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
            var key = (r >> 3) + ',' + (g >> 3) + ',' + (b >> 3);
            if (cache[key] !== undefined) {
                indices[i] = cache[key];
            } else {
                var bestIdx = 0, bestDist = Infinity;
                for (var p = 0; p < 256; p++) {
                    var dr = r - palette[p * 3];
                    var dg = g - palette[p * 3 + 1];
                    var db = b - palette[p * 3 + 2];
                    var dist = dr * dr + dg * dg + db * db;
                    if (dist < bestDist) { bestDist = dist; bestIdx = p; }
                    if (dist === 0) break;
                }
                indices[i] = bestIdx;
                cache[key] = bestIdx;
            }
        }
        return indices;
    }

    // LZW encoder for GIF
    function lzwEncode(indices, minCodeSize) {
        var clearCode = 1 << minCodeSize;
        var eoiCode = clearCode + 1;
        var codeSize = minCodeSize + 1;
        var nextCode = eoiCode + 1;
        var maxCode = 1 << codeSize;

        var output = [];
        var bitBuf = 0, bitCount = 0;

        function writeBits(code, size) {
            bitBuf |= (code << bitCount);
            bitCount += size;
            while (bitCount >= 8) {
                output.push(bitBuf & 0xFF);
                bitBuf >>= 8;
                bitCount -= 8;
            }
        }

        // Init code table
        var table = {};
        for (var i = 0; i < clearCode; i++) {
            table[String(i)] = i;
        }

        writeBits(clearCode, codeSize);

        var prev = String(indices[0]);
        for (var j = 1; j < indices.length; j++) {
            var curr = String(indices[j]);
            var key = prev + ',' + curr;
            if (table[key] !== undefined) {
                prev = key;
            } else {
                writeBits(table[prev], codeSize);
                if (nextCode < 4096) {
                    table[key] = nextCode++;
                    if (nextCode > maxCode && codeSize < 12) {
                        codeSize++;
                        maxCode = 1 << codeSize;
                    }
                } else {
                    // Table full, emit clear code
                    writeBits(clearCode, codeSize);
                    table = {};
                    for (var k = 0; k < clearCode; k++) table[String(k)] = k;
                    nextCode = eoiCode + 1;
                    codeSize = minCodeSize + 1;
                    maxCode = 1 << codeSize;
                }
                prev = curr;
            }
        }
        writeBits(table[prev], codeSize);
        writeBits(eoiCode, codeSize);

        if (bitCount > 0) output.push(bitBuf & 0xFF);
        return output;
    }

})();
