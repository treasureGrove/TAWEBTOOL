// ===== GIF Compressor - Pure JS, no external dependencies =====

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    originalImg: document.getElementById('originalImg'),
    compressedImg: document.getElementById('compressedImg'),
    originalPreview: document.getElementById('originalPreview'),
    compressedPreview: document.getElementById('compressedPreview'),
    originalInfo: document.getElementById('originalInfo'),
    compressedInfo: document.getElementById('compressedInfo'),
    scale: document.getElementById('scale'),
    scaleValue: document.getElementById('scaleValue'),
    colors: document.getElementById('colors'),
    colorValue: document.getElementById('colorValue'),
    frameSkip: document.getElementById('frameSkip'),
    lossy: document.getElementById('lossy'),
    lossyValue: document.getElementById('lossyValue'),
    compressBtn: document.getElementById('compressBtn'),
    clearBtn: document.getElementById('clearBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText')
};

let originalFile = null;
let compressedBlob = null;

initEvents();

// ===== Event Handling =====

function initEvents() {
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);

    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.add('drag-over');
    });
    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('drag-over');
    });
    elements.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'image/gif');
        if (files.length > 0) loadGif(files[0]);
    });

    elements.scale.addEventListener('input', () => {
        elements.scaleValue.textContent = elements.scale.value;
    });
    elements.colors.addEventListener('input', () => {
        elements.colorValue.textContent = elements.colors.value;
    });
    elements.lossy.addEventListener('input', () => {
        elements.lossyValue.textContent = elements.lossy.value;
    });

    elements.compressBtn.addEventListener('click', compressGif);
    elements.clearBtn.addEventListener('click', clearAll);
    elements.downloadBtn.addEventListener('click', downloadResult);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'image/gif') {
        loadGif(file);
    }
    e.target.value = '';
}

function loadGif(file) {
    originalFile = file;
    compressedBlob = null;

    const url = URL.createObjectURL(file);
    elements.originalImg.src = url;
    elements.originalImg.style.display = 'block';
    elements.originalImg.onload = () => {
        const placeholder = elements.originalPreview.querySelector('.preview-placeholder');
        if (placeholder) placeholder.style.display = 'none';
    };

    elements.originalInfo.textContent = `文件名: ${file.name} | 体积: ${formatSize(file.size)}`;
    elements.compressBtn.disabled = false;

    elements.compressedImg.style.display = 'none';
    elements.compressedImg.src = '';
    elements.compressedInfo.textContent = '';
    elements.downloadBtn.style.display = 'none';
    const placeholder2 = elements.compressedPreview.querySelector('.preview-placeholder');
    if (placeholder2) placeholder2.style.display = '';
}

// ===== Main Compression Flow =====

async function compressGif() {
    if (!originalFile) return;

    elements.compressBtn.disabled = true;
    elements.downloadBtn.style.display = 'none';
    showProgress('正在解析GIF帧...', 0);

    try {
        const arrayBuffer = await originalFile.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        await yieldToUI();
        const frames = parseGifFrames(bytes);

        const scaleRatio = parseInt(elements.scale.value) / 100;
        const maxColors = parseInt(elements.colors.value);
        const frameSkip = parseInt(elements.frameSkip.value);
        const lossyLevel = parseInt(elements.lossy.value);

        // Filter frames by skip interval
        const filteredFrames = [];
        for (let i = 0; i < frames.length; i += frameSkip) {
            const frame = frames[i];
            frame.delay = frame.delay * frameSkip;
            filteredFrames.push(frame);
        }

        const outWidth = Math.max(1, Math.round(filteredFrames[0].width * scaleRatio));
        const outHeight = Math.max(1, Math.round(filteredFrames[0].height * scaleRatio));

        showProgress('缩放帧画面...', 10);
        await yieldToUI();

        // Scale frames and extract pixel data
        const canvas = document.createElement('canvas');
        canvas.width = outWidth;
        canvas.height = outHeight;
        const ctx = canvas.getContext('2d');

        const framePixelData = [];
        for (let i = 0; i < filteredFrames.length; i++) {
            ctx.clearRect(0, 0, outWidth, outHeight);
            ctx.drawImage(filteredFrames[i].canvas, 0, 0, outWidth, outHeight);
            const imgData = ctx.getImageData(0, 0, outWidth, outHeight);

            if (lossyLevel > 0) {
                applyLossy(imgData.data, lossyLevel);
            }

            framePixelData.push(imgData.data);

            if (i % 3 === 0) await yieldToUI();
        }

        // Build global color palette
        showProgress('构建调色板...', 20);
        await yieldToUI();
        const palette = buildGlobalPalette(framePixelData, outWidth, outHeight, maxColors);
        const lookupColor = buildColorLookup(palette);

        // Encode GIF
        showProgress('编码GIF...', 30);
        await yieldToUI();

        const gifBytes = await encodeAnimatedGif(
            framePixelData, filteredFrames, outWidth, outHeight,
            palette, lookupColor,
            (frameIdx, total) => {
                const pct = 30 + Math.round((frameIdx / total) * 65);
                showProgress(`编码帧: ${frameIdx}/${total}`, pct);
            }
        );

        compressedBlob = new Blob([gifBytes], { type: 'image/gif' });

        const url = URL.createObjectURL(compressedBlob);
        elements.compressedImg.src = url;
        elements.compressedImg.style.display = 'block';
        const placeholder = elements.compressedPreview.querySelector('.preview-placeholder');
        if (placeholder) placeholder.style.display = 'none';

        const ratio = ((1 - compressedBlob.size / originalFile.size) * 100).toFixed(1);
        const reduced = compressedBlob.size < originalFile.size;
        elements.compressedInfo.innerHTML =
            `体积: ${formatSize(compressedBlob.size)} | ` +
            `<span class="${reduced ? 'size-reduced' : 'size-increased'}">` +
            `${reduced ? '减少' : '增加'} ${Math.abs(ratio)}%</span> | ` +
            `${filteredFrames.length} 帧, ${outWidth}x${outHeight}`;

        elements.downloadBtn.style.display = '';
        showProgress('压缩完成！', 100);

    } catch (err) {
        console.error('GIF compression error:', err);
        showProgress('压缩失败: ' + err.message, 0);
    } finally {
        elements.compressBtn.disabled = false;
    }
}

