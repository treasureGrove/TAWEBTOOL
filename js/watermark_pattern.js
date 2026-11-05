(function () {
    'use strict';

    const analysisEdge = 1200;
    const modulo = (value, period) => (value % period + period) % period;

    function blurredRows(values, width, height, radius) {
        const result = new Float32Array(values.length);
        const count = radius * 2 + 1;
        for (let y = 0; y < height; y++) {
            const start = y * width;
            let sum = values[start] * (radius + 1);
            for (let x = 1; x <= radius; x++) sum += values[start + x];
            for (let x = 0; x < width; x++) {
                result[start + x] = sum / count;
                sum += values[start + Math.min(width - 1, x + radius + 1)] - values[start + Math.max(0, x - radius)];
            }
        }
        return result;
    }

    function imageLuma({ data, width, height }, analysisWidth, analysisHeight) {
        const luma = new Float32Array(analysisWidth * analysisHeight);

        for (let y = 0; y < analysisHeight; y++) {
            const top = Math.floor(y * height / analysisHeight);
            const bottom = Math.floor((y + 1) * height / analysisHeight);
            for (let x = 0; x < analysisWidth; x++) {
                const left = Math.floor(x * width / analysisWidth);
                const right = Math.floor((x + 1) * width / analysisWidth);
                let sum = 0;
                for (let row = top; row < bottom; row++) {
                    for (let col = left; col < right; col++) {
                        const index = (row * width + col) * 4;
                        sum += data[index] + data[index + 1] + data[index + 2];
                    }
                }
                luma[y * analysisWidth + x] = sum / ((right - left) * (bottom - top) * 3);
            }
        }

        return luma;
    }

    function ridgeFeatures(luma, width, height) {
        const ridge = new Float32Array(luma.length);
        const feature = new Float32Array(luma.length);
        const radius = Math.max(2, Math.round(width / 300));
        const diagonal = Math.max(1, Math.round(radius * Math.SQRT1_2));
        const offsets = [radius, width * radius, (width + 1) * diagonal, (width - 1) * diagonal];

        // A stroke is brighter than its neighbors on both sides in at least one direction.
        for (let y = radius; y < height - radius; y++) {
            for (let x = radius; x < width - radius; x++) {
                const index = y * width + x;
                let strength = 0;
                for (const offset of offsets) {
                    strength = Math.max(strength, luma[index] - Math.max(luma[index - offset], luma[index + offset]));
                }
                ridge[index] = Math.min(36, strength);
                feature[index] = Math.min(1, Math.max(0, (strength - 3) / 18));
            }
        }

        // Subtract local stroke density so that dense scene textures do not dominate the match.
        const radiusMean = 24;
        const horizontal = blurredRows(feature, width, height, radiusMean);
        for (let x = 0; x < width; x++) {
            let sum = horizontal[x] * (radiusMean + 1);
            for (let y = 1; y <= radiusMean; y++) sum += horizontal[y * width + x];
            for (let y = 0; y < height; y++) {
                feature[y * width + x] -= sum / (2 * radiusMean + 1);
                sum += horizontal[Math.min(height - 1, y + radiusMean + 1) * width + x]
                    - horizontal[Math.max(0, y - radiusMean) * width + x];
            }
        }

        return { ridge, feature };
    }

    function correlation(values, width, height, dx, dy) {
        const left = Math.max(0, -dx) + 5;
        const right = Math.min(width, width - dx) - 5;
        const top = Math.max(0, -dy) + 5;
        const bottom = Math.min(height, height - dy) - 5;
        const offset = dy * width + dx;
        let leftEnergy = 0;
        let rightEnergy = 0;
        let product = 0;

        for (let y = top; y < bottom; y += 4) {
            for (let index = y * width + left, end = y * width + right; index < end; index += 4) {
                const a = values[index];
                const b = values[index + offset];
                leftEnergy += a * a;
                rightEnergy += b * b;
                product += a * b;
            }
        }

        return product / Math.sqrt(leftEnergy * rightEnergy) || 0;
    }

    function refinePeak(scores, index) {
        const left = scores[index - 1];
        const peak = scores[index];
        const right = scores[index + 1];
        const curvature = left + right - 2 * peak;
        if (!Number.isFinite(curvature) || curvature >= 0) return index;
        return index + Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature)));
    }

    function strongestPeak(values, width, height, vertical) {
        const size = vertical ? height : width;
        const preferredLimit = Math.round(size * (vertical ? 0.78 : 0.55));
        const limit = Math.round(size * (vertical ? 0.84 : 0.58));
        const scores = new Float32Array(limit + 2);
        let index = 0;
        let tail = 0;
        for (let shift = Math.round(size * 0.05); shift <= limit; shift++) {
            scores[shift] = correlation(values, width, height, vertical ? 0 : shift, vertical ? shift : 0);
            if (shift <= preferredLimit) {
                if (scores[shift] > scores[index]) index = shift;
            } else if (scores[shift] > scores[tail]) {
                tail = shift;
            }
        }
        if (scores[index] < (vertical ? 0.065 : 0.045) && scores[tail] > scores[index]) index = tail;
        return { period: refinePeak(scores, index), score: scores[index], scores };
    }

    function staggeredPeak(values, width, height, periodX, periodY) {
        const shiftX = Math.round(periodX / 2);
        let period = 0;
        let strength = 0;
        // Alternating rows align after one or two vertical periods.
        for (const candidate of [periodY / 2, periodY]) {
            for (let dy = -1; dy <= 1; dy++) {
                const shiftY = Math.round(candidate) + dy;
                for (let dx = shiftX - 1; dx <= shiftX + 1; dx++) {
                    const positive = correlation(values, width, height, dx, shiftY);
                    const negative = correlation(values, width, height, -dx, shiftY);
                    const score = (positive + negative) / 2;
                    if (score > strength + (period && candidate > period ? 0.006 : 0)) {
                        period = candidate;
                        strength = score;
                    }
                }
            }
        }
        return { period, strength };
    }

    function fold(values, width, height, periodX, periodY, stagger = 0, excluded = null) {
        const cols = Math.round(periodX);
        const rows = Math.round(periodY);
        const sums = new Float32Array(cols * rows);
        const counts = new Uint16Array(sums.length);
        const addresses = new Uint32Array(values.length);

        for (let y = 0; y < height; y++) {
            const phaseY = Math.round(modulo(y, periodY) * rows / periodY) % rows;
            const offset = Math.floor(y / periodY) * stagger;
            for (let x = 0; x < width; x++) {
                const phaseX = Math.round(modulo(x - offset, periodX) * cols / periodX) % cols;
                const phase = phaseY * cols + phaseX;
                const index = y * width + x;
                addresses[index] = phase;
                if (!excluded?.[index]) sums[phase] += values[index];
                counts[phase]++;
            }
        }

        for (let index = 0; index < sums.length; index++) {
            if (counts[index]) sums[index] /= counts[index];
        }
        return { values: sums, addresses, cols, rows };
    }

    function diagonalPhase(tile, sign) {
        const { values, cols, rows } = tile;
        const strength = new Float32Array(cols);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) strength[modulo(x + sign * y, cols)] += values[y * cols + x];
        }
        let peak = 0;
        let sum = 0;
        for (let phase = 0; phase < cols; phase++) {
            sum += strength[phase];
            if (strength[phase] > strength[peak]) peak = phase;
        }
        return { peak, confidence: strength[peak] * cols / sum };
    }

    function expand(template, cols, rows, radius) {
        const result = new Uint8Array(template.length);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                if (!template[y * cols + x]) continue;
                for (let row = y - radius; row <= y + radius; row++) {
                    for (let col = x - radius; col <= x + radius; col++) {
                        result[modulo(row, rows) * cols + modulo(col, cols)] = 255;
                    }
                }
            }
        }
        return result;
    }

    function gridMask(tile, scale) {
        const positive = diagonalPhase(tile, 1);
        const negative = diagonalPhase(tile, -1);
        if (positive.confidence < 2.2 || negative.confidence < 2.2) return null;
        const { values, cols, rows, addresses } = tile;
        const template = new Uint8Array(values.length);
        const radius = Math.max(1, Math.round(2 * scale));
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const dist1 = Math.abs(modulo(x + y - positive.peak + cols / 2, cols) - cols / 2);
                const dist2 = Math.abs(modulo(x - y - negative.peak + cols / 2, cols) - cols / 2);
                const index = y * cols + x;
                if (Math.min(dist1, dist2) <= radius && values[index] > 10) template[index] = 255;
            }
        }
        const expanded = expand(template, cols, rows, Math.max(1, Math.round(scale)));
        const mask = new Uint8Array(addresses.length);
        for (let index = 0; index < mask.length; index++) mask[index] = expanded[addresses[index]];
        return mask;
    }

    function labelMask(tile, scale, grid) {
        const { values, cols, rows } = tile;
        const threshold = grid ? 17 : 26;
        const bandRadius = Math.round(rows * (grid ? 0.10 : 0.15));
        const counts = new Uint16Array(rows);
        for (let index = 0; index < values.length; index++) {
            if (values[index] > (grid ? 22 : 25)) counts[Math.floor(index / cols)]++;
        }
        let center = 0;
        let sum = 0;
        for (let offset = -bandRadius; offset <= bandRadius; offset++) sum += counts[modulo(offset, rows)];
        let strength = sum;
        for (let y = 1; y < rows; y++) {
            sum += counts[modulo(y + bandRadius, rows)] - counts[modulo(y - bandRadius - 1, rows)];
            if (sum > strength) {
                center = y;
                strength = sum;
            }
        }
        const template = new Uint8Array(values.length);
        for (let offset = -bandRadius; offset <= bandRadius; offset++) {
            const start = modulo(center + offset, rows) * cols;
            for (let x = 0; x < cols; x++) {
                if (values[start + x] > threshold) template[start + x] = 255;
            }
        }
        return expand(template, cols, rows, Math.max(1, Math.round((grid ? 2 : 3) * scale)));
    }

    function detectRepeatingWatermark(image) {
        const resize = Math.min(1, analysisEdge / Math.max(image.width, image.height));
        const width = Math.round(image.width * resize);
        const height = Math.round(image.height * resize);
        if (width < 320 || height < 230) return null;
        const scale = width / analysisEdge;
        const { ridge, feature } = ridgeFeatures(imageLuma(image, width, height), width, height);
        const horizontal = strongestPeak(feature, width, height, false);
        const vertical = strongestPeak(feature, width, height, true);
        if (horizontal.score < 0.045 || vertical.score < 0.065) return null;
        const staggered = staggeredPeak(feature, width, height, horizontal.period, vertical.period);
        let periodY = staggered.period;
        let rowShift = horizontal.period / 2;

        if (staggered.strength < 0.04) {
            const dx = Math.round(horizontal.period);
            const dy = Math.round(vertical.period);
            const matchingTiles = Math.min(
                correlation(feature, width, height, dx, dy),
                correlation(feature, width, height, -dx, dy)
            );
            if (horizontal.score < 0.075 || matchingTiles < 0.10) return null;
            periodY = vertical.period;
            rowShift = 0;
        }

        // A strong horizontal harmonic can indicate a grid behind the repeated labels.
        let grid = null;
        for (let divisor = 5; divisor >= 1; divisor--) {
            const guess = horizontal.period / divisor;
            const index = Math.round(guess);
            const score = horizontal.scores[index];
            if (score < Math.max(0.12, horizontal.score * 0.55)) continue;
            const period = refinePeak(horizontal.scores, index);
            const multiplier = Math.round(periodY / period);
            if (multiplier < 1 || Math.abs(period * multiplier - periodY) > 2) continue;
            grid = gridMask(fold(ridge, width, height, period, period * multiplier), scale);
            if (grid) break;
        }

        const tile = fold(ridge, width, height, horizontal.period, periodY, rowShift, grid);
        const template = labelMask(tile, scale, grid);
        let selectedPixels = 0;
        const result = new Uint8Array(width * height);
        for (let index = 0; index < result.length; index++) {
            if (!grid?.[index] && !template[tile.addresses[index]]) continue;
            result[index] = 255;
            selectedPixels++;
        }
        if (selectedPixels < result.length * 0.005 || selectedPixels > result.length * 0.28) return null;
        if (resize === 1) return result;

        const fullSize = new Uint8Array(image.width * image.height);
        const columns = Uint16Array.from({ length: image.width }, (_, x) => Math.floor(x * width / image.width));
        for (let y = 0; y < image.height; y++) {
            const source = Math.floor(y * height / image.height) * width;
            for (let x = 0; x < image.width; x++) fullSize[y * image.width + x] = result[source + columns[x]];
        }
        return fullSize;
    }

    self.detectRepeatingWatermark = detectRepeatingWatermark;
})();
