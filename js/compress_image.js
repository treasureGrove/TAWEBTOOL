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
    processBtn: document.getElementById('processBtn'),
    clearBtn: document.getElementById('clearBtn'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    folderPathGroup: document.getElementById('folderPathGroup'),
    folderPath: document.getElementById('folderPath'),
    selectFolderBtn: document.getElementById('selectFolderBtn')
};

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

elements.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.uploadArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(f => 
        f.type.startsWith('image/') || 
        f.name.match(/\.(tga|dds|bmp)$/i)
    );
    if (files.length > 0) {
        addFiles(files);
    }
});

elements.quality.addEventListener('input', (e) => {
    elements.qualityValue.textContent = e.target.value;
});

document.querySelectorAll('input[name="outputMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        elements.folderPathGroup.style.display = e.target.value === 'folder' ? 'block' : 'none';
    });
});

if (!('showSaveFilePicker' in window)) {
    const folderRadio = document.querySelector('input[name="outputMode"][value="folder"]');
    if (folderRadio) {
        folderRadio.disabled = true;
        folderRadio.parentElement.style.opacity = '0.5';
        folderRadio.parentElement.title = '需要 Chrome 或 Edge 浏览器';
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
        alert('您的浏览器不支持文件夹选择功能。请使用 Chrome 或 Edge 浏览器。');
    }
});

elements.clearBtn.addEventListener('click', () => {
    selectedFiles = [];
    renderFileList();
});

elements.processBtn.addEventListener('click', processImages);

function handleFileSelect(e) {
    const files = Array.from(e.target.files).filter(f => 
        f.type.startsWith('image/') || 
        f.name.match(/\.(tga|dds|bmp)$/i)
    );
    if (files.length > 0) {
        addFiles(files);
    }
    e.target.value = '';
}

function addFiles(files) {
    files.forEach(file => {
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push({
                file,
                preview: URL.createObjectURL(file),
                status: 'pending',
                compressedSize: null
            });
        }
    });
    renderFileList();
}

function renderFileList() {
    if (selectedFiles.length === 0) {
        elements.fileList.innerHTML = '';
        elements.processBtn.disabled = true;
        return;
    }
    
    elements.processBtn.disabled = false;
    elements.fileList.innerHTML = selectedFiles.map((item, index) => {
        let sizeInfo = `<div class="file-size">${formatFileSize(item.file.size)}</div>`;
        if (item.compressedSize !== null) {
            const reduction = ((1 - item.compressedSize / item.file.size) * 100).toFixed(1);
            const isSmaller = item.compressedSize < item.file.size;
            sizeInfo += `<div class="file-size-compare ${isSmaller ? '' : 'larger'}">
                ${formatFileSize(item.compressedSize)} 
                (${isSmaller ? '-' : '+'}${Math.abs(reduction)}%)
            </div>`;
        }
        
        return `
        <div class="file-item">
            <div class="file-info">
                <img src="${item.preview}" class="file-preview" alt="preview">
                <div class="file-details">
                    <div class="file-name">${item.file.name}</div>
                    ${sizeInfo}
                </div>
                ${item.status === 'done' ? `<div class="file-status">✓ 已完成</div>` : ''}
            </div>
            <button class="file-remove" onclick="removeFile(${index})">删除</button>
        </div>
    `}).join('');
}

function removeFile(index) {
    URL.revokeObjectURL(selectedFiles[index].preview);
    selectedFiles.splice(index, 1);
    renderFileList();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function processImages() {
    const outputMode = document.querySelector('input[name="outputMode"]:checked').value;
    const format = elements.outputFormat.value;
    const quality = parseInt(elements.quality.value) / 100;
    const namingMode = document.querySelector('input[name="namingMode"]:checked').value;
    const namingSuffix = document.getElementById('namingSuffix').value || '_compressed';
    
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
            const compressedBlob = await compressImage(item.file, format, quality);
            item.compressedSize = compressedBlob.size;
            
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
            elements.progressFill.style.width = progress + '%';
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
            zipFiles.forEach(file => {
                zip.file(file.name, file.blob);
            });
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            downloadFile(zipBlob, `compressed_images_${Date.now()}.zip`);
        } catch (error) {
            console.error('ZIP creation error:', error);
            alert('创建ZIP文件时出错: ' + error.message);
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

function compressImage(file, format, quality) {
    return new Promise((resolve, reject) => {
        const fileName = file.name.toLowerCase();
        const isTGA = fileName.endsWith('.tga');
        const isDDS = fileName.endsWith('.dds');
        
        if (isTGA) {
            TGADecoder.createImageDataFromFile(file)
                .then(decoded => {
                    const canvas = document.createElement('canvas');
                    canvas.width = decoded.width;
                    canvas.height = decoded.height;
                    const ctx = canvas.getContext('2d');
                    const imgData = ctx.createImageData(decoded.width, decoded.height);
                    imgData.data.set(decoded.data);
                    ctx.putImageData(imgData, 0, 0);
                    
                    return encodeFromCanvas(canvas, format, quality, file);
                })
                .then(resolve)
                .catch(reject);
            return;
        }
        
        if (isDDS) {
            reject(new Error('DDS input files are not yet supported. Please use a different format.'));
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
                
                encodeFromCanvas(canvas, format, quality, file)
                    .then(resolve)
                    .catch(reject);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function encodeFromCanvas(canvas, format, quality, originalFile) {
    return new Promise((resolve, reject) => {
        if (format === 'tga') {
            try {
                const blob = TGAEncoder.encodeFromCanvas(canvas);
                resolve(blob);
            } catch (err) {
                reject(new Error('TGA encoding failed: ' + err.message));
            }
            return;
        }
        
        if (format === 'dds') {
            try {
                const blob = DDSEncoder.encodeFromCanvas(canvas, quality < 0.7);
                resolve(blob);
            } catch (err) {
                reject(new Error('DDS encoding failed: ' + err.message));
            }
            return;
        }
        
        if (format === 'bmp') {
            try {
                const blob = BMPEncoder.encodeFromCanvas(canvas);
                resolve(blob);
            } catch (err) {
                reject(new Error('BMP encoding failed: ' + err.message));
            }
            return;
        }
        
        let outputFormat = format === 'keep' ? (originalFile.type || 'image/png') : `image/${format}`;
        
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Failed to compress image'));
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
        throw new Error('保存到文件夹失败: ' + err.message);
    }
}
