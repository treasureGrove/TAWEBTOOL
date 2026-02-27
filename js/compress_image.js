let selectedFiles = [];

const elements = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    folderInput: document.getElementById('folderInput'),
    selectFolderUpload: document.getElementById('selectFolderUpload'),
    fileList: document.getElementById('fileList'),
    outputFormat: document.getElementById('outputFormat'),
    quality: document.getElementById('quality'),
    qualityValue: document.getElementById('qualityValue'),
    targetSizeMb: document.getElementById('targetSizeMb'),
    processBtn: document.getElementById('processBtn'),
    clearBtn: document.getElementById('clearBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    folderPathGroup: document.getElementById('folderPathGroup'),
    folderPath: document.getElementById('folderPath'),
    selectFolderBtn: document.getElementById('selectFolderBtn')
};

initEvents();
updateSizeControlUI();

function initEvents() {
    elements.uploadArea.addEventListener('click', () => {
        elements.fileInput.click();
    });

    if (elements.selectFolderUpload) {
        elements.selectFolderUpload.addEventListener('click', () => {
            elements.folderInput.click();
        });
    }

    elements.fileInput.addEventListener('change', handleFileSelect);
    elements.folderInput.addEventListener('change', handleFileSelect);

    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.add('drag-over');
    });

    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('drag-over');
    });

    elements.uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        elements.uploadArea.classList.remove('drag-over');
        const files = getSupportedImageFiles(Array.from(e.dataTransfer.files || []));
        if (files.length > 0) {
            await addFiles(files);
        }
    });

    document.addEventListener('paste', async (e) => {
        const files = getImageFilesFromClipboard(e);
        if (files.length === 0) return;

        e.preventDefault();
        await addFiles(files);
    });

    elements.quality.addEventListener('input', (e) => {
        elements.qualityValue.textContent = e.target.value;
    });

    document.querySelectorAll('input[name="sizeControlMode"]').forEach((radio) => {
        radio.addEventListener('change', updateSizeControlUI);
    });

    document.querySelectorAll('input[name="outputMode"]').forEach((radio) => {
        radio.addEventListener('change', (e) => {
            elements.folderPathGroup.style.display = e.target.value === 'folder' ? 'block' : 'none';
        });
    });

    if (!('showSaveFilePicker' in window)) {
        const folderRadio = document.querySelector('input[name="outputMode"][value="folder"]');
        if (folderRadio) {
            folderRadio.disabled = true;
            folderRadio.parentElement.style.opacity = '0.5';
            folderRadio.parentElement.title = '输出到文件夹需要 Chrome 或 Edge 浏览器';
        }
    }

    elements.selectFolderBtn.addEventListener('click', async () => {
        if ('showDirectoryPicker' in window) {
            try {
                const dirHandle = await window.showDirectoryPicker();
                elements.folderPath.value = dirHandle.name;
                window.selectedDirHandle = dirHandle;
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Folder selection error:', err);
                }
            }
        } else {
            alert('您的浏览器不支持文件夹选择，请使用 Chrome 或 Edge。');
        }
    });

    elements.clearBtn.addEventListener('click', () => {
        selectedFiles.forEach((item) => revokePreview(item.preview));
        selectedFiles = [];
        renderFileList();
    });

    elements.processBtn.addEventListener('click', processImages);
}

function updateSizeControlUI() {
    const mode = document.querySelector('input[name="sizeControlMode"]:checked').value;
    elements.targetSizeMb.disabled = mode !== 'target';
}

async function handleFileSelect(e) {
    const files = getSupportedImageFiles(Array.from(e.target.files || []));
    if (files.length > 0) {
        await addFiles(files);
    }
    e.target.value = '';
}

function getSupportedImageFiles(files) {
    return files.filter((file) => isSupportedImageFile(file));
}

function isSupportedImageFile(file) {
    return file.type.startsWith('image/') || /\.(tga|dds|bmp)$/i.test(file.name);
}

function getImageFilesFromClipboard(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const files = [];

    items.forEach((item) => {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && isSupportedImageFile(file)) {
                files.push(file);
            }
        }
    });

    return files;
}

function getFileUniqueKey(file) {
    const pathPart = file.webkitRelativePath || file.name;
    return `${pathPart}__${file.size}__${file.lastModified}`;
}

async function addFiles(files) {
    const existingKeys = new Set(selectedFiles.map((item) => item.key));

    for (const file of files) {
        const key = getFileUniqueKey(file);
        if (existingKeys.has(key)) {
            continue;
        }

        const preview = await buildPreviewUrl(file);
        selectedFiles.push({
            key,
            file,
            displayName: file.webkitRelativePath || file.name,
            preview,
            status: 'pending',
            compressedSize: null,
            note: ''
        });
        existingKeys.add(key);
    }

    renderFileList();
}