// ===== GIF Encoder =====

async function encodeAnimatedGif(framePixelData, frames, width, height, palette, lookupColor, onProgress) {
    const buf = [];

    function writeByte(b) { buf.push(b & 0xFF); }
    function writeShort(s) { writeByte(s); writeByte(s >> 8); }
    function writeString(s) { for (let i = 0; i < s.length; i++) writeByte(s.charCodeAt(i)); }

    // Pad palette to power of 2
    const paletteExp = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
    const paletteSize = 1 << paletteExp;
    const minCodeSize = Math.max(2, paletteExp);

    const paddedPalette = palette.slice();
    while (paddedPalette.length < paletteSize) {
        paddedPalette.push([0, 0, 0]);
    }

    // === Header ===
    writeString('GIF89a');

    // === Logical Screen Descriptor ===
    writeShort(width);
    writeShort(height);
    const packed = 0x80 | ((paletteExp - 1) << 4) | (paletteExp - 1);
    writeByte(packed);
    writeByte(0); // Background Color Index
    writeByte(0); // Pixel Aspect Ratio

    // === Global Color Table ===
    for (let i = 0; i < paletteSize; i++) {
        writeByte(paddedPalette[i][0]);
        writeByte(paddedPalette[i][1]);
        writeByte(paddedPalette[i][2]);
    }

    // === Netscape Extension (loop forever) ===
    writeByte(0x21); writeByte(0xFF); writeByte(0x0B);
    writeString('NETSCAPE2.0');
    writeByte(0x03); writeByte(0x01);
    writeShort(0); // loop count: 0 = infinite
    writeByte(0x00);

    // === Frames ===
    for (let f = 0; f < framePixelData.length; f++) {
        const pixels = framePixelData[f];
        const delayCentiseconds = Math.max(2, Math.round(frames[f].delay / 10));

        // Graphic Control Extension
        writeByte(0x21); writeByte(0xF9); writeByte(0x04);
        writeByte(0x04); // disposal=1 (do not dispose), no transparency
        writeShort(delayCentiseconds);
        writeByte(0x00); // transparent color index
        writeByte(0x00); // block terminator

        // Image Descriptor
        writeByte(0x2C);
        writeShort(0); writeShort(0); // left, top
        writeShort(width); writeShort(height);
        writeByte(0x00); // no local color table

        // Map pixels to palette indices
        const indices = new Uint8Array(width * height);
        for (let i = 0; i < width * height; i++) {
            const offset = i * 4;
            indices[i] = lookupColor(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
        }

        // LZW encode
        const lzwData = lzwEncode(indices, minCodeSize);

        // Write as sub-blocks
        writeByte(minCodeSize);
        let pos = 0;
        while (pos < lzwData.length) {
            const chunkSize = Math.min(255, lzwData.length - pos);
            writeByte(chunkSize);
            for (let i = 0; i < chunkSize; i++) {
                buf.push(lzwData[pos++]);
            }
        }
        writeByte(0x00); // block terminator

        if (onProgress) onProgress(f + 1, framePixelData.length);
        if (f % 2 === 0) await yieldToUI();
    }

    // === Trailer ===
    writeByte(0x3B);

    return new Uint8Array(buf);
}

// ===== LZW Encoder =====

function lzwEncode(indices, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;

    let codeSize = minCodeSize + 1;
    let nextCode, table;

    function resetTable() {
        table = new Map();
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
    }

    const outputBytes = [];
    let bitBuf = 0;
    let bitCount = 0;

    function emitCode(code) {
        bitBuf |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
            outputBytes.push(bitBuf & 0xFF);
            bitBuf >>= 8;
            bitCount -= 8;
        }
    }

    resetTable();
    emitCode(clearCode);

    if (indices.length === 0) {
        emitCode(eoiCode);
        if (bitCount > 0) outputBytes.push(bitBuf & 0xFF);
        return outputBytes;
    }

    let prefix = indices[0];

    for (let i = 1; i < indices.length; i++) {
        const suffix = indices[i];
        const key = prefix * 256 + suffix;

        if (table.has(key)) {
            prefix = table.get(key);
        } else {
            emitCode(prefix);

            if (nextCode < 4096) {
                table.set(key, nextCode);
                if (nextCode >= (1 << codeSize) && codeSize < 12) {
                    codeSize++;
                }
                nextCode++;
            } else {
                emitCode(clearCode);
                resetTable();
            }

            prefix = suffix;
        }
    }

    emitCode(prefix);
    emitCode(eoiCode);

    if (bitCount > 0) outputBytes.push(bitBuf & 0xFF);

    return outputBytes;
}

