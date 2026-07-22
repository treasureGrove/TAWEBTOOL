// ===== GIF Worker v2 — gifenc encoder + built-in parser =====

// ─── Helpers ───
function sqr(v) { return v * v; }
function sqr2(v) { return v * v; }
function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

// ─── RGB Packing ───
function rgb888_to_rgb565(r, g, b) { return r << 8 & 63488 | g << 2 & 992 | b >> 3; }
function rgb888_to_rgb444(r, g, b) { return r >> 4 << 8 | g & 240 | b >> 4; }

// ─── Constants ───
var CONST = {
    trailer: 59,
    graphicControlExtensionLabel: 249,
    imageSeparator: 44,
    localColorTableFlagMask: 128,
};

// ─── Stream ───
function Stream(cap) {
    cap = cap || 256;
    var cur = 0;
    var buf = new Uint8Array(cap);
    function grow(n) {
        var prev = buf.length;
        if (prev >= n) return;
        n = Math.max(n, prev * (prev < 1048576 ? 2 : 1.125) >>> 0);
        if (prev) n = Math.max(n, 256);
        var old = buf;
        buf = new Uint8Array(n);
        if (cur > 0) buf.set(old.subarray(0, cur), 0);
    }
    return {
        reset: function () { cur = 0; },
        bytes: function () { return buf.slice(0, cur); },
        bytesView: function () { return buf.subarray(0, cur); },
        writeByte: function (b) { grow(cur + 1); buf[cur] = b; cur++; },
        writeShort: function (s) { this.writeByte(s & 255); this.writeByte(s >> 8 & 255); },
        writeString: function (s) { for (var i = 0; i < s.length; i++) this.writeByte(s.charCodeAt(i)); },
        writeBytes: function (a) { grow(cur + a.length); for (var i = 0; i < a.length; i++) buf[cur++] = a[i]; }
    };
}

// ─── LZW Encoder (from gifenc) ───
var MASKS = [0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023, 2047, 4095, 8191, 16383, 32767, 65535];
var HSIZE = 5003;

function lzwEncode(pixels, minCodeSize, out, accum, htabArr, codetabArr) {
    accum.fill(0);
    htabArr.fill(-1);
    codetabArr.fill(0);

    var cur_accum = 0, cur_bits = 0, a_count = 0;
    var g_init_bits = minCodeSize + 1;
    var n_bits = g_init_bits;
    var maxcode = (1 << n_bits) - 1;
    var ClearCode = 1 << (minCodeSize);
    var EOFCode = ClearCode + 1;
    var free_ent = ClearCode + 2;
    var clear_flg = false;
    var ent = pixels[0];
    var hshift = 0;
    for (var fc = HSIZE; fc < 65536; fc *= 2) ++hshift;
    hshift = 8 - hshift;

    function output(code) {
        cur_accum &= MASKS[cur_bits];
        if (cur_bits > 0) cur_accum |= code << cur_bits;
        else cur_accum = code;
        cur_bits += n_bits;
        while (cur_bits >= 8) {
            accum[a_count++] = cur_accum & 255;
            if (a_count >= 254) { out.writeByte(a_count); out.writeBytes(accum.subarray(0, a_count)); a_count = 0; }
            cur_accum >>= 8;
            cur_bits -= 8;
        }
        if (free_ent > maxcode || clear_flg) {
            if (clear_flg) { n_bits = g_init_bits; maxcode = (1 << n_bits) - 1; clear_flg = false; }
            else { ++n_bits; maxcode = n_bits === 12 ? 1 << n_bits : (1 << n_bits) - 1; }
        }
        if (code === EOFCode) {
            while (cur_bits > 0) { accum[a_count++] = cur_accum & 255; if (a_count >= 254) { out.writeByte(a_count); out.writeBytes(accum.subarray(0, a_count)); a_count = 0; } cur_accum >>= 8; cur_bits -= 8; }
            if (a_count > 0) { out.writeByte(a_count); out.writeBytes(accum.subarray(0, a_count)); }
        }
    }

    out.writeByte(minCodeSize);
    output(ClearCode);

    for (var idx = 1; idx < pixels.length; idx++) {
        var c = pixels[idx];
        var fcode = (c << 12) + ent;
        var i = (c << hshift) ^ ent;
        if (htabArr[i] === fcode) { ent = codetabArr[i]; continue; }
        var disp = i === 0 ? 1 : HSIZE - i;
        while (htabArr[i] >= 0) { i -= disp; if (i < 0) i += HSIZE; if (htabArr[i] === fcode) { ent = codetabArr[i]; break; } }
        if (htabArr[i] !== fcode) {
            output(ent);
            ent = c;
            if (free_ent < 4096) { codetabArr[i] = free_ent++; htabArr[i] = fcode; }
            else { htabArr.fill(-1); free_ent = ClearCode + 2; clear_flg = true; output(ClearCode); }
        } else { ent = codetabArr[i]; }
    }
    output(ent);
    output(EOFCode);
    out.writeByte(0);
    return out.bytesView();
}

