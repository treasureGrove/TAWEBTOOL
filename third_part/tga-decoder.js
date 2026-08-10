class TGADecoder {
    static decode(arrayBuffer) {
        const data = new Uint8Array(arrayBuffer);
        if (data.length < 18) throw new Error('Invalid TGA: header is incomplete');

        const header = {
            idLength: data[0],
            colorMapType: data[1],
            imageType: data[2],
            colorMapOrigin: data[3] | (data[4] << 8),
            colorMapLength: data[5] | (data[6] << 8),
            colorMapDepth: data[7],
            width: data[12] | (data[13] << 8),
            height: data[14] | (data[15] << 8),
            pixelDepth: data[16],
            descriptor: data[17]
        };

        const supportedTypes = [1, 2, 3, 9, 10, 11];
        if (!supportedTypes.includes(header.imageType)) {
            throw new Error('Unsupported TGA image type: ' + header.imageType);
        }
        if (!header.width || !header.height) throw new Error('Invalid TGA dimensions');

        const isColorMapped = header.imageType === 1 || header.imageType === 9;
        const isTrueColor = header.imageType === 2 || header.imageType === 10;
        const isGray = header.imageType === 3 || header.imageType === 11;
        const isRLE = header.imageType >= 9;

        if (isColorMapped && header.colorMapType !== 1) {
            throw new Error('Invalid TGA: indexed image has no color map');
        }
        if (!isColorMapped && header.colorMapType > 1) {
            throw new Error('Unsupported TGA color map type: ' + header.colorMapType);
        }
        if (isTrueColor && ![15, 16, 24, 32].includes(header.pixelDepth)) {
            throw new Error('Unsupported TGA true-color depth: ' + header.pixelDepth);
        }
        if (isGray && ![8, 16].includes(header.pixelDepth)) {
            throw new Error('Unsupported TGA grayscale depth: ' + header.pixelDepth);
        }
        if (isColorMapped && ![8, 16].includes(header.pixelDepth)) {
            throw new Error('Unsupported TGA color-map index depth: ' + header.pixelDepth);
        }

        let offset = 18 + header.idLength;
        if (offset > data.length) throw new Error('Invalid TGA: image ID exceeds file length');

        const readByte = () => {
            if (offset >= data.length) throw new Error('Invalid TGA: unexpected end of pixel data');
            return data[offset++];
        };
        const readWord = () => readByte() | (readByte() << 8);

        let palette = null;
        if (header.colorMapType === 1) {
            if (!header.colorMapLength) throw new Error('Invalid TGA: empty color map');
            palette = new Array(header.colorMapLength);
            for (let i = 0; i < header.colorMapLength; i++) {
                palette[i] = this.readColor(readByte, readWord, header.colorMapDepth, true);
            }
        }

        const alphaBits = header.descriptor & 0x0F;
        const readPixel = () => {
            if (isColorMapped) {
                const mapIndex = header.pixelDepth === 8 ? readByte() : readWord();
                const paletteIndex = mapIndex - header.colorMapOrigin;
                if (paletteIndex < 0 || paletteIndex >= palette.length) {
                    throw new Error('Invalid TGA: color map index is out of range');
                }
                return palette[paletteIndex];
            }
            if (isGray) {
                const gray = readByte();
                const alpha = header.pixelDepth === 16 ? readByte() : 255;
                return [gray, gray, gray, alpha];
            }
            return this.readColor(readByte, readWord, header.pixelDepth, alphaBits > 0);
        };

        const pixelCount = header.width * header.height;
        const imageData = new Uint8ClampedArray(pixelCount * 4);
        const originTop = (header.descriptor & 0x20) !== 0;
        const originRight = (header.descriptor & 0x10) !== 0;
        let storedIndex = 0;

        const writePixel = (rgba) => {
            if (storedIndex >= pixelCount) throw new Error('Invalid TGA: too many decoded pixels');
            const row = Math.floor(storedIndex / header.width);
            const column = storedIndex % header.width;
            const x = originRight ? header.width - 1 - column : column;
            const y = originTop ? row : header.height - 1 - row;
            const target = (y * header.width + x) * 4;
            imageData[target] = rgba[0];
            imageData[target + 1] = rgba[1];
            imageData[target + 2] = rgba[2];
            imageData[target + 3] = rgba[3];
            storedIndex++;
        };

        if (isRLE) {
            while (storedIndex < pixelCount) {
                const packetHeader = readByte();
                const count = (packetHeader & 0x7F) + 1;
                if (storedIndex + count > pixelCount) {
                    throw new Error('Invalid TGA: RLE packet exceeds image dimensions');
                }
                if (packetHeader & 0x80) {
                    const pixel = readPixel();
                    for (let i = 0; i < count; i++) writePixel(pixel);
                } else {
                    for (let i = 0; i < count; i++) writePixel(readPixel());
                }
            }
        } else {
            while (storedIndex < pixelCount) writePixel(readPixel());
        }

        return {
            width: header.width,
            height: header.height,
            data: imageData
        };
    }

    static readColor(readByte, readWord, depth, hasAlpha) {
        if (depth === 15 || depth === 16) {
            const packed = readWord();
            const blue = Math.round((packed & 0x1F) * 255 / 31);
            const green = Math.round(((packed >> 5) & 0x1F) * 255 / 31);
            const red = Math.round(((packed >> 10) & 0x1F) * 255 / 31);
            const alpha = depth === 16 && hasAlpha ? ((packed & 0x8000) ? 255 : 0) : 255;
            return [red, green, blue, alpha];
        }
        if (depth === 24) {
            const blue = readByte();
            const green = readByte();
            const red = readByte();
            return [red, green, blue, 255];
        }
        if (depth === 32) {
            const blue = readByte();
            const green = readByte();
            const red = readByte();
            const alpha = readByte();
            return [red, green, blue, alpha];
        }
        throw new Error('Unsupported TGA color depth: ' + depth);
    }

    static createImageDataFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    resolve(this.decode(event.target.result));
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(reader.error || new Error('Failed to read TGA file'));
            reader.readAsArrayBuffer(file);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TGADecoder;
}
