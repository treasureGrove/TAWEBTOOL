class BMPEncoder {
    static encode(imageData, width, height) {
        const pixels = imageData.data;
        const rowSize = Math.floor((24 * width + 31) / 32) * 4;
        const pixelDataSize = rowSize * height;
        const fileSize = 54 + pixelDataSize;
        
        const buffer = new ArrayBuffer(fileSize);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);
        
        bytes[0] = 0x42;
        bytes[1] = 0x4D;
        
        view.setUint32(2, fileSize, true);
        view.setUint32(6, 0, true);
        view.setUint32(10, 54, true);
        
        view.setUint32(14, 40, true);
        view.setInt32(18, width, true);
        view.setInt32(22, height, true);
        view.setUint16(26, 1, true);
        view.setUint16(28, 24, true);
        view.setUint32(30, 0, true);
        view.setUint32(34, pixelDataSize, true);
        view.setInt32(38, 2835, true);
        view.setInt32(42, 2835, true);
        view.setUint32(46, 0, true);
        view.setUint32(50, 0, true);
        
        let offset = 54;
        const padding = rowSize - width * 3;
        
        for (let y = height - 1; y >= 0; y--) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                bytes[offset++] = pixels[i + 2];
                bytes[offset++] = pixels[i + 1];
                bytes[offset++] = pixels[i];
            }
            for (let p = 0; p < padding; p++) {
                bytes[offset++] = 0;
            }
        }
        
        return new Blob([buffer], { type: 'image/bmp' });
    }

    static encodeFromCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return this.encode(imageData, canvas.width, canvas.height);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BMPEncoder;
}
