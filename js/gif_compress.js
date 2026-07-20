// ===== GIF Compressor — gifsicle WASM (worker-native, non-blocking) =====

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    originalImg: document.getElementById('originalImg'),
    compressedImg: document.getElementById('compressedImg'),
    originalPreview: document.getElementById('originalPreview'),
    compressedPreview: document.getElementById('compressedPreview'),
    originalInfo: document.getElementById('originalInfo'),
    compressedInfo: document.getElementById('compressedInfo'),
    scale: document.getElementById('scale'),
    scaleValue: document.getElementById('scaleValue'),
    colors: document.getElementById('colors'),
    colorValue: document.getElementById('colorValue'),
    frameSkip: document.getElementById('frameSkip'),
    lossy: document.getElementById('lossy'),
    lossyValue: document.getElementById('lossyValue'),
    compressBtn: document.getElementById('compressBtn'),
    clearBtn: document.getElementById('clearBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    targetSizeToggle: document.getElementById('targetSizeToggle'),
    targetSize: document.getElementById('targetSize'),
    manualSettings: document.getElementById('manualSettings'),
    targetSettings: document.getElementById('targetSettings')
};

let originalFile = null;
let compressedBlob = null;
let gifsicleMod = null;
let lastRunId = 0;

const GIFSICLE_URL = 'https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.19/dist/gifsicle.min.js';

async function loadGifsicle() {
    if (gifsicleMod) return gifsicleMod;
    showProgress('加载压缩引擎...', 2);
    const mod = await import(GIFSICLE_URL);
    gifsicleMod = mod.default;
    return gifsicleMod;
}

initEvents();

function initEvents() {
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.add('drag-over');
    });
    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('drag-over');
    });
    elements.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'image/gif');
        if (files.length > 0) loadGif(files[0]);
    });

    document.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type === 'image/gif') {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) loadGif(file);
                return;
            }
        }
    });

    elements.scale.addEventListener('input', () => { elements.scaleValue.textContent = elements.scale.value; });
    elements.colors.addEventListener('input', () => { elements.colorValue.textContent = elements.colors.value; });
    elements.lossy.addEventListener('input', () => { elements.lossyValue.textContent = elements.lossy.value; });

    elements.compressBtn.addEventListener('click', compressGif);
    elements.clearBtn.addEventListener('click', clearAll);
    elements.downloadBtn.addEventListener('click', downloadResult);

    if (elements.targetSizeToggle) {
        elements.targetSizeToggle.addEventListener('change', function () {
            var targetMode = elements.targetSizeToggle.checked;
            elements.manualSettings.style.display = targetMode ? 'none' : '';
            elements.targetSettings.style.display = targetMode ? '' : 'none';
        });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'image/gif') loadGif(file);
    e.target.value = '';
}

function loadGif(file) {
    originalFile = file;
    compressedBlob = null;

    const url = URL.createObjectURL(file);
    elements.originalImg.src = url;
    elements.originalImg.style.display = 'block';
    elements.originalImg.onload = () => {
        const p = elements.originalPreview.querySelector('.preview-placeholder');
        if (p) p.style.display = 'none';
    };

    elements.originalInfo.textContent = `文件名: ${file.name} | 体积: ${formatSize(file.size)}`;
    elements.compressBtn.disabled = false;

    elements.compressedImg.style.display = 'none';
    elements.compressedImg.src = '';
    elements.compressedInfo.textContent = '';
    elements.downloadBtn.style.display = 'none';
    const p2 = elements.compressedPreview.querySelector('.preview-placeholder');
    if (p2) p2.style.display = '';
}

function buildCommand(scaleRatio, colors, frameSkip, lossyLevel) {
    var parts = [];
    var inputFile = '1.gif';

    // Build frame selection for skip
    if (frameSkip > 1) {
        var frames = [];
        for (var i = 0; i < 9999; i += frameSkip) {
            frames.push('#' + i);
            if (frames.length > 2000) break;
        }
        var select = frames.join(' ');
        parts.push(inputFile + ' ' + select + ' --lossy=' + lossyLevel + ' --colors=' + colors +
            ' --scale ' + scaleRatio.toFixed(2) + ' -O1 -o /out/out.gif');
    } else {
        parts.push(inputFile + ' --lossy=' + lossyLevel + ' --colors=' + colors +
            ' --scale ' + scaleRatio.toFixed(2) + ' -O1 -o /out/out.gif');
    }
    return parts;
}

