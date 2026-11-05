(() => {
    'use strict';

    const workerUrl = new URL('watermark_ai_worker.js?v=3', document.currentScript.src);
    const qualityUrl = new URL('watermark_quality_worker.js?v=1', document.currentScript.src);
    const maxDetectionEdge = 1200;
    const contextPadding = 128;
    const maxModelEdge = 1536;
    const patchRows = 256;

    function createWorkerClient(url, options) {
        let worker;
        let pending;

        function resetWorker(error) {
            pending?.reject(error);
            pending = null;
            worker.terminate();
            worker = null;
        }

        return (task, transfer, report) => {
            if (pending) return Promise.reject(new Error('AI processing is already running'));
            if (!worker) {
                worker = new Worker(url, options);
                worker.onmessage = ({ data }) => {
                    if (!pending) return;
                    if (data.progress) {
                        pending.report(data.progress);
                        return;
                    }
                    if (data.error) {
                        resetWorker(new Error(data.error));
                        return;
                    }
                    pending.resolve(data.result);
                    pending = null;
                };
                worker.onerror = (event) => resetWorker(new Error(event.message || 'AI worker failed'));
            }

            return new Promise((resolve, reject) => {
                pending = { resolve, reject, report };
                try {
                    worker.postMessage(task, transfer);
                } catch (error) {
                    pending = null;
                    reject(error);
                }
            });
        };
    }

    const runWorker = createWorkerClient(workerUrl);
    const runQualityWorker = createWorkerClient(qualityUrl, { type: 'module' });

    async function detectWatermark(canvas, report) {
        const scale = Math.min(1, maxDetectionEdge / Math.max(canvas.width, canvas.height));
        const sample = document.createElement('canvas');
        sample.width = Math.max(1, Math.round(canvas.width * scale));
        sample.height = Math.max(1, Math.round(canvas.height * scale));
        const context = sample.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingQuality = 'high';
        context.drawImage(canvas, 0, 0, sample.width, sample.height);
        const { width, height, data: rgba } = context.getImageData(0, 0, sample.width, sample.height);
        return runWorker({ action: 'detect', width, height, rgba }, [rgba.buffer], report);
    }

    async function repairWatermarkWithAI(context, selection, report, useQuality = true) {
        const { x, y, width, height, data } = selection;
        const left = Math.max(0, x - contextPadding);
        const top = Math.max(0, y - contextPadding);
        const cropWidth = Math.min(context.canvas.width, x + width + contextPadding) - left;
        const cropHeight = Math.min(context.canvas.height, y + height + contextPadding) - top;
        const scale = Math.min(1, maxModelEdge / Math.max(cropWidth, cropHeight));
        const modelWidth = Math.max(8, Math.round(cropWidth * scale));
        const modelHeight = Math.max(8, Math.round(cropHeight * scale));
        const scaled = modelWidth !== cropWidth || modelHeight !== cropHeight;

        const modelCanvas = document.createElement('canvas');
        modelCanvas.width = modelWidth;
        modelCanvas.height = modelHeight;
        const modelContext = modelCanvas.getContext('2d', { willReadFrequently: true });
        modelContext.imageSmoothingQuality = 'high';
        modelContext.drawImage(context.canvas, left, top, cropWidth, cropHeight, 0, 0, modelWidth, modelHeight);
        const modelImage = modelContext.getImageData(0, 0, modelWidth, modelHeight);
        const mask = new Uint8Array(modelWidth * modelHeight);
        const xOffset = x - left;
        const yOffset = y - top;

        // Mark every model pixel covered by a selection pixel, including fine strokes when downscaling.
        for (let row = 0; row < height; row++) {
            const startRow = Math.floor((yOffset + row) * modelHeight / cropHeight);
            const endRow = Math.ceil((yOffset + row + 1) * modelHeight / cropHeight);
            for (let column = 0; column < width; column++) {
                if (!data[row * width + column]) continue;
                const startColumn = Math.floor((xOffset + column) * modelWidth / cropWidth);
                const endColumn = Math.ceil((xOffset + column + 1) * modelWidth / cropWidth);
                for (let modelRow = startRow; modelRow < endRow; modelRow++) {
                    const offset = modelRow * modelWidth;
                    mask.fill(255, offset + startColumn, offset + endColumn);
                }
            }
        }

        const rgba = modelImage.data;
        const run = useQuality ? runQualityWorker : runWorker;
        const repaired = await run({ action: 'repair', width: modelWidth, height: modelHeight, rgba, mask }, [rgba.buffer, mask.buffer], report);
        let patchContext;
        if (scaled) {
            modelContext.putImageData(new ImageData(repaired, modelWidth, modelHeight), 0, 0);
            const patchCanvas = document.createElement('canvas');
            patchCanvas.width = width;
            patchCanvas.height = Math.min(height, patchRows);
            patchContext = patchCanvas.getContext('2d', { willReadFrequently: true });
            patchContext.imageSmoothingQuality = 'high';
        }

        // A thin pair of marks can bound a large image. Composite in strips to limit peak memory.
        for (let startRow = 0; startRow < height; startRow += patchRows) {
            const rows = Math.min(patchRows, height - startRow);
            const bandMask = data.subarray(startRow * width, (startRow + rows) * width);
            if (!bandMask.some((value) => value !== 0)) continue;
            const pixels = context.getImageData(x, y + startRow, width, rows);
            let colors = repaired;
            if (patchContext) {
                patchContext.drawImage(modelCanvas, -xOffset, -yOffset - startRow, cropWidth, cropHeight);
                colors = patchContext.getImageData(0, 0, width, rows).data;
            }
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < width; column++) {
                    const index = row * width + column;
                    if (!bandMask[index]) continue;
                    const target = 4 * index;
                    const source = scaled ? target : 4 * ((yOffset + startRow + row) * modelWidth + xOffset + column);
                    pixels.data[target] = colors[source];
                    pixels.data[target + 1] = colors[source + 1];
                    pixels.data[target + 2] = colors[source + 2];
                }
            }
            context.putImageData(pixels, x, y + startRow);
        }
    }

    window.repairWatermarkWithAI = repairWatermarkWithAI;
    window.detectImageWatermark = detectWatermark;
})();