// ─── Color Quantization (PNN — from gifenc) ───
function find_nn(bins, idx) {
    var nn = 0, err = 1e100;
    var b1 = bins[idx], n1 = b1.cnt, wr = b1.rc, wg = b1.gc, wb = b1.bc;
    for (var i = b1.fw; i !== 0; i = bins[i].fw) {
        var bi = bins[i], n2 = bi.cnt, nerr2 = n1 * n2 / (n1 + n2);
        if (nerr2 >= err) continue;
        var nerr = nerr2 * (sqr(bi.rc - wr) + sqr(bi.gc - wg) + sqr(bi.bc - wb));
        if (nerr < err) { err = nerr; nn = i; }
    }
    b1.err = err; b1.nn = nn;
}

function createBin() { return { ac: 0, rc: 0, gc: 0, bc: 0, cnt: 0, nn: 0, fw: 0, bk: 0, tm: 0, mtm: 0, err: 0 }; }

function quantize(rgba, maxColors) {
    var data = new Uint32Array(rgba.buffer);
    var bincount = 65536;
    var bins = new Array(bincount);
    for (var i = 0; i < data.length; i++) {
        var col = data[i];
        var b = col >> 16 & 255, g = col >> 8 & 255, r = col & 255;
        var k = rgb888_to_rgb565(r, g, b);
        var bin = bins[k] || (bins[k] = createBin());
        bin.rc += r; bin.gc += g; bin.bc += b; bin.cnt++;
    }

    var maxbins = 0;
    for (var i = 0; i < bincount; i++) {
        var bin = bins[i];
        if (bin) { var d = 1 / bin.cnt; bin.rc *= d; bin.gc *= d; bin.bc *= d; bins[maxbins++] = bin; }
    }

    var useSqrt = !(sqr(maxColors) / maxbins < 0.022);
    for (var i = 0; i < maxbins - 1; i++) {
        bins[i].fw = i + 1; bins[i + 1].bk = i;
        if (useSqrt) bins[i].cnt = Math.sqrt(bins[i].cnt);
    }
    if (useSqrt) bins[i].cnt = Math.sqrt(bins[i].cnt);

    var heap = new Uint32Array(bincount + 1);
    var h, l, l2;
    for (i = 0; i < maxbins; i++) {
        find_nn(bins, i);
        var err = bins[i].err;
        for (l = ++heap[0]; l > 1; l = l2) { l2 = l >> 1; if (bins[h = heap[l2]].err <= err) break; heap[l] = h; }
        heap[l] = i;
    }

    var extbins = maxbins - maxColors;
    for (i = 0; i < extbins;) {
        var tb;
        for (;;) {
            var b1 = heap[1]; tb = bins[b1];
            if (tb.tm >= tb.mtm && bins[tb.nn].mtm <= tb.tm) break;
            if (tb.mtm === 65535) b1 = heap[1] = heap[heap[0]--];
            else { find_nn(bins, b1); tb.tm = i; }
            err = bins[b1].err;
            for (l = 1; (l2 = l + l) <= heap[0]; l = l2) { if (l2 < heap[0] && bins[heap[l2]].err > bins[heap[l2 + 1]].err) l2++; if (err <= bins[h = heap[l2]].err) break; heap[l] = h; }
            heap[l] = b1;
        }
        var nb = bins[tb.nn], n1 = tb.cnt, n2 = nb.cnt, d = 1 / (n1 + n2);
        tb.rc = d * (n1 * tb.rc + n2 * nb.rc);
        tb.gc = d * (n1 * tb.gc + n2 * nb.gc);
        tb.bc = d * (n1 * tb.bc + n2 * nb.bc);
        tb.cnt += nb.cnt; tb.mtm = ++i;
        bins[nb.bk].fw = nb.fw; bins[nb.fw].bk = nb.bk; nb.mtm = 65535;
    }

    var palette = [];
    for (i = 0; ;) {
        palette.push([clamp(Math.round(bins[i].rc), 0, 255), clamp(Math.round(bins[i].gc), 0, 255), clamp(Math.round(bins[i].bc), 0, 255)]);
        if ((i = bins[i].fw) === 0) break;
    }
    return palette;
}