// ===== Color Quantization =====

function buildGlobalPalette(framePixelData, width, height, maxColors) {
    const pixelCount = width * height;
    const totalPixels = framePixelData.length * pixelCount;
    const step = Math.max(1, Math.floor(totalPixels / 50000));

    const samples = [];
    let counter = 0;

    for (let f = 0; f < framePixelData.length; f++) {
        const data = framePixelData[f];
        for (let i = 0; i < pixelCount; i++) {
            if (counter++ % step === 0) {
                const offset = i * 4;
                samples.push([data[offset], data[offset + 1], data[offset + 2]]);
            }
        }
    }

    if (samples.length === 0) return [[0, 0, 0]];
    return medianCut(samples, maxColors);
}

function medianCut(colors, maxColors) {
    if (colors.length <= maxColors) {
        return colors.length > 0 ? colors : [[0, 0, 0]];
    }

    let buckets = [colors];

    while (buckets.length < maxColors) {
        let splitIdx = -1, maxRange = -1;

        for (let i = 0; i < buckets.length; i++) {
            if (buckets[i].length <= 1) continue;
            const range = channelRange(buckets[i]);
            if (range > maxRange) {
                maxRange = range;
                splitIdx = i;
            }
        }

        if (splitIdx === -1) break;

        const bucket = buckets[splitIdx];
        const channel = dominantChannel(bucket);
        bucket.sort((a, b) => a[channel] - b[channel]);
        const mid = Math.floor(bucket.length / 2);

        buckets[splitIdx] = bucket.slice(0, mid);
        buckets.push(bucket.slice(mid));
    }

    return buckets.map(bucket => {
        let r = 0, g = 0, b = 0;
        for (const c of bucket) { r += c[0]; g += c[1]; b += c[2]; }
        const n = bucket.length;
        return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });
}

function channelRange(colors) {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const [r, g, b] of colors) {
        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        if (g < gMin) gMin = g; if (g > gMax) gMax = g;
        if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    return Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
}

function dominantChannel(colors) {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const [r, g, b] of colors) {
        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        if (g < gMin) gMin = g; if (g > gMax) gMax = g;
        if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    const rR = rMax - rMin, gR = gMax - gMin, bR = bMax - bMin;
    if (rR >= gR && rR >= bR) return 0;
    if (gR >= bR) return 1;
    return 2;
}

function buildColorLookup(palette) {
    const cache = new Map();

    return function (r, g, b) {
        // 15-bit color key for caching
        const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        if (cache.has(key)) return cache.get(key);

        let minDist = Infinity, minIdx = 0;
        for (let i = 0; i < palette.length; i++) {
            const dr = r - palette[i][0], dg = g - palette[i][1], db = b - palette[i][2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < minDist) { minDist = dist; minIdx = i; }
        }

        cache.set(key, minIdx);
        return minIdx;
    };
}

