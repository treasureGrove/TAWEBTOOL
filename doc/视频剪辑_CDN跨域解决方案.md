# 视频剪辑工具 - CDN 跨域问题解决方案

## 问题分析

### 为什么 CDN 在 file:// 协议下不工作？

FFmpeg.wasm 使用 **Web Worker** 来处理视频，Worker 脚本必须满足同源策略：

```
file:///path/to/video_cut.html  (主页面)
  ↓ 尝试加载
https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js  (Worker)
  ↓ 
❌ 被浏览器阻止: 跨域错误
```

**浏览器安全限制**:
- file:// 协议被视为 "null" 源
- https:// CDN 是不同的源
- Worker 无法从不同源加载

### 为什么 localhost 可以？

```
http://localhost:8000/video_cut.html  (主页面)
  ↓ 通过 fetch/toBlobURL 转换
blob:http://localhost:8000/xxxx-xxxx  (相同源的 Blob URL)
  ↓
✅ 允许: 同源
```

---

## 解决方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|---------|
| **方案1: 本地 HTTP 服务器** | FFmpeg 全功能 | 需要额外步骤 | 开发环境 |
| **方案2: 下载 FFmpeg 到本地** | 离线可用 | 文件体积大(31MB) | 企业内网 |
| **方案3: 原生浏览器 API** ⭐ | 即开即用，零依赖 | 功能受限，只能 WebM | 轻量级工具 |

---

## 已实现方案：使用浏览器原生 API

### 核心技术

```javascript
// 不使用 FFmpeg.wasm，改用:
MediaRecorder API      // 视频编码
Canvas API             // 帧处理
Web Audio API          // 音频处理
```

### 优势

✅ **零依赖**: 不需要任何外部库  
✅ **无跨域**: file:// 直接打开可用  
✅ **轻量级**: 只有一个 JS 文件  
✅ **即时启动**: 无需下载 31MB WASM 文件  
✅ **完全本地**: 不依赖网络连接

### 权衡

⚠️ **输出格式**: 只能导出 WebM (VP9/Opus)  
⚠️ **处理速度**: 实时速度（受浏览器限制）  
⚠️ **功能范围**: 基础功能，无高级滤镜

---

## 功能对比

| 功能 | FFmpeg.wasm | 原生 API | 状态 |
|------|-------------|----------|------|
| 视频裁剪 | ✅ MP4 | ✅ WebM | 已实现 |
| 格式转换 | ✅ 多格式 | ✅ WebM | 已实现 |
| 视频截图 | ✅ | ✅ | 已实现 |
| 音频提取 | ✅ MP3 | ✅ WebM音频 | 已实现 |
| 静音视频 | ✅ | ✅ | 已实现 |
| 变速播放 | ✅ | ✅ | 已实现 |
| 视频拼接 | ✅ | ❌ | 暂不支持 |
| 字幕烧录 | ✅ | ❌ | 暂不支持 |
| 分辨率调整 | ✅ | ❌ | 可Canvas实现 |
| 高级滤镜 | ✅ | ❌ | 暂不支持 |

---

## 文件结构

```
js/
  ├── video_cut.js          # 新增：原生API实现
  └── local_workbench.js     # 修改：调用原生实现

tools_html/
  └── video_cut.html         # 修改：加载 video_cut.js

css/
  └── video_cut.css          # 优化样式

doc/
  └── 视频剪辑工具使用说明.md  # 详细文档
```

---

## 使用方法

### 🚀 快速开始

1. **直接打开**（推荐）
   ```
   双击: tools_html/video_cut.html
   ```

2. **HTTP 服务器**（可选）
   ```bash
   python -m http.server 8000
   # 访问: http://localhost:8000/tools_html/video_cut.html
   ```

### 📝 基本操作

1. 点击"主视频"上传文件
2. 选择处理模式（裁剪/转换/截图等）
3. 设置参数
4. 点击"🚀 开始处理"
5. 完成后点击"💾 下载"

---

## WebM 格式说明

### 什么是 WebM？

- **开发者**: Google
- **编码**: VP9 (视频) + Opus (音频)
- **优势**: 开源、高压缩比、浏览器原生支持

### 浏览器支持

| 浏览器 | 支持情况 |
|--------|---------|
| Chrome | ✅ 完美支持 |
| Firefox | ✅ 完美支持 |
| Edge | ✅ 完美支持 |
| Opera | ✅ 完美支持 |
| Safari | ⚠️ 部分支持 |

