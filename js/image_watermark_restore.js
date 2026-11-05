(function () {
    'use strict';

    function mergeRuns(rectangles, lineCount, vertical) {
        const lines = new Array(lineCount);

        for (const rectangle of rectangles) {
            const firstLine = vertical ? rectangle.left : rectangle.top;
            const lastLine = vertical ? rectangle.right : rectangle.bottom;
            const start = vertical ? rectangle.top : rectangle.left;
            const end = vertical ? rectangle.bottom : rectangle.right;

            for (let line = firstLine; line < lastLine; line++) {
                (lines[line] ??= []).push({ start, end });
            }
        }

        for (const runs of lines) {
            if (!runs || runs.length < 2) continue;
            runs.sort((a, b) => a.start - b.start);

            let merged = 0;
            for (let next = 1; next < runs.length; next++) {
                if (runs[next].start <= runs[merged].end) {
                    runs[merged].end = Math.max(runs[merged].end, runs[next].end);
                } else {
                    runs[++merged] = runs[next];
                }
            }
            runs.length = merged + 1;
        }

        return lines;
    }

    function pairConfidence(pixels, first, last, span) {
        const contrast = Math.abs(pixels[first] - pixels[last])
            + Math.abs(pixels[first + 1] - pixels[last + 1])
            + Math.abs(pixels[first + 2] - pixels[last + 2])
            + Math.abs(pixels[first + 3] - pixels[last + 3]);
        return 1 / (span * (48 + contrast));
    }

    function coversWholeRow(runs, width) {
        return runs?.[0].start === 0 && runs[0].end === width;
    }

    function nearestClearPixelInRow(rows, x, y, width) {
        const run = rows[y]?.find(({ start, end }) => x >= start && x < end);
        if (!run) return x;

        const left = run.start - 1;
        const right = run.end;
        if (left < 0) return right;
        if (right >= width) return left;
        return x - left <= right - x ? left : right;
    }

    function restoreImageWatermarks(context, regions) {
        const { width, height } = context.canvas;
        const rectangles = [];

        for (const { x, y, width: regionWidth, height: regionHeight } of regions) {
            if (![x, y, regionWidth, regionHeight].every(Number.isFinite)) continue;
            if (regionWidth <= 0 || regionHeight <= 0) continue;

            const left = Math.max(0, Math.floor(x));
            const top = Math.max(0, Math.floor(y));
            const right = Math.min(width, Math.ceil(x + regionWidth));
            const bottom = Math.min(height, Math.ceil(y + regionHeight));
            if (left < right && top < bottom) rectangles.push({ left, top, right, bottom });
        }

        if (!rectangles.length) return;

        const rows = mergeRuns(rectangles, height, false);
        if (rows.findIndex((runs) => !coversWholeRow(runs, width)) === -1) {
            throw new RangeError('The selection covers the entire image.');
        }

        const columns = mergeRuns(rectangles, width, true);
        const columnRunIndexes = new Uint32Array(width);
        const image = context.getImageData(0, 0, width, height);
        const pixels = image.data;
        let previousOpenRow = -1;
        let nextOpenRow = -1;

        for (let y = 0; y < height; y++) {
            if (!coversWholeRow(rows[y], width)) {
                previousOpenRow = y;
            } else if (nextOpenRow <= y) {
                nextOpenRow = y + 1;
                while (nextOpenRow < height && coversWholeRow(rows[nextOpenRow], width)) nextOpenRow++;
            }
            if (!rows[y]) continue;

            for (let runIndex = 0; runIndex < rows[y].length; runIndex++) {
                const run = rows[y][runIndex];
                const left = run.start - 1;
                const right = run.end;
                const leftLimit = rows[y][runIndex - 1]?.end ?? 0;
                const rightLimit = rows[y][runIndex + 1]?.start ?? width;
                const rowStart = y * width;

                for (let x = run.start; x < run.end; x++) {
                    const column = columns[x];
                    let columnRunIndex = columnRunIndexes[x];
                    while (column[columnRunIndex].end <= y) columnRunIndex++;
                    columnRunIndexes[x] = columnRunIndex;

                    const top = column[columnRunIndex].start - 1;
                    const bottom = column[columnRunIndex].end;
                    const leftPixel = left >= 0 ? (rowStart + left) * 4 : 0;
                    const rightPixel = right < width ? (rowStart + right) * 4 : 0;
                    const topPixel = top >= 0 ? (top * width + x) * 4 : 0;
                    const bottomPixel = bottom < height ? (bottom * width + x) * 4 : 0;
                    const leftDistance = x - left;
                    const rightDistance = right - x;
                    const topDistance = y - top;
                    const bottomDistance = bottom - y;

                    let leftWeight = 0;
                    let rightWeight = 0;
                    let topWeight = 0;
                    let bottomWeight = 0;

                    // Favor directions whose boundaries agree to preserve lines and edges.
                    if (left >= 0 && right < width) {
                        const span = right - left;
                        const confidence = pairConfidence(pixels, leftPixel, rightPixel, span) / span;
                        leftWeight = rightDistance * confidence;
                        rightWeight = leftDistance * confidence;
                    }

                    if (top >= 0 && bottom < height) {
                        const span = bottom - top;
                        const confidence = pairConfidence(pixels, topPixel, bottomPixel, span) / span;
                        topWeight = bottomDistance * confidence;
                        bottomWeight = topDistance * confidence;
                    }

                    if (!(leftWeight + topWeight)) {
                        leftWeight = left >= 0 ? 1 / leftDistance ** 2 : 0;
                        rightWeight = right < width ? 1 / rightDistance ** 2 : 0;
                        topWeight = top >= 0 ? 1 / topDistance ** 2 : 0;
                        bottomWeight = bottom < height ? 1 / bottomDistance ** 2 : 0;
                    }

                    const totalWeight = leftWeight + rightWeight + topWeight + bottomWeight;
                    const target = (rowStart + x) * 4;

                    if (!totalWeight) {
                        // At the center of a cross-shaped mask, sample from the next clear row.
                        const previousX = nearestClearPixelInRow(rows, x, previousOpenRow, width);
                        const nextX = nearestClearPixelInRow(rows, x, nextOpenRow, width);
                        const previousDistance = previousOpenRow >= 0 ? y - previousOpenRow + Math.abs(x - previousX) : Infinity;
                        const nextDistance = nextOpenRow < height ? nextOpenRow - y + Math.abs(x - nextX) : Infinity;
                        const corner = previousDistance <= nextDistance
                            ? previousOpenRow * width + previousX
                            : nextOpenRow * width + nextX;
                        pixels.copyWithin(target, corner * 4, corner * 4 + 4);
                        continue;
                    }

                    const leftAlpha = pixels[leftPixel + 3] * leftWeight;
                    const rightAlpha = pixels[rightPixel + 3] * rightWeight;
                    const topAlpha = pixels[topPixel + 3] * topWeight;
                    const bottomAlpha = pixels[bottomPixel + 3] * bottomWeight;
                    const alpha = leftAlpha + rightAlpha + topAlpha + bottomAlpha;
                    pixels[target + 3] = alpha / totalWeight;

                    // Reflect a small amount of nearby texture across the closest usable edge.
                    let detailPixel = 0;
                    let detailStep = 0;
                    let detailDistance = 12;

                    if (leftAlpha && leftDistance < detailDistance && left - leftDistance - 3 >= leftLimit) {
                        detailPixel = leftPixel - (leftDistance + 1) * 4;
                        detailStep = 8;
                        detailDistance = leftDistance;
                    }
                    if (rightAlpha && rightDistance < detailDistance && right + rightDistance + 3 < rightLimit) {
                        detailPixel = rightPixel + (rightDistance + 1) * 4;
                        detailStep = 8;
                        detailDistance = rightDistance;
                    }
                    if (topAlpha && topDistance < detailDistance && top - topDistance - 3 >= (column[columnRunIndex - 1]?.end ?? 0)) {
                        detailPixel = topPixel - (topDistance + 1) * width * 4;
                        detailStep = width * 8;
                        detailDistance = topDistance;
                    }
                    if (bottomAlpha && bottomDistance < detailDistance && bottom + bottomDistance + 3 < (column[columnRunIndex + 1]?.start ?? height)) {
                        detailPixel = bottomPixel + (bottomDistance + 1) * width * 4;
                        detailStep = width * 8;
                        detailDistance = bottomDistance;
                    }

                    const hasOpaqueDetail = detailStep && pixels[target + 3] === 255
                        && pixels[detailPixel + 3] === 255 && pixels[detailPixel - detailStep + 3] === 255
                        && pixels[detailPixel + detailStep + 3] === 255;
                    const detailWeight = hasOpaqueDetail ? (12 - detailDistance) / 20 : 0;

                    for (let channel = 0; channel < 3; channel++) {
                        const detail = detailWeight && detailWeight * (pixels[detailPixel + channel]
                            - (pixels[detailPixel - detailStep + channel] + pixels[detailPixel + detailStep + channel]) / 2);
                        pixels[target + channel] = alpha ? (pixels[leftPixel + channel] * leftAlpha
                            + pixels[rightPixel + channel] * rightAlpha + pixels[topPixel + channel] * topAlpha
                            + pixels[bottomPixel + channel] * bottomAlpha) / alpha + detail : 0;
                    }
                }
            }
        }

        for (const { left, top, right, bottom } of rectangles) {
            context.putImageData(image, 0, 0, left, top, right - left, bottom - top);
        }
    }

    window.restoreImageWatermarks = restoreImageWatermarks;
})();
