// ── Video Cut Worker — FFmpeg 独立线程 ──
var core = null;
var coreLoading = null;

function post(type, data, transfer) {
    self.postMessage({ type: type, data: data }, transfer || []);
}

function resolveBase() {
    // Classic worker: self.location gives the worker script URL
    var url = self.location.href;
    return url.substring(0, url.lastIndexOf('/') + 1);
}

function ensureCore() {
    if (core) return Promise.resolve(core);
    if (coreLoading) return coreLoading;

    coreLoading = (async function () {
        var base = resolveBase();
        // Worker is at js/video_cut_worker.js, base = .../js/
        // WASM at third_part/ffmpeg-wasm/ relative to project root
        var corePath = base + '../third_part/ffmpeg-wasm/ffmpeg-core.js';
        try {
            importScripts(corePath);
        } catch (e) {
            importScripts(base + '../../third_part/ffmpeg-wasm/ffmpeg-core.js');
        }
        if (!self.createFFmpegCore) throw new Error('FFmpeg core load failed');

        var wasmUrl = base + '../third_part/ffmpeg-wasm/ffmpeg-core.wasm';
        var wasmBin = await fetch(wasmUrl).then(function (r) { return r.arrayBuffer(); });

        core = await self.createFFmpegCore({
            print: function (m) { if (m) post('log', String(m)); },
            printErr: function (m) { if (m) post('log', String(m)); },
            wasmBinary: new Uint8Array(wasmBin)
        });

        if (core.setProgress) {
            core.setProgress(function (p) {
                if (p && typeof p.progress === 'number') {
                    post('progress', Math.round(p.progress * 100));
                }
            });
        }

        post('ready');
        return core;
    })();
    return coreLoading;
}

onmessage = async function (e) {
    var msg = e.data;
    try {
        var c = await ensureCore();

        if (msg.type === 'run') {
            if (c.reset) c.reset();

            var inName = msg.inName;
            var outName = msg.outName;
            var args = msg.args;
            var fileData = msg.fileData;

            try { c.FS.unlink(inName); } catch (ex) {}
            try { c.FS.unlink(outName); } catch (ex) {}
            c.FS.writeFile(inName, fileData);

            post('log', 'ffmpeg ' + args.join(' '));
            var ret = c.exec.apply(c, args);
            c.reset && c.reset();

            if (ret !== 0) {
                post('error', 'FFmpeg exit code: ' + ret);
                return;
            }

            var outData = c.FS.readFile(outName);
            try { c.FS.unlink(inName); } catch (ex) {}
            try { c.FS.unlink(outName); } catch (ex) {}

            post('result', outData.buffer, [outData.buffer]);
        }
    } catch (err) {
        post('error', err.message || String(err));
    }
};

ensureCore();
