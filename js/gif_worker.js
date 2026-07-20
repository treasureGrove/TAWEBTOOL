// ===== GIF Worker — gifsicle WASM via CDN =====
import gifsicle from 'https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.19/dist/gifsicle.min.js';

var WORKER_URL = 'https://cdn.jsdelivr.net/npm/gifsicle-wasm-browser@1.5.19/dist/gifsicle.min.js';

function post(type, data) {
    self.postMessage({ type, data });
}

let seq = 0;

onmessage = async function (e) {
    const msg = e.data;
    const runId = ++seq;
    try {
        const options = {};
        const commands = [];

        // Build gifsicle command from parameters
        if (msg.frameSkip > 1) {
            // Select every Nth frame via gifsicle frame selection
            let frameList = [];
            for (let i = 0; i < 9999; i += msg.frameSkip) {
                frameList.push('#' + i);
                if (frameList.length > 2000) break;
            }
            commands.push(`1.gif ${frameList.join(' ')} -o /tem/filtered.gif`);
            commands.push(`/tem/filtered.gif --lossy=${msg.lossyLevel} --colors=${msg.colors} --scale ${msg.scaleRatio.toFixed(2)} -O1 -o /out/out.gif`);
        } else {
            commands.push(`1.gif --lossy=${msg.lossyLevel} --colors=${msg.colors} --scale ${msg.scaleRatio.toFixed(2)} -O1 -o /out/out.gif`);
        }

        if (msg.type === 'getSize') {
            // For probe runs, just return the byte size
            if (runId !== seq) return;
            post('progress', { text: `探测 lossy=${msg.lossyLevel}...`, pct: 50 });

            const result = await gifsicle.run({
                input: [{ file: new Uint8Array(msg.buffer), name: '1.gif' }],
                command: commands
            });

            if (runId !== seq) return;
            if (result && result[0]) {
                const ab = await result[0].arrayBuffer();
                post('sizeResult', ab.byteLength);
            } else {
                post('sizeResult', -1);
            }
        } else {
            // Regular compression
            post('progress', { text: '压缩中...', pct: 20 });

            const result = await gifsicle.run({
                input: [{ file: new Uint8Array(msg.buffer), name: '1.gif' }],
                command: commands
            });

            if (runId !== seq) return;

            if (result && result[0]) {
                const ab = await result[0].arrayBuffer();
                const size = ab.byteLength;
                const numFrames = frameCount(msg.frameSkip, msg.buffer); // approximate

                post('result', {
                    gifBytes: ab,
                    size: size,
                    frameCount: numFrames,
                    width: 0,
                    height: 0
                }, [ab]);
            } else {
                post('error', 'gifsicle 处理失败');
            }
        }
    } catch (err) {
        if (runId === seq) post('error', err.message);
    }
};

function frameCount(skip, buffer) {
    // Quick estimate: read GIF header to count frames
    const bytes = new Uint8Array(buffer);
    let count = 0, pos = 6;
    // Skip logical screen descriptor
    const packed = bytes[6 + 3];
    const gctSize = (packed & 0x80) ? (1 << ((packed & 7) + 1)) : 0;
    pos = 6 + 7 + gctSize * 3;

    while (pos < bytes.length) {
        const blockType = bytes[pos++];
        if (blockType === 0x3B) break;
        if (blockType === 0x2C) { count++; pos += 9; }
        if (blockType === 0x21) { pos++; continue; }
        // Skip sub-blocks
        while (pos < bytes.length) {
            const subSize = bytes[pos++];
            if (subSize === 0) break;
            pos += subSize;
        }
    }
    return Math.ceil(count / skip);
}
