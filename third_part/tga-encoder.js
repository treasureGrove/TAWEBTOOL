class TGAEncoder {
    static encode(imageData, width, height) {
        const pixels = imageData.data;
        const tgaData = new Uint8Array(18 + width * height * 4);
        
        tgaData[0] = 0;
        tgaData[1] = 0;
        tgaData[2] = 2;
        tgaData[3] = 0;
        tgaData[4] = 0;
        tgaData[5] = 0;
        tgaData[6] = 0;
        tgaData[7] = 0;
        tgaData[8] = 0;
        tgaData[9] = 0;
        tgaData[10] = 0;
        tgaData[11] = 0;
        
        tgaData[12] = width & 0xFF;
        tgaData[13] = (width >> 8) & 0xFF;
        tgaData[14] = height & 0xFF;
        tgaData[15] = (height >> 8) & 0xFF;
        
        tgaData[16] = 32;
        tgaData[17] = 8;
        
        let offset = 18;
        for (let y = height - 1; y >= 0; y--) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                tgaData[offset++] = pixels[i + 2];
                tgaData[offset++] = pixels[i + 1];
                tgaData[offset++] = pixels[i];
                tgaData[offset++] = pixels[i + 3];
            }
        }
        
        return new Blob([tgaData], { type: 'application/octet-stream' });
    }

    static encodeFromCanvas(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        return this.encode(imageData, canvas.width, canvas.height);
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TGAEncoder;
}
