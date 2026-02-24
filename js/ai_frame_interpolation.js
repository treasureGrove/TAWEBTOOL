class AIFrameInterpolationTool {
    constructor() {
        this.fileList = [];
        this.isProcessing = false;
        this.selectedPreviewId = null;
        this.previewObjectUrl = null;

        this.profilePresets = {
            fast: { denoiseMul: 0.65, sharpenMul: 0.75, detailMul: 0.75 },
            balanced: { denoiseMul: 1.0, sharpenMul: 1.0, detailMul: 1.0 },
            detail: { denoiseMul: 0.85, sharpenMul: 1.2, detailMul: 1.25 }
        };

        this.aiProcessingDefault = true;
        this.interpSession = null;
        this.upscaleSession = null;
        this.interpSignature = null;
        this.upscaleSignature = null;
        this.upscaleModelInfo = null;
        this.isInterpModelLoading = false;
        this.isUpscaleModelLoading = false;
        this.interpHasTimeInput = false;
        this.strictGpuMode = true;
        this.modelCacheDBName = "TAWebTool_AIModels";
        this.modelCacheStore = "onnx_models_v1";
        // Optional CORS proxy prefix used as a fallback when direct downloads are blocked.
        // Leave empty to avoid proxying by default. Example: "https://corsproxy.io/?"
        this.modelDownloadProxy = "";
        this.verifiedModelUrls = {
            interp: {
                // Verified downloadable ONNX bytes.
                // Remote lightweight RIFE model (direct raw GitHub link)
                rife: [
                    "https://raw.githubusercontent.com/hpc203/Real-Time-Frame-Interpolation-onnxrun/main/RIFE_HDv3.onnx"
                ],
                film: []
            },
            upscale: {
                esrgan: [
                    // Remote Real-ESRGAN General model (Hugging Face resolve)
                    // 指定到 commit 的精确下载链接（用户提供）
                    "https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3/resolve/8afb649e7a9db2636188a040918af9811593b98e/Real-ESRGAN-General-x4v3.onnx?download=true",
                    // 若上面链接失效，再尝试 main 分支的 resolve 链接
                    "https://huggingface.co/qualcomm/Real-ESRGAN-General-x4v3/resolve/main/Real-ESRGAN-General-x4v3.onnx?download=true"
                ]
            }
        };

        this.init();
    }

    init() {
        this.uploadArea = document.getElementById("uploadArea");
        this.fileInput = document.getElementById("fileInput");
        this.fileListContainer = document.getElementById("fileList");
        this.processBtn = document.getElementById("processBtn");
        this.clearBtn = document.getElementById("clearBtn");
        this.downloadAllBtn = document.getElementById("downloadAllBtn");

        this.modelPreset = document.getElementById("modelPreset");
        this.interpModelType = document.getElementById("interpModelType");
        this.upscaleModelType = document.getElementById("upscaleModelType");
        this.loadInterpModelBtn = document.getElementById("loadInterpModelBtn");
        this.loadUpscaleModelBtn = document.getElementById("loadUpscaleModelBtn");
        this.uploadInterpModelBtn = document.getElementById("uploadInterpModelBtn");
        this.uploadUpscaleModelBtn = document.getElementById("uploadUpscaleModelBtn");
        this.interpModelFileInput = document.getElementById("interpModelFileInput");
        this.upscaleModelFileInput = document.getElementById("upscaleModelFileInput");
        this.interpModelStatus = document.getElementById("interpModelStatus");
        this.upscaleModelStatus = document.getElementById("upscaleModelStatus");
        this.frameMultiplier = document.getElementById("frameMultiplier");
        this.sourceFps = document.getElementById("sourceFps");
        this.upscaleFactor = document.getElementById("upscaleFactor");
        this.outputFormat = document.getElementById("outputFormat");
        this.debug3s = document.getElementById("debug3s");

        this.denoiseStrength = document.getElementById("denoiseStrength");
        this.sharpenStrength = document.getElementById("sharpenStrength");
        this.detailStrength = document.getElementById("detailStrength");
        this.denoiseValue = document.getElementById("denoiseValue");
        this.sharpenValue = document.getElementById("sharpenValue");
        this.detailValue = document.getElementById("detailValue");

        this.progressContainer = document.getElementById("progressContainer");
        this.progressFill = document.getElementById("progressFill");
        this.progressText = document.getElementById("progressText");

        this.previewBefore = document.getElementById("previewBefore");
        this.previewAfter = document.getElementById("previewAfter");
        this.previewFileName = document.getElementById("previewFileName");
        this.previewMetrics = document.getElementById("previewMetrics");
        this.compareSlider = document.getElementById("compareSlider");
        this.compareDivider = document.getElementById("compareDivider");
        this.syncLock = false;

        this.bindEvents();
        this.bindPreviewSyncEvents();
        this.syncSliderLabels();
        this.updateCompareView();
        this.updateButtons();
        this.prepareOrtRuntime().catch((e) => {
            console.warn("ORT runtime preload failed:", e);
        });
        this.autoLoadModels();
    }

    bindEvents() {
        this.uploadArea.addEventListener("click", () => this.fileInput.click());
        this.fileInput.addEventListener("change", (e) => this.handleFiles(e.target.files));

        ["dragenter", "dragover"].forEach((eventName) => {
            this.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.uploadArea.classList.add("drag-over");
            });
        });

        ["dragleave", "drop"].forEach((eventName) => {
            this.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.uploadArea.classList.remove("drag-over");
            });
        });

        this.uploadArea.addEventListener("drop", (e) => {
            this.handleFiles(e.dataTransfer.files);
        });

        this.processBtn.addEventListener("click", () => this.processAll());
        this.clearBtn.addEventListener("click", () => this.clearAll());
        this.downloadAllBtn.addEventListener("click", () => this.downloadAll());
        this.loadInterpModelBtn.addEventListener("click", () => this.loadInterpolationModel());
        this.loadUpscaleModelBtn.addEventListener("click", () => this.loadUpscaleModel());
        if (this.uploadInterpModelBtn && this.interpModelFileInput) {
            this.uploadInterpModelBtn.addEventListener("click", () => this.interpModelFileInput.click());
            this.interpModelFileInput.addEventListener("change", (e) => this.handleInterpModelFile(e.target.files[0]));
        }
        if (this.uploadUpscaleModelBtn && this.upscaleModelFileInput) {
            this.uploadUpscaleModelBtn.addEventListener("click", () => this.upscaleModelFileInput.click());
            this.upscaleModelFileInput.addEventListener("change", (e) => this.handleUpscaleModelFile(e.target.files[0]));
        }

        [this.denoiseStrength, this.sharpenStrength, this.detailStrength].forEach((slider) => {
            slider.addEventListener("input", () => this.syncSliderLabels());
        });

        this.compareSlider.addEventListener("input", () => this.updateCompareView());
        this.sourceFps.addEventListener("input", () => {
            const selected = this.fileList.find((f) => f.id === this.selectedPreviewId);
            if (selected && this.previewMetrics) {
                this.previewMetrics.textContent = this.formatPreviewMetrics(selected);
            }
        });
        // Ensure frame multiplier options reflect model capabilities and source fps
        this.refreshFrameMultiplierOptions();
        this.sourceFps.addEventListener("change", () => this.refreshFrameMultiplierOptions());
    }

    refreshFrameMultiplierOptions() {
        // If interp model lacks time input, only present 1x/2x options (as target fps values)
        const sel = this.frameMultiplier;
        if (!sel) return;
        const srcFps = Math.max(8, Math.min(120, Number(this.sourceFps.value) || 30));
        sel.innerHTML = "";
        if (!this.interpHasTimeInput) {
            const opt1 = document.createElement("option");
            opt1.value = String(Math.round(srcFps));
            opt1.textContent = `原始 (${Math.round(srcFps)} fps, 1x)`;
            const opt2 = document.createElement("option");
            opt2.value = String(Math.round(srcFps * 2));
            opt2.textContent = `2x (${Math.round(srcFps * 2)} fps, 稳定支持)`;
            sel.appendChild(opt1);
            sel.appendChild(opt2);
            // default to 2x for models without time input
            sel.value = String(Math.round(srcFps * 2));
        } else {
            // Model supports time input — show common target fps choices
            const fpsOptions = [24, 25, 30, 60, 90, 120];
            fpsOptions.forEach((f) => {
                const o = document.createElement("option");
                o.value = String(f);
                o.textContent = `${f} fps`;
                sel.appendChild(o);
            });
            // try to keep previous selection where reasonable
            const prev = Number(sel.getAttribute("data-prev") || 0);
            if (prev && fpsOptions.includes(prev)) sel.value = String(prev);
            else sel.value = "30";
        }
        sel.setAttribute("data-prev", String(Number(sel.value) || 30));
    }

    bindPreviewSyncEvents() {
        const mirrorState = (source, target, mode) => {
            if (this.syncLock) return;
            this.syncLock = true;
            try {
                const targetReady = !!target.src;
                if (mode === "play") {
                    if (!targetReady) return;
                    target.currentTime = source.currentTime;
                    target.playbackRate = source.playbackRate;
                    target.play().catch(() => {});
                } else if (mode === "pause") {
                    if (!targetReady) return;
                    target.pause();
                    target.currentTime = source.currentTime;
                } else if (mode === "seek") {
                    if (!targetReady) return;
                    target.currentTime = source.currentTime;
                } else if (mode === "rate") {
                    if (!targetReady) return;
                    target.playbackRate = source.playbackRate;
                }
            } catch (error) {
                console.warn("Preview sync skipped:", error);
            } finally {
                setTimeout(() => {
                    this.syncLock = false;
                }, 0);
            }
        };

        const pairs = [
            [this.previewBefore, this.previewAfter],
            [this.previewAfter, this.previewBefore]
        ];

        pairs.forEach(([a, b]) => {
            a.addEventListener("play", () => mirrorState(a, b, "play"));
            a.addEventListener("pause", () => mirrorState(a, b, "pause"));
            a.addEventListener("seeking", () => mirrorState(a, b, "seek"));
            a.addEventListener("ratechange", () => mirrorState(a, b, "rate"));
        });
    }

    syncSliderLabels() {
        this.denoiseValue.textContent = this.denoiseStrength.value;
        this.sharpenValue.textContent = this.sharpenStrength.value;
        this.detailValue.textContent = this.detailStrength.value;
    }

    updateCompareView() {
        const value = Number(this.compareSlider.value);
        this.previewAfter.style.clipPath = `inset(0 0 0 ${value}%)`;
        this.compareDivider.style.left = `${value}%`;
    }

    handleFiles(files) {
        const validFiles = Array.from(files).filter((file) => file.type.startsWith("video/"));
        if (!validFiles.length) {
            alert("请选择视频文件");
            return;
        }

        validFiles.forEach((file) => {
            const fileData = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                file,
                name: file.name,
                size: file.size,
                status: "pending",
                progress: 0,
                error: "",
                sourceUrl: URL.createObjectURL(file),
                resultUrl: "",
                outputExt: "mp4",
                resultMeta: null,
                meta: null
            };
            this.fileList.push(fileData);
        });

        this.renderFileList();
        this.updateButtons();

        if (!this.selectedPreviewId && this.fileList.length > 0) {
            this.selectPreviewFile(this.fileList[0].id);
        }
    }

    renderFileList() {
        this.fileListContainer.innerHTML = "";

        this.fileList.forEach((item) => {
            const row = document.createElement("div");
            row.className = `file-item${this.selectedPreviewId === item.id ? " active" : ""}`;
            row.dataset.id = item.id;

            const statusTextMap = {
                pending: "待处理",
                processing: "处理中",
                completed: "已完成",
                error: "失败"
            };

            row.innerHTML = `
                <div class="file-head">
                    <div class="file-name" title="${item.name}">${item.name}</div>
                    <div class="file-size">${this.formatFileSize(item.size)}</div>
                </div>
                <div class="file-meta">${item.meta ? `${item.meta.width}x${item.meta.height} | ${item.meta.duration.toFixed(2)}s` : "等待读取视频信息"}</div>
                <div class="file-status">
                    <span class="status-badge ${item.status}">${statusTextMap[item.status]}</span>
                    <span>${item.status === "processing" ? `${item.progress}%` : item.error || ""}</span>
                </div>
                <div class="file-actions">
                    <button class="btn-preview">预览</button>
                    <button class="btn-download" ${item.status === "completed" ? "" : "disabled"}>下载</button>
                    <button class="btn-remove" ${this.isProcessing ? "disabled" : ""}>删除</button>
                </div>
            `;

            row.querySelector(".btn-preview").addEventListener("click", () => this.selectPreviewFile(item.id));
            row.querySelector(".btn-download").addEventListener("click", () => this.downloadFile(item));
            row.querySelector(".btn-remove").addEventListener("click", () => this.removeFile(item.id));

            this.fileListContainer.appendChild(row);
        });
    }

    async ensureFileMeta(fileData) {
        if (fileData.meta) return fileData.meta;

        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = fileData.sourceUrl;

        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error("视频元数据读取失败"));
        });

        fileData.meta = {
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration
        };

        return fileData.meta;
    }

    setInterpStatus(text, state = "warn") {
        this.interpModelStatus.textContent = text;
        this.interpModelStatus.style.color = state === "ok" ? "#15803d" : state === "error" ? "#b91c1c" : "#64748b";
    }

    setUpscaleStatus(text, state = "warn") {
        this.upscaleModelStatus.textContent = text;
        this.upscaleModelStatus.style.color = state === "ok" ? "#15803d" : state === "error" ? "#b91c1c" : "#64748b";
    }

    async createOrtSessionFromFile(file, preferredProviders = ["webgpu", "wasm"]) {
        if (!file) throw new Error("未选择模型文件");
        await this.prepareOrtRuntime();
        if (typeof ort === "undefined") throw new Error("ONNX Runtime 未加载");
        const data = await file.arrayBuffer();
        const options = {
            executionProviders: this.getStableExecutionProviders(preferredProviders),
            graphOptimizationLevel: "all"
        };
        return ort.InferenceSession.create(data, options);
    }

    async prepareOrtRuntime() {
        if (location.protocol === "file:") {
            throw new Error("当前是 file:// 打开页面，WebGPU/ONNX 无法稳定工作。请用 http://localhost 启动后再试。");
        }
        if (typeof ort === "undefined") {
            await this.ensureOrtScriptLoaded();
        }
        if (typeof ort === "undefined") {
            throw new Error("ONNX Runtime 脚本加载失败");
        }

        if (!this._ortConfigured) {
            // WebGPU mode: keep wasm as transfer/runtime helper, single-threaded for compatibility.
            ort.env.wasm.numThreads = 1;
            ort.env.wasm.simd = true;
            ort.env.wasm.proxy = false;

            // Domestic-friendly CDN first.
            ort.env.wasm.wasmPaths = "https://fastly.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/";
            this._ortConfigured = true;
        }
    }

    async ensureOrtScriptLoaded() {
        const urls = [
            "https://fastly.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.webgpu.min.js",
            "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.17.1/dist/ort.webgpu.min.js",
            "https://unpkg.com/onnxruntime-web@1.17.1/dist/ort.webgpu.min.js"
        ];

        for (const url of urls) {
            try {
                await this.loadScript(url);
                if (typeof ort !== "undefined") return;
            } catch (error) {
                console.warn("ORT script load failed:", url, error);
            }
        }
        throw new Error("无法从可用CDN加载 ONNX Runtime");
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`脚本加载失败: ${src}`));
            document.head.appendChild(script);
        });
    }

    getStableExecutionProviders(preferredProviders = ["wasm"]) {
        if (this.strictGpuMode) {
            return ["webgpu"];
        }
        if (Array.isArray(preferredProviders) && preferredProviders.length) {
            return preferredProviders;
        }
        return ["webgpu", "wasm"];
    }

    async openModelCacheDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.modelCacheDBName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.modelCacheStore)) {
                    db.createObjectStore(this.modelCacheStore);
                }
            };
        });
    }

    async getModelFromCache(cacheKey) {
        try {
            const db = await this.openModelCacheDB();
            return await new Promise((resolve, reject) => {
                const tx = db.transaction([this.modelCacheStore], "readonly");
                const store = tx.objectStore(this.modelCacheStore);
                const req = store.get(cacheKey);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch (error) {
            console.warn("读取模型缓存失败:", error);
            return null;
        }
    }

    async saveModelToCache(cacheKey, arrayBuffer) {
        try {
            const db = await this.openModelCacheDB();
            await new Promise((resolve, reject) => {
                const tx = db.transaction([this.modelCacheStore], "readwrite");
                const store = tx.objectStore(this.modelCacheStore);
                store.put(arrayBuffer, cacheKey);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        } catch (error) {
            console.warn("写入模型缓存失败:", error);
        }
    }

    async downloadModelArrayBufferWithProgress(url, onProgress) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`下载失败: HTTP ${response.status}`);
        }
        if (!response.body) {
            return response.arrayBuffer();
        }
        const contentLength = Number(response.headers.get("content-length") || 0);
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.byteLength;
            if (onProgress && contentLength > 0) {
                onProgress(loaded, contentLength);
            }
        }
        const merged = new Uint8Array(loaded);
        let offset = 0;
        for (const c of chunks) {
            merged.set(c, offset);
            offset += c.byteLength;
        }
        return merged.buffer;
    }

    async createOrtSessionFromUrl(url, setStatus) {
        await this.prepareOrtRuntime();
        // Normalize Hugging Face URLs to force file download and use normalized URL as cache key.
        let fetchUrl = url;
        if (typeof url === "string" && url.includes("huggingface.co") && !/download=/.test(url)) {
            fetchUrl = url + (url.includes("?") ? "&" : "?") + "download=true";
        }
        const cacheKey = `url:${fetchUrl}`;
        let data = await this.getModelFromCache(cacheKey);
        if (data) {
            setStatus("命中本地缓存，正在加载模型...");
        } else {
            try {
                data = await this.downloadModelArrayBufferWithProgress(fetchUrl, (loaded, total) => {
                    const percent = ((loaded / total) * 100).toFixed(1);
                    const loadedMB = (loaded / 1024 / 1024).toFixed(1);
                    const totalMB = (total / 1024 / 1024).toFixed(1);
                    setStatus(`下载中 ${loadedMB}MB/${totalMB}MB (${percent}%)`);
                });
                await this.saveModelToCache(cacheKey, data);
            } catch (err) {
                console.warn("直接下载模型失败，尝试代理重试：", err && err.message);
                // If the source is huggingface and proxy is available, try proxying the request.
                    const isHf = typeof url === "string" && url.includes("huggingface.co");
                const proxyPrefix = this.modelDownloadProxy || "";
                if (isHf && proxyPrefix) {
                    const proxyUrl = proxyPrefix + encodeURIComponent(fetchUrl);
                    setStatus("直接下载失败，正在通过代理重试...");
                    data = await this.downloadModelArrayBufferWithProgress(proxyUrl, (loaded, total) => {
                        const percent = ((loaded / total) * 100).toFixed(1);
                        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
                        const totalMB = (total / 1024 / 1024).toFixed(1);
                        setStatus(`代理下载中 ${loadedMB}MB/${totalMB}MB (${percent}%)`);
                    });
                    await this.saveModelToCache(cacheKey, data);
                } else if (isHf && !proxyPrefix) {
                    // try a sensible public proxy automatically
                    const fallback = `https://corsproxy.io/?${encodeURIComponent(fetchUrl)}`;
                    setStatus("直接下载失败，正在通过公共代理重试...");
                    data = await this.downloadModelArrayBufferWithProgress(fallback, (loaded, total) => {
                        const percent = ((loaded / total) * 100).toFixed(1);
                        const loadedMB = (loaded / 1024 / 1024).toFixed(1);
                        const totalMB = (total / 1024 / 1024).toFixed(1);
                        setStatus(`公共代理下载中 ${loadedMB}MB/${totalMB}MB (${percent}%)`);
                    });
                    await this.saveModelToCache(cacheKey, data);
                } else {
                    throw err;
                }
            }
        }
        if (data.byteLength < 1024 * 1024) {
            throw new Error("模型文件异常（体积过小）");
        }
        if (typeof ort === "undefined") {
            throw new Error("ONNX Runtime 未加载");
        }
        return ort.InferenceSession.create(data, {
            executionProviders: this.getStableExecutionProviders(["wasm"]),
            graphOptimizationLevel: "all"
        });
    }

    detectInterpolationSignature(session, mode = "auto") {
        const inputNames = session.inputNames || [];
        if (mode === "rife") return "rife";
        if (mode === "film") return "film";
        if (inputNames.some((n) => /img0|img1|timestep|time_step/i.test(n))) return "rife";
        if (inputNames.some((n) => /x0|x1|time|dt/i.test(n))) return "film";
        return "rife";
    }

    detectUpscaleSignature(_session, mode = "auto") {
        if (mode === "esrgan") return "esrgan";
        return "esrgan";
    }

    inspectUpscaleModel(session) {
        const inputName = (session.inputNames && session.inputNames[0]) || "input";
        const outputName = (session.outputNames && session.outputNames[0]) || "output";
        const inputMetaAll = session.inputMetadata || {};
        const inMeta = inputMetaAll[inputName] || {};
        const inDims = (inMeta && inMeta.dimensions) ? inMeta.dimensions : [];
        const parseDim = (v) => {
            const n = Number(v);
            return Number.isFinite(n) && n > 0 ? n : null;
        };
        const inH = parseDim(inDims[inDims.length - 2]);
        const inW = parseDim(inDims[inDims.length - 1]);
        return {
            inputName,
            outputName,
            fixedInputH: inH && inH > 0 ? inH : null,
            fixedInputW: inW && inW > 0 ? inW : null
        };
    }

    async loadInterpolationModel() {
        if (this.isInterpModelLoading) return;
        this.isInterpModelLoading = true;
        this.loadInterpModelBtn.disabled = true;
        try {
            this.setInterpStatus("加载补帧模型中...");
            const mode = this.interpModelType.value === "film" ? "film" : "rife";
            const url = this.verifiedModelUrls.interp[mode][0];
            if (!url) {
                throw new Error("当前模式没有可自动下载的已验证路径");
            }
            this.setInterpStatus("自动下载补帧模型...");
            this.interpSession = await this.createOrtSessionFromUrl(url, (t) => this.setInterpStatus(t));
            this.setInterpStatus(`补帧模型下载完成: ${url}`);
            this.interpSignature = this.detectInterpolationSignature(this.interpSession, this.interpModelType.value);
            this.interpHasTimeInput = this.interpSession.inputNames.some((n) => /time|timestep|dt/i.test(n));
            // Refresh UI options that depend on whether model has time input
            this.refreshFrameMultiplierOptions();
            this.setInterpStatus(`补帧模型已加载 (${this.interpSignature.toUpperCase()})`, "ok");
        } catch (error) {
            this.interpSession = null;
            this.interpSignature = null;
            this.interpHasTimeInput = false;
            this.setInterpStatus(`补帧模型加载失败: ${error.message}`, "error");
        } finally {
            this.isInterpModelLoading = false;
            this.loadInterpModelBtn.disabled = false;
            this.updateButtons();
        }
    }

    async loadUpscaleModel() {
        if (this.isUpscaleModelLoading) return;
        this.isUpscaleModelLoading = true;
        this.loadUpscaleModelBtn.disabled = true;
        try {
            this.setUpscaleStatus("加载放大模型中...");
            const mode = "esrgan";
            const url = this.verifiedModelUrls.upscale[mode][0];
            if (!url) {
                throw new Error("没有可自动下载的放大模型路径");
            }
            this.setUpscaleStatus("自动下载放大模型...");
            this.upscaleSession = await this.createOrtSessionFromUrl(url, (t) => this.setUpscaleStatus(t));
            this.setUpscaleStatus(`放大模型下载完成: ${url}`);
            this.upscaleSignature = this.detectUpscaleSignature(this.upscaleSession, this.upscaleModelType.value);
            this.upscaleModelInfo = this.inspectUpscaleModel(this.upscaleSession);
            this.setUpscaleStatus(`放大模型已加载 (${this.upscaleSignature.toUpperCase()})`, "ok");
        } catch (error) {
            this.upscaleSession = null;
            this.upscaleSignature = null;
            this.upscaleModelInfo = null;
            this.setUpscaleStatus(`放大模型加载失败: ${error.message}`, "error");
        } finally {
            this.isUpscaleModelLoading = false;
            this.loadUpscaleModelBtn.disabled = false;
            this.updateButtons();
        }
    }

    async handleInterpModelFile(file) {
        if (!file) return;
        try {
            this.isInterpModelLoading = true;
            this.loadInterpModelBtn.disabled = true;
            this.setInterpStatus("从本地文件加载补帧模型...");
            this.interpSession = await this.createOrtSessionFromFile(file, ["wasm"]);
            this.interpSignature = this.detectInterpolationSignature(this.interpSession, this.interpModelType.value);
            this.interpHasTimeInput = this.interpSession.inputNames.some((n) => /time|timestep|dt/i.test(n));
            this.setInterpStatus(`本地补帧模型已加载 (${this.interpSignature.toUpperCase()})`, "ok");
        } catch (e) {
            this.interpSession = null;
            this.interpSignature = null;
            this.interpHasTimeInput = false;
            this.setInterpStatus(`本地补帧模型加载失败: ${e.message}`, "error");
        } finally {
            this.isInterpModelLoading = false;
            this.loadInterpModelBtn.disabled = false;
            this.interpModelFileInput.value = "";
            this.updateButtons();
        }
    }

    async handleUpscaleModelFile(file) {
        if (!file) return;
        try {
            this.isUpscaleModelLoading = true;
            this.loadUpscaleModelBtn.disabled = true;
            this.setUpscaleStatus("从本地文件加载放大模型...");
            this.upscaleSession = await this.createOrtSessionFromFile(file, ["wasm"]);
            this.upscaleSignature = this.detectUpscaleSignature(this.upscaleSession, this.upscaleModelType.value);
            this.upscaleModelInfo = this.inspectUpscaleModel(this.upscaleSession);
            this.setUpscaleStatus(`本地放大模型已加载 (${this.upscaleSignature.toUpperCase()})`, "ok");
        } catch (e) {
            this.upscaleSession = null;
            this.upscaleSignature = null;
            this.upscaleModelInfo = null;
            this.setUpscaleStatus(`本地放大模型加载失败: ${e.message}`, "error");
        } finally {
            this.isUpscaleModelLoading = false;
            this.loadUpscaleModelBtn.disabled = false;
            this.upscaleModelFileInput.value = "";
            this.updateButtons();
        }
    }

    async autoLoadModels() {
        this.setInterpStatus("启动时自动加载补帧模型...");
        this.setUpscaleStatus("启动时自动加载放大模型...");
        await this.loadInterpolationModel();
        await this.loadUpscaleModel();
    }

    async processAll() {
        if (this.isProcessing) return;
        if (!this.interpSession || !this.upscaleSession) {
            alert("请先加载补帧ONNX和放大ONNX模型");
            return;
        }
        // If interp model lacks time input, ensure requested multiplier <= 2x
        const desiredTargetFps = Number(this.frameMultiplier.value);
        const srcFpsEstimate = Number(this.sourceFps.value) || 30;
        const desiredMultiplier = Math.max(1, Math.round(desiredTargetFps / srcFpsEstimate));
        if (!this.interpHasTimeInput && desiredMultiplier > 2) {
            alert("当前补帧模型不含time输入，仅稳定支持 2x。已将补帧设置为 2x 或请换支持 time 的模型。");
            return;
        }
        if (!this.fileList.some((f) => f.status === "pending" || f.status === "error")) {
            alert("没有可处理的视频");
            return;
        }

        this.isProcessing = true;
        this.updateButtons();
        this.progressContainer.style.display = "block";

        const targets = this.fileList.filter((f) => f.status === "pending" || f.status === "error");

        for (let i = 0; i < targets.length; i++) {
            const item = targets[i];
            try {
                item.status = "processing";
                item.progress = 0;
                item.error = "";
                this.renderFileList();

                const result = await this.processSingle(item, (progress, text) => {
                    item.progress = progress;
                    this.updateProgress(`(${i + 1}/${targets.length}) ${item.name} - ${text}`, progress);
                    this.renderFileList();
                });

                if (item.resultUrl) {
                    URL.revokeObjectURL(item.resultUrl);
                }

                item.resultUrl = result.url;
                item.outputExt = result.ext;
                item.resultMeta = result.meta || null;
                item.status = "completed";
                item.progress = 100;

                if (this.selectedPreviewId === item.id) {
                    this.selectPreviewFile(item.id);
                }
            } catch (error) {
                item.status = "error";
                item.error = error.message || "处理失败";
                console.error(error);
            }
            this.renderFileList();
        }

        this.updateProgress("处理完成", 100);
        setTimeout(() => {
            this.progressContainer.style.display = "none";
            this.progressFill.style.width = "0%";
        }, 1200);

        this.isProcessing = false;
        this.updateButtons();
    }

    async processSingle(fileData, onProgress) {
        const meta = await this.ensureFileMeta(fileData);

        const settings = {
            modelPreset: this.modelPreset.value,
            // `frameMultiplier` UI now holds the target fps (e.g. 30,60)
            targetFps: Number(this.frameMultiplier.value),
            sourceFps: this.clamp(Number(this.sourceFps.value) || 30, 8, 120),
            // `upscaleFactor` UI now holds presets (keep,1k,2k,4k)
            upscaleTarget: this.upscaleFactor.value,
            denoise: Number(this.denoiseStrength.value) / 100,
            sharpen: Number(this.sharpenStrength.value) / 100,
            detail: Number(this.detailStrength.value) / 100,
            outputFormat: this.outputFormat.value
        };
        // read debug flag (3s run)
        settings.debug3s = !!(this.debug3s && this.debug3s.checked);

        // determine numeric frameMultiplier used by internal algorithms (# of frames per source interval)
        // will be adjusted below depending on whether user set a different target fps
        settings.frameMultiplier = 1;

        // compute upscale factor from preset
        const upscaleMap = { "1k": 1280, "2k": 2048, "4k": 3840 };
        let computedFactor = 1;
        if (settings.upscaleTarget && settings.upscaleTarget !== "keep") {
            const tgtW = upscaleMap[settings.upscaleTarget];
            if (tgtW && meta && meta.width) {
                computedFactor = Math.max(1, tgtW / meta.width);
            }
        }
        settings.upscaleFactor = computedFactor;

        // If target fps is not set or equals source, default to source fps (no change)
        if (!settings.targetFps || Math.round(settings.targetFps) === Math.round(settings.sourceFps)) {
            settings.targetFps = settings.sourceFps;
            settings.frameMultiplier = 1;
        } else {
            settings.frameMultiplier = Math.max(1, Math.round(settings.targetFps / settings.sourceFps));
        }

        // If upscale preset is 'keep', ensure factor = 1
        if (settings.upscaleTarget === "keep") {
            settings.upscaleFactor = 1;
        }

        const profile = this.profilePresets[settings.modelPreset] || this.profilePresets.balanced;
        settings.denoise *= profile.denoiseMul;
        settings.sharpen *= profile.sharpenMul;
        settings.detail *= profile.detailMul;

        const width = meta.width;
        const height = meta.height;
        const outputWidth = this.makeEven(Math.max(2, Math.round(width * settings.upscaleFactor)));
        const outputHeight = this.makeEven(Math.max(2, Math.round(height * settings.upscaleFactor)));

        // If user didn't request any meaningful change (no upscale and no fps change),
        // skip heavy processing and return the original file as-is to avoid throwing errors.
        if (settings.upscaleFactor === 1 && Math.round(settings.targetFps) === Math.round(settings.sourceFps)) {
            onProgress(100, "未检测到需要处理的目标（跳过处理）");
            return {
                url: fileData.sourceUrl,
                ext: fileData.outputExt || fileData.name.split('.').pop() || "mp4",
                meta: {
                    outputWidth: width,
                    outputHeight: height,
                    outputFps: settings.sourceFps
                }
            };
        }

        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = fileData.sourceUrl;

        await new Promise((resolve, reject) => {
            video.onloadedmetadata = resolve;
            video.onerror = () => reject(new Error("视频加载失败"));
        });
        onProgress(2, "准备视频解码...");
        await this.waitForVideoReady(video);

        let srcFrameCount = Math.max(2, Math.floor(meta.duration * settings.sourceFps));
        // if debug 3s is enabled, limit to at most 3 seconds of source frames
        if (settings.debug3s) {
            const maxSrcFrames = Math.max(2, Math.floor(Math.min(3, meta.duration) * settings.sourceFps));
            srcFrameCount = Math.min(srcFrameCount, maxSrcFrames);
        }
        let outputFps = this.clamp(Math.round(settings.targetFps || Math.round(settings.sourceFps * settings.frameMultiplier)), 8, 240);
        const totalOutputFrames = (srcFrameCount - 1) * settings.frameMultiplier + 1;

        const srcCanvasA = document.createElement("canvas");
        srcCanvasA.width = width;
        srcCanvasA.height = height;
        const srcCtxA = srcCanvasA.getContext("2d", { willReadFrequently: true });

        const srcCanvasB = document.createElement("canvas");
        srcCanvasB.width = width;
        srcCanvasB.height = height;
        const srcCtxB = srcCanvasB.getContext("2d", { willReadFrequently: true });

        const mixCanvas = document.createElement("canvas");
        mixCanvas.width = width;
        mixCanvas.height = height;
        const mixCtx = mixCanvas.getContext("2d", { willReadFrequently: true });

        const enhancedCanvas = document.createElement("canvas");
        enhancedCanvas.width = width;
        enhancedCanvas.height = height;
        const enhancedCtx = enhancedCanvas.getContext("2d", { willReadFrequently: true });

        const outputCanvas = document.createElement("canvas");
        outputCanvas.width = outputWidth;
        outputCanvas.height = outputHeight;
        const outputCtx = outputCanvas.getContext("2d", { willReadFrequently: true });

        const sharpenCanvas = document.createElement("canvas");
        sharpenCanvas.width = outputWidth;
        sharpenCanvas.height = outputHeight;
        const sharpenCtx = sharpenCanvas.getContext("2d", { willReadFrequently: true });

        const motionCache = new Map();

        const prefer = settings.outputFormat;
        const canWebCodecs = typeof VideoEncoder !== "undefined" && typeof Mp4Muxer !== "undefined";
        const useMp4 = prefer === "mp4" || (prefer === "auto" && canWebCodecs);

        if (useMp4 && canWebCodecs) {
            return await this.encodeWithWebCodecs({
                video,
                width,
                height,
                outputWidth,
                outputHeight,
                srcFrameCount,
                totalOutputFrames,
                outputFps,
                settings,
                srcCtxA,
                srcCtxB,
                mixCtx,
                enhancedCtx,
                outputCtx,
                srcCanvasA,
                srcCanvasB,
                mixCanvas,
                enhancedCanvas,
                outputCanvas,
                sharpenCanvas,
                sharpenCtx,
                motionCache,
                onProgress
            });
        }

        return await this.encodeWithMediaRecorder({
            video,
            width,
            height,
            outputWidth,
            outputHeight,
            srcFrameCount,
            totalOutputFrames,
            outputFps,
            settings,
            srcCtxA,
            srcCtxB,
            mixCtx,
            enhancedCtx,
            outputCtx,
            srcCanvasA,
            srcCanvasB,
            mixCanvas,
            enhancedCanvas,
            outputCanvas,
            sharpenCanvas,
            sharpenCtx,
            motionCache,
            onProgress
        });
    }

    async encodeWithWebCodecs(ctx) {
        const codec = await this.pickVideoCodec(ctx.outputWidth, ctx.outputHeight, ctx.outputFps);
        const muxCodec = codec.startsWith("avc1") ? "avc" : codec.startsWith("vp09") ? "vp9" : "av1";

        const target = new Mp4Muxer.ArrayBufferTarget();
        const muxer = new Mp4Muxer.Muxer({
            target,
            video: {
                codec: muxCodec,
                width: ctx.outputWidth,
                height: ctx.outputHeight,
                frameRate: ctx.outputFps
            },
            firstTimestampBehavior: "offset",
            fastStart: "in-memory"
        });

        let frameIndex = 0;
        const encoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: (e) => {
                throw e;
            }
        });

        encoder.configure({
            codec,
            width: ctx.outputWidth,
            height: ctx.outputHeight,
            bitrate: Math.round(ctx.outputWidth * ctx.outputHeight * ctx.outputFps * 0.1),
            framerate: ctx.outputFps
        });

        const step = async (srcIdx, t) => {
            await this.buildEnhancedFrame(ctx, srcIdx, t);
            const ts = Math.round((frameIndex * 1_000_000) / ctx.outputFps);
            const duration = Math.round(1_000_000 / ctx.outputFps);
            const vf = new VideoFrame(ctx.outputCanvas, { timestamp: ts, duration });
            const keyEvery = Math.max(1, Math.floor(ctx.outputFps * 2));
            encoder.encode(vf, { keyFrame: frameIndex % keyEvery === 0 });
            vf.close();

            frameIndex += 1;
            const percent = Math.min(99, Math.round((frameIndex / ctx.totalOutputFrames) * 100));
            ctx.onProgress(percent, `编码帧 ${frameIndex}/${ctx.totalOutputFrames}`);
        };

        await this.renderFrameSequence(ctx, step);

        await encoder.flush();
        encoder.close();
        muxer.finalize();

        const blob = new Blob([target.buffer], { type: "video/mp4" });
        return {
            url: URL.createObjectURL(blob),
            ext: "mp4",
            meta: {
                outputWidth: ctx.outputWidth,
                outputHeight: ctx.outputHeight,
                outputFps: ctx.outputFps,
                sourceFps: ctx.settings.sourceFps
            }
        };
    }

    async encodeWithMediaRecorder(ctx) {
        const stream = ctx.outputCanvas.captureStream(ctx.outputFps);
        const chunks = [];
        const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
            ? "video/webm;codecs=vp9"
            : "video/webm;codecs=vp8";

        const recorder = new MediaRecorder(stream, { mimeType: mime });
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) chunks.push(event.data);
        };

        recorder.start(1000);

        let frameIndex = 0;
        const step = async (srcIdx, t) => {
            await this.buildEnhancedFrame(ctx, srcIdx, t);
            frameIndex += 1;
            const percent = Math.min(99, Math.round((frameIndex / ctx.totalOutputFrames) * 100));
            ctx.onProgress(percent, `回退编码 ${frameIndex}/${ctx.totalOutputFrames}`);
            await this.sleep(1000 / ctx.outputFps);
        };

        await this.renderFrameSequence(ctx, step);

        await new Promise((resolve) => {
            recorder.onstop = resolve;
            recorder.stop();
        });

        const blob = new Blob(chunks, { type: "video/webm" });
        return {
            url: URL.createObjectURL(blob),
            ext: "webm",
            meta: {
                outputWidth: ctx.outputWidth,
                outputHeight: ctx.outputHeight,
                outputFps: ctx.outputFps,
                sourceFps: ctx.settings.sourceFps
            }
        };
    }

    async renderFrameSequence(ctx, onEachOutputFrame) {
        const video = ctx.video;
        const sourceFps = this.clamp(ctx.settings.sourceFps, 8, 120);
        const srcFrameCount = Math.max(2, Math.floor(video.duration * sourceFps));
        if (srcFrameCount > 1200 && ctx.onProgress) {
            ctx.onProgress(3, `视频帧数较多（约${srcFrameCount}帧），处理中...`);
        }

        let frameAReady = false;
        let pairIndex = 0;

        for (let srcIdx = 0; srcIdx < srcFrameCount - 1; srcIdx++) {
            const tA = Math.min(video.duration, srcIdx / sourceFps);
            const tB = Math.min(video.duration, (srcIdx + 1) / sourceFps);

            if (!frameAReady) {
                await this.seekVideo(video, tA);
                ctx.srcCtxA.clearRect(0, 0, ctx.width, ctx.height);
                ctx.srcCtxA.drawImage(video, 0, 0, ctx.width, ctx.height);
                frameAReady = true;
            }

            await this.seekVideo(video, tB);
            ctx.srcCtxB.clearRect(0, 0, ctx.width, ctx.height);
            ctx.srcCtxB.drawImage(video, 0, 0, ctx.width, ctx.height);

            for (let k = 0; k < ctx.settings.frameMultiplier; k++) {
                const t = k / ctx.settings.frameMultiplier;
                await onEachOutputFrame(pairIndex, t);
            }

            // Yield regularly to keep UI responsive during long processing.
            if (srcIdx % 4 === 0) {
                await this.sleep(0);
            }

            pairIndex++;
            ctx.srcCtxA.clearRect(0, 0, ctx.width, ctx.height);
            ctx.srcCtxA.drawImage(ctx.srcCanvasB, 0, 0, ctx.width, ctx.height);
        }

        if (pairIndex > 0) {
            await onEachOutputFrame(pairIndex - 1, 1);
        }
    }

    async renderFrameSequenceRealtime(ctx, onEachOutputFrame) {
        const video = ctx.video;
        if (typeof video.requestVideoFrameCallback !== "function") {
            throw new Error("当前浏览器不支持实时解码补帧（requestVideoFrameCallback）");
        }

        await this.seekVideo(video, 0);

        let prevReady = false;
        let prevTime = 0;
        let pairIndex = 0;
        let finished = false;
        let frameCount = 0;
        const maxSourceFrames = Math.max(300, Math.ceil(video.duration * this.clamp(ctx.settings.sourceFps, 8, 120) * 2.2));

        const cleanup = () => {
            video.pause();
            video.currentTime = 0;
        };

        const ok = await new Promise((resolve) => {
            const finish = async (ok) => {
                if (finished) return;
                finished = true;
                if (prevReady && ok && pairIndex > 0) {
                    await onEachOutputFrame(Math.max(0, pairIndex - 1), 1);
                }
                cleanup();
                resolve(ok);
            };

            const step = async (_, meta) => {
                if (finished) return;
                try {
                    const mediaTime = meta && Number.isFinite(meta.mediaTime) ? meta.mediaTime : video.currentTime;
                    frameCount += 1;
                    if (frameCount > maxSourceFrames) {
                        await finish(false);
                        return;
                    }

                    ctx.srcCtxB.clearRect(0, 0, ctx.width, ctx.height);
                    ctx.srcCtxB.drawImage(video, 0, 0, ctx.width, ctx.height);

                    if (!prevReady) {
                        ctx.srcCtxA.clearRect(0, 0, ctx.width, ctx.height);
                        ctx.srcCtxA.drawImage(ctx.srcCanvasB, 0, 0, ctx.width, ctx.height);
                        prevReady = true;
                        prevTime = mediaTime;
                    } else {
                        const dt = Math.max(1 / Math.max(8, ctx.settings.sourceFps), mediaTime - prevTime);
                        const dynamicFrames = this.clamp(Math.round(dt * ctx.outputFps), 1, ctx.settings.frameMultiplier * 2);
                        for (let k = 0; k < dynamicFrames; k++) {
                            const t = k / dynamicFrames;
                            await onEachOutputFrame(pairIndex, t);
                        }

                        pairIndex += 1;
                        prevTime = mediaTime;
                        ctx.srcCtxA.clearRect(0, 0, ctx.width, ctx.height);
                        ctx.srcCtxA.drawImage(ctx.srcCanvasB, 0, 0, ctx.width, ctx.height);
                    }

                    if (video.ended) {
                        await finish(true);
                        return;
                    }

                    video.requestVideoFrameCallback(step);
                } catch (error) {
                    await finish(false);
                }
            };

            video.addEventListener("ended", () => {
                if (!finished) {
                    finish(true);
                }
            }, { once: true });

            video.requestVideoFrameCallback(step);
            video.play().catch(() => {
                finish(false);
            });
        });

        if (!ok) throw new Error("实时解码补帧失败");
        return true;
    }

    async buildEnhancedFrame(ctx, srcIdx, alpha) {
        const t = this.clamp(alpha, 0, 1);
        let interpImageData;

        if (t <= 0.00001) {
            interpImageData = ctx.srcCtxA.getImageData(0, 0, ctx.width, ctx.height);
        } else if (t >= 0.99999) {
            interpImageData = ctx.srcCtxB.getImageData(0, 0, ctx.width, ctx.height);
        } else {
            interpImageData = await this.runInterpolationModel(ctx, t);
        }

        ctx.mixCtx.putImageData(interpImageData, 0, 0);

        ctx.enhancedCtx.clearRect(0, 0, ctx.width, ctx.height);
        ctx.enhancedCtx.drawImage(ctx.mixCanvas, 0, 0);

        const upscaledImageData = await this.runUpscaleModel(ctx);
        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = ctx.outputWidth;
        tmpCanvas.height = ctx.outputHeight;
        const tmpCtx = tmpCanvas.getContext("2d", { willReadFrequently: true });
        tmpCtx.putImageData(upscaledImageData, 0, 0);
        ctx.outputCtx.clearRect(0, 0, ctx.outputWidth, ctx.outputHeight);
        ctx.outputCtx.drawImage(tmpCanvas, 0, 0);
    }

    imageDataToTensor(imageData) {
        const { width, height, data } = imageData;
        const tensorData = new Float32Array(3 * width * height);
        let ptr = 0;
        for (let c = 0; c < 3; c++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    tensorData[ptr++] = data[i + c] / 255;
                }
            }
        }
        return new ort.Tensor("float32", tensorData, [1, 3, height, width]);
    }

    tensorToImageData(tensor, width, height) {
        const out = new ImageData(width, height);
        const src = tensor.data;
        const hw = width * height;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const p = y * width + x;
                const i = p * 4;
                out.data[i] = this.clamp(Math.round(src[p] * 255), 0, 255);
                out.data[i + 1] = this.clamp(Math.round(src[hw + p] * 255), 0, 255);
                out.data[i + 2] = this.clamp(Math.round(src[2 * hw + p] * 255), 0, 255);
                out.data[i + 3] = 255;
            }
        }
        return out;
    }

    buildInterpolationFeeds(imageA, imageB, t) {
        const feeds = {};
        const inputNames = this.interpSession.inputNames;
        const imageTensorA = this.imageDataToTensor(imageA);
        const imageTensorB = this.imageDataToTensor(imageB);
        const timestepTensor = new ort.Tensor("float32", new Float32Array([t]), [1]);

        const imageInputs = inputNames.filter((n) => /img0|img1|x0|x1|input0|input1|frame0|frame1/i.test(n));
        if (imageInputs.length >= 2) {
            feeds[imageInputs[0]] = imageTensorA;
            feeds[imageInputs[1]] = imageTensorB;
        } else {
            const inputMetaAll = this.interpSession.inputMetadata || {};
            // Prefer inputs whose metadata indicate 4D tensors (N,C,H,W)
            const fourDInputs = inputNames.filter((n) => {
                const m = inputMetaAll[n];
                return m && Array.isArray(m.dimensions) && m.dimensions.length === 4;
            });
            if (fourDInputs.length >= 2) {
                feeds[fourDInputs[0]] = imageTensorA;
                feeds[fourDInputs[1]] = imageTensorB;
            } else {
                // Fallback: choose the two inputs with the largest estimated tensor size
                const candidates = inputNames.map((n) => {
                    const m = inputMetaAll[n] || {};
                    const dims = Array.isArray(m.dimensions) ? m.dimensions.map((v) => Number(v) || 0) : [];
                    const prod = dims.length ? dims.reduce((a, b) => a * (b || 1), 1) : 0;
                    return { name: n, dims, prod };
                });
                candidates.sort((a, b) => b.prod - a.prod);
                if (candidates.length >= 2 && candidates[0].prod > 1 && candidates[1].prod > 1) {
                    feeds[candidates[0].name] = imageTensorA;
                    feeds[candidates[1].name] = imageTensorB;
                } else if (inputNames.length >= 2) {
                    // As a last resort, use the first two inputs
                    feeds[inputNames[0]] = imageTensorA;
                    feeds[inputNames[1]] = imageTensorB;
                } else {
                    throw new Error("补帧模型输入签名不匹配（需要两路图像输入）");
                }
            }
        }

        const tName = inputNames.find((n) => /time|timestep|dt/i.test(n));
        if (tName) {
            feeds[tName] = timestepTensor;
        } else if (inputNames.length >= 3) {
            const restName = inputNames.find((n) => !(n in feeds));
            if (restName) feeds[restName] = timestepTensor;
        }

        return feeds;
    }

    async runInterpolationModel(ctx, t) {
        if (!this.interpSession) throw new Error("补帧模型未加载");
        const imageA = ctx.srcCtxA.getImageData(0, 0, ctx.width, ctx.height);
        const imageB = ctx.srcCtxB.getImageData(0, 0, ctx.width, ctx.height);
        const feeds = this.buildInterpolationFeeds(imageA, imageB, t);
        const results = await this.interpSession.run(feeds);
        const outName = this.interpSession.outputNames[0];
        const outTensor = results[outName];
        return this.tensorToImageData(outTensor, ctx.width, ctx.height);
    }

    async runUpscaleModel(ctx) {
        if (!this.upscaleSession) throw new Error("放大模型未加载");
        const image = ctx.enhancedCtx.getImageData(0, 0, ctx.width, ctx.height);
        const info = this.upscaleModelInfo || this.inspectUpscaleModel(this.upscaleSession);
        this.upscaleModelInfo = info;

        const needsTiled =
            info.fixedInputW && info.fixedInputH &&
            (info.fixedInputW !== ctx.width || info.fixedInputH !== ctx.height);

        if (needsTiled) {
            return this.runUpscaleModelTiled(image, ctx.outputWidth, ctx.outputHeight, info);
        }

        try {
            const input = this.imageDataToTensor(image);
            const feeds = { [info.inputName]: input };
            const results = await this.upscaleSession.run(feeds);
            const outTensor = results[info.outputName];
            const dims = outTensor.dims;
            const outH = Number(dims[dims.length - 2]);
            const outW = Number(dims[dims.length - 1]);
            const native = this.tensorToImageData(outTensor, outW, outH);
            if (outW === ctx.outputWidth && outH === ctx.outputHeight) {
                return native;
            }
            return this.resizeImageData(native, ctx.outputWidth, ctx.outputHeight);
        } catch (error) {
            const msg = String((error && error.message) || error || "");
            const matched = [...msg.matchAll(/Expected:\s*(\d+)/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0);
            if (matched.length >= 2) {
                const inferred = {
                    ...info,
                    fixedInputH: matched[0],
                    fixedInputW: matched[1]
                };
                this.upscaleModelInfo = inferred;
                return this.runUpscaleModelTiled(image, ctx.outputWidth, ctx.outputHeight, inferred);
            }
            if (matched.length === 1) {
                const size = matched[0];
                const inferred = {
                    ...info,
                    fixedInputH: size,
                    fixedInputW: size
                };
                this.upscaleModelInfo = inferred;
                return this.runUpscaleModelTiled(image, ctx.outputWidth, ctx.outputHeight, inferred);
            }
            throw error;
        }
    }

    makePaddedTileFromImage(image, startX, startY, tileW, tileH) {
        const tile = new ImageData(tileW, tileH);
        const src = image.data;
        const dst = tile.data;
        const srcW = image.width;
        const srcH = image.height;
        for (let y = 0; y < tileH; y++) {
            const sy = this.clamp(startY + y, 0, srcH - 1);
            for (let x = 0; x < tileW; x++) {
                const sx = this.clamp(startX + x, 0, srcW - 1);
                const sIdx = (sy * srcW + sx) * 4;
                const dIdx = (y * tileW + x) * 4;
                dst[dIdx] = src[sIdx];
                dst[dIdx + 1] = src[sIdx + 1];
                dst[dIdx + 2] = src[sIdx + 2];
                dst[dIdx + 3] = 255;
            }
        }
        return tile;
    }

    async runUpscaleModelTiled(image, targetW, targetH, info) {
        const tileW = info.fixedInputW;
        const tileH = info.fixedInputH;
        const srcW = image.width;
        const srcH = image.height;

        const firstTile = this.makePaddedTileFromImage(image, 0, 0, tileW, tileH);
        const firstFeeds = { [info.inputName]: this.imageDataToTensor(firstTile) };
        const firstResults = await this.upscaleSession.run(firstFeeds);
        const firstOutTensor = firstResults[info.outputName];
        const firstOutDims = firstOutTensor.dims;
        const outTileH = firstOutDims[firstOutDims.length - 2];
        const outTileW = firstOutDims[firstOutDims.length - 1];
        const scaleX = outTileW / tileW;
        const scaleY = outTileH / tileH;

        const nativeW = Math.max(1, Math.round(srcW * scaleX));
        const nativeH = Math.max(1, Math.round(srcH * scaleY));
        const nativeCanvas = document.createElement("canvas");
        nativeCanvas.width = nativeW;
        nativeCanvas.height = nativeH;
        const nativeCtx = nativeCanvas.getContext("2d", { willReadFrequently: true });
        const tileCanvas = document.createElement("canvas");
        tileCanvas.width = outTileW;
        tileCanvas.height = outTileH;
        const tileCtx = tileCanvas.getContext("2d", { willReadFrequently: true });

        const drawOutputCrop = (outputImageData, sx, sy, sw, sh, dx, dy, dw, dh) => {
            tileCtx.putImageData(outputImageData, 0, 0);
            nativeCtx.drawImage(tileCanvas, sx, sy, sw, sh, dx, dy, dw, dh);
        };

        const firstOutImage = this.tensorToImageData(firstOutTensor, outTileW, outTileH);
        {
            const actualW = Math.min(tileW, srcW);
            const actualH = Math.min(tileH, srcH);
            const cropW = Math.round(actualW * scaleX);
            const cropH = Math.round(actualH * scaleY);
            drawOutputCrop(firstOutImage, 0, 0, cropW, cropH, 0, 0, cropW, cropH);
        }

        for (let y = 0; y < srcH; y += tileH) {
            for (let x = 0; x < srcW; x += tileW) {
                if (x === 0 && y === 0) continue;
                const actualW = Math.min(tileW, srcW - x);
                const actualH = Math.min(tileH, srcH - y);
                const tile = this.makePaddedTileFromImage(image, x, y, tileW, tileH);
                const feeds = { [info.inputName]: this.imageDataToTensor(tile) };
                const results = await this.upscaleSession.run(feeds);
                const outTensor = results[info.outputName];
                const outImage = this.tensorToImageData(outTensor, outTileW, outTileH);
                const cropW = Math.round(actualW * scaleX);
                const cropH = Math.round(actualH * scaleY);
                const dx = Math.round(x * scaleX);
                const dy = Math.round(y * scaleY);
                drawOutputCrop(outImage, 0, 0, cropW, cropH, dx, dy, cropW, cropH);
                await this.sleep(0);
            }
        }

        const nativeData = nativeCtx.getImageData(0, 0, nativeW, nativeH);
        if (nativeW === targetW && nativeH === targetH) {
            return nativeData;
        }
        return this.resizeImageData(nativeData, targetW, targetH);
    }

    resizeImageData(imageData, targetW, targetH) {
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = imageData.width;
        srcCanvas.height = imageData.height;
        const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
        sctx.putImageData(imageData, 0, 0);

        const dstCanvas = document.createElement("canvas");
        dstCanvas.width = targetW;
        dstCanvas.height = targetH;
        const dctx = dstCanvas.getContext("2d", { willReadFrequently: true });
        dctx.imageSmoothingEnabled = true;
        dctx.imageSmoothingQuality = "high";
        dctx.drawImage(srcCanvas, 0, 0, targetW, targetH);
        return dctx.getImageData(0, 0, targetW, targetH);
    }

    async pickVideoCodec(width, height, fps) {
        const candidates = [
            { codec: "avc1.42E01E", bitrate: Math.round(width * height * fps * 0.09) },
            { codec: "avc1.42001f", bitrate: Math.round(width * height * fps * 0.08) },
            { codec: "vp09.00.10.08", bitrate: Math.round(width * height * fps * 0.06) }
        ];

        for (const item of candidates) {
            try {
                const support = await VideoEncoder.isConfigSupported({
                    codec: item.codec,
                    width,
                    height,
                    bitrate: item.bitrate,
                    framerate: fps
                });
                if (support && support.supported) {
                    return item.codec;
                }
            } catch (error) {
                console.warn("Codec not supported:", item.codec, error);
            }
        }

        throw new Error("当前浏览器不支持可用的视频编码器");
    }

    async seekVideo(video, time) {
        const safeTime = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));
        if (Math.abs(video.currentTime - safeTime) < 0.0005) return;

        await new Promise((resolve, reject) => {
            let settled = false;
            let timer = null;
            const onSeeked = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };
            const onError = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error("视频帧定位失败"));
            };
            const onTimeout = () => {
                if (settled) return;
                settled = true;
                cleanup();
                // Avoid deadlock when some videos do not dispatch seeked reliably.
                resolve();
            };
            const cleanup = () => {
                if (timer) clearTimeout(timer);
                video.removeEventListener("seeked", onSeeked);
                video.removeEventListener("error", onError);
            };

            video.addEventListener("seeked", onSeeked, { once: true });
            video.addEventListener("error", onError, { once: true });
            timer = setTimeout(onTimeout, 2500);
            video.currentTime = safeTime;
        });
    }

    async waitForVideoReady(video, timeoutMs = 6000) {
        if (video.readyState >= 2) return;
        await new Promise((resolve, reject) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };
            const fail = () => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error("视频解码就绪失败"));
            };
            const cleanup = () => {
                clearTimeout(timer);
                video.removeEventListener("loadeddata", done);
                video.removeEventListener("canplay", done);
                video.removeEventListener("error", fail);
            };
            const timer = setTimeout(done, timeoutMs);
            video.addEventListener("loadeddata", done, { once: true });
            video.addEventListener("canplay", done, { once: true });
            video.addEventListener("error", fail, { once: true });
            try { video.load(); } catch (_) {}
        });
    }

    selectPreviewFile(fileId) {
        const item = this.fileList.find((f) => f.id === fileId);
        if (!item) return;

        this.selectedPreviewId = fileId;
        this.previewFileName.textContent = item.name;
        this.previewBefore.src = item.sourceUrl;
        this.previewMetrics.textContent = this.formatPreviewMetrics(item);

        if (item.resultUrl) {
            this.previewAfter.src = item.resultUrl;
            this.previewAfter.currentTime = 0;
            this.previewBefore.currentTime = 0;
            this.previewBefore.playbackRate = 1;
            this.previewAfter.playbackRate = 1;
        } else {
            this.previewAfter.removeAttribute("src");
            this.previewAfter.load();
        }

        this.renderFileList();
    }

    removeFile(fileId) {
        if (this.isProcessing) return;

        const index = this.fileList.findIndex((f) => f.id === fileId);
        if (index === -1) return;

        const target = this.fileList[index];
        if (target.sourceUrl) URL.revokeObjectURL(target.sourceUrl);
        if (target.resultUrl) URL.revokeObjectURL(target.resultUrl);

        this.fileList.splice(index, 1);

        if (this.selectedPreviewId === fileId) {
            this.selectedPreviewId = this.fileList[0]?.id || null;
            if (this.selectedPreviewId) {
                this.selectPreviewFile(this.selectedPreviewId);
            } else {
                this.previewBefore.removeAttribute("src");
                this.previewAfter.removeAttribute("src");
                this.previewBefore.load();
                this.previewAfter.load();
                this.previewFileName.textContent = "未选择文件";
                this.previewMetrics.textContent = "原片: - | 输出: -";
            }
        }

        this.renderFileList();
        this.updateButtons();
    }

    clearAll() {
        if (this.isProcessing) return;
        if (this.fileList.length > 0 && !confirm("确定清空队列吗？")) return;

        this.fileList.forEach((item) => {
            if (item.sourceUrl) URL.revokeObjectURL(item.sourceUrl);
            if (item.resultUrl) URL.revokeObjectURL(item.resultUrl);
        });

        this.fileList = [];
        this.selectedPreviewId = null;
        this.previewBefore.removeAttribute("src");
        this.previewAfter.removeAttribute("src");
        this.previewBefore.load();
        this.previewAfter.load();
        this.previewFileName.textContent = "未选择文件";
        this.previewMetrics.textContent = "原片: - | 输出: -";

        this.renderFileList();
        this.updateButtons();
    }

    updateButtons() {
        const hasPending = this.fileList.some((f) => f.status === "pending" || f.status === "error");
        const hasCompleted = this.fileList.some((f) => f.status === "completed");
        const modelsReady = !!this.interpSession && !!this.upscaleSession;
        const modelBusy = this.isInterpModelLoading || this.isUpscaleModelLoading;

        this.processBtn.disabled = !hasPending || this.isProcessing || !modelsReady || modelBusy;
        this.clearBtn.disabled = this.fileList.length === 0 || this.isProcessing;
        this.downloadAllBtn.style.display = hasCompleted ? "inline-block" : "none";
    }

    updateProgress(text, percent) {
        this.progressText.textContent = text;
        this.progressFill.style.width = `${this.clamp(percent, 0, 100)}%`;
    }

    downloadFile(fileData) {
        if (!fileData.resultUrl) return;
        const link = document.createElement("a");
        link.href = fileData.resultUrl;
        link.download = this.getOutputName(fileData.name, fileData.outputExt || "mp4");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    downloadAll() {
        const completed = this.fileList.filter((f) => f.status === "completed" && f.resultUrl);
        if (!completed.length) {
            alert("没有可下载文件");
            return;
        }

        completed.forEach((item, i) => {
            setTimeout(() => this.downloadFile(item), i * 250);
        });
    }

    getOutputName(name, ext) {
        const base = name.replace(/\.[^/.]+$/, "");
        const fpsText = this.frameMultiplier.value;
        const upscaleText = this.upscaleFactor.value;
        return `${base}_ai_${fpsText}fps_${upscaleText}.${ext}`;
    }

    formatFileSize(bytes) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }

    makeEven(value) {
        return value % 2 === 0 ? value : value + 1;
    }

    clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }

    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    formatPreviewMetrics(item) {
        const sourcePart = item.meta
            ? `原片: ${item.meta.width}x${item.meta.height} @ ${Math.round(Number(this.sourceFps.value) || 30)}fps`
            : "原片: -";

        const outputPart = item.resultMeta
            ? `输出: ${item.resultMeta.outputWidth}x${item.resultMeta.outputHeight} @ ${item.resultMeta.outputFps}fps`
            : "输出: 待处理";

        return `${sourcePart} | ${outputPart}`;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Expose the tool instance to `window` for runtime inspection in the browser console
    window.__aiFrameInterpolationTool = new AIFrameInterpolationTool();
});