function applyPalette(rgba, palette) {
    var data = new Uint32Array(rgba.buffer), len = data.length, cache = {}, idx = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        var col = data[i], b = col >> 16 & 255, g = col >> 8 & 255, r = col & 255;
        var key = rgb888_to_rgb565(r, g, b);
        idx[i] = key in cache ? cache[key] : cache[key] = nearestIndex(r, g, b, palette);
    }
    return idx;
}

function nearestIndex(r, g, b, pal) {
    var k = 0, mindist = 1e100;
    for (var i = 0; i < pal.length; i++) {
        var p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
        var dist = dr * dr + dg * dg + db * db;
        if (dist < mindist) { mindist = dist; k = i; }
    }
    return k;
}

// ─── GIF Encoder ───
function encodeGif(frames, palette) {
    var out = new Stream(4096);
    var accum = new Uint8Array(256), htab = new Int32Array(HSIZE), codetab = new Int32Array(HSIZE);
    var palSize = palette.length, palExp = Math.max(1, Math.ceil(Math.log2(Math.max(2, palSize))));
    var padPal = palette.slice();
    while (padPal.length < (1 << palExp)) padPal.push([0, 0, 0]);

    var w = frames[0].width, h = frames[0].height;

    // Header + LSD + GCT
    out.writeString('GIF89a');
    out.writeShort(w); out.writeShort(h);
    out.writeByte(0x80 | ((palExp - 1) << 4) | (palExp - 1));
    out.writeByte(0); out.writeByte(0);
    for (var i = 0; i < (1 << palExp); i++) { out.writeByte(padPal[i][0]); out.writeByte(padPal[i][1]); out.writeByte(padPal[i][2]); }

    // Netscape loop
    out.writeByte(0x21); out.writeByte(0xFF); out.writeByte(0x0B);
    out.writeString('NETSCAPE2.0');
    out.writeByte(0x03); out.writeByte(0x01); out.writeShort(0); out.writeByte(0x00);

    var minCode = Math.max(2, palExp);

    for (var f = 0; f < frames.length; f++) {
        var frame = frames[f];
        // Graphic Control Extension
        out.writeByte(0x21); out.writeByte(0xF9); out.writeByte(0x04);
        out.writeByte(0x04); out.writeShort(Math.max(2, Math.round(frame.delay / 10))); out.writeByte(0x00); out.writeByte(0x00);
        // Image Descriptor
        out.writeByte(0x2C); out.writeShort(0); out.writeShort(0); out.writeShort(w); out.writeShort(h);
        out.writeByte(0x00);
        // LZW pixels
        var indices = applyPalette(frame.pixels, palette);
        lzwEncode(indices, minCode, out, accum, htab, codetab);
    }

    out.writeByte(0x3B);
    return out.bytes();
}

// ─── Lossy ───
function applyLossy(data, level) {
    if (level <= 0) return;
    var shift = Math.min(6, Math.floor(level / 30));
    if (shift === 0) return;
    var mask = (0xFF << shift) & 0xFF, half = 1 << (shift - 1);
    for (var i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, (data[i] & mask) + half);
        data[i + 1] = Math.min(255, (data[i + 1] & mask) + half);
        data[i + 2] = Math.min(255, (data[i + 2] & mask) + half);
    }
}

