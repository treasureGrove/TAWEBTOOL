(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }

  /* ========== Shader Data ========== */
  var SHADERS = [

    // ==================== 颜色调整 (color) ====================
    {
      name: 'Desaturate', category: 'color',
      desc: '将颜色去饱和（转为灰度），factor=0 原色，factor=1 完全灰度',
      code:
'float3 Desaturate(float3 color, float factor)\n' +
'{\n' +
'    float lum = dot(color, float3(0.2126, 0.7152, 0.0722));\n' +
'    return lerp(color, float3(lum, lum, lum), factor);\n' +
'}'
    },
    {
      name: 'AdjustSaturation', category: 'color',
      desc: '饱和度调整，saturation>1 增强，<1 减弱',
      code:
'float3 AdjustSaturation(float3 color, float saturation)\n' +
'{\n' +
'    float lum = dot(color, float3(0.2126, 0.7152, 0.0722));\n' +
'    return lerp(float3(lum, lum, lum), color, saturation);\n' +
'}'
    },
    {
      name: 'AdjustContrast', category: 'color',
      desc: '对比度调整，以 0.5 灰为中心缩放',
      code:
'float3 AdjustContrast(float3 color, float contrast)\n' +
'{\n' +
'    return (color - 0.5) * contrast + 0.5;\n' +
'}'
    },
    {
      name: 'AdjustBrightness', category: 'color',
      desc: '亮度调整，直接加减亮度值',
      code:
'float3 AdjustBrightness(float3 color, float brightness)\n' +
'{\n' +
'    return color + brightness;\n' +
'}'
    },
    {
      name: 'RGBToHSV', category: 'color',
      desc: 'RGB 转 HSV 色彩空间，H[0,360] S[0,1] V[0,1]',
      code:
'float3 RGBToHSV(float3 rgb)\n' +
'{\n' +
'    float cMax = max(rgb.r, max(rgb.g, rgb.b));\n' +
'    float cMin = min(rgb.r, min(rgb.g, rgb.b));\n' +
'    float delta = cMax - cMin;\n' +
'    float h = 0, s = 0, v = cMax;\n' +
'    if (delta > 1e-5)\n' +
'    {\n' +
'        s = delta / cMax;\n' +
'        if (rgb.r >= cMax) h = (rgb.g - rgb.b) / delta;\n' +
'        else if (rgb.g >= cMax) h = 2.0 + (rgb.b - rgb.r) / delta;\n' +
'        else h = 4.0 + (rgb.r - rgb.g) / delta;\n' +
'        h = frac(h / 6.0) * 360.0;\n' +
'    }\n' +
'    return float3(h, s, v);\n' +
'}'
    },
    {
      name: 'HSVToRGB', category: 'color',
      desc: 'HSV 转 RGB，H[0,360] S[0,1] V[0,1]',
      code:
'float3 HSVToRGB(float3 hsv)\n' +
'{\n' +
'    float h = hsv.x / 60.0;\n' +
'    float s = hsv.y, v = hsv.z;\n' +
'    float c = v * s;\n' +
'    float x = c * (1.0 - abs(fmod(h, 2.0) - 1.0));\n' +
'    float m = v - c;\n' +
'    float3 rgb = float3(m, m, m);\n' +
'    if      (h < 1) rgb += float3(c, x, 0);\n' +
'    else if (h < 2) rgb += float3(x, c, 0);\n' +
'    else if (h < 3) rgb += float3(0, c, x);\n' +
'    else if (h < 4) rgb += float3(0, x, c);\n' +
'    else if (h < 5) rgb += float3(x, 0, c);\n' +
'    else             rgb += float3(c, 0, x);\n' +
'    return rgb;\n' +
'}'
    },
    {
      name: 'RGBToLinear', category: 'color',
      desc: 'sRGB 伽马空间转线性空间（精确版）',
      code:
'float3 RGBToLinear(float3 srgb)\n' +
'{\n' +
'    // 精确 sRGB -> Linear\n' +
'    return srgb <= 0.04045\n' +
'        ? srgb / 12.92\n' +
'        : pow((srgb + 0.055) / 1.055, 2.4);\n' +
'}'
    },
    {
      name: 'LinearToRGB', category: 'color',
      desc: '线性空间转 sRGB 伽马空间（精确版）',
      code:
'float3 LinearToRGB(float3 lin)\n' +
'{\n' +
'    return lin <= 0.0031308\n' +
'        ? lin * 12.92\n' +
'        : 1.055 * pow(lin, 1.0 / 2.4) - 0.055;\n' +
'}'
    },
    {
      name: 'HueShift', category: 'color',
      desc: '色相偏移，shift 单位为角度（0~360）',
      code:
'float3 HueShift(float3 color, float shift)\n' +
'{\n' +
'    float3 hsv = RGBToHSV(color);\n' +
'    hsv.x = fmod(hsv.x + shift, 360.0);\n' +
'    return HSVToRGB(hsv);\n' +
'}'
    },
    {
      name: 'WhiteBalance', category: 'color',
      desc: '简易白平衡，temperature 正值偏暖，tint 正值偏品红',
      code:
'float3 WhiteBalance(float3 color, float temperature, float tint)\n' +
'{\n' +
'    // 简化的色温/色调调整\n' +
'    color.r += temperature * 0.1;\n' +
'    color.b -= temperature * 0.1;\n' +
'    color.g += tint * 0.1;\n' +
'    return saturate(color);\n' +
'}'
    },
    {
      name: 'BlendOverlay', category: 'color',
      desc: 'Photoshop Overlay 混合模式',
      code:
'float BlendOverlay(float base, float blend)\n' +
'{\n' +
'    return base < 0.5\n' +
'        ? 2.0 * base * blend\n' +
'        : 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);\n' +
'}\n' +
'float3 BlendOverlay3(float3 base, float3 blend)\n' +
'{\n' +
'    return float3(\n' +
'        BlendOverlay(base.r, blend.r),\n' +
'        BlendOverlay(base.g, blend.g),\n' +
'        BlendOverlay(base.b, blend.b));\n' +
'}'
    },
    {
      name: 'BlendSoftLight', category: 'color',
      desc: 'Photoshop 柔光混合模式',
      code:
'float BlendSoftLight(float base, float blend)\n' +
'{\n' +
'    return blend < 0.5\n' +
'        ? 2.0 * base * blend + base * base * (1.0 - 2.0 * blend)\n' +
'        : 2.0 * base * (1.0 - blend) + sqrt(base) * (2.0 * blend - 1.0);\n' +
'}'
    },
    {
      name: 'ACESToneMapping', category: 'color',
      desc: 'ACES 电影级色调映射曲线（Narkowicz 拟合）',
      code:
'float3 ACESToneMapping(float3 x)\n' +
'{\n' +
'    float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;\n' +
'    return saturate((x * (a * x + b)) / (x * (c * x + d) + e));\n' +
'}'
    },
    {
      name: 'Uncharted2ToneMapping', category: 'color',
      desc: 'Uncharted 2 色调映射（Hable 曲线）',
      code:
'float3 Uncharted2Curve(float3 x)\n' +
'{\n' +
'    float A = 0.15, B = 0.50, C = 0.10;\n' +
'    float D = 0.20, E = 0.02, F = 0.30;\n' +
'    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;\n' +
'}\n' +
'float3 Uncharted2ToneMapping(float3 color, float exposureBias)\n' +
'{\n' +
'    float3 curr = Uncharted2Curve(color * exposureBias);\n' +
'    float3 whiteScale = 1.0 / Uncharted2Curve(float3(11.2, 11.2, 11.2));\n' +
'    return curr * whiteScale;\n' +
'}'
    },
    {
      name: 'Luminance', category: 'color',
      desc: '计算感知亮度（Rec.709 标准权重）',
      code:
'float Luminance(float3 color)\n' +
'{\n' +
'    return dot(color, float3(0.2126, 0.7152, 0.0722));\n' +
'}'
    },

    // ==================== 数学工具 (math) ====================
    {
      name: 'Remap', category: 'math',
      desc: '将值从 [inMin,inMax] 映射到 [outMin,outMax]',
      code:
'float Remap(float value, float inMin, float inMax, float outMin, float outMax)\n' +
'{\n' +
'    return outMin + (value - inMin) / (inMax - inMin) * (outMax - outMin);\n' +
'}'
    },
    {
      name: 'InverseLerp', category: 'math',
      desc: '反向线性插值，返回 value 在 [a,b] 中的比例',
      code:
'float InverseLerp(float a, float b, float value)\n' +
'{\n' +
'    return saturate((value - a) / (b - a));\n' +
'}'
    },
    {
      name: 'SmootherstepCustom', category: 'math',
      desc: 'Ken Perlin 改进版 smoothstep（C2 连续，比 smoothstep 更平滑）',
      code:
'float SmootherstepCustom(float edge0, float edge1, float x)\n' +
'{\n' +
'    float t = saturate((x - edge0) / (edge1 - edge0));\n' +
'    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);\n' +
'}'
    },
    {
      name: 'RotateVector2D', category: 'math',
      desc: '将 2D 向量绕原点旋转 angle 弧度',
      code:
'float2 RotateVector2D(float2 v, float angle)\n' +
'{\n' +
'    float s = sin(angle);\n' +
'    float c = cos(angle);\n' +
'    return float2(v.x * c - v.y * s, v.x * s + v.y * c);\n' +
'}'
    },
    {
      name: 'RotationMatrix3D', category: 'math',
      desc: '构建绕任意轴旋转的 3x3 矩阵（Rodrigues 公式）',
      code:
'float3x3 RotationMatrix3D(float3 axis, float angle)\n' +
'{\n' +
'    float s = sin(angle);\n' +
'    float c = cos(angle);\n' +
'    float t = 1.0 - c;\n' +
'    float3 a = normalize(axis);\n' +
'    return float3x3(\n' +
'        t * a.x * a.x + c,       t * a.x * a.y - s * a.z, t * a.x * a.z + s * a.y,\n' +
'        t * a.x * a.y + s * a.z, t * a.y * a.y + c,       t * a.y * a.z - s * a.x,\n' +
'        t * a.x * a.z - s * a.y, t * a.y * a.z + s * a.x, t * a.z * a.z + c\n' +
'    );\n' +
'}'
    },
    {
      name: 'Hash21', category: 'math',
      desc: '2D 输入 → 1D 伪随机数 [0,1]，适合程序化纹理',
      code:
'float Hash21(float2 p)\n' +
'{\n' +
'    p = frac(p * float2(123.34, 456.21));\n' +
'    p += dot(p, p + 45.32);\n' +
'    return frac(p.x * p.y);\n' +
'}'
    },
    {
      name: 'Hash31', category: 'math',
      desc: '3D 输入 → 1D 伪随机数 [0,1]',
      code:
'float Hash31(float3 p)\n' +
'{\n' +
'    p = frac(p * 0.1031);\n' +
'    p += dot(p, p.yzx + 33.33);\n' +
'    return frac((p.x + p.y) * p.z);\n' +
'}'
    },
    {
      name: 'ValueNoise2D', category: 'math',
      desc: '基于晶格的 2D Value Noise（双线性插值）',
      code:
'float ValueNoise2D(float2 p)\n' +
'{\n' +
'    float2 i = floor(p);\n' +
'    float2 f = frac(p);\n' +
'    float2 u = f * f * (3.0 - 2.0 * f); // smoothstep\n' +
'    float a = Hash21(i + float2(0, 0));\n' +
'    float b = Hash21(i + float2(1, 0));\n' +
'    float c = Hash21(i + float2(0, 1));\n' +
'    float d = Hash21(i + float2(1, 1));\n' +
'    return lerp(lerp(a, b, u.x), lerp(c, d, u.x), u.y);\n' +
'}'
    },
    {
      name: 'GradientNoise2D', category: 'math',
      desc: '2D 梯度噪声（Perlin 风格），返回 [-1,1]',
      code:
'float2 GradientDir(float2 p)\n' +
'{\n' +
'    p = fmod(p, 289.0);\n' +
'    float x = frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453);\n' +
'    return normalize(float2(x, frac(sin(dot(p, float2(269.5, 183.3))) * 43758.5453)) * 2.0 - 1.0);\n' +
'}\n' +
'float GradientNoise2D(float2 p)\n' +
'{\n' +
'    float2 i = floor(p);\n' +
'    float2 f = frac(p);\n' +
'    float2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);\n' +
'    return lerp(\n' +
'        lerp(dot(GradientDir(i + float2(0,0)), f - float2(0,0)),\n' +
'             dot(GradientDir(i + float2(1,0)), f - float2(1,0)), u.x),\n' +
'        lerp(dot(GradientDir(i + float2(0,1)), f - float2(0,1)),\n' +
'             dot(GradientDir(i + float2(1,1)), f - float2(1,1)), u.x),\n' +
'        u.y);\n' +
'}'
    },
    {
      name: 'VoronoiNoise', category: 'math',
      desc: 'Voronoi 噪声，返回最近细胞距离',
      code:
'float VoronoiNoise(float2 uv, float scale)\n' +
'{\n' +
'    float2 g = floor(uv * scale);\n' +
'    float2 f = frac(uv * scale);\n' +
'    float minDist = 1.0;\n' +
'    for (int y = -1; y <= 1; y++)\n' +
'    for (int x = -1; x <= 1; x++)\n' +
'    {\n' +
'        float2 neighbor = float2(x, y);\n' +
'        float2 point = Hash21(g + neighbor);\n' +
'        float2 diff = neighbor + point - f;\n' +
'        minDist = min(minDist, length(diff));\n' +
'    }\n' +
'    return minDist;\n' +
'}'
    },
    {
      name: 'FBM', category: 'math',
      desc: '分形布朗运动（叠加多层噪声，增加细节）',
      code:
'float FBM(float2 p, int octaves)\n' +
'{\n' +
'    float value = 0.0;\n' +
'    float amplitude = 0.5;\n' +
'    float frequency = 1.0;\n' +
'    for (int i = 0; i < octaves; i++)\n' +
'    {\n' +
'        value += amplitude * ValueNoise2D(p * frequency);\n' +
'        frequency *= 2.0;\n' +
'        amplitude *= 0.5;\n' +
'    }\n' +
'    return value;\n' +
'}'
    },
    {
      name: 'SphereSDF', category: 'math',
      desc: '球体有符号距离场',
      code:
'float SphereSDF(float3 p, float3 center, float radius)\n' +
'{\n' +
'    return length(p - center) - radius;\n' +
'}'
    },
    {
      name: 'BoxSDF', category: 'math',
      desc: '轴对齐盒体有符号距离场',
      code:
'float BoxSDF(float3 p, float3 center, float3 halfSize)\n' +
'{\n' +
'    float3 d = abs(p - center) - halfSize;\n' +
'    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);\n' +
'}'
    },
    {
      name: 'CapsuleSDF', category: 'math',
      desc: '胶囊体有符号距离场（两端点 + 半径）',
      code:
'float CapsuleSDF(float3 p, float3 a, float3 b, float radius)\n' +
'{\n' +
'    float3 ab = b - a;\n' +
'    float t = saturate(dot(p - a, ab) / dot(ab, ab));\n' +
'    return length(p - a - ab * t) - radius;\n' +
'}'
    },
    {
      name: 'EaseInOutCubic', category: 'math',
      desc: '三次缓入缓出，适合动画曲线',
      code:
'float EaseInOutCubic(float t)\n' +
'{\n' +
'    return t < 0.5\n' +
'        ? 4.0 * t * t * t\n' +
'        : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;\n' +
'}'
    },

    // ==================== 光照计算 (lighting) ====================
    {
      name: 'FresnelSchlick', category: 'lighting',
      desc: 'Schlick 近似菲涅尔反射率，F0 为正入射反射率',
      code:
'float3 FresnelSchlick(float cosTheta, float3 F0)\n' +
'{\n' +
'    return F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);\n' +
'}'
    },
    {
      name: 'FresnelSchlickRoughness', category: 'lighting',
      desc: '带粗糙度的菲涅尔（用于 IBL 环境光计算）',
      code:
'float3 FresnelSchlickRoughness(float cosTheta, float3 F0, float roughness)\n' +
'{\n' +
'    return F0 + (max(float3(1.0 - roughness, 1.0 - roughness, 1.0 - roughness), F0) - F0)\n' +
'           * pow(1.0 - cosTheta, 5.0);\n' +
'}'
    },
    {
      name: 'LambertDiffuse', category: 'lighting',
      desc: 'Lambert 漫反射（最基础的漫反射模型）',
      code:
'float LambertDiffuse(float3 normal, float3 lightDir)\n' +
'{\n' +
'    return max(dot(normal, lightDir), 0.0);\n' +
'}'
    },
    {
      name: 'BlinnPhong', category: 'lighting',
      desc: 'Blinn-Phong 高光反射',
      code:
'float BlinnPhong(float3 normal, float3 lightDir, float3 viewDir, float shininess)\n' +
'{\n' +
'    float3 halfDir = normalize(lightDir + viewDir);\n' +
'    return pow(max(dot(normal, halfDir), 0.0), shininess);\n' +
'}'
    },
    {
      name: 'DistributionGGX', category: 'lighting',
      desc: 'GGX/Trowbridge-Reitz 法线分布函数（PBR 核心）',
      code:
'float DistributionGGX(float3 N, float3 H, float roughness)\n' +
'{\n' +
'    float a = roughness * roughness;\n' +
'    float a2 = a * a;\n' +
'    float NdotH = max(dot(N, H), 0.0);\n' +
'    float NdotH2 = NdotH * NdotH;\n' +
'    float denom = NdotH2 * (a2 - 1.0) + 1.0;\n' +
'    return a2 / (3.14159265 * denom * denom);\n' +
'}'
    },
    {
      name: 'GeometrySchlickGGX', category: 'lighting',
      desc: 'Schlick-GGX 几何遮蔽函数（单方向）',
      code:
'float GeometrySchlickGGX(float NdotV, float roughness)\n' +
'{\n' +
'    float r = roughness + 1.0;\n' +
'    float k = (r * r) / 8.0;\n' +
'    return NdotV / (NdotV * (1.0 - k) + k);\n' +
'}'
    },
    {
      name: 'GeometrySmith', category: 'lighting',
      desc: 'Smith 几何遮蔽（组合观察方向和光照方向）',
      code:
'float GeometrySmith(float3 N, float3 V, float3 L, float roughness)\n' +
'{\n' +
'    float NdotV = max(dot(N, V), 0.0);\n' +
'    float NdotL = max(dot(N, L), 0.0);\n' +
'    return GeometrySchlickGGX(NdotV, roughness)\n' +
'         * GeometrySchlickGGX(NdotL, roughness);\n' +
'}'
    },
    {
      name: 'CookTorranceBRDF', category: 'lighting',
      desc: '完整 Cook-Torrance PBR 镜面反射 BRDF',
      code:
'float3 CookTorranceBRDF(float3 N, float3 V, float3 L, float roughness,\n' +
'    float metallic, float3 albedo)\n' +
'{\n' +
'    float3 H = normalize(V + L);\n' +
'    float3 F0 = lerp(float3(0.04, 0.04, 0.04), albedo, metallic);\n' +
'    float D = DistributionGGX(N, H, roughness);\n' +
'    float G = GeometrySmith(N, V, L, roughness);\n' +
'    float3 F = FresnelSchlick(max(dot(H, V), 0.0), F0);\n' +
'    float NdotV = max(dot(N, V), 0.001);\n' +
'    float NdotL = max(dot(N, L), 0.001);\n' +
'    float3 spec = (D * G * F) / (4.0 * NdotV * NdotL);\n' +
'    float3 kD = (1.0 - F) * (1.0 - metallic);\n' +
'    return kD * albedo / 3.14159265 + spec;\n' +
'}'
    },
    {
      name: 'SubsurfaceScattering', category: 'lighting',
      desc: '简化次表面散射近似（皮肤/蜡/树叶等半透明材质）',
      code:
'float3 SubsurfaceScattering(float3 N, float3 L, float3 V,\n' +
'    float3 sssColor, float distortion, float power, float scale)\n' +
'{\n' +
'    float3 sssLight = L + N * distortion;\n' +
'    float sssDot = pow(saturate(dot(V, -sssLight)), power) * scale;\n' +
'    return sssColor * sssDot;\n' +
'}'
    },
    {
      name: 'HalfLambert', category: 'lighting',
      desc: 'Half Lambert（Valve 提出，用于防止背面全黑）',
      code:
'float HalfLambert(float3 normal, float3 lightDir)\n' +
'{\n' +
'    float NdotL = dot(normal, lightDir);\n' +
'    return NdotL * 0.5 + 0.5;\n' +
'}'
    },

    // ==================== UV与位置 (uv) ====================
    {
      name: 'RotateUV', category: 'uv',
      desc: 'UV 绕中心点旋转指定弧度',
      code:
'float2 RotateUV(float2 uv, float angle, float2 center)\n' +
'{\n' +
'    float s = sin(angle);\n' +
'    float c = cos(angle);\n' +
'    uv -= center;\n' +
'    float2 rotated = float2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);\n' +
'    return rotated + center;\n' +
'}'
    },
    {
      name: 'TilingOffset', category: 'uv',
      desc: 'UV 平铺与偏移（等同于 Unity Texture ST）',
      code:
'float2 TilingOffset(float2 uv, float2 tiling, float2 offset)\n' +
'{\n' +
'    return uv * tiling + offset;\n' +
'}'
    },
    {
      name: 'ParallaxMapping', category: 'uv',
      desc: '基础视差映射（高度图偏移 UV 实现深度错觉）',
      code:
'float2 ParallaxMapping(float2 uv, float3 viewDirTangent, float heightScale,\n' +
'    Texture2D heightMap, SamplerState samp)\n' +
'{\n' +
'    float height = heightMap.Sample(samp, uv).r;\n' +
'    float2 p = viewDirTangent.xy / viewDirTangent.z * (height * heightScale);\n' +
'    return uv - p;\n' +
'}'
    },
    {
      name: 'TriplanarMapping', category: 'uv',
      desc: '三面映射（消除拉伸，适合地形/岩石等不规则模型）',
      code:
'float4 TriplanarMapping(Texture2D tex, SamplerState samp,\n' +
'    float3 worldPos, float3 worldNormal, float sharpness)\n' +
'{\n' +
'    float3 blend = pow(abs(worldNormal), sharpness);\n' +
'    blend /= (blend.x + blend.y + blend.z);\n' +
'    float4 xProj = tex.Sample(samp, worldPos.yz);\n' +
'    float4 yProj = tex.Sample(samp, worldPos.xz);\n' +
'    float4 zProj = tex.Sample(samp, worldPos.xy);\n' +
'    return xProj * blend.x + yProj * blend.y + zProj * blend.z;\n' +
'}'
    },
    {
      name: 'ReconstructWorldPos', category: 'uv',
      desc: '从深度缓冲重建世界坐标（后处理常用）',
      code:
'float3 ReconstructWorldPos(float2 uv, float depth, float4x4 invViewProj)\n' +
'{\n' +
'    // uv: [0,1] 屏幕坐标，depth: 非线性深度值\n' +
'    float4 clipPos = float4(uv * 2.0 - 1.0, depth, 1.0);\n' +
'    clipPos.y = -clipPos.y; // DX 与 OpenGL Y 方向相反\n' +
'    float4 worldPos = mul(invViewProj, clipPos);\n' +
'    return worldPos.xyz / worldPos.w;\n' +
'}'
    },
    {
      name: 'ScreenToUV', category: 'uv',
      desc: '屏幕空间坐标转 UV（齐次除法 + 偏移）',
      code:
'float2 ScreenToUV(float4 screenPos)\n' +
'{\n' +
'    return screenPos.xy / screenPos.w * 0.5 + 0.5;\n' +
'}'
    },
    {
      name: 'PolarCoordinates', category: 'uv',
      desc: 'UV 转极坐标（制作径向/旋转效果）',
      code:
'float2 PolarCoordinates(float2 uv, float2 center, float radialScale, float lengthScale)\n' +
'{\n' +
'    float2 delta = uv - center;\n' +
'    float radius = length(delta) * 2.0 * radialScale;\n' +
'    float angle = atan2(delta.y, delta.x) / 6.28318530 * lengthScale;\n' +
'    return float2(radius, angle);\n' +
'}'
    },
    {
      name: 'SphericalUV', category: 'uv',
      desc: '3D 方向向量转球面 UV（天空盒/环境贴图采样）',
      code:
'float2 SphericalUV(float3 dir)\n' +
'{\n' +
'    float u = atan2(dir.z, dir.x) / 6.28318530 + 0.5;\n' +
'    float v = asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265 + 0.5;\n' +
'    return float2(u, v);\n' +
'}'
    },
    {
      name: 'FlowMapUV', category: 'uv',
      desc: 'Flow Map UV 动画（水面/岩浆流动效果）',
      code:
'float4 FlowMapUV(float2 uv, float2 flowDir, float time, float phase)\n' +
'{\n' +
'    float t0 = frac(time + phase);\n' +
'    float t1 = frac(time + phase + 0.5);\n' +
'    float2 uv0 = uv - flowDir * t0;\n' +
'    float2 uv1 = uv - flowDir * t1;\n' +
'    float blend = abs(t0 * 2.0 - 1.0);\n' +
'    return float4(uv0, uv1) ; // 采样两次后用 blend 混合\n' +
'    // result = lerp(tex.Sample(samp, uv0), tex.Sample(samp, uv1), blend);\n' +
'}'
    },
  ];

  /* ========== State ========== */
  var currentCat = 'all';
  var currentSearch = '';

  /* ========== Syntax Highlight ========== */
  var hlslTypes = '\\b(float|float2|float3|float4|float2x2|float3x3|float4x4|half|half2|half3|half4|int|int2|int3|int4|uint|bool|void|Texture2D|SamplerState)\\b';
  var hlslKeywords = '\\b(return|if|else|for|while|do|break|continue|struct|const|static|in|out|inout|uniform|cbuffer)\\b';
  var hlslBuiltins = '\\b(saturate|clamp|lerp|step|smoothstep|abs|sign|floor|ceil|frac|fmod|pow|sqrt|rsqrt|exp|exp2|log|log2|sin|cos|tan|asin|acos|atan|atan2|dot|cross|normalize|length|distance|reflect|refract|min|max|mul|transpose|determinant|ddx|ddy|tex2D|Sample)\\b';

  function highlight(code) {
    // Escape HTML first
    var s = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Comments (// ...)
    s = s.replace(/(\/\/.*)/g, '<span class="cm">$1</span>');

    // Strings
    s = s.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="str">$1</span>');

    // Numbers (before keywords to avoid partial matches)
    s = s.replace(/\b(\d+\.?\d*f?)\b/g, '<span class="num">$1</span>');

    // Types
    s = s.replace(new RegExp(hlslTypes, 'g'), '<span class="ty">$1</span>');

    // Keywords
    s = s.replace(new RegExp(hlslKeywords, 'g'), '<span class="kw">$1</span>');

    // Built-in functions
    s = s.replace(new RegExp(hlslBuiltins, 'g'), '<span class="fn">$1</span>');

    return s;
  }

  /* ========== Rendering ========== */
  var catLabels = {
    color: '颜色调整', math: '数学工具', lighting: '光照计算', uv: 'UV与位置'
  };

  function render() {
    var grid = $('slGrid');
    var q = currentSearch.toLowerCase();
    var filtered = SHADERS.filter(function (s) {
      if (currentCat !== 'all' && s.category !== currentCat) return false;
      if (q && s.name.toLowerCase().indexOf(q) < 0 && s.desc.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });

    $('slCount').textContent = filtered.length;

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="sl-empty">没有找到匹配的函数</div>';
      return;
    }

    grid.innerHTML = filtered.map(function (s, i) {
      return '<div class="sl-card">' +
        '<div class="sl-card-head">' +
          '<span class="sl-card-name">' + escHtml(s.name) + '</span>' +
          '<span class="sl-tag sl-tag-' + s.category + '">' + catLabels[s.category] + '</span>' +
          '<button class="sl-card-copy" data-idx="' + i + '">复制</button>' +
        '</div>' +
        '<div class="sl-card-desc">' + escHtml(s.desc) + '</div>' +
        '<div class="sl-code-wrap"><pre>' + highlight(s.code) + '</pre></div>' +
      '</div>';
    }).join('');

    // Bind copy buttons
    grid.querySelectorAll('.sl-card-copy').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.idx);
        var code = filtered[idx].code;
        navigator.clipboard.writeText(code).then(function () {
          btn.textContent = '已复制';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = '复制';
            btn.classList.remove('copied');
          }, 1500);
        });
      });
    });
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ========== Init ========== */
  function init() {
    // Search
    $('slSearch').addEventListener('input', function () {
      currentSearch = this.value;
      render();
    });

    // Category filters
    document.querySelectorAll('.sl-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.sl-filter').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentCat = btn.dataset.cat;
        render();
      });
    });

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
