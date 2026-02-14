class AIUpscaler {
    constructor() {
        this.upscaler = null;
        this.isModelLoaded = false;
        this.currentScale = 4;
        this.currentModel = 'esrgan-medium';
        this.fileList = [];
        this.isProcessing = false;
        
        this.init();
    }
    
    async init() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.scaleSelect = document.getElementById('scaleSelect');
        this.modelSelect = document.getElementById('modelSelect');
        this.processBtn = document.getElementById('processBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.fileListContainer = document.getElementById('fileList');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        this.bindEvents();
        await this.initUpscaler();
    }
    
    async initUpscaler() {
        try {
            this.updateProgress('正在加载模型...', 30);
            this.progressContainer.style.display = 'block';
            
            this.upscaler = new Upscaler({
                model: this.getModel()
            });
            
            await this.upscaler.getModel();
            
            this.isModelLoaded = true;
            this.hideProgress();
            
        } catch (error) {
            console.error('模型加载失败:', error);
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
        if (!modelPackage) {
            throw new Error(`模型 ${this.currentModel} 未找到`);
        }
        
        return modelPackage[scale];
    }
    
    bindEvents() {
        // 点击上传区域
        this.uploadArea.addEventListener('click', () => {
            this.fileInput.click();
        });
        
        // 文件选择
        this.fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFiles(files);
            e.target.value = ''; // 清空input，允许重复选择同一文件
        });
        
        // 拖拽上传
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
        
        // 放大倍数改变
        this.scaleSelect.addEventListener('change', async (e) => {
            this.currentScale = parseInt(e.target.value);
            await this.reloadModel();
        });
        
        // 模型改变
        this.modelSelect.addEventListener('change', async (e) => {
            this.currentModel = e.target.value;
            await this.reloadModel();
        });
        
        // 开始处理
        this.processBtn.addEventListener('click', () => {
            this.processAllFiles();
        });
        
        // 清空列表
        this.clearBtn.addEventListener('click', () => {
            this.clearAllFiles();
        });
    }
    
    async reloadModel() {
        if (!this.isModelLoaded || this.isProcessing) return;
        
        this.isModelLoaded = false;
        this.processBtn.disabled = true;
        this.updateProgress('正在切换模型...', 50);
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
            console.error('模型切换失败:', error);
            alert('模型切换失败: ' + error.message);
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
                        status: 'pending', // pending, processing, completed, error
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
                <img src="${fileData.preview}" class="file-preview" alt="preview">
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
                statusSpan.textContent = '等待处理';
                statusSpan.style.color = '#888';
                downloadBtn.disabled = true;
                resultDiv.style.display = 'none';
                break;
                
            case 'processing':
                statusSpan.textContent = '处理中...';
                statusSpan.style.color = '#4a9d5f';
                downloadBtn.disabled = true;
                resultDiv.style.display = 'none';
                break;
                
            case 'completed':
                statusSpan.textContent = '已完成';
                statusSpan.style.color = '#4a9d5f';
                downloadBtn.disabled = false;
                if (fileData.upscaledImage) {
                    resultDiv.textContent = `放大至 ${fileData.upscaledImage.width} × ${fileData.upscaledImage.height} px`;
                    resultDiv.style.display = 'block';
                }
                break;
                
            case 'error':
                statusSpan.textContent = '处理失败';
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
            alert('没有需要处理的文件');
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
            
            this.updateProgress(`正在处理 ${processed + 1}/${total}: ${fileData.name}`, (processed / total) * 100);
            
            try {
                await this.processFile(fileData);
                fileData.status = 'completed';
            } catch (error) {
                console.error(`处理文件失败 ${fileData.name}:`, error);
                fileData.status = 'error';
            }
            
            this.updateFileItem(fileData);
            processed++;
            this.updateProgress(`已处理 ${processed}/${total}`, (processed / total) * 100);
        }
        
        this.isProcessing = false;
        this.processBtn.disabled = false;
        this.clearBtn.disabled = false;
        this.scaleSelect.disabled = false;
        this.modelSelect.disabled = false;
        this.hideProgress();
        
        alert(`处理完成！成功: ${pendingFiles.filter(f => f.status === 'completed').length}, 失败: ${pendingFiles.filter(f => f.status === 'error').length}`);
    }
    
    async processFile(fileData) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = fileData.originalImage.width;
        tempCanvas.height = fileData.originalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(fileData.originalImage, 0, 0);
        
        const upscaledSrc = await this.upscaler.upscale(tempCanvas, {
            output: 'base64',
            patchSize: 64,
            padding: 2
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
        
        if (this.fileList.length > 0 && !confirm('确定要清空所有文件吗？')) {
            return;
        }
        
        this.fileList = [];
        this.fileListContainer.innerHTML = '';
        this.updateButtons();
    }
    
    updateButtons() {
        const hasPendingFiles = this.fileList.some(f => f.status === 'pending');
        this.processBtn.disabled = !hasPendingFiles || !this.isModelLoaded || this.isProcessing;
        this.clearBtn.disabled = this.fileList.length === 0 || this.isProcessing;
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
}

document.addEventListener('DOMContentLoaded', () => {
    new AIUpscaler();
});