// ─── GIF Parser ───
function parseGif(bytes) {
    var frames = [], pos = 0;
    var hdr = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
    if (hdr !== 'GIF87a' && hdr !== 'GIF89a') throw new Error('不是有效的GIF文件');
    pos = 6;

    var sw = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    var sh = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
    var packed = bytes[pos++]; pos++; pos++;

    var gctFlag = (packed >> 7) & 1;
    var gctSize = gctFlag ? (1 << ((packed & 7) + 1)) : 0;
    var gct = null;
    if (gctFlag) { gct = []; for (var i = 0; i < gctSize; i++) gct.push([bytes[pos++], bytes[pos++], bytes[pos++]]); }

    var gc = null;
    var comp = new OffscreenCanvas(sw, sh), compCtx = comp.getContext('2d');

    while (pos < bytes.length) {
        var bt = bytes[pos++];
        if (bt === 0x3B) break;
        if (bt === 0x21) {
            var el = bytes[pos++];
            if (el === 0xF9) { pos++; var gcp = bytes[pos++]; var delay = (bytes[pos] | (bytes[pos + 1] << 8)) * 10; pos += 2; var tIdx = bytes[pos++]; var dm = (gcp >> 2) & 7; var tf = gcp & 1; pos++; gc = { delay: delay || 100, dm: dm, tf: tf, ti: tIdx }; }
            else { while (true) { var sbs = bytes[pos++]; if (sbs === 0) break; pos += sbs; } }
            continue;
        }
        if (bt === 0x2C) {
            var left = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            var top = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            var fw = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            var fh = bytes[pos] | (bytes[pos + 1] << 8); pos += 2;
            var ip = bytes[pos++];
            var lctFlag = (ip >> 7) & 1, interlace = (ip >> 6) & 1;
            var lctSize = lctFlag ? (1 << ((ip & 7) + 1)) : 0;
            var lct = null;
            if (lctFlag) { lct = []; for (var i = 0; i < lctSize; i++) lct.push([bytes[pos++], bytes[pos++], bytes[pos++]]); }

            var ct = lct || gct;
            if (!ct) throw new Error('缺少颜色表');

            var mcs = bytes[pos++];
            var cd = [];
            while (true) { var sbs = bytes[pos++]; if (sbs === 0) break; for (var i = 0; i < sbs; i++) cd.push(bytes[pos++]); }

            var is = lzwDecode(mcs, cd);
            if (interlace) is = deinterlace(is, fw, fh);

            // Draw to composite canvas
            var fc = compCtx.getImageData(left, top, fw, fh);
            var px = fc.data;
            for (var i = 0; i < is.length && i < fw * fh; i++) {
                var ci = is[i];
                if (gc && gc.tf && ci === gc.ti) continue;
                var color = ct[ci] || [0, 0, 0];
                px[i * 4] = color[0]; px[i * 4 + 1] = color[1]; px[i * 4 + 2] = color[2]; px[i * 4 + 3] = 255;
            }
            compCtx.putImageData(fc, left, top);

            var oc = new OffscreenCanvas(sw, sh);
            oc.getContext('2d').drawImage(comp, 0, 0);
            var pixelData = oc.getContext('2d').getImageData(0, 0, sw, sh);

            frames.push({ pixels: pixelData.data, width: sw, height: sh, delay: gc ? gc.delay : 100 });

            var disp = gc ? gc.dm : 0;
            if (disp === 2) compCtx.clearRect(left, top, fw, fh);
            else if (disp !== 3) compCtx.drawImage(oc, 0, 0);
            gc = null;
        }
    }
    if (frames.length === 0) throw new Error('未提取到帧');
    return frames;
}

function lzwDecode(mcs, data) {
    var cc = 1 << mcs, eoi = cc + 1, cs = mcs + 1, cm = (1 << cs) - 1, nc = eoi + 1;
    var tbl = {}; for (var i = 0; i < cc; i++) tbl[i] = [i];
    var out = [], bb = 0, bc = 0, dp = 0, prev = -1;
    function rc() { while (bc < cs) { if (dp >= data.length) return -1; bb |= data[dp++] << bc; bc += 8; } var c = bb & cm; bb >>= cs; bc -= cs; return c; }
    while (true) {
        var c = rc(); if (c === -1 || c === eoi) break;
        if (c === cc) { cs = mcs + 1; cm = (1 << cs) - 1; nc = eoi + 1; tbl = {}; for (var i = 0; i < cc; i++) tbl[i] = [i]; prev = -1; continue; }
        if (prev === -1) { if (tbl[c]) out.push.apply(out, tbl[c]); prev = c; continue; }
        var entry;
        if (tbl[c] !== undefined) entry = tbl[c];
        else if (c === nc) entry = tbl[prev].concat(tbl[prev][0]);
        else { prev = c; continue; }
        out.push.apply(out, entry);
        if (nc < 4096 && tbl[prev]) { tbl[nc] = tbl[prev].concat(entry[0]); nc++; if (nc > cm && cs < 12) { cs++; cm = (1 << cs) - 1; } }
        prev = c;
    }
    return out;
}

