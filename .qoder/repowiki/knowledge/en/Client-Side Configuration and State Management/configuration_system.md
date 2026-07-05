The repository employs a decentralized, client-side configuration strategy typical of static web applications. It lacks a centralized configuration management system (such as environment variables, build-time config injection, or a unified settings service). Instead, configuration is handled through three distinct patterns:

### 1. Hardcoded Secrets and API Keys
Sensitive tokens and API keys are currently **hardcoded** directly into JavaScript source files or stored in plaintext JSON files at the root.
- **`tokens.json`**: Contains `cesiumIonToken` and `OpenTopographyToken`. However, investigation shows these are not dynamically loaded; instead, the values are duplicated as hardcoded strings in `js/3d_city.js`.
- **`js/chatgpt.js`**: Contains a hardcoded Zhipu AI API key (`zhipuApiKey`).
- **`js/cloud_music.js`**: Uses a hardcoded default API base URL (`http://127.0.0.1:3000`) for the NetEase Cloud Music API proxy.

### 2. LocalStorage for User Preferences and State
Persistent user-specific configuration and application state are managed using the browser's `localStorage` API. This is the primary mechanism for "runtime" configuration that survives page reloads.
- **Keys used**:
    - `tool-chatgpt-messages`: Stores chat history for the AI tool.
    - `tawebtool.cloudMusic.config`: Stores API base URL and cookies for the music player.
    - `tawebtool.cloudMusic.state`: Stores playback state (active index, playing status).
    - `FORUM_CONFIG_KEY` / `STORAGE_KEY`: Used by the TA Wiki tools for local data persistence.
    - `modelId` / `modelTexturesId`: Used by the waifu mascot script.
- **Pattern**: Modules typically define constant keys (e.g., `CONFIG_KEY`) and use `JSON.parse(localStorage.getItem(KEY) || '{}')` to load defaults, and `localStorage.setItem(KEY, JSON.stringify(data))` to save changes.

### 3. Library-Specific Environment Configuration
For heavy WebGL/WebGPU libraries like ONNX Runtime, configuration is applied via global environment objects provided by the library itself.
- **ONNX Runtime (`ort.env`)**: In `js/ai_upscale.js` and `js/ai_frame_interpolation.js`, the WASM backend is configured by setting properties on `ort.env.wasm` (e.g., `numThreads`, `simd`, `proxy`, `wasmPaths`). These settings are critical for performance and compatibility (e.g., disabling workers to avoid Cross-Origin Isolation issues).

### Key Files
- `tokens.json`: Root-level file containing API tokens (currently unused by code, which uses hardcoded copies).
- `js/3d_city.js`: Hardcodes Cesium and OpenTopography tokens.
- `js/chatgpt.js`: Hardcodes AI API key; uses `localStorage` for chat history.
- `js/cloud_music.js`: Manages API endpoint config and auth cookies via `localStorage`.
- `js/menu.js`: Contains `MENU_DATA`, a static configuration object defining the application's navigation structure and tool metadata.
- `js/ai_upscale.js`: Configures `ort.env` for WebAssembly execution.

### Developer Conventions & Rules
1. **No Central Config**: There is no `config.js` or `settings.json` that aggregates all settings. Each module manages its own configuration scope.
2. **Secrets Exposure**: API keys are exposed in client-side code. This is a security risk and should be addressed by moving sensitive operations to a backend proxy or using environment variables if a build step is introduced.
3. **State Persistence**: Use `localStorage` for user preferences and transient state. Always provide fallback defaults when parsing from storage to handle first-run scenarios or corrupted data.
4. **Library Env Vars**: When integrating new WebGL/WASM libraries, check for their specific global environment objects (like `ort.env`) for runtime tuning rather than assuming standard env var support.