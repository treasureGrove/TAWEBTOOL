(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TextureBudget = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // BC: Microsoft Direct3D block compression; ASTC: Khronos Data Format spec.
  // Every mip occupies whole blocks, including the final 2x2 and 1x1 levels.
  var formats = Object.freeze({
    rgba8: { label: 'RGBA32', pixelBytes: 4, alpha: true },
    rgb565: { label: 'RGB565', pixelBytes: 2, alpha: false },
    bc1: { label: 'BC1 / DXT1', block: 4, blockBytes: 8, alpha: 'binary' },
    bc3: { label: 'BC3 / DXT5', block: 4, blockBytes: 16, alpha: true },
    bc5: { label: 'BC5（双通道）', block: 4, blockBytes: 16, alpha: false },
    bc7: { label: 'BC7', block: 4, blockBytes: 16, alpha: true },
    etc2rgb: { label: 'ETC2 RGB', block: 4, blockBytes: 8, alpha: false },
    etc2rgba: { label: 'ETC2 RGBA8', block: 4, blockBytes: 16, alpha: true },
    astc4: { label: 'ASTC 4×4', block: 4, blockBytes: 16, alpha: true },
    astc6: { label: 'ASTC 6×6', block: 6, blockBytes: 16, alpha: true },
    astc8: { label: 'ASTC 8×8', block: 8, blockBytes: 16, alpha: true }
  });

  function dimensions(width, height) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
        width < 1 || height < 1 || width > 32768 || height > 32768) {
      throw new RangeError('贴图尺寸必须为 1–32768 的整数');
    }
  }

  function estimate(width, height, format, mipmaps) {
    dimensions(width, height);
    if (!Object.prototype.hasOwnProperty.call(formats, format)) throw new RangeError('未知贴图格式');
    var spec = formats[format], bytes = 0, levels = 0;
    while (true) {
      bytes += spec.pixelBytes ? width * height * spec.pixelBytes :
        Math.ceil(width / spec.block) * Math.ceil(height / spec.block) * spec.blockBytes;
      levels++;
      if (!mipmaps || (width === 1 && height === 1)) break;
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
    }
    return { bytes: bytes, levels: levels };
  }

  function srgbToLinear(byte) {
    var value = byte / 255;
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  }

  function warnings(info, format) {
    var result = [], spec = formats[format];
    if ((info.width & (info.width - 1)) || (info.height & (info.height - 1))) result.push('NPOT：核对目标平台导入设置');
    if (spec.block && (info.width % spec.block || info.height % spec.block)) result.push('边缘按完整压缩块计费，核对引擎尺寸限制');
    if (info.hasAlpha && spec.alpha === false) result.push('此格式不保留透明度');
    if (info.hasPartialAlpha && spec.alpha === 'binary') result.push('BC1 仅支持 1-bit Alpha，无法保留半透明');
    if (format === 'bc5') result.push('BC5 仅存两通道，常用于法线 XY');
    return result;
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    // Quoting alone does not prevent spreadsheet formula execution in filenames.
    if (/^[\s\uFEFF]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function toCSV(entries, format, mipmaps) {
    var rows = [['文件名', '宽', '高', '文件字节', '目标格式', 'Mipmap', 'Mip层数', '显存字节', '透明像素', '检查结果']];
    entries.forEach(function (entry) {
      var memory = entry.error ? null : estimate(entry.width, entry.height, format, mipmaps);
      rows.push([entry.name, entry.width, entry.height, entry.size, formats[format].label,
        mipmaps ? '完整链' : '仅顶层', memory ? memory.levels : '', memory ? memory.bytes : '',
        entry.error ? '' : (entry.hasAlpha ? '有' : '无'), entry.error || warnings(entry, format).join('；') || '通过']);
    });
    return '\uFEFF' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
  }

  return { formats: formats, estimate: estimate, srgbToLinear: srgbToLinear, warnings: warnings, toCSV: toCSV };
});
