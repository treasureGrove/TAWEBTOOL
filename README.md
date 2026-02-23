# TAWEBTOOL

## 新增工具：动漫 1080p30 → 4K120 导出

入口：`tools_html/anime_4k120_export.html`

### 功能说明
- 固定目标参数：`3840x2160 @ 120fps`。
- 推理流程：RealESRGAN 动漫 x4 超分 → RIFE x2 插帧 → RIFE x2 插帧。
- 字幕/线条保护：Sobel/Laplacian 高频边缘 + 帧差运动 mask，融合为 subtitleMask 并在插帧融合阶段施加约束。
- 支持 4K tile 推理与 overlap blend（默认 `tile=640, overlap=64`）。
- 模型懒加载 + IndexedDB 缓存，提供清除缓存按钮。
- 推理 EP 默认 WebGPU，不可用时自动回退到 wasm/cpu 并提示。
- 导出阶段为离线处理，当前默认仅导出视频轨（无音频）。

### 浏览器要求
- 推荐 Chrome / Edge 最新版（需要 WebGPU + WebCodecs 支持）。
- 若 WebGPU 不可用，会自动回退但速度显著下降。

### 常见问题
1. **显存不足/崩溃**：调小 tile 到 512，overlap 调到 32。
2. **导出很慢**：关闭高强度锐化/去闪烁，优先 WebGPU。
3. **字幕边缘抖动**：提高“字幕保护强度”，必要时降低去闪烁强度。

### 推荐参数
- 质量优先：`tile=640 overlap=64 锐化=0.25 字幕保护=0.75 去闪烁=0.2`
- 速度优先：`tile=512 overlap=32 锐化=0.1 字幕保护=0.6 去闪烁=0.1`
