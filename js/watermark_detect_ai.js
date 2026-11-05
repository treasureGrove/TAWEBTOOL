(() => {
    'use strict';

    const side = 512;
    const size = side * side;
    const mean = [0.485, 0.456, 0.406];
    const deviation = [0.229, 0.224, 0.225];
    const modelUrl = new URL('../models/watermark_detector/visible_watermark_mask.onnx', self.location.href);
    const supportLogit = Math.log(0.22 / 0.78);
    const confidenceLogit = Math.log(0.66 / 0.34);
    const anchorLogit = Math.log(0.99 / 0.01);
    const maxCoverage = 0.20;
    let detector;

    function modelSession(ort, report) {
        if (!detector) {
            report?.('正在加载水印识别模型（约 21 MB）…');
            detector = ort.InferenceSession.create(modelUrl.href, { executionProviders: ['wasm'] }).catch((error) => {
                detector = null;
                throw error;
            });
        }
        return detector;
    }

    function resizeInput(width, height, data) {
        const input = new Float32Array(3 * size);
        for (let y = 0; y < side; y++) {
            const sourceY = Math.max(0, (y + 0.5) * height / side - 0.5);
            const y0 = Math.floor(sourceY);
            const y1 = Math.min(y0 + 1, height - 1);
            const rowMix = sourceY - y0;
            for (let x = 0; x < side; x++) {
                const sourceX = Math.max(0, (x + 0.5) * width / side - 0.5);
                const x0 = Math.floor(sourceX);
                const x1 = Math.min(x0 + 1, width - 1);
                const columnMix = sourceX - x0;
                for (let channel = 0; channel < 3; channel++) {
                    const upperLeft = data[(y0 * width + x0) * 4 + channel];
                    const upperRight = data[(y0 * width + x1) * 4 + channel];
                    const lowerLeft = data[(y1 * width + x0) * 4 + channel];
                    const lowerRight = data[(y1 * width + x1) * 4 + channel];
                    const upper = upperLeft + (upperRight - upperLeft) * columnMix;
                    const lower = lowerLeft + (lowerRight - lowerLeft) * columnMix;
                    input[channel * size + y * side + x] = ((upper + (lower - upper) * rowMix) / 255 - mean[channel]) / deviation[channel];
                }
            }
        }
        return input;
    }

    function confidenceMask(logits) {
        const visited = new Uint8Array(size);
        const accepted = new Uint8Array(size);
        const queue = new Int32Array(size);
        let acceptedCount = 0;
        let anchored = false;

        // Use a lower threshold around coherent high-confidence regions to retain faint edges.
        for (let start = 0; start < size; start++) {
            if (visited[start] || logits[start] < supportLogit) continue;
            visited[start] = 1;
            queue[0] = start;
            let count = 1;
            let strong = 0;
            let anchorPixels = 0;
            const visit = (index) => {
                if (visited[index] || logits[index] < supportLogit) return;
                visited[index] = 1;
                queue[count++] = index;
            };

            for (let cursor = 0; cursor < count; cursor++) {
                const index = queue[cursor];
                const column = index % side;
                if (logits[index] >= confidenceLogit) strong++;
                if (logits[index] >= anchorLogit) anchorPixels++;
                if (column > 0) visit(index - 1);
                if (column + 1 < side) visit(index + 1);
                if (index >= side) visit(index - side);
                if (index < size - side) visit(index + side);
            }

            if (count < 8 || strong < Math.max(4, count * 0.10)) continue;
            if (anchorPixels >= 4) anchored = true;
            acceptedCount += count;
            if (acceptedCount > size * maxCoverage) return null;
            for (let cursor = 0; cursor < count; cursor++) accepted[queue[cursor]] = 255;
        }

        // Require at least one convincing cluster before presenting any lower-confidence suggestions.
        if (!anchored) return null;
        const expanded = accepted.slice();
        for (let index = 0; index < size; index++) {
            if (!accepted[index]) continue;
            if (index % side > 0) expanded[index - 1] = 255;
            if (index % side < side - 1) expanded[index + 1] = 255;
            if (index >= side) expanded[index - side] = 255;
            if (index < size - side) expanded[index + side] = 255;
        }
        const coverage = expanded.reduce((count, value) => count + (value !== 0), 0);
        return coverage > size * maxCoverage ? null : expanded;
    }

    async function detectWatermarkWithAI({ width, height, data }, ort, report) {
        const model = await modelSession(ort, report);
        report?.('正在识别可见水印…');
        const input = new ort.Tensor('float32', resizeInput(width, height, data), [1, 3, side, side]);
        const outputs = await model.run({ image: input });
        const logits = outputs.logits?.data;
        if (!logits || logits.length !== size) throw new Error('Unexpected watermark detector output');

        const proposal = confidenceMask(logits);
        if (!proposal) return null;
        const mask = new Uint8Array(width * height);
        const columns = Int32Array.from({ length: width }, (_, x) => Math.floor(x * side / width));
        let selected = 0;
        for (let y = 0; y < height; y++) {
            const offset = y * width;
            const source = Math.floor(y * side / height) * side;
            for (let x = 0; x < width; x++) {
                if (proposal[source + columns[x]] && data[(offset + x) * 4 + 3]) {
                    mask[offset + x] = 255;
                    selected++;
                }
            }
        }
        return selected && selected <= mask.length * maxCoverage ? mask : null;
    }

    self.detectWatermarkWithAI = detectWatermarkWithAI;
})();
