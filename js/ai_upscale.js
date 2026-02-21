class AIUpscaler {
    constructor() {
        this.session = null;
        this.isModelLoaded = false;
        this.currentScale = 2;  // 默认2x放大
        this.currentModel = 'realesrgan-x4plus';
        this.loadedModelKey = null;  // 记录当前已加载的模型
        this.currentExecutionMode = null;  // 记录当前执行模式
        this.fileList = [];
        this.isProcessing = false;
        this.isModelLoading = false;
        this.modelLoadingPromise = null;
        this.currentComparisonFile = null;
        
        // Real-ESRGAN ONNX 模型配置 - 使用 HuggingFace 权威源
        this.modelConfigs = {
            'realesrgan-x4plus': {
                // bukuroo/RealESRGAN-ONNX 是 HuggingFace 上验证过的权威仓库
                urls: [
                    'https://huggingface.co/bukuroo/RealESRGAN-ONNX/resolve/main/real-esrgan-x4plus-128.onnx',
                    'https://hf-mirror.com/bukuroo/RealESRGAN-ONNX/resolve/main/real-esrgan-x4plus-128.onnx'  // 镜像源
                ],
                scale: 4,
                name: 'Real-ESRGAN x4plus',
                description: '最强通用模型，适合照片',
                size: '67.2 MB'
            },
            'realesrgan-x4plus-anime': {
                // AXERA-TECH 官方仓库
                urls: [
                    'https://huggingface.co/AXERA-TECH/Real-ESRGAN/resolve/main/onnx/realesrgan-x4.onnx',
                    'https://hf-mirror.com/AXERA-TECH/Real-ESRGAN/resolve/main/onnx/realesrgan-x4.onnx'
                ],
                scale: 4,
                name: 'Real-ESRGAN x4 (AXERA)',
                description: '高质量通用模型',
                size: '约 64 MB'
            },
            'realesrgan-general': {
                // 备用：JoPmt 仓库的模型
                urls: [
                    'https://huggingface.co/JoPmt/Real_Esrgan_x2_Onnx_Tflite_Tfjs/resolve/main/Real_Esrgan_x2.onnx',
                    'https://hf-mirror.com/JoPmt/Real_Esrgan_x2_Onnx_Tflite_Tfjs/resolve/main/Real_Esrgan_x2.onnx'
                ],
                scale: 2,
                name: 'Real-ESRGAN x2',
                description: '2倍放大，速度更快',
                size: '约 17 MB'
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
        this.loadModelBtn = document.getElementById('loadModelBtn');
        this.folderPathGroup = document.getElementById('folderPathGroup');
        this.folderPath = document.getElementById('folderPath');
        this.selectFolderBtn = document.getElementById('selectFolderBtn');
        this.namingSuffix = document.getElementById('namingSuffix');
        
        this.selectedDirHandle = null;
        
        this.bindEvents();
        this.initComparisonSlider();
        this.updateButtons();
        this.initOutputModeListeners();
        
        // 初始化 ONNX Runtime
        if (typeof ort !== 'undefined') {
            // WASM 配置（用于CPU模式）
            ort.env.wasm.numThreads = 1;  // 强制单线程，避免crossOriginIsolated限制
            ort.env.wasm.simd = true;  // 启用SIMD加速
            ort.env.wasm.proxy = false;  // 禁用Worker，避免权限问题
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
            
            console.log('ONNX Runtime 配置完成（单线程模式）');
            console.log('WASM 线程数:', ort.env.wasm.numThreads);
            console.log('WebGL 已配置为兼容模式');
            
            // 自动检测并加载缓存的模型
            this.autoLoadCachedModel();
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
    
    async autoLoadCachedModel() {
        try {
            const modelKey = `model-${this.currentModel}`;
            const cachedModel = await this.getModelFromCache(modelKey);
            
            if (cachedModel) {
                console.log('发现缓存模型，自动加载...');
                this.setModelStatus('发现缓存模型，自动加载中...', 'warn');
                
                if (this.loadModelBtn) {
                    this.loadModelBtn.disabled = true;
                    this.loadModelBtn.textContent = '自动加载中...';
                }
                
                // 自动加载缓存的模型
                await this.loadModel();
            } else {
                this.setModelStatus('ONNX Runtime 就绪，点击上方按钮加载模型', 'warn');
            }
        } catch (error) {
            console.error('自动加载缓存模型失败:', error);
            this.setModelStatus('点击按钮加载模型', 'warn');
        }
    }
    
    initOutputModeListeners() {
        // 输出模式切换
        document.querySelectorAll('input[name="outputMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (this.folderPathGroup) {
                    this.folderPathGroup.style.display = e.target.value === 'folder' ? 'block' : 'none';
                }
            });
        });
        
        // 检查浏览器支持
        if (!('showSaveFilePicker' in window)) {
            const folderRadio = document.querySelector('input[name="outputMode"][value="folder"]');
            if (folderRadio) {
                folderRadio.disabled = true;
                folderRadio.parentElement.style.opacity = '0.5';
                folderRadio.parentElement.title = '需要 Chrome 或 Edge 浏览器';
            }
        }
        
        // 文件夹选择
        if (this.selectFolderBtn) {
            this.selectFolderBtn.addEventListener('click', async () => {
                if ('showDirectoryPicker' in window) {
                    try {
                        const dirHandle = await window.showDirectoryPicker();
                        this.folderPath.value = dirHandle.name;
                        this.selectedDirHandle = dirHandle;
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            console.error('文件夹选择错误:', err);
                        }
                    }
                } else {
                    alert('您的浏览器不支持文件夹选择功能。请使用 Chrome 或 Edge 浏览器。');
                }
            });
        }
    }
    
    markModelStale() {
        this.isModelLoaded = false;
        this.session = null;
        this.loadedModelKey = null;
        this.currentExecutionMode = null;
        this.setModelStatus('请重新加载模型', 'warn');
        if (this.loadModelBtn) {
            this.loadModelBtn.textContent = '点击加载模型';
            this.loadModelBtn.disabled = false;
        }
        this.updateButtons();
    }
    
    async getModelFromCache(modelKey) {
        try {
            console.log('[缓存] 开始检查缓存:', modelKey);
            // 优先使用 IndexedDB（更可靠，支持file://协议）
            const db = await this.openIndexedDB();
            console.log('[缓存] IndexedDB 连接成功');
            
            const transaction = db.transaction(['models'], 'readonly');
            const store = transaction.objectStore('models');
            const request = store.get(modelKey);
            
            const arrayBuffer = await new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    console.log('[缓存] IndexedDB 查询完成，结果:', request.result ? '找到' : '未找到');
                    resolve(request.result);
                };
                request.onerror = () => {
                    console.error('[缓存] IndexedDB 查询错误:', request.error);
                    reject(request.error);
                };
            });
            
            if (arrayBuffer) {
                console.log('[缓存] ✓ 从 IndexedDB 加载模型成功，大小:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB');
                return arrayBuffer;
            }
            
            // 如果 IndexedDB 没有，尝试 Cache API（如果可用）
            if ('caches' in window) {
                try {
                    const cache = await caches.open('realesrgan-models-v1');
                    const cachedResponse = await cache.match(modelKey);
                    
                    if (cachedResponse) {
                        console.log('从 Cache API 加载模型:', modelKey);
                        const arrayBuffer = await cachedResponse.arrayBuffer();
                        // 同时保存到 IndexedDB
                        await this.saveModelToCache(modelKey, arrayBuffer);
                        return arrayBuffer;
                    }
                } catch (cacheError) {
                    console.warn('Cache API 读取失败:', cacheError);
                }
            }
            
            return null;
        } catch (error) {
            console.warn('缓存读取失败:', error);
            return null;
        }
    }
    
    async openIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('RealESRGAN_Models', 1);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('models')) {
                    db.createObjectStore('models');
                }
            };
        });
    }
    
    async saveModelToCache(modelKey, arrayBuffer) {
        try {
            console.log('[缓存] 开始保存模型到缓存:', modelKey, '大小:', (arrayBuffer.byteLength / 1024 / 1024).toFixed(2), 'MB');
            
            // 保存到 IndexedDB（主要缓存方式）
            const db = await this.openIndexedDB();
            const transaction = db.transaction(['models'], 'readwrite');
            const store = transaction.objectStore('models');
            store.put(arrayBuffer, modelKey);
            
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log('[缓存] ✓ 模型已成功保存到 IndexedDB:', modelKey);
                    resolve();
                };
                transaction.onerror = () => {
                    console.error('[缓存] ✗ IndexedDB 保存错误:', transaction.error);
                    reject(transaction.error);
                };
            });
            
            // 同时保存到 Cache API（如果可用）
            if ('caches' in window) {
                try {
                    const cache = await caches.open('realesrgan-models-v1');
                    const response = new Response(arrayBuffer);
                    await cache.put(modelKey, response);
                    console.log('模型已缓存到 Cache API:', modelKey);
                } catch (cacheError) {
                    console.warn('Cache API 保存失败（可忽略）:', cacheError);
                }
            }
        } catch (error) {
            console.error('缓存保存失败:', error);
        }
    }
    
    async downloadModelWithProgress(urls, modelName, modelKey) {
        // 先检查缓存
        const cachedModel = await this.getModelFromCache(modelKey);
        if (cachedModel) {
            this.setModelStatus('使用已缓存的模型 ✓', 'ok');
            return cachedModel;
        }
        
        let lastError = null;
        
        // 尝试所有URL
        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            try {
                console.log(`尝试从源 ${i + 1} 下载: ${url}`);
                this.setModelStatus(`从源 ${i + 1}/${urls.length} 下载 ${modelName}...`, 'warn');
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const contentLength = response.headers.get('content-length');
                if (!contentLength) {
                    // 没有内容长度，直接下载
                    const arrayBuffer = await response.arrayBuffer();
                    // 保存到缓存
                    await this.saveModelToCache(modelKey, arrayBuffer);
                    return arrayBuffer;
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
                
                console.log(`成功从源 ${i + 1} 下载模型`);
                
                // 保存到缓存
                await this.saveModelToCache(modelKey, arrayBuffer.buffer);
                
                return arrayBuffer.buffer;
                
            } catch (error) {
                console.error(`从源 ${i + 1} 下载失败:`, error);
                lastError = error;
                
                if (i < urls.length - 1) {
                    this.setModelStatus(`源 ${i + 1} 失败，尝试下一个源...`, 'warn');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        // 所有源都失败
        throw new Error(`所有下载源均失败。最后错误: ${lastError?.message || '未知错误'}`);
    }
    
    async loadModel() {
        if (this.isModelLoading && this.modelLoadingPromise) {
            return this.modelLoadingPromise;
        }
        
        // 如果已经加载了相同的模型，直接返回
        if (this.isModelLoaded && this.loadedModelKey === this.currentModel) {
            console.log('模型已加载，无需重新加载');
            return true;
        }
        
        this.isModelLoading = true;
        this.isModelLoaded = false;
        
        if (this.loadModelBtn) {
            this.loadModelBtn.disabled = true;
            this.loadModelBtn.textContent = '加载中...';
        }
        
        this.updateButtons();
        
        this.modelLoadingPromise = (async () => {
            try {
                const config = this.modelConfigs[this.currentModel];
                if (!config) {
                    throw new Error(`未找到模型配置: ${this.currentModel}`);
                }
                
                const modelKey = `model-${this.currentModel}`;
                this.setModelStatus(`准备加载 ${config.name}...`, 'warn');
                
                // 下载模型（会自动使用缓存）
                const modelArrayBuffer = await this.downloadModelWithProgress(
                    config.urls, 
                    config.name,
                    modelKey
                );
                
                this.setModelStatus(`正在初始化模型...`, 'warn');
                
                // 获取用户选择的执行模式
                const executionMode = document.querySelector('input[name="executionMode"]:checked')?.value || 'gpu';
                
                // 根据用户选择配置执行提供者
                let options;
                let useGPU = false;
                
                if (executionMode === 'gpu') {
                    // 检测WebGPU支持（官方推荐的现代GPU API）
                    const hasWebGPU = 'gpu' in navigator;
                    
                    console.log(`GPU支持检测: WebGPU=${hasWebGPU}`);
                    
                    if (hasWebGPU) {
                        console.log('使用 WebGPU (官方推荐的现代GPU加速)...');
                        useGPU = true;
                        
                        // 尝试方案：禁用图优化，这是最安全的 WebGPU 配置
                        options = {
                            executionProviders: ['webgpu'],
                            graphOptimizationLevel: 'disabled',  // 🔑 关键：完全禁用优化，避免 WebGPU 兼容性问题
                            enableMemPattern: false,
                            enableCpuMemArena: false
                        };
                        console.log('WebGPU 配置: executionProviders=webgpu, graphOptimizationLevel=disabled (无优化)');
                    } else {
                        console.warn('浏览器不支持WebGPU，使用CPU模式');
                        alert('您的浏览器不支持WebGPU GPU加速\n\n建议：\n1. 更新到最新版Chrome/Edge浏览器\n2. 或切换到CPU模式');
                        options = {
                            executionProviders: ['wasm'],
                            graphOptimizationLevel: 'all',
                            enableMemPattern: true,
                            enableCpuMemArena: true
                        };
                    }
                } else {
                    console.log('使用 CPU 模式...');
                    options = {
                        executionProviders: ['wasm'],
                        graphOptimizationLevel: 'all',
                        enableMemPattern: true,
                        enableCpuMemArena: true
                    };
                }
                
                try {
                    this.session = await ort.InferenceSession.create(modelArrayBuffer, options);
                    
                    // 检测实际使用的执行提供者
                    const usedBackend = useGPU ? 'GPU (WebGPU)' : 'CPU (WASM)';
                    console.log(`✓ 模型加载成功！执行提供者: ${usedBackend}`);
                    
                    // 设置模型状态（只在这里设置一次）
                    this.isModelLoaded = true;
                    this.loadedModelKey = this.currentModel;
                    this.currentExecutionMode = executionMode;
                    this.setModelStatus(`${config.name} 加载成功 ✓ (${usedBackend})`, 'ok');
                    
                    if (this.loadModelBtn) {
                        this.loadModelBtn.textContent = '模型已加载';
                    }
                    
                    console.log(`模型加载成功: ${config.name}`);
                    console.log('输入:', this.session.inputNames);
                    console.log('输出:', this.session.outputNames);
                } catch (error) {
                    // 如果是GPU模式失败，提示用户切换到CPU
                    if (useGPU) {
                        console.error('GPU加速失败:', error.message);
                        this.setModelStatus('GPU加速不可用，请切换到CPU模式', 'error');
                        alert('GPU加速在您的浏览器/显卡上不可用\n\n建议：\n1. 切换到"CPU模式"\n2. 或更新浏览器到最新版本\n3. 或尝试使用Chrome/Edge浏览器');
                        throw error;
                    } else {
                        throw error;
                    }
                }
                
                return true;
            } catch (error) {
                console.error('模型加载失败:', error);
                this.setModelStatus('加载失败，请重试', 'error');
                
                if (this.loadModelBtn) {
                    this.loadModelBtn.disabled = false;
                    this.loadModelBtn.textContent = '重新加载模型';
                }
                
                alert('模型加载失败:\n' + error.message + '\n\n建议:\n1. 检查网络连接\n2. 尝试切换其他模型\n3. 刷新页面重试');
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
        
        if (!comparisonSlider || !comparisonHandle || !comparisonAfter) return;
        
        let isDragging = false;
        
        const updateSlider = (e) => {
            const rect = comparisonSlider.getBoundingClientRect();
            const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
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
        
        const closeBtn = document.getElementById('closeModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.getElementById('comparisonModal').style.display = 'none';
            });
        }
        
        const prevBtn = document.getElementById('prevBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                this.showPreviousComparison();
            });
        }
        
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                this.showNextComparison();
            });
        }
        
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('comparisonModal');
            if (modal && modal.style.display === 'flex') {
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
            // Real-ESRGAN 都是4x固定的，不需要重新加载
        });
        
        this.modelSelect.addEventListener('change', (e) => {
            this.currentModel = e.target.value;
            this.markModelStale();
        });
        
        if (this.loadModelBtn) {
            this.loadModelBtn.addEventListener('click', () => {
                this.loadModel();
            });
        }
        
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
                    <span class="file-status-badge pending">未处理</span>
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
        
        const compareBtn = fileItem.querySelector('.file-preview-btn');
        compareBtn.addEventListener('click', () => {
            this.showComparison(fileData);
        });
        
        const downloadBtn = fileItem.querySelector('.file-download');
        downloadBtn.addEventListener('click', () => {
            this.downloadFile(fileData);
        });
        
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
        const statusBadge = fileItem.querySelector('.file-status-badge');
        const downloadBtn = fileItem.querySelector('.file-download');
        const resultDiv = fileItem.querySelector('.file-result');
        const compareBtn = fileItem.querySelector('.file-preview-btn');
        const previewImg = fileItem.querySelector('.file-preview');
        
        switch (fileData.status) {
            case 'pending':
                if (statusBadge) {
                    statusBadge.textContent = '未处理';
                    statusBadge.className = 'file-status-badge pending';
                }
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
                if (statusBadge) {
                    statusBadge.textContent = '处理中';
                    statusBadge.className = 'file-status-badge processing';
                }
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
                if (statusBadge) {
                    statusBadge.textContent = '已完成';
                    statusBadge.className = 'file-status-badge completed';
                }
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
                    previewImg.addEventListener('click', () => {
                        this.showComparison(fileData);
                    });
                }
                break;
                
            case 'error':
                if (statusBadge) {
                    statusBadge.textContent = '失败';
                    statusBadge.className = 'file-status-badge error';
                }
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
        if (this.isProcessing) {
            console.warn('已经在处理中，忽略重复调用');
            return;
        }
        
        if (!this.isModelLoaded) {
            alert('请先点击上方的"点击加载模型"按钮加载AI模型！');
            return;
        }
        
        // 检查输出模式
        const outputMode = document.querySelector('input[name="outputMode"]:checked')?.value || 'download';
        if (outputMode === 'folder' && !this.selectedDirHandle) {
            alert('请先选择输出文件夹！');
            return;
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
        
        console.log(`开始处理 ${pendingFiles.length} 个文件，输出模式: ${outputMode}`);
        
        this.isProcessing = true;
        this.processBtn.disabled = true;
        this.clearBtn.disabled = true;
        this.scaleSelect.disabled = true;
        this.modelSelect.disabled = true;
        if (this.loadModelBtn) this.loadModelBtn.disabled = true;
        
        // 确保进度条显示
        if (this.progressContainer) {
            this.progressContainer.style.display = 'block';
        }
        
        let processed = 0;
        const total = pendingFiles.length;
        const zipFiles = []; // 用于ZIP模式
        
        for (const fileData of pendingFiles) {
            fileData.status = 'processing';
            this.updateFileItem(fileData);
            
            this.updateProgress(`准备处理 ${processed + 1}/${total}: ${fileData.name}`, (processed / total) * 100);
            
            // 让出主线程
            await new Promise(resolve => setTimeout(resolve, 50));
            
            try {
                await this.processFile(fileData, processed, total);
                fileData.status = 'completed';
                console.log(`✓ 文件 ${processed + 1}/${total} 处理成功:`, fileData.name);
                
                // 根据输出模式处理
                if (outputMode === 'download') {
                    // 立即下载
                    this.downloadFile(fileData);
                } else if (outputMode === 'zip') {
                    // 添加到ZIP列表
                    const blob = await this.getFileBlob(fileData);
                    const fileName = this.getOutputFileName(fileData);
                    zipFiles.push({ blob, name: fileName });
                } else if (outputMode === 'folder') {
                    // 保存到文件夹
                    await this.saveToFolder(fileData);
                }
                
            } catch (error) {
                console.error(`✗ 文件 ${processed + 1}/${total} 处理失败:`, fileData.name, error);
                fileData.status = 'error';
            }
            
            this.updateFileItem(fileData);
            processed++;
            
            this.updateProgress(`已完成 ${processed}/${total}`, (processed / total) * 100);
            
            // 让出主线程
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // 如果是ZIP模式，创建并下载ZIP
        if (outputMode === 'zip' && zipFiles.length > 0) {
            try {
                this.updateProgress('正在创建ZIP文件...', 100);
                // 动态加载JSZip
                if (typeof JSZip === 'undefined') {
                    await this.loadJSZip();
                }
                const zip = new JSZip();
                zipFiles.forEach(file => {
                    zip.file(file.name, file.blob);
                });
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(zipBlob);
                link.download = `upscaled_images_${Date.now()}.zip`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(link.href);
            } catch (error) {
                console.error('ZIP创建失败:', error);
                alert('创建ZIP文件时出错: ' + error.message);
            }
        }
        
        this.isProcessing = false;
        this.processBtn.disabled = false;
        this.clearBtn.disabled = false;
        this.scaleSelect.disabled = false;
        this.modelSelect.disabled = false;
        if (this.loadModelBtn && this.isModelLoaded) this.loadModelBtn.disabled = true;
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
        try {
            const config = this.modelConfigs[this.currentModel];
            const scale = config.scale;
            
            console.log(`开始处理文件: ${fileData.name}`);
            console.log(`模型: ${config.name}, 放大倍数: ${scale}x`);
            
            // 获取原始图像
            const img = fileData.originalImage;
            
            // 关键修复：确保图像完全加载
            if (!img.complete || img.naturalWidth === 0) {
                console.warn('图像未完全加载，等待加载完成...');
                await new Promise((resolve, reject) => {
                    if (img.complete && img.naturalWidth > 0) {
                        resolve();
                    } else {
                        img.onload = () => resolve();
                        img.onerror = () => reject(new Error('图像加载失败'));
                        // 超时保护
                        setTimeout(() => reject(new Error('图像加载超时')), 5000);
                    }
                });
            }
            
            console.log(`原始尺寸: ${img.width}x${img.height}`);
            console.log(`naturalWidth: ${img.naturalWidth}, complete: ${img.complete}`);
            console.log(`图像src类型: ${img.src.substring(0, 30)}...`);
            
            // 方案1：尝试使用 createImageBitmap（更可靠）
            let imageData;
            try {
                console.log('尝试使用 createImageBitmap 创建位图...');
                const bitmap = await createImageBitmap(fileData.file);
                console.log(`位图创建成功: ${bitmap.width}x${bitmap.height}`);
                
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0);
                imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
                bitmap.close(); // 释放位图资源
                
                // 调试：检查位图数据
                let bitmapSum = 0;
                const checkLen = Math.min(1000, imageData.data.length);
                for (let i = 0; i < checkLen; i++) {
                    bitmapSum += imageData.data[i];
                }
                console.log(`✓ createImageBitmap数据: ${imageData.width}x${imageData.height}, 前${checkLen}字节平均=${(bitmapSum/checkLen).toFixed(2)}, 样本=[${Array.from(imageData.data.slice(100,110)).join(',')}]`);
            } catch (bitmapError) {
                console.warn('createImageBitmap 失败，使用传统方案:', bitmapError);
                
                // 方案2：传统 Image + decode 方案
                // 等待图像完全解码（确保像素数据可用）
                try {
                    await img.decode();
                    console.log('图像解码完成');
                } catch (err) {
                    console.warn('图像decode失败，尝试直接绘制:', err);
                }
                
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                
                // 确保使用2D渲染上下文的默认设置
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0);
                
                imageData = ctx.getImageData(0, 0, img.width, img.height);
                console.log('使用传统 Image 方案获取图像数据');
            }
            
            console.log('开始分块处理...');
            const startTime = performance.now();
            
            // 使用分块处理支持任意尺寸，带进度回调
            const upscaledImageData = await this.processImageWithTiles(
                imageData, 
                scale, 
                (tileProgress, tileTotal) => {
                    const fileProgress = ((currentIndex + tileProgress / tileTotal) / total) * 100;
                    this.updateProgress(
                        `处理中 ${currentIndex + 1}/${total}: ${fileData.name} - Tile ${tileProgress}/${tileTotal}`,
                        fileProgress
                    );
                }
            );
            
            const inferenceTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`AI推理完成，耗时: ${inferenceTime}秒`);
            
            // 创建输出画布
            const upscaledCanvas = document.createElement('canvas');
            upscaledCanvas.width = upscaledImageData.width;
            upscaledCanvas.height = upscaledImageData.height;
            const upscaledCtx = upscaledCanvas.getContext('2d');
            upscaledCtx.putImageData(upscaledImageData, 0, 0);
            
            console.log(`处理完成，输出尺寸: ${upscaledCanvas.width}x${upscaledCanvas.height}`);
            
            // 转换为图像
            const upscaledSrc = upscaledCanvas.toDataURL('image/png');
            
            return new Promise((resolve, reject) => {
                const upscaledImg = new Image();
                upscaledImg.onload = () => {
                    fileData.upscaledImage = upscaledImg;
                    fileData.upscaledSrc = upscaledSrc;
                    fileData.upscaledBlob = null;
                    console.log('✓ 文件处理成功');
                    resolve();
                };
                upscaledImg.onerror = (err) => {
                    console.error('图像加载失败:', err);
                    reject(new Error('生成的图像无法加载'));
                };
                upscaledImg.src = upscaledSrc;
            });
        } catch (error) {
            console.error('处理文件时出错:', error);
            console.error('错误详情:', error.message, error.stack);
            throw error;
        }
    }
    
    async processImageWithTiles(imageData, scale, progressCallback = null) {
        const tileSize = 128;  // 模型要求的输入尺寸
        const tilePadding = 10;  // 边缘重叠，避免接缝
        
        const { width, height } = imageData;
        const outputWidth = width * scale;
        const outputHeight = height * scale;
        
        // 创建输出 ImageData
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = outputWidth;
        outputCanvas.height = outputHeight;
        const outputCtx = outputCanvas.getContext('2d');
        const outputImageData = outputCtx.createImageData(outputWidth, outputHeight);
        
        // 如果图像小于或等于 tile 尺寸，直接处理
        if (width <= tileSize && height <= tileSize) {
            console.log('图像尺寸较小，进行填充处理');
            
            if (progressCallback) progressCallback(0, 1);
            
            const paddedImageData = this.padImageData(imageData, tileSize, tileSize);
            
            // 调试：检查填充后的数据（多个采样点）
            const samples = [0, 1000, 5000, 10000, 20000];
            const sampleResults = samples.map(offset => {
                const checkRange = Math.min(100, paddedImageData.data.length - offset);
                let sum = 0;
                for (let i = 0; i < checkRange; i++) {
                    sum += paddedImageData.data[offset + i];
                }
                return `offset${offset}=${(sum/checkRange).toFixed(1)}`;
            });
            console.log(`✓ 填充后数据: ${paddedImageData.width}x${paddedImageData.height}, ${sampleResults.join(', ')}`);
            
            const inputTensor = this.preprocessImage(paddedImageData);
            
            // 🔍 验证输入tensor - 注意：新创建的tensor，data属性可能不可访问
            // 应该在 preprocessImage 内部验证数据
            console.log(`✓ 输入Tensor: dims=${inputTensor.dims}, type=${inputTensor.type}`);
            
            const feeds = {};
            feeds[this.session.inputNames[0]] = inputTensor;
            
            console.log(`✓ 开始模型推理: ${inputTensor.dims} -> 期望输出 [1,3,${tileSize*scale},${tileSize*scale}]`);
            console.log(`✓ 推理配置: executionProvider=${this.currentExecutionMode}`);
            
            const results = await this.session.run(feeds);
            const outputTensor = results[this.session.outputNames[0]];
            console.log(`✓ 模型推理完成: ${outputTensor.dims}, location=${outputTensor.location}, type=${outputTensor.type}`);
            
            // 🔍 调试：立即检查输出tensor的数据
            try {
                let quickCheck;
                if (typeof outputTensor.getData === 'function') {
                    quickCheck = await outputTensor.getData();
                } else {
                    quickCheck = outputTensor.data;
                }
                let quickSum = 0;
                for (let i = 0; i < Math.min(100, quickCheck.length); i++) {
                    quickSum += Math.abs(quickCheck[i]);
                }
                console.log(`🔍 推理后立即检查: 前100个值的绝对值和=${quickSum.toFixed(4)}`);
                if (quickSum < 0.0001) {
                    console.error('❌ 模型推理输出全为0！这是模型或 WebGPU 配置问题');
                }
            } catch (e) {
                console.warn('快速检查失败:', e.message);
            }
            
            // 让出主线程，避免UI卡死
            await new Promise(resolve => setTimeout(resolve, 0));
            
            // 裁剪回原始比例
            const fullOutput = await this.postprocessImage(outputTensor, tileSize * scale, tileSize * scale);
            const fullOutputCtx = fullOutput.getContext('2d');
            const fullOutputData = fullOutputCtx.getImageData(0, 0, tileSize * scale, tileSize * scale);
            
            // 复制有效区域
            for (let y = 0; y < outputHeight; y++) {
                for (let x = 0; x < outputWidth; x++) {
                    const srcIdx = (y * tileSize * scale + x) * 4;
                    const dstIdx = (y * outputWidth + x) * 4;
                    outputImageData.data[dstIdx] = fullOutputData.data[srcIdx];
                    outputImageData.data[dstIdx + 1] = fullOutputData.data[srcIdx + 1];
                    outputImageData.data[dstIdx + 2] = fullOutputData.data[srcIdx + 2];
                    outputImageData.data[dstIdx + 3] = fullOutputData.data[srcIdx + 3];
                }
            }
            
            if (progressCallback) progressCallback(1, 1);
            
            return outputImageData;
        }
        
        // 计算需要多少个 tile
        const tilesX = Math.ceil(width / tileSize);
        const tilesY = Math.ceil(height / tileSize);
        const totalTiles = tilesX * tilesY;
        
        console.log(`图像将被分为 ${tilesX}x${tilesY} = ${totalTiles} 块处理`);
        
        let processedTiles = 0;
        
        // 逐块处理
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                // 计算当前 tile 的位置
                const x = tx * tileSize;
                const y = ty * tileSize;
                const w = Math.min(tileSize, width - x);
                const h = Math.min(tileSize, height - y);
                
                // 提取 tile
                const tileCanvas = document.createElement('canvas');
                tileCanvas.width = w;
                tileCanvas.height = h;
                const tileCtx = tileCanvas.getContext('2d');
                
                const tileImageData = tileCtx.createImageData(w, h);
                for (let py = 0; py < h; py++) {
                    for (let px = 0; px < w; px++) {
                        const srcIdx = ((y + py) * width + (x + px)) * 4;
                        const dstIdx = (py * w + px) * 4;
                        tileImageData.data[dstIdx] = imageData.data[srcIdx];
                        tileImageData.data[dstIdx + 1] = imageData.data[srcIdx + 1];
                        tileImageData.data[dstIdx + 2] = imageData.data[srcIdx + 2];
                        tileImageData.data[dstIdx + 3] = imageData.data[srcIdx + 3];
                    }
                }
                
                // 如果 tile 小于标准尺寸，进行填充
                let processImageData = tileImageData;
                if (w < tileSize || h < tileSize) {
                    processImageData = this.padImageData(tileImageData, tileSize, tileSize);
                }
                
                // 处理 tile
                const inputTensor = this.preprocessImage(processImageData);
                
                const feeds = {};
                feeds[this.session.inputNames[0]] = inputTensor;
                
                const results = await this.session.run(feeds);
                const outputTensor = results[this.session.outputNames[0]];
                
                // 让出主线程，避免UI卡死 - 使用多种方式确保UI响应
                await new Promise(resolve => {
                    if ('requestIdleCallback' in window) {
                        requestIdleCallback(resolve, { timeout: 50 });
                    } else {
                        setTimeout(resolve, 16); // 至少一帧的时间
                    }
                });
                
                // 后处理 - 必须 await 以处理 WebGPU tensor
                const upscaledTileCanvas = await this.postprocessImage(outputTensor, tileSize * scale, tileSize * scale);
                const upscaledTileCtx = upscaledTileCanvas.getContext('2d');
                const upscaledTileData = upscaledTileCtx.getImageData(0, 0, tileSize * scale, tileSize * scale);
                
                // 再次让出主线程，确保UI流畅
                await new Promise(resolve => setTimeout(resolve, 5));
                
                // 将结果复制到输出 ImageData
                const outputW = w * scale;
                const outputH = h * scale;
                const outputX = x * scale;
                const outputY = y * scale;
                
                for (let py = 0; py < outputH; py++) {
                    for (let px = 0; px < outputW; px++) {
                        const srcIdx = (py * tileSize * scale + px) * 4;
                        const dstIdx = ((outputY + py) * outputWidth + (outputX + px)) * 4;
                        outputImageData.data[dstIdx] = upscaledTileData.data[srcIdx];
                        outputImageData.data[dstIdx + 1] = upscaledTileData.data[srcIdx + 1];
                        outputImageData.data[dstIdx + 2] = upscaledTileData.data[srcIdx + 2];
                        outputImageData.data[dstIdx + 3] = upscaledTileData.data[srcIdx + 3];
                    }
                }
                
                processedTiles++;
                console.log(`处理进度: ${processedTiles}/${totalTiles} tiles`);
                
                // 更新进度条
                if (progressCallback) {
                    progressCallback(processedTiles, totalTiles);
                }
            }
        }
        
        return outputImageData;
    }
    
    padImageData(imageData, targetWidth, targetHeight) {
        const { width, height } = imageData;
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        
        // 用黑色填充
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        
        // 创建临时画布放置原始图像
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // 将原始图像绘制到填充后的画布
        ctx.drawImage(tempCanvas, 0, 0);
        
        return ctx.getImageData(0, 0, targetWidth, targetHeight);
    }
    
    preprocessImage(imageData) {
        const { width, height, data } = imageData;
        const channels = 3;
        
        // 调试：检查输入RGBA数据（多个采样点）
        const rgbaSamples = [];
        for (let i = 0; i < 5; i++) {
            const offset = Math.floor(data.length / 5) * i;
            rgbaSamples.push(`[${data[offset]},${data[offset+1]},${data[offset+2]},${data[offset+3]}]`);
        }
        console.log(`✓ preprocessImage输入RGBA样本(5点): ${rgbaSamples.join(' ')}`);
        
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
        
        // 调试：检查输出float32数据（从中心区域采样，避免黑色边缘）
        const float32Samples = [];
        const centerOffset = Math.floor(height * width / 2); // 从中心开始采样
        for (let c = 0; c < 3; c++) {
            const channelOffset = c * height * width;
            let sum = 0, count = 0;
            for (let i = 0; i < Math.min(100, height * width / 2); i++) {
                sum += inputArray[channelOffset + centerOffset + i];
                count++;
            }
            float32Samples.push(`Ch${c}=${(sum/count).toFixed(3)}`);
        }
        console.log(`✓ preprocessImage输出Float32(中心区100采样): ${float32Samples.join(', ')}`);
        
        // 最终验证：确保 inputArray 有数据
        let finalSum = 0;
        for (let i = 0; i < Math.min(1000, inputArray.length); i++) {
            finalSum += Math.abs(inputArray[i]);
        }
        console.log(`✓ preprocessImage最终验证: inputArray前1000个值的绝对值和=${finalSum.toFixed(4)}`);
        
        if (finalSum < 0.0001) {
            console.error('❌ preprocessImage生成的Float32Array全为0！');
            console.error('调试信息:', { width, height, channels, arrayLength: inputArray.length });
            throw new Error('preprocessImage输出数据异常');
        }
        
        return new ort.Tensor('float32', inputArray, [1, channels, height, width]);
    }
    
    async postprocessImage(tensor, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        
        // 🔑 关键：根据 tensor.location 判断数据位置并使用正确的访问方式
        let data;
        
        // 调试：输出 tensor 的详细信息
        console.log('Tensor 类型信息:', {
            type: tensor.type,
            dims: tensor.dims,
            size: tensor.size,
            location: tensor.location,  // 关键属性！
            hasGetData: typeof tensor.getData === 'function',
            hasData: 'data' in tensor
        });
        
        try {
            // 🔑 关键修复：对于 WebGPU tensor，无论 location 是什么，都优先使用 getData()
            // 因为即使 location='cpu'，实际数据可能还在 GPU buffer 中
            
            if (typeof tensor.getData === 'function') {
                console.log('✓ 检测到 getData() 方法，异步获取数据...');
                data = await tensor.getData();
                console.log('✓ getData() 完成，数据量:', data.length);
                
                // 验证数据是否有效
                let sum = 0;
                for (let i = 0; i < Math.min(100, data.length); i++) {
                    sum += Math.abs(data[i]);
                }
                console.log(`✓ 数据有效性检查: 前100个值的绝对值和=${sum.toFixed(4)}`);
                
                if (sum < 0.0001) {
                    console.error('❌ 错误：getData() 返回的数据全为0！');
                    console.error('Tensor 信息:', {
                        type: tensor.type,
                        dims: tensor.dims,
                        size: tensor.size,
                        location: tensor.location
                    });
                    throw new Error('模型输出数据全为0，可能是 WebGPU 配置问题');
                }
                
                // 打印数据样本
                const sample = Array.from(data.slice(0, 10));
                console.log('✓ 数据样本(前10):', sample);
            }
            // 回退方案：直接访问 data（纯 CPU 模式）
            else if (tensor.data) {
                console.log('⚠️ 没有 getData() 方法，直接访问 tensor.data（CPU模式）');
                data = tensor.data;
                
                // 验证数据
                let sum = 0;
                for (let i = 0; i < Math.min(100, data.length); i++) {
                    sum += Math.abs(data[i]);
                }
                console.log(`数据检查: 前100个值的绝对值和=${sum.toFixed(4)}`);
                
                if (sum < 0.0001) {
                    console.error('❌ tensor.data 数据全为0！');
                    throw new Error('模型输出数据全为0');
                }
            }
            // 方案3: location 未定义或其他情况
            else {
                console.warn(`⚠️ tensor.location='${tensor.location}'，尝试多种方式`);
                if (typeof tensor.getData === 'function') {
                    console.log('尝试 getData()...');
                    data = await tensor.getData();
                } else if (tensor.data) {
                    console.log('尝试 tensor.data...');
                    data = tensor.data;
                } else {
                    throw new Error('无法访问 tensor 数据');
                }
            }
        } catch (e) {
            console.error('获取 tensor 数据失败:', e);
            throw new Error('无法读取 tensor 数据: ' + e.message);
        }
        
        // 调试：检查输出tensor数据范围（每个通道）
        const channelStats = [];
        for (let c = 0; c < 3; c++) {
            const channelOffset = c * height * width;
            let sum = 0, count = 0;
            for (let i = 0; i < Math.min(100, height * width); i++) {
                sum += data[channelOffset + i];
                count++;
            }
            channelStats.push(`Ch${c}=${(sum/count).toFixed(3)}`);
        }
        console.log(`✓ postprocessImage输入Float32(前100采样): ${channelStats.join(', ')}`);
        
        if (!data || data.length === 0) {
            console.error('tensor数据为空！');
            return canvas;
        }
        
        const channels = 3;
        
        // 从 CHW 格式转换为 RGBA
        for (let h = 0; h < height; h++) {
            for (let w = 0; w < width; w++) {
                const pixelIndex = (h * width + w) * 4;
                for (let c = 0; c < channels; c++) {
                    const tensorIndex = c * height * width + h * width + w;
                    // 反归一化并裁剪到 [0, 255]
                    const value = data[tensorIndex] * 255;
                    imageData.data[pixelIndex + c] = Math.min(255, Math.max(0, Math.round(value)));
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
    
    getOutputFileName(fileData) {
        const namingMode = document.querySelector('input[name="namingMode"]:checked')?.value || 'suffix';
        const nameWithoutExt = fileData.name.replace(/\.[^/.]+$/, '');
        const ext = 'png'; // 始终输出PNG
        
        if (namingMode === 'scale') {
            const scale = parseInt(this.scaleSelect.value, 10);
            return `${nameWithoutExt}_${scale}x.${ext}`;
        } else {
            const suffix = this.namingSuffix?.value || '_upscaled';
            return `${nameWithoutExt}${suffix}.${ext}`;
        }
    }
    
    async getFileBlob(fileData) {
        if (!fileData.upscaledSrc) return null;
        const response = await fetch(fileData.upscaledSrc);
        return await response.blob();
    }
    
    async saveToFolder(fileData) {
        try {
            const fileName = this.getOutputFileName(fileData);
            const fileHandle = await this.selectedDirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            const blob = await this.getFileBlob(fileData);
            await writable.write(blob);
            await writable.close();
            console.log(`文件已保存到文件夹: ${fileName}`);
        } catch (error) {
            console.error('保存到文件夹失败:', error);
            throw error;
        }
    }
    
    async loadJSZip() {
        return new Promise((resolve, reject) => {
            if (typeof JSZip !== 'undefined') {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    
    downloadFile(fileData) {
        if (!fileData.upscaledImage || !fileData.upscaledSrc) return;
        
        const link = document.createElement('a');
        link.href = fileData.upscaledSrc;
        link.download = this.getOutputFileName(fileData);
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
        completedFiles.forEach((fileData) => {
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
        
        const canProcess = (hasPendingFiles || hasCompletedFiles) && !this.isProcessing && !this.isModelLoading && this.isModelLoaded;
        this.processBtn.disabled = !canProcess;
        
        if (!this.isModelLoaded) {
            this.processBtn.textContent = '请先加载模型';
        } else if (!hasPendingFiles && hasCompletedFiles) {
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
        if (this.progressContainer) {
            this.progressContainer.style.display = 'block';
        }
        if (this.progressText) {
            this.progressText.textContent = text;
        }
        if (this.progressFill) {
            this.progressFill.style.width = Math.min(100, Math.max(0, percent)) + '%';
        }
        console.log('[进度]', text, percent.toFixed(1) + '%');
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
