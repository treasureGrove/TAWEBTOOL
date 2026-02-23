# AI视频补帧功能说明

## 📋 功能现状

### ✅ 已实现
1. **完整的UI界面**
   - 视频上传（拖拽/点击）
   - 队列管理
   - 参数配置面板
   - 进度显示
   - 文件操作（下载/删除）

2. **核心框架**
   - ONNX Runtime Web 集成
   - 视频帧提取逻辑
   - 帧插值算法框架
   - 模型加载机制
   - 缓存系统

3. **自定义模型支持**
   - 上传自定义ONNX模型
   - 模型缓存
   - GPU/CPU执行模式切换

### ⚠️ 待完善

**主要问题：RIFE没有官方ONNX模型**

RIFE（Real-Time Intermediate Flow Estimation）是目前最优秀的视频帧插值算法，但官方只提供了PyTorch模型，没有发布ONNX版本。

## 🔧 解决方案

### 方案1：自行转换RIFE模型（推荐）

如果你熟悉Python和PyTorch，可以自行将RIFE模型转换为ONNX格式：

```python
import torch
import onnx
from model.RIFE import Model

# 1. 加载RIFE PyTorch模型
model = Model()
model.load_model('train_log', -1)
model.eval()

# 2. 准备示例输入
img0 = torch.randn(1, 3, 256, 256)
img1 = torch.randn(1, 3, 256, 256)
timestep = torch.tensor([0.5])

# 3. 转换为ONNX
torch.onnx.export(
    model.flownet,
    (torch.cat((img0, img1), 1), [4, 2, 1], timestep),
    "rife_v4.6.onnx",
    input_names=['input', 'scale_list', 'timestep'],
    output_names=['output'],
    dynamic_axes={
        'input': {0: 'batch', 2: 'height', 3: 'width'},
        'output': {0: 'batch', 2: 'height', 3: 'width'}
    },
    opset_version=17
)
```

转换后将 `.onnx` 文件上传到工具中使用。

### 方案2：使用其他支持ONNX的插帧模型

虽然不如RIFE效果好，但以下模型有ONNX版本：

1. **FILM (Frame Interpolation for Large Motion)**
   - Google提供
   - 有TFLite版本，可转ONNX

2. **SuperSloMo**
   - 较早的插帧模型
   - 社区有ONNX转换

3. **DAIN (Depth-Aware Video Frame Interpolation)**
   - 考虑深度信息
   - 效果不错但速度慢

### 方案3：使用ncnn-vulkan (推荐用于本地应用)

如果是桌面应用而非纯Web应用，可以使用：

```bash
# rife-ncnn-vulkan 是nihui开发的高性能实现
https://github.com/nihui/rife-ncnn-vulkan
```

这个实现使用ncnn框架，性能优秀且跨平台。

## 📦 当前代码中的实现

代码已经搭建好完整框架，包括：

1. **视频处理流程**
   ```javascript
   loadVideo → extractFrames → interpolateFrames → mergeVideo
   ```

2. **模型接口**
   - 支持自定义ONNX模型上传
   - 模型缓存（IndexedDB）
   - GPU加速（WebGPU）

3. **帧插值核心函数**
   ```javascript
   interpolateBetweenFrames(frame1, frame2, t)
   ```
   目前实现了简单的线性插值作为后备方案。

## 🚀 使用说明

### 当前可用功能

1. **上传视频**
   - 支持 MP4, AVI, MOV, MKV 等格式
   - 拖拽或点击上传

2. **配置参数**
   - 帧率倍数：2x/3x/4x
   - 执行模式：GPU/CPU
   - 输出方式：下载/文件夹

3. **自定义模型**
   - 选择"自定义ONNX模型"
   - 点击"上传自定义模型"
   - 选择转换好的 `.onnx` 文件

### 如果你有RIFE ONNX模型

1. 在AI模型下拉菜单选择"自定义ONNX模型"
2. 点击"上传自定义模型"按钮
3. 选择你的 `.onnx` 文件
4. 点击"加载自定义模型"
5. 上传视频并开始处理

## 📚 参考资源

1. **RIFE官方仓库**
   - https://github.com/hzwer/ECCV2022-RIFE
   - https://github.com/hzwer/Practical-RIFE

2. **ONNX模型转换**
   - https://pytorch.org/docs/stable/onnx.html
   - https://github.com/onnx/tutorials

3. **其他插帧工具**
   - rife-ncnn-vulkan: https://github.com/nihui/rife-ncnn-vulkan
   - FILM: https://github.com/google-research/frame-interpolation

## 🔄 后续开发计划

1. ✅ 完成UI和框架搭建
2. ⏳ 寻找或转换可用的RIFE ONNX模型
3. ⏳ 集成FFmpeg.wasm实现完整视频编码
4. ⏳ 优化内存使用，支持长视频
5. ⏳ 添加视频预览和帧对比功能

## 💡 建议

**对于实际使用**：

1. **Web端**：等待官方ONNX支持或使用其他模型
2. **桌面应用**：使用 `rife-ncnn-vulkan` 获得最佳性能
3. **移动端**：考虑使用轻量级模型

**对于开发者**：

1. 自行转换RIFE模型到ONNX
2. 验证模型在浏览器中的兼容性
3. 贡献到社区供他人使用

## ⚠️ 注意事项

1. 视频处理需要大量计算资源
2. 长视频或高分辨率视频会占用大量内存
3. 浏览器端性能有限，建议处理短视频
4. WebGPU需要较新的浏览器版本支持

## 📧 反馈

如果你：
- 成功转换了RIFE ONNX模型
- 发现了其他可用的插帧模型
- 有任何建议或问题

欢迎反馈！

---

**最后更新**: 2026-02-18
