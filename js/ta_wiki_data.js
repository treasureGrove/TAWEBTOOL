(function () {
  const builtinEntries = [
    {
      id: 'pbr-params',
      title: 'PBR 核心参数速查',
      category: '渲染基础',
      tags: ['PBR', 'Metallic', 'Roughness', 'BaseColor'],
      summary: 'PBR 四个核心输入的含义与常见错误定位方法。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## PBR 参数要点

- **BaseColor**：物体固有颜色，不包含镜面反射信息。
- **Metallic**：0=绝缘体，1=金属。
- **Roughness**：控制高光扩散，越高越模糊。
- **Normal**：影响微表面法线方向。

### 常见问题

- 高光发灰：金属度和粗糙度范围设置不合理。
- 看起来像塑料：Metallic 误设为 0。
- 阴影脏：法线贴图方向或压缩格式错误。`
    },
    {
      id: 'brdf-basics',
      title: 'BRDF 与能量守恒',
      category: '渲染基础',
      tags: ['BRDF', 'PBR', 'EnergyConservation', 'Diffuse', 'Specular'],
      summary: '解释漫反射、镜面反射、Fresnel 和能量守恒之间的关系。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 核心概念

BRDF 描述光线从入射方向反射到观察方向的比例。PBR 材质通常把反射拆成漫反射项和镜面项，并通过 Fresnel 控制不同视角下的反射强度。

## TA 检查点

- 金属材质几乎没有漫反射，颜色主要来自镜面 F0。
- 非金属 F0 常见范围约为 0.02 到 0.08。
- 漫反射和镜面反射的总能量不应超过入射能量。
- Roughness 影响高光形状，不应该直接改变材质固有颜色。`
    },
    {
      id: 'gamma-linear',
      title: 'Gamma / 线性空间工作流',
      category: '渲染基础',
      tags: ['Gamma', 'Linear', 'sRGB'],
      summary: '贴图采样与输出阶段的色彩空间处理规则。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 线性工作流

- 贴图以 sRGB 存储，采样后转换到线性空间参与光照。
- 法线、粗糙度、金属度、AO、Mask 等数据贴图通常不走 sRGB。
- 最终输出前再从线性空间转回显示空间。

> 若流程混乱，常见表现是画面发灰、过饱和或材质响应不稳定。`
    },
    {
      id: 'normal-map-space',
      title: '法线贴图空间与通道方向',
      category: '贴图与材质',
      tags: ['NormalMap', 'TangentSpace', 'OpenGL', 'DirectX', 'MikkTSpace'],
      summary: '排查法线贴图凹凸反向、接缝、压缩和切线空间不一致问题。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见空间

- **Tangent Space**：角色和多数道具最常用，能跟随 UV 和动画变形。
- **Object Space**：静态物体可用，颜色方向更固定但复用性差。

## 排查顺序

- 确认引擎使用 DirectX 还是 OpenGL 绿通道方向。
- 确认 DCC、烘焙器和引擎是否都使用 MikkTSpace。
- 法线贴图必须走 NormalMap 压缩和线性采样，不应作为 sRGB 颜色贴图。
- 接缝明显时检查 UV 分割、硬边、切线导入和模型重计算设置。`
    },
    {
      id: 'texture-packing',
      title: '贴图通道打包规范',
      category: '贴图与材质',
      tags: ['ORM', 'RMA', 'TexturePacking', 'Roughness', 'AO', 'Metallic'],
      summary: '规划 AO、Roughness、Metallic、Height 等灰度图的通道合并。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 为什么打包

多个灰度贴图合并到一张 RGBA 贴图可以减少采样次数和资源绑定压力，常用于移动端、开放世界和大量材质实例。

## 常用约定

- ORM：R=AO，G=Roughness，B=Metallic。
- RMA：R=Roughness，G=Metallic，B=AO。
- Height、Mask、Cavity 等通道必须在项目文档中明确。

## 注意事项

- 通道打包图通常使用线性采样，避免 sRGB 转换破坏数值。
- 不同通道变化频率差异过大时，压缩伪影会更明显。
- 命名要包含通道语义，例如 T_Rock_ORM。`
    },
    {
      id: 'mip-streaming',
      title: 'MipMap 与纹理流送',
      category: '贴图与材质',
      tags: ['MipMap', 'Streaming', 'Texture', 'Memory', 'Anisotropic'],
      summary: '理解 MipMap 对闪烁、显存、加载和远景清晰度的影响。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 作用

MipMap 用更小分辨率版本表示远处纹理，能减少采样闪烁并提升缓存命中率。代价是额外约三分之一显存。

## TA 检查点

- UI、查找表和数据贴图不一定需要 MipMap。
- 斜视地面或墙面模糊时检查各向异性过滤。
- 开放世界中要配合纹理流送预算，避免镜头转向时突然糊图。
- Alpha Cutout 纹理需要关注 Mip 后边缘变粗或消失。`
    },
    {
      id: 'fresnel-shader',
      title: 'Shader 模板：Schlick Fresnel',
      category: 'Shader模板',
      tags: ['GLSL', 'Fresnel'],
      summary: '最常用的 Fresnel 近似函数。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## GLSL 示例

\`\`\`glsl
float fresnelSchlick(float cosTheta, float F0) {
  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);
}
\`\`\`

> 用于 IBL、BRDF 近似和边缘高光增强。`
    },
    {
      id: 'ibl-pipeline',
      title: 'IBL 环境光照流程',
      category: '渲染基础',
      tags: ['IBL', 'Cubemap', 'Irradiance', 'Prefilter', 'BRDF LUT'],
      summary: '实时 PBR 中漫反射卷积、预滤波环境贴图和 BRDF LUT 的基本流程。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 标准组成

- Irradiance Map：低频漫反射环境光。
- Prefiltered Environment Map：按 Roughness 预滤波的镜面环境反射。
- BRDF LUT：把视角和粗糙度相关的积分结果预计算到 2D 查找表。

## 常见问题

- 金属反射过暗：检查环境贴图曝光、预滤波链路和色彩空间。
- 粗糙表面有噪声：检查采样数量、Mip 选择和重要性采样。
- 室内外切换突兀：需要 Reflection Probe 或局部环境混合。`
    },
    {
      id: 'shadow-map-basics',
      title: '阴影贴图问题排查',
      category: '光照与阴影',
      tags: ['ShadowMap', 'PCF', 'Bias', 'Cascade', 'PeterPanning'],
      summary: '梳理阴影痤疮、悬浮、锯齿和级联切换的主要原因。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 典型问题

- Shadow Acne：Bias 太小或法线偏移不足。
- Peter Panning：Bias 太大导致阴影脱离接触面。
- 远处锯齿：阴影图分辨率、投影范围或级联划分不合理。
- 级联跳变：Cascade split、稳定投影和过滤策略需要统一。

## 优化方向

缩小光源覆盖范围、使用级联阴影、按平台调 PCF 核大小，并为低端设备准备阴影距离和分辨率档位。`
    },
    {
      id: 'sobel-postprocess',
      title: '后处理模板：Sobel 边缘检测',
      category: '后处理',
      tags: ['PostProcess', 'Sobel', 'Outline'],
      summary: '屏幕空间轮廓线效果常用实现。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 思路

通过 Sobel 核计算屏幕空间梯度，提取边缘强度。

\`\`\`glsl
vec3 sobelEdge(float gx, float gy) {
  float g = sqrt(gx * gx + gy * gy);
  return vec3(g);
}
\`\`\`

可结合深度与法线进一步稳定边缘。`
    },
    {
      id: 'postprocess-order',
      title: '后处理顺序速查',
      category: '后处理',
      tags: ['PostProcess', 'Bloom', 'TAA', 'ToneMapping', 'ColorGrading'],
      summary: '常见后处理节点的执行顺序和互相影响。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见顺序

1. 不透明与透明渲染。
2. 屏幕空间效果，例如 SSAO、SSR。
3. 抗锯齿或时域累积。
4. Bloom、Glare 等 HDR 效果。
5. Tone Mapping。
6. Color Grading。
7. UI 合成。

## 注意事项

Bloom 通常在 Tone Mapping 前基于 HDR 亮度提取；LUT 调色通常在 Tone Mapping 后或按引擎约定执行。`
    },
    {
      id: 'drawcall-instancing',
      title: 'Draw Call、Batch 与 Instancing',
      category: '性能优化',
      tags: ['DrawCall', 'Batch', 'Instancing', 'CPU', 'GPU'],
      summary: '区分 CPU 提交开销、材质切换、合批和实例化的使用边界。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 基本判断

Draw Call 多通常先影响 CPU 提交；材质、Shader 变体、渲染状态和 Mesh 切换都会破坏合批。

## 优化选择

- 静态合批适合不动的场景小物件，但会增加内存。
- 动态合批适合低顶点小网格，现代管线收益有限。
- GPU Instancing 适合大量同 Mesh、同材质、参数少量变化的对象。
- 间接绘制适合草、石子、弹幕等大规模实例。`
    },
    {
      id: 'overdraw-transparency',
      title: '透明与 Overdraw 成本',
      category: '性能优化',
      tags: ['Overdraw', 'Transparency', 'AlphaBlend', 'Particles', 'Mobile'],
      summary: '透明排序、粒子、植被和 UI 对像素填充率的影响。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 为什么贵

透明物体通常不能像不透明物体一样充分利用 Early-Z，多个半透明层会让同一像素反复执行片元着色。

## 优化方向

- 粒子材质减少复杂光照和贴图采样。
- 大面积透明平面要裁掉无效透明区域。
- 植被可比较 Alpha Test、Alpha Blend 和 Alpha To Coverage 的平台表现。
- UI 特效要关注全屏半透明叠层。`
    },
    {
      id: 'gpu-profiler-checklist',
      title: 'GPU 性能分析检查清单',
      category: '性能优化',
      tags: ['Profiler', 'RenderDoc', 'PIX', 'Nsight', 'FrameDebugger'],
      summary: '从帧时间、Pass、带宽、采样和瓶颈定位 GPU 问题。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 排查顺序

- 先确认瓶颈在 CPU 还是 GPU。
- 查看最贵 Pass：阴影、GBuffer、透明、后处理、反射、UI。
- 检查分辨率相关成本，判断是否受 fill rate 影响。
- 检查纹理采样数、循环、分支、带宽和 Render Target 格式。
- 用 RenderDoc、PIX、Nsight 或引擎 Frame Debugger 捕获具体帧。`
    },
    {
      id: 'lod-hlod-impostor',
      title: 'LOD、HLOD 与 Impostor',
      category: '资产管线',
      tags: ['LOD', 'HLOD', 'Impostor', 'Mesh', 'OpenWorld'],
      summary: '远景几何复杂度控制和开放世界资源组织方法。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 使用场景

- LOD：单个模型随距离降低复杂度。
- HLOD：把一组远景物体合并成更低成本的代理。
- Impostor：用贴图或卡片近似远处复杂物体。

## 检查点

切换距离要跟镜头 FOV、目标平台和物体屏幕占比有关；LOD 材质数量也要减少，否则三角面降了但 Draw Call 仍然高。`
    },
    {
      id: 'shader-variant-control',
      title: 'Shader 变体控制',
      category: 'Shader模板',
      tags: ['ShaderVariant', 'Keyword', 'Permutation', 'BuildSize', 'Warmup'],
      summary: '控制材质关键字组合，避免构建体积、加载和运行时卡顿膨胀。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 风险

每个开关都会放大 Shader permutation 数量。变体过多会导致构建时间增加、包体变大、运行时编译或切换卡顿。

## 管理策略

- 合并互斥功能为枚举式分支。
- 删除项目不会用到的管线特性和材质关键字。
- 为关键场景准备预热列表。
- 变体统计要进入版本检查，而不是问题出现后再清理。`
    },
    {
      id: 'render-target-format',
      title: 'Render Target 格式选择',
      category: '图形 API',
      tags: ['RenderTarget', 'HDR', 'R11G11B10F', 'RGBA16F', 'Bandwidth'],
      summary: '根据 HDR、透明、后处理和带宽选择颜色缓冲格式。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见选择

- RGBA8：低成本 LDR 颜色。
- R11G11B10F：常用于 HDR 颜色，带宽比 RGBA16F 低，但没有 Alpha。
- RGBA16F：质量高且支持 Alpha，成本更高。
- R8/R16F：适合 Mask、深度线性化结果或单通道中间图。

## TA 视角

后处理链每多一个全屏 RT 都会增加显存和带宽压力，移动端尤其要控制格式和分辨率。`
    },
    {
      id: 'depth-normal-buffer',
      title: '深度与法线缓冲用途',
      category: '后处理',
      tags: ['Depth', 'NormalBuffer', 'SSAO', 'Outline', 'Reconstruction'],
      summary: '屏幕空间效果如何依赖深度、法线和位置重建。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见用途

- SSAO：用深度和法线估计局部遮蔽。
- 描边：比较相邻像素深度和法线突变。
- SSR：从深度重建位置并进行屏幕空间步进。
- 景深：用深度计算离焦范围。

## 注意事项

反向 Z、非线性深度、MSAA resolve 和透明物体都会影响屏幕空间效果稳定性。`
    },
    {
      id: 'color-management-lut',
      title: '色彩管理与 LUT',
      category: '后处理',
      tags: ['ColorManagement', 'LUT', 'ACES', 'ToneMapping', 'Exposure'],
      summary: '区分曝光、Tone Mapping、LUT 调色和显示输出。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 分工

- Exposure：控制进入显示映射前的整体亮度。
- Tone Mapping：把 HDR 映射到显示范围。
- LUT：做风格化色彩转换。
- Output Transform：适配 sRGB、HDR10 或平台显示规范。

## 风险

不要用 LUT 修复错误光照或错误贴图；先保证线性工作流、曝光和白点正确，再进入风格化调色。`
    },
    {
      id: 'asset-checklist',
      title: '资产导入检查清单',
      category: '流程规范',
      tags: ['资产规范', 'LOD', '贴图'],
      summary: '模型、材质与纹理导入前后的标准检查项。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 导入前

- 命名规范（SM_ / M_ / MI_ / T_）。
- 贴图通道语义清晰（_N / _ORM / _Mask）。
- 单位、轴向、Pivot 和包围盒符合项目规范。

## 导入后

- LOD 是否齐全。
- 法线贴图是否为 NormalMap。
- 压缩格式是否符合平台要求。
- 材质槽数量是否在预算内。

## 发布前

- Draw Call 与三角面统计。
- 关键场景帧时间回归。`
    },
    {
      id: 'asset-naming-budget',
      title: '资产命名与预算字段',
      category: '流程规范',
      tags: ['Naming', 'Budget', 'Pipeline', 'Review', 'Asset'],
      summary: '让资产从文件名、导入设置到性能预算都能被工具自动检查。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 建议字段

- 类型前缀：SM、SK、M、MI、T、FX、BP。
- 语义：场景、部位、材质、用途。
- 平台预算：三角面、材质槽、贴图尺寸、骨骼数、粒子数。

## 自动化方向

用脚本扫描命名、贴图尺寸、压缩格式、材质槽数量和 LOD 缺失情况，把检查结果放到提交或构建流程里。`
    }
  ];

  builtinEntries.push(
    {
      id: 'bc-compression',
      title: '纹理压缩格式速查',
      category: '贴图与材质',
      tags: ['BC1', 'BC3', 'BC5', 'BC7', 'ASTC', '压缩'],
      summary: '常见 PC 与移动端纹理压缩格式的适用场景。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常用格式

- BC1：无 Alpha 或 1bit Alpha 的低成本颜色贴图。
- BC3：带 Alpha 的颜色贴图，质量一般。
- BC5：双通道数据，常用于法线 XY。
- BC7：高质量颜色贴图，PC/主机常用。
- ASTC：移动端常用，可按块大小平衡质量和体积。

## TA 检查点

- 法线贴图不要用普通颜色压缩。
- Mask 图要关注通道串扰和压缩块伪影。
- UI 图标和细线图案要单独检查压缩后边缘。`
    },
    {
      id: 'taa-ghosting',
      title: 'TAA 拖影与闪烁排查',
      category: '后处理',
      tags: ['TAA', 'Ghosting', 'Jitter', 'History', 'Velocity'],
      summary: '时域抗锯齿常见拖影、糊、闪烁问题的定位方法。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 依赖数据

TAA 依赖当前帧颜色、历史帧颜色、Jitter、Depth 和 Velocity。任何一个数据异常都会导致拖影或破碎。

## 常见问题

- Velocity 缺失：运动物体拖影。
- 透明物体写入不一致：边缘闪烁。
- History 权重过高：画面发糊。
- Jitter 与投影矩阵不一致：细节抖动。`
    },
    {
      id: 'ssao-basics',
      title: 'SSAO 参数与伪影',
      category: '后处理',
      tags: ['SSAO', 'AO', 'Depth', 'Normal', 'Noise'],
      summary: '屏幕空间环境遮蔽的参数意义和常见伪影。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 参数含义

- Radius：采样半径，过大会产生脏边。
- Bias：避免自遮蔽，过大则 AO 消失。
- Sample Count：采样数量，影响噪声和性能。
- Blur：降噪但可能漏光。

## 使用边界

SSAO 只基于屏幕可见信息，屏幕外遮挡不会被计算。大场景需要结合烘焙 AO、Bent Normal 或光照探针。`
    },
    {
      id: 'ssr-limit',
      title: 'SSR 反射适用边界',
      category: '后处理',
      tags: ['SSR', 'Reflection', 'Depth', 'RayMarching'],
      summary: '屏幕空间反射为什么会断裂、拉伸和缺失。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见限制

- 只能反射屏幕内已经渲染的内容。
- 粗糙表面需要模糊或降采样处理。
- 深度不连续处容易断裂。
- 镜头边缘容易拉伸或消失。

## TA 建议

SSR 适合补充局部湿地、地面和金属反射，不应作为唯一反射方案。需要和 Reflection Probe、Planar Reflection 或 Ray Tracing 分层使用。`
    },
    {
      id: 'gpu-culling',
      title: 'GPU Culling 基础',
      category: '性能优化',
      tags: ['Culling', 'Compute', 'IndirectDraw', 'HiZ', 'GPU'],
      summary: '用 GPU 剔除不可见实例，降低大规模场景提交和绘制成本。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见剔除

- Frustum Culling：视锥外剔除。
- Occlusion Culling：遮挡剔除。
- LOD Culling：按屏幕尺寸选择层级。
- Small Object Culling：小到不可见的物体直接跳过。

## 落地注意

GPU Culling 通常配合 Compute Shader、Hi-Z Depth、Indirect Draw 使用。调试时要保留可视化，避免剔除错误导致物体闪现。`
    },
    {
      id: 'virtual-texture',
      title: '虚拟纹理适用场景',
      category: '贴图与材质',
      tags: ['VirtualTexture', 'Streaming', 'Terrain', 'Megatexture'],
      summary: '虚拟纹理如何降低大场景贴图内存压力。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 适用场景

- 大地形和开放世界。
- 大量独特贴图的建筑或地表。
- 需要按视角加载局部纹理页的内容。

## 成本

虚拟纹理会引入页表查询、流送延迟和工具链复杂度。TA 需要重点检查页大小、Mip 边界、加载优先级和低速硬盘表现。`
    },
    {
      id: 'decal-pipeline',
      title: 'Decal 管线检查',
      category: '流程规范',
      tags: ['Decal', 'DBuffer', 'Deferred', 'Material'],
      summary: '贴花在延迟/前向管线中的常见实现和限制。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见用途

- 弹孔、污渍、裂纹、路标。
- 局部颜色、法线、粗糙度覆盖。
- 场景细节复用。

## 检查点

贴花数量、投影体积、Overdraw、法线混合和材质通道支持都会影响性能。移动端要谨慎使用大量屏幕空间贴花。`
    },
    {
      id: 'hair-rendering',
      title: '头发渲染问题清单',
      category: '渲染基础',
      tags: ['Hair', 'Anisotropic', 'Alpha', 'Sorting', 'KajiyaKay'],
      summary: '发片和发丝渲染常见的排序、各向异性和抗锯齿问题。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见方案

- 发片：成本低，依赖 Alpha 和法线处理。
- 发丝：质量高，成本和工具链复杂。

## 常见问题

- Alpha 排序错误导致穿插。
- 高光方向不对，多半是切线或各向异性参数问题。
- TAA 下发丝糊或闪，需要 Velocity、Alpha Clip 和采样策略配合。`
    },
    {
      id: 'skin-shading',
      title: '皮肤材质基础',
      category: '渲染基础',
      tags: ['Skin', 'SSS', 'Subsurface', 'Roughness', 'Specular'],
      summary: '皮肤材质由次表面散射、粗糙度和多层细节共同决定。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 关键输入

- BaseColor：不能把强光照烘进颜色。
- Subsurface/Thickness：控制透光和血色感。
- Roughness：控制皮肤油脂和干燥区域。
- Detail Normal：补充毛孔和细纹。

## TA 检查点

皮肤要在不同光照、曝光和阴影下检查，避免只在棚拍环境里调得好看。`
    },
    {
      id: 'terrain-material',
      title: '地形材质混合',
      category: '贴图与材质',
      tags: ['Terrain', 'SplatMap', 'HeightBlend', 'Tiling', 'Macro'],
      summary: '地形材质需要同时处理近景细节、远景重复和层间过渡。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见技术

- Splat Map：控制不同材质权重。
- Height Blend：让泥土、草、石头过渡更自然。
- Macro Texture：打破远景重复。
- Distance Tiling：按距离切换平铺密度。

## 性能关注

每多一层地形材质都会增加采样和分支成本，移动端需要限制层数和法线采样。`
    },
    {
      id: 'vfx-budget',
      title: '特效性能预算',
      category: '性能优化',
      tags: ['VFX', 'Particle', 'Overdraw', 'GPU', 'Budget'],
      summary: '粒子特效需要按屏幕面积、材质复杂度和生成数量做预算。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 预算维度

- 粒子数量。
- 屏幕覆盖面积。
- 材质采样和透明混合成本。
- 碰撞、光照、阴影和排序。

## 检查方法

用 Overdraw、Shader Complexity、GPU Profiler 观察最贵特效，并给战斗峰值、多人同屏和低端机单独设档。`
    },
    {
      id: 'houdini-pipeline',
      title: 'Houdini 程序化资产管线',
      category: '资产管线',
      tags: ['Houdini', 'HDA', 'Procedural', 'Pipeline'],
      summary: '程序化资产适合批量生成，但必须有明确输入输出和版本规则。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 适合内容

- 道路、围栏、建筑变体。
- 地形散布和植被布置。
- 碰撞、LOD、UV 自动生成。

## 管线要求

HDA 参数要稳定，输出命名要可预测，版本更新要能重建旧资产。不要让美术依赖不可追踪的手工后处理。`
    },
    {
      id: 'meshlet-nanite',
      title: 'Meshlet / Nanite 思路',
      category: '图形 API',
      tags: ['Meshlet', 'Nanite', 'Cluster', 'LOD', 'Culling'],
      summary: '现代几何管线常把网格拆成小簇，按可见性和屏幕误差绘制。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 核心思想

把大网格拆成很多小 Cluster 或 Meshlet，再按视锥、遮挡和屏幕误差选择需要绘制的部分。

## TA 视角

这类系统能减少手工 LOD 压力，但对材质数量、透明、变形、碰撞和导入规范有新限制。资产规范仍然重要。`
    },
    {
      id: 'lighting-units',
      title: '物理光照单位',
      category: '光照与阴影',
      tags: ['Lux', 'Lumen', 'Candela', 'EV100', 'Exposure'],
      summary: '理解 Lux、Lumen、Candela、EV100 有助于统一灯光和曝光。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 常见单位

- Lumen：光源总光通量。
- Candela：某方向发光强度。
- Lux：单位面积照度。
- EV100：曝光值，常用于相机曝光。

## 落地建议

项目要统一曝光基准和灯光单位，否则不同关卡、角色和后处理 LUT 很难对齐。`
    },
    {
      id: 'mobile-rendering',
      title: '移动端渲染预算',
      category: '性能优化',
      tags: ['Mobile', 'TileBasedGPU', 'Bandwidth', 'Overdraw'],
      summary: '移动 GPU 对带宽、透明、Render Target 和热功耗更敏感。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-05',
      content: `## 优先关注

- 降低全屏 Pass 数量。
- 控制透明 Overdraw。
- 减少高精度 RT 和多重采样。
- 使用合适的纹理压缩和分辨率档。

## TA 检查点

移动端性能不能只看瞬时帧率，还要看长时间热降频、内存峰值和低端设备加载。`
    }
  );

  const categoryImages = {
    '渲染基础': 'assets/images/wiki/rendering-basics.svg',
    '贴图与材质': 'assets/images/wiki/texture-material.svg',
    'Shader模板': 'assets/images/wiki/shader.svg',
    '光照与阴影': 'assets/images/wiki/lighting.svg',
    '后处理': 'assets/images/wiki/postprocess.svg',
    '性能优化': 'assets/images/wiki/performance.svg',
    '资产管线': 'assets/images/wiki/asset-pipeline.svg',
    '图形 API': 'assets/images/wiki/graphics-api.svg',
    '流程规范': 'assets/images/wiki/workflow.svg'
  };

  builtinEntries.forEach(function (entry) {
    if (!entry.image) {
      entry.image = categoryImages[entry.category] || '';
    }
  });

  window.TAWikiBuiltinEntries = builtinEntries;
})();
