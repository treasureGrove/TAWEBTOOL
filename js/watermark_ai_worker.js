/* global ort */
const runtime = new URL('../third_part/onnxruntime-web/1.17.1/', self.location.href);
const model = new URL('../models/migan/migan_pipeline_v2.onnx', self.location.href);
let session;
let detectorsLoaded = false;

function progress(message) {
    self.postMessage({ progress: message });
}

function loadRuntime() {
    if (self.ort) return;
    importScripts(new URL('ort.min.js', runtime).href);
    ort.env.wasm.wasmPaths = runtime.href;
    // Single-thread WASM works without cross-origin isolation. The worker keeps the page responsive.
    ort.env.wasm.numThreads = 1;
}

async function loadSession() {
    if (session) return session;

    progress('正在加载本地 AI 修复模型（约 28 MB）…');
    loadRuntime();
    session = await ort.InferenceSession.create(model.href, { executionProviders: ['wasm'] });
    return session;
}

async function detect(width, height, rgba) {
    if (!detectorsLoaded) {
        importScripts('watermark_pattern.js?v=1', 'watermark_wordmark.js?v=1', 'watermark_detect_ai.js?v=1');
        detectorsLoaded = true;
    }
    const image = { width, height, data: rgba };
    progress('正在检查重复图案和斜向字标…');
    const pattern = self.detectRepeatingWatermark(image) || self.detectDiagonalWatermark(image);
    if (!pattern) loadRuntime();
    const data = pattern || await self.detectWatermarkWithAI(image, ort, progress);
    self.postMessage({ result: data ? { width, height, data, confident: Boolean(pattern) } : null }, data ? [data.buffer] : []);
}

self.onmessage = async ({ data: { action, width, height, rgba, mask } }) => {
    try {
        if (action === 'detect') {
            await detect(width, height, rgba);
            return;
        }
        const engine = await loadSession();
        progress('AI 正在修复选区…');

        const count = width * height;
        const rgb = new Uint8Array(3 * count);
        for (let index = 0; index < count; index++) {
            const offset = 4 * index;
            rgb[index] = rgba[offset];
            rgb[count + index] = rgba[offset + 1];
            rgb[2 * count + index] = rgba[offset + 2];
            // MI-GAN expects white for known pixels and black for pixels to fill.
            mask[index] = mask[index] ? 0 : 255;
        }

        const imageTensor = new ort.Tensor('uint8', rgb, [1, 3, height, width]);
        const maskTensor = new ort.Tensor('uint8', mask, [1, 1, height, width]);
        const outputs = await engine.run({ image: imageTensor, mask: maskTensor });
        const result = outputs[engine.outputNames[0]];
        if (result.type !== 'uint8' || result.data.length !== rgb.length) throw new Error('Unexpected MI-GAN output');

        const pixels = result.data;
        for (let index = 0; index < count; index++) {
            const offset = 4 * index;
            rgba[offset] = pixels[index];
            rgba[offset + 1] = pixels[count + index];
            rgba[offset + 2] = pixels[2 * count + index];
            rgba[offset + 3] = 255;
        }
        self.postMessage({ result: rgba }, [rgba.buffer]);
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
