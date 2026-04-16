const EXAMPLES = {
    glsl: `precision mediump float;

uniform sampler2D uMainTex;
uniform vec2 uResolution;
varying vec2 vUv;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    vec4 baseColor = texture(uMainTex, uv);
    float mask = smoothstep(0.2, 0.8, vUv.x);
    vec3 finalColor = mix(baseColor.rgb, vec3(vUv, 1.0), mask);
    gl_FragColor = vec4(finalColor, 1.0);
}`,
    hlsl: `cbuffer Globals
{
    float2 uResolution;
};

Texture2D uMainTex;
SamplerState uMainTexSampler;

struct PSInput
{
    float4 position : SV_Position;
    float2 vUv : TEXCOORD0;
};

float4 main(PSInput input) : SV_Target
{
    float2 uv = input.position.xy / uResolution.xy;
    float4 baseColor = uMainTex.Sample(uMainTexSampler, uv);
    float mask = smoothstep(0.2, 0.8, input.vUv.x);
    float3 finalColor = lerp(baseColor.rgb, float3(input.vUv, 1.0), mask);
    return float4(finalColor, 1.0);
}`
};

const MODELS = {
    glslToHlsl: {
        sourceLabel: "GLSL",
        targetLabel: "HLSL",
        sourcePlaceholder: "// 在这里粘贴 GLSL 代码",
        targetPlaceholder: "// 转换后的 HLSL 会显示在这里",
        buttonText: "执行 GLSL → HLSL",
        notes: [
            "建议优先处理 fragment shader。当前入口转换按常见片元写法生成 HLSL。",
            "复杂宏、结构体语义、多目标输出和自定义管线绑定仍需要人工复核。"
        ],
        rules: [
            "`vec/mat` 映射为 `float` 系列类型。",
            "`mix`、`fract`、`mod`、`dFdx` 等常见函数会替换为 HLSL 对应函数。",
            "`sampler2D` 会拆成 `Texture2D + SamplerState`。",
            "`uniform` 会尽量归并到 `cbuffer Globals`。",
            "`gl_FragColor` 会优先改写成 `return`。"
        ]
    },
    hlslToGlsl: {
        sourceLabel: "HLSL",
        targetLabel: "GLSL",
        sourcePlaceholder: "// 在这里粘贴 HLSL 代码",
        targetPlaceholder: "// 转换后的 GLSL 会显示在这里",
        buttonText: "执行 HLSL → GLSL",
        notes: [
            "当前主要面向常见 HLSL 片元着色器代码，尤其是 `Texture2D/SamplerState` 和 `PSInput` 场景。",
            "HLSL semantic、寄存器绑定、复杂 `cbuffer` 布局转回 GLSL 后请继续人工整理。"
        ],
        rules: [
            "`floatN/intN/boolN` 会映射回 `vec/ivec/bvec`。",
            "`Texture2D.Sample` 会尽量恢复成 `texture(sampler, uv)`。",
            "`cbuffer Globals` 中的成员会转回 `uniform`。",
            "`SV_Position` 会映射到 `gl_FragCoord` 或 `varying/in` 的常见输入场景。",
            "`return float4(...)` 会优先改写为 `gl_FragColor = vec4(...)`。"
        ]
    }
};

const GLSL_TO_HLSL_TYPES = {
    vec2: "float2",
    vec3: "float3",
    vec4: "float4",
    ivec2: "int2",
    ivec3: "int3",
    ivec4: "int4",
    bvec2: "bool2",
    bvec3: "bool3",
    bvec4: "bool4",
    mat2: "float2x2",
    mat3: "float3x3",
    mat4: "float4x4"
};

const HLSL_TO_GLSL_TYPES = {
    float2: "vec2",
    float3: "vec3",
    float4: "vec4",
    int2: "ivec2",
    int3: "ivec3",
    int4: "ivec4",
    bool2: "bvec2",
    bool3: "bvec3",
    bool4: "bvec4",
    float2x2: "mat2",
    float3x3: "mat3",
    float4x4: "mat4"
};

