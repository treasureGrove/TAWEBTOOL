import * as ort from '../third_part/onnxruntime-web/1.30.0/ort.wasm.min.js';
import './watermark_residual.js?v=1';

const modelUrl = new URL('../models/lama_quality/lama_int4_int8_r4.onnx', import.meta.url);
const runtime = new URL('../third_part/onnxruntime-web/1.30.0/', import.meta.url);
ort.env.wasm.wasmPaths = {
    mjs: new URL('ort-wasm-simd-threaded.js', runtime).href,
    wasm: new URL('ort-wasm-simd-threaded.wasm', runtime).href
};
// The site's pages do not require cross-origin isolation.
ort.env.wasm.numThreads = 1;

const side = 512;
const plane = side * side;
let session;

function loadSession() {
    if (!session) {
        self.postMessage({ progress: '正在加载高质量修复模型和运行组件（首次约 51 MB）…' });
        session = ort.InferenceSession.create(modelUrl.href, {
            executionProviders: ['wasm'],
            // Fold the compressed weights into float weights before inference.
            extra: { session: { disable_quant_qdq: '1' } }
        }).catch((error) => {
            session = null;
            throw error;
        });
    }
    return session;
}

function reflect(index, length) {
    if (length === 1) return 0;
    const period = 2 * (length - 1);
    const wrapped = ((index % period) + period) % period;
    return Math.min(wrapped, period - wrapped);
}

function imageCoordinate(index, targetLength, sourceLength) {
    return Math.min(sourceLength - 1, Math.max(0, (index + 0.5) * sourceLength / targetLength - 0.5));
}

function prepareInput(width, height, rgba, mask) {
    const scale = side / Math.max(width, height);
    const fittedWidth = Math.max(1, Math.round(width * scale));
    const fittedHeight = Math.max(1, Math.round(height * scale));
    const left = Math.floor((side - fittedWidth) / 2);
    const top = Math.floor((side - fittedHeight) / 2);

    const fittedMask = new Uint8Array(fittedWidth * fittedHeight);
    // Keep any model cell touched by a selected source pixel, including thin brush marks.
    for (let y = 0; y < height; y++) {
        const startY = Math.floor(y * fittedHeight / height);
        const endY = Math.ceil((y + 1) * fittedHeight / height);
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            const startX = Math.floor(x * fittedWidth / width);
            const endX = Math.ceil((x + 1) * fittedWidth / width);
            for (let row = startY; row < endY; row++) {
                const offset = row * fittedWidth;
                fittedMask.fill(1, offset + startX, offset + endX);
            }
        }
    }

    const rgb = new Float32Array(3 * plane);
    const selection = new Float32Array(plane);
    const columns = Int16Array.from({ length: side }, (_, x) => reflect(x - left, fittedWidth));
    const sourceColumns = Float64Array.from(columns, (x) => imageCoordinate(x, fittedWidth, width));
    // Reflect the image and mask together so a mark at a crop edge cannot leak into the padding.
    for (let y = 0; y < side; y++) {
        const fittedY = reflect(y - top, fittedHeight);
        const sourceY = imageCoordinate(fittedY, fittedHeight, height);
        const y0 = Math.floor(sourceY);
        const y1 = Math.min(height - 1, y0 + 1);
        const fy = sourceY - y0;
        for (let x = 0; x < side; x++) {
            const sourceX = sourceColumns[x];
            const x0 = Math.floor(sourceX);
            const x1 = Math.min(width - 1, x0 + 1);
            const fx = sourceX - x0;
            const index = y * side + x;
            selection[index] = fittedMask[fittedY * fittedWidth + columns[x]];
            const first = 4 * (y0 * width + x0);
            const second = 4 * (y0 * width + x1);
            const third = 4 * (y1 * width + x0);
            const fourth = 4 * (y1 * width + x1);
            for (let channel = 0; channel < 3; channel++) {
                const upper = rgba[first + channel] * (1 - fx) + rgba[second + channel] * fx;
                const lower = rgba[third + channel] * (1 - fx) + rgba[fourth + channel] * fx;
                rgb[channel * plane + index] = (upper * (1 - fy) + lower * fy) / 255;
            }
        }
    }
    return { rgb, selection, fittedWidth, fittedHeight, left, top };
}

function copyRepair(rgb, { fittedWidth, fittedHeight, left, top }, width, height, rgba, mask) {
    const columns = Float64Array.from({ length: width }, (_, x) => imageCoordinate(x, width, fittedWidth));
    for (let y = 0; y < height; y++) {
        const sourceY = imageCoordinate(y, height, fittedHeight);
        const y0 = Math.floor(sourceY);
        const y1 = Math.min(fittedHeight - 1, y0 + 1);
        const fy = sourceY - y0;
        for (let x = 0; x < width; x++) {
            const index = y * width + x;
            if (!mask[index]) continue;
            const sourceX = columns[x];
            const x0 = Math.floor(sourceX);
            const x1 = Math.min(fittedWidth - 1, x0 + 1);
            const fx = sourceX - x0;
            const first = (top + y0) * side + left + x0;
            const second = (top + y0) * side + left + x1;
            const third = (top + y1) * side + left + x0;
            const fourth = (top + y1) * side + left + x1;
            for (let channel = 0; channel < 3; channel++) {
                const offset = channel * plane;
                const upper = rgb[offset + first] * (1 - fx) + rgb[offset + second] * fx;
                const lower = rgb[offset + third] * (1 - fx) + rgb[offset + fourth] * fx;
                rgba[4 * index + channel] = upper * (1 - fy) + lower * fy;
            }
        }
    }
}

self.onmessage = async ({ data: { action, width, height, rgba, mask, refineRepeated } }) => {
    if (action !== 'repair') return;

    try {
        if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0
            || !(rgba instanceof Uint8ClampedArray) || rgba.length !== 4 * width * height
            || !(mask instanceof Uint8Array) || mask.length !== width * height) {
            throw new Error('Invalid image or mask dimensions');
        }
        if (!mask.some((value) => value !== 0)) {
            self.postMessage({ result: rgba }, [rgba.buffer]);
            return;
        }
        const engine = await loadSession();
        self.postMessage({ progress: 'AI 正在高质量修复选区…' });
        const input = prepareInput(width, height, rgba, mask);
        const { output } = await engine.run({
            image: new ort.Tensor('float32', input.rgb, [1, 3, side, side]),
            mask: new ort.Tensor('float32', input.selection, [1, 1, side, side])
        });
        if (output.type !== 'float32' || output.data.length !== 3 * plane) throw new Error('Unexpected LaMa output');
        const original = refineRepeated ? rgba.slice() : null;
        copyRepair(output.data, input, width, height, rgba, mask);
        if (original) self.refineWatermarkResidue(original, rgba, mask, width, height);
        self.postMessage({ result: rgba }, [rgba.buffer]);
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