async function runGifsicle(buffer, command, runId) {
    const g = await loadGifsicle();
    if (runId !== lastRunId) return null;
    const result = await g.run({
        input: [{ file: buffer, name: '1.gif' }],
        command: command
    });
    if (runId !== lastRunId) return null;
    if (result && result[0]) {
        return await result[0].arrayBuffer();
    }
    return null;
}

async function compressGif() {
    if (!originalFile) return;

    elements.compressBtn.disabled = true;
    elements.downloadBtn.style.display = 'none';
    lastRunId++;
    var runId = lastRunId;

    var scaleRatio = parseInt(elements.scale.value) / 100;
    var colors = parseInt(elements.colors.value);
    var frameSkip = parseInt(elements.frameSkip.value);
    var targetEnabled = elements.targetSizeToggle && elements.targetSizeToggle.checked;
    var targetBytes = targetEnabled ? parseInt(elements.targetSize.value) * 1024 : 0;

    try {
        if (targetEnabled && targetBytes > 0) {
            await compressToTarget(scaleRatio, colors, frameSkip, targetBytes, runId);
        } else {
            var lossy = parseInt(elements.lossy.value);
            var cmd = buildCommand(scaleRatio, colors, frameSkip, lossy);
            showProgress('压缩中...', 30);

            var buffer = await originalFile.arrayBuffer();
            var ab = await runGifsicle(buffer, cmd, runId);
            if (!ab) return;

            finishCompression(ab, frameSkip);
        }
    } catch (err) {
        console.error(err);
        showProgress('压缩失败: ' + err.message, 0);
        elements.compressBtn.disabled = false;
    }
}

async function compressToTarget(scaleRatio, colors, frameSkip, targetBytes, runId) {
    // Progressive scan: try increasingly aggressive params until target is reached
    var plan = [
        // [lossy, colors, scale, skip]
        [20, colors, scaleRatio, frameSkip],
        [60, colors, scaleRatio, frameSkip],
        [120, colors, scaleRatio, frameSkip],
        [200, colors, scaleRatio, frameSkip],
        [200, Math.max(32, Math.floor(colors / 2)), scaleRatio, frameSkip],
        [200, Math.max(16, Math.floor(colors / 4)), scaleRatio, frameSkip],
        [200, 8, scaleRatio, frameSkip],
        [200, 8, +Math.max(0.3, scaleRatio * 0.5).toFixed(2), frameSkip],
        [200, 4, +Math.max(0.2, scaleRatio * 0.4).toFixed(2), frameSkip],
        [200, 4, +Math.max(0.1, scaleRatio * 0.25).toFixed(2), frameSkip],
        [200, 4, 0.08, 2],
        [200, 4, 0.05, 2]
    ];

    var best = { size: Infinity, lossy: 200, colors: 4, scale: 0.05, skip: 2 };
    var allResults = [];

    for (var i = 0; i < plan.length; i++) {
        var p = plan[i];
        showProgress('测试: lossy=' + p[0] + ' 色=' + p[1] + ' 缩放=' + Math.round(p[2] * 100) + '% 抽帧=' + p[3] +
            ' (' + (i + 1) + '/' + plan.length + ')', Math.round((i + 1) / plan.length * 80));
        await sleep(60);

        var buffer = await originalFile.arrayBuffer();
        var cmd = buildCommand(p[2], p[1], p[3], p[0]);
        var ab = await runGifsicle(buffer, cmd, runId);
        if (!ab) continue;

        var r = { size: ab.byteLength, lossy: p[0], colors: p[1], scale: p[2], skip: p[3] };
        allResults.push(r);
        if (r.size < best.size) {
            best.size = r.size;
            best.lossy = r.lossy; best.colors = r.colors; best.scale = r.scale; best.skip = r.skip;
        }
    }

    // Pick the plan closest to target while staying at or below target
    var inTarget = allResults.filter(function (r) { return r.size <= targetBytes; });
    if (inTarget.length > 0) {
        inTarget.sort(function (a, b) { return b.size - a.size; }); // largest first
        best = inTarget[0];
    } else {
        // Fallback: pick the smallest result overall
        allResults.sort(function (a, b) { return a.size - b.size; });
        best = allResults[0];
    }

    // Fine-tune: if best result is well below target, try increasing quality
    if (best.size < targetBytes * 0.7 && best.scale < scaleRatio && best.lossy === 200) {
        showProgress('微调优化质量...', 82);
        await sleep(100);

        // Try to increase scale or colors while staying under target
        var fineScales = [best.scale, +(best.scale / 0.6).toFixed(2), +(best.scale / 0.35).toFixed(2)];
        for (var j = 0; j < fineScales.length; j++) {
            if (fineScales[j] > scaleRatio) continue;
            var fineCmd = buildCommand(fineScales[j], best.colors, best.skip, best.lossy);
            var fineAb = await runGifsicle(buffer = await originalFile.arrayBuffer(), fineCmd, runId);
            if (!fineAb) continue;
            var fineSize = fineAb.byteLength;
            if (fineSize <= targetBytes && fineSize > best.size) {
                best.size = fineSize;
                best.scale = fineScales[j];
            }
        }
    }

    showProgress('达到: ' + formatSize(best.size) + ' (lossy=' + best.lossy + ' 色=' + best.colors +
        ' 缩=' + Math.round(best.scale * 100) + '% 抽帧=' + best.skip + ')', 92);
    await sleep(150);

    var buffer = await originalFile.arrayBuffer();
    var cmd = buildCommand(best.scale, best.colors, best.skip, best.lossy);
    var ab = await runGifsicle(buffer, cmd, runId);
    if (!ab) return;
    finishCompression(ab, best.skip);
}