document.addEventListener("DOMContentLoaded", () => {
    const sourceInput = document.getElementById("sourceInput");
    const targetOutput = document.getElementById("targetOutput");
    const inputTitle = document.getElementById("inputTitle");
    const outputTitle = document.getElementById("outputTitle");
    const inputStats = document.getElementById("inputStats");
    const outputStats = document.getElementById("outputStats");
    const convertBtn = document.getElementById("convertBtn");
    const exampleBtn = document.getElementById("exampleBtn");
    const swapBtn = document.getElementById("swapBtn");
    const copyBtn = document.getElementById("copyBtn");
    const clearBtn = document.getElementById("clearBtn");
    const notesList = document.getElementById("notesList");
    const ruleList = document.getElementById("ruleList");
    const convertStatus = document.getElementById("convertStatus");
    const convertMeta = document.getElementById("convertMeta");
    const glslToHlslBtn = document.getElementById("glslToHlslBtn");
    const hlslToGlslBtn = document.getElementById("hlslToGlslBtn");

    let mode = "glslToHlsl";

    function setStats(text, target) {
        const normalized = text || "";
        const lines = normalized.length ? normalized.split(/\r?\n/).length : 0;
        target.textContent = `${lines} 行 / ${normalized.length} 字符`;
    }

    function updateStats() {
        setStats(sourceInput.value, inputStats);
        setStats(targetOutput.value, outputStats);
    }

    function setStatus(title, meta) {
        convertStatus.textContent = title;
        convertMeta.textContent = meta;
    }

    function renderList(target, items, emptyText) {
        target.innerHTML = "";
        if (!items.length) {
            const item = document.createElement("li");
            item.className = "empty-note";
            item.textContent = emptyText;
            target.appendChild(item);
            return;
        }

        items.forEach((text) => {
            const item = document.createElement("li");
            item.textContent = text;
            target.appendChild(item);
        });
    }

    function applyMode(nextMode) {
        mode = nextMode;
        const config = MODELS[mode];

        inputTitle.textContent = config.sourceLabel;
        outputTitle.textContent = config.targetLabel;
        sourceInput.placeholder = config.sourcePlaceholder;
        targetOutput.placeholder = config.targetPlaceholder;
        convertBtn.textContent = config.buttonText;

        glslToHlslBtn.classList.toggle("active", mode === "glslToHlsl");
        hlslToGlslBtn.classList.toggle("active", mode === "hlslToGlsl");

        renderList(notesList, config.notes, "当前没有额外说明。");
        renderList(ruleList, config.rules, "当前没有规则说明。");
        updateStats();
        setStatus("已切换转换方向", `当前模式：${config.sourceLabel} → ${config.targetLabel}。`);
    }

    function runConvert() {
        const source = sourceInput.value.trim();
        if (!source) {
            targetOutput.value = "";
            updateStats();
            renderList(notesList, ["请输入源代码后再执行转换。"], "请输入源代码后再执行转换。");
            setStatus("没有可转换的内容", "左侧输入为空。");
            return;
        }

        const result = mode === "glslToHlsl"
            ? convertGlslToHlsl(source)
            : convertHlslToGlsl(source);

        targetOutput.value = result.code;
        renderList(notesList, result.notes, "当前没有额外提醒。");
        updateStats();
        setStatus("转换完成", `已生成 ${MODELS[mode].targetLabel}，共 ${result.code.split(/\r?\n/).length} 行。`);
    }

    exampleBtn.addEventListener("click", () => {
        sourceInput.value = mode === "glslToHlsl" ? EXAMPLES.glsl : EXAMPLES.hlsl;
        runConvert();
    });

    convertBtn.addEventListener("click", runConvert);

    swapBtn.addEventListener("click", () => {
        const tmp = sourceInput.value;
        sourceInput.value = targetOutput.value;
        targetOutput.value = tmp;
        updateStats();
        setStatus("内容已交换", "如需反向转换，请同时切换上方转换方向。");
    });

    copyBtn.addEventListener("click", async () => {
        if (!targetOutput.value.trim()) {
            setStatus("没有可复制的结果", "请先执行一次转换。");
            return;
        }

        try {
            await navigator.clipboard.writeText(targetOutput.value);
            setStatus("结果已复制", `${MODELS[mode].targetLabel} 已写入剪贴板。`);
        } catch (error) {
            setStatus("复制失败", "浏览器未授予剪贴板权限，请手动复制右侧内容。");
        }
    });

    clearBtn.addEventListener("click", () => {
        sourceInput.value = "";
        targetOutput.value = "";
        updateStats();
        renderList(notesList, MODELS[mode].notes, "当前没有额外说明。");
        setStatus("已清空", "等待新的代码输入。");
    });

    sourceInput.addEventListener("input", () => {
        updateStats();
        setStatus("输入已更新", "点击转换按钮生成新的结果。");
    });

    targetOutput.addEventListener("input", () => {
        updateStats();
        setStatus(`${MODELS[mode].targetLabel} 已可编辑`, "右侧支持继续手动调整。");
    });

    glslToHlslBtn.addEventListener("click", () => applyMode("glslToHlsl"));
    hlslToGlslBtn.addEventListener("click", () => applyMode("hlslToGlsl"));

    applyMode("glslToHlsl");
});

