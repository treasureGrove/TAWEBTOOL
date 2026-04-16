(function () {
    'use strict';
    function $(id) { return document.getElementById(id); }

    // ─── State ───
    let sourceImage = null;
    let grayscaleData = null; // Float32Array [0,1]
    let imgW = 0, imgH = 0;
    let processingMode = 'gpu';
    let glState = null;
    let threeState = null;
    let threeInited = false;

    const params = {
        normalStrength: 1.0,
        normalBlur: 0,
        invertX: false,
        invertY: false,
        hqMode: false,
        dispContrast: 1.0,
        aoStrength: 1.0,
        aoRadius: 5,
    };

    // ─── Utility ───
    function debounce(fn, ms) {
        let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); };
    }

    function setStatus(msg) {
        $('statusBar').textContent = '当前模式：' + (processingMode === 'gpu' ? 'GPU模式' : 'CPU模式') + ' | ' + msg;
    }

    function readFileAsImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
            img.src = url;
        });
    }

    function imageToGrayscale(img) {
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height);
        const out = new Float32Array(c.width * c.height);
        for (let i = 0; i < out.length; i++) {
            const idx = i * 4;
            out[i] = (d.data[idx] * 0.299 + d.data[idx + 1] * 0.587 + d.data[idx + 2] * 0.114) / 255;
        }
        return { data: out, width: c.width, height: c.height };
    }

    // ─── CPU Processing ───
    function cpuBoxBlur(src, w, h, radius) {
        if (radius < 1) return new Float32Array(src);
        const r = Math.round(radius);
        const dst1 = new Float32Array(w * h);
        const dst2 = new Float32Array(w * h);
        // Horizontal pass
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let sum = 0, count = 0;
                for (let dx = -r; dx <= r; dx++) {
                    const sx = Math.min(Math.max(x + dx, 0), w - 1);
                    sum += src[y * w + sx]; count++;
                }
                dst1[y * w + x] = sum / count;
            }
        }
        // Vertical pass
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let sum = 0, count = 0;
                for (let dy = -r; dy <= r; dy++) {
                    const sy = Math.min(Math.max(y + dy, 0), h - 1);
                    sum += dst1[sy * w + x]; count++;
                }
                dst2[y * w + x] = sum / count;
            }
        }
        return dst2;
    }

    function cpuGenerateGrayscale(height, w, h) {
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const v = Math.round(height[i] * 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    function cpuGenerateNormal(height, w, h, strength, blur, invertX, invertY, hq) {
        const src = blur > 0 ? cpuBoxBlur(height, w, h, blur) : height;
        const out = new ImageData(w, h);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const sample = (dx, dy) => {
                    const sx = Math.min(Math.max(x + dx, 0), w - 1);
                    const sy = Math.min(Math.max(y + dy, 0), h - 1);
                    return src[sy * w + sx];
                };
                let dX, dY;
                if (hq) {
                    // Scharr operator
                    dX = (3 * sample(1, -1) + 10 * sample(1, 0) + 3 * sample(1, 1))
                        - (3 * sample(-1, -1) + 10 * sample(-1, 0) + 3 * sample(-1, 1));
                    dY = (3 * sample(-1, 1) + 10 * sample(0, 1) + 3 * sample(1, 1))
                        - (3 * sample(-1, -1) + 10 * sample(0, -1) + 3 * sample(1, -1));
                } else {
                    // Sobel operator
                    dX = (sample(1, -1) + 2 * sample(1, 0) + sample(1, 1))
                        - (sample(-1, -1) + 2 * sample(-1, 0) + sample(-1, 1));
                    dY = (sample(-1, 1) + 2 * sample(0, 1) + sample(1, 1))
                        - (sample(-1, -1) + 2 * sample(0, -1) + sample(1, -1));
                }
                let nx = -dX * strength;
                let ny = dY * strength;
                let nz = 1.0;
                if (invertX) nx = -nx;
                if (invertY) ny = -ny;
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                nx /= len; ny /= len; nz /= len;
                const idx = (y * w + x) * 4;
                out.data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
                out.data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
                out.data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
                out.data[idx + 3] = 255;
            }
        }
        return out;
    }

    function cpuGenerateDisplacement(height, w, h, contrast) {
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            let v = height[i];
            v = Math.pow(v, 1 / contrast); // gamma adjustment as contrast
            v = Math.min(Math.max(Math.round(v * 255), 0), 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    function cpuGenerateAO(height, w, h, strength, radius) {
        const blurred = cpuBoxBlur(height, w, h, radius);
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            let ao = 1.0 - (height[i] - blurred[i]) * strength;
            ao = Math.min(Math.max(ao, 0), 1);
            const v = Math.round(ao * 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    function cpuGenerateReflection(height, w, h) {
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            // Specular/reflection: brighter areas are more reflective
            let v = Math.pow(height[i], 0.6);
            v = Math.min(Math.max(Math.round(v * 255), 0), 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    function cpuGenerateGlossiness(height, w, h) {
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            // Glossiness = inverted roughness; darker height = rougher
            let v = 1.0 - height[i];
            v = Math.pow(v, 1.2);
            v = Math.min(Math.max(Math.round(v * 255), 0), 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    // ─── GPU Processing (WebGL2) ───
    const VERT_QUAD = `#version 300 es
    in vec2 aPos;
    out vec2 vUv;
    void main(){
        vUv = aPos * 0.5 + 0.5;
        gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

    const FRAG_NORMAL = `#version 300 es
    precision highp float;
    uniform sampler2D uHeight;
    uniform float uStrength;
    uniform vec2 uTexelSize;
    uniform bool uInvertX;
    uniform bool uInvertY;
    in vec2 vUv;
    out vec4 fragColor;
    float h(vec2 offset){
        return texture(uHeight, vUv + offset * uTexelSize).r;
    }
    void main(){
        float tl = h(vec2(-1,-1)), t = h(vec2(0,-1)), tr = h(vec2(1,-1));
        float l  = h(vec2(-1, 0)),                     r  = h(vec2(1, 0));
        float bl = h(vec2(-1, 1)), b = h(vec2(0, 1)), br = h(vec2(1, 1));
        float dX = (tr + 2.0*r + br) - (tl + 2.0*l + bl);
        float dY = (bl + 2.0*b + br) - (tl + 2.0*t + tr);
        float nx = -dX * uStrength;
        float ny = dY * uStrength;
        if(uInvertX) nx = -nx;
        if(uInvertY) ny = -ny;
        vec3 n = normalize(vec3(nx, ny, 1.0));
        fragColor = vec4(n * 0.5 + 0.5, 1.0);
    }`;

    const FRAG_AO = `#version 300 es
    precision highp float;
    uniform sampler2D uHeight;
    uniform float uStrength;
    uniform float uRadius;
    uniform vec2 uTexelSize;
    in vec2 vUv;
    out vec4 fragColor;
    void main(){
        float center = texture(uHeight, vUv).r;
        float sum = 0.0;
        float count = 0.0;
        int r = int(uRadius);
        for(int dy = -r; dy <= r; dy++){
            for(int dx = -r; dx <= r; dx++){
                vec2 off = vec2(float(dx), float(dy)) * uTexelSize;
                sum += texture(uHeight, vUv + off).r;
                count += 1.0;
            }
        }
        float blurred = sum / count;
        float ao = 1.0 - (center - blurred) * uStrength;
        ao = clamp(ao, 0.0, 1.0);
        fragColor = vec4(vec3(ao), 1.0);
    }`;

    function initWebGL() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
            if (!gl) return false;
            // Check float texture support
            if (!gl.getExtension('EXT_color_buffer_float')) return false;

            function compile(type, src) {
                const s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    console.error(gl.getShaderInfoLog(s));
                    return null;
                }
                return s;
            }
            function link(vs, fs) {
                const p = gl.createProgram();
                gl.attachShader(p, vs);
                gl.attachShader(p, fs);
                gl.linkProgram(p);
                if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
                    console.error(gl.getProgramInfoLog(p));
                    return null;
                }
                return p;
            }

            const vert = compile(gl.VERTEX_SHADER, VERT_QUAD);
            const fragNormal = compile(gl.FRAGMENT_SHADER, FRAG_NORMAL);
            const fragAO = compile(gl.FRAGMENT_SHADER, FRAG_AO);
            if (!vert || !fragNormal || !fragAO) return false;

            const normalProg = link(vert, fragNormal);
            const aoProg = link(vert, fragAO);
            if (!normalProg || !aoProg) return false;

            // Fullscreen quad VAO
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const posLoc = gl.getAttribLocation(normalProg, 'aPos');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
            gl.bindVertexArray(null);

            glState = { gl, canvas, normalProg, aoProg, vao };
            return true;
        } catch (e) {
            console.error('WebGL2 init failed:', e);
            return false;
        }
    }

    function uploadHeightTexture(gl, heightMap, w, h) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, heightMap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
    }

    function gpuRun(program, heightMap, w, h, uniforms) {
        const { gl, canvas, vao } = glState;
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);

        const tex = uploadHeightTexture(gl, heightMap, w, h);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(program, 'uHeight'), 0);
        gl.uniform2f(gl.getUniformLocation(program, 'uTexelSize'), 1.0 / w, 1.0 / h);
        for (const [name, val] of Object.entries(uniforms)) {
            const loc = gl.getUniformLocation(program, name);
            if (loc === null) continue;
            if (typeof val === 'boolean') gl.uniform1i(loc, val ? 1 : 0);
            else gl.uniform1f(loc, val);
        }

        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);

        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        gl.deleteTexture(tex);

        const out = new ImageData(w, h);
        out.data.set(pixels);
        return out;
    }

    function gpuGenerateNormal(heightMap, w, h, strength, invertX, invertY) {
        return gpuRun(glState.normalProg, heightMap, w, h, {
            uStrength: strength, uInvertX: invertX, uInvertY: invertY
        });
    }

    function gpuGenerateAO(heightMap, w, h, strength, radius) {
        return gpuRun(glState.aoProg, heightMap, w, h, {
            uStrength: strength, uRadius: radius
        });
    }

    // ─── Render to Canvas ───
    function renderMapToCanvas(canvasId, imageData) {
        const cvs = $(canvasId);
        if (!cvs) return;
        cvs.width = imageData.width;
        cvs.height = imageData.height;
        cvs.getContext('2d').putImageData(imageData, 0, 0);
    }

    // ─── Main Pipeline ───
    function processAllMaps() {
        if (!grayscaleData) return;
        const t0 = performance.now();
        const h = grayscaleData, w = imgW, ht = imgH;
        const p = params;

        // Grayscale
        renderMapToCanvas('mapGrayscale', cpuGenerateGrayscale(h, w, ht));

        // Normal
        let normalData;
        if (processingMode === 'gpu' && glState) {
            normalData = gpuGenerateNormal(h, w, ht, p.normalStrength, p.invertX, p.invertY);
        } else {
            normalData = cpuGenerateNormal(h, w, ht, p.normalStrength, p.normalBlur, p.invertX, p.invertY, p.hqMode);
        }
        renderMapToCanvas('mapNormal', normalData);

        // Displacement
        renderMapToCanvas('mapDisplacement', cpuGenerateDisplacement(h, w, ht, p.dispContrast));

        // AO
        let aoData;
        if (processingMode === 'gpu' && glState) {
            aoData = gpuGenerateAO(h, w, ht, p.aoStrength, p.aoRadius);
        } else {
            aoData = cpuGenerateAO(h, w, ht, p.aoStrength, p.aoRadius);
        }
        renderMapToCanvas('mapAo', aoData);

        // Reflection
        renderMapToCanvas('mapReflection', cpuGenerateReflection(h, w, ht));

        // Glossiness
        renderMapToCanvas('mapGlossiness', cpuGenerateGlossiness(h, w, ht));

        const elapsed = (performance.now() - t0).toFixed(2);
        setStatus('处理时间：' + elapsed + 'ms');

        // Update 3D preview if visible
        if (threeInited && $('preview3D').style.display !== 'none') {
            update3DPreview();
        }
    }

    // ─── Reverse Normal Map ───
    function poissonReconstruct(normalImgData, w, h, iterations) {
        const dx = new Float32Array(w * h);
        const dy = new Float32Array(w * h);
        const d = normalImgData.data;
        for (let i = 0; i < w * h; i++) {
            const idx = i * 4;
            dx[i] = (d[idx] / 255) * 2 - 1;
            dy[i] = (d[idx + 1] / 255) * 2 - 1;
        }
        const height = new Float32Array(w * h);
        for (let iter = 0; iter < iterations; iter++) {
            for (let y = 1; y < h - 1; y++) {
                for (let x = 1; x < w - 1; x++) {
                    const i = y * w + x;
                    const laplacian = dx[i] - dx[i - 1] + dy[i] - dy[(y - 1) * w + x];
                    height[i] = (height[i - 1] + height[i + 1] + height[(y - 1) * w + x] + height[(y + 1) * w + x] + laplacian) / 4;
                }
            }
        }
        // Normalize to [0,1]
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < height.length; i++) {
            if (height[i] < min) min = height[i];
            if (height[i] > max) max = height[i];
        }
        const range = max - min || 1;
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const v = Math.round(((height[i] - min) / range) * 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    function simpleAccumulate(normalImgData, w, h) {
        const d = normalImgData.data;
        const height = new Float32Array(w * h);
        // Row-wise integration of dx
        for (let y = 0; y < h; y++) {
            let sum = 0;
            for (let x = 0; x < w; x++) {
                const i = y * w + x;
                sum += (d[i * 4] / 255) * 2 - 1;
                height[i] = sum;
            }
        }
        // Column-wise integration of dy
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let y = 0; y < h; y++) {
                const i = y * w + x;
                sum += (d[i * 4 + 1] / 255) * 2 - 1;
                height[i] = (height[i] + sum) * 0.5;
            }
        }
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < height.length; i++) {
            if (height[i] < min) min = height[i];
            if (height[i] > max) max = height[i];
        }
        const range = max - min || 1;
        const out = new ImageData(w, h);
        for (let i = 0; i < w * h; i++) {
            const v = Math.round(((height[i] - min) / range) * 255);
            out.data[i * 4] = v;
            out.data[i * 4 + 1] = v;
            out.data[i * 4 + 2] = v;
            out.data[i * 4 + 3] = 255;
        }
        return out;
    }

    // ─── Three.js 3D Preview ───
    async function init3DPreview() {
        if (threeInited) return;
        try {
            let THREE, OrbitControls;
            try {
                THREE = await import('three');
                const mod = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js');
                OrbitControls = mod.OrbitControls;
            } catch (e) {
                THREE = await import('https://unpkg.com/three@0.160.0/build/three.module.js');
                const mod = await import('https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js');
                OrbitControls = mod.OrbitControls;
            }

            const canvas = $('canvas3D');
            const container = $('preview3D');
            const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            renderer.outputColorSpace = THREE.SRGBColorSpace;

            const scene = new THREE.Scene();
            scene.background = new THREE.Color(0x1a1a2e);
            const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
            camera.position.set(0, 1.8, 3);

            const controls = new OrbitControls(camera, canvas);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;

            // Lights
            const ambient = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambient);
            const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
            dirLight.position.set(5, 5, 5);
            scene.add(dirLight);
            const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
            dirLight2.position.set(-3, 2, -3);
            scene.add(dirLight2);

            // Material
            const material = new THREE.MeshStandardMaterial({
                color: 0xcccccc,
                metalness: 0.1,
                roughness: 0.6,
                side: THREE.DoubleSide,
            });

            // Geometries
            const geometries = {
                plane: new THREE.PlaneGeometry(3, 3, 256, 256),
                sphere: new THREE.SphereGeometry(1.2, 128, 128),
                cube: new THREE.BoxGeometry(2, 2, 2, 128, 128, 128),
            };
            // Rotate plane to face camera
            geometries.plane.rotateX(-Math.PI / 4);

            let mesh = new THREE.Mesh(geometries.plane, material);
            scene.add(mesh);

            // Grid helper
            const grid = new THREE.GridHelper(6, 12, 0x333355, 0x222244);
            grid.position.y = -1.5;
            scene.add(grid);

            threeState = { THREE, renderer, scene, camera, controls, material, mesh, geometries, canvas: canvas, container };
            threeInited = true;

            // Handle model switch
            $('previewModel').addEventListener('change', function () {
                scene.remove(mesh);
                const geo = geometries[this.value] || geometries.plane;
                mesh = new THREE.Mesh(geo, material);
                scene.add(mesh);
                threeState.mesh = mesh;
                update3DPreview();
            });

            // Displacement scale
            $('dispScale3D').addEventListener('input', function () {
                $('dispScale3DVal').textContent = parseFloat(this.value).toFixed(2);
                material.displacementScale = parseFloat(this.value);
                material.needsUpdate = true;
            });

            // Resize handling
            function resize() {
                const rect = container.getBoundingClientRect();
                const w = rect.width - 16;
                const h = rect.height - 60;
                if (w > 0 && h > 0) {
                    renderer.setSize(w, h);
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                }
            }
            const ro = new ResizeObserver(resize);
            ro.observe(container);
            resize();

            // Render loop
            function animate() {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
            }
            animate();

            update3DPreview();
        } catch (e) {
            console.error('3D preview init failed:', e);
            $('preview3D').innerHTML = '<div style="padding:20px;color:#ef4444;">3D预览加载失败，请刷新重试。</div>';
        }
    }

    function update3DPreview() {
        if (!threeState || !grayscaleData) return;
        const { THREE, material } = threeState;

        // Diffuse/color map from grayscale
        const grayCvs = $('mapGrayscale');
        if (grayCvs.width > 1) {
            if (material.map) material.map.dispose();
            material.map = new THREE.CanvasTexture(grayCvs);
            material.map.colorSpace = THREE.SRGBColorSpace;
        }

        // Normal map
        const normalCvs = $('mapNormal');
        if (normalCvs.width > 1) {
            if (material.normalMap) material.normalMap.dispose();
            material.normalMap = new THREE.CanvasTexture(normalCvs);
        }

        // Displacement map
        const dispCvs = $('mapDisplacement');
        if (dispCvs.width > 1) {
            if (material.displacementMap) material.displacementMap.dispose();
            material.displacementMap = new THREE.CanvasTexture(dispCvs);
            material.displacementScale = parseFloat($('dispScale3D').value);
        }

        // AO map
        const aoCvs = $('mapAo');
        if (aoCvs.width > 1) {
            if (material.aoMap) material.aoMap.dispose();
            material.aoMap = new THREE.CanvasTexture(aoCvs);
            material.aoMapIntensity = 1.0;
        }

        material.needsUpdate = true;
    }

    // ─── Export ───
    function downloadCanvas(canvasId, filename) {
        const cvs = $(canvasId);
        if (!cvs || cvs.width <= 1) return;
        cvs.toBlob(function (blob) {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        }, 'image/png');
    }

    async function downloadAllAsZip() {
        if (!grayscaleData) { alert('请先上传图像'); return; }
        if (typeof JSZip === 'undefined') { alert('JSZip 未加载'); return; }
        setStatus('正在打包ZIP...');
        const zip = new JSZip();
        const maps = [
            ['mapGrayscale', 'grayscale.png'],
            ['mapNormal', 'normal.png'],
            ['mapDisplacement', 'displacement.png'],
            ['mapAo', 'ao.png'],
            ['mapReflection', 'reflection.png'],
            ['mapGlossiness', 'glossiness.png'],
        ];
        for (const [id, name] of maps) {
            const cvs = $(id);
            if (!cvs || cvs.width <= 1) continue;
            const blob = await new Promise(r => cvs.toBlob(r, 'image/png'));
            zip.file(name, blob);
        }
        const content = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = 'pbr_textures.zip';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        setStatus('ZIP下载完成');
    }

    // ─── Sample Images (procedurally generated) ───
    function generateSample(type) {
        const size = 512;
        const cvs = document.createElement('canvas');
        cvs.width = size; cvs.height = size;
        const ctx = cvs.getContext('2d');
        const imgData = ctx.createImageData(size, size);
        const d = imgData.data;

        // Simple seeded random
        let seed = { bricks: 42, cobblestone: 137, metal: 256, rock: 73 }[type] || 1;
        function rand() { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; }

        if (type === 'bricks') {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const brickW = 64, brickH = 32, gap = 3;
                    const row = Math.floor(y / brickH);
                    const offset = (row % 2) * (brickW / 2);
                    const lx = (x + offset) % brickW;
                    const ly = y % brickH;
                    let v;
                    if (lx < gap || ly < gap) {
                        v = 40 + Math.random() * 15;
                    } else {
                        seed = (row * 317 + Math.floor((x + offset) / brickW) * 131) % 2147483647;
                        v = 140 + (rand() * 60 - 30);
                        v += (Math.random() * 20 - 10);
                    }
                    const idx = (y * size + x) * 4;
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.min(Math.max(Math.round(v), 0), 255);
                    d[idx + 3] = 255;
                }
            }
        } else if (type === 'cobblestone') {
            // Voronoi-based
            const pts = [];
            for (let i = 0; i < 80; i++) pts.push({ x: rand() * size, y: rand() * size, h: rand() * 80 + 140 });
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let minD = Infinity, minD2 = Infinity;
                    let cellH = 180;
                    for (const p of pts) {
                        const dx = Math.abs(x - p.x), dy = Math.abs(y - p.y);
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < minD) { minD2 = minD; minD = dist; cellH = p.h; }
                        else if (dist < minD2) { minD2 = dist; }
                    }
                    const edge = Math.max(0, 1 - (minD2 - minD) / 12);
                    let v = cellH * (1 - edge * 0.7);
                    v += Math.random() * 8 - 4;
                    const idx = (y * size + x) * 4;
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.min(Math.max(Math.round(v), 0), 255);
                    d[idx + 3] = 255;
                }
            }
        } else if (type === 'metal') {
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let v = 180 + Math.sin(x * 0.05) * 10 + Math.cos(y * 0.08) * 8;
                    // Scratches
                    for (let s = 0; s < 30; s++) {
                        seed = s * 997;
                        const sx = rand() * size, sy = rand() * size;
                        const angle = rand() * Math.PI;
                        const dx = x - sx, dy = y - sy;
                        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
                        const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
                        if (perp < 1.5 && Math.abs(along) < 40 + rand() * 60) {
                            v -= 30 + rand() * 20;
                        }
                    }
                    v += Math.random() * 6 - 3;
                    const idx = (y * size + x) * 4;
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.min(Math.max(Math.round(v), 0), 255);
                    d[idx + 3] = 255;
                }
            }
        } else if (type === 'rock') {
            // Multi-octave noise approximation
            function noise2D(x, y) {
                const ix = Math.floor(x), iy = Math.floor(y);
                const fx = x - ix, fy = y - iy;
                function h(a, b) { seed = ((a * 12345 + b * 67890) & 0x7FFFFFFF) % 2147483647; return rand(); }
                const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), dd = h(ix + 1, iy + 1);
                const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
                return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
            }
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    let v = 0;
                    v += noise2D(x / 80, y / 80) * 0.5;
                    v += noise2D(x / 40, y / 40) * 0.25;
                    v += noise2D(x / 20, y / 20) * 0.125;
                    v += noise2D(x / 10, y / 10) * 0.0625;
                    v = v * 255;
                    v += Math.random() * 8 - 4;
                    const idx = (y * size + x) * 4;
                    d[idx] = d[idx + 1] = d[idx + 2] = Math.min(Math.max(Math.round(v), 0), 255);
                    d[idx + 3] = 255;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return cvs;
    }

    // ─── Upload & Process ───
    async function handleImageUpload(file) {
        try {
            setStatus('正在加载图像...');
            const img = await readFileAsImage(file);
            sourceImage = img;
            const result = imageToGrayscale(img);
            grayscaleData = result.data;
            imgW = result.width;
            imgH = result.height;

            // Show preview
            const pvCvs = $('inputPreview');
            pvCvs.width = img.width;
            pvCvs.height = img.height;
            pvCvs.getContext('2d').drawImage(img, 0, 0);
            $('inputDrop').classList.add('has-image');

            processAllMaps();
        } catch (e) {
            setStatus('图像加载失败: ' + e.message);
        }
    }

    function handleSampleImage(type) {
        const cvs = generateSample(type);
        const img = new Image();
        img.onload = function () {
            sourceImage = img;
            const result = imageToGrayscale(img);
            grayscaleData = result.data;
            imgW = result.width;
            imgH = result.height;

            const pvCvs = $('inputPreview');
            pvCvs.width = img.width;
            pvCvs.height = img.height;
            pvCvs.getContext('2d').drawImage(img, 0, 0);
            $('inputDrop').classList.add('has-image');

            processAllMaps();
        };
        img.src = cvs.toDataURL();
    }

    // ─── Event Binding ───
    function bindControls() {
        const reprocess = debounce(processAllMaps, 100);

        // Mode toggle
        $('btnCpu').addEventListener('click', function () {
            processingMode = 'cpu';
            this.classList.add('active');
            $('btnGpu').classList.remove('active');
            setStatus('已切换到CPU模式');
            if (grayscaleData) reprocess();
        });
        $('btnGpu').addEventListener('click', function () {
            if (!glState) {
                setStatus('GPU不可用，请使用CPU模式');
                return;
            }
            processingMode = 'gpu';
            this.classList.add('active');
            $('btnCpu').classList.remove('active');
            setStatus('已切换到GPU模式');
            if (grayscaleData) reprocess();
        });

        // Slider bindings
        function bindSlider(id, valId, paramKey, format) {
            $(id).addEventListener('input', function () {
                const v = parseFloat(this.value);
                params[paramKey] = v;
                $(valId).textContent = format ? format(v) : v.toFixed(2);
                reprocess();
            });
        }
        bindSlider('normalStrength', 'normalStrengthVal', 'normalStrength');
        bindSlider('normalBlur', 'normalBlurVal', 'normalBlur', v => v.toFixed(1));
        bindSlider('dispContrast', 'dispContrastVal', 'dispContrast');
        bindSlider('aoStrength', 'aoStrengthVal', 'aoStrength');
        bindSlider('aoRadius', 'aoRadiusVal', 'aoRadius', v => v.toFixed(0));

        // Checkboxes
        $('invertX').addEventListener('change', function () { params.invertX = this.checked; reprocess(); });
        $('invertY').addEventListener('change', function () { params.invertY = this.checked; reprocess(); });
        $('hqMode').addEventListener('change', function () { params.hqMode = this.checked; reprocess(); });

        // Reset
        $('btnResetNormal').addEventListener('click', function () {
            params.normalStrength = 1.0; params.normalBlur = 0; params.invertX = false; params.invertY = false; params.hqMode = false;
            $('normalStrength').value = 1.0; $('normalStrengthVal').textContent = '1.00';
            $('normalBlur').value = 0; $('normalBlurVal').textContent = '0.0';
            $('invertX').checked = false; $('invertY').checked = false; $('hqMode').checked = false;
            reprocess();
        });

        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                if (this.dataset.tab === '3d') {
                    $('mapGrid2D').style.display = 'none';
                    $('preview3D').style.display = 'flex';
                    init3DPreview();
                } else {
                    $('mapGrid2D').style.display = 'grid';
                    $('preview3D').style.display = 'none';
                }
            });
        });

        // Size toggle
        $('btnSmall').addEventListener('click', function () {
            $('mapGrid2D').classList.remove('large-preview');
            this.classList.add('active'); $('btnLarge').classList.remove('active');
        });
        $('btnLarge').addEventListener('click', function () {
            $('mapGrid2D').classList.add('large-preview');
            this.classList.add('active'); $('btnSmall').classList.remove('active');
        });

        // Download buttons
        document.querySelectorAll('.btn-dl').forEach(btn => {
            btn.addEventListener('click', function () {
                const map = this.dataset.map;
                const ids = { grayscale: 'mapGrayscale', normal: 'mapNormal', displacement: 'mapDisplacement', ao: 'mapAo', reflection: 'mapReflection', glossiness: 'mapGlossiness' };
                downloadCanvas(ids[map], map + '.png');
            });
        });

        // Download all
        $('btnDownloadAll').addEventListener('click', downloadAllAsZip);

        // Reverse normal
        $('btnReverse').addEventListener('click', function () {
            const cvs = $('reversePreview');
            if (!cvs || cvs.width <= 1) { alert('请先上传法线贴图'); return; }
            const ctx = cvs.getContext('2d');
            const data = ctx.getImageData(0, 0, cvs.width, cvs.height);
            const algo = $('reverseAlgo').value;
            const iterations = parseInt($('reverseIter').value);
            let result;
            if (algo === 'poisson') {
                result = poissonReconstruct(data, cvs.width, cvs.height, iterations);
            } else {
                result = simpleAccumulate(data, cvs.width, cvs.height);
            }
            const resCvs = $('reverseResult');
            resCvs.width = cvs.width; resCvs.height = cvs.height;
            resCvs.getContext('2d').putImageData(result, 0, 0);
            resCvs.style.display = 'block';
            $('btnDownloadReverse').style.display = 'block';
        });
        $('btnDownloadReverse').addEventListener('click', function () {
            downloadCanvas('reverseResult', 'reverse_height.png');
        });
        $('reverseIter').addEventListener('input', function () {
            $('reverseIterVal').textContent = this.value;
        });

        // Sample images
        document.querySelectorAll('.sample-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                handleSampleImage(this.dataset.sample);
            });
        });
    }

    function bindDropZones() {
        // Main input
        const inputDrop = $('inputDrop');
        const inputFile = $('inputFile');

        ['dragover', 'dragenter'].forEach(ev => {
            inputDrop.addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(ev => {
            inputDrop.addEventListener(ev, function () { this.classList.remove('dragover'); });
        });
        inputDrop.addEventListener('drop', function (e) {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) handleImageUpload(file);
        });
        inputFile.addEventListener('change', function () {
            if (this.files[0]) handleImageUpload(this.files[0]);
        });

        // Reverse input
        const reverseDrop = $('reverseDrop');
        const reverseFile = $('reverseFile');

        ['dragover', 'dragenter'].forEach(ev => {
            reverseDrop.addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('dragover'); });
        });
        ['dragleave', 'drop'].forEach(ev => {
            reverseDrop.addEventListener(ev, function () { this.classList.remove('dragover'); });
        });
        reverseDrop.addEventListener('drop', function (e) {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) loadReverseImage(file);
        });
        reverseFile.addEventListener('change', function () {
            if (this.files[0]) loadReverseImage(this.files[0]);
        });
    }

    async function loadReverseImage(file) {
        const img = await readFileAsImage(file);
        const cvs = $('reversePreview');
        cvs.width = img.width; cvs.height = img.height;
        cvs.getContext('2d').drawImage(img, 0, 0);
        $('reverseDrop').classList.add('has-image');
    }

    // ─── Init ───
    function init() {
        // Try GPU
        const gpuOk = initWebGL();
        if (!gpuOk) {
            processingMode = 'cpu';
            $('btnCpu').classList.add('active');
            $('btnGpu').classList.remove('active');
            $('btnGpu').style.opacity = '0.5';
            setStatus('GPU不可用，已切换到CPU模式');
        } else {
            setStatus('等待上传图像');
        }
        bindControls();
        bindDropZones();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
