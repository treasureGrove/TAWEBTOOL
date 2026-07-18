---
kind: build_system
name: Static Web Asset Delivery with Manual Model Fetching
category: build_system
scope:
    - '**'
source_files:
    - scripts/fetch_models.sh
    - third_part/
    - index.html
---

This repository operates as a static web application without a formal build system, CI/CD pipeline, or package manager configuration. 

**System Approach:**
- **No Build Tooling:** The project lacks standard build automation files such as `Makefile`, `package.json`, `webpack.config.js`, or `Dockerfile`. It appears to be designed for direct deployment of static assets (HTML, CSS, JS) to a web server or CDN.
- **Manual Dependency Management:** Third-party libraries (FFmpeg.wasm, ONNX Runtime, various encoders/decoders) are manually vendored in the `third_part/` directory rather than managed via npm or other package managers.
- **Asset Fetching Script:** A single Bash script (`scripts/fetch_models.sh`) is provided to download large AI model files (ONNX format) from external sources (GitHub/HuggingFace) into the `models/` directory. This is the only automated build-related task identified.

**Key Files:**
- `scripts/fetch_models.sh`: Downloads RIFE and Real-ESRGAN ONNX models.
- `third_part/`: Contains manually managed WebAssembly binaries and JavaScript utilities.
- `index.html`: Entry point for the application.

**Conventions & Rules:**
- **Direct Execution:** Developers likely run the application by serving the root directory via a simple HTTP server (e.g., `python -m http.server` or VS Code Live Server).
- **Model Management:** AI models are not committed to the repository (likely due to size) and must be fetched manually using the provided script before local testing of AI features.
- **No Compilation:** JavaScript and CSS files are used in their source form without minification, bundling, or transpilation steps evident in the repository structure.