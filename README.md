# TA工具箱 / 技术美术工具箱 (TAWebTool)

> **在线使用：[tools.treasuregrove.art](https://tools.treasuregrove.art/)** — 无需安装，浏览器打开即用。

面向技术美术（TA）与游戏开发者的免费在线工具集，涵盖 AI 生成、图片处理、Shader 开发、3D 预览、PBR 贴图等 20+ 款工具。

---

## 工具列表

### AI 工具箱
| 工具 | 说明 |
|------|------|
| [ChatGPT](https://tools.treasuregrove.art/tools_html/chatgpt.html) | AI 对话与问答助手 |
| [AI 通用生图](https://tools.treasuregrove.art/tools_html/ai_image.html) | 基于 CogView-3-Flash 的文字生图 |
| [AI 生视频](https://tools.treasuregrove.art/tools_html/ai_video.html) | 基于 CogVideoX-Flash 的文字生视频 |
| [AI 高清放大](https://tools.treasuregrove.art/tools_html/ai_upscale.html) | Real-ESRGAN 超分辨率放大 |
| [AI 绘画](https://tools.treasuregrove.art/tools_html/ai_draw.html) | 在线 AI 文生图绘画 |

### 图片处理
| 工具 | 说明 |
|------|------|
| [图片压缩转换](https://tools.treasuregrove.art/tools_html/compress_image.html) | 批量压缩与格式转换 (JPG/PNG/WebP/DDS/TGA/BMP/HEIC/AVIF) |
| [GIF 压缩器](https://tools.treasuregrove.art/tools_html/gif_compress.html) | GIF 动图压缩优化 |
| [贴图通道合成](https://tools.treasuregrove.art/tools_html/combine_rgba.html) | RGBA 通道打包合成 (ORM 贴图) |
| [贴图通道分离](https://tools.treasuregrove.art/tools_html/texture_channel_splitter.html) | 拆分查看各通道及直方图 |
| [PBR 贴图生成器](https://tools.treasuregrove.art/tools_html/pbr_texture_generator.html) | 法线 / 粗糙度 / 金属度一键生成 |
| [Tiling 贴图预览](https://tools.treasuregrove.art/tools_html/tiling_texture.html) | 无缝平铺与接缝检测 |
| [拼贴图工具](https://tools.treasuregrove.art/tools_html/collage_texture.html) | 网格拼贴排列贴图 |
| [HDR 编辑器](https://tools.treasuregrove.art/tools_html/hdr_editor.html) | HDRI 环境贴图编辑 |
| [在线 PS](https://tools.treasuregrove.art/tools_html/ps_online.html) | 基于 Photopea 的在线图片编辑 |

### 3D 工具
| 工具 | 说明 |
|------|------|
| [3D 模型预览器](https://tools.treasuregrove.art/tools_html/model_previewer.html) | GLB / GLTF / FBX / OBJ 在线预览 |

### 视频处理
| 工具 | 说明 |
|------|------|
| [视频剪辑](https://tools.treasuregrove.art/tools_html/video_cut.html) | 在线视频裁剪截取 |
| [视频格式转换](https://tools.treasuregrove.art/tools_html/video_format_cover.html) | 视频转码格式转换 |

### TA 工具
| 工具 | 说明 |
|------|------|
| [Shader 函数库](https://tools.treasuregrove.art/tools_html/shader_library.html) | 常用 Shader 函数速查 (HLSL/GLSL) |
| [GLSL/HLSL 转换器](https://tools.treasuregrove.art/tools_html/glsl_hlsl_converter.html) | Unity / Unreal Shader 语法双向转换 |
| [物理光照计算器](https://tools.treasuregrove.art/tools_html/physics_light.html) | 曝光 / 散射 / EV / Lux 物理计算 |
| [色彩空间转换器](https://tools.treasuregrove.art/tools_html/color_space_converter.html) | Linear / sRGB / ACES / Rec.709 转换 |
| [贴图信息查看器](https://tools.treasuregrove.art/tools_html/image_metadata_inspector.html) | 分辨率 / 显存占用 / 直方图查看 |
| [TA 知识库](https://tools.treasuregrove.art/tools_html/TA_wiki.html) | 每日自动更新的 TA 知识百科 |

### 其他
| 工具 | 说明 |
|------|------|
| [图集打包工具](https://tools.treasuregrove.art/tools_html/sprite_sheet_packer.html) | 序列帧 Sprite Sheet 打包 |
| [网易云音乐](https://tools.treasuregrove.art/tools_html/cloud_music.html) | 网易云歌单一起听 |

---

## 技术栈

- 纯前端静态页面，零依赖框架
- AI 推理基于 ONNX Runtime Web（浏览器端运行 Real-ESRGAN / RIFE）
- Shader 转换、图片处理全部在浏览器端完成，数据不上传服务器
- 设计风格：毛玻璃拟态 + 响应式布局

## 本地运行

```bash
# 任意静态文件服务器即可
npx serve .
# 或
python3 -m http.server 8080
```

不需要 `npm install`，不需要构建。直接用浏览器打开 `index.html`。

## 相关链接

- 作者 B 站：[宝藏小树林](https://space.bilibili.com/277780873)
- 个人主页：[treasuregrove.art](https://treasuregrove.art/)
- 论坛：[LoliCode](https://lolicode.com/)

## License

MIT