async function buildPreviewUrl(file) {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.tga')) {
        try {
            const decoded = await TGADecoder.createImageDataFromFile(file);
            const canvas = document.createElement('canvas');
            canvas.width = decoded.width;
            canvas.height = decoded.height;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(decoded.width, decoded.height);
            imageData.data.set(decoded.data);
            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');
        } catch (err) {
            console.warn(`TGA 预览失败: ${file.name}`, err);
        }
    }

    if (lowerName.endsWith('.dds')) {
        return createTextPreview('DDS');
    }

    return URL.createObjectURL(file);
}

function createTextPreview(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#e6f4ee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#37b18c';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    return canvas.toDataURL('image/png');
}

function revokePreview(preview) {
    if (typeof preview === 'string' && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview);
    }
}

function renderFileList() {
    if (selectedFiles.length === 0) {
        elements.fileList.innerHTML = '';
        elements.processBtn.disabled = true;
        return;
    }

    elements.processBtn.disabled = false;
    elements.fileList.innerHTML = selectedFiles
        .map((item, index) => {
            let sizeInfo = `<div class="file-size">${formatFileSize(item.file.size)}</div>`;
            if (item.compressedSize !== null) {
                const reduction = ((1 - item.compressedSize / item.file.size) * 100).toFixed(1);
                const isSmaller = item.compressedSize < item.file.size;
                sizeInfo += `<div class="file-size-compare ${isSmaller ? '' : 'larger'}">${formatFileSize(item.compressedSize)} (${isSmaller ? '-' : '+'}${Math.abs(reduction)}%)</div>`;
            }

            const note = item.note ? `<div class="file-note">${item.note}</div>` : '';

            return `
        <div class="file-item">
            <div class="file-info">
                <img src="${item.preview}" class="file-preview" alt="preview">
                <div class="file-details">
                    <div class="file-name">${item.displayName}</div>
                    ${sizeInfo}
                    ${note}
                </div>
                ${item.status === 'done' ? '<div class="file-status">✓ 已完成</div>' : ''}
            </div>
            <button class="file-remove" onclick="removeFile(${index})">删除</button>
        </div>`;
        })
        .join('');
}

