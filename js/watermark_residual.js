(() => {
    'use strict';

    function luminance(rgba) {
        const output = new Uint8Array(rgba.length / 4);
        for (let i = 0; i < output.length; i++) {
            const offset = i * 4;
            output[i] = (77 * rgba[offset] + 150 * rgba[offset + 1] + 29 * rgba[offset + 2] + 128) >> 8;
        }
        return output;
    }

    function boxExtrema(values, width, height, radius, maximum) {
        const horizontal = new Uint8Array(values.length);
        const output = new Uint8Array(values.length);
        const choose = maximum ? Math.max : Math.min;
        for (let y = 0; y < height; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
                let value = values[row + x];
                const first = Math.max(0, x - radius);
                const last = Math.min(width - 1, x + radius);
                for (let other = first; other <= last; other++) value = choose(value, values[row + other]);
                horizontal[row + x] = value;
            }
        }
        for (let y = 0; y < height; y++) {
            const first = Math.max(0, y - radius);
            const last = Math.min(height - 1, y + radius);
            for (let x = 0; x < width; x++) {
                let value = horizontal[y * width + x];
                for (let other = first; other <= last; other++) value = choose(value, horizontal[other * width + x]);
                output[y * width + x] = value;
            }
        }
        return output;
    }

    function localDarkBase(luma, width, height, radius) {
        const eroded = boxExtrema(luma, width, height, radius, false);
        return boxExtrema(eroded, width, height, radius, true);
    }

    function retainSmallComponents(candidates, width, height, radius) {
        const output = new Uint8Array(candidates.length);
        const queue = new Int32Array(candidates.length);
        const maxArea = radius * radius * 110;
        for (let start = 0; start < candidates.length; start++) {
            if (!candidates[start]) continue;
            let count = 1;
            queue[0] = start;
            candidates[start] = 0;
            for (let head = 0; head < count; head++) {
                const i = queue[head];
                const x = i % width;
                const y = Math.floor(i / width);
                for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
                    for (let col = Math.max(0, x - 1); col <= Math.min(width - 1, x + 1); col++) {
                        const other = row * width + col;
                        if (!candidates[other]) continue;
                        candidates[other] = 0;
                        queue[count++] = other;
                    }
                }
            }
            // Ignore isolated noise and broad structures, even if both look like highlights.
            if (count >= 5 && count <= maxArea) {
                for (let j = 0; j < count; j++) output[queue[j]] = 1;
            }
        }
        return output;
    }

    function fillResidue(repaired, luma, base, residue, width, height, radius) {
        const source = new Uint8ClampedArray(repaired);
        const search = radius * 3;
        for (let i = 0; i < residue.length; i++) {
            if (!residue[i]) continue;
            const x = i % width;
            const y = Math.floor(i / width);
            let total = 0;
            let red = 0;
            let green = 0;
            let blue = 0;
            for (let row = Math.max(0, y - search); row <= Math.min(height - 1, y + search); row++) {
                const dy = (row - y) ** 2;
                for (let col = Math.max(0, x - search); col <= Math.min(width - 1, x + search); col++) {
                    const other = row * width + col;
                    const difference = Math.abs(luma[other] - base[i]);
                    if (residue[other] || difference > Math.max(16, base[i] * 0.28) || source[other * 4 + 3] < 250) continue;
                    const distance = (col - x) ** 2 + dy;
                    if (distance > search * search) continue;
                    const weight = 1 / ((1 + distance) * (1 + difference * 0.13));
                    total += weight;
                    red += weight * source[other * 4];
                    green += weight * source[other * 4 + 1];
                    blue += weight * source[other * 4 + 2];
                }
            }
            if (!total) continue;
            const newLuma = (0.299 * red + 0.587 * green + 0.114 * blue) / total;
            const amount = Math.min(1, (luma[i] - newLuma - 2) / 7);
            if (amount <= 0) continue;
            const target = i * 4;
            repaired[target] += (red / total - repaired[target]) * amount;
            repaired[target + 1] += (green / total - repaired[target + 1]) * amount;
            repaired[target + 2] += (blue / total - repaired[target + 2]) * amount;
        }
    }

    function refineWatermarkResidue(originalRGBA, repairedRGBA, mask, width, height) {
        const size = width * height;
        if (Math.min(width, height) < 64 || size > 1600000 || mask.length !== size
            || originalRGBA.length !== size * 4 || repairedRGBA.length !== size * 4) return;

        let selected = 0;
        for (const value of mask) selected += value !== 0;
        if (selected < 30 || selected > size * 0.6) return;

        const radius = Math.max(3, Math.min(5, Math.round(Math.max(width, height) / 200)));
        const margin = Math.max(1, Math.round(radius / 2));
        const original = luminance(originalRGBA);
        const repaired = luminance(repairedRGBA);
        const beforeBase = localDarkBase(original, width, height, radius);
        const afterBase = localDarkBase(repaired, width, height, radius);
        const seeds = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            // The model already reduced these bright original strokes, but not all the way.
            if (mask[i] && original[i] - beforeBase[i] >= 10 && original[i] - repaired[i] >= 6) seeds[i] = 1;
        }
        const near = boxExtrema(seeds, width, height, margin, true);
        const candidates = new Uint8Array(size);
        for (let i = 0; i < size; i++) {
            if (mask[i] && near[i] && repairedRGBA[i * 4 + 3] >= 250 && afterBase[i] < 95
                && repaired[i] - afterBase[i] > Math.max(8, 0.1 * afterBase[i])) candidates[i] = 1;
        }
        const retained = retainSmallComponents(candidates, width, height, radius);
        const residue = boxExtrema(retained, width, height, margin, true);
        let count = 0;
        for (let i = 0; i < size; i++) {
            if (!mask[i] || afterBase[i] >= 105 || repairedRGBA[i * 4 + 3] < 250) residue[i] = 0;
            count += residue[i];
        }
        // A broad response is more likely to include actual photo detail than residual strokes.
        if (count && count <= Math.min(selected * 0.25, size * 0.018)) {
            fillResidue(repairedRGBA, repaired, afterBase, residue, width, height, radius);
        }
    }

    self.refineWatermarkResidue = refineWatermarkResidue;
})();
