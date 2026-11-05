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

    function ridgeFeatures(luma, width, height, radius) {
        const ridge = new Float32Array(luma.length);
        const feature = new Float32Array(luma.length);
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

    function correlation(values, width, height, dx, dy, step = 4) {
        const left = Math.max(0, -dx) + 5;
        const right = Math.min(width, width - dx) - 5;
        const top = Math.max(0, -dy) + 5;
        const bottom = Math.min(height, height - dy) - 5;
        const offset = dy * width + dx;
        let leftEnergy = 0;
        let rightEnergy = 0;
        let product = 0;

        for (let y = top; y < bottom; y += step) {
            for (let index = y * width + left, end = y * width + right; index < end; index += step) {
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

    function coarseTranslations(feature, width, height) {
        const decimation = 3;
        const cols = Math.floor(width / decimation);
        const rows = Math.floor(height / decimation);
        const coarse = new Float32Array(cols * rows);
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const source = y * decimation * width + x * decimation;
                let sum = 0;
                for (let dy = 0; dy < decimation; dy++) {
                    for (let dx = 0; dx < decimation; dx++) sum += feature[source + dy * width + dx];
                }
                coarse[y * cols + x] = sum / (decimation * decimation);
            }
        }

        const maxX = Math.floor(cols * 0.60);
        const maxY = Math.floor(rows * 0.60);
        const searchWidth = maxX * 2 + 1;
        const scores = new Float32Array(searchWidth * (maxY + 1));
        const minDistance = Math.min(cols, rows) * 0.10;
        const step = Math.max(3, Math.round(Math.min(cols, rows) / 45));
        for (let dy = 0; dy <= maxY; dy++) {
            for (let dx = dy ? -maxX : 1; dx <= maxX; dx++) {
                if ((cols - Math.abs(dx)) * (rows - dy) < coarse.length * 0.34) continue;
                if (dx * dx + dy * dy < minDistance ** 2) continue;
                scores[dy * searchWidth + dx + maxX] = correlation(coarse, cols, rows, dx, dy, step);
            }
        }

        const peaks = [];
        for (let y = 1; y < maxY; y++) {
            for (let x = 1; x < searchWidth - 1; x++) {
                const index = y * searchWidth + x;
                const score = scores[index];
                if (score < 0.20 || score < Math.max(scores[index - 1], scores[index + 1],
                    scores[index - searchWidth], scores[index + searchWidth])) continue;
                peaks.push({ x: (x - maxX) * decimation, y: y * decimation, score });
            }
        }
        return peaks.sort((a, b) => b.score - a.score).slice(0, 28);
    }

    function refineTranslation(feature, width, height, peak) {
        const correlate = (x, y) => correlation(feature, width, height, x, y);
        let best = { x: peak.x, y: peak.y, score: 0 };
        for (let y = peak.y - 2; y <= peak.y + 2; y++) {
            for (let x = peak.x - 2; x <= peak.x + 2; x++) {
                const score = correlate(x, y);
                if (score > best.score) best = { x, y, score };
            }
        }
        const { x, y, score } = best;
        return {
            x: x + refinePeak([correlate(x - 1, y), score, correlate(x + 1, y)], 1) - 1,
            y: y + refinePeak([correlate(x, y - 1), score, correlate(x, y + 1)], 1) - 1,
            score
        };
    }

    function findSlantedLattice(feature, width, height) {
        const translations = coarseTranslations(feature, width, height)
            .map(peak => refineTranslation(feature, width, height, peak))
            .filter(peak => peak.score >= 0.19);
        let basis = null;
        let shortest = Infinity;

        for (let index = 0; index < translations.length; index++) {
            const u = translations[index];
            const uLength = Math.hypot(u.x, u.y);
            for (let other = index + 1; other < translations.length; other++) {
                const v = translations[other];
                const vLength = Math.hypot(v.x, v.y);
                const distance = uLength + vLength;
                if (distance >= shortest || Math.min(u.score, v.score) < Math.max(u.score, v.score) * 0.64) continue;
                const determinant = u.x * v.y - u.y * v.x;
                const area = Math.abs(determinant);
                if (area < feature.length * 0.012 || area > feature.length * 0.15
                    || area < uLength * vLength * 0.55) continue;
                if (Math.min(Math.abs(u.x), Math.abs(v.x), u.y, v.y) < Math.min(width, height) * 0.025) continue;
                // A lattice must repeat at combinations of its two independent translations.
                const across = correlation(feature, width, height, Math.round(u.x + v.x), Math.round(u.y + v.y));
                const along = correlation(feature, width, height, Math.round(u.x - v.x), Math.round(u.y - v.y));
                if (Math.min(across, along) < Math.max(0.15, Math.min(u.score, v.score) * 0.58)) continue;
                basis = { u, v, determinant, uLength };
                shortest = distance;
            }
        }
        return basis;
    }

    function slantedMask(ridge, feature, width, height) {
        const basis = findSlantedLattice(feature, width, height);
        if (!basis) return null;

        const { u, v, determinant, uLength } = basis;
        const cols = Math.round(uLength);
        const rows = Math.round(Math.abs(determinant) / uLength);
        const tile = new Float32Array(cols * rows);
        const counts = new Uint16Array(tile.length);
        const addresses = new Uint32Array(ridge.length);
        // Express image pixels in the repeating cell's skewed coordinates.
        const a = v.y * cols / determinant;
        const b = -v.x * cols / determinant;
        const c = -u.y * rows / determinant;
        const d = u.x * rows / determinant;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = y * width + x;
                const phase = modulo(Math.round(c * x + d * y), rows) * cols + modulo(Math.round(a * x + b * y), cols);
                addresses[index] = phase;
                tile[phase] += ridge[index];
                counts[phase]++;
            }
        }

        const template = new Uint8Array(tile.length);
        for (let index = 0; index < tile.length; index++) {
            if (counts[index] >= 3 && tile[index] / counts[index] > 16) template[index] = 255;
        }
        // Accept weaker strokes only near a seed shared by several copies.
        const closeSeeds = expand(template, cols, rows, 3);
        for (let index = 0; index < tile.length; index++) {
            if (closeSeeds[index] && counts[index] >= 3 && tile[index] / counts[index] > 9) template[index] = 255;
        }
        const result = new Uint8Array(addresses.length);
        // Allow for soft antialiasing and slight drift between repeated copies. Use a smaller
        // margin when the wider footprint would cover too much of a densely marked image.
        for (const radius of [7, 4, 2]) {
            const expanded = expand(template, cols, rows, radius);
            for (let index = 0; index < result.length; index++) result[index] = expanded[addresses[index]];
            if (usableMask(result)) return result;
        }
        return null;
    }

    function alignedMask(ridge, feature, width, height) {
        const scale = width / analysisEdge;
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
        const result = new Uint8Array(width * height);
        for (let index = 0; index < result.length; index++) {
            if (!grid?.[index] && !template[tile.addresses[index]]) continue;
            result[index] = 255;
        }
        return result;
    }

    function usableMask(mask) {
        if (!mask) return false;
        let selected = 0;
        for (const pixel of mask) if (pixel) selected++;
        return selected >= mask.length * 0.005 && selected <= mask.length * 0.28;
    }

    function detectRepeatingWatermark(image) {
        const resize = Math.min(1, analysisEdge / Math.max(image.width, image.height));
        const width = Math.round(image.width * resize);
        const height = Math.round(image.height * resize);
        if (width < 320 || height < 230) return null;

        const luma = imageLuma(image, width, height);
        const alignedRadius = Math.max(2, Math.round(width / 300));
        const slantedRadius = Math.max(2, Math.ceil(width / 300));
        const aligned = ridgeFeatures(luma, width, height, alignedRadius);
        let result = alignedMask(aligned.ridge, aligned.feature, width, height);
        const slanted = !usableMask(result);
        if (slanted) {
            const features = alignedRadius === slantedRadius ? aligned : ridgeFeatures(luma, width, height, slantedRadius);
            result = slantedMask(features.ridge, features.feature, width, height);
            if (!usableMask(result)) return null;
        }
        if (resize === 1) return { mask: result, slanted };

        const fullSize = new Uint8Array(image.width * image.height);
        const columns = Uint16Array.from({ length: image.width }, (_, x) => Math.floor(x * width / image.width));
        for (let y = 0; y < image.height; y++) {
            const source = Math.floor(y * height / image.height) * width;
            for (let x = 0; x < image.width; x++) fullSize[y * image.width + x] = result[source + columns[x]];
        }
        return { mask: fullSize, slanted };
    }

    self.detectRepeatingWatermark = detectRepeatingWatermark;
})();