function convertGlslToHlsl(source) {
    const notes = [];
    let code = source.replace(/\r\n/g, "\n");
    const samplerNames = [];
    const uniformEntries = [];
    const inputEntries = [];
    const outputEntries = [];

    code = code.replace(/^\s*#version\s+.+$/gm, "");

    if (/precision\s+(lowp|mediump|highp)\s+\w+\s*;/g.test(code)) {
        notes.push("已移除 GLSL precision 声明，HLSL 中通常不需要该语句。");
        code = code.replace(/^\s*precision\s+(lowp|mediump|highp)\s+\w+\s*;\s*$/gm, "");
    }

    code = code.replace(/^\s*layout\s*\([^)]+\)\s*/gm, "");

    code = code.replace(/^\s*uniform\s+(sampler2D|samplerCube)\s+(\w+)\s*;\s*$/gm, (_, samplerType, name) => {
        samplerNames.push({ samplerType, name });
        return "";
    });

    code = code.replace(/^\s*uniform\s+([A-Za-z_]\w*)\s+(\w+)\s*;\s*$/gm, (_, type, name) => {
        uniformEntries.push({ type: mapType(type, GLSL_TO_HLSL_TYPES), name });
        return "";
    });

    code = code.replace(/^\s*(varying|in)\s+([A-Za-z_]\w*)\s+(\w+)\s*;\s*$/gm, (_, qualifier, type, name) => {
        inputEntries.push({ qualifier, type: mapType(type, GLSL_TO_HLSL_TYPES), name });
        return "";
    });

    code = code.replace(/^\s*out\s+([A-Za-z_]\w*)\s+(\w+)\s*;\s*$/gm, (_, type, name) => {
        outputEntries.push({ type: mapType(type, GLSL_TO_HLSL_TYPES), name });
        return "";
    });

    if (inputEntries.length) {
        notes.push(`检测到 ${inputEntries.length} 个输入变量，已生成为 PSInput 结构。`);
    }
    if (samplerNames.length) {
        notes.push(`检测到 ${samplerNames.length} 个采样器，已拆分为 Texture 对象和同名 SamplerState。`);
    }
    if (uniformEntries.length) {
        notes.push(`检测到 ${uniformEntries.length} 个普通 uniform，已放入 cbuffer Globals。`);
    }
    if (/gl_FragCoord/.test(code)) {
        notes.push("检测到 gl_FragCoord，已映射为 input.position，请确认屏幕空间语义是否符合当前管线。");
    }

    code = replaceTextureCallsGlslToHlsl(code, samplerNames, notes);

    Object.entries(GLSL_TO_HLSL_TYPES).forEach(([from, to]) => {
        code = replaceToken(code, from, to);
    });

    code = code
        .replace(/\bmix\s*\(/g, "lerp(")
        .replace(/\bfract\s*\(/g, "frac(")
        .replace(/\bmod\s*\(/g, "fmod(")
        .replace(/\binversesqrt\s*\(/g, "rsqrt(")
        .replace(/\bdFdx\s*\(/g, "ddx(")
        .replace(/\bdFdy\s*\(/g, "ddy(")
        .replace(/\batan\s*\(\s*([^,()]+)\s*,\s*([^()]+)\)/g, "atan2($1, $2)");

    if (/textureCube\s*\(/.test(source)) {
        notes.push("检测到 textureCube，请手动改成 TextureCube.Sample。");
    }

    const inputStruct = buildInputStruct(inputEntries);
    const uniformBlock = buildUniformBlock(uniformEntries, samplerNames);
    code = rewriteMainToHlsl(code, outputEntries, notes);
    code = attachInputReferences(code, inputEntries, "input.");
    code = code.replace(/\bgl_FragCoord\b/g, "input.position");
    code = code.replace(/\bgl_FragColor\b/g, "__fragColor");

    if (outputEntries.length > 1) {
        notes.push("检测到多个 out 输出。当前仅按单 render target 转换，多目标输出请手动补 SV_TargetN。");
    }

    return {
        code: cleanupCode([uniformBlock, inputStruct, code].filter(Boolean).join("\n\n")),
        notes
    };
}

function convertHlslToGlsl(source) {
    const notes = [];
    let code = source.replace(/\r\n/g, "\n");
    const uniforms = [];
    const samplers = [];
    const structInputs = [];
    let mainInputName = "input";

    code = code.replace(/cbuffer\s+\w+\s*\{([\s\S]*?)\};?/g, (_, blockBody) => {
        const entries = blockBody
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        entries.forEach((line) => {
            const match = line.match(/^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*;/);
            if (match) {
                uniforms.push({
                    type: mapType(match[1], HLSL_TO_GLSL_TYPES),
                    name: match[2]
                });
            }
        });
        return "";
    });

    code = code.replace(/Texture2D\s+([A-Za-z_]\w*)\s*;\s*SamplerState\s+([A-Za-z_]\w*)\s*;/g, (_, textureName, samplerName) => {
        samplers.push({ textureName, samplerName });
        return `uniform sampler2D ${textureName};`;
    });

    code = code.replace(/TextureCube\s+([A-Za-z_]\w*)\s*;\s*SamplerState\s+([A-Za-z_]\w*)\s*;/g, (_, textureName, samplerName) => {
        samplers.push({ textureName, samplerName });
        return `uniform samplerCube ${textureName};`;
    });

    code = code.replace(/struct\s+PSInput\s*\{([\s\S]*?)\};?/g, (_, body) => {
        const lines = body
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        lines.forEach((line) => {
            const match = line.match(/^([A-Za-z_]\w*)\s+([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)\s*;/);
            if (match) {
                structInputs.push({
                    type: mapType(match[1], HLSL_TO_GLSL_TYPES),
                    name: match[2],
                    semantic: match[3]
                });
            }
        });
        return "";
    });

    if (uniforms.length) {
        notes.push(`检测到 ${uniforms.length} 个 cbuffer 字段，已转成 GLSL uniform。`);
    }
    if (samplers.length) {
        notes.push(`检测到 ${samplers.length} 个 Texture/SamplerState 组合，已转回 GLSL sampler。`);
    }
    if (structInputs.length) {
        notes.push(`检测到 PSInput 结构，已尽量恢复为 GLSL 输入变量。`);
    }

    Object.entries(HLSL_TO_GLSL_TYPES).forEach(([from, to]) => {
        code = replaceToken(code, from, to);
    });

    code = code
        .replace(/\blerp\s*\(/g, "mix(")
        .replace(/\bfrac\s*\(/g, "fract(")
        .replace(/\bfmod\s*\(/g, "mod(")
        .replace(/\brsqrt\s*\(/g, "inversesqrt(")
        .replace(/\bddx\s*\(/g, "dFdx(")
        .replace(/\bddy\s*\(/g, "dFdy(")
        .replace(/\batan2\s*\(/g, "atan(");

    samplers.forEach(({ textureName, samplerName }) => {
        const samplePattern = new RegExp(`\\b${textureName}\\.Sample\\s*\\(\\s*${samplerName}\\s*,`, "g");
        const sampleLevelPattern = new RegExp(`\\b${textureName}\\.SampleLevel\\s*\\(\\s*${samplerName}\\s*,`, "g");
        code = code.replace(samplePattern, `texture(${textureName},`);
        code = code.replace(sampleLevelPattern, `textureLod(${textureName},`);
    });

    code = code.replace(/float4\s+main\s*\(\s*PSInput\s+([A-Za-z_]\w*)\s*\)\s*:\s*SV_Target/g, (_, inputName) => {
        mainInputName = inputName;
        return "void main()";
    });

    code = code.replace(/return\s+/g, "gl_FragColor = ");
    code = code.replace(new RegExp(`\\b${mainInputName}\\.position\\b`, "g"), "gl_FragCoord");

    structInputs.forEach((entry) => {
        if (entry.semantic === "SV_Position") {
            return;
        }
        code = code.replace(new RegExp(`\\b${mainInputName}\\.${entry.name}\\b`, "g"), entry.name);
    });

    const glslInputDecl = buildGlslInputDecl(structInputs);
    const uniformDecl = uniforms.map((entry) => `uniform ${entry.type} ${entry.name};`).join("\n");
    const samplerDecl = collectSamplerUniforms(code);
    const declarationBlocks = [
        "precision mediump float;",
        uniformDecl,
        samplerDecl.uniforms,
        glslInputDecl
    ].filter(Boolean).join("\n\n");

    if (/gl_FragColor\s*=/.test(code)) {
        notes.push("已将 return 改写为 gl_FragColor 输出。");
    }
    if (/SV_Position/.test(source)) {
        notes.push("SV_Position 已映射为 gl_FragCoord。请确认坐标空间是否符合你的 GLSL 管线。");
    }

    return {
        code: cleanupCode([declarationBlocks, samplerDecl.cleanedCode].filter(Boolean).join("\n\n")),
        notes
    };

    function collectSamplerUniforms(currentCode) {
        const uniformLines = [];
        let cleanedCode = currentCode;

        cleanedCode = cleanedCode.replace(/uniform\s+sampler(2D|Cube)\s+([A-Za-z_]\w*)\s*;/g, (_, samplerType, name) => {
            uniformLines.push(`uniform sampler${samplerType} ${name};`);
            return "";
        });

        return {
            cleanedCode: cleanupCode(cleanedCode),
            uniforms: uniformLines.join("\n")
        };
    }
}

function buildUniformBlock(uniformEntries, samplerNames) {
    const sections = [];

    if (uniformEntries.length) {
        const body = uniformEntries.map((entry) => `    ${entry.type} ${entry.name};`).join("\n");
        sections.push(`cbuffer Globals\n{\n${body}\n};`);
    }

    samplerNames.forEach((entry) => {
        const textureType = entry.samplerType === "samplerCube" ? "TextureCube" : "Texture2D";
        sections.push(`${textureType} ${entry.name};\nSamplerState ${entry.name}Sampler;`);
    });

    return sections.join("\n\n");
}

function buildInputStruct(inputEntries) {
    const lines = ["struct PSInput", "{", "    float4 position : SV_Position;"];
    inputEntries.forEach((entry, index) => {
        lines.push(`    ${entry.type} ${entry.name} : TEXCOORD${index};`);
    });
    lines.push("};");
    return lines.join("\n");
}

function buildGlslInputDecl(entries) {
    return entries
        .filter((entry) => entry.semantic !== "SV_Position")
        .map((entry) => `varying ${entry.type} ${entry.name};`)
        .join("\n");
}

function attachInputReferences(code, inputEntries, prefix) {
    let result = code;
    inputEntries.forEach((entry) => {
        result = result.replace(new RegExp(`\\b${entry.name}\\b`, "g"), `${prefix}${entry.name}`);
    });
    return result;
}

function rewriteMainToHlsl(code, outputEntries, notes) {
    let result = code;

    if (/void\s+main\s*\(\s*\)/.test(result)) {
        result = result.replace(/void\s+main\s*\(\s*\)/, "float4 main(PSInput input) : SV_Target");
    } else if (/void\s+main\s*\(\s*void\s*\)/.test(result)) {
        result = result.replace(/void\s+main\s*\(\s*void\s*\)/, "float4 main(PSInput input) : SV_Target");
    } else if (/\bmain\s*\(/.test(result)) {
        notes.push("main 函数签名不是标准 void main()，请手动确认 HLSL 入口。");
    }

    if (outputEntries.length) {
        const primaryOutput = outputEntries[0].name;
        result = result.replace(new RegExp(`\\b${primaryOutput}\\s*=`, "g"), "return ");
    }

    if (/gl_FragColor\s*=/.test(code)) {
        result = result.replace(/\bgl_FragColor\s*=\s*/g, "return ");
        notes.push("已将 gl_FragColor 输出改写为 return。");
    }

    if (/__fragColor\s*=/.test(result)) {
        result = result.replace(/\b__fragColor\s*=\s*/g, "return ");
    }

    if (!/\breturn\b/.test(result) && /float4\s+main\s*\(PSInput input\)\s*:\s*SV_Target/.test(result)) {
        result = result.replace(/\}\s*$/, "    return float4(0.0, 0.0, 0.0, 1.0);\n}");
        notes.push("未检测到显式输出，已追加默认返回值 `float4(0, 0, 0, 1)`。");
    }

    return result;
}

function replaceTextureCallsGlslToHlsl(code, samplerNames, notes) {
    let result = code;
    samplerNames.forEach((entry) => {
        result = result.replace(new RegExp(`\\btexture\\s*\\(\\s*${entry.name}\\s*,`, "g"), `${entry.name}.Sample(${entry.name}Sampler,`);
        result = result.replace(new RegExp(`\\btextureLod\\s*\\(\\s*${entry.name}\\s*,`, "g"), `${entry.name}.SampleLevel(${entry.name}Sampler,`);
    });

    if (/\btexture\s*\(/.test(result)) {
        notes.push("存在无法自动关联的 texture 调用，请检查采样器命名和参数。");
    }

    return result;
}

function mapType(type, table) {
    return table[type] || type;
}

function replaceToken(code, from, to) {
    return code.replace(new RegExp(`\\b${from}\\b`, "g"), to);
}

function cleanupCode(code) {
    return code
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]+\n/g, "\n")
        .trim();
}