// ===== GIF Parser (Decoder) =====

function parseGifFrames(bytes) {
    const frames = [];
    let pos = 0;

    const header = String.fromCharCode(...bytes.slice(0, 6));
    if (header !== 'GIF87a' && header !== 'GIF89a') {
        throw new Error('不是有效的GIF文件');
    }
    pos = 6;

    const screenWidth = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const screenHeight = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    const packed = bytes[pos++];
    pos++; // background color index
    pos++; // pixel aspect ratio

    const gctFlag = (packed >> 7) & 1;
    const gctSize = gctFlag ? (1 << ((packed & 7) + 1)) : 0;

    let globalColorTable = null;
    if (gctFlag) {
        globalColorTable = [];
        for (let i = 0; i < gctSize; i++) {
            globalColorTable.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
        }
    }

    let graphicControl = null;
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = screenWidth;
    compositeCanvas.height = screenHeight;
    const compositeCtx = compositeCanvas.getContext('2d');

    while (pos < bytes.length) {
        const blockType = bytes[pos++];

        if (blockType === 0x3B) break;

        if (blockType === 0x21) {
            const extLabel = bytes[pos++];

            if (extLabel === 0xF9) {
                pos++; // block size
                const gcPacked = bytes[pos++];
                const delay = (bytes[pos] | (bytes[pos + 1] << 8)) * 10; pos += 2;
                const transparentIndex = bytes[pos++];
                const disposalMethod = (gcPacked >> 2) & 7;
                const transparentFlag = gcPacked & 1;
                pos++; // block terminator
                graphicControl = { delay: delay || 100, disposalMethod, transparentFlag, transparentIndex };
            } else {
                while (true) {
                    const subBlockSize = bytes[pos++];
                    if (subBlockSize === 0) break;
                    pos += subBlockSize;
                }
            }
            continue;
        }

        if (blockType === 0x2C) {
            const left = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            const top = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            const frameWidth = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            const frameHeight = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            const imgPacked = bytes[pos++];

            const lctFlag = (imgPacked >> 7) & 1;
            const interlaceFlag = (imgPacked >> 6) & 1;
            const lctSize = lctFlag ? (1 << ((imgPacked & 7) + 1)) : 0;

            let localColorTable = null;
            if (lctFlag) {
                localColorTable = [];
                for (let i = 0; i < lctSize; i++) {
                    localColorTable.push([bytes[pos++], bytes[pos++], bytes[pos++]]);
                }
            }

            const colorTable = localColorTable || globalColorTable;
            if (!colorTable) throw new Error('GIF缺少颜色表');

            const minCodeSize = bytes[pos++];
            const compressedData = [];
            while (true) {
                const subBlockSize = bytes[pos++];
                if (subBlockSize === 0) break;
                for (let i = 0; i < subBlockSize; i++) {
                    compressedData.push(bytes[pos++]);
                }
            }

            const indexStream = lzwDecode(minCodeSize, compressedData);

            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = screenWidth;
            frameCanvas.height = screenHeight;
            const frameCtx = frameCanvas.getContext('2d');
            frameCtx.drawImage(compositeCanvas, 0, 0);

            const imageData = frameCtx.getImageData(left, top, frameWidth, frameHeight);
            const pixels = imageData.data;
            const deinterlaced = interlaceFlag ? deinterlace(indexStream, frameWidth, frameHeight) : indexStream;

            for (let i = 0; i < deinterlaced.length && i < frameWidth * frameHeight; i++) {
                const colorIdx = deinterlaced[i];
                if (graphicControl && graphicControl.transparentFlag && colorIdx === graphicControl.transparentIndex) {
                    continue;
                }
                const color = colorTable[colorIdx] || [0, 0, 0];
                pixels[i * 4] = color[0];
                pixels[i * 4 + 1] = color[1];
                pixels[i * 4 + 2] = color[2];
                pixels[i * 4 + 3] = 255;
            }

            frameCtx.putImageData(imageData, left, top);

            const disposal = graphicControl ? graphicControl.disposalMethod : 0;

            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = screenWidth;
            outputCanvas.height = screenHeight;
            outputCanvas.getContext('2d').drawImage(frameCanvas, 0, 0);

            frames.push({
                canvas: outputCanvas,
                width: screenWidth,
                height: screenHeight,
                delay: graphicControl ? graphicControl.delay : 100
            });

            if (disposal === 2) {
                compositeCtx.clearRect(left, top, frameWidth, frameHeight);
            } else if (disposal !== 3) {
                compositeCtx.drawImage(frameCanvas, 0, 0);
            }

            graphicControl = null;
            continue;
        }

        if (blockType === 0x00) continue;
        break;
    }

    if (frames.length === 0) throw new Error('未能从GIF中提取到任何帧');
    return frames;
}

