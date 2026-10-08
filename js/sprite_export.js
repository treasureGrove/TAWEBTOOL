(function (root) {
  'use strict';
  function createPlan(input) {
    function integer(key, min, max, label) {
      const value = Number(input[key]);
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(label + '必须是范围 ' + min + '–' + max + ' 内的整数');
      return value;
    }
    input = Object.assign({}, input);
    input.width = integer('width', 1, 8192, '图片尺寸');
    input.height = integer('height', 1, 8192, '图片尺寸');
    input.cols = integer('cols', 1, 256, '网格列数');
    input.rows = integer('rows', 1, 256, '网格行数');
    input.padding = integer('padding', 0, 128, '网格间距');
    input.offset = integer('offset', 0, 128, '网格边框');
    input.startIndex = integer('startIndex', 0, 999999, '起始编号');
    input.digits = integer('digits', 1, 6, '补零位数');
    if (input.cols * input.rows > 2048) throw new Error('帧数最多 2048，请分批处理');
    if (input.startIndex + input.cols * input.rows - 1 > 999999) throw new Error('编号超出范围');
    if (typeof input.prefix !== 'string' || !/^[\w\u4e00-\u9fa5-]{1,64}$/.test(input.prefix) || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(input.prefix)) throw new Error('命名只能使用中文、字母、数字、下划线、连字符，长度 1–64，且不能是系统保留名');
    if (!['png', 'webp', 'jpeg'].includes(input.format)) throw new Error('导出格式不支持');
    const cellW = (input.width - input.offset * 2 - (input.cols - 1) * input.padding) / input.cols;
    const cellH = (input.height - input.offset * 2 - (input.rows - 1) * input.padding) / input.rows;
    if (!Number.isInteger(cellW) || !Number.isInteger(cellH) || cellW < 1 || cellH < 1) throw new Error('尺寸必须能整除网格，且单帧尺寸至少 1 像素；请调整行列、间距或边框，避免隐式重采样');
    if (!['row', 'column'].includes(input.order)) throw new Error('切图顺序不支持');
    const ext = input.format === 'jpeg' ? 'jpg' : input.format;
    const frames = Array.from({ length: input.cols * input.rows }, function (_, index) {
      const column = input.order === 'column' ? Math.floor(index / input.rows) : index % input.cols;
      const row = input.order === 'column' ? index % input.rows : Math.floor(index / input.cols);
      return { index: index, number: input.startIndex + index, column: column, row: row,
        file: input.prefix + '_' + String(input.startIndex + index).padStart(input.digits, '0') + '.' + ext,
        rect: { x: input.offset + column * (cellW + input.padding), y: input.offset + row * (cellH + input.padding), width: cellW, height: cellH },
        width: cellW, height: cellH };
    });
    return { schema: 'ta-tools.frames.v1', frameCount: frames.length, coordinateOrigin: 'top-left', source: { width: input.width, height: input.height }, settings: input, frames: frames, prefix: input.prefix };
  }
  function engineGuide(plan) {
    return [
      '# TA 工具箱 · 序列帧导入说明',
      '此包包含实际切出的图片、frames.json 通用元数据和本说明。元数据不是 Unity/UE 可直接导入的引擎配置。没有生成 .meta、.uasset 或自动创建动画。',
      '共 ' + plan.frameCount + ' 帧，顺序以 frames.json 中 frames 数组为准；坐标原点为原图左上角。',
      '## Unity（逐张 PNG）',
      '将图片放入 Assets 内。多选图片，将 Texture Type 设为 Sprite (2D and UI)，Sprite Mode 设为 Single，统一 Pixels Per Unit 与 Pivot 后 Apply。不要对已经切出的单帧再设置 Multiple 切图。',
      '像素风可选 Point 过滤；其他风格按项目选择。创建动画时核对帧顺序和帧率，不能仅依赖字符串排序（编号位数不足时尤其如此）。',
      '## Unreal Engine / Paper 2D（逐张 PNG）',
      '确认项目启用 Paper 2D。导入图片后创建 Sprite 资产，再建立 Flipbook，并按 frames.json 的顺序设置关键帧及帧率。非 Paper 2D 项目请按自身材质/UI 动画管线使用图片。',
      'PNG 保留透明度。JPG 没有透明通道，WEBP 的支持随引擎/插件而异；跨引擎导入优先 PNG。',
      '参考：',
      'https://docs.unity3d.com/6000.0/Documentation/Manual/texture-type-sprite.html',
      'https://dev.epicgames.com/documentation/unreal-engine/paper-2d-flipbooks-in-unreal-engine',
      '本说明未在你的项目引擎中执行；导入选项需要按项目验证。',
      ''
    ].join('\n');
  }
  root.SpriteExport = { createPlan: createPlan, engineGuide: engineGuide };
})(globalThis);