function finishCompression(arrayBuffer, frameSkip) {
    compressedBlob = new Blob([arrayBuffer], { type: 'image/gif' });

    var url = URL.createObjectURL(compressedBlob);
    elements.compressedImg.src = url;
    elements.compressedImg.style.display = 'block';
    var p = elements.compressedPreview.querySelector('.preview-placeholder');
    if (p) p.style.display = 'none';

    var reduced = compressedBlob.size < originalFile.size;
    var ratio = ((1 - compressedBlob.size / originalFile.size) * 100).toFixed(1);
    elements.compressedInfo.innerHTML =
        '体积: ' + formatSize(compressedBlob.size) + ' | ' +
        '<span class="' + (reduced ? 'size-reduced' : 'size-increased') + '">' +
        (reduced ? '减少' : '增加') + ' ' + Math.abs(ratio) + '%</span>';

    elements.downloadBtn.style.display = '';
    showProgress('压缩完成！', 100);
    elements.compressBtn.disabled = false;
}

function clearAll() {
    originalFile = null;
    compressedBlob = null;
    elements.originalImg.style.display = 'none';
    elements.originalImg.src = '';
    elements.compressedImg.style.display = 'none';
    elements.compressedImg.src = '';
    elements.originalInfo.textContent = '';
    elements.compressedInfo.textContent = '';
    elements.compressBtn.disabled = true;
    elements.downloadBtn.style.display = 'none';
    elements.progressContainer.style.display = 'none';
    var p1 = elements.originalPreview.querySelector('.preview-placeholder');
    var p2 = elements.compressedPreview.querySelector('.preview-placeholder');
    if (p1) p1.style.display = '';
    if (p2) p2.style.display = '';
}

function downloadResult() {
    if (!compressedBlob || !originalFile) return;
    var name = originalFile.name.replace(/\.gif$/i, '_compressed.gif');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(compressedBlob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function showProgress(text, percent) {
    elements.progressContainer.style.display = 'block';
    elements.progressFill.style.width = percent + '%';
    elements.progressText.textContent = text;
}

function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}
