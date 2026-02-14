class DDSEncoder {
    static DDS_MAGIC = 0x20534444;
    static DDSD_CAPS = 0x1;
    static DDSD_HEIGHT = 0x2;
    static DDSD_WIDTH = 0x4;
    static DDSD_PITCH = 0x8;
    static DDSD_PIXELFORMAT = 0x1000;
    static DDSD_MIPMAPCOUNT = 0x20000;
    static DDSD_LINEARSIZE = 0x80000;
    static DDSD_DEPTH = 0x800000;

    static DDPF_ALPHAPIXELS = 0x1;
    static DDPF_ALPHA = 0x2;
    static DDPF_FOURCC = 0x4;
    static DDPF_RGB = 0x40;
    static DDPF_YUV = 0x200;
    static DDPF_LUMINANCE = 0x20000;

    static DDSCAPS_COMPLEX = 0x8;
    static DDSCAPS_MIPMAP = 0x400000;
    static DDSCAPS_TEXTURE = 0x1000;

    static encode(imageData, width, height, compressed = false) {
        const pixels = imageData.data;
        const headerSize = 128;
        
        let dataSize;
        let pixelData;
        
        if (compressed) {
            dataSize = Math.max(1, ((width + 3) / 4)) * Math.max(1, ((height + 3) / 4)) * 16;
            pixelData = this.compressDXT5(pixels, width, height);
        } else {
            dataSize = width * height * 4;
            pixelData = new Uint8Array(dataSize);
            for (let i = 0; i < pixels.length; i += 4) {
                pixelData[i] = pixels[i + 2];
                pixelData[i + 1] = pixels[i + 1];
                pixelData[i + 2] = pixels[i];
                pixelData[i + 3] = pixels[i + 3];
            }
        }
        
        const buffer = new ArrayBuffer(headerSize + dataSize);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        
        let offset = 0;
        view.setUint32(offset, this.DDS_MAGIC, true); offset += 4;
        view.setUint32(offset, 124, true); offset += 4;
        
        const flags = this.DDSD_CAPS | this.DDSD_HEIGHT | this.DDSD_WIDTH | 
                     this.DDSD_PIXELFORMAT | (compressed ? this.DDSD_LINEARSIZE : this.DDSD_PITCH);
        view.setUint32(offset, flags, true); offset += 4;
        
        view.setUint32(offset, height, true); offset += 4;
        view.setUint32(offset, width, true); offset += 4;
        view.setUint32(offset, compressed ? dataSize : width * 4, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        
        for (let i = 0; i < 11; i++) {
            view.setUint32(offset, 0, true);
            offset += 4;
        }
        
        view.setUint32(offset, 32, true); offset += 4;
        
        if (compressed) {
            view.setUint32(offset, this.DDPF_FOURCC, true); offset += 4;
            bytes[offset++] = 'D'.charCodeAt(0);
            bytes[offset++] = 'X'.charCodeAt(0);
            bytes[offset++] = 'T'.charCodeAt(0);
            bytes[offset++] = '5'.charCodeAt(0);
        } else {
            view.setUint32(offset, this.DDPF_RGB | this.DDPF_ALPHAPIXELS, true); offset += 4;
            view.setUint32(offset, 0, true); offset += 4;
        }
        
        view.setUint32(offset, compressed ? 0 : 32, true); offset += 4;
        view.setUint32(offset, compressed ? 0 : 0x00FF0000, true); offset += 4;
        view.setUint32(offset, compressed ? 0 : 0x0000FF00, true); offset += 4;
        view.setUint32(offset, compressed ? 0 : 0x000000FF, true); offset += 4;
        view.setUint32(offset, compressed ? 0 : 0xFF000000, true); offset += 4;
        
        view.setUint32(offset, this.DDSCAPS_TEXTURE, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        view.setUint32(offset, 0, true); offset += 4;
        
        bytes.set(pixelData, headerSize);
        
        return new Blob([buffer], { type: 'application/octet-stream' });
    }

    static compressDXT5(pixels, width, height) {
        const blocksX = Math.max(1, Math.floor((width + 3) / 4));
        const blocksY = Math.max(1, Math.floor((height + 3) / 4));
        const output = new Uint8Array(blocksX * blocksY * 16);
        
        let outIndex = 0;
        
        for (let by = 0; by < blocksY; by++) {
            for (let bx = 0; bx < blocksX; bx++) {
                const block = this.extractBlock(pixels, width, height, bx * 4, by * 4);
                const compressed = this.compressBlock(block);
                output.set(compressed, outIndex);
                outIndex += 16;
            }
        }
        
        return output;
    }

    static extractBlock(pixels, width, height, x, y) {
        const block = new Uint8Array(64);
        for (let py = 0; py < 4; py++) {
            for (let px = 0; px < 4; px++) {
                const ix = Math.min(x + px, width - 1);
                const iy = Math.min(y + py, height - 1);
                const i = (iy * width + ix) * 4;
                const bi = (py * 4 + px) * 4;
                block[bi] = pixels[i];
                block[bi + 1] = pixels[i + 1];
                block[bi + 2] = pixels[i + 2];
                block[bi + 3] = pixels[i + 3];
            }
        }
        return block;
    }

    static compressBlock(block) {
        const output = new Uint8Array(16);
        
        let minAlpha = 255, maxAlpha = 0;
        for (let i = 3; i < 64; i += 4) {
            minAlpha = Math.min(minAlpha, block[i]);
            maxAlpha = Math.max(maxAlpha, block[i]);
        }
        
        output[0] = maxAlpha;
        output[1] = minAlpha;
        
        for (let i = 0; i < 16; i++) {
            const a = block[i * 4 + 3];
            let code = 0;
            if (maxAlpha !== minAlpha) {
                const t = (a - minAlpha) / (maxAlpha - minAlpha);
                code = Math.round(t * 7);
            }
            const byteIndex = 2 + Math.floor(i / 2);
            const shift = (i % 2) * 4;
            output[byteIndex] |= (code & 0x7) << shift;
        }
        
        let minColor = [255, 255, 255];
        let maxColor = [0, 0, 0];
        
        for (let i = 0; i < 64; i += 4) {
            for (let c = 0; c < 3; c++) {
                minColor[c] = Math.min(minColor[c], block[i + c]);
                maxColor[c] = Math.max(maxColor[c], block[i + c]);
            }
        }
        
        const c0 = this.packRGB565(maxColor[0], maxColor[1], maxColor[2]);
        const c1 = this.packRGB565(minColor[0], minColor[1], minColor[2]);
        
        output[8] = c0 & 0xFF;
        output[9] = (c0 >> 8) & 0xFF;
        output[10] = c1 & 0xFF;
        output[11] = (c1 >> 8) & 0xFF;
        
        for (let i = 0; i < 16; i++) {
            const byteIndex = 12 + Math.floor(i / 4);
            const shift = (i % 4) * 2;
            output[byteIndex] |= 0 << shift;
        }
        
        return output;
    }

    static packRGB565(r, g, b) {
        const r5 = Math.round((r / 255) * 31);
        const g6 = Math.round((g / 255) * 63);
        const b5 = Math.round((b / 255) * 31);
        return (r5 << 11) | (g6 << 5) | b5;
    }

    static encodeFromCanvas(canvas, compressed = false) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return this.encode(imageData, canvas.width, canvas.height, compressed);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = DDSEncoder;
}
