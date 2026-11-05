(() => {
    'use strict';

    function drawAction(context, action) {
        context.globalCompositeOperation = action.erase ? 'destination-out' : 'source-over';
        context.fillStyle = context.strokeStyle = '#ffcf59';
        if (action.rectangle) {
            const { x, y, width, height } = action.rectangle;
            context.fillRect(x, y, width, height);
            return;
        }

        const points = action.points;
        const first = points[0];
        context.beginPath();
        if (points.length === 1) {
            context.arc(first.x, first.y, action.diameter / 2, 0, Math.PI * 2);
            context.fill();
            return;
        }

        context.lineWidth = action.diameter;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.moveTo(first.x, first.y);
        for (let index = 1; index < points.length; index++) {
            context.lineTo(points[index].x, points[index].y);
        }
        context.stroke();
    }

    function createWatermarkMask(width, height) {
        const actions = [];
        let draft = null;
        let revision = 0;
        let cachedRevision = -1;
        let preview = null;

        function paint(context) {
            const targetWidth = context.canvas.width;
            const targetHeight = context.canvas.height;
            const scaleX = targetWidth / width;
            const scaleY = targetHeight / height;
            preview ??= document.createElement('canvas');

            // Draw completed actions again only when the history or preview size changes.
            if (cachedRevision !== revision || preview.width !== targetWidth || preview.height !== targetHeight) {
                preview.width = targetWidth;
                preview.height = targetHeight;
                const cache = preview.getContext('2d');
                cache.scale(scaleX, scaleY);
                for (const action of actions) drawAction(cache, action);
                cachedRevision = revision;
            }

            context.save();
            context.resetTransform();
            context.clearRect(0, 0, targetWidth, targetHeight);
            context.globalCompositeOperation = 'source-over';
            context.globalAlpha = 1;
            context.drawImage(preview, 0, 0);
            if (draft) {
                context.scale(scaleX, scaleY);
                drawAction(context, draft);
                context.resetTransform();
            }
            context.globalCompositeOperation = 'destination-in';
            context.fillStyle = 'rgba(0, 0, 0, 0.45)';
            context.fillRect(0, 0, targetWidth, targetHeight);
            context.restore();
        }

        function getMask() {
            let left = width;
            let top = height;
            let right = 0;
            let bottom = 0;

            function include(x1, y1, x2, y2) {
                left = Math.min(left, x1);
                top = Math.min(top, y1);
                right = Math.max(right, x2);
                bottom = Math.max(bottom, y2);
            }

            for (const action of actions) {
                if (action.erase) continue;
                if (action.rectangle) {
                    const { x, y, width: boxWidth, height: boxHeight } = action.rectangle;
                    include(x, y, x + boxWidth, y + boxHeight);
                } else {
                    const radius = action.diameter / 2;
                    for (const { x, y } of action.points) include(x - radius, y - radius, x + radius, y + radius);
                }
            }

            left = Math.max(0, Math.floor(left));
            top = Math.max(0, Math.floor(top));
            right = Math.min(width, Math.ceil(right));
            bottom = Math.min(height, Math.ceil(bottom));
            if (left >= right || top >= bottom) return null;

            const crop = document.createElement('canvas');
            crop.width = right - left;
            crop.height = bottom - top;
            const context = crop.getContext('2d', { willReadFrequently: true });
            context.translate(-left, -top);
            for (const action of actions) drawAction(context, action);
            const { data } = context.getImageData(0, 0, crop.width, crop.height);

            let firstX = crop.width;
            let firstY = crop.height;
            let lastX = -1;
            let lastY = -1;
            let selectedPixels = 0;
            for (let y = 0; y < crop.height; y++) {
                for (let x = 0; x < crop.width; x++) {
                    if (data[(y * crop.width + x) * 4 + 3] < 128) continue;
                    firstX = Math.min(firstX, x);
                    firstY = Math.min(firstY, y);
                    lastX = Math.max(lastX, x);
                    lastY = y;
                    selectedPixels++;
                }
            }
            if (!selectedPixels) return null;

            const maskWidth = lastX - firstX + 1;
            const maskHeight = lastY - firstY + 1;
            const mask = new Uint8Array(maskWidth * maskHeight);
            for (let y = 0; y < maskHeight; y++) {
                const sourceStart = ((firstY + y) * crop.width + firstX) * 4 + 3;
                const targetStart = y * maskWidth;
                for (let x = 0; x < maskWidth; x++) {
                    mask[targetStart + x] = data[sourceStart + x * 4] >= 128 ? 255 : 0;
                }
            }
            return { x: left + firstX, y: top + firstY, width: maskWidth, height: maskHeight, data: mask, selectedPixels };
        }

        return {
            get count() { return actions.length; },
            addRectangle(rectangle) {
                actions.push({ rectangle });
                revision++;
            },
            beginStroke(point, diameter, erase = false) {
                draft = { points: [point], diameter, erase };
            },
            extendStroke(point) {
                if (!draft) return;
                const last = draft.points[draft.points.length - 1];
                if (last.x !== point.x || last.y !== point.y) draft.points.push(point);
            },
            endStroke() {
                if (!draft) return;
                actions.push(draft);
                draft = null;
                revision++;
            },
            cancelStroke() {
                draft = null;
            },
            undo() {
                if (actions.pop()) revision++;
            },
            clear() {
                draft = null;
                actions.length = 0;
                revision++;
            },
            paint,
            getMask
        };
    }

    window.createWatermarkMask = createWatermarkMask;
})();
