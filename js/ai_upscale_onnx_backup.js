class AIUpscaler {
    constructor() {
        this.session = null;
        this.isModelLoaded = false;
        this.currentScale = 4;
        this.currentModel = 'realesrgan-x4plus';
        this.fileList = [];
        this.isProcessing = false;
        this.isModelLoading = false;
        this.modelLoadingPromise = null;
        this.currentComparisonFile = null;
        
        // 模型配置 - 使用可靠的CDN和轻量级模型
        this.modelConfigs = {
            'realesrgan-x4plus': {
                // 使用 UpscalerJS 的预训练模型（更小，专为浏览器优化）
                url: 'https://cdn.jsdelivr.net/npm/@upscalerjs/default-model@latest/models/x4/model.json',
                fallbackUrl: 'https://unpkg.com/@upscalerjs/default-model@latest/models/x4/model.json',
                scale: 4,
                patchSize: 64,
                padding: 4,
                name: 'AI 超分 x4',
                description: '4倍放大，浏览器优化',
                size: '约 8 MB',
                type: 'tfjs'
            },
            'realesrgan-x2plus': {
                url: 'https://cdn.jsdelivr.net/npm/@upscalerjs/default-model@latest/models/x2/model.json',
                fallbackUrl: 'https://unpkg.com/@upscalerjs/default-model@latest/models/x2/model.json',
                scale: 2,
                patchSize: 128,
                padding: 4,
                name: 'AI 超分 x2',
                description: '2倍放大，速度快',
                size: '约 8 MB',
                type: 'tfjs'
            },
            'realesrnet-x4plus': {
                url: 'https://cdn.jsdelivr.net/npm/@upscalerjs/default-model@latest/models/x3/model.json',
                fallbackUrl: 'https://unpkg.com/@upscalerjs/default-model@latest/models/x3/model.json',
                scale: 3,
                patchSize: 64,
                padding: 4,
                name: 'AI 超分 x3',
                description: '3倍放大，平衡选项',
                size: '约 8 MB',
                type: 'tfjs'
            }
        };
        
        this.init();
    }
    
    async init() {
        // 获取DOM元素
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.scaleSelect = document.getElementById('scaleSelect');
        this.modelSelect = document.getElementById('modelSelect');
        this.modelLabel = document.getElementById('modelLabel');
        this.modelStatus = document.getElementById('modelStatus');
        this.processBtn = document.getElementById('processBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.downloadAllBtn = document.getElementById('downloadAllBtn');
        this.fileListContainer = document.getElementById('fileList');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        
        this.bindEvents();
        this.initComparisonSlider();
        this.updateButtons();
        
        // 初始化 ONNX Runtime
        if (typeof ort !== 'undefined') {
            this.setModelStatus('正在加载 WASM 运行时...', 'warn');
            
            ort.env.wasm.numThreads = navigator.hardwareConcurrency || 4;
            ort.env.wasm.simd = true;
            ort.env.wasm.proxy = false;
            
            // 设置 WebAssembly 路径
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
            
            // 预加载模型
            setTimeout(() => this.loadModel(), 500);
        } else {
            this.setModelStatus('ONNX Runtime 未加载', 'error');
            console.error('ONNX Runtime not found');
        }
    }
    
    setModelStatus(text, state) {
        if (!this.modelStatus) return;
        this.modelStatus.textContent = text;
        this.modelStatus.classList.remove("ok", "warn", "error");
        if (state) {
            this.modelStatus.classList.add(state);
        }
    }
    
    markModelStale() {
        this.isModelLoaded = false;
        this.session = null;
        this.setModelStatus('模型未加载', 'warn');
        this.updateButtons();
    }
    
    async downloadModelWithProgress(url, modelName) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`下载失败: ${response.status} ${response.statusText}`);
        }
        
        const contentLength = response.headers.get('content-length');
        if (!contentLength) {
            // 没有内容长度，直接下载
            this.setModelStatus(`下载中 ${modelName}...`, 'warn');
            return await response.arrayBuffer();
        }
        
        const total = parseInt(contentLength, 10);
        let loaded = 0;
        
        const reader = response.body.getReader();
        const chunks = [];
        
        while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;
            
            chunks.push(value);
            loaded += value.length;
            
            const percent = ((loaded / total) * 100).toFixed(1);
            const loadedMB = (loaded / 1024 / 1024).toFixed(1);
            const totalMB = (total / 1024 / 1024).toFixed(1);
            
            this.setModelStatus(
                `下载 ${modelName}: ${loadedMB}MB / ${totalMB}MB (${percent}%)`,
                'warn'
            );
        }
        
        // 合并所有块
        const arrayBuffer = new Uint8Array(loaded);
        let position = 0;
        for (const chunk of chunks) {
            arrayBuffer.set(chunk, position);
            position += chunk.length;
        }
        
        return arrayBuffer.buffer;
    }
    
    async loadModel() {
        if (this.isModelLoading && this.modelLoadingPromise) {
            return this.modelLoadingPromise;
        }
        if (this.isModelLoaded) return true;
        
        this.isModelLoading = true;
        this.isModelLoaded = false;
        this.setModelStatus('加载中...', 'warn');
        this.updateButtons();
        
        this.modelLoadingPromise = (async () => {
            try {
                const config = this.modelConfigs[this.currentModel];
                if (!config) {
                    throw new Error(`未找到模型配置: ${this.currentModel}`);
                }
                
                this.setModelStatus(`准备下载模型 ${config.name} (${config.size})...`, 'warn');
                
                // 下载模型文件
                let modelArrayBuffer;
                try {
                    modelArrayBuffer = await this.downloadModelWithProgress(config.url, config.name);
                } catch (error) {
                    console.warn('主URL下载失败，尝试备用URL...', error);
                    if (config.fallbackUrl) {
                        this.setModelStatus(`切换备用源下载 ${config.name}...`, 'warn');
                        modelArrayBuffer = await this.downloadModelWithProgress(config.fallbackUrl, config.name);
                    } else {
                        throw error;
                    }
                }
                
                this.setModelStatus(`正在初始化模型...`, 'warn');
                
                // 创建 ONNX 会话
                const options = {
                    executionProviders: ['wasm'],
                    graphOptimizationLevel: 'all',
                    executionMode: 'parallel',
                    enableCpuMemArena: true,
                    enableMemPattern: true
                };
                
                this.session = await ort.InferenceSession.create(modelArrayBuffer, options);
                
                this.isModelLoaded = true;
                this.setModelStatus('模型就绪 ✓', 'ok');
                
                console.log(`模型加载成功: ${config.name}`);
                return true;
            } catch (error) {
                console.error('模型加载失败:', error);
                this.setModelStatus('加载失败，请重试', 'error');
                alert('模型加载失败: ' + error.message + '\n\n建议：\n1. 检查网络连接\n2. 尝试更换其他模型\n3. 刷新页面重试');
                return false;
            } finally {
                this.isModelLoading = false;
                this.modelLoadingPromise = null;
                this.updateButtons();
            }
        })();
        
        return this.modelLoadingPromise;
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
        
        this.scaleSelect.addEventListener('change', (e) => {
            this.currentScale = parseInt(e.target.value, 10);
            this.markModelStale();
        });
        
        this.modelSelect.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            this.markModelStale();
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
                <img src="${fileData.preview}" class="file-preview" alt="preview" style="cursor: default;">
                <div class="file-details">
                    <div class="file-name">${fileData.name}</div>
                    <div class="file-size">${sizeText} • ${fileData.originalImage.width} × ${fileData.originalImage.height} px</div>
                    <div class="file-result" style="display: none;"></div>
                </div>
            </div>
            <div class="file-actions">
                <span class="file-status"></span>
                <button class="file-preview-btn" disabled>对比查看</button>
                <button class="file-download" disabled>下载</button>
                <button class="file-remove">删除</button>
            </div>
        `;
        
        // 对比查看按钮事件
        const compareBtn = fileItem.querySelector('.file-preview-btn');
        compareBtn.addEventListener('click', () => {
            this.showComparison(fileData);
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
        const compareBtn = fileItem.querySelector('.file-preview-btn');
        const previewImg = fileItem.querySelector('.file-preview');
        
        switch (fileData.status) {
            case 'pending':
                statusSpan.textContent = '等待中';
                statusSpan.style.color = '#888';
                downloadBtn.disabled = true;
                compareBtn.disabled = true;
                resultDiv.style.display = 'none';
                if (previewImg) {
                    previewImg.style.cursor = 'default';
                    previewImg.classList.remove('is-ready');
                    previewImg.removeAttribute('title');
                }
                break;
                
            case 'processing':
                statusSpan.textContent = '处理中...';
                statusSpan.style.color = '#4a9d5f';
                downloadBtn.disabled = true;
                compareBtn.disabled = true;
                resultDiv.style.display = 'none';
                if (previewImg) {
                    previewImg.style.cursor = 'default';
                    previewImg.classList.remove('is-ready');
                    previewImg.removeAttribute('title');
                }
                break;
                
            case 'completed':
                statusSpan.textContent = '已完成';
                statusSpan.style.color = '#4a9d5f';
                downloadBtn.disabled = false;
                compareBtn.disabled = false;
                
                if (fileData.upscaledImage) {
                    resultDiv.textContent = `已放大至 ${fileData.upscaledImage.width} × ${fileData.upscaledImage.height} px`;
                    resultDiv.style.display = 'block';
                }
                if (previewImg) {
                    previewImg.style.cursor = 'pointer';
                    previewImg.title = '点击对比';
                    previewImg.classList.add('is-ready');
                }
                break;
                
            case 'error':
                statusSpan.textContent = '失败';
                statusSpan.style.color = '#d97f3e';
                downloadBtn.disabled = true;
                compareBtn.disabled = true;
                resultDiv.style.display = 'none';
                if (previewImg) {
                    previewImg.style.cursor = 'default';
                    previewImg.classList.remove('is-ready');
                    previewImg.removeAttribute('title');
                }
                break;
        }
    }
    
    async processAllFiles() {
        if (this.isProcessing) return;
        
        if (!this.isModelLoaded) {
            const ready = await this.loadModel();
            if (!ready) return;
        }
        
        let pendingFiles = this.fileList.filter(f => f.status === 'pending');
        if (pendingFiles.length === 0) {
            const completedFiles = this.fileList.filter(f => f.status === 'completed');
            if (completedFiles.length === 0) {
                alert('没有文件需要处理');
                return;
            }
            const shouldReprocess = confirm('所有文件已处理完成，是否重新处理？');
            if (!shouldReprocess) {
                return;
            }
            completedFiles.forEach((fileData) => {
                fileData.status = 'pending';
                this.updateFileItem(fileData);
            });
            pendingFiles = completedFiles;
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
            
            this.updateProgress(`处理 ${processed + 1}/${total}: ${fileData.name}`, (processed / total) * 100);
            
            try {
                await this.processFile(fileData, processed, total);
                fileData.status = 'completed';
            } catch (error) {
                console.error(`文件处理失败 ${fileData.name}:`, error);
                fileData.status = 'error';
            }
            
            this.updateFileItem(fileData);
            processed++;
            
            await new Promise(resolve => setTimeout(resolve, 50));
            
            this.updateProgress(`完成 ${processed}/${total}`, (processed / total) * 100);
        }
        
        this.isProcessing = false;
        this.processBtn.disabled = false;
        this.clearBtn.disabled = false;
        this.scaleSelect.disabled = false;
        this.modelSelect.disabled = false;
        this.hideProgress();
        
        const successCount = pendingFiles.filter(f => f.status === 'completed').length;
        const failCount = pendingFiles.filter(f => f.status === 'error').length;
        
        alert(`处理完成！成功: ${successCount}，失败: ${failCount}`);
        
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
        const config = this.modelConfigs[this.currentModel];
        const scale = config.scale;
        
        // 获取原始图像
        const img = fileData.originalImage;
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // 将图像转换为张量
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const inputTensor = await this.preprocessImage(imageData);
        
        // 执行推理
        const feeds = {};
        feeds[this.session.inputNames[0]] = inputTensor;
        
        this.updateProgress(
            `处理中 ${currentIndex + 1}/${total}: ${fileData.name} - 推理中...`,
            ((currentIndex + 0.5) / total) * 100
        );
        
        const results = await this.session.run(feeds);
        const outputTensor = results[this.session.outputNames[0]];
        
        // 后处理
        const upscaledCanvas = await this.postprocessImage(outputTensor, img.width * scale, img.height * scale);
        
        // 转换为图像
        const upscaledSrc = upscaledCanvas.toDataURL('image/png');
        
        return new Promise((resolve, reject) => {
            const upscaledImg = new Image();
            upscaledImg.onload = () => {
                fileData.upscaledImage = upscaledImg;
                fileData.upscaledSrc = upscaledSrc;
                fileData.upscaledBlob = null;
                resolve();
            };
            upscaledImg.onerror = reject;
            upscaledImg.src = upscaledSrc;
        });
    }
    
    async preprocessImage(imageData) {
        const { width, height, data } = imageData;
        const channels = 3;
        
        // 创建 RGB 数组 (CHW 格式)
        const inputArray = new Float32Array(channels * height * width);
        
        // 转换为 CHW 格式并归一化到 [0, 1]
        for (let c = 0; c < channels; c++) {
            for (let h = 0; h < height; h++) {
                for (let w = 0; w < width; w++) {
                    const pixelIndex = (h * width + w) * 4;
                    const tensorIndex = c * height * width + h * width + w;
                    inputArray[tensorIndex] = data[pixelIndex + c] / 255.0;
                }
            }
        }
        
        return new ort.Tensor('float32', inputArray, [1, channels, height, width]);
    }
    
    async postprocessImage(tensor, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        
        const data = tensor.data;
        const channels = 3;
        
        // 从 CHW 格式转换为 RGBA
        for (let h = 0; h < height; h++) {
            for (let w = 0; w < width; w++) {
                const pixelIndex = (h * width + w) * 4;
                for (let c = 0; c < channels; c++) {
                    const tensorIndex = c * height * width + h * width + w;
                    // 反归一化并裁剪到 [0, 255]
                    imageData.data[pixelIndex + c] = Math.min(255, Math.max(0, Math.round(data[tensorIndex] * 255)));
                }
                imageData.data[pixelIndex + 3] = 255; // Alpha 通道
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }
    
    releaseFileResources(fileData) {
        if (!fileData) return;
        if (fileData.upscaledSrc && fileData.upscaledSrc.startsWith('blob:')) {
            URL.revokeObjectURL(fileData.upscaledSrc);
        }
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
            alert('没有可下载的文件');
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
        
        alert(`正在下载 ${completedFiles.length} 个文件，请留意浏览器下载提示`);
    }
    
    removeFile(fileId) {
        const target = this.fileList.find(f => f.id === fileId);
        if (target) {
            this.releaseFileResources(target);
        }
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
        
        this.fileList.forEach((fileData) => this.releaseFileResources(fileData));
        this.fileList = [];
        this.fileListContainer.innerHTML = '';
        this.updateButtons();
    }
    
    updateButtons() {
        const hasPendingFiles = this.fileList.some(f => f.status === 'pending');
        const hasCompletedFiles = this.fileList.some(f => f.status === 'completed');
        
        const canProcess = (hasPendingFiles || hasCompletedFiles) && !this.isProcessing && !this.isModelLoading;
        this.processBtn.disabled = !canProcess;
        if (!hasPendingFiles && hasCompletedFiles) {
            this.processBtn.textContent = '重新处理';
        } else {
            this.processBtn.textContent = '开始处理';
        }
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
        
        comparisonSlider.style.width = width + 'px';
        comparisonSlider.style.maxWidth = '100%';
        comparisonSlider.style.height = height + 'px';
        
        originalCanvas.width = width;
        originalCanvas.height = height;
        const originalCtx = originalCanvas.getContext('2d');
        originalCtx.drawImage(fileData.originalImage, 0, 0, width, height);
        
        upscaledCanvas.width = width;
        upscaledCanvas.height = height;
        const upscaledCtx = upscaledCanvas.getContext('2d');
        upscaledCtx.drawImage(fileData.upscaledImage, 0, 0, width, height);
        
        originalInfo.textContent = `原图：${fileData.originalImage.width} × ${fileData.originalImage.height} px`;
        upscaledInfo.textContent = `放大后：${fileData.upscaledImage.width} × ${fileData.upscaledImage.height} px`;
        
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
