---
kind: dependency_management
name: Manual Dependency Management via Vendoring and CDN
category: dependency_management
scope:
    - '**'
source_files:
    - third_part/
    - scripts/fetch_models.sh
    - models/README.md
    - js/ai_upscale.js
    - js/ai_frame_interpolation.js
---

This repository employs a manual, file-based dependency management strategy typical of static web applications without a package manager (e.g., no `package.json`, `go.mod`, or `requirements.txt`).

### 1. Dependency Acquisition Strategy
- **Vendoring**: Third-party JavaScript libraries and WebAssembly (WASM) binaries are manually downloaded and committed directly to the `third_part/` directory. This includes:
  - `onnxruntime-web/1.17.1/`: AI inference runtime.
  - `ffmpeg-wasm/`: Media processing toolkit.
  - Standalone encoders/decoders: `bmp-encoder.js`, `dds-encoder.js`, `tga-decoder.js`, `mp4-muxer.umd.js`.
- **CDN Fallbacks**: For large AI models (ONNX files), the application uses hardcoded URLs in JavaScript files (`js/ai_upscale.js`, `js/ai_frame_interpolation.js`) to fetch resources from Hugging Face or Cloud Object Storage (COS) at runtime if local copies are missing.
- **Scripted Fetching**: A bash script `scripts/fetch_models.sh` is provided to download recommended ONNX models into the `models/` directory, acting as a semi-automated dependency initializer for heavy assets.

### 2. Versioning and Updates
- **Manual Versioning**: Versions are tracked via directory names (e.g., `third_part/onnxruntime-web/1.17.1/`) or filenames. There is no automated lockfile or version resolution system.
- **Update Process**: Updating dependencies requires manually replacing files in the `third_part/` directory and updating any hardcoded CDN URLs in the source code.

### 3. Key Files and Locations
- `third_part/`: Root for all vendored JS/WASM libraries.
- `models/`: Directory for large AI model files (excluded from git or managed via script).
- `scripts/fetch_models.sh`: Utility to download external model dependencies.
- `js/ai_upscale.js` & `js/ai_frame_interpolation.js`: Contain hardcoded fallback URLs for external model dependencies.

### 4. Developer Conventions
- **No Package Manager**: Do not attempt to use `npm`, `pip`, or `go get`. All dependencies must be physically present in the repository structure.
- **Local First, Remote Second**: The code is designed to load models from `/models/` first for performance and CORS avoidance, falling back to remote URLs only if necessary.
- **Asset Management**: Large binary assets (like `.onnx` or `.wasm` files) should be handled with care regarding repository size; using the fetch script is preferred over committing massive binaries if they exceed standard limits.