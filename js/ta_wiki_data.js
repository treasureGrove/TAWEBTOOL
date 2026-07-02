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
      updatedAt: '2026-07-02',
      content: `## PBR 参数要点\n\n- **BaseColor**：物体固有颜色，不包含镜面反射信息。\n- **Metallic**：0=绝缘体，1=金属。\n- **Roughness**：控制高光扩散，越高越模糊。\n- **Normal**：影响微表面法线方向。\n\n### 常见问题\n1. 高光发灰：金属度和粗糙度范围设置不合理。\n2. 看起来像塑料：Metallic 误设为 0。\n3. 阴影脏：法线贴图方向或压缩格式错误。`
    },
    {
      id: 'gamma-linear',
      title: 'Gamma / 线性空间工作流',
      category: '渲染基础',
      tags: ['Gamma', 'Linear', 'sRGB'],
      summary: '贴图采样与输出阶段的色彩空间处理规则。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-02',
      content: `## 线性工作流\n\n- 贴图以 sRGB 存储，采样后转换到线性空间参与光照。\n- 最终输出前再从线性空间转回 sRGB。\n\n
> 若流程混乱，常见表现是画面发灰或过饱和。`
    },
    {
      id: 'fresnel-shader',
      title: 'Shader 模板：Schlick Fresnel',
      category: 'Shader模板',
      tags: ['GLSL', 'Fresnel'],
      summary: '最常用的 Fresnel 近似函数。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-02',
      content: `## GLSL 示例\n\n\`\`\`glsl\nfloat fresnelSchlick(float cosTheta, float F0) {\n  return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);\n}\n\`\`\`\n\n> 用于 IBL、BRDF 近似和边缘高光增强。`
    },
    {
      id: 'sobel-postprocess',
      title: '后处理模板：Sobel 边缘检测',
      category: 'Shader模板',
      tags: ['PostProcess', 'Sobel'],
      summary: '屏幕空间轮廓线效果常用实现。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-02',
      content: `## 思路\n\n通过 Sobel 核计算屏幕空间梯度，提取边缘强度。\n\n\`\`\`glsl\nvec3 sobelEdge(float gx, float gy) {\n  float g = sqrt(gx * gx + gy * gy);\n  return vec3(g);\n}\n\`\`\`\n\n可结合深度与法线进一步稳定边缘。`
    },
    {
      id: 'asset-checklist',
      title: '资产导入检查清单',
      category: '流程规范',
      tags: ['资产规范', 'LOD', '贴图'],
      summary: '模型、材质与纹理导入前后的标准检查项。',
      source: 'builtin',
      quality: 'verified',
      updatedAt: '2026-07-02',
      content: `## 导入前\n\n- 命名规范（SM_ / M_ / MI_ / T_）\n- 贴图通道语义清晰（_N/_R/_M）\n\n## 导入后\n\n- LOD 是否齐全\n- 法线贴图是否为 NormalMap\n- 压缩格式是否符合平台要求\n\n## 发布前\n\n- draw call 与三角面统计\n- 关键场景帧时间回归`
    }
  ];

  window.TAWikiBuiltinEntries = builtinEntries;
})();
