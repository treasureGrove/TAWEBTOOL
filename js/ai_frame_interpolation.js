class VideoFrameInterpolation {
    constructor() {
        this.interpolationSession = null;  // RIFE模型
        this.upscaleSession = null;        // Real-ESRGAN模型
        this.isModelLoaded = false;
        this.isUpscaleModelLoaded = false;
        this.currentModel = 'rife-v4.9';
        this.loadedModelKey = null;
        this.currentExecutionMode = null;
        this.fileList = [];
        this.isProcessing = false;
        this.isModelLoading = false;
        this.modelLoadingPromise = null;
        this.currentComparisonFile = null;
        
        // RIFE ONNX 模型配置 - 使用 HuggingFace 社区转换的模型
        this.modelConfigs = {
            'rife-v4.6': {
                // v4.6 通常更稳定，果冻效应较少
                urls: [
                    'https://huggingface.co/AlpinDale/VFI-Utils/resolve/main/rife46.onnx',
                    'https://hf-mirror.com/AlpinDale/VFI-Utils/resolve/main/rife46.onnx'
                ],
                name: 'RIFE v4.6 (稳定推荐)',
                description: '更稳定的版本，果冻效应更少',
                size: '28 MB',
                type: 'interpolation'
            },
            'rife-v4.18': {
                // 🆕 更新版本，质量提升
                urls: [
                    'https://huggingface.co/Kijai/RIFE_ONNX/resolve/main/rife_v4.18.onnx',
                    'https://hf-mirror.com/Kijai/RIFE_ONNX/resolve/main/rife_v4.18.onnx'
                ],
                name: '🌟 RIFE v4.18 (高质量)',
                description: '2024年新版，质量明显提升，运动补偿更准确',
                size: '32 MB',
                type: 'interpolation'
            },
            'rife-v4.15-lite': {
                // 轻量级高速版本
                urls: [
                    'https://huggingface.co/Kijai/RIFE_ONNX/resolve/main/rife_v4.15_lite.onnx',
                    'https://hf-mirror.com/Kijai/RIFE_ONNX/resolve/main/rife_v4.15_lite.onnx'
                ],
                name: 'RIFE v4.15 Lite (快速)',
                description: '轻量级版本，速度快2倍，质量略降',
                size: '15 MB',
                type: 'interpolation'
            },
            'rife-v4.9': {
                // yuvraj108c 在 HuggingFace 上传的 RIFE ONNX 模型
                urls: [
                    'https://huggingface.co/yuvraj108c/rife-onnx/resolve/main/rife49_ensemble_True_scale_1_sim.onnx',
                    'https://hf-mirror.com/yuvraj108c/rife-onnx/resolve/main/rife49_ensemble_True_scale_1_sim.onnx'
                ],
                name: 'RIFE v4.9',
                description: '经典版本，兼容性好',
                size: '21.5 MB',
                type: 'interpolation'
            },
            'rife-v4.15': {
                urls: [
                    'https://huggingface.co/Kijai/RIFE_ONNX/resolve/main/rife_v4.15.onnx',
                    'https://hf-mirror.com/Kijai/RIFE_ONNX/resolve/main/rife_v4.15.onnx'
                ],
                name: 'RIFE v4.15',
                description: '动画场景优化版',
                size: '29 MB',
                type: 'interpolation'
            },
            'realesrgan-x4plus': {
                // Real-ESRGAN 超分辨率模型
                urls: [
                    'https://huggingface.co/bukuroo/RealESRGAN-ONNX/resolve/main/real-esrgan-x4plus-128.onnx',
                    'https://hf-mirror.com/bukuroo/RealESRGAN-ONNX/resolve/main/real-esrgan-x4plus-128.onnx'
                ],
                name: 'Real-ESRGAN x4plus (通用)',
                description: '视频超分辨率模型，通用场景',
                size: '67.2 MB',
                type: 'upscale',
                scale: 4
            },
            'realesrgan-anime': {
                // 🆕 动画专用超分模型
                urls: [
                    'https://huggingface.co/Kijai/RealESRGAN_ONNX/resolve/main/RealESRGAN_x4plus_anime_6B.onnx',
                    'https://hf-mirror.com/Kijai/RealESRGAN_ONNX/resolve/main/RealESRGAN_x4plus_anime_6B.onnx'
                ],
                name: '🎨 Real-ESRGAN Anime (动画专用)',
                description: '专为动画/卡通优化，线条更锐利',
                size: '17.9 MB',
                type: 'upscale',
                scale: 4
            },
            'custom-model': {
                urls: [],
                name: '自定义ONNX模型',
                description: '用户上传的RIFE ONNX模型',
                size: '未知',
                scale: 2
            }
        };
        
        this.init();
    }
    
    async init() {
        // 获取DOM元素
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.frameMultiplierSelect = document.getElementById('frameMultiplierSelect');
        this.modelSelect = document.getElementById('modelSelect');
        this.modelStatus = document.getElementById('modelStatus');
        this.processBtn = document.getElementById('processBtn');
        
        // 新的布局元素
        this.uploadContent = document.getElementById('uploadContent');
        this.singleVideoContainer = document.getElementById('singleVideoContainer');
        this.compareContainer = document.getElementById('compareContainer');
        this.inputVideoPreview = document.getElementById('inputVideoPreview');
        this.videoInfoDisplay = document.getElementById('videoInfoDisplay');
        this.compareOriginalMain = document.getElementById('compareOriginalMain');
        this.compareProcessedMain = document.getElementById('compareProcessedMain');
        this.downloadBtnMain = document.getElementById('downloadBtnMain');
        this.reuploadBtn = document.getElementById('reuploadBtn');
        this.reuploadBtn2 = document.getElementById('reuploadBtn2');
        this.reprocessBtn = document.getElementById('reprocessBtn');
        this.processingStats = document.getElementById('processingStats');
        this.statsContent = document.getElementById('statsContent');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.loadModelBtn = document.getElementById('loadModelBtn');
        this.folderPathGroup = document.getElementById('folderPathGroup');
        this.folderPath = document.getElementById('folderPath');
        this.selectFolderBtn = document.getElementById('selectFolderBtn');
        this.customModelInput = document.getElementById('customModelInput');
        this.uploadModelBtn = document.getElementById('uploadModelBtn');
        
        this.selectedDirHandle = null;
        this.customModelFile = null;
        
        this.bindEvents();
        this.updateButtons();
        this.initOutputModeListeners();
        this.initMotionThresholdSlider();
        this.initMotionThresholdSlider();
        
        // 检查mp4-muxer加载状态
        this.checkMp4MuxerLoaded();
        
        // 初始化 ONNX Runtime
        if (typeof ort !== 'undefined') {
            // WASM 配置（用于CPU模式）
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.simd = true;
            ort.env.wasm.proxy = false;
            ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/';
            
            console.log('ONNX Runtime 配置完成');
            
            // 自动检测并加载缓存的模型
            this.autoLoadCachedModel();
        } else {
            this.setModelStatus('ONNX Runtime 未加载', 'error');
            console.error('ONNX Runtime not found');
        }
    }
    
    bindEvents() {
        // 上传区域事件
        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', () => this.fileInput?.click());
            this.uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.uploadArea.classList.add('dragover');
            });
            this.uploadArea.addEventListener('dragleave', () => {
                this.uploadArea.classList.remove('dragover');
            });
            this.uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                this.uploadArea.classList.remove('dragover');
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
                if (files.length > 0) {
                    this.addFiles(files);
                }
            });
        }
        
        // 监听帧率选择变化
        if (this.frameMultiplierSelect) {
            this.frameMultiplierSelect.addEventListener('change', () => {
                this.updateTargetFPSDisplay();
            });
        }
        
        // 文件输入
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                this.addFiles(files);
                e.target.value = '';
            });
        }
        
        // 重新上传按钮
        if (this.reuploadBtn) {
            this.reuploadBtn.addEventListener('click', () => {
                this.fileInput?.click();
            });
        }
        
        // 模型选择
        if (this.modelSelect) {
            this.modelSelect.addEventListener('change', () => {
                this.currentModel = this.modelSelect.value;
                this.markModelStale();
            });
        }
        
        // 执行模式切换
        document.querySelectorAll('input[name="executionMode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.markModelStale();
            });
        });
        
        // 加载模型按钮
        if (this.loadModelBtn) {
            this.loadModelBtn.addEventListener('click', async () => {
                await this.loadModel();
            });
        }
        
        // 处理按钮
        if (this.processBtn) {
            this.processBtn.addEventListener('click', () => this.processAll());
        }
        
        // 清空按钮
        if (this.clearBtn) {
            this.clearBtn.addEventListener('click', () => {
                if (confirm('确定要清空所有文件吗？')) {
                    this.fileList = [];
                    this.renderFileList();
                    this.updateButtons();
                }
            });
        }
        
        // 自定义模型上传
        if (this.uploadModelBtn) {
            this.uploadModelBtn.addEventListener('click', () => {
                this.customModelInput?.click();
            });
        }
        
        if (this.customModelInput) {
            this.customModelInput.addEventListener('change', async (e) => {
                const file = e.target.files?.[0];
                if (file && file.name.endsWith('.onnx')) {
                    this.customModelFile = file;
                    this.setModelStatus(`已选择模型: ${file.name}`, 'ok');
                    if (this.loadModelBtn) {
                        this.loadModelBtn.disabled = false;
                        this.loadModelBtn.textContent = '加载自定义模型';
                    }
                } else {
                    alert('请选择有效的 .onnx 模型文件');
                }
            });
        }
        
        // 🎨 Topaz风格增强滑块初始化
        this.initEnhancementSliders();
        
        // 模型选择变化
        if (this.modelSelect) {
            this.modelSelect.addEventListener('change', () => {
                if (this.modelSelect.value === 'custom-model') {
                    this.uploadModelBtn.style.display = 'block';
                } else {
                    this.uploadModelBtn.style.display = 'none';
                }
            });
        }
    }
    
    checkMp4MuxerLoaded() {
        // 检查mp4-muxer是否加载
        const checkInterval = setInterval(() => {
            if (typeof Mp4Muxer !== 'undefined') {
                console.log('✅ mp4-muxer库加载成功');
                clearInterval(checkInterval);
            }
        }, 100);
        
        // 5秒后超时
        setTimeout(() => {
            clearInterval(checkInterval);
            if (typeof Mp4Muxer === 'undefined') {
                console.warn('⚠️ mp4-muxer库加载超时，可能被CDN封锁或网络问题');
                console.warn('请确保能访问: https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.1/dist/mp4-muxer.umd.js');
            }
        }, 5000);
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
        document.querySelectorAll('input[name="outputMode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (this.folderPathGroup) {
                    this.folderPathGroup.style.display = e.target.value === 'folder' ? 'block' : 'none';
                }
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
    
    initMotionThresholdSlider() {
        const slider = document.getElementById('motionThreshold');
        const valueDisplay = document.getElementById('thresholdValue');
        
        if (slider && valueDisplay) {
            // 更新显示值
            const updateDisplay = () => {
                const value = parseFloat(slider.value);
                valueDisplay.textContent = (value * 100).toFixed(1) + '%';
            };
            
            slider.addEventListener('input', updateDisplay);
            updateDisplay(); // 初始化显示
        }
    }
    
    initEnhancementSliders() {
        // 🎨 初始化后处理增强滑块
        const sliders = [
            { id: 'sharpenStrength', valueId: 'sharpenValue' },
            { id: 'denoiseStrength', valueId: 'denoiseValue' },
            { id: 'contrastAdjust', valueId: 'contrastValue' },
            { id: 'filmGrain', valueId: 'grainValue' }
        ];
        
        sliders.forEach(({ id, valueId }) => {
            const slider = document.getElementById(id);
            const valueDisplay = document.getElementById(valueId);
            
            if (slider && valueDisplay) {
                const updateDisplay = () => {
                    const value = parseInt(slider.value);
                    valueDisplay.textContent = value;
                    // 添加视觉反馈
                    slider.style.setProperty('--value', value);
                };
                
                // 同时监听input和change事件，确保滑块响应
                slider.addEventListener('input', updateDisplay);
                slider.addEventListener('change', updateDisplay);
                updateDisplay();
            }
        });
    }
    
    markModelStale() {
        this.isModelLoaded = false;
            this.interpolationSession = null;
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
            console.log('[缓存] 检查缓存:', modelKey);
            const db = await this.openIndexedDB();
            const transaction = db.transaction(['models'], 'readonly');
            const store = transaction.objectStore('models');
            const request = store.get(modelKey);
            
            const arrayBuffer = await new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (arrayBuffer) {
                console.log('[缓存] 从缓存加载模型成功');
                return arrayBuffer;
            }
            return null;
        } catch (error) {
            console.warn('缓存读取失败:', error);
            return null;
        }
    }
    
    async openIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('RIFE_Models', 1);
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
            const db = await this.openIndexedDB();
            const transaction = db.transaction(['models'], 'readwrite');
            const store = transaction.objectStore('models');
            store.put(arrayBuffer, modelKey);
            
            await new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log('[缓存] 模型已保存到缓存');
                    resolve();
                };
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            console.error('缓存保存失败:', error);
        }
    }
    
    async loadModel() {
        if (this.isModelLoading) {
            console.log('模型正在加载中，请等待...');
            return this.modelLoadingPromise;
        }
        
        this.isModelLoading = true;
        this.loadModelBtn.disabled = true;
        this.loadModelBtn.textContent = '加载中...';
        
        this.modelLoadingPromise = this._loadModelInternal();
        
        try {
            await this.modelLoadingPromise;
        } finally {
            this.isModelLoading = false;
        }
        
        return this.modelLoadingPromise;
    }
    
    async _loadModelInternal() {
        try {
            const executionMode = document.querySelector('input[name="executionMode"]:checked')?.value || 'gpu';
            const modelKey = `model-${this.currentModel}`;
            
            if (this.loadedModelKey === modelKey && this.currentExecutionMode === executionMode) {
                console.log('模型已加载且配置相同，跳过重复加载');
                this.setModelStatus('模型已加载 ✓', 'ok');
                this.loadModelBtn.textContent = '模型已加载';
                return;
            }
            
            this.setModelStatus('正在下载模型...', 'warn');
            
            const config = this.modelConfigs[this.currentModel];
            const modelBuffer = await this.downloadModelWithProgress(config.urls, config.name, modelKey);
            
            this.setModelStatus('正在初始化模型...', 'warn');
            
            const providers = executionMode === 'gpu' ? ['webgpu'] : ['wasm'];
            
            this.interpolationSession = await ort.InferenceSession.create(modelBuffer, {
                executionProviders: providers
            });
            
            console.log('模型加载成功，使用:', providers[0]);
            console.log('模型输入名称:', this.interpolationSession.inputNames);
            console.log('模型输出名称:', this.interpolationSession.outputNames);
            console.log('输入数量:', this.interpolationSession.inputNames.length);
            
            // 检测模型是否支持timestep参数
            this.modelSupportsTimestep = this.interpolationSession.inputNames.length > 2;
            console.log('模型支持timestep:', this.modelSupportsTimestep);
            
            // 打印模型输入输出形状信息
            try {
                const inputMeta = this.interpolationSession.inputNames.map(name => {
                    return { name, meta: 'input' };
                });
                console.log('输入详情:', JSON.stringify(inputMeta));
            } catch (e) {
                console.log('无法获取输入详情');
            }
            
            this.isModelLoaded = true;
            this.loadedModelKey = modelKey;
            this.currentExecutionMode = executionMode;
            this.setModelStatus(`模型已加载 (${executionMode === 'gpu' ? 'GPU' : 'CPU'}) ✓`, 'ok');
            this.loadModelBtn.textContent = '模型已加载';
            
            this.updateButtons();
            
        } catch (error) {
            console.error('模型加载失败:', error);
            this.setModelStatus(`加载失败: ${error.message}`, 'error');
            this.loadModelBtn.textContent = '重新加载模型';
            this.loadModelBtn.disabled = false;
            this.isModelLoaded = false;
            throw error;
        }
    }
    
    async loadUpscaleModel(modelKey = 'realesrgan-x4plus') {
        console.log(`开始加载超分辨率模型: ${modelKey}...`);
        
        try {
            const executionMode = document.querySelector('input[name="executionMode"]:checked')?.value || 'gpu';
            const cacheKey = `model-${modelKey}`;
            
            // 检查是否已经加载相同模型
            if (this.upscaleSession && this.isUpscaleModelLoaded && this.currentUpscaleModel === modelKey) {
                console.log('超分辨率模型已加载，跳过重复加载');
                return;
            }
            
            this.setModelStatus(`正在下载超分辨率模型: ${this.modelConfigs[modelKey].name}...`, 'warn');
            
            // 使用配置中的模型
            const config = this.modelConfigs[modelKey];
            const modelBuffer = await this.downloadModelWithProgress(config.urls, config.name, cacheKey);
            
            this.setModelStatus('正在初始化超分辨率模型...', 'warn');
            
            const providers = executionMode === 'gpu' ? ['webgpu'] : ['wasm'];
            
            this.upscaleSession = await ort.InferenceSession.create(modelBuffer, {
                executionProviders: providers,
                graphOptimizationLevel: 'disabled',
                enableMemPattern: false,
                enableCpuMemArena: false
            });
            
            console.log(`超分辨率模型加载成功: ${config.name}，使用:`, providers[0]);
            console.log('超分辨率模型输入名称:', this.upscaleSession.inputNames);
            console.log('超分辨率模型输出名称:', this.upscaleSession.outputNames);
            
            this.isUpscaleModelLoaded = true;
            this.currentUpscaleModel = modelKey;
            this.setModelStatus(`超分辨率模型已加载: ${config.name} (${executionMode === 'gpu' ? 'GPU' : 'CPU'}) ✓`, 'ok');
            
        } catch (error) {
            console.error('超分辨率模型加载失败:', error);
            this.setModelStatus(`超分辨率模型加载失败: ${error.message}`, 'error');
            this.isUpscaleModelLoaded = false;
            throw error;
        }
    }
    
    async downloadModelWithProgress(urls, modelName, modelKey) {
        const cachedModel = await this.getModelFromCache(modelKey);
        if (cachedModel) {
            this.setModelStatus('使用已缓存的模型 ✓', 'ok');
            return cachedModel;
        }
        
        let lastError;
        for (const url of urls) {
            try {
                console.log(`尝试从 ${url} 下载模型...`);
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                
                const totalSize = parseInt(response.headers.get('content-length') || '0');
                const reader = response.body.getReader();
                const chunks = [];
                let receivedSize = 0;
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    chunks.push(value);
                    receivedSize += value.length;
                    
                    if (totalSize > 0) {
                        const percent = Math.round((receivedSize / totalSize) * 100);
                        const sizeMB = (receivedSize / 1024 / 1024).toFixed(1);
                        const totalMB = (totalSize / 1024 / 1024).toFixed(1);
                        this.setModelStatus(`下载中: ${sizeMB}MB / ${totalMB}MB (${percent}%)`, 'warn');
                    }
                }
                
                const arrayBuffer = new Uint8Array(receivedSize);
                let position = 0;
                for (const chunk of chunks) {
                    arrayBuffer.set(chunk, position);
                    position += chunk.length;
                }
                
                await this.saveModelToCache(modelKey, arrayBuffer.buffer);
                return arrayBuffer.buffer;
                
            } catch (error) {
                console.warn(`从 ${url} 下载失败:`, error);
                lastError = error;
            }
        }
        
        throw new Error(`所有下载源都失败: ${lastError?.message}`);
    }
    
    addFiles(files) {
        // 单视频模式：只保留最后一个视频
        const videoFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
        if (videoFiles.length === 0) {
            alert('请选择视频文件');
            return;
        }
        
        const file = videoFiles[0]; // 只处理第一个文件
        
        const fileData = {
            id: Date.now(),
            file: file,
            name: file.name,
            size: file.size,
            status: 'pending',
            originalVideo: null,
            processedVideo: null,
            originalInfo: null,
            processedInfo: null
        };
        
        this.fileList = [fileData]; // 替换整个列表
        this.showVideoPreview(file);
        this.updateButtons();
    }
    
    showVideoPreview(file) {
        // 隐藏上传提示和对比容器
        if (this.uploadContent) this.uploadContent.style.display = 'none';
        if (this.compareContainer) this.compareContainer.style.display = 'none';
        
        // 显示单视频容器
        if (this.singleVideoContainer) this.singleVideoContainer.style.display = 'block';
        
        if (this.inputVideoPreview) {
            const url = URL.createObjectURL(file);
            this.inputVideoPreview.src = url;
            
            // 视频加载后显示信息和检测FPS
            this.inputVideoPreview.onloadedmetadata = async () => {
                const duration = this.inputVideoPreview.duration;
                const width = this.inputVideoPreview.videoWidth;
                const height = this.inputVideoPreview.videoHeight;
                const sizeMB = (file.size / 1024 / 1024).toFixed(2);
                
                // 尝试获取视频实际帧率
                let fps = 30; // 默认值
                try {
                    const stream = this.inputVideoPreview.captureStream();
                    const videoTrack = stream.getVideoTracks()[0];
                    if (videoTrack) {
                        const settings = videoTrack.getSettings();
                        if (settings.frameRate) {
                            fps = Math.round(settings.frameRate);
                        }
                    }
                } catch (e) {
                    console.log('无法通过captureStream获取FPS，使用默认值30fps');
                }
                
                // 保存原始FPS
                this.originalFPS = fps;
                
                if (this.videoInfoDisplay) {
                    this.videoInfoDisplay.innerHTML = `
                        <strong>${file.name}</strong><br>
                        分辨率: ${width}x${height} | 帧率: <strong style="color: #00d9ff;">${fps} FPS</strong> | 时长: ${duration.toFixed(1)}s | 大小: ${sizeMB}MB
                    `;
                }
                
                // 更新目标FPS显示
                this.updateTargetFPSDisplay();
            };
        }
    }
    
    renderFileList() {
        if (!this.fileListContainer) return;
        
        if (this.fileList.length === 0) {
            this.fileListContainer.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">暂无文件</div>';
            return;
        }
        
        this.fileListContainer.innerHTML = this.fileList.map(fileData => `
            <div class="file-item ${fileData.status}" data-id="${fileData.id}">
                <div class="file-name">${fileData.name}</div>
                <div class="file-info">
                    <span>${(fileData.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <div class="file-status ${fileData.status}">
                    ${this.getStatusText(fileData.status)}
                </div>
                ${fileData.status === 'completed' ? `
                    <div class="file-actions">
                        <button class="btn-compare" onclick="videoInterpolation.compareFile(${fileData.id})">对比</button>
                        <button class="btn-download" onclick="videoInterpolation.downloadFile(${fileData.id})">下载</button>
                        <button class="btn-remove" onclick="videoInterpolation.removeFile(${fileData.id})">删除</button>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }
    
    getStatusText(status) {
        const statusMap = {
            'pending': '等待处理',
            'processing': '处理中...',
            'completed': '已完成 ✓',
            'error': '处理失败'
        };
        return statusMap[status] || status;
    }
    
    updateButtons() {
        if (this.processBtn) {
            this.processBtn.disabled = !this.isModelLoaded || this.fileList.length === 0 || this.isProcessing;
        }
        
        if (this.clearBtn) {
            this.clearBtn.disabled = this.fileList.length === 0 || this.isProcessing;
        }
    }
    
    async processAll() {
        if (!this.isModelLoaded) {
            alert('请先加载模型');
            return;
        }
        
        // 检查mp4-muxer是否加载
        if (typeof Mp4Muxer === 'undefined') {
            alert('⚠️ mp4-muxer库未加载，无法生成MP4视频。\n\n请：\n1. 关闭广告屏蔽插件\n2. 刷新页面重试\n3. 检查网络连接');
            console.error('检查CDN加载状态: https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.1/dist/mp4-muxer.umd.js');
            return;
        }
        
        if (this.fileList.length === 0) {
            alert('请先上传视频');
            return;
        }
        
        const fileData = this.fileList[0]; // 单视频模式
        
        if (fileData.status === 'completed') {
            if (!confirm('已有处理结果，是否重新处理？')) {
                return;
            }
        }
        
        this.isProcessing = true;
        this.updateButtons();
        
        if (this.progressContainer) {
            this.progressContainer.style.display = 'block';
        }
        
        // 隐藏之前的对比预览和统计信息
        if (this.compareContainer) {
            this.compareContainer.style.display = 'none';
        }
        if (this.processingStats) {
            this.processingStats.style.display = 'none';
        }
        
        try {
            fileData.status = 'processing';
            
            await this.processVideo(fileData);
            
            fileData.status = 'completed';
            
            console.log('✅ 视频处理完成');
            
        } catch (error) {
            console.error(`❌ 处理失败: ${fileData.name}`, error);
            alert(`处理失败: ${error.message}`);
            fileData.status = 'error';
        }
        
        this.isProcessing = false;
        this.updateButtons();
        
        // 延迟隐藏进度条
        setTimeout(() => {
            if (this.progressContainer) {
                this.progressContainer.style.display = 'none';
            }
        }, 1000);
    }
    
    updateProgress(current, total, message = null) {
        // 支持两种模式：1. updateProgress(percent, message) 2. updateProgress(current, total, message)
        let percent;
        if (typeof current === 'number' && typeof total === 'string') {
            // 模式1: updateProgress(percent, message)
            percent = current;
            message = total;
        } else if (typeof current === 'number' && typeof total === 'number') {
            // 模式2: updateProgress(current, total, message)
            percent = total > 0 ? (current / total) * 100 : 0;
        } else {
            percent = 0;
        }
        
        if (this.progressFill) {
            this.progressFill.style.width = `${percent}%`;
        }
        
        if (this.progressText) {
            this.progressText.textContent = message || `处理中... ${Math.round(percent)}%`;
        }
    }
    
    updateTargetFPSDisplay() {
        const fpsInfo = document.getElementById('fpsInfo');
        if (!fpsInfo) return;
        
        const targetFPS = parseInt(this.frameMultiplierSelect?.value || '60');
        const originalFPS = this.originalFPS || 30;
        const multiplier = (targetFPS / originalFPS).toFixed(1);
        
        fpsInfo.textContent = `原视频: ${originalFPS} fps → 目标: ${targetFPS} fps (${multiplier}x)`;
    }
    
    async processVideo(fileData) {
        // 视频处理逻辑
        const enableInterpolation = document.getElementById('enableInterpolation')?.checked ?? true;
        const enableUpscale = document.getElementById('enableUpscale')?.checked || false;
        const targetFPS = parseInt(this.frameMultiplierSelect?.value || '60');
        const upscaleScale = parseInt(document.getElementById('upscaleScale')?.value || '2');
        
        if (!enableInterpolation && !enableUpscale) {
            alert('⚠️ 请至少启用一个处理选项：\n\n🎬 AI补帧 - 提升视频流畅度\n🖼️ AI超分辨率 - 提升画面清晰度\n\n💡 提示：两个功能可以同时启用！');
            return;
        }
        
        const originalFPS = this.originalFPS || 30;
        const multiplier = Math.round(targetFPS / originalFPS);
        
        console.log(`\n========== 开始处理视频 ==========`);
        console.log(`📹 文件名: ${fileData.name}`);
        console.log(`🎬 AI补帧: ${enableInterpolation ? `✅ 启用 (${originalFPS}fps → ${targetFPS}fps, ${multiplier}x)` : '❌ 关闭'}`);
        console.log(`🖼️ AI超分: ${enableUpscale ? '✅ 启用 (' + upscaleScale + 'x)' : '❌ 关闭'}`);
        if (enableInterpolation && enableUpscale) {
            console.log(`⚡ 组合模式: 补帧 ${multiplier}x + 超分 ${upscaleScale}x`);
            console.log(`⏱️ 预计处理时间会显著增加（补帧+超分）`);
        }
        console.log(`================================\n`);
        
        // 1. 加载视频
        const videoBlob = await this.loadVideoAsBlob(fileData.file);
        fileData.originalVideo = videoBlob;
        
        // 2. 提取视频帧
        this.updateProgress(10, '提取视频帧...');
        const frames = await this.extractFrames(videoBlob);
        console.log(`提取了 ${frames.length} 帧`);
        
        let processedFrames = frames;
        
        // 3. 帧插值处理（如果启用）
        if (enableInterpolation) {
            this.updateProgress(20, 'AI补帧中...');
            const originalFPS = this.originalFPS || 30;
            const multiplier = Math.round(targetFPS / originalFPS);
            processedFrames = await this.interpolateFrames(processedFrames, multiplier);
            console.log(`插值后共 ${processedFrames.length} 帧（原${frames.length}帧@${originalFPS}fps → ${processedFrames.length}帧@${targetFPS}fps，${multiplier}x）`);
        } else {
            console.log('跳过补帧处理');
            this.updateProgress(50, '跳过补帧...');
        }
        
        // 4. 超分辨率处理（如果启用）
        if (enableUpscale) {
            const progressStart = enableInterpolation ? 70 : 20;
            this.updateProgress(progressStart, '应用超分辨率...');
            
            // 获取用户选择的超分模型
            const upscaleModelKey = document.getElementById('upscaleModel')?.value || 'realesrgan-x4plus';
            
            if (!this.upscaleSession || this.currentUpscaleModel !== upscaleModelKey) {
                console.log(`加载超分辨率模型: ${upscaleModelKey}...`);
                await this.loadUpscaleModel(upscaleModelKey);
                this.currentUpscaleModel = upscaleModelKey;
            }
            
            processedFrames = await this.upscaleFrames(processedFrames, upscaleScale);
            console.log(`超分辨率处理完成: ${upscaleScale}x放大 (${this.modelConfigs[upscaleModelKey].name})`);
        } else {
            console.log('跳过超分辨率处理');
        }
        
        // 🎨 5. Topaz风格后处理增强（如果启用）
        const sharpen = parseInt(document.getElementById('sharpenStrength')?.value || '0');
        const denoise = parseInt(document.getElementById('denoiseStrength')?.value || '0');
        const contrast = parseInt(document.getElementById('contrastAdjust')?.value || '0');
        const grain = parseInt(document.getElementById('filmGrain')?.value || '0');
        
        const hasEnhancement = sharpen > 0 || denoise > 0 || contrast !== 0 || grain > 0;
        
        if (hasEnhancement) {
            const progressStart = enableInterpolation || enableUpscale ? 80 : 50;
            this.updateProgress(progressStart, '后处理增强中...');
            
            console.log(`\n🎨 应用后处理增强:`);
            if (sharpen > 0) console.log(`  🔪 锐化强度: ${sharpen}`);
            if (denoise > 0) console.log(`  🧹 降噪强度: ${denoise}`);
            if (contrast !== 0) console.log(`  📊 对比度: ${contrast > 0 ? '+' : ''}${contrast}`);
            if (grain > 0) console.log(`  🎞️ 胶片颗粒: ${grain}`);
            
            const enhancedFrames = [];
            for (let i = 0; i < processedFrames.length; i++) {
                const enhanced = this.enhanceFrame(processedFrames[i], {
                    sharpen,
                    denoise,
                    contrast,
                    grain
                });
                enhancedFrames.push(enhanced);
                
                if (i % 30 === 0 || i === processedFrames.length - 1) {
                    const percent = progressStart + (i / processedFrames.length * 10);
                    this.updateProgress(percent, `增强处理: ${i+1}/${processedFrames.length}`);
                }
            }
            
            processedFrames = enhancedFrames;
            console.log(`✅ 增强处理完成`);
        }
        
        // 6. 合成视频
        this.updateProgress(90, '合成视频...');
        const outputVideo = await this.encodeFramesToVideo(processedFrames, fileData);
        
        fileData.processedVideo = outputVideo;
        
        // 保存处理结果
        await this.saveProcessedVideo(fileData);
    }
    
    async loadVideoAsBlob(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(new Blob([reader.result], { type: file.type }));
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
    
    async extractFrames(videoBlob) {
        // 从视频中提取帧
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(videoBlob);
            video.muted = true;
            
            video.onloadedmetadata = async () => {
                // 智能分辨率缩放：根据用户选择的分辨率限制
                const resolutionSetting = document.getElementById('resolutionLimit')?.value || 'original';
                
                const originalWidth = video.videoWidth;
                const originalHeight = video.videoHeight;
                let targetWidth = originalWidth;
                let targetHeight = originalHeight;
                
                // 如果选择了具体分辨率限制，则进行缩放
                if (resolutionSetting !== 'original') {
                    const resolutionLimit = parseInt(resolutionSetting);
                    
                    // 按最大边长缩放
                    if (originalWidth > resolutionLimit || originalHeight > resolutionLimit) {
                        const scale = resolutionLimit / Math.max(originalWidth, originalHeight);
                        targetWidth = Math.round(originalWidth * scale);
                        targetHeight = Math.round(originalHeight * scale);
                        // 确保是8的倍数（模型要求）
                        targetWidth = Math.round(targetWidth / 8) * 8;
                        targetHeight = Math.round(targetHeight / 8) * 8;
                        console.log(`⚡ 分辨率优化: ${originalWidth}x${originalHeight} → ${targetWidth}x${targetHeight}`);
                    } else {
                        console.log(`原始分辨率 ${originalWidth}x${originalHeight} 已小于限制 ${resolutionLimit}p，保持不变`);
                    }
                } else {
                    // 🔧 原始分辨率模式，保持原始宽高比，智能对齐到8的倍数
                    // 计算最接近的8倍数
                    const alignToMultiple8 = (value) => {
                        const lower = Math.floor(value / 8) * 8;
                        const upper = Math.ceil(value / 8) * 8;
                        // 选择最接近的值
                        return (value - lower) < (upper - value) ? lower : upper;
                    };
                    
                    targetWidth = alignToMultiple8(originalWidth);
                    targetHeight = alignToMultiple8(originalHeight);
                    
                    if (targetWidth !== originalWidth || targetHeight !== originalHeight) {
                        console.log(`✨ 使用8倍数对齐: ${originalWidth}x${originalHeight} → ${targetWidth}x${targetHeight}`);
                    } else {
                        console.log(`✨ 使用原始分辨率: ${originalWidth}x${originalHeight} (已是8的倍数)`);
                    }
                }
                
                this.originalWidth = originalWidth;
                this.originalHeight = originalHeight;
                this.processWidth = targetWidth;
                this.processHeight = targetHeight;
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                canvas.width = targetWidth;
                canvas.height = targetHeight;
                
                const frames = [];
                // 尝试从视频元素获取真实帧率，如果无法获取则使用30fps作为默认值
                let fps = 30;
                try {
                    // 对于某些格式，可能可以从视频轨道获取帧率
                    const videoTracks = video.captureStream ? video.captureStream().getVideoTracks() : null;
                    if (videoTracks && videoTracks.length > 0) {
                        const settings = videoTracks[0].getSettings();
                        if (settings.frameRate) {
                            fps = settings.frameRate;
                        }
                    }
                } catch (e) {
                    console.warn('无法获取视频真实帧率，使用默认30fps:', e);
                }
                
                const duration = video.duration;
                const totalFrames = Math.floor(duration * fps);
                
                // 保存原始帧率信息
                this.originalFPS = fps;
                this.videoDuration = duration;
                
                // 更新UI显示目标帧率
                this.updateTargetFPSDisplay();
                
                // 检查是否启用3秒测试模式
                const testMode = document.getElementById('testMode')?.checked;
                const testFrameLimit = testMode ? Math.floor(fps * 3) : 3000; // 3秒或最大3000帧
                
                // 处理视频帧数
                const maxFrames = Math.min(totalFrames, testFrameLimit);
                
                console.log(`视频信息: ${originalWidth}x${originalHeight}, ${fps}fps, 时长${duration.toFixed(2)}秒`);
                console.log(`${testMode ? '⚡ 测试模式：' : ''}提取${maxFrames}帧（${(maxFrames/fps).toFixed(1)}秒）处理分辨率: ${targetWidth}x${targetHeight}`);
                
                for (let i = 0; i < maxFrames; i++) {
                    video.currentTime = (i / fps);
                    await new Promise(r => video.onseeked = r);
                    
                    // 显示提取进度
                    if (i % 30 === 0) {
                        this.updateProgress(10 + (i / maxFrames * 10), `提取帧: ${i}/${maxFrames}`);
                    }
                    
                    ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                    const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
                    frames.push(imageData);
                }
                
                URL.revokeObjectURL(video.src);
                resolve(frames);
            };
            
            video.onerror = reject;
        });
    }
    
    async interpolateFrames(frames, multiplier) {
        // 检查是否使用非递归模式
        const nonRecursive = document.getElementById('nonRecursive')?.checked || false;
        
        if (nonRecursive) {
            // 非递归模式：直接一次性插帧
            return await this.interpolateFramesNonRecursive(frames, multiplier);
        } else {
            // 递归模式（原方法）
            return await this.interpolateFramesRecursive(frames, multiplier);
        }
    }
    
    async interpolateFramesRecursive(frames, multiplier) {
        // 使用递归二分插帧法，质量更高
        // 例如：4x = 2次递归 (2x -> 2x)
        const recursionDepth = Math.log2(multiplier);
        
        if (!Number.isInteger(recursionDepth)) {
            throw new Error(`补帧倍数必须是2的幂次方（2x, 4x, 8x等），当前: ${multiplier}x`);
        }
        
        let currentFrames = frames;
        const totalPairs = frames.length - 1;
        const totalInferences = totalPairs * (multiplier - 1);
        
        console.log(`开始递归二分插帧: ${frames.length} 原始帧 → ${frames.length + totalInferences} 目标帧`);
        console.log(`递归深度: ${recursionDepth} (${multiplier}x = ${Array(recursionDepth).fill('2x').join(' → ')})`);
        console.log(`需要执行 ${totalInferences} 次AI推理，分辨率 ${frames[0].width}x${frames[0].height}`);
        
        const startTime = Date.now();
        this.totalInferences = totalInferences;
        this.completedInferences = 0;
        
        // 递归执行2x插帧
        for (let depth = 0; depth < recursionDepth; depth++) {
            console.log(`\n=== 第 ${depth + 1}/${recursionDepth} 轮递归插帧 (当前${currentFrames.length}帧 → ${currentFrames.length * 2 - 1}帧) ===`);
            currentFrames = await this.interpolate2x(currentFrames, depth + 1, recursionDepth, startTime);
        }
        
        const totalTime = (Date.now() - startTime) / 1000;
        console.log(`\n插帧完成！总耗时: ${(totalTime/60).toFixed(1)}分钟, 平均: ${(totalTime/totalInferences).toFixed(2)}秒/帧`);
        
        return currentFrames;
    }
    
    async interpolateFramesNonRecursive(frames, multiplier) {
        // 非递归模式：使用递归细分但避免嵌套，减少累积误差
        // 由于RIFE只能生成0.5中间帧，需要多次调用
        const result = [];
        const totalPairs = frames.length - 1;
        
        // 计算需要几轮插帧 (2x, 4x, 8x等)
        const recursionDepth = Math.log2(multiplier);
        if (!Number.isInteger(recursionDepth)) {
            throw new Error(`倍率必须是2的幂次方 (2, 4, 8等), 当前: ${multiplier}`);
        }
        
        const totalInferences = totalPairs * (multiplier - 1);
        console.log(`🔷 非递归插帧模式: ${frames.length} 原始帧 → ${frames.length + totalInferences} 目标帧`);
        console.log(`使用递归细分算法，但一次性处理所有帧对，减少误差传播`);
        
        const startTime = Date.now();
        this.totalInferences = totalInferences;
        this.completedInferences = 0;
        
        const thresholdSlider = document.getElementById('motionThreshold');
        const motionThreshold = thresholdSlider ? parseFloat(thresholdSlider.value) : 0.015;
        const forceLinear = document.getElementById('forceLinear')?.checked || false;
        const forceAI = document.getElementById('forceAI')?.checked || false;
        const temporalConsistency = document.getElementById('temporalConsistency')?.checked ?? true;
        
        // 对每一对原始帧进行插值
        for (let pairIdx = 0; pairIdx < frames.length - 1; pairIdx++) {
            const frame1 = frames[pairIdx];
            const frame2 = frames[pairIdx + 1];
            
            // 递归生成中间帧
            const intermediateFrames = [frame1];
            
            // 使用递归二分法生成所有中间帧
            const generateIntermediateFrames = async (f1, f2, depth) => {
                if (depth === 0) {
                    return [f1];
                }
                
                let useAI = false;
                if (forceLinear) {
                    useAI = false;
                } else if (forceAI) {
                    useAI = true;
                } else {
                    const motionScore = this.calculateMotionScore(f1, f2);
                    useAI = motionScore > motionThreshold;
                }
                
                let middleFrame;
                if (useAI) {
                    middleFrame = await this.interpolateBetweenFrames(f1, f2, 0.5);
                } else {
                    middleFrame = this.simpleInterpolate(f1, f2, 0.5);
                }
                
                this.completedInferences++;
                
                if (this.completedInferences % 10 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const avgTime = elapsed / this.completedInferences;
                    const remaining = (this.totalInferences - this.completedInferences) * avgTime;
                    
                    const progress = 20 + (this.completedInferences / this.totalInferences * 50);
                    this.updateProgress(
                        progress,
                        `非递归插帧: ${this.completedInferences}/${this.totalInferences} (剩余: ${Math.floor(remaining/60)}分${Math.floor(remaining%60)}秒)`
                    );
                }
                
                // 递归细分左右两部分
                const leftFrames = await generateIntermediateFrames(f1, middleFrame, depth - 1);
                const rightFrames = await generateIntermediateFrames(middleFrame, f2, depth - 1);
                
                // 合并结果（去除重复的middleFrame）
                return [...leftFrames, middleFrame, ...rightFrames.slice(1)];
            };
            
            const allFrames = await generateIntermediateFrames(frame1, frame2, recursionDepth);
            result.push(...allFrames);
        }
        
        // 添加最后一帧
        result.push(frames[frames.length - 1]);
        
        const totalTime = (Date.now() - startTime) / 1000;
        console.log(`\n插帧完成！总耗时: ${(totalTime/60).toFixed(1)}分钟, 平均: ${(totalTime/totalInferences).toFixed(2)}秒/帧`);
        
        return result;
    }
    
    async interpolate2x(frames, currentDepth, totalDepth, startTime) {
        const result = [];
        const pairsToProcess = frames.length - 1;
        
        let aiFrameCount = 0;
        let sceneCutCount = 0;
        let blendCount = 0;
        
        // 🎯 高级策略：时序平滑缓冲区
        const temporalBuffer = [];
        const bufferSize = 3; // 保留最近3帧用于时域平滑
        
        console.log('🎯 高级插帧：AI推理 + 时序平滑 + 自适应混合');
        
        for (let i = 0; i < frames.length - 1; i++) {
            result.push(frames[i]);
            
            // 检测场景切换和运动强度
            const motionScore = this.calculateMotionScore(frames[i], frames[i + 1]);
            const isSceneCut = motionScore === 999;
            const motionIntensity = isSceneCut ? 0 : motionScore;
            
            let interpolatedFrame;
            
            if (isSceneCut) {
                // 🎬 场景切换：直接复制（标准处理）
                interpolatedFrame = new ImageData(frames[i].width, frames[i].height);
                interpolatedFrame.data.set(frames[i + 1].data);
                sceneCutCount++;
            } else if (motionIntensity > 0.35) {
                // ⚡ 大运动：AI插值 + 线性混合（自适应策略）
                // 大幅度运动时，混合线性插值提高稳定性
                const aiFrame = await this.interpolateBetweenFrames(frames[i], frames[i + 1], 0.5);
                const linearFrame = this.simpleInterpolate(frames[i], frames[i + 1], 0.5);
                
                // 混合比例：运动越大，线性权重越高
                const blendRatio = Math.min((motionIntensity - 0.35) / 0.25, 0.3); // 最多30%线性
                interpolatedFrame = this.blendFrames(aiFrame, linearFrame, 1 - blendRatio, blendRatio);
                blendCount++;
                aiFrameCount++;
            } else {
                // ✨ 正常/小运动：纯AI插值（高质量模式）
                interpolatedFrame = await this.interpolateBetweenFrames(frames[i], frames[i + 1], 0.5);
                aiFrameCount++;
            }
            
            // 🎯 时序平滑：使用缓冲区减少闪烁
            if (!isSceneCut && temporalBuffer.length >= bufferSize) {
                interpolatedFrame = this.temporalSmooth(interpolatedFrame, temporalBuffer);
            }
            temporalBuffer.push(interpolatedFrame);
            if (temporalBuffer.length > bufferSize) temporalBuffer.shift();
            
            result.push(interpolatedFrame);
            this.completedInferences++;
            
            // 更新进度
            if (this.completedInferences % 5 === 0 || this.completedInferences === this.totalInferences) {
                const elapsed = (Date.now() - startTime) / 1000;
                const avgTime = elapsed / this.completedInferences;
                const remaining = (this.totalInferences - this.completedInferences) * avgTime;
                
                const progress = 20 + (this.completedInferences / this.totalInferences * 50);
                this.updateProgress(
                    progress,
                    `AI插帧 ${currentDepth}/${totalDepth}: ${this.completedInferences}/${this.totalInferences} (${avgTime.toFixed(2)}s/帧, 剩余${(remaining/60).toFixed(1)}分)`
                );
            }
        }
        
        result.push(frames[frames.length - 1]);
        console.log(`第${currentDepth}轮统计: 纯AI=${aiFrameCount-blendCount}, AI+混合=${blendCount}, 场景切换=${sceneCutCount}, 总计=${aiFrameCount+sceneCutCount}`);
        return result;
    }
    
    calculateMotionScore(frame1, frame2) {
        // 🎯 高级场景切换检测算法
        // 不再用于决定是否使用AI插值，仅用于检测场景切换
        const data1 = frame1.data;
        const data2 = frame2.data;
        
        // 🎯 高精度采样：平衡精度与性能
        const sampleRate = 8; // 提高采样密度以获得更准确的运动估计
        
        let totalDiff = 0;
        let sampleCount = 0;
        
        // 直方图：用于检测色彩分布变化
        const hist1R = new Array(16).fill(0);
        const hist1G = new Array(16).fill(0);
        const hist1B = new Array(16).fill(0);
        const hist2R = new Array(16).fill(0);
        const hist2G = new Array(16).fill(0);
        const hist2B = new Array(16).fill(0);
        
        for (let i = 0; i < data1.length; i += 4 * sampleRate) {
            // RGB差异
            const rDiff = Math.abs(data1[i] - data2[i]);
            const gDiff = Math.abs(data1[i + 1] - data2[i + 1]);
            const bDiff = Math.abs(data1[i + 2] - data2[i + 2]);
            const pixelDiff = (rDiff + gDiff + bDiff) / 3;
            
            totalDiff += pixelDiff;
            
            // RGB直方图
            hist1R[Math.floor(data1[i] / 16)]++;
            hist1G[Math.floor(data1[i + 1] / 16)]++;
            hist1B[Math.floor(data1[i + 2] / 16)]++;
            hist2R[Math.floor(data2[i] / 16)]++;
            hist2G[Math.floor(data2[i + 1] / 16)]++;
            hist2B[Math.floor(data2[i + 2] / 16)]++;
            
            sampleCount++;
        }
        
        // 平均像素差异
        const avgDiff = totalDiff / sampleCount;
        const normalizedAvg = avgDiff / 255;
        
        // 🎯 增强检测：边缘变化检测（提高场景切换准确性）
        let edgeChangeScore = 0;
        const edgeSampleRate = 32;
        let edgeSamples = 0;
        
        for (let i = 0; i < data1.length - 4; i += 4 * edgeSampleRate) {
            // 简单的Sobel边缘检测
            const edge1 = Math.abs(data1[i] - data1[i + 4]) + Math.abs(data1[i] - data1[i + (data1.length > i + frame1.width * 4 ? frame1.width * 4 : 0)]);
            const edge2 = Math.abs(data2[i] - data2[i + 4]) + Math.abs(data2[i] - data2[i + (data2.length > i + frame2.width * 4 ? frame2.width * 4 : 0)]);
            edgeChangeScore += Math.abs(edge1 - edge2);
            edgeSamples++;
        }
        
        const normalizedEdgeChange = edgeSamples > 0 ? (edgeChangeScore / edgeSamples) / 255 : 0;
        
        // 🎯 Topaz增强：边缘变化检测（提高场景切换准确性）
        let edgeChangeScore = 0;
        const edgeSampleRate = 32;
        let edgeSamples = 0;
        
        for (let i = 0; i < data1.length - 4; i += 4 * edgeSampleRate) {
            // 简单的Sobel边缘检测
            const edge1 = Math.abs(data1[i] - data1[i + 4]) + Math.abs(data1[i] - data1[i + data1.length > i + frame1.width * 4 ? frame1.width * 4 : 0]);
            const edge2 = Math.abs(data2[i] - data2[i + 4]) + Math.abs(data2[i] - data2[i + data2.length > i + frame2.width * 4 ? frame2.width * 4 : 0]);
            edgeChangeScore += Math.abs(edge1 - edge2);
            edgeSamples++;
        }
        
        const normalizedEdgeChange = edgeSamples > 0 ? (edgeChangeScore / edgeSamples) / 255 : 0;
        
        // 直方图相关性（Topaz方法）
        const histCorrelation = (hist1, hist2) => {
            let sum1 = 0, sum2 = 0, sum1Sq = 0, sum2Sq = 0, pSum = 0;
            for (let i = 0; i < hist1.length; i++) {
                sum1 += hist1[i];
                sum2 += hist2[i];
                sum1Sq += hist1[i] * hist1[i];
                sum2Sq += hist2[i] * hist2[i];
                pSum += hist1[i] * hist2[i];
            }
            const num = pSum - (sum1 * sum2 / hist1.length);
            const den = Math.sqrt((sum1Sq - sum1 * sum1 / hist1.length) * (sum2Sq - sum2 * sum2 / hist1.length));
            return den === 0 ? 0 : num / den;
        };
        
        const corrR = histCorrelation(hist1R, hist2R);
        const corrG = histCorrelation(hist1G, hist2G);
        const corrB = histCorrelation(hist1B, hist2B);
        const avgCorr = (corrR + corrG + corrB) / 3;
        
        // 🎯 场景切换判断：多维度综合评估
        // 1. 直方图相关性极低（<0.25）- 色彩分布完全不同
        // 2. 像素差异很大（>0.5）- 内容大幅变化
        // 3. 边缘结构变化剧烈（>0.4）- 场景结构完全改变
        const isSceneCut = (avgCorr < 0.25 && normalizedAvg > 0.5) || 
                           (normalizedAvg > 0.55 && normalizedEdgeChange > 0.4);
        
        if (isSceneCut) {
            console.log(`🎬 场景切换检测！相关性=${avgCorr.toFixed(3)}, 差异=${normalizedAvg.toFixed(3)}`);
            return 999; // 返回特殊值标记场景切换
        }
        
        // 调试信息：输出接近阈值的帧对
        if (avgCorr < 0.3 || normalizedAvg > 0.5) {
            console.log(`  [运动检测] 相关性=${avgCorr.toFixed(3)}, 差异=${normalizedAvg.toFixed(3)} - 使用AI插值`);
        }
        
        // 返回运动强度（仅供参考，不影响是否使用AI）
        return normalizedAvg;
    }
    
    async interpolateBetweenFrames(frame1, frame2, t = 0.5, forceAI = true) {
        // 使用RIFE模型进行帧插值
        // 参考官方API: inference(img0, img1) - 输入输出都是[0,1]范围的tensor
        try {
            // 准备输入张量 - RIFE期望输入是[0,1]范围
            const input1 = this.imageDataToTensor(frame1);
            const input2 = this.imageDataToTensor(frame2);
            
            const inputNames = this.interpolationSession.inputNames;
            const feeds = {};
            
            // RIFE标准API：只需要2个输入(img0, img1)
            // 某些ONNX转换可能合并为单个输入或分开
            if (inputNames.length === 1) {
                // 合并输入：torch.cat((img0, img1), 1)
                const batchSize = 1;
                const channels = 6; // 3 for img0 + 3 for img1
                const height = frame1.height;
                const width = frame1.width;
                const concatenated = new Float32Array(channels * height * width);
                
                // 复制img0的数据
                concatenated.set(input1.data);
                // 复制img1的数据
                concatenated.set(input2.data, 3 * height * width);
                
                feeds[inputNames[0]] = new ort.Tensor('float32', concatenated, [batchSize, channels, height, width]);
            } else {
                // 分开输入
                feeds[inputNames[0]] = input1;
                feeds[inputNames[1]] = input2;
                
                // 如果有第3个输入（timestep），添加它
                // ⚠️ 根据RIFE官方代码：timestep应该是 [batch, 1, height, width] 的完整通道
                // 参考：IFNet_m.py Line 82: torch.cat((img0, img1, timestep), 1)
                // timestep是一个广播到整个空间的常量通道，不是单个标量！
                if (inputNames.length > 2) {
                    const height = frame1.height;
                    const width = frame1.width;
                    const timestepSize = height * width;
                    const timestepData = new Float32Array(timestepSize);
                    // 填充整个通道为t值（0.5）
                    timestepData.fill(t);
                    const timestepTensor = new ort.Tensor('float32', timestepData, [1, 1, height, width]);
                    feeds[inputNames[2]] = timestepTensor;
                    console.log(`✅ Timestep tensor: [1, 1, ${height}, ${width}], value=${t}`);
                }
            }
            
            const results = await this.interpolationSession.run(feeds);
            
            // 使用模型实际的输出名称
            const outputNames = this.interpolationSession.outputNames;
            const outputTensor = results[outputNames[0]];
            
            // 转换回ImageData - 输出已经是[0,1]范围
            return this.tensorToImageData(outputTensor, frame1.width, frame1.height);
            
        } catch (error) {
            console.error('帧插值失败:', error);
            console.error('模型输入名称:', this.interpolationSession.inputNames);
            console.error('模型输出名称:', this.interpolationSession.outputNames);
            // 失败时返回简单的线性插值
            return this.simpleInterpolate(frame1, frame2, t);
        }
    }
    
    imageDataToTensor(imageData) {
        const { width, height, data } = imageData;
        const tensorData = new Float32Array(3 * width * height);
        
        // 转换为CHW格式并归一化到[0,1] - 符合RIFE官方API
        // 官方代码: img = torch.from_numpy(frame.transpose(2,0,1)).float() / 255.
        for (let i = 0; i < width * height; i++) {
            tensorData[i] = data[i * 4] / 255.0;                          // R channel
            tensorData[width * height + i] = data[i * 4 + 1] / 255.0;    // G channel
            tensorData[width * height * 2 + i] = data[i * 4 + 2] / 255.0; // B channel
        }
        
        return new ort.Tensor('float32', tensorData, [1, 3, height, width]);
    }
    
    tensorToImageData(tensor, width, height) {
        const imageData = new ImageData(width, height);
        const tensorData = tensor.data;
        
        // 从CHW格式转换回RGBA
        // RIFE输出已经是[0,1]范围，参考官方代码: pred = torch.clamp(pred, 0, 1)
        let nanCount = 0;
        for (let i = 0; i < width * height; i++) {
            // 读取RGB值并检测异常
            let r = tensorData[i];
            let g = tensorData[width * height + i];
            let b = tensorData[width * height * 2 + i];
            
            // 🔧 修复NaN/Infinity问题（黑斑的主要原因）
            if (!isFinite(r) || isNaN(r)) { r = 0; nanCount++; }
            if (!isFinite(g) || isNaN(g)) { g = 0; nanCount++; }
            if (!isFinite(b) || isNaN(b)) { b = 0; nanCount++; }
            
            // Clamp到[0, 1]范围，然后转换到[0, 255]
            r = Math.max(0, Math.min(1, r));
            g = Math.max(0, Math.min(1, g));
            b = Math.max(0, Math.min(1, b));
            
            imageData.data[i * 4] = Math.round(r * 255);      // R
            imageData.data[i * 4 + 1] = Math.round(g * 255);  // G
            imageData.data[i * 4 + 2] = Math.round(b * 255);  // B
            imageData.data[i * 4 + 3] = 255;                  // A
        }
        
        if (nanCount > 0) {
            console.warn(`⚠️ 检测到 ${nanCount} 个异常像素值(NaN/Inf)，已修复为黑色`);
        }
        
        return imageData;
    }
    
    simpleInterpolate(frame1, frame2, t) {
        // 简单的线性插值作为后备方案
        const imageData = new ImageData(frame1.width, frame1.height);
        
        for (let i = 0; i < frame1.data.length; i++) {
            imageData.data[i] = Math.round(frame1.data[i] * (1 - t) + frame2.data[i] * t);
        }
        
        return imageData;
    }
    
    async upscaleFrames(frames, scale) {
        // 使用Real-ESRGAN进行超分辨率处理
        const upscaledFrames = [];
        
        console.log(`开始超分辨率处理: ${frames.length} 帧 x ${scale}倍`);
        
        for (let i = 0; i < frames.length; i++) {
            this.updateProgress(
                70 + (i / frames.length) * 15,
                `超分辨率处理: ${i + 1}/${frames.length}`
            );
            
            try {
                const upscaledFrame = await this.upscaleFrame(frames[i], scale);
                upscaledFrames.push(upscaledFrame);
            } catch (error) {
                console.error(`帧 ${i} 超分失败:`, error);
                upscaledFrames.push(frames[i]); // 失败时使用原帧
            }
        }
        
        return upscaledFrames;
    }
    
    async upscaleFrame(frameImageData, scale) {
        // 准备输入张量
        const inputTensor = this.imageDataToTensor(frameImageData);
        
        // 运行Real-ESRGAN推理
        const feeds = {};
        feeds[this.upscaleSession.inputNames[0]] = inputTensor;
        
        const results = await this.upscaleSession.run(feeds);
        const outputTensor = results[Object.keys(results)[0]];
        
        // 转换回ImageData
        const outputWidth = frameImageData.width * scale;
        const outputHeight = frameImageData.height * scale;
        return this.tensorToImageData(outputTensor, outputWidth, outputHeight);
    }
    
    async encodeFramesToVideo(frames, fileData) {
        // 使用WebCodecs API编码为H.264 MP4
        const enableInterpolation = document.getElementById('enableInterpolation')?.checked ?? true;
        const targetFPSValue = parseInt(this.frameMultiplierSelect?.value || '60');
        const targetFPS = enableInterpolation ? targetFPSValue : (this.originalFPS || 30);
        
        console.log(`开始编码视频: ${frames.length} 帧, 目标帧率 ${targetFPS}fps`);
        
        // 检查WebCodecs支持
        if (typeof VideoEncoder === 'undefined') {
            throw new Error('浏览器不支持WebCodecs API，无法编码MP4视频。请使用Chrome 94+或Edge 94+');
        }
        
        // 检查mp4-muxer
        if (typeof Mp4Muxer === 'undefined') {
            const errorMsg = 'mp4-muxer库未加载。\n\n可能原因：\n1. CDN被封锁或网络问题\n2. 广告屏蔽插件阻止了加载\n\n解决方案：\n1. 关闭广告屏蔽插件\n2. 刷新页面重试\n3. 检查控制台是否有加载错误';
            console.error('❌', errorMsg);
            throw new Error(errorMsg);
        }
        
        return await this.encodeFramesToMP4(frames, targetFPS);
    }
    
    async encodeFramesToMP4(frames, targetFPS) {
        // 使用WebCodecs + mp4-muxer编码H.264 MP4
        const width = frames[0].width;
        const height = frames[0].height;
        const frameDuration = 1000000 / targetFPS; // 微秒
        
        // 检查mp4-muxer是否加载
        if (typeof Mp4Muxer === 'undefined') {
            throw new Error('mp4-muxer未加载');
        }
        
        const muxer = new Mp4Muxer.Muxer({
            target: new Mp4Muxer.ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: width,
                height: height
            },
            fastStart: 'in-memory'
        });
        
        let isEncoding = true;
        const encoder = new VideoEncoder({
            output: (chunk, metadata) => {
                muxer.addVideoChunk(chunk, metadata);
            },
            error: (e) => {
                console.error('VideoEncoder错误:', e);
                isEncoding = false;
            }
        });
        
        // 配置H.264编码器
        // 根据分辨率自动选择合适的AVC level
        let codec;
        const pixelCount = width * height;
        if (pixelCount <= 414720) {
            codec = 'avc1.42E01E'; // Level 3.0 (最大 414720 像素)
        } else if (pixelCount <= 921600) {
            codec = 'avc1.42E01F'; // Level 3.1 (最大 921600 像素, 720p)
        } else if (pixelCount <= 2073600) {
            codec = 'avc1.640028'; // Level 4.0 (最大 2073600 像素, 1080p)
        } else {
            codec = 'avc1.640029'; // Level 4.1 (最大 2073600 像素, 更高码率)
        }
        
        console.log(`编码器配置: ${width}x${height} (${pixelCount}像素), 使用AVC ${codec}`);
        
        encoder.configure({
            codec: codec,
            width: width,
            height: height,
            bitrate: 10000000, // 10 Mbps
            framerate: targetFPS,
            latencyMode: 'quality'
        });
        
        // 编码所有帧
        for (let i = 0; i < frames.length && isEncoding; i++) {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(frames[i], 0, 0);
            
            const videoFrame = new VideoFrame(canvas, {
                timestamp: i * frameDuration,
                duration: frameDuration
            });
            
            encoder.encode(videoFrame, { keyFrame: i % 30 === 0 });
            videoFrame.close();
            
            if (i % 10 === 0) {
                this.updateProgress(
                    85 + (i / frames.length) * 10,
                    `编码MP4视频: ${i}/${frames.length} (${targetFPS}fps)`
                );
            }
        }
        
        await encoder.flush();
        encoder.close();
        
        muxer.finalize();
        const mp4Data = muxer.target.buffer;
        const blob = new Blob([mp4Data], { type: 'video/mp4' });
        console.log(`MP4编码完成: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
        return blob;
    }
    
    muxToMP4(chunks, width, height, fps) {
        // 已废弃，使用mp4-muxer替代
        console.warn('已废弃的方法');
        return new Uint8Array(0);
    }
    
    simpleInterpolate(frame1, frame2, t) {
        // 简单的线性插值作为后备方案
        const imageData = new ImageData(frame1.width, frame1.height);
        
        for (let i = 0; i < frame1.data.length; i++) {
            imageData.data[i] = Math.round(frame1.data[i] * (1 - t) + frame2.data[i] * t);
        }
        
        return imageData;
    }
    
    blendFrames(frame1, frame2, weight1, weight2) {
        // 🎯 Topaz风格：加权混合两帧，用于AI+线性混合策略
        const imageData = new ImageData(frame1.width, frame1.height);
        
        for (let i = 0; i < frame1.data.length; i++) {
            imageData.data[i] = Math.round(frame1.data[i] * weight1 + frame2.data[i] * weight2);
        }
        
        return imageData;
    }
    
    temporalSmooth(currentFrame, buffer) {
        // 🎯 Topaz时序平滑：使用缓冲区减少闪烁和抖动
        // 对当前帧应用轻微的时间域低通滤波
        const smoothed = new ImageData(currentFrame.width, currentFrame.height);
        const weights = [0.1, 0.2, 0.7]; // 历史帧权重：越近越重要
        
        for (let i = 0; i < currentFrame.data.length; i++) {
            let sum = currentFrame.data[i] * weights[2];
            
            // 加权平均最近的历史帧
            for (let j = 0; j < Math.min(buffer.length, 2); j++) {
                sum += buffer[buffer.length - 1 - j].data[i] * weights[1 - j];
            }
            
            smoothed.data[i] = Math.round(sum);
        }
        
        return smoothed;
    }
    
    async saveProcessedVideo(fileData) {
        console.log('✅ 处理完成，显示左右对比');
        
        if (!fileData.processedVideo) {
            console.error('❌ 没有处理后的视频数据');
            return;
        }
        
        const targetFPS = parseInt(this.frameMultiplierSelect?.value || '60');
        const originalFPS = this.originalFPS || 30;
        
        // 隐藏单视频容器
        if (this.singleVideoContainer) this.singleVideoContainer.style.display = 'none';
        
        // 显示对比容器
        if (this.compareContainer) {
            this.compareContainer.style.display = 'block';
        }
        
        // 设置原视频
        if (this.compareOriginalMain && fileData.file) {
            const originalUrl = URL.createObjectURL(fileData.file);
            this.compareOriginalMain.src = originalUrl;
        }
        
        // 设置处理后的视频
        if (this.compareProcessedMain && fileData.processedVideo) {
            const processedUrl = URL.createObjectURL(fileData.processedVideo);
            this.compareProcessedMain.src = processedUrl;
            
            // 等待两个视频都加载完成后更新标题
            const originalLoaded = new Promise(resolve => {
                if (this.compareOriginalMain) {
                    this.compareOriginalMain.onloadedmetadata = () => resolve();
                }
            });
            
            const processedLoaded = new Promise(resolve => {
                this.compareProcessedMain.onloadedmetadata = () => resolve();
            });
            
            Promise.all([originalLoaded, processedLoaded]).then(() => {
                const originalWidth = this.compareOriginalMain.videoWidth;
                const originalHeight = this.compareOriginalMain.videoHeight;
                const processedWidth = this.compareProcessedMain.videoWidth;
                const processedHeight = this.compareProcessedMain.videoHeight;
                const duration = this.compareProcessedMain.duration;
                const sizeMB = (fileData.processedVideo.size / 1024 / 1024).toFixed(2);
                
                // 更新标题中的分辨率和FPS信息
                const h4Elements = this.compareContainer.querySelectorAll('h4');
                if (h4Elements[0]) {
                    h4Elements[0].innerHTML = `📹 原视频<br><span style="font-size: 12px; font-weight: normal; color: #999;">${originalWidth}x${originalHeight} | ${originalFPS} FPS</span>`;
                }
                if (h4Elements[1]) {
                    h4Elements[1].innerHTML = `✨ 处理后<br><span style="font-size: 12px; font-weight: normal; color: #00ff88;">${processedWidth}x${processedHeight} | ${targetFPS} FPS</span>`;
                }
                
                console.log(`输出视频: ${processedWidth}x${processedHeight}, ${duration.toFixed(1)}s, ${sizeMB}MB, ${targetFPS}fps`);
                
                // 显示处理统计
                if (this.processingStats && this.statsContent) {
                    this.processingStats.style.display = 'block';
                    this.statsContent.innerHTML = `
                        <strong>✨ 处理完成</strong><br>
                        原始: ${fileData.name}<br>
                        输出: 时长 ${duration.toFixed(1)}s | 大小 ${sizeMB}MB
                    `;
                }
            });
        }
        
        // 设置下载按钮
        if (this.downloadBtnMain) {
            this.downloadBtnMain.onclick = () => this.downloadProcessedVideo(fileData);
        }
        
        // 设置重新处理按钮
        if (this.reprocessBtn) {
            this.reprocessBtn.onclick = () => {
                // 隐藏对比容器，显示单视频容器
                if (this.compareContainer) this.compareContainer.style.display = 'none';
                if (this.singleVideoContainer) this.singleVideoContainer.style.display = 'block';
                if (this.processingStats) this.processingStats.style.display = 'none';
                // 重置状态
                fileData.status = 'pending';
            };
        }
        
        // 设置重新上传按钮
        if (this.reuploadBtn2) {
            this.reuploadBtn2.onclick = () => {
                this.fileInput?.click();
            };
        }
        
        // 同步播放功能
        this.setupVideoSync();
        
        // 滚动到对比区域
        setTimeout(() => {
            if (this.compareContainer) {
                this.compareContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 300);
    }
    
    downloadProcessedVideo(fileData) {
        if (!fileData || !fileData.processedVideo) return;
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(fileData.processedVideo);
        
        // 仅支持MP4输出
        const baseName = fileData.name.replace(/\.(mp4|avi|mov|mkv|webm)$/i, '');
        a.download = `${baseName}_interpolated.mp4`;
        
        a.click();
        URL.revokeObjectURL(a.href);
    }
    
    toggleCompareView() {
        const isComparing = this.compareView && this.compareView.style.display !== 'none';
        
        if (isComparing) {
            // 切换回单视频视图
            if (this.singleVideoView) this.singleVideoView.style.display = 'block';
            if (this.compareView) this.compareView.style.display = 'none';
            if (this.compareBtn) this.compareBtn.textContent = '左右对比';
        } else {
            // 切换到对比视图
            if (this.singleVideoView) this.singleVideoView.style.display = 'none';
            if (this.compareView) this.compareView.style.display = 'block';
            if (this.compareBtn) this.compareBtn.textContent = '单视频视图';
        }
    }
    
    setupVideoSync() {
        if (!this.compareOriginalMain || !this.compareProcessedMain) return;
        
        const videos = [this.compareOriginalMain, this.compareProcessedMain];
        
        // 同步播放
        videos.forEach((video, index) => {
            const otherVideo = videos[1 - index];
            
            video.addEventListener('play', () => {
                if (otherVideo.paused) {
                    otherVideo.currentTime = video.currentTime;
                    otherVideo.play().catch(e => console.log('无法同步播放:', e));
                }
            });
            
            video.addEventListener('pause', () => {
                if (!otherVideo.paused) {
                    otherVideo.pause();
                }
            });
            
            video.addEventListener('seeked', () => {
                if (Math.abs(otherVideo.currentTime - video.currentTime) > 0.1) {
                    otherVideo.currentTime = video.currentTime;
                }
            });
        });
    }
    
    async downloadFile(fileId) {
        const fileData = this.fileList.find(f => f.id === fileId);
        if (!fileData || !fileData.processedVideo) return;
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(fileData.processedVideo);
        
        // 仅支持MP4输出
        const baseName = fileData.name.replace(/\.(mp4|avi|mov|mkv|webm)$/i, '');
        a.download = `${baseName}_interpolated.mp4`;
        
        a.click();
        URL.revokeObjectURL(a.href);
    }
    
    removeFile(fileId) {
        const index = this.fileList.findIndex(f => f.id === fileId);
        if (index !== -1) {
            this.fileList.splice(index, 1);
            this.renderFileList();
            this.updateButtons();
        }
    }
    
    compareFile(fileId) {
        const fileData = this.fileList.find(f => f.id === fileId);
        if (!fileData || !fileData.processedVideo || !fileData.originalVideo) {
            alert('视频数据不完整，无法对比');
            return;
        }
        
        this.currentComparisonFile = fileData;
        this.showComparisonModal();
    }
    
    showComparisonModal() {
        // 创建模态框
        const modal = document.createElement('div');
        modal.className = 'comparison-modal';
        modal.id = 'comparisonModal';
        
        modal.innerHTML = `
            <div class="comparison-modal-content">
                <div class="comparison-modal-header">
                    <button class="nav-btn" id="prevFileBtn" ${this.getPrevFileId() ? '' : 'disabled'}>◀</button>
                    <div class="modal-title-group">
                        <h2>视频对比查看</h2>
                        <div class="current-file-name">${this.currentComparisonFile.name}</div>
                    </div>
                    <button class="nav-btn" id="nextFileBtn" ${this.getNextFileId() ? '' : 'disabled'}>▶</button>
                    <button class="close-modal" id="closeModalBtn">✕</button>
                </div>
                
                <div class="comparison-video-container">
                    <div class="video-side">
                        <div class="video-label">原始视频</div>
                        <video id="originalVideo" controls loop muted autoplay></video>
                        <div class="video-stats" id="originalStats"></div>
                    </div>
                    <div class="video-divider"></div>
                    <div class="video-side">
                        <div class="video-label">处理后视频 (${this.frameMultiplierSelect?.value || '60'}fps)</div>
                        <video id="processedVideo" controls loop muted autoplay></video>
                        <div class="video-stats" id="processedStats"></div>
                    </div>
                </div>
                
                <div class="comparison-controls">
                    <button class="sync-btn" id="syncVideos">同步播放</button>
                    <label><input type="checkbox" id="syncPlayback" checked> 同步控制</label>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 加载视频
        const originalVideo = document.getElementById('originalVideo');
        const processedVideo = document.getElementById('processedVideo');
        
        originalVideo.src = URL.createObjectURL(this.currentComparisonFile.originalVideo);
        processedVideo.src = URL.createObjectURL(this.currentComparisonFile.processedVideo);
        
        // 同步播放控制
        const syncCheckbox = document.getElementById('syncPlayback');
        const syncBtn = document.getElementById('syncVideos');
        
        const syncPlayback = () => {
            if (syncCheckbox.checked) {
                processedVideo.currentTime = originalVideo.currentTime;
            }
        };
        
        originalVideo.addEventListener('play', () => {
            if (syncCheckbox.checked) processedVideo.play();
        });
        
        originalVideo.addEventListener('pause', () => {
            if (syncCheckbox.checked) processedVideo.pause();
        });
        
        originalVideo.addEventListener('seeked', syncPlayback);
        
        syncBtn.addEventListener('click', () => {
            processedVideo.currentTime = originalVideo.currentTime;
            if (originalVideo.paused) {
                originalVideo.play();
                processedVideo.play();
            }
        });
        
        // 显示视频信息
        originalVideo.addEventListener('loadedmetadata', () => {
            document.getElementById('originalStats').innerHTML = `
                分辨率: ${originalVideo.videoWidth} × ${originalVideo.videoHeight}<br>
                时长: ${originalVideo.duration.toFixed(2)}秒
            `;
        });
        
        processedVideo.addEventListener('loadedmetadata', () => {
            document.getElementById('processedStats').innerHTML = `
                分辨率: ${processedVideo.videoWidth} × ${processedVideo.videoHeight}<br>
                时长: ${processedVideo.duration.toFixed(2)}秒
            `;
        });
        
        // 关闭按钮
        document.getElementById('closeModalBtn').addEventListener('click', () => {
            this.closeComparisonModal();
        });
        
        // 导航按钮
        document.getElementById('prevFileBtn').addEventListener('click', () => {
            this.navigateComparison('prev');
        });
        
        document.getElementById('nextFileBtn').addEventListener('click', () => {
            this.navigateComparison('next');
        });
        
        // ESC键关闭
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                this.closeComparisonModal();
                document.removeEventListener('keydown', handleEsc);
            }
        };
        document.addEventListener('keydown', handleEsc);
    }
    
    closeComparisonModal() {
        const modal = document.getElementById('comparisonModal');
        if (modal) {
            // 清理video URLs
            const videos = modal.querySelectorAll('video');
            videos.forEach(video => {
                if (video.src) URL.revokeObjectURL(video.src);
            });
            modal.remove();
        }
    }
    
    getPrevFileId() {
        const currentIndex = this.fileList.findIndex(f => f.id === this.currentComparisonFile?.id);
        if (currentIndex > 0) {
            const prevFile = this.fileList[currentIndex - 1];
            return prevFile.status === 'completed' ? prevFile.id : null;
        }
        return null;
    }
    
    getNextFileId() {
        const currentIndex = this.fileList.findIndex(f => f.id === this.currentComparisonFile?.id);
        if (currentIndex < this.fileList.length - 1) {
            const nextFile = this.fileList[currentIndex + 1];
            return nextFile.status === 'completed' ? nextFile.id : null;
        }
        return null;
    }
    
    navigateComparison(direction) {
        const fileId = direction === 'prev' ? this.getPrevFileId() : this.getNextFileId();
        if (fileId) {
            this.closeComparisonModal();
            this.compareFile(fileId);
        }
    }
    
    // ========== Topaz风格后处理增强 ==========
    
    enhanceFrame(imageData, options = {}) {
        // 🎨 Topaz风格：多级后处理增强
        const {
            sharpen = 0,      // 0-100: 锐化强度
            denoise = 0,      // 0-100: 降噪强度
            grain = 0,        // 0-100: 胶片颗粒
            contrast = 0      // -100到100: 对比度调整
        } = options;
        
        let enhanced = imageData;
        
        // 1. 自适应锐化（类似Theia）
        if (sharpen > 0) {
            enhanced = this.adaptiveSharpen(enhanced, sharpen / 100);
        }
        
        // 2. 降噪（类似Proteus/Nyx）
        if (denoise > 0) {
            enhanced = this.simpleDenoiseFrame(enhanced, denoise / 100);
        }
        
        // 3. 对比度增强
        if (contrast !== 0) {
            enhanced = this.adjustContrast(enhanced, contrast / 100);
        }
        
        // 4. 胶片颗粒（艺术效果）
        if (grain > 0) {
            enhanced = this.addFilmGrain(enhanced, grain / 100);
        }
        
        return enhanced;
    }
    
    adaptiveSharpen(imageData, strength) {
        // 🔪 自适应非锐化蒙版（Unsharp Mask）- Topaz Theia风格
        // 检测边缘并只在边缘区域锐化，避免噪点放大
        const { width, height, data } = imageData;
        const sharpened = new ImageData(width, height);
        
        // Laplacian核用于边缘检测
        const kernel = [
            0, -1, 0,
            -1, 5, -1,
            0, -1, 0
        ];
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // 检测边缘强度（局部梯度）
                let edgeStrength = 0;
                for (let c = 0; c < 3; c++) {
                    const center = data[idx + c];
                    const left = data[idx - 4 + c];
                    const right = data[idx + 4 + c];
                    const top = data[idx - width * 4 + c];
                    const bottom = data[idx + width * 4 + c];
                    edgeStrength += Math.abs(center - left) + Math.abs(center - right) +
                                   Math.abs(center - top) + Math.abs(center - bottom);
                }
                edgeStrength /= (3 * 4 * 255); // 归一化到[0,1]
                
                // 自适应锐化：边缘区域强，平坦区域弱
                const adaptiveStrength = strength * Math.min(edgeStrength * 2, 1);
                
                // 应用Laplacian锐化
                for (let c = 0; c < 3; c++) {
                    let sum = 0;
                    let ki = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const pixelIdx = ((y + ky) * width + (x + kx)) * 4 + c;
                            sum += data[pixelIdx] * kernel[ki++];
                        }
                    }
                    
                    // 混合原始和锐化结果
                    const original = data[idx + c];
                    const sharpValue = original + (sum - original) * adaptiveStrength;
                    sharpened.data[idx + c] = Math.max(0, Math.min(255, sharpValue));
                }
                
                sharpened.data[idx + 3] = 255; // Alpha
            }
        }
        
        // 复制边缘像素
        for (let x = 0; x < width; x++) {
            const topIdx = x * 4;
            const bottomIdx = ((height - 1) * width + x) * 4;
            for (let c = 0; c < 4; c++) {
                sharpened.data[topIdx + c] = data[topIdx + c];
                sharpened.data[bottomIdx + c] = data[bottomIdx + c];
            }
        }
        for (let y = 0; y < height; y++) {
            const leftIdx = y * width * 4;
            const rightIdx = (y * width + width - 1) * 4;
            for (let c = 0; c < 4; c++) {
                sharpened.data[leftIdx + c] = data[leftIdx + c];
                sharpened.data[rightIdx + c] = data[rightIdx + c];
            }
        }
        
        return sharpened;
    }
    
    simpleDenoiseFrame(imageData, strength) {
        // 🧹 简单双边滤波降噪 - 类似Proteus/Nyx
        // 保留边缘的同时平滑噪点
        const { width, height, data } = imageData;
        const denoised = new ImageData(width, height);
        
        const radius = 2;
        const spatialSigma = 2;
        const rangeSigma = 30 * (1 - strength * 0.5); // strength越大，范围sigma越小，降噪越强
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                
                let sumR = 0, sumG = 0, sumB = 0, sumWeight = 0;
                
                // 双边滤波窗口
                for (let ky = -radius; ky <= radius; ky++) {
                    for (let kx = -radius; kx <= radius; kx++) {
                        const ny = Math.max(0, Math.min(height - 1, y + ky));
                        const nx = Math.max(0, Math.min(width - 1, x + kx));
                        const nIdx = (ny * width + nx) * 4;
                        
                        // 空间距离权重（高斯）
                        const spatialDist = kx * kx + ky * ky;
                        const spatialWeight = Math.exp(-spatialDist / (2 * spatialSigma * spatialSigma));
                        
                        // 颜色相似度权重（高斯）
                        const colorDist = Math.pow(data[idx] - data[nIdx], 2) +
                                        Math.pow(data[idx + 1] - data[nIdx + 1], 2) +
                                        Math.pow(data[idx + 2] - data[nIdx + 2], 2);
                        const rangeWeight = Math.exp(-colorDist / (2 * rangeSigma * rangeSigma));
                        
                        const weight = spatialWeight * rangeWeight;
                        
                        sumR += data[nIdx] * weight;
                        sumG += data[nIdx + 1] * weight;
                        sumB += data[nIdx + 2] * weight;
                        sumWeight += weight;
                    }
                }
                
                // 混合降噪和原始（保留细节）
                const denoisedR = sumR / sumWeight;
                const denoisedG = sumG / sumWeight;
                const denoisedB = sumB / sumWeight;
                
                denoised.data[idx] = Math.round(data[idx] * (1 - strength) + denoisedR * strength);
                denoised.data[idx + 1] = Math.round(data[idx + 1] * (1 - strength) + denoisedG * strength);
                denoised.data[idx + 2] = Math.round(data[idx + 2] * (1 - strength) + denoisedB * strength);
                denoised.data[idx + 3] = 255;
            }
        }
        
        return denoised;
    }
    
    adjustContrast(imageData, adjustment) {
        // 📊 对比度调整 - 类似SDR转HDR的基础
        // adjustment: -1到1，负值降低对比度，正值增强对比度
        const { width, height, data } = imageData;
        const adjusted = new ImageData(width, height);
        
        const factor = (1 + adjustment) * (1 + adjustment);
        
        for (let i = 0; i < data.length; i += 4) {
            for (let c = 0; c < 3; c++) {
                // S曲线对比度调整
                const normalized = data[i + c] / 255;
                const adjustedValue = ((normalized - 0.5) * factor + 0.5);
                adjusted.data[i + c] = Math.max(0, Math.min(255, Math.round(adjustedValue * 255)));
            }
            adjusted.data[i + 3] = 255;
        }
        
        return adjusted;
    }
    
    addFilmGrain(imageData, intensity) {
        // 🎞️ 胶片颗粒效果 - Topaz艺术滤镜
        const { width, height, data } = imageData;
        const grainy = new ImageData(width, height);
        grainy.data.set(data);
        
        const grainAmount = intensity * 25; // 最大颗粒强度
        
        for (let i = 0; i < data.length; i += 4) {
            // 生成随机颗粒（高斯分布）
            const grain = (Math.random() + Math.random() - 1) * grainAmount;
            
            // 颗粒在中间调更明显（类似真实胶片）
            const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
            const midtoneFactor = 1 - Math.abs(luminance - 127.5) / 127.5;
            const adjustedGrain = grain * midtoneFactor;
            
            for (let c = 0; c < 3; c++) {
                grainy.data[i + c] = Math.max(0, Math.min(255, data[i + c] + adjustedGrain));
            }
        }
        
        return grainy;
    }
}

// 初始化
let videoInterpolation;
document.addEventListener('DOMContentLoaded', () => {
    videoInterpolation = new VideoFrameInterpolation();
});