function lzwDecode(minCodeSize, data) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let codeMask = (1 << codeSize) - 1;
    let nextCode = eoiCode + 1;

    let codeTable = {};
    for (let i = 0; i < clearCode; i++) {
        codeTable[i] = [i];
    }

    const output = [];
    let bitBuf = 0;
    let bitCount = 0;
    let dataPos = 0;
    let prevCode = -1;

    function readCode() {
        while (bitCount < codeSize) {
            if (dataPos >= data.length) return -1;
            bitBuf |= data[dataPos++] << bitCount;
            bitCount += 8;
        }
        const code = bitBuf & codeMask;
        bitBuf >>= codeSize;
        bitCount -= codeSize;
        return code;
    }

    while (true) {
        const code = readCode();
        if (code === -1 || code === eoiCode) break;

        if (code === clearCode) {
            codeSize = minCodeSize + 1;
            codeMask = (1 << codeSize) - 1;
            nextCode = eoiCode + 1;
            codeTable = {};
            for (let i = 0; i < clearCode; i++) {
                codeTable[i] = [i];
            }
            prevCode = -1;
            continue;
        }

        if (prevCode === -1) {
            if (codeTable[code]) output.push(...codeTable[code]);
            prevCode = code;
            continue;
        }

        let entry;
        if (codeTable[code] !== undefined) {
            entry = codeTable[code];
        } else if (code === nextCode) {
            entry = [...codeTable[prevCode], codeTable[prevCode][0]];
        } else {
            prevCode = code;
            continue;
        }

        output.push(...entry);

        if (nextCode < 4096 && codeTable[prevCode]) {
            codeTable[nextCode] = [...codeTable[prevCode], entry[0]];
            nextCode++;
            if (nextCode > codeMask && codeSize < 12) {
                codeSize++;
                codeMask = (1 << codeSize) - 1;
            }
        }

        prevCode = code;
    }

    return output;
}

function deinterlace(indexStream, width, height) {
    const result = new Array(width * height);
    const passes = [
        { start: 0, step: 8 },
        { start: 4, step: 8 },
        { start: 2, step: 4 },
        { start: 1, step: 2 }
    ];

    let srcRow = 0;
    for (const pass of passes) {
        for (let y = pass.start; y < height; y += pass.step) {
            for (let x = 0; x < width; x++) {
                result[y * width + x] = indexStream[srcRow * width + x];
            }
            srcRow++;
        }
    }

    return result;
}

// ===== Utilities =====

function applyLossy(data, level) {
    if (level <= 0) return;
    const shift = Math.min(6, Math.floor(level / 30));
    if (shift === 0) return;
    const mask = (0xFF << shift) & 0xFF;
    const half = 1 << (shift - 1);
    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, (data[i] & mask) + half);
        data[i + 1] = Math.min(255, (data[i + 1] & mask) + half);
        data[i + 2] = Math.min(255, (data[i + 2] & mask) + half);
    }
}

function clearAll() {
    originalFile = null;
    compressedBlob = null;
    elements.originalImg.style.display = 'none';
    elements.originalImg.src = '';
    elements.compressedImg.style.display = 'none';
    elements.compressedImg.src = '';
    elements.originalInfo.textContent = '';
    elements.compressedInfo.textContent = '';
    elements.compressBtn.disabled = true;
    elements.downloadBtn.style.display = 'none';
    elements.progressContainer.style.display = 'none';
    const p1 = elements.originalPreview.querySelector('.preview-placeholder');
    const p2 = elements.compressedPreview.querySelector('.preview-placeholder');
    if (p1) p1.style.display = '';
    if (p2) p2.style.display = '';
}

function downloadResult() {
    if (!compressedBlob || !originalFile) return;
    const name = originalFile.name.replace(/\.gif$/i, '_compressed.gif');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(compressedBlob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function showProgress(text, percent) {
    elements.progressContainer.style.display = 'block';
    elements.progressFill.style.width = percent + '%';
    elements.progressText.textContent = text;
}

function yieldToUI() {
    return new Promise(resolve => setTimeout(resolve, 0));
}
