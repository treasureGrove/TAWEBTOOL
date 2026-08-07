/* ============================================================
   TA 资源导航 - 共享数据与模糊匹配算法
   暴露到 window：
     - window.TA_RESOURCES   分类与站点数据
     - window.fuzzyScore     单字段模糊匹配评分
     - window.fuzzyBestScore 多字段取最高分
   说明：
     - 被 resources.js（资源页渲染）和 menu.js（顶部全局搜索）共用
     - menu.js 会异步加载本文件以让所有页面都能搜索到资源站点
   ============================================================ */
(function () {
  'use strict';

  var CATEGORIES = [
    {
      id: 'graphics',
      name: '图形学官方与标准',
      icon: 'icon-ta',
      desc: '图形 API、Khronos 标准、GPU 厂商开发者中心',
      sites: [
        { name: 'Khronos Group', url: 'https://www.khronos.org/', desc: 'OpenGL / Vulkan / GLSL / glTF 等开放图形标准的维护组织', icon: '🜲', keywords: ['opengl', 'vulkan', 'gltf', '标准', 'standard'] },
        { name: 'OpenGL Wiki', url: 'https://khronos.org/opengl/wiki/', desc: 'OpenGL 官方百科，覆盖固定管线到现代可编程管线', icon: '📐', keywords: ['opengl', 'wiki', 'gl'] },
        { name: 'Vulkan Documentation', url: 'https://docs.vulkan.org/', desc: 'Vulkan 官方文档与教程入口', icon: '🌋', keywords: ['vulkan', '低层', 'low-level'] },
        { name: 'Microsoft DirectX', url: 'https://learn.microsoft.com/windows/win32/directx', desc: 'DirectX / Direct3D / HLSL 官方文档', icon: '🟦', keywords: ['directx', 'd3d', 'hlsl', 'windows'] },
        { name: 'WebGPU', url: 'https://www.w3.org/community/gpu/', desc: '下一代 Web 图形 API 标准（W3C）', icon: '🌐', keywords: ['webgpu', 'wgpu', 'web', '浏览器'] },
        { name: 'WebGL Reference', url: 'https://developer.mozilla.org/zh-CN/docs/Web/API/WebGL_API', desc: 'MDN 上的 WebGL 完整参考', icon: '📕', keywords: ['webgl', 'mdn', 'web'] },
        { name: 'NVIDIA Developer', url: 'https://developer.nvidia.com/', desc: 'CUDA、DXR、Reflex、Nsight 等工具与 SDK', icon: '🟩', keywords: ['nvidia', 'cuda', 'nsight', 'gpu'] },
        { name: 'AMD GPUOpen', url: 'https://gpuopen.com/', desc: 'AMD 开源 SDK、FidelityFX、Mesh Shader 资料', icon: '🟥', keywords: ['amd', 'fidelityfx', 'gpuopen', 'radeon'] },
        { name: 'Intel Graphics', url: 'https://www.intel.com/content/www/us/en/developer/topics-technologies/graphics.html', desc: 'Intel Arc / Iris Xe 图形开发者资源', icon: '🔷', keywords: ['intel', 'arc', 'iris', 'gpu'] },
        { name: 'Apple Metal', url: 'https://developer.apple.com/metal/', desc: 'Apple 平台 Metal / MetalFX 官方文档', icon: '🍎', keywords: ['apple', 'metal', 'ios', 'mac'] }
      ]
    },

    {
      id: 'engine',
      name: '游戏引擎官方',
      icon: 'icon-game',
      desc: '主流商业与开源游戏引擎的官网与文档',
      sites: [
        { name: 'Unity', url: 'https://unity.com/', desc: '最广泛使用的跨平台商业引擎，文档与资产商店齐全', icon: '🳄', keywords: ['unity', 'u3d', 'c#', 'shader', 'urp', 'hdrp'] },
        { name: 'Unity Documentation', url: 'https://docs.unity3d.com/', desc: 'Unity 官方手册与脚本参考', icon: '📘', keywords: ['unity', 'docs', '文档', 'script'] },
        { name: 'Unreal Engine', url: 'https://www.unrealengine.com/', desc: 'Epic 出品的 AAA 级引擎，Nanite / Lumen / Blueprint', icon: '🦖', keywords: ['unreal', 'ue5', 'ue4', 'epic', 'lumen', 'nanite'] },
        { name: 'Unreal Documentation', url: 'https://docs.unrealengine.com/', desc: 'UE5 官方文档与教程', icon: '📚', keywords: ['unreal', 'docs', 'documentation'] },
        { name: 'Godot Engine', url: 'https://godotengine.org/', desc: '免费开源的轻量级引擎，支持 2D / 3D', icon: '🤖', keywords: ['godot', '开源', 'open-source', 'free', 'gdscript'] },
        { name: 'Cocos Creator', url: 'https://www.cocos.com/', desc: '国产跨平台引擎，适合小游戏 / H5 / 手游', icon: '🟠', keywords: ['cocos', 'creator', 'h5', '小游戏'] },
        { name: 'CryEngine', url: 'https://www.cryengine.com/', desc: '以画面表现著称的商业引擎', icon: '❄️', keywords: ['cryengine', 'crytek'] },
        { name: 'Bevy', url: 'https://bevyengine.org/', desc: 'Rust 编写的现代数据驱动开源引擎', icon: '🦀', keywords: ['bevy', 'rust', 'ecs', 'data-driven'] },
        { name: 'Three.js', url: 'https://threejs.org/', desc: 'Web 端最流行的 WebGL / WebGPU 3D 库', icon: '🟫', keywords: ['three', 'threejs', 'webgl', 'web', 'javascript'] },
        { name: 'Babylon.js', url: 'https://www.babylonjs.com/', desc: '微软开源的 Web 3D 引擎，文档完善', icon: '🟪', keywords: ['babylon', 'web', 'microsoft', 'webgl'] }
      ]
    },

    {
      id: 'dcc',
      name: 'DCC / 3D 创作软件',
      icon: 'icon-3d',
      desc: '建模、雕刻、绑定、动画、特效类桌面软件',
      sites: [
        { name: 'Blender', url: 'https://www.blender.org/', desc: '免费开源的全能 DCC，建模 / 动画 / 合成 / 渲染', icon: '🟠', free: true, keywords: ['blender', '开源', 'free', '建模', 'modeling'] },
        { name: 'Blender Manual', url: 'https://docs.blender.org/manual/zh-hans/latest/', desc: 'Blender 官方中文手册', icon: '📖', keywords: ['blender', 'manual', '文档', '中文'] },
        { name: 'Autodesk Maya', url: 'https://www.autodesk.com/products/maya/', desc: '影视动画与游戏行业标准之三包，Python 可脚本化', icon: '🔵', keywords: ['maya', 'autodesk', '影视', 'film'] },
        { name: 'Autodesk 3ds Max', url: 'https://www.autodesk.com/products/3ds-max/', desc: '建筑可视化与游戏建模常用 DCC', icon: '🟦', keywords: ['3ds', 'max', 'autodesk', 'arch'] },
        { name: 'ZBrush', url: 'https://www.maxon.net/zbrush', desc: '行业标准的数字雕刻软件（Maxon 收购）', icon: '🛠️', keywords: ['zbrush', '雕刻', 'sculpt', 'maxon'] },
        { name: 'Houdini', url: 'https://www.sidefx.com/', desc: 'SideFX 出品的程序化特效与流程之王', icon: '🟢', keywords: ['houdini', 'sidefx', 'vex', '程序化', 'procedural', 'fx'] },
        { name: 'Substance 3D', url: 'https://www.adobe.com/products/substance3d.html', desc: 'Adobe 旗下的 PBR 材质创作套件（Painter / Designer）', icon: '🟧', keywords: ['substance', 'painter', 'designer', 'pbr', 'adobe'] },
        { name: 'Marmoset Toolbag', url: 'https://marmoset.co/toolbag/', desc: '实时 PBR 查看器与烘焙工具，TA 必备', icon: '🟫', keywords: ['marmoset', 'toolbag', '烘焙', 'baking', 'viewer'] },
        { name: 'Cinema 4D', url: 'https://www.maxon.net/cinema-4d', desc: 'Motion Graphic 常用的 DCC 软件', icon: '🟪', keywords: ['c4d', 'cinema', 'maxon', 'mograph'] },
        { name: 'Substance Alchemist', url: 'https://www.substance3d.com/', desc: 'Substance 官方资源总入口，包含社区与教程', icon: '⚗️', keywords: ['substance', 'alchemist', 'pbr', '材质'] }
      ]
    },

    {
      id: 'texture',
      name: '材质与纹理资源站',
      icon: 'icon-image',
      desc: 'PBR 贴图、HDR 环境、扫描材质资源',
      sites: [
        { name: 'Quixel Megascans', url: 'https://quixel.com/megascans', desc: 'UE 用户免费的扫描级 PBR 资产库', icon: '🏔️', free: true, keywords: ['quixel', 'megascans', '扫描', 'scan', 'pbr', 'ue'] },
        { name: 'Poly Haven', url: 'https://polyhaven.com/', desc: '完全免费可商用的 HDR、模型、贴图三件套', icon: '🌴', free: true, keywords: ['haven', 'hdri', 'texture', 'model', '免费'] },
        { name: 'ambientCG', url: 'https://ambientcg.com/', desc: 'CC0 授权的免费 PBR 材质库（原 cc0textures）', icon: '🌾', free: true, keywords: ['ambient', 'cc0', '免费', 'pbr', '材质'] },
        { name: 'Polytexturing textures.one', url: 'https://www.textures.one/', desc: '聚合多家贴图站点的搜索引擎', icon: '🔍', keywords: ['textures', 'search', '聚合'] },
        { name: 'Textures.com', url: 'https://www.textures.com/', desc: '老牌综合性贴图站，含照片级参考', icon: '🖼️', keywords: ['textures', '照片', 'photo'] },
        { name: 'ShareTextures', url: 'https://www.sharetextures.com/', desc: '免费 CC0 的 PBR 材质与 HDRI', icon: '🤝', free: true, keywords: ['share', 'textures', 'cc0', '免费'] },
        { name: 'Poliigon', url: 'https://www.poliigon.com/', desc: '高质量 PBR 贴图与模型（部分免费）', icon: '🎨', keywords: ['poliigon'] },
        { name: 'Substance 3D Assets', url: 'https://helpx.adobe.com/substance-3d-assets.html', desc: 'Adobe 官方 Substance 资产库', icon: '🟧', keywords: ['substance', 'assets', 'adobe'] },
        { name: 'Hdri Haven', url: 'https://hdrihaven.com/', desc: '免费高动态范围环境图（已并入 Poly Haven）', icon: '🌅', free: true, keywords: ['hdri', 'hdr', '环境', '免费'] },
        { name: 'IBL Maps', url: 'https://iblmaps.com/', desc: 'HDRI 环境贴图与 IBL 调试参考', icon: '🗺️', keywords: ['ibl', 'hdri', '环境光'] }
      ]
    },

    {
      id: 'model',
      name: '3D 模型资源站',
      icon: 'icon-3d',
      desc: '在线模型库，含免费 / 付费 / CC0 资源',
      sites: [
        { name: 'Sketchfab', url: 'https://sketchfab.com/', desc: '在线 3D 模型浏览与下载社区，自带在线预览', icon: '🌐', keywords: ['sketchfab', '在线', 'viewer', '社区'] },
        { name: 'CGTrader', url: 'https://www.cgtrader.com/', desc: '大型 3D 模型交易市场，含免费区', icon: '💰', keywords: ['cgtrader', 'marketplace'] },
        { name: 'TurboSquid', url: 'https://www.turbosquid.com/', desc: '老牌专业模型交易平台', icon: '🦑', keywords: ['turbosquid', 'model'] },
        { name: 'Free3D', url: 'https://free3d.com/', desc: '免费 3D 模型聚合站', icon: '🆓', free: true, keywords: ['free', '免费', 'model'] },
        { name: 'Daz 3D', url: 'https://www.daz3d.com/', desc: '角色与 posing 资产为主的平台', icon: '🕺', keywords: ['daz', 'character', '人物'] },
        { name: 'Renderosity', url: 'https://www.renderosity.com/', desc: '面向艺术家的模型 / 资产社区', icon: '🎨', keywords: ['renderosity', '社区'] },
        { name: 'Thingiverse', url: 'https://www.thingiverse.com/', desc: '3D 打印模型站，可用作低面参考', icon: '🖨️', free: true, keywords: ['thingiverse', '3dprint', '打印'] },
        { name: 'Poly Pizza', url: 'https://poly.pizza/', desc: '免费可商用的低面卡通模型库', icon: '🍕', free: true, keywords: ['poly', 'lowpoly', '免费'] }
      ]
    },

    {
      id: 'opensource',
      name: '开源代码与 Shader 沙盒',
      icon: 'icon-ai',
      desc: '代码托管、Shader 实验、在线 IDE',
      sites: [
        { name: 'GitHub', url: 'https://github.com/', desc: '全球最大代码托管平台，开源 TA 项目聚集地', icon: '🐙', keywords: ['github', 'git', 'code', '开源'] },
        { name: 'GitLab', url: 'https://gitlab.com/', desc: '自带 CI / CD 的开源代码平台', icon: '🦊', keywords: ['gitlab', 'ci', 'devops'] },
        { name: 'Gitee', url: 'https://gitee.com/', desc: '国内代码托管，访问速度快', icon: '🟢', keywords: ['gitee', '码云', '国内', 'china'] },
        { name: 'ShaderToy', url: 'https://www.shadertoy.com/', desc: '在线 GLSL Shader 实验、分享社区', icon: '✨', keywords: ['shadertoy', 'glsl', 'shader', '实验'] },
        { name: 'GLSL Sandbox', url: 'http://glslsandbox.com/', desc: '在线 GLSL 实时编辑器', icon: '🏖️', keywords: ['glsl', 'sandbox'] },
        { name: 'Vertexshaderart', url: 'https://www.vertexshaderart.com/', desc: '专注顶点着色器的在线艺术创作社区', icon: '🔺', keywords: ['vertex', 'shader', 'art'] },
        { name: 'CodePen', url: 'https://codepen.io/', desc: '前端 / WebGL 在线代码演示社区', icon: '✏️', keywords: ['codepen', 'web', 'frontend'] },
        { name: 'Observable', url: 'https://observablehq.com/', desc: '数据驱动可探索笔记本，含大量 D3/WebGL 案例', icon: '📊', keywords: ['observable', 'notebook', 'd3'] },
        { name: 'Stackblitz', url: 'https://stackblitz.com/', desc: '浏览器内完整的 Node.js / Web IDE', icon: '⚡', keywords: ['stackblitz', 'ide', 'online'] }
      ]
    },

    {
      id: 'learn',
      name: '图形学与 TA 学习站',
      icon: 'icon-about',
      desc: '权威教程、经典博客、深入浅出的文档',
      sites: [
        { name: 'LearnOpenGL', url: 'https://learnopengl.com/', desc: '最权威的现代 OpenGL 中文 / 英文教程', icon: '🎓', keywords: ['learnopengl', '教程', 'tutorial', '入门'] },
        { name: 'LearnOpenGL CN', url: 'https://learnopengl-cn.github.io/', desc: 'LearnOpenGL 中文社区翻译版本', icon: '🇨🇳', lang: '中文', keywords: ['learnopengl', '中文', 'chinese', '教程'] },
        { name: 'The Book of Shaders', url: 'https://thebookofshaders.com/', desc: 'Fragment Shader 入门权威电子书', icon: '📕', keywords: ['bookofshaders', 'fragment', '入门'] },
        { name: 'Scratchapixel', url: 'https://www.scratchapixel.com/', desc: '从零开始的软件渲染 / 光栅化 / 光追教程', icon: '🧮', keywords: ['scratchapixel', 'raytracing', '光栅化', 'raster'] },
        { name: 'Catlike Coding', url: 'https://catlikecoding.com/', desc: 'Jasper Flick 的 Unity / Shader 高质量教程', icon: '🐱', keywords: ['catlike', 'unity', 'shader', 'tutorial'] },
        { name: 'Real-Time Rendering', url: 'https://www.realtimerendering.com/', desc: 'RTR 一书作者博客与行业资源汇总', icon: '📚', keywords: ['rtr', 'realtime', 'rendering', 'book'] },
        { name: 'Sébastien Lagarde\'s Blog', url: 'https://seblagarde.wordpress.com/', desc: 'Unity 引擎作者之一，PBR / IBL 经典博文', icon: '✍️', keywords: ['lagarde', 'pbr', 'ibl', 'unity'] },
        { name: 'Interplay of Light', url: 'https://interplayoflight.wordpress.com/', desc: '深入渲染技术与性能优化的技术博客', icon: '💡', keywords: ['interplay', 'light', 'rendering'] },
        { name: 'Alextardif', url: 'https://alextardif.com/', desc: '现代渲染 / GPU Driven / Mesh Shader 实践', icon: '⚡', keywords: ['alextardif', 'meshshader', 'gpudriven'] },
        { name: 'Frostbite\'s Presentations', url: 'https://www.ea.com/frostbite/engineering', desc: 'Frostbite 引擎团队公开论文集合', icon: '❄️', keywords: ['frostbite', 'ea', 'paper', 'siggraph'] },
        { name: 'GPUopen Presentations', url: 'https://gpuopen.com/learn/', desc: 'AMD 整理的 GDC / Siggraph 演讲集合', icon: '🟥', keywords: ['gpuopen', 'amd', 'gdc', 'siggraph'] },
        { name: 'Keijiro Takahashi', url: 'https://github.com/keijiro', desc: 'Unity 实验室研究员的开源实验仓库', icon: '🐙', keywords: ['keijiro', 'unity', 'github', 'experimental'] }
      ]
    },

    {
      id: 'community',
      name: '社区 / 论坛',
      icon: 'icon-music',
      desc: 'TA、图形学、游戏开发相关的交流场所',
      sites: [
        { name: 'Polycount', url: 'http://polycount.com/', desc: '游戏美术 / TA 圈最知名的硬核论坛', icon: '💬', keywords: ['polycount', '论坛', 'forum', '美术'] },
        { name: 'Reddit r/GraphicsProgramming', url: 'https://www.reddit.com/r/GraphicsProgramming/', desc: '英文图形编程社区', icon: '🔴', keywords: ['reddit', 'graphics'] },
        { name: 'Reddit r/gamedev', url: 'https://www.reddit.com/r/gamedev/', desc: '最大的游戏开发综合讨论区', icon: '🟠', keywords: ['reddit', 'gamedev'] },
        { name: 'Unity Forum', url: 'https://forum.unity.com/', desc: 'Unity 官方论坛，问题反馈首选', icon: '🟦', keywords: ['unity', 'forum', '官方'] },
        { name: 'Unreal Forums', url: 'https://forums.unrealengine.com/', desc: 'UE 官方社区', icon: '🟥', keywords: ['unreal', 'forum', 'ue'] },
        { name: 'Blender Artists', url: 'https://blenderartists.org/', desc: 'Blender 用户最大社区', icon: '🟠', keywords: ['blender', 'artists', '社区'] },
        { name: 'GameDev Stackexchange', url: 'https://gamedev.stackexchange.com/', desc: '游戏开发问答站（Stack Overflow 子站）', icon: '📚', keywords: ['stack', 'qa', '问答'] },
        { name: 'LoliCode', url: 'https://lolicode.com/', desc: '本站作者的国内 TA / 图形学中文社区', icon: '🌸', lang: '中文', keywords: ['lolicode', '中文', '国内', 'ta'] },
        { name: 'Zhihu 游戏开发者', url: 'https://www.zhihu.com/topic/19589034', desc: '知乎游戏开发话题', icon: '🟢', lang: '中文', keywords: ['zhihu', '知乎', '中文'] },
        { name: 'Bilibili TA 教程', url: 'https://search.bilibili.com/all?keyword=技术美术', desc: 'B 站上的中文 TA / 渲染教程视频', icon: '📺', lang: '中文', keywords: ['bilibili', '视频', '中文', 'tutorial'] }
      ]
    },

    {
      id: 'reference',
      name: '标准 / 规格 / 参考资料',
      icon: 'icon-ta',
      desc: '色彩、物理、规范类权威参考',
      sites: [
        { name: 'PBR Guide by Allegorithmic', url: 'https://academy.substance3d.com/courses/the-pbr-guide', desc: 'Substance 出品的 PBR 入门权威指南', icon: '📕', keywords: ['pbr', 'guide', 'substance', '基础'] },
        { name: 'Academy Color Encoding', url: 'https://acescentral.com/', desc: 'ACES 色彩空间官方中心', icon: '🎨', keywords: ['aces', 'color', '色彩', 'hdr'] },
        { name: 'Colour Confidence', url: 'https://www.colour-science.org/', desc: 'Python 色彩科学库及概念文档', icon: '🐍', keywords: ['colour', 'science', 'python'] },
        { name: 'ICC Profile Specs', url: 'https://www.color.org/icc-specification.icc', desc: 'ICC 色彩管理标准组织', icon: '🖨️', keywords: ['icc', 'profile', '色彩管理'] },
        { name: 'glTF Specification', url: 'https://registry.khronos.org/glTF/specs/', desc: 'Khronos 维护的 glTF 2.0 规范', icon: '📄', keywords: ['gltf', 'spec', 'khronos'] },
        { name: 'Universal Scene Description', url: 'https://openusd.org/', desc: 'Pixar USD / Solaris 通用场景描述标准', icon: '🎬', keywords: ['usd', 'pixar', 'scene', 'pipeline'] }
      ]
    }
  ];

  /* ─── 模糊匹配评分 ───
     返回值含义：
       0           完全不匹配（舍弃）
       1 ~ 99      仅通过子序列模糊匹配（容错字符顺序）
       600 ~ 799   子串包含（连续字符匹配）
       800 ~ 999   子串包含 + 单词边界（开头或分隔符后）
       1000        完全相等
     分数越高越相关，调用方据此排序
     ──────────────────────────────────── */
  function fuzzyScore(query, text) {
    if (!query) return 1;
    if (!text) return 0;
    query = String(query).toLowerCase();
    text = String(text).toLowerCase();
    if (!query.length) return 1;
    if (!text.length) return 0;

    // 完全相等
    if (text === query) return 1000;

    // 子串包含
    var idx = text.indexOf(query);
    if (idx >= 0) {
      var wordStart = (idx === 0) || /[^a-z0-9]/.test(text.charAt(idx - 1));
      return 700 - Math.min(idx, 300) + (wordStart ? 80 : 0);
    }

    // 子序列模糊匹配（按顺序包含 query 的所有字符）
    var qi = 0;
    var score = 0;
    var streak = 0;
    var lastTi = -2;

    for (var ti = 0; ti < text.length && qi < query.length; ti++) {
      if (text.charAt(ti) === query.charAt(qi)) {
        if (ti === lastTi + 1) {
          streak++;
          score += 4 + streak * 3;
        } else {
          streak = 0;
          score += 1;
        }
        if (ti === 0 || /[^a-z0-9]/.test(text.charAt(ti - 1))) {
          score += 12;
        }
        lastTi = ti;
        qi++;
      }
    }

    if (qi !== query.length) return 0; // 没全部匹配

    // 短文本紧凑度加分
    score += Math.max(0, 30 - Math.floor(text.length / 4));
    return Math.max(1, score);
  }

  // 在多个字段中取最高分（如 name / desc / keywords）
  function fuzzyBestScore(query, fields) {
    var best = 0;
    if (!fields) return 0;
    for (var i = 0; i < fields.length; i++) {
      var s = fuzzyScore(query, fields[i]);
      if (s > best) best = s;
    }
    return best;
  }

  // 暴露
  window.TA_RESOURCES = CATEGORIES;
  window.fuzzyScore = fuzzyScore;
  window.fuzzyBestScore = fuzzyBestScore;
})();
