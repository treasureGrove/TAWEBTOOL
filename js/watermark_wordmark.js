(() => {
    'use strict';
    const workingSize = 240;
    const maxDetailSize = 1200;
    const samples = 245;
    const confidenceThreshold = 0.58;

    function makeCanvas(width, height) {
        return new OffscreenCanvas(width, height);
    }

    function sampleSource(image) {
        const { width, height, data } = image;
        const scale = Math.min(1, maxDetailSize / Math.max(width, height));
        const scaledWidth = Math.max(1, Math.round(width * scale));
        const scaledHeight = Math.max(1, Math.round(height * scale));
        const canvas = makeCanvas(scaledWidth, scaledHeight);
        let rgba;
        if (scale === 1) {
            rgba = data instanceof Uint8ClampedArray ? data : new Uint8ClampedArray(data);
        } else {
            rgba = new Uint8ClampedArray(scaledWidth * scaledHeight * 4);
            for (let y = 0; y < scaledHeight; y++) {
                const sourceRow = Math.floor(y * height / scaledHeight) * width;
                for (let x = 0; x < scaledWidth; x++) {
                    const sourcePixel = 4 * (sourceRow + Math.floor(x * width / scaledWidth));
                    rgba.set(data.subarray(sourcePixel, sourcePixel + 4), 4 * (y * scaledWidth + x));
                }
            }
        }
        canvas.getContext('2d').putImageData(new ImageData(rgba, scaledWidth, scaledHeight), 0, 0);
        return canvas;
    }

    function extract(canvas, channel) {
        const rgba = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
        const output = new Float32Array(canvas.width * canvas.height);
        for (let i = 0; i < output.length; i++) {
            const offset = 4 * i;
            output[i] = channel === 'luma' ? rgba[offset] * .299 + rgba[offset+1] * .587 + rgba[offset+2] * .114 : rgba[offset + 3] / 255;
        }
        return output;
    }

    function blur(values, width, height, radius) {
        const temp = new Float32Array(values.length);
        const output = new Float32Array(values.length);
        const divisor = 2 * radius + 1;
        for (let y = 0; y < height; y++) {
            const base = y * width;
            let sum = values[base] * (radius + 1);
            for (let k = 1; k <= radius; k++) sum += values[base + Math.min(width - 1, k)];
            for (let x = 0; x < width; x++) {
                temp[base + x] = sum / divisor;
                sum += values[base + Math.min(width - 1, x + radius + 1)] - values[base + Math.max(0, x - radius)];
            }
        }
        for (let x = 0; x < width; x++) {
            let sum = temp[x] * (radius + 1);
            for (let k = 1; k <= radius; k++) sum += temp[x + width * Math.min(height - 1, k)];
            for (let y = 0; y < height; y++) {
                output[y * width + x] = sum / divisor;
                sum += temp[x + width * Math.min(height - 1, y + radius + 1)] - temp[x + width * Math.max(0, y - radius)];
            }
        }
        return output;
    }

    function edgeResponse(source, width, height) {
        const lowPass = blur(source, width, height, 5);
        const energy = new Float32Array(source.length);
        for (let i = 0; i < energy.length; i++) {
            source[i] = Math.min(48, Math.max(-48, source[i] - lowPass[i]));
            energy[i] = source[i] ** 2;
        }
        const localEnergy = blur(energy, width, height, 7);
        for (let i = 0; i < energy.length; i++) source[i] = Math.min(2, Math.max(-2, source[i] / Math.sqrt(localEnergy[i] + 24)));
        return source;
    }

    function typography(word) {
        const canvas = makeCanvas(1, 1);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const font = 'bold 150px Arial, sans-serif';
        context.font = font;
        const text = context.measureText(word);
        canvas.width = Math.ceil(text.actualBoundingBoxLeft + text.actualBoundingBoxRight);
        canvas.height = Math.ceil(text.actualBoundingBoxAscent + text.actualBoundingBoxDescent);
        context.font = font;
        context.fillText(word, text.actualBoundingBoxLeft, text.actualBoundingBoxAscent);
        return canvas;
    }

    function rotatedText(text, angle) {
        const radians = -angle * Math.PI / 180;
        const s = Math.abs(Math.sin(radians));
        const c = Math.abs(Math.cos(radians));
        const canvas = makeCanvas(Math.ceil(c*text.width + s*text.height), Math.ceil(s*text.width+c*text.height));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate(radians);
        context.drawImage(text, -text.width / 2, -text.height / 2);
        const alpha = extract(canvas, 'alpha');
        let left = canvas.width, right = 0, top = canvas.height, bottom = 0;
        for (let i = 0; i < alpha.length; i++) {
            if (alpha[i] <= 0.1) continue;
            const x = i % canvas.width;
            const y = Math.floor(i / canvas.width);
            left = Math.min(x, left);
            right = Math.max(x, right);
            top = Math.min(y, top);
            bottom = Math.max(y, bottom);
        }
        const out = makeCanvas(right - left + 1, bottom - top + 1);
        out.getContext('2d').drawImage(canvas, -left, -top);
        return out;
    }

    function makeTemplate(rotated, scaledWidth, stride) {
        const boxHeight = Math.round(scaledWidth * rotated.height / rotated.width);
        const mask = makeCanvas(scaledWidth + 8, boxHeight + 8);
        const context = mask.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingQuality = 'high';
        context.drawImage(rotated, 4, 4, scaledWidth, boxHeight);
        const alpha = extract(mask, 'alpha');
        const low = blur(alpha, mask.width, mask.height, 3);
        const positions = [];
        for (let i = 0; i < alpha.length; i++) {
            const value = alpha[i] - low[i];
            if (Math.abs(value) > 0.10) positions.push(i);
        }
        const step = Math.max(1, Math.round(positions.length / samples));
        const values = [];
        const offsets = [];
        const sections = [];
        let energy = 0;
        for (let i = 0; i < positions.length; i += step) {
            const position = positions[i];
            const value = alpha[position] - low[position];
            const column = position % mask.width;
            offsets.push(column + Math.floor(position / mask.width) * stride);
            sections.push(Math.floor(3 * column / mask.width));
            values.push(value);
            energy += value ** 2;
        }
        return { mask, offsets: Int32Array.from(offsets), values: Float32Array.from(values), sections, energy };
    }

    function compareAt(response, base, template) {
        const { offsets, values, energy } = template;
        let dot = 0;
        let srcEnergy = 0;
        for (let i = 0; i < offsets.length; i++) {
            const value = response[base + offsets[i]];
            dot += value * values[i];
            srcEnergy += value * value;
        }
        return dot / Math.sqrt(energy * Math.max(srcEnergy, 1));
    }

    function matchesWholeWordmark(response, base, template) {
        const { offsets, values, sections } = template;
        const dots = [0, 0, 0];
        const sampleEnergy = [0, 0, 0];
        const templateEnergy = [0, 0, 0];
        for (let i = 0; i < offsets.length; i++) {
            const section = sections[i];
            const sample = response[base + offsets[i]];
            dots[section] += sample * values[i];
            sampleEnergy[section] += sample * sample;
            templateEnergy[section] += values[i] * values[i];
        }
        // Known wordmarks can share a run of letters. Require evidence across the full word.
        return dots.every((dot, section) => dot >= 0.3 * Math.sqrt(templateEnergy[section] * Math.max(1, sampleEnergy[section])));
    }

    function detectLargeWordmark(source, word) {
        const { width, height, response } = source;
        const text = typography(word);
        const best = { score: 0 };
        const rotations = new Map();
        const coarse = [];
        const atAngle = angle => {
            if (!rotations.has(angle)) rotations.set(angle, rotatedText(text, angle));
            return rotations.get(angle);
        };
        // Start with a coarse pose search, then test substeps only near strong matches.
        for (const direction of [-1, 1]) {
            for (let angle = 12; angle <= 42; angle += 3) {
                const actual = direction * angle;
                const rotated = atAngle(actual);
                for (let size = Math.round(.52*width); size < Math.round(.95*width); size += 5) {
                    const template = makeTemplate(rotated, size, width);
                    let localBest = { score: 0 };
                    for (let y = 0; y <= height - template.mask.height; y += 4) {
                        for (let x = 0; x <= width - template.mask.width; x += 4) {
                            const score = compareAt(response, y * width + x, template);
                            if (score > localBest.score) localBest = { score, x, y, angle: actual, size };
                        }
                    }
                    coarse.push(localBest);
                }
            }
        }
        coarse.sort((a,b) => b.score - a.score);
        const tested = new Set();
        for (const c of coarse.slice(0, 7)) {
            for (let angle = c.angle - 2; angle <= c.angle + 2; angle++) {
                const rotated = atAngle(angle);
                for (let size = c.size - 4; size <= c.size + 4; size++) {
                    const key = [angle, size, c.x, c.y].join(':');
                    if (tested.has(key)) continue;
                    tested.add(key);
                    const template = makeTemplate(rotated, size, width);
                    for (let y = Math.max(0,c.y-5); y <= Math.min(c.y+5,height-template.mask.height); y++) {
                        for (let x = Math.max(0,c.x-5); x <= Math.min(c.x+5,width-template.mask.width); x++) {
                            const base = y * width + x;
                            const score = compareAt(response, base, template);
                            if (score > best.score && score >= confidenceThreshold && matchesWholeWordmark(response, base, template)) {
                                Object.assign(best, { score, x, y, angle, size, canvas: template.mask });
                            }
                        }
                    }
                }
            }
        }
        return best;
    }

    function findWhiteComponents(source) {
        const { width, height } = source;
        const rgba = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, width, height).data;
        const brightness = new Uint8Array(width * height);
        for (let i = 0; i < brightness.length; i++) {
            const p = 4 * i;
            const low = Math.min(rgba[p], rgba[p + 1], rgba[p + 2]);
            const high = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
            brightness[i] = rgba[p + 3] > 240 && low >= 238 && high - low <= 18;
        }

        const labels = new Int32Array(brightness.length);
        const queue = new Int32Array(brightness.length);
        const components = [];
        let id = 0;
        for (let i = 0; i < brightness.length; i++) {
            if (!brightness[i] || labels[i]) continue;
            labels[i] = ++id;
            queue[0] = i;
            let count = 1;
            let left = width;
            let top = height;
            let right = 0;
            let bottom = 0;
            for (let head = 0; head < count; head++) {
                const pixel = queue[head];
                const x = pixel % width;
                const y = Math.floor(pixel / width);
                left = Math.min(x, left);
                right = Math.max(x, right);
                top = Math.min(y, top);
                bottom = Math.max(y, bottom);
                for (let row = Math.max(0, y - 1); row <= Math.min(height - 1, y + 1); row++) {
                    for (let column = Math.max(0, x - 1); column <= Math.min(width - 1, x + 1); column++) {
                        const neighbor = row * width + column;
                        if (brightness[neighbor] && !labels[neighbor]) {
                            labels[neighbor] = id;
                            queue[count++] = neighbor;
                        }
                    }
                }
            }
            const w = right - left + 1;
            const h = bottom - top + 1;
            if (h >= height * .025 && h <= height * .095 && w > width * .002 && w <= height * .09
                && count >= h * 1.25 && count <= w * h * .98) components.push({ id, x: left, y: top, w, h });
        }
        return { brightness, labels, components };
    }

    function findIdLabel(mask, brightness, width, height, first) {
        const text = typography('ID');
        const wordWidth = Math.round(first.h * text.width / text.height);
        const local = makeCanvas(wordWidth, first.h);
        local.getContext('2d').drawImage(text, 0, 0, wordWidth, first.h);
        const template = extract(local, 'alpha');
        const templateArea = template.reduce((count, value) => count + (value >= .5), 0);
        const left = Math.max(0, first.x - Math.round(first.h * 2.5));
        const top = Math.max(0, first.y - Math.round(first.h * .25));
        let bestScore = .55;
        let bestX = -1;
        let bestY = -1;
        for (let y = top; y <= Math.min(height - first.h, first.y + Math.round(first.h * .25)); y++) {
            for (let x = left; x <= first.x - wordWidth; x++) {
                let brightArea = 0;
                let intersection = 0;
                for (let row = 0; row < first.h; row++) {
                    for (let col = 0; col < wordWidth; col++) {
                        const bright = brightness[(y + row) * width + x + col];
                        brightArea += bright;
                        intersection += bright && template[row * wordWidth + col] >= .5;
                    }
                }
                const score = intersection / (templateArea + brightArea - intersection);
                if (score > bestScore) {
                    bestScore = score;
                    bestX = x;
                    bestY = y;
                }
            }
        }
        if (bestX < 0) return false;
        for (let row = 0; row < first.h; row++) {
            for (let col = 0; col < wordWidth; col++) {
                if (template[row * wordWidth + col] >= .16) mask[(bestY + row) * width + bestX + col] = 255;
            }
        }
        return true;
    }

    function markImageId(source, mask) {
        const { width, height } = source;
        const { brightness, labels, components } = findWhiteComponents(source);
        if (components.length < 5 || components.length > 1024) return;
        components.sort((a, b) => a.x - b.x);
        const lines = [];
        for (const item of components) {
            const midpoint = item.y + item.h / 2;
            let current = [];
            for (const other of components) {
                if (Math.abs(other.y + other.h / 2 - midpoint) >= item.h * .16
                    || Math.abs(other.h - item.h) >= item.h * .22) continue;
                const previous = current[current.length - 1];
                if (previous && other.x - previous.x - previous.w > item.h * 1.1) {
                    if (current.length >= 5) lines.push(current);
                    current = [];
                }
                current.push(other);
            }
            if (current.length >= 5) lines.push(current);
        }
        lines.sort((a, b) => b.length - a.length);
        const line = lines[0];
        if (!line || !findIdLabel(mask, brightness, width, height, line[0])) return;
        const selected = new Set(line.map((component) => component.id));
        for (let i = 0; i < labels.length; i++) {
            if (selected.has(labels[i])) mask[i] = 255;
        }
    }

    function detectDiagonalWatermark(image) {
        if (typeof OffscreenCanvas === 'undefined') return null;
        const { width, height, data } = image;
        if (Math.min(width, height) < 80 || data.length !== width * height * 4) return null;
        const source = sampleSource(image);
        const detailWidth = source.width;
        const detailHeight = source.height;
        const ratio = Math.min(1, workingSize / Math.max(detailWidth, detailHeight));
        const work = makeCanvas(Math.max(1, Math.round(detailWidth * ratio)), Math.max(1, Math.round(detailHeight * ratio)));
        const context = work.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, work.width, work.height);
        const response = edgeResponse(extract(work, 'luma'), work.width, work.height);
        if (!response.some((value) => Math.abs(value) > 0.6)) return null;
        const search = { width: work.width, height: work.height, response };
        let result = null;
        for (const word of ['imagesart', 'gettyimages']) {
            const candidate = detectLargeWordmark(search, word);
            if (candidate.score >= confidenceThreshold) {
                result = candidate;
                break;
            }
        }
        if (!result) return null;

        const output = makeCanvas(detailWidth, detailHeight);
        const outContext = output.getContext('2d', { willReadFrequently: true });
        const scaleX = detailWidth / work.width;
        const scaleY = detailHeight / work.height;
        outContext.drawImage(result.canvas, result.x * scaleX, result.y * scaleY,
            result.canvas.width * scaleX, result.canvas.height * scaleY);
        const alpha = extract(output, 'alpha');
        const mask = new Uint8Array(alpha.length);
        for (let i = 0; i < alpha.length; i++) mask[i] = alpha[i] > .15 ? 255 : 0;
        markImageId(source, mask);

        // A small margin accounts for antialiasing and subpixel alignment.
        const margin = Math.max(1, Math.round(Math.max(detailWidth, detailHeight) * 0.004));
        const spread = blur(mask, detailWidth, detailHeight, margin);
        for (let i = 0; i < mask.length; i++) mask[i] = spread[i] > .01 ? 255 : 0;
        if (detailWidth === width && detailHeight === height) return mask;

        const fullMask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
            const row = Math.floor(y * detailHeight / height) * detailWidth;
            for (let x = 0; x < width; x++) fullMask[y * width + x] = mask[row + Math.floor(x * detailWidth / width)];
        }
        return fullMask;
    }

    self.detectDiagonalWatermark = detectDiagonalWatermark;
})();
