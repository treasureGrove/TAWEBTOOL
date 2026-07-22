// ─── FFmpeg Worker — 独立线程，不阻塞主 UI ───
var core = null;
var coreLoading = null;

function post(type, data, transfer) {
    self.postMessage({ type: type, data: data }, transfer || []);
}

function ensureCore() {
    if (core) return Promise.resolve(core);
    if (coreLoading) return coreLoading;

    coreLoading = (async function () {
        var base = self.location.href.replace(/\/[^\/]+$/, '/');
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
            print: function (m) { if (m) post('log', m); },
            printErr: function (m) { if (m) post('log', m); },
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

            post('log', '执行: ffmpeg ' + args.join(' '));
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

// Preload on start
ensureCore();
