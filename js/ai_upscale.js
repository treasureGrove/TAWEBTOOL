class AIUpscaler {
    constructor() {
        this.upscaler = null;
        this.isModelLoaded = false;
        this.currentScale = 4;
        this.currentModel = 'esrgan-medium';
        this.fileList = [];
        this.isProcessing = false;
        this.currentComparisonFile = null;
        
        this.init();
    }
    
    async init() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.scaleSelect = document.getElementById('scaleSelect');
        this.modelSelect = document.getElementById('modelSelect');
        this.processBtn = document.getElementById('processBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');
        this.fileListContainer = document.getElementById('fileList');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        this.bindEvents();
        this.initComparisonSlider();
        await this.initUpscaler();
    }
    
    async initUpscaler() {
        try {
            this.updateProgress('Loading model...', 30);
            this.progressContainer.style.display = 'block';
            
            this.upscaler = new Upscaler({
                model: this.getModel()
            });
            
            await this.upscaler.getModel();
            
            this.isModelLoaded = true;
            this.hideProgress();
            
        } catch (error) {
            console.error('Model loading failed:', error);
            alert('模型加载失败: ' + error.message);
        }
    }
    
    getModel() {
        const scale = `x${this.currentScale}`;
        
        const models = {
            'esrgan-slim': window.ESRGANSlim,
            'esrgan-medium': window.ESRGANMedium,
            'esrgan-thick': window.ESRGANThick
        };
        
        const modelPackage = models[this.currentModel];
        if (!modelPackage || typeof modelPackage !== 'object') {
            console.error('Available models:', Object.keys(models).filter(k => window[k.toUpperCase().replace(/-/g, '')]));
            throw new Error(`Model ${this.currentModel} not found`);
        }
        
        if (!modelPackage[scale]) {
            throw new Error(`${this.currentModel} does not support ${scale} scale`);
        }
        
        return modelPackage[scale];
    }
    
    initComparisonSlider() {
        const comparisonSlider = document.getElementById('comparisonSlider');
        const comparisonHandle = document.getElementById('comparisonHandle');
        const comparisonAfter = document.querySelector('.comparison-after');
        
        let isDragging = false;
        
        const updateSlider = (e) => {
            const rect = comparisonSlider.getBoundingClientRect();
            const x = (e.clientX || e.touches[0].clientX) - rect.left;
            const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
            
            comparisonHandle.style.left = percent + '%';
            comparisonAfter.style.clipPath = `inset(0 0 0 ${percent}%)`;
        };
        
        const startDrag = (e) => {
            isDragging = true;
            updateSlider(e);
        };
        
        const stopDrag = () => {
            isDragging = false;
        };
        
        const onDrag = (e) => {
            if (!isDragging) return;
            e.preventDefault();
            updateSlider(e);
        };
        
        comparisonHandle.addEventListener('mousedown', startDrag);
        comparisonHandle.addEventListener('touchstart', startDrag);
        
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
        
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag);
        
        comparisonSlider.addEventListener('click', (e) => {
            if (e.target === comparisonHandle || comparisonHandle.contains(e.target)) return;
            updateSlider(e);
        });
        
        document.getElementById('closeModal').addEventListener('click', () => {
            document.getElementById('comparisonModal').style.display = 'none';
        });
        
        document.getElementById('comparisonModal').addEventListener('click', (e) => {
            if (e.target.id === 'comparisonModal') {
                document.getElementById('comparisonModal').style.display = 'none';
            }
        });
        
        document.getElementById('prevBtn').addEventListener('click', () => {
            this.showPreviousComparison();
        });
        
        document.getElementById('nextBtn').addEventListener('click', () => {
            this.showNextComparison();
        });
        
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('comparisonModal');
            if (modal.style.display === 'flex') {
                if (e.key === 'ArrowLeft') {
                    this.showPreviousComparison();
                } else if (e.key === 'ArrowRight') {
                    this.showNextComparison();
                } else if (e.key === 'Escape') {
                    modal.style.display = 'none';
                }
            }
        });
    }
    
    bindEvents() {
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        this.fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFiles(files);
            e.target.value = '';
        });
        
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('drag-over');
        });
        
        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('drag-over');
        });
        
        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('drag-over');
            
            const files = Array.from(e.dataTransfer.files).filter(file => 
                file.type.startsWith('image/')
            );
            this.handleFiles(files);
        });
        
        this.scaleSelect.addEventListener('change', async (e) => {
            this.currentScale = parseInt(e.target.value);
            await this.reloadModel();
        });
        
        this.modelSelect.addEventListener('change', async (e) => {
            this.currentModel = e.target.value;
            await this.reloadModel();
        });
        
        this.processBtn.addEventListener('click', () => {
            this.processAllFiles();
        });
        
        this.clearBtn.addEventListener('click', () => {
            this.clearAllFiles();
        });
        
        this.downloadAllBtn.addEventListener('click', () => {
            this.downloadAllFiles();
        });
    }
    
    async reloadModel() {
        if (!this.isModelLoaded || this.isProcessing) return;
        
        this.isModelLoaded = false;
        this.processBtn.disabled = true;
        this.updateProgress('Switching model...', 50);
        this.progressContainer.style.display = 'block';
        
        try {
            this.upscaler = new Upscaler({
                model: this.getModel()
            });
            
            await this.upscaler.getModel();
            
            this.isModelLoaded = true;
            this.hideProgress();
            
            if (this.fileList.length > 0) {
                this.processBtn.disabled = false;
            }
            
        } catch (error) {
            console.error('Model switch failed:', error);
            alert('Model switch failed: ' + error.message);
            this.hideProgress();
        }
    }
    
    handleFiles(files) {
        files.forEach(file => {
            if (!file.type.match('image.*')) {
                return;
            }
            
            const fileId = Date.now() + Math.random();
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const fileData = {
                        id: fileId,
                        file: file,
                        name: file.name,
                        size: file.size,
                        originalImage: img,
                        upscaledImage: null,
                        status: 'pending',
                        preview: e.target.result
                    };
                    
                    this.fileList.push(fileData);
                    this.renderFileItem(fileData);
                    this.updateButtons();
                };
                img.src = e.target.result;
            };
            
            reader.readAsDataURL(file);
        });
    }
    
    renderFileItem(fileData) {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.dataset.id = fileData.id;
        
        const sizeText = this.formatFileSize(fileData.size);
        
        fileItem.innerHTML = `
            <div class="file-info">
                <img src="${fileData.preview}" class="file-preview" alt="preview" style="cursor: pointer;">
                <div class="file-details">
                    <div class="file-name">${fileData.name}</div>
                    <div class="file-size">${sizeText} • ${fileData.originalImage.width} × ${fileData.originalImage.height} px</div>
                    <div class="file-result" style="display: none;"></div>
                </div>
            </div>
            <div class="file-actions">
                <span class="file-status"></span>
                <button class="file-download" disabled>下载</button>
                <button class="file-remove">删除</button>
            </div>
        `;
        
        // 预览图点击事件 - 显示对比
        const previewImg = fileItem.querySelector('.file-preview');
        previewImg.addEventListener('click', () => {
            if (fileData.status === 'completed') {
                this.showComparison(fileData);
            }
        });
        
        // 下载按钮事件
        const downloadBtn = fileItem.querySelector('.file-download');
        downloadBtn.addEventListener('click', () => {
            this.downloadFile(fileData);
        });
        
        // 删除按钮事件
        const removeBtn = fileItem.querySelector('.file-remove');
        removeBtn.addEventListener('click', () => {
            this.removeFile(fileData.id);
        });
        
        this.fileListContainer.appendChild(fileItem);
    }
    
    updateFileItem(fileData) {
        const fileItem = this.fileListContainer.querySelector(`[data-id="${fileData.id}"]`);
        if (!fileItem) return;
        
        const statusSpan = fileItem.querySelector('.file-status');
        const downloadBtn = fileItem.querySelector('.file-download');
        const resultDiv = fileItem.querySelector('.file-result');
        
        switch (fileData.status) {
            case 'pending':
                statusSpan.textContent = 'Pending';
                statusSpan.style.color = '#888';
                downloadBtn.disabled = true;
                resultDiv.style.display = 'none';
                break;
                
            case 'processing':
                statusSpan.textContent = 'Processing...';
                statusSpan.style.color = '#4a9d5f';
                downloadBtn.disabled = true;
                resultDiv.style.display = 'none';
                break;
                
            case 'completed':
                statusSpan.textContent = 'Completed';
                statusSpan.style.color = '#4a9d5f';
                downloadBtn.disabled = false;
                if (fileData.upscaledImage) {
                    resultDiv.textContent = `Upscaled to ${fileData.upscaledImage.width} × ${fileData.upscaledImage.height} px (Click preview to compare)`;
                    resultDiv.style.display = 'block';
                }
                const previewImg = fileItem.querySelector('.file-preview');
                if (previewImg) {
                    previewImg.style.cursor = 'pointer';
                    previewImg.title = 'Click to compare';
                }
                break;
                
            case 'error':
                statusSpan.textContent = 'Failed';
                statusSpan.style.color = '#d97f3e';
                downloadBtn.disabled = true;
                resultDiv.style.display = 'none';
                break;
        }
    }
    
    async processAllFiles() {
        if (this.isProcessing || !this.isModelLoaded) return;
        
        const pendingFiles = this.fileList.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0) {
            alert('No files to process');
            return;
        }
        
        this.isProcessing = true;
        this.processBtn.disabled = true;
        this.clearBtn.disabled = true;
        this.scaleSelect.disabled = true;
        this.modelSelect.disabled = true;
        this.progressContainer.style.display = 'block';
        
        let processed = 0;
        const total = pendingFiles.length;
        
        for (const fileData of pendingFiles) {
            fileData.status = 'processing';
            this.updateFileItem(fileData);
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            this.updateProgress(`Processing ${processed + 1}/${total}: ${fileData.name}`, (processed / total) * 100);
            
            try {
                await this.processFile(fileData, processed, total);
                fileData.status = 'completed';
            } catch (error) {
                console.error(`File processing failed ${fileData.name}:`, error);
                fileData.status = 'error';
            }
            
            this.updateFileItem(fileData);
            processed++;
            
            await new Promise(resolve => setTimeout(resolve, 50));
            this.updateProgress(`Processed ${processed}/${total}`, (processed / total) * 100);
        }
        
        this.isProcessing = false;
        this.processBtn.disabled = false;
        this.clearBtn.disabled = false;
        this.scaleSelect.disabled = false;
        this.modelSelect.disabled = false;
        this.hideProgress();
        
        const successCount = pendingFiles.filter(f => f.status === 'completed').length;
        const failCount = pendingFiles.filter(f => f.status === 'error').length;
        
        alert(`Processing complete! Success: ${successCount}, Failed: ${failCount}`);
        
        if (successCount > 0) {
            const firstCompleted = this.fileList.find(f => f.status === 'completed');
            if (firstCompleted) {
                setTimeout(() => {
                    this.showComparison(firstCompleted);
                }, 500);
            }
        }
        
        this.updateButtons();
    }
    
    async processFile(fileData, currentIndex, total) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = fileData.originalImage.width;
        tempCanvas.height = fileData.originalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(fileData.originalImage, 0, 0);
        
        const upscaledSrc = await this.upscaler.upscale(tempCanvas, {
            output: 'base64',
            patchSize: 64,
            padding: 2,
            progress: (progress) => {
                const baseProgress = (currentIndex / total) * 100;
                const fileProgress = (progress / total) * 100;
                const totalProgress = baseProgress + fileProgress;
                this.updateProgress(
                    `Processing ${currentIndex + 1}/${total}: ${fileData.name} - ${Math.round(progress * 100)}%`,
                    totalProgress
                );
            }
        });
        
        return new Promise((resolve, reject) => {
            const upscaledImg = new Image();
            upscaledImg.onload = () => {
                fileData.upscaledImage = upscaledImg;
                fileData.upscaledSrc = upscaledSrc;
                resolve();
            };
            upscaledImg.onerror = reject;
            upscaledImg.src = upscaledSrc;
        });
    }
    
    downloadFile(fileData) {
        if (!fileData.upscaledImage || !fileData.upscaledSrc) return;
        
        const link = document.createElement('a');
        link.href = fileData.upscaledSrc;
        const nameWithoutExt = fileData.name.replace(/\.[^/.]+$/, '');
        link.download = `${nameWithoutExt}_upscaled_${this.currentScale}x.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    downloadAllFiles() {
        const completedFiles = this.fileList.filter(f => f.status === 'completed');
        
        if (completedFiles.length === 0) {
            alert('No completed files to download');
            return;
        }
        
        if (completedFiles.length === 1) {
            this.downloadFile(completedFiles[0]);
            return;
        }
        
        let delay = 0;
        completedFiles.forEach((fileData, index) => {
            setTimeout(() => {
                this.downloadFile(fileData);
            }, delay);
            delay += 300;
        });
        
        alert(`Downloading ${completedFiles.length} files, please check your browser download notifications`);
    }
    
    removeFile(fileId) {
        this.fileList = this.fileList.filter(f => f.id !== fileId);
        const fileItem = this.fileListContainer.querySelector(`[data-id="${fileId}"]`);
        if (fileItem) {
            fileItem.remove();
        }
        this.updateButtons();
    }
    
    clearAllFiles() {
        if (this.isProcessing) return;
        
        if (this.fileList.length > 0 && !confirm('Are you sure you want to clear all files?')) {
            return;
        }
        
        this.fileList = [];
        this.fileListContainer.innerHTML = '';
        this.updateButtons();
    }
    
    updateButtons() {
        const hasPendingFiles = this.fileList.some(f => f.status === 'pending');
        const hasCompletedFiles = this.fileList.some(f => f.status === 'completed');
        
        this.processBtn.disabled = !hasPendingFiles || !this.isModelLoaded || this.isProcessing;
        this.clearBtn.disabled = this.fileList.length === 0 || this.isProcessing;
        
        if (hasCompletedFiles) {
            this.downloadAllBtn.style.display = 'inline-block';
        } else {
            this.downloadAllBtn.style.display = 'none';
        }
    }
    
    updateProgress(text, percent) {
        this.progressText.textContent = text;
        this.progressFill.style.width = percent + '%';
    }
    
    hideProgress() {
        this.progressContainer.style.display = 'none';
        this.progressFill.style.width = '0%';
    }
    
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    
    showComparison(fileData) {
        if (!fileData.upscaledImage) return;
        
        this.currentComparisonFile = fileData;
        const modal = document.getElementById('comparisonModal');
        const originalCanvas = document.getElementById('originalCanvas');
        const upscaledCanvas = document.getElementById('upscaledCanvas');
        const originalInfo = document.getElementById('originalInfo');
        const upscaledInfo = document.getElementById('upscaledInfo');
        const comparisonSlider = document.getElementById('comparisonSlider');
        const currentFileName = document.getElementById('currentFileName');
        
        const completedFiles = this.fileList.filter(f => f.status === 'completed');
        const currentIndex = completedFiles.indexOf(fileData);
        currentFileName.textContent = `${fileData.name} (${currentIndex + 1}/${completedFiles.length})`;
        
        document.getElementById('prevBtn').disabled = currentIndex === 0;
        document.getElementById('nextBtn').disabled = currentIndex === completedFiles.length - 1;
        
        const maxWidth = Math.min(1200, window.innerWidth * 0.85);
        const maxHeight = window.innerHeight * 0.7;
        let width = fileData.upscaledImage.width;
        let height = fileData.upscaledImage.height;
        
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = width * ratio;
            height = height * ratio;
        }
        
        comparisonSlider.style.height = height + 'px';
        
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalCtx = originalCanvas.getContext('2d');
        originalCtx.drawImage(fileData.originalImage, 0, 0, width, height);
        
        upscaledCanvas.width = width;
        upscaledCanvas.height = height;
        const upscaledCtx = upscaledCanvas.getContext('2d');
        upscaledCtx.drawImage(fileData.upscaledImage, 0, 0, width, height);
        
        originalInfo.textContent = `Original: ${fileData.originalImage.width} × ${fileData.originalImage.height} px`;
        upscaledInfo.textContent = `Upscaled: ${fileData.upscaledImage.width} × ${fileData.upscaledImage.height} px`;
        
        document.getElementById('comparisonHandle').style.left = '50%';
        document.querySelector('.comparison-after').style.clipPath = 'inset(0 0 0 50%)';
        
        modal.style.display = 'flex';
    }
    
    showPreviousComparison() {
        const completedFiles = this.fileList.filter(f => f.status === 'completed');
        const currentIndex = completedFiles.indexOf(this.currentComparisonFile);
        if (currentIndex > 0) {
            this.showComparison(completedFiles[currentIndex - 1]);
        }
    }
    
    showNextComparison() {
        const completedFiles = this.fileList.filter(f => f.status === 'completed');
        const currentIndex = completedFiles.indexOf(this.currentComparisonFile);
        if (currentIndex < completedFiles.length - 1) {
            this.showComparison(completedFiles[currentIndex + 1]);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new AIUpscaler();
});
