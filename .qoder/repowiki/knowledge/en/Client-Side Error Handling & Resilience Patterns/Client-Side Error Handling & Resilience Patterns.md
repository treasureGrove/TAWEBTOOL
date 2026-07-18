---
kind: error_handling
name: Client-Side Error Handling & Resilience Patterns
category: error_handling
scope:
    - '**'
source_files:
    - js/ai_draw.js
    - js/ai_frame_interpolation.js
    - js/ai_upscale.js
    - js/3d_city.js
---

The repository employs a **defensive, client-side error handling strategy** tailored for browser-based AI and multimedia tools. It relies on standard JavaScript `try/catch` blocks, promise rejection handling, and custom status reporting mechanisms to manage failures in network requests, WebAssembly/ONNX Runtime initialization, and media processing.

### 1. Core Approach: Try-Catch & Status Reporting
The codebase does not use a centralized error logging service or global error boundary framework. Instead, it uses localized `try/catch` blocks combined with UI status updates to inform users of failures.

*   **Status Indicators**: Most modules (`ai_draw.js`, `ai_frame_interpolation.js`, `3d_city.js`) implement a `setStatus(text, isError)` or similar method. This updates a DOM element with the error message, often toggling a CSS class (e.g., `.error`) to provide visual feedback (red text).
*   **Silent Failures & Fallbacks**: In non-critical paths (e.g., downloading secondary assets or optional features), errors are caught and logged to `console.warn` or `console.error` without blocking the main workflow. For example, `ai_frame_interpolation.js` catches preview sync errors silently to avoid interrupting video playback.

### 2. Key Patterns by Domain

#### A. Network & API Resilience
*   **Fallback URLs**: Modules like `ai_draw.js` and `ai_frame_interpolation.js` define arrays of candidate URLs (e.g., `API_BASE_CANDIDATES`, `verifiedModelUrls`). They iterate through these candidates, attempting to fetch resources until one succeeds. If all fail, a consolidated error is thrown.
*   **Timeouts & Preloading**: `ai_draw.js` implements a `preloadImage` function with a manual timeout (`setTimeout`) to reject promises if an image takes too long to load, preventing indefinite hanging states.
*   **HTTP Status Checks**: `ai_frame_interpolation.js` explicitly checks `response.ok` after `fetch` calls and throws descriptive errors including the HTTP status code.

#### B. AI Model Loading (ONNX Runtime)
*   **Graceful Degradation**: `ai_frame_interpolation.js` and `ai_upscale.js` wrap ONNX Runtime initialization in `try/catch`. If WebGPU fails or is unavailable, they often fall back to WASM or display a clear error message indicating browser incompatibility (e.g., "WebGPU is not supported").
*   **Cache Recovery**: Errors during model downloads are mitigated by checking `IndexedDB` caches first. If a download fails, the system may retry from a mirror or notify the user to check their network.
*   **Validation**: Before running inference, models are inspected for valid input/output signatures. If a model file is corrupted (e.g., size < 1MB), an explicit error is thrown to prevent cryptic runtime crashes.

#### C. Media Processing
*   **Promise Rejection Handling**: Video decoding and encoding operations (using `VideoEncoder` or `MediaRecorder`) are wrapped in async functions. Errors in encoding pipelines (e.g., unsupported codecs) are caught and reported via the `onProgress` callback or status UI.
*   **Resource Cleanup**: `URL.revokeObjectURL` is consistently called in `finally` blocks or before overwriting object URLs to prevent memory leaks, even if processing fails.

### 3. Conventions for Developers
*   **User-Facing Messages**: Error messages passed to `setStatus` should be in Chinese (as per the UI language) and actionable (e.g., "Please check network connection" vs "Network Error").
*   **Console Logging**: Use `console.warn` for recoverable issues (e.g., fallback triggered) and `console.error` for critical failures that stop execution.
*   **Async/Await**: Prefer `async/await` with `try/catch` over `.catch()` chains for complex workflows to maintain readability and ensure proper state cleanup (e.g., resetting `isProcessing` flags).
*   **No Global Handler**: There is no `window.onerror` or `unhandledrejection` handler configured. Each module is responsible for its own error containment.