function removeFile(index) {
    revokePreview(selectedFiles[index].preview);
    selectedFiles.splice(index, 1);
    renderFileList();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function processImages() {
    const outputMode = document.querySelector('input[name="outputMode"]:checked').value;
    const format = elements.outputFormat.value;
    const quality = parseInt(elements.quality.value, 10) / 100;
    const namingMode = document.querySelector('input[name="namingMode"]:checked').value;
    const namingSuffix = document.getElementById('namingSuffix').value || '_compressed';
    const sizeControlMode = document.querySelector('input[name="sizeControlMode"]:checked').value;

    let targetBytes = null;
    if (sizeControlMode === 'target') {
        const targetSizeMb = parseFloat(elements.targetSizeMb.value);
        if (!Number.isFinite(targetSizeMb) || targetSizeMb <= 0) {
            alert('请输入有效的目标体积（MB）。');
            return;
        }
        targetBytes = Math.max(1, Math.floor(targetSizeMb * 1024 * 1024));
    }

    if (outputMode === 'folder' && !window.selectedDirHandle) {
        alert('请先选择输出文件夹');
        return;
    }

    elements.processBtn.disabled = true;
    elements.clearBtn.disabled = true;
    elements.progressContainer.style.display = 'block';

    let processed = 0;
    const total = selectedFiles.length;
    const zipFiles = [];

    for (let i = 0; i < selectedFiles.length; i++) {
        const item = selectedFiles[i];
        try {
            const result = await compressImage(item.file, format, quality, { targetBytes });
            const compressedBlob = result.blob;

            item.compressedSize = compressedBlob.size;
            item.note = result.note || '';

            const outputFileName = getOutputFileName(item.file.name, format, namingMode, namingSuffix);

            if (outputMode === 'download') {
                downloadFile(compressedBlob, outputFileName);
            } else if (outputMode === 'zip') {
                zipFiles.push({ blob: compressedBlob, name: outputFileName });
            } else if (outputMode === 'folder') {
                await saveToFolder(compressedBlob, outputFileName);
            }

            item.status = 'done';
            processed++;

            const progress = (processed / total) * 100;
            elements.progressFill.style.width = `${progress}%`;
            elements.progressText.textContent = `处理中... ${processed}/${total}`;

            renderFileList();
        } catch (error) {
            console.error('Processing error:', error);
            alert(`处理文件 ${item.file.name} 时出错: ${error.message}`);
        }
    }

    if (outputMode === 'zip' && zipFiles.length > 0) {
        try {
            const zip = new JSZip();
            zipFiles.forEach((file) => {
                zip.file(file.name, file.blob);
            });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadFile(zipBlob, `compressed_images_${Date.now()}.zip`);
        } catch (error) {
            console.error('ZIP creation error:', error);
            alert(`创建 ZIP 文件时出错: ${error.message}`);
        }
    }

    elements.processBtn.disabled = false;
    elements.clearBtn.disabled = false;

    if (processed === total) {
        elements.progressText.textContent = `✓ 完成！已处理 ${total} 个文件`;
        setTimeout(() => {
            elements.progressContainer.style.display = 'none';
            elements.progressFill.style.width = '0%';
        }, 2000);
    }
}

async function compressImage(file, format, quality, options = {}) {
    const targetBytes = options.targetBytes || null;
    const canvas = await loadFileToCanvas(file);

    if (!targetBytes) {
        const blob = await encodeFromCanvas(canvas, format, quality, file);
        return { blob, note: '' };
    }

    let targetResult;
    if (supportsQualitySizeControl(format, file)) {
        targetResult = await compressToTargetByQuality(canvas, format, file, targetBytes, quality);
    } else {
        targetResult = await compressToTargetByScale(canvas, format, file, targetBytes, quality);
    }

    if (!targetResult.reachedTarget) {
        return {
            blob: targetResult.blob,
            note: `无法压到目标体积内（最小约 ${formatFileSize(targetResult.blob.size)}）`
        };
    }

    const qualityInfo = targetResult.usedQuality
        ? `质量约 ${Math.round(targetResult.usedQuality * 100)}%`
        : `缩放约 ${Math.round(targetResult.usedScale * 100)}%`;

    return {
        blob: targetResult.blob,
        note: `已压缩到 ${formatFileSize(targetResult.blob.size)}（目标 <= ${formatFileSize(targetBytes)}，${qualityInfo}）`
    };
}

function loadFileToCanvas(file) {
    return new Promise((resolve, reject) => {
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.tga')) {
            TGADecoder.createImageDataFromFile(file)
                .then((decoded) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = decoded.width;
                    canvas.height = decoded.height;
                    const ctx = canvas.getContext('2d');
                    const imgData = ctx.createImageData(decoded.width, decoded.height);
                    imgData.data.set(decoded.data);
                    ctx.putImageData(imgData, 0, 0);
                    resolve(canvas);
                })
                .catch(reject);
            return;
        }

        if (fileName.endsWith('.dds')) {
            reject(new Error('暂不支持 DDS 作为输入文件'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('读取文件失败'));
        reader.readAsDataURL(file);
    });
}

async function compressToTargetByQuality(canvas, format, originalFile, targetBytes, startQuality) {
    const minQuality = 0.05;
    let low = minQuality;
    let high = Math.max(minQuality, Math.min(1, startQuality));

    let bestUnderBlob = null;
    let bestUnderQuality = high;
    let smallestBlob = null;
    let smallestQuality = minQuality;

    for (let i = 0; i < 8; i++) {
        const quality = (low + high) / 2;
        const blob = await encodeFromCanvas(canvas, format, quality, originalFile);

        if (!smallestBlob || blob.size < smallestBlob.size) {
            smallestBlob = blob;
            smallestQuality = quality;
        }

        if (blob.size <= targetBytes) {
            bestUnderBlob = blob;
            bestUnderQuality = quality;
            low = quality;
        } else {
            high = quality;
        }
    }

    const minBlob = await encodeFromCanvas(canvas, format, minQuality, originalFile);
    if (!smallestBlob || minBlob.size < smallestBlob.size) {
        smallestBlob = minBlob;
        smallestQuality = minQuality;
    }

    if (bestUnderBlob) {
        return {
            blob: bestUnderBlob,
            reachedTarget: true,
            usedQuality: bestUnderQuality
        };
    }

    return {
        blob: smallestBlob,
        reachedTarget: smallestBlob.size <= targetBytes,
        usedQuality: smallestQuality
    };
}

async function compressToTargetByScale(canvas, format, originalFile, targetBytes, quality) {
    let low = 0.05;
    let high = 1;

    let bestUnderBlob = null;
    let bestUnderScale = low;
    let smallestBlob = null;
    let smallestScale = low;

    const testBlobAtScale = async (scale) => {
        const scaledCanvas = createScaledCanvas(canvas, scale);
        const blob = await encodeFromCanvas(scaledCanvas, format, quality, originalFile);
        return { blob, scale };
    };

    const initial = await testBlobAtScale(1);
    if (initial.blob.size <= targetBytes) {
        return {
            blob: initial.blob,
            reachedTarget: true,
            usedScale: 1
        };
    }

    smallestBlob = initial.blob;
    smallestScale = 1;

    for (let i = 0; i < 10; i++) {
        const mid = (low + high) / 2;
        const current = await testBlobAtScale(mid);

        if (!smallestBlob || current.blob.size < smallestBlob.size) {
            smallestBlob = current.blob;
            smallestScale = mid;
        }

        if (current.blob.size <= targetBytes) {
            bestUnderBlob = current.blob;
            bestUnderScale = mid;
            low = mid;
        } else {
            high = mid;
        }
    }

    const minResult = await testBlobAtScale(0.05);
    if (!smallestBlob || minResult.blob.size < smallestBlob.size) {
        smallestBlob = minResult.blob;
        smallestScale = 0.05;
    }

    if (bestUnderBlob) {
        return {
            blob: bestUnderBlob,
            reachedTarget: true,
            usedScale: bestUnderScale
        };
    }

    return {
        blob: smallestBlob,
        reachedTarget: smallestBlob.size <= targetBytes,
        usedScale: smallestScale
    };
}

function createScaledCanvas(sourceCanvas, scale) {
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
    scaledCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));

    const ctx = scaledCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
    return scaledCanvas;
}

