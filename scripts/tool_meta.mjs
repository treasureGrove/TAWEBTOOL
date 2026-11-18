/**
 * 工具页的搜索意图文案（title / description / 分享卡片文案）。
 *
 * 为什么单独抽一张表：tools_html/*.html 是手写页面，标题和描述散落在 37 个文件里，
 * 改一次要动 74 处标签。这张表把它们收敛成一份可 review、可批量应用的映射，
 * 由 scripts/apply_tool_meta.mjs 写入页面，由 scripts/gen_tool_og.mjs 生成分享图。
 *
 * 写法约定：
 *   title       ≤ 32 字符（含 " - TA工具箱" 品牌尾巴），核心词前置，跟用户搜索词一致。
 *   description 55–80 字符，先说做什么，再给使用场景或差异点，句末带句号。
 *   name        分享卡片上的大标题，短。
 *   pitch       分享卡片上的一句话，≤ 20 字符。
 *   local       true = 全程浏览器内处理，素材不上传。只有确认过不走服务端的工具才能为 true。
 */
export const BRAND = 'TA工具箱';
export const CARD_DIR = 'assets/images/og/tool';

export const TOOL_META = {
  'compress_image.html': {
    title: '图片压缩与格式转换｜在线批量转 WebP/DDS - TA工具箱',
    description:
      '在线批量压缩图片并互转 JPG/PNG/WebP/DDS/TGA/AVIF 等格式，可调画质与尺寸。全部在浏览器内完成，素材不上传。',
    name: '图片压缩与格式转换',
    pitch: '批量压，随便转，不上传',
    local: true
  },
  'base64_image.html': {
    title: '图片转 Base64｜Data URI 在线互转 - TA工具箱',
    description:
      '图片转 Base64（Data URI）或把 Base64 还原成图片，支持一键复制与下载，适合前端贴图和配置文件。纯前端处理。',
    name: '图片与 Base64 互转',
    pitch: '贴图进代码，一步搞定',
    local: true
  },
  'gif_compress.html': {
    title: 'GIF 压缩｜在线减小动图体积 - TA工具箱',
    description:
      '在线压缩 GIF 动图，可调整帧率、尺寸与质量来减小体积，适合表情包、序列帧预览和文档配图。不上传服务器。',
    name: 'GIF 压缩器',
    pitch: '减帧降尺寸，体积立降',
    local: true
  },
  'combine_rgba.html': {
    title: 'ORM 贴图打包｜RGBA 通道在线合成 - TA工具箱',
    description:
      '把 R/G/B/A 四张单通道贴图合成为一张 RGBA 贴图，常用于 ORM（遮蔽/粗糙度/金属度）打包。浏览器内合成，素材不出本机。',
    name: '贴图通道合成',
    pitch: 'ORM 打包，不用开 PS',
    local: true
  },
  'texture_channel_splitter.html': {
    title: '贴图通道分离｜RGBA 拆单通道图 - TA工具箱',
    description:
      '把 RGBA/TGA 贴图拆成独立的 R/G/B/A 单通道图片，带直方图预览，可导出 TGA/PNG/JPG。用于检查 ORM 各通道是否画错。',
    name: '贴图通道分离',
    pitch: '拆开看，哪一路画错了',
    local: true
  },
  'pbr_texture_generator.html': {
    title: 'PBR 贴图生成器｜一键出法线粗糙度金属度 - TA工具箱',
    description:
      '从一张基础图自动生成法线、粗糙度、金属度、AO 与高度贴图，参数可调可对比。浏览器内计算，项目素材不用上传。',
    name: 'PBR 贴图生成器',
    pitch: '一张图，出五张 PBR 贴图',
    local: true
  },
  'tiling_texture.html': {
    title: 'Tiling 无缝贴图预览｜接缝检测 - TA工具箱',
    description:
      '把贴图按 Tiling 平铺预览，快速看出四方连续接缝和明暗断层，适合做地表、墙面等需要无缝拼接的材质。',
    name: 'Tiling 贴图预览',
    pitch: '一眼看出接缝在哪',
    local: true
  },
  'collage_texture.html': {
    title: '拼贴图工具｜贴图网格拼接在线 - TA工具箱',
    description:
      '把多张贴图按网格排列拼成一张大图，支持铺满与 Tiling 两种模式，适合做材质对比图和贴图集。',
    name: '拼贴图工具',
    pitch: '多张贴图，拼成一张',
    local: true
  },
  'hdr_editor.html': {
    title: 'HDR 编辑器｜EXR 在线预览与调色 - TA工具箱',
    description:
      '在线打开 EXR/HDR 环境贴图，调节曝光、色温与强度并实时预览，可用于 IBL 光照和天空球调试。素材不上传。',
    name: 'HDR 编辑器',
    pitch: 'EXR 拖进来就能调',
    local: true
  },
  'gltf_optimizer.html': {
    title: 'GLB 压缩与 LOD｜glTF 减面贴图优化 - TA工具箱',
    description:
      '查看 glTF/GLB 的三角面数、贴图体积与显存占用，一键减面、缩小贴图并导出优化后的模型，适合出包前瘦身。',
    name: 'glTF 压缩与 LOD',
    pitch: '出包前，先给模型瘦身',
    local: true
  },
  'model_previewer.html': {
    title: '3D 模型在线预览｜GLB/FBX/OBJ - TA工具箱',
    description:
      '在线预览 GLB/GLTF/FBX/OBJ/USDZ 模型，实时 PBR 渲染并支持动画播放，不用装引擎就能检查资产是否正常。',
    name: '3D 模型预览器',
    pitch: '拖进来看，不用开引擎',
    local: true
  },
  'sprite_sheet_packer.html': {
    title: '图集打包｜Sprite Sheet 在线合成 - TA工具箱',
    description:
      '把多张图片合并成精灵表（Sprite Sheet），自动排布并生成图集，适合序列帧动画和 UI 图集制作。',
    name: '图集打包工具',
    pitch: '序列帧合成一张图',
    local: true
  },
  'sprite_sheet_splitter.html': {
    title: '雪碧图拆分｜序列帧自动切图 - TA工具箱',
    description:
      '按网格把雪碧图/精灵表自动拆成单帧，支持序列帧切图与逐帧预览，拆分后可批量下载。适合还原美术给的图集。',
    name: '雪碧图拆分',
    pitch: '一张图集，拆回每一帧',
    local: true
  },
  'image_metadata_inspector.html': {
    title: '贴图显存预算｜BC/ETC2/ASTC 批量算 - TA工具箱',
    description:
      '批量查看贴图分辨率与是否带透明通道，按 BC/ETC2/ASTC 对比显存占用并算上完整 Mipmap，可导出 CSV 报告。',
    name: '贴图信息查看器',
    pitch: '显存预算，批量算清楚',
    local: true
  },
  'color_space_converter.html': {
    title: '色彩空间转换｜Linear/sRGB/ACES - TA工具箱',
    description:
      '在 Linear、sRGB、Gamma、ACES、Rec.709 等色彩空间之间换算颜色值，并给出十六进制与浮点结果，调材质时随手查。',
    name: '色彩空间转换器',
    pitch: '颜色别猜，直接换算',
    local: true
  },
  'physics_light.html': {
    title: '物理光照计算器｜EV/曝光/Lux 换算 - TA工具箱',
    description:
      '按光圈、快门、ISO 计算曝光值与 EV，并换算 Lux 等光照单位，方便在引擎里对齐真实世界的光照强度。',
    name: '物理光照计算器',
    pitch: '曝光和 EV，一次算对',
    local: true
  },
  'shader_library.html': {
    title: 'Shader 函数库｜HLSL/GLSL 速查 - TA工具箱',
    description:
      '收录常用 HLSL/GLSL 材质函数与代码片段，按用途分类速查，写 Shader 时不用再翻文档。',
    name: 'Shader 函数库',
    pitch: '常用 Shader 片段速查',
    local: true
  },
  'glsl_hlsl_converter.html': {
    title: 'GLSL/HLSL 转换器｜着色器语法对照 - TA工具箱',
    description:
      '在 Unity 与 Unreal 之间转换 Shader 语法，基于规则做初稿，结果需人工检查后在目标引擎编译。',
    name: 'GLSL/HLSL 转换器',
    pitch: '跨引擎搬 Shader，先出初稿',
    local: true
  },
  'watermark_remover.html': {
    title: '图片去水印｜本地 AI 修复不上传 - TA工具箱',
    description:
      '自动识别图片上的可见水印并做本地 AI 修复，可用画笔微调区域、前后对比后下载原尺寸 PNG。素材全程不出本机。',
    name: '图片去水印',
    pitch: '素材不出本机，也能修',
    local: true
  },
  'video_cut.html': {
    title: '视频剪辑｜在线裁剪截取片段 - TA工具箱',
    description:
      '在线裁剪视频片段，支持 MP4/MOV 等常见格式，选好起止点直接导出，不用装剪辑软件。',
    name: '视频剪辑',
    pitch: '截一段，马上拿走',
    local: true
  },
  'video_format_cover.html': {
    title: '视频格式转换｜MP4/WebM/GIF 互转 - TA工具箱',
    description:
      '在线转换视频格式并调整分辨率，支持 MP4/WebM/MOV/MKV/GIF 互转，基于 FFmpeg WASM 在浏览器内转码。',
    name: '视频格式转换',
    pitch: '格式互转，浏览器内转码',
    local: true
  },
  'ps_online.html': {
    title: '在线 PS｜Photopea 网页版修图 - TA工具箱',
    description:
      '基于 Photopea 的在线图片编辑，支持 PSD 图层、抠图与滤镜，打开浏览器就能改图，不用安装 Photoshop。',
    name: '在线 PS',
    pitch: 'PSD 直接开，不用装',
    local: false
  },
  'ai_image.html': {
    title: 'AI 生图｜在线文字生成图片 - TA工具箱',
    description:
      '输入一段描述就能生成图片，适合快速出概念图和材质参考，打开网页即用，不用配环境。',
    name: 'AI 通用生图',
    pitch: '一句描述，直接出图',
    local: false
  },
  'ai_video.html': {
    title: 'AI 生视频｜文字生成短视频 - TA工具箱',
    description:
      '用文字描述生成短视频片段，适合做动态参考和氛围预览，生成后有额度限制，注意别传敏感素材。',
    name: 'AI 生视频',
    pitch: '一句话，生成一小段视频',
    local: false
  },
  'ai_draw.html': {
    title: 'AI 绘画｜在线文生图创作 - TA工具箱',
    description:
      '在线文生图工具，可按风格描述生成插画与概念图，适合美术找灵感和快速出草图。',
    name: 'AI 绘画',
    pitch: '换个风格，再生成一版',
    local: false
  },
  'ai_upscale.html': {
    title: 'AI 图片放大｜2x/4x 超分辨率 - TA工具箱',
    description:
      '用超分辨率算法把图片放大 2 倍或 4 倍，尽量保留边缘与细节，适合把旧素材、截图和贴图拉大。',
    name: 'AI 高清放大',
    pitch: '小图拉大，尽量不糊',
    local: false
  },
  'chatgpt.html': {
    title: 'AI 对话｜在线 ChatGPT 问答 - TA工具箱',
    description:
      '在线和大语言模型对话，适合查 API 用法、写脚本草稿、解释报错信息，免登录即可开始。',
    name: 'AI 对话',
    pitch: '问引擎 API，比翻文档快',
    local: false
  },
  'cloud_music.html': {
    title: '网易云音乐网页版｜歌单一起听 - TA工具箱',
    description:
      '在网页里听网易云音乐，支持扫码登录、每日推荐、私人 FM 与歌单播放，挂着写 Shader 时顺手用。',
    name: '和我一起听',
    pitch: '写代码的时候放点歌',
    local: false
  },
  'resources.html': {
    title: 'TA 资源导航｜图形学引擎 DCC 精选 - TA工具箱',
    description:
      '技术美术方向的资源导航：图形学标准、游戏引擎、DCC 软件、PBR 材质、3D 模型与开源 Shader，按用途分类整理。',
    name: 'TA 资源导航',
    pitch: '按用途分类的干货合集',
    local: false
  },
  'services.html': {
    title: '工具定制与需求咨询 - TA工具箱',
    description:
      '提交工具改进需求，或讨论贴图批处理、序列帧与项目流程定制。先填需求稿，再决定怎么做。',
    name: '工具定制与需求咨询',
    pitch: '有批处理需求？说说看',
    local: false
  },
  'about.html': {
    title: '关于作者｜游戏技术美术 - TA工具箱',
    description:
      'TA工具箱的作者主页：一名游戏技术美术，把日常用得到的小工具做成网页版免费放出来，顺手记录踩过的坑。',
    name: '关于作者',
    pitch: '一个 TA 的日常工具',
    local: false
  },
  'TA_wiki.html': {
    title: 'TA 知识库｜每日更新的技术美术百科 - TA工具箱',
    description:
      '每天自动采集更新的技术美术知识库：渲染管线、贴图、Shader、引擎特性等条目，带来源链接，可当速查手册用。',
    name: 'TA 知识库',
    pitch: '每天自动更新的 TA 百科',
    local: false
  },
  'grove_range.html': {
    title: '小树林尸潮｜FPS 射击小游戏 - TA工具箱',
    description:
      'Three.js 第一人称射击小游戏：在林间清理一波波僵尸，爆头连击冲高分，成绩上服务器排行榜。',
    name: '小树林尸潮',
    pitch: 'Three.js 做的 FPS 小游戏',
    local: false
  },
  'grove_survivor.html': {
    title: '单目幸存者｜俯视角生存小游戏 - TA工具箱',
    description:
      '俯视角自动射击生存小游戏：走位躲潮、拾取经验升级技能，一局十分钟，冲击服务器排行榜。',
    name: '单目幸存者',
    pitch: '一局十分钟的生存挑战',
    local: false
  },
  'dafy_whale_tank.html': {
    title: '大肥鱼开坦克｜3D 鲸鱼坦克游戏 - TA工具箱',
    description:
      '鲸鱼娘开着「白饭号」坦克在星空甲板迎击泡泡坦克，Three.js 做的 3D 波次小游戏，有 BOSS 和白饭补给。',
    name: '大肥鱼开坦克',
    pitch: '鲸鱼娘开坦克守白饭',
    local: false
  },
  'pelican.html': {
    title: '鹈鹕骑行｜3D 海岸骑行小游戏 - TA工具箱',
    description:
      '一只鹈鹕骑着复古自行车穿过黄金时刻的海岸，纯程序化 3D 场景，支持鼠标与触屏环视。',
    name: '鹈鹕骑行',
    pitch: '黄金时刻的海岸骑行',
    local: false
  }
};

export const TOOL_SLUGS = Object.keys(TOOL_META);
export const cardFile = (slug) => `${CARD_DIR}/${slug.replace(/\.html$/, '')}-1200x630.png`;
