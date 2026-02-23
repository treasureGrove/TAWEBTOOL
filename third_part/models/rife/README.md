请将你要使用的 RIFE ONNX 模型重命名为 `rife_latest.onnx` 并放到此目录下：

- 本地优先加载：页面会首先尝试加载 `../third_part/models/rife/rife_latest.onnx`（相对于 `tools_html/ai_frame_interpolation.html`）。
- 如果本地文件不存在，会回退到远程模型（v4.18）下载。

放置步骤：
1. 下载或转换得到 `.onnx` 模型文件（示例名称 `rife_latest.onnx`）。
2. 将文件复制到项目：`third_part/models/rife/rife_latest.onnx`。
3. 打开 `tools_html/ai_frame_interpolation.html`，选择模型 `RIFE Latest (本地优先)`，点击“加载模型”。

注意：如果你的模型不是 ONNX 格式或需要特定输入名/shape，请先确保模型兼容（常见转换来源：Practical-RIFE 或社区转换）。
