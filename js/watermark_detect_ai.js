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

    function confidenceMask(logits, cutoff = supportLogit) {
        const visited = new Uint8Array(size);
        const accepted = new Uint8Array(size);
        const queue = new Int32Array(size);
        let acceptedCount = 0;
        let anchored = false;

        // Use a lower threshold around coherent high-confidence regions to retain faint edges.
        for (let start = 0; start < size; start++) {
            if (visited[start] || logits[start] < cutoff) continue;
            visited[start] = 1;
            queue[0] = start;
            let count = 1;
            let strong = 0;
            let anchorPixels = 0;
            const visit = (index) => {
                if (visited[index] || logits[index] < cutoff) return;
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

    async function detectWatermarkWithAI({ width, height, data }, ort, report, secondarySeed = false) {
        const model = await modelSession(ort, report);
        report?.('正在识别可见水印…');
        const input = new ort.Tensor('float32', resizeInput(width, height, data), [1, 3, side, side]);
        const outputs = await model.run({ image: input });
        const logits = outputs.logits?.data;
        if (!logits || logits.length !== size) throw new Error('Unexpected watermark detector output');

        // A second overlay can occupy only a small part of an image with widespread markings.
        const proposal = confidenceMask(logits, secondarySeed ? Math.log(0.75 / 0.25) : supportLogit);
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

    function badgeCandidates(proposal, width, height) {
        const scale = Math.min(1, 640 / Math.max(width, height));
        const columns = Math.max(1, Math.round(width * scale));
        const rows = Math.max(1, Math.round(height * scale));
        const remaining = new Uint8Array(columns * rows);
        for (let y = 0; y < rows; y++) {
            const source = Math.floor(y * height / rows) * width;
            for (let x = 0; x < columns; x++) {
                remaining[y * columns + x] = proposal[source + Math.floor(x * width / columns)];
            }
        }

        const queue = new Int32Array(remaining.length);
        const candidates = [];
        for (let start = 0; start < remaining.length; start++) {
            if (!remaining[start]) continue;
            remaining[start] = 0;
            queue[0] = start;
            let count = 1;
            let left = columns;
            let top = rows;
            let right = 0;
            let bottom = 0;
            const visit = (index) => {
                if (!remaining[index]) return;
                remaining[index] = 0;
                queue[count++] = index;
            };
            for (let cursor = 0; cursor < count; cursor++) {
                const index = queue[cursor];
                const x = index % columns;
                const y = Math.floor(index / columns);
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x + 1);
                bottom = Math.max(bottom, y + 1);
                if (x > 0) visit(index - 1);
                if (x + 1 < columns) visit(index + 1);
                if (y > 0) visit(index - columns);
                if (y + 1 < rows) visit(index + columns);
            }

            const span = right - left;
            const tall = bottom - top;
            const ratio = span * width / columns / (tall * height / rows);
            if (ratio < 2.2 || ratio > 13 || tall < 8 || tall > rows * 0.15 || span < columns * 0.10
                || span > columns * 0.85 || count < span * tall * 0.5) continue;
            candidates.push({
                count,
                bounds: [Math.round(left * width / columns), Math.round(top * height / rows),
                    Math.round(right * width / columns), Math.round(bottom * height / rows)]
            });
        }
        return candidates.sort((a, b) => b.count - a.count).slice(0, 6);
    }

    function luminance({ data, width, height }, x, y) {
        const offset = 4 * (Math.min(height - 1, Math.max(0, Math.floor(y))) * width
            + Math.min(width - 1, Math.max(0, Math.floor(x))));
        return 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
    }

    function badgeBorder(image, [left, top, right, bottom]) {
        const radius = (bottom - top) / 2;
        const start = left + radius;
        const end = right - radius;
        const center = top + radius;
        if (radius < 4 || end <= start || left < 1 || top < 1 || right >= image.width || bottom >= image.height) {
            return { score: -Infinity };
        }

        const spacing = Math.max(2, Math.round(radius * 0.08));
        const sums = [0, 0, 0, 0];
        let agreement = 0;
        const record = (edge, difference) => {
            sums[edge] += Math.min(30, Math.max(-15, difference));
            if (difference >= 4) agreement++;
        };
        for (let index = 0; index < 32; index++) {
            const x = start + (end - start) * index / 31;
            record(0, luminance(image, x, top - spacing) - luminance(image, x, top + spacing));
            record(1, luminance(image, x, bottom + spacing) - luminance(image, x, bottom - spacing));
        }
        for (let index = 0; index < 16; index++) {
            const angle = (index / 15 - 0.5) * Math.PI;
            const cosine = Math.cos(angle);
            const sine = Math.sin(angle);
            const outer = radius + spacing;
            const inner = radius - spacing;
            record(2, luminance(image, start - outer * cosine, center + outer * sine)
                - luminance(image, start - inner * cosine, center + inner * sine));
            record(3, luminance(image, end + outer * cosine, center + outer * sine)
                - luminance(image, end + inner * cosine, center + inner * sine));
        }
        const straight = Math.min(sums[0], sums[1]) / 32;
        const ends = (sums[2] + sums[3]) / 32;
        const score = (sums[0] + sums[1]) * 0.3 / 32 + (sums[2] + sums[3]) * 0.2 / 16 + agreement * 5 / 96;
        return { score, agreement: agreement / 96, straight, ends };
    }

    function fitBadge(image, initial) {
        const unit = Math.max(1, Math.round(Math.max(image.width, image.height) / 720));
        let bounds = initial;
        let edge = badgeBorder(image, bounds);
        for (const step of [4 * unit, 2 * unit, unit, 1]) {
            for (let pass = 0; pass < 3; pass++) {
                const previous = bounds;
                for (let side = 0; side < bounds.length; side++) {
                    const base = bounds;
                    for (const distance of [-2, -1, 1, 2]) {
                        const candidate = base.slice();
                        candidate[side] += distance * step;
                        if (Math.abs(candidate[side] - initial[side]) > 16 * unit) continue;
                        const measured = badgeBorder(image, candidate);
                        if (measured.score <= edge.score) continue;
                        bounds = candidate;
                        edge = measured;
                    }
                }
                if (bounds === previous) break;
            }
        }
        return { bounds, edge };
    }

    function badgeRows(image, [left, top, right, bottom], padding, visit) {
        const radius = (bottom - top) / 2;
        const extent = radius + padding;
        const center = top + radius;
        for (let y = Math.max(0, top - padding); y < Math.min(image.height, bottom + padding); y++) {
            const dy = y + 0.5 - center;
            const span = Math.sqrt(Math.max(0, extent * extent - dy * dy));
            const start = Math.max(0, Math.ceil(left + radius - span - 0.5));
            const end = Math.min(image.width, Math.floor(right - radius + span - 0.5) + 1);
            visit(y * image.width + start, y * image.width + end);
        }
    }

    function detectSecondaryWatermark(image, proposal, primary) {
        if (!proposal) return null;
        let best;
        for (const { bounds } of badgeCandidates(proposal, image.width, image.height)) {
            const fitted = fitBadge(image, bounds);
            const { edge } = fitted;
            if (edge.agreement < 0.70 || edge.straight < 6 || edge.ends < 6 || edge.score < 12
                || (best && edge.score <= best.edge.score)) continue;

            let count = 0;
            let matched = 0;
            let repeated = 0;
            let dark = 0;
            let bright = 0;
            badgeRows(image, fitted.bounds, 0, (start, end) => {
                for (let index = start; index < end; index++) {
                    const offset = 4 * index;
                    const light = 0.299 * image.data[offset] + 0.587 * image.data[offset + 1] + 0.114 * image.data[offset + 2];
                    count++;
                    matched += Boolean(proposal[index]);
                    repeated += Boolean(primary?.[index]);
                    dark += light < 105;
                    bright += light > 150;
                }
            });
            if (matched < count * 0.85 || repeated > count * 0.25 || dark < count * 0.70
                || bright < count * 0.012 || bright > count * 0.35) continue;
            best = fitted;
        }
        if (!best) return null;

        const mask = new Uint8Array(image.width * image.height);
        badgeRows(image, best.bounds, 1, (start, end) => mask.fill(255, start, end));
        return mask;
    }

    self.detectWatermarkWithAI = detectWatermarkWithAI;
    self.detectSecondaryWatermark = detectSecondaryWatermark;
})();