function deinterlace(is, w, h) {
    var r = new Array(w * h), passes = [{ s: 0, t: 8 }, { s: 4, t: 8 }, { s: 2, t: 4 }, { s: 1, t: 2 }], sr = 0;
    for (var p = 0; p < passes.length; p++) for (var y = passes[p].s; y < h; y += passes[p].t) { for (var x = 0; x < w; x++) r[y * w + x] = is[sr * w + x]; sr++; }
    return r;
}

// ─── Frame processing ───
function scaleFrame(frame, outW, outH) {
    // Scale frame pixels using offscreen canvas
    var c = new OffscreenCanvas(outW, outH), ctx = c.getContext('2d');
    // Put frame pixels into ImageData and draw scaled
    var srcCanvas = new OffscreenCanvas(frame.width, frame.height);
    var srcCtx = srcCanvas.getContext('2d');
    srcCtx.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
    ctx.drawImage(srcCanvas, 0, 0, outW, outH);
    return ctx.getImageData(0, 0, outW, outH);
}

function post(type, data, transfer) {
    self.postMessage({ type: type, data: data }, transfer || []);
}

// ─── Main handler ───
onmessage = function (e) {
    var msg = e.data;
    try {
        if (msg.type === 'compress') {
            var bytes = new Uint8Array(msg.buffer);
            var scaleRatio = msg.scaleRatio, colors = msg.colors, frameSkip = msg.frameSkip, lossy = msg.lossy;
            var getSize = msg.getSize;

            post('progress', { text: '解析GIF帧...', pct: 5 });
            var frames = parseGif(bytes);

            // Frame skip
            var filtered = [];
            for (var i = 0; i < frames.length; i += frameSkip) {
                frames[i].delay = frames[i].delay * frameSkip;
                filtered.push(frames[i]);
            }

            var outW = Math.max(1, Math.round(filtered[0].width * scaleRatio));
            var outH = Math.max(1, Math.round(filtered[0].height * scaleRatio));

            // Scale frames
            post('progress', { text: '缩放帧画面 (' + filtered.length + ' 帧)...', pct: 20 });
            for (var i = 0; i < filtered.length; i++) {
                var imgData = scaleFrame(filtered[i], outW, outH);
                if (lossy > 0) applyLossy(imgData.data, lossy);
                filtered[i].pixels = new Uint8ClampedArray(imgData.data);
                filtered[i].width = outW;
                filtered[i].height = outH;
                if (i % 5 === 0) post('progress', { text: '缩放 ' + (i + 1) + '/' + filtered.length + ' 帧', pct: 20 + Math.round(i / filtered.length * 15) });
            }

            // Quantize
            var sampleEvery = getSize ? Math.max(1, Math.floor(filtered.length * outW * outH / 200000)) : 1;
            var totalPx = outW * outH * filtered.length;
            var sampleCount = Math.ceil(totalPx / sampleEvery);
            var allPixels = new Uint8ClampedArray(sampleCount * 4);
            var si = 0;
            for (var i = 0; i < filtered.length; i++) {
                var px = filtered[i].pixels;
                for (var j = 0; j < px.length; j += 4 * sampleEvery) {
                    allPixels[si++] = px[j];
                    allPixels[si++] = px[j + 1];
                    allPixels[si++] = px[j + 2];
                    allPixels[si++] = px[j + 3];
                    if (si >= allPixels.length) break;
                }
                if (si >= allPixels.length) break;
            }
            allPixels = allPixels.subarray(0, si);
            post('progress', { text: '量化颜色...', pct: 40 });
            var palette = quantize(allPixels, Math.min(256, colors));

            if (getSize) {
                // Quick encode to get size
                var tempOut = encodeGif(filtered, palette);
                post('sizeResult', tempOut.byteLength);
            } else {
                // Full encode
                post('progress', { text: '编码GIF...', pct: 60 });
                var result = encodeGif(filtered, palette);
                post('progress', { text: '完成', pct: 90 });
                post('result', { gifBytes: result.buffer, size: result.byteLength, frameCount: filtered.length, width: outW, height: outH }, [result.buffer]);
            }
        }
    } catch (err) {
        post('error', err.message || String(err));
    }
};
