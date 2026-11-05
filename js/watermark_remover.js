(() => {
    'use strict';

    const get = (name) => document.getElementById(`wm-${name}`);
    const fileInput = get('file');
    const start = get('start');
    const editor = get('editor');
    const frame = get('frame');
    const overlay = get('overlay');
    const maskPreview = get('mask-preview');
    const maskPreviewContext = maskPreview.getContext('2d');
    const aiMode = get('mode-ai');
    const quickMode = get('mode-quick');
    const toolButtons = [...get('ai-tools').querySelectorAll('[data-tool]')];
    const brush = get('brush');
    const original = get('original');
    const status = get('status');
    const open = get('open');
    const demo = get('demo');
    const before = get('before');
    const after = get('after');
    const undo = get('undo');
    const clear = get('clear');
    const apply = get('apply');
    const download = get('download');
    const replace = get('replace');
    const reset = get('reset');
    const maxFileSize = 24 * 1024 * 1024;
    const maxPixels = 16 * 1024 * 1024;
    const maxSelectionPixels = 2 * 1024 * 1024;
    const maxSelections = 24;
    const demoRegion = { x: 500, y: 84, width: 384, height: 108 };

    let result = get('result');
    let regions = [];
    let mask;
    let useAI = true;
    let aiTool = 'brush';
    let draft = null;
    let keyboardPoint = null;
    let hoverPoint = null;
    let filename = '';
    let hasResult = false;
    let showResult = false;
    let busy = false;
    let repairing = false;

    const currentTool = () => useAI ? aiTool : 'box';
    const brushDiameter = () => Number(brush.value) * original.width / frame.getBoundingClientRect().width;

    function report(message, error = false) {
        status.textContent = message;
        status.dataset.error = error;
    }

    function drawSample(canvas) {
        const context = canvas.getContext('2d');
        context.save();
        context.scale(canvas.width / 960, canvas.height / 600);
        const sky = context.createLinearGradient(0, 0, 0, 600);
        sky.addColorStop(0, '#7cae9e');
        sky.addColorStop(0.65, '#e7e7b9');
        sky.addColorStop(1, '#afc5a0');
        context.fillStyle = sky;
        context.fillRect(0, 0, 960, 600);
        context.fillStyle = '#f9edb9';
        context.beginPath();
        context.arc(241, 210, 60, 0, Math.PI * 2);
        context.fill();

        const hills = [
            ['#9cb49c', 380, 260, 380, 275],
            ['#6e9686', 432, 350, 455, 335],
            ['#477668', 450, 475, 455, 401],
            ['#2c564e', 560, 385, 610, 493]
        ];
        for (const [color, startY, leftY, rightY, endY] of hills) {
            context.fillStyle = color;
            context.beginPath();
            context.moveTo(0, startY);
            context.bezierCurveTo(185, leftY, 330, leftY, 481, (leftY + rightY) / 2);
            context.bezierCurveTo(665, rightY, 804, rightY, 960, endY);
            context.lineTo(960, 600);
            context.lineTo(0, 600);
            context.fill();
        }
        context.fillStyle = '#244b4466';
        context.fillRect(517, 104, 350, 68);
        context.fillStyle = '#fffef4e8';
        context.font = '600 36px system-ui, sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('TA TOOLBOX', 692, 139);
        context.restore();
    }

    function render() {
        const comparingOriginal = hasResult && !showResult;
        const markCount = useAI ? (mask?.count ?? 0) : regions.length;
        original.hidden = showResult;
        result.hidden = !showResult;
        before.setAttribute('aria-pressed', String(!showResult));
        after.setAttribute('aria-pressed', String(showResult));
        before.disabled = busy || !hasResult;
        after.disabled = busy || !hasResult;
        open.disabled = busy;
        demo.disabled = busy;
        replace.disabled = busy;
        aiMode.setAttribute('aria-pressed', String(useAI));
        quickMode.setAttribute('aria-pressed', String(!useAI));
        aiMode.disabled = quickMode.disabled = busy;
        get('ai-tools').hidden = !useAI;
        get('brush-size').hidden = aiTool === 'box';
        brush.disabled = busy || comparingOriginal;
        for (const button of toolButtons) {
            button.disabled = brush.disabled;
            button.setAttribute('aria-pressed', String(button.dataset.tool === aiTool));
        }
        get('mode-help').textContent = useAI
            ? '尽量只涂到水印，保留周围细节供 AI 参考。首次使用需加载约 28 MB 模型。'
            : '框住水印，用周围像素快速补齐。适合纯色和渐变背景。';
        undo.disabled = busy || !markCount || comparingOriginal;
        clear.disabled = undo.disabled;
        apply.disabled = undo.disabled;
        apply.textContent = repairing ? '正在修复…' : useAI ? '开始 AI 修复' : '修复所选区域';
        download.disabled = busy || !hasResult;
        reset.disabled = busy || !hasResult;
        editor.setAttribute('aria-busy', String(busy));
        get('count').textContent = `${markCount} 个${useAI ? '标记' : '选区'}`;
        drawOverlay();
    }

    function svgShape(tag, attributes) {
        const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
        return shape;
    }

    function rectangle(a, b) {
        return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
    }

    function drawOverlay() {
        overlay.replaceChildren();
        const comparingOriginal = hasResult && !showResult;
        maskPreview.hidden = !useAI || !mask || comparingOriginal;
        if (comparingOriginal) return;
        if (!maskPreview.hidden) mask.paint(maskPreviewContext);
        if (!useAI) {
            for (const region of regions) overlay.append(svgShape('rect', region));
        }
        if (draft?.tool === 'box') overlay.append(svgShape('rect', rectangle(draft.from, draft.to)));
        const cursor = keyboardPoint ?? hoverPoint;
        if (cursor && !busy) {
            const r = currentTool() === 'box' ? Math.max(original.width, original.height) * 0.006 : brushDiameter() / 2;
            overlay.append(svgShape('circle', { cx: cursor.x, cy: cursor.y, r }));
        }
    }

    function clearResult() {
        result.width = 1;
        result.height = 1;
        hasResult = false;
        showResult = false;
    }

    function openEditor(name, width, height, initialRegions = []) {
        filename = name;
        clearResult();
        regions = [...initialRegions];
        aiTool = 'brush';
        mask = window.createWatermarkMask(width, height);
        for (const region of initialRegions) mask.addRectangle(region);
        draft = null;
        keyboardPoint = null;
        hoverPoint = null;
        const scale = Math.min(1, 900 / Math.max(width, height));
        maskPreview.width = Math.max(1, Math.round(width * scale));
        maskPreview.height = Math.max(1, Math.round(height * scale));
        overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
        overlay.setAttribute('preserveAspectRatio', 'none');
        get('filename').textContent = name;
        get('filename').title = name;
        get('size').textContent = `${width} × ${height} 像素`;
        start.hidden = true;
        editor.hidden = false;
        render();
        frame.focus();
    }

    async function loadFile(file) {
        if (!file || busy) return;
        const supported = file.type ? /^image\/(png|jpeg|webp)$/i.test(file.type) : /\.(png|jpe?g|webp)$/i.test(file.name);
        if (!supported) {
            report('请选择 JPG、PNG 或 WebP 图片。', true);
            return;
        }
        if (file.size > maxFileSize) {
            report('这张图片超过 24 MB，请选择较小的文件。', true);
            return;
        }

        busy = true;
        render();
        report('正在读取图片…');
        let image;
        try {
            image = await createImageBitmap(file);
            const { width, height } = image;
            if (width * height > maxPixels || Math.max(width, height) > 8192) {
                report('图片尺寸过大，请将最长边缩至 8192 像素内、总像素缩至 1677 万以内。', true);
                return;
            }
            original.width = width;
            original.height = height;
            original.getContext('2d').drawImage(image, 0, 0);
            openEditor(file.name, width, height);
            report('图片已打开。请标记要修复的区域。');
        } catch {
            report('无法读取这张图片，请尝试重新保存为 JPG、PNG 或 WebP。', true);
        } finally {
            image?.close();
            busy = false;
            render();
        }
    }

    function finishSelection() {
        if (draft.tool !== 'box') {
            mask.endStroke();
            draft = null;
            render();
            return;
        }
        const region = rectangle(draft.from, draft.to);
        draft = null;
        if (region.width < 2 || region.height < 2) {
            report('请拖动指针，框出水印占据的区域。');
        } else if (region.width === original.width && region.height === original.height) {
            report('请缩小选区，留出可用于修补的周边像素。', true);
        } else if (useAI) {
            mask.addRectangle(region);
            report('已添加标记。可以继续标记，或开始修复。');
        } else if (regions.length >= maxSelections || [...regions, region].reduce((area, item) => area + item.width * item.height, 0) > maxSelectionPixels) {
            report('本次选区已达上限。请先修复现有选区，或缩小框选范围。', true);
        } else {
            regions.push(region);
            report('选区已添加。可以继续框选，或开始修复。');
        }
        render();
    }

    function beginSelection(point, pointerId) {
        const tool = currentTool();
        draft = { from: point, to: point, pointerId, tool };
        if (tool !== 'box') mask.beginStroke(point, brushDiameter(), tool === 'erase');
    }

    function moveSelection(point) {
        draft.to = point;
        if (draft.tool !== 'box') mask.extendStroke(point);
    }

    function cancelSelection() {
        if (draft && draft.tool !== 'box') mask.cancelStroke();
        draft = null;
    }

    function imagePoint(event) {
        const bounds = frame.getBoundingClientRect();
        return {
            x: Math.round(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)) * original.width),
            y: Math.round(Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) * original.height)
        };
    }

    frame.addEventListener('pointerdown', (event) => {
        if (busy || (hasResult && !showResult) || event.button !== 0 || !event.isPrimary) return;
        frame.focus({ preventScroll: true });
        keyboardPoint = null;
        cancelSelection();
        beginSelection(imagePoint(event), event.pointerId);
        frame.setPointerCapture(event.pointerId);
        drawOverlay();
    });
    frame.addEventListener('pointermove', (event) => {
        if (busy || (hasResult && !showResult) || !event.isPrimary) return;
        const point = imagePoint(event);
        hoverPoint = currentTool() !== 'box' && event.pointerType === 'mouse' ? point : null;
        if (draft?.pointerId === event.pointerId) moveSelection(point);
        drawOverlay();
    });
    frame.addEventListener('pointerleave', () => {
        hoverPoint = null;
        drawOverlay();
    });
    frame.addEventListener('pointerup', (event) => {
        if (busy || draft?.pointerId !== event.pointerId) return;
        moveSelection(imagePoint(event));
        finishSelection();
    });
    frame.addEventListener('lostpointercapture', (event) => {
        if (draft?.pointerId !== event.pointerId) return;
        cancelSelection();
        drawOverlay();
    });

    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    frame.addEventListener('keydown', (event) => {
        if (busy || (hasResult && !showResult) || draft?.pointerId !== undefined) return;
        const direction = directions[event.key];
        if (!direction && event.key !== ' ' && event.key !== 'Escape') return;
        event.preventDefault();
        hoverPoint = null;
        if (event.key === 'Escape') {
            cancelSelection();
            keyboardPoint = null;
            drawOverlay();
            return;
        }
        keyboardPoint ??= { x: Math.floor(original.width / 2), y: Math.floor(original.height / 2) };
        if (direction) {
            const step = event.shiftKey ? 1 : Math.max(1, Math.round(Math.max(original.width, original.height) / 80));
            keyboardPoint = {
                x: Math.min(original.width, Math.max(0, keyboardPoint.x + direction[0] * step)),
                y: Math.min(original.height, Math.max(0, keyboardPoint.y + direction[1] * step))
            };
            if (draft) moveSelection(keyboardPoint);
        } else if (!event.repeat) {
            if (draft) finishSelection();
            else beginSelection(keyboardPoint);
        }
        drawOverlay();
    });
    frame.addEventListener('blur', () => {
        keyboardPoint = null;
        if (draft?.pointerId === undefined) cancelSelection();
        drawOverlay();
    });

    for (const zone of [get('drop'), get('workspace')]) {
        zone.addEventListener('dragover', (event) => {
            if (!event.dataTransfer.types.includes('Files')) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
            zone.classList.toggle('wm-dragging', !busy);
        });
        zone.addEventListener('dragleave', (event) => {
            if (!zone.contains(event.relatedTarget)) zone.classList.remove('wm-dragging');
        });
        zone.addEventListener('drop', (event) => {
            event.preventDefault();
            zone.classList.remove('wm-dragging');
            loadFile(event.dataTransfer.files[0]);
        });
    }

    open.addEventListener('click', () => fileInput.click());
    replace.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        loadFile(fileInput.files[0]);
        fileInput.value = '';
    });
    demo.addEventListener('click', () => {
        original.width = 960;
        original.height = 600;
        drawSample(original);
        openEditor('山色示例.png', original.width, original.height, [demoRegion]);
        report('已框出示例中的水印，可以直接点击修复。');
    });

    for (const button of [aiMode, quickMode]) {
        button.addEventListener('click', () => {
            cancelSelection();
            hoverPoint = null;
            useAI = button === aiMode;
            render();
            report(useAI ? 'AI 模式已开启。可以用画笔涂抹水印。' : '快速模式已开启。请框出水印。');
        });
    }
    for (const button of toolButtons) {
        button.addEventListener('click', () => {
            cancelSelection();
            aiTool = button.dataset.tool;
            render();
        });
    }
    brush.addEventListener('input', () => {
        get('brush-value').value = `${brush.value} px`;
        drawOverlay();
    });

    before.addEventListener('click', () => {
        showResult = false;
        render();
        report('正在查看原图。切回「修复后」可继续标记。');
    });
    after.addEventListener('click', () => {
        showResult = true;
        render();
        report('正在查看修复结果。可以继续标记，也可以下载。');
    });
    undo.addEventListener('click', () => {
        if (useAI) mask.undo();
        else regions.pop();
        render();
        report('已撤销最后一次标记。');
    });
    clear.addEventListener('click', () => {
        if (useAI) mask.clear();
        else regions = [];
        render();
        report('已清空待修复标记。');
    });
    reset.addEventListener('click', () => {
        clearResult();
        mask.clear();
        regions = [];
        render();
        report('已还原为原图。');
    });

    apply.addEventListener('click', async () => {
        cancelSelection();
        busy = true;
        repairing = true;
        render();
        report('正在准备标记区域…');
        const next = document.createElement('canvas');
        try {
            // Paint the progress message before running the local pixel operation.
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const aiMask = useAI ? mask.getMask() : null;
            if (useAI && !aiMask) {
                report('请先涂抹或框出需要修复的区域。', true);
                return;
            }
            if (useAI && (aiMask.selectedPixels > maxSelectionPixels || aiMask.selectedPixels === original.width * original.height)) {
                report('标记范围过大。请缩小范围，或分几次修复。', true);
                return;
            }
            next.width = original.width;
            next.height = original.height;
            const context = next.getContext('2d', { willReadFrequently: true });
            context.drawImage(hasResult ? result : original, 0, 0);
            if (useAI) await window.repairWatermarkWithAI(context, aiMask, report);
            else window.restoreImageWatermarks(context, regions);
            next.id = result.id;
            result.replaceWith(next);
            result.width = 1;
            result.height = 1;
            result = next;
            hasResult = true;
            showResult = true;
            if (useAI) mask.clear();
            else regions = [];
            report('修复完成。可切换查看原图，或下载 PNG。');
        } catch {
            next.width = 1;
            next.height = 1;
            report(useAI
                ? 'AI 修复未完成。请重试、缩小标记范围，或切换到快速修复。'
                : '当前选区无法修复。请缩小选区，并留出可参考的周边背景。', true);
        } finally {
            busy = false;
            repairing = false;
            render();
        }
    });

    download.addEventListener('click', () => {
        busy = true;
        render();
        report('正在生成 PNG…');
        result.toBlob((blob) => {
            busy = false;
            render();
            if (!blob) {
                report('未能生成 PNG，请再试一次。', true);
                return;
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${filename.replace(/\.[^.]+$/, '') || '图片'}-已修复.png`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
            report('已生成原尺寸 PNG。');
        }, 'image/png');
    });

    drawSample(get('demo-preview'));
    render();
})();