### WebM → MP4 转换

如果需要 MP4 格式，可以使用：

**方法1: FFmpeg 命令行**
```bash
ffmpeg -i input.webm -c:v libx264 -c:a aac output.mp4
```

**方法2: 在线工具**
- CloudConvert
- Online-Convert
- FreeConvert

**方法3: 桌面软件**
- HandBrake
- VLC Media Player
- FFmpeg GUI

---

## 性能优化建议

### 提升处理速度

1. **减小时间范围**: 只处理需要的片段
2. **降低码率**: 在格式转换时使用较低码率
3. **关闭其他程序**: 释放内存
4. **使用 Chrome**: 通常性能最好

### 避免卡顿

- 单个文件 < 500MB
- 可用内存 > 4GB
- 使用 SSD 硬盘
- 关闭其他浏览器标签

---

## 技术实现细节

### 视频裁剪原理

```javascript
// 1. 创建 Canvas 捕获视频帧
const canvas = document.createElement('canvas');
const stream = canvas.captureStream(30); // 30fps

// 2. 添加音频轨道
const audioContext = new AudioContext();
const source = audioContext.createMediaElementSource(video);
const dest = audioContext.createMediaStreamDestination();
stream.addTrack(dest.stream.getAudioTracks()[0]);

// 3. 使用 MediaRecorder 录制
const recorder = new MediaRecorder(stream, {
  mimeType: 'video/webm;codecs=vp9,opus'
});

// 4. 在指定时间范围内绘制帧
video.ontimeupdate = () => {
  if (video.currentTime >= endTime) {
    recorder.stop();
  }
  ctx.drawImage(video, 0, 0);
};
```

### 为什么实时速度处理？

**浏览器限制**:
- MediaRecorder 依赖实时播放
- 无法像 FFmpeg 那样快速处理
- 受 requestAnimationFrame 约束

**对比**:
- FFmpeg: 10分钟视频 → 30秒处理
- 浏览器API: 10分钟视频 → 10分钟处理

---

## 常见问题

### Q: 为什么不继续使用 FFmpeg.wasm？

**A**: 用户明确要求 "不用 localhost"，而 FFmpeg.wasm 在 file:// 协议下有跨域限制。原生 API 方案完全避免了这个问题。

### Q: 可以同时保留 FFmpeg 版本吗？

**A**: 可以，可以做成切换选项：
- 检测环境：file:// 用原生API，http:// 用FFmpeg
- 用户选择：功能全面(FFmpeg) vs 即开即用(原生)

### Q: 如何添加更多格式支持？

**A**: 浏览器 MediaRecorder 支持的格式有限：
```javascript
// 检测支持的格式
const types = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4' // 通常不支持
];
types.forEach(type => {
  console.log(type, MediaRecorder.isTypeSupported(type));
});
```

### Q: 为什么变速功能音调会变？

**A**: playbackRate 同时改变速度和音调。要保持音调需要复杂的 DSP 算法（如 Web Audio API 的 PitchShifter），超出简单工具范围。

---

## 未来改进方向

### 短期（可用原生 API 实现）

- [ ] 视频旋转（Canvas transform）
- [ ] 亮度/对比度调整（Canvas filter）
- [ ] 水印添加（Canvas drawImage）
- [ ] 简单文字叠加（Canvas fillText）

### 中期（需要额外库）

- [ ] 视频拼接（mp4box.js）
- [ ] 更多格式（WebCodecs API）
- [ ] 音调保持变速（tone.js）

### 长期（需要 WebAssembly）

- [ ] 恢复 FFmpeg.wasm 支持
- [ ] 自定义编译的轻量 FFmpeg
- [ ] 混合方案：简单任务用原生，复杂任务用 FFmpeg

---

## 总结

| 需求 | 推荐方案 |
|------|---------|
| 快速裁剪视频 | ✅ 原生 API |
| 网页播放格式 | ✅ 原生 API (WebM) |
| 多格式支持 | FFmpeg + HTTP服务器 |
| 专业制作 | 桌面 FFmpeg |
| 移动设备 | ⚠️ 功能受限 |

**当前实现**: 完美适配 file:// 协议，无需任何服务器，适合轻量级视频处理场景。

---

**创建日期**: 2026-03-02  
**版本**: 1.0 (原生 API)  
**维护状态**: ✅ 活跃
