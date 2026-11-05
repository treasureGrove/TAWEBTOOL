/* global ort */
const runtime = new URL('../third_part/onnxruntime-web/1.17.1/', self.location.href);
const model = new URL('../models/migan/migan_pipeline_v2.onnx', self.location.href);
let session;

async function loadSession() {
    if (session) return session;

    self.postMessage({ progress: '正在加载本地 AI 模型（约 28 MB）…' });
    if (!self.ort) importScripts(new URL('ort.min.js', runtime).href);
    ort.env.wasm.wasmPaths = runtime.href;
    // Single-thread WASM works without cross-origin isolation. The worker keeps the page responsive.
    ort.env.wasm.numThreads = 1;
    session = await ort.InferenceSession.create(model.href, { executionProviders: ['wasm'] });
    return session;
}

self.onmessage = async ({ data: { width, height, rgba, mask } }) => {
    try {
        const engine = await loadSession();
        self.postMessage({ progress: 'AI 正在修复选区…' });

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