function supportsQualitySizeControl(format, originalFile) {
    if (format === 'jpeg' || format === 'webp') return true;
    if (format !== 'keep') return false;

    const mime = resolveOutputMimeType(format, originalFile);
    return mime === 'image/jpeg' || mime === 'image/webp';
}

function resolveOutputMimeType(format, originalFile) {
    if (format !== 'keep') {
        if (format === 'jpeg') return 'image/jpeg';
        return `image/${format}`;
    }

    if (originalFile.type) {
        return originalFile.type === 'image/jpg' ? 'image/jpeg' : originalFile.type;
    }

    const ext = originalFile.name.split('.').pop().toLowerCase();
    const extMap = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        bmp: 'image/bmp',
        tga: 'image/png'
    };

    return extMap[ext] || 'image/png';
}

function encodeFromCanvas(canvas, format, quality, originalFile) {
    return new Promise((resolve, reject) => {
        if (format === 'tga') {
            try {
                resolve(TGAEncoder.encodeFromCanvas(canvas));
            } catch (err) {
                reject(new Error(`TGA 编码失败: ${err.message}`));
            }
            return;
        }

        if (format === 'dds') {
            try {
                resolve(DDSEncoder.encodeFromCanvas(canvas, quality < 0.7));
            } catch (err) {
                reject(new Error(`DDS 编码失败: ${err.message}`));
            }
            return;
        }

        if (format === 'bmp') {
            try {
                resolve(BMPEncoder.encodeFromCanvas(canvas));
            } catch (err) {
                reject(new Error(`BMP 编码失败: ${err.message}`));
            }
            return;
        }

        const outputFormat = resolveOutputMimeType(format, originalFile);
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('图片编码失败'));
            }
        }, outputFormat, quality);
    });
}

function getOutputFileName(originalName, format, namingMode = 'original', suffix = '_compressed') {
    const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '');
    const ext = format === 'keep' ? originalName.split('.').pop() : (format === 'jpeg' ? 'jpg' : format);

    if (namingMode === 'suffix') {
        return `${nameWithoutExt}${suffix}.${ext}`;
    }

    if (format === 'keep') return originalName;
    return `${nameWithoutExt}.${ext}`;
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function saveToFolder(blob, filename) {
    try {
        if (!window.selectedDirHandle) {
            throw new Error('未选择输出文件夹');
        }

        const permission = await window.selectedDirHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted') {
            const newPermission = await window.selectedDirHandle.requestPermission({ mode: 'readwrite' });
            if (newPermission !== 'granted') {
                throw new Error('未获得文件夹写入权限');
            }
        }

        const fileHandle = await window.selectedDirHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    } catch (err) {
        if (err.name === 'NotAllowedError') {
            throw new Error('没有文件夹写入权限');
        }
        throw new Error(`保存到文件夹失败: ${err.message}`);
    }
}
