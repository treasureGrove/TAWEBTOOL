class TGADecoder {
    static decode(arrayBuffer) {
        const data = new Uint8Array(arrayBuffer);
        
        const idLength = data[0];
        const colorMapType = data[1];
        const imageType = data[2];
        
        const colorMapOrigin = data[3] | (data[4] << 8);
        const colorMapLength = data[5] | (data[6] << 8);
        const colorMapDepth = data[7];
        
        const xOrigin = data[8] | (data[9] << 8);
        const yOrigin = data[10] | (data[11] << 8);
        const width = data[12] | (data[13] << 8);
        const height = data[14] | (data[15] << 8);
        const pixelDepth = data[16];
        const imageDescriptor = data[17];
        
        if (imageType !== 2 && imageType !== 10) {
            throw new Error('Unsupported TGA image type: ' + imageType);
        }
        
        let offset = 18 + idLength;
        
        if (colorMapType === 1) {
            offset += colorMapLength * Math.ceil(colorMapDepth / 8);
        }
        
        const bytesPerPixel = pixelDepth / 8;
        const imageSize = width * height * 4;
        const imageData = new Uint8Array(imageSize);
        
        if (imageType === 2) {
            for (let i = 0; i < width * height; i++) {
                const srcOffset = offset + i * bytesPerPixel;
                const dstOffset = i * 4;
                
                if (bytesPerPixel === 4) {
                    imageData[dstOffset + 2] = data[srcOffset];
                    imageData[dstOffset + 1] = data[srcOffset + 1];
                    imageData[dstOffset] = data[srcOffset + 2];
                    imageData[dstOffset + 3] = data[srcOffset + 3];
                } else if (bytesPerPixel === 3) {
                    imageData[dstOffset + 2] = data[srcOffset];
                    imageData[dstOffset + 1] = data[srcOffset + 1];
                    imageData[dstOffset] = data[srcOffset + 2];
                    imageData[dstOffset + 3] = 255;
                }
            }
        } else if (imageType === 10) {
            let pixelIndex = 0;
            let dataIndex = offset;
            
            while (pixelIndex < width * height) {
                const packetHeader = data[dataIndex++];
                const isRLE = packetHeader & 0x80;
                const count = (packetHeader & 0x7F) + 1;
                
                if (isRLE) {
                    const b = data[dataIndex++];
                    const g = data[dataIndex++];
                    const r = data[dataIndex++];
                    const a = bytesPerPixel === 4 ? data[dataIndex++] : 255;
                    
                    for (let i = 0; i < count; i++) {
                        const dstOffset = pixelIndex * 4;
                        imageData[dstOffset] = r;
                        imageData[dstOffset + 1] = g;
                        imageData[dstOffset + 2] = b;
                        imageData[dstOffset + 3] = a;
                        pixelIndex++;
                    }
                } else {
                    for (let i = 0; i < count; i++) {
                        const b = data[dataIndex++];
                        const g = data[dataIndex++];
                        const r = data[dataIndex++];
                        const a = bytesPerPixel === 4 ? data[dataIndex++] : 255;
                        
                        const dstOffset = pixelIndex * 4;
                        imageData[dstOffset] = r;
                        imageData[dstOffset + 1] = g;
                        imageData[dstOffset + 2] = b;
                        imageData[dstOffset + 3] = a;
                        pixelIndex++;
                    }
                }
            }
        }
        
        const originTop = (imageDescriptor & 0x20) !== 0;
        if (!originTop) {
            const tempRow = new Uint8Array(width * 4);
            for (let y = 0; y < Math.floor(height / 2); y++) {
                const topOffset = y * width * 4;
                const bottomOffset = (height - 1 - y) * width * 4;
                
                tempRow.set(imageData.subarray(topOffset, topOffset + width * 4));
                imageData.set(imageData.subarray(bottomOffset, bottomOffset + width * 4), topOffset);
                imageData.set(tempRow, bottomOffset);
            }
        }
        
        return {
            width: width,
            height: height,
            data: imageData
        };
    }

    static createImageDataFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const decoded = this.decode(e.target.result);
                    resolve(decoded);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TGADecoder;
}
