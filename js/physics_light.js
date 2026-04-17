(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }

  /* ========== Constants ========== */
  var PI = Math.PI;
  // Rayleigh scattering coefficients at sea level for RGB wavelengths (680nm, 550nm, 440nm)
  var RAYLEIGH_BASE = [5.8e-6, 13.5e-6, 33.1e-6]; // per meter
  // Rayleigh scale height
  var RAYLEIGH_SCALE_H = 8500; // meters
  // Mie scattering base coefficient at sea level
  var MIE_BASE = 21e-6;
  // Mie scale height
  var MIE_SCALE_H = 1200;

  /* ========== Presets ========== */
  var SCATTER_PRESETS = {
    noon:    { sunAngle: 90, turbidity: 2.0, mieG: 0.76, label: '正午晴天' },
    golden:  { sunAngle: 15, turbidity: 2.0, mieG: 0.80, label: '黄金时段' },
    sunset:  { sunAngle: 5,  turbidity: 2.5, mieG: 0.85, label: '日出/日落' },
    overcast:{ sunAngle: 45, turbidity: 8.0, mieG: 0.76, label: '阴天' },
    haze:    { sunAngle: 30, turbidity: 15.0,mieG: 0.90, label: '薄雾' },
    fog:     { sunAngle: 30, turbidity: 30.0,mieG: 0.95, label: '雾天' },
  };

  var EV_REF = [
    { scene: '星空（无月）', ev: -4 },
    { scene: '银河', ev: -2 },
    { scene: '满月夜景', ev: 0 },
    { scene: '城市夜景', ev: 4 },
    { scene: '室内昏暗', ev: 6 },
    { scene: '室内正常照明', ev: 8 },
    { scene: '阴天户外', ev: 12 },
    { scene: '多云', ev: 13 },
    { scene: '晴天阴影', ev: 14 },
    { scene: '晴天直射', ev: 15 },
    { scene: '雪地/沙滩', ev: 16 },
  ];

  var KELVIN_REF = [
    { source: '烛光', kelvin: 1800 },
    { source: '白炽灯', kelvin: 2700 },
    { source: '卤素灯', kelvin: 3200 },
    { source: '日出/日落', kelvin: 3500 },
    { source: '荧光灯(暖白)', kelvin: 4000 },
    { source: '正午日光', kelvin: 5500 },
    { source: 'D65标准光', kelvin: 6500 },
    { source: '阴天天空', kelvin: 7500 },
    { source: '晴天蓝天', kelvin: 10000 },
  ];

  var LIGHT_REF = [
    { scene: '星光（无月）', lux: '0.001', cdm2: '-' },
    { scene: '满月夜空', lux: '0.2', cdm2: '-' },
    { scene: '黄昏', lux: '3.4', cdm2: '-' },
    { scene: '路灯照明', lux: '15', cdm2: '-' },
    { scene: '起居室', lux: '50', cdm2: '10~30' },
    { scene: '走廊/楼道', lux: '100', cdm2: '-' },
    { scene: '办公室', lux: '500', cdm2: '50~100' },
    { scene: '手术室', lux: '10,000', cdm2: '-' },
    { scene: '阴天户外', lux: '10,000', cdm2: '2,000' },
    { scene: '晴天阴影', lux: '25,000', cdm2: '4,000' },
    { scene: '晴天直射', lux: '100,000', cdm2: '16,000' },
    { scene: '太阳表面', lux: '-', cdm2: '1.6×10⁹' },
    { scene: '显示器(SDR)', lux: '-', cdm2: '80~300' },
    { scene: '显示器(HDR)', lux: '-', cdm2: '400~1,000' },
    { scene: '显示器(HDR峰值)', lux: '-', cdm2: '1,000~4,000' },
  ];

  /* ========== 1. Exposure Calculation ========== */
  function calcExposure() {
    var N = parseFloat($('fStop').value);
    var t = parseFloat($('shutter').value);
    var iso = parseFloat($('iso').value);
    if (isNaN(N) || isNaN(t) || isNaN(iso) || N <= 0 || t <= 0 || iso <= 0) {
      $('exposureResult').textContent = '请输入有效参数';
      return;
    }
    var ev100 = Math.log2(N * N / t);
    var evISO = ev100 - Math.log2(iso / 100);
    var luminance = Math.pow(2, ev100) * 12.5 / PI; // cd/m²
    var illuminance = 2.5 * Math.pow(2, ev100); // lux

    $('exposureResult').textContent =
      'EV100:        ' + ev100.toFixed(2) + '\n' +
      'EV (ISO ' + iso + '): ' + evISO.toFixed(2) + '\n' +
      '场景亮度:      ' + luminance.toFixed(1) + ' cd/m²\n' +
      '场景照度:      ' + illuminance.toFixed(0) + ' lux\n' +
      '快门速度:      1/' + Math.round(1 / t) + ' s';
  }

  /* ========== 2. Atmospheric Scattering ========== */
  function densityScale(altitudeKm) {
    return Math.exp(-altitudeKm * 1000 / RAYLEIGH_SCALE_H);
  }

  function rayleighCoeffs(altitudeKm) {
    var scale = densityScale(altitudeKm);
    return RAYLEIGH_BASE.map(function (b) { return b * scale; });
  }

  function mieCoeff(turbidity, altitudeKm) {
    var scale = Math.exp(-altitudeKm * 1000 / MIE_SCALE_H);
    return MIE_BASE * turbidity * scale;
  }

  function rayleighPhase(cosTheta) {
    return 3.0 / (16.0 * PI) * (1.0 + cosTheta * cosTheta);
  }

  function henyeyGreenstein(cosTheta, g) {
    var g2 = g * g;
    var denom = 1.0 + g2 - 2.0 * g * cosTheta;
    return (1.0 - g2) / (4.0 * PI * Math.pow(denom, 1.5));
  }

  // Compute sky color at a specific view angle relative to horizon
  // viewAngle: 0 = horizon, PI/2 = zenith
  // sunElev: sun elevation in radians
  function computeSkyColorAtAngle(viewAngle, sunElev, turbidity, g, altKm) {
    var beta_r = rayleighCoeffs(altKm);
    var beta_m = mieCoeff(turbidity, altKm);

    // Optical depth through atmosphere
    // simplified: path length factor = 1/sin(viewAngle) clamped
    var sinView = Math.sin(Math.max(viewAngle, 0.05));
    var pathFactor = 1.0 / sinView;
    pathFactor = Math.min(pathFactor, 40.0); // clamp for horizon

    // Scattering angle between view and sun
    var viewDir = [Math.cos(viewAngle), Math.sin(viewAngle)];
    var sunDir = [Math.cos(sunElev), Math.sin(sunElev)];
    var cosAngle = viewDir[0] * sunDir[0] + viewDir[1] * sunDir[1];

    var phaseR = rayleighPhase(cosAngle);
    var phaseM = henyeyGreenstein(cosAngle, g);

    // Sun intensity (simple approximation: dimmer at lower elevations)
    var sunAtten = Math.max(Math.sin(sunElev), 0.0);
    var sunIntensity = 20.0 * (0.1 + 0.9 * sunAtten);

    var rgb = [0, 0, 0];
    for (var ch = 0; ch < 3; ch++) {
      var totalExtinction = (beta_r[ch] + beta_m) * pathFactor * 8000;
      var transmittance = Math.exp(-totalExtinction);
      var scatter = (beta_r[ch] * phaseR + beta_m * phaseM) * sunIntensity;
      var inscatter = scatter * (1.0 - transmittance) / Math.max(beta_r[ch] + beta_m, 1e-10);
      rgb[ch] = inscatter + 0.002 * transmittance; // small ambient
    }

    return rgb;
  }

  function drawSkyPreview() {
    var canvas = $('skyCanvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;

    var sunAngleDeg = parseFloat($('sunAngle').value);
    var turbidity = parseFloat($('turbidity').value);
    var g = parseFloat($('mieG').value);
    var altKm = parseFloat($('altitude').value);
    var sunElev = sunAngleDeg * PI / 180;

    // Draw sky from horizon (bottom) to zenith (top)
    for (var y = 0; y < h; y++) {
      var viewAngle = (1.0 - y / h) * PI * 0.5; // 0 at bottom (horizon), PI/2 at top
      var rgb = computeSkyColorAtAngle(viewAngle, sunElev, turbidity, g, altKm);

      // Tone mapping (simple Reinhard)
      var r = rgb[0] / (1.0 + rgb[0]);
      var gv = rgb[1] / (1.0 + rgb[1]);
      var b = rgb[2] / (1.0 + rgb[2]);

      // Gamma
      r = Math.pow(Math.max(r, 0), 1.0 / 2.2);
      gv = Math.pow(Math.max(gv, 0), 1.0 / 2.2);
      b = Math.pow(Math.max(b, 0), 1.0 / 2.2);

      var cr = Math.min(Math.round(r * 255), 255);
      var cg = Math.min(Math.round(gv * 255), 255);
      var cb = Math.min(Math.round(b * 255), 255);

      ctx.fillStyle = 'rgb(' + cr + ',' + cg + ',' + cb + ')';
      ctx.fillRect(0, y, w, 1);
    }

    // Draw sun glow
    var sunY = h * (1.0 - sunAngleDeg / 90.0);
    var sunX = w * 0.5;
    var gradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 60);
    gradient.addColorStop(0, 'rgba(255,255,230,0.6)');
    gradient.addColorStop(0.3, 'rgba(255,200,100,0.2)');
    gradient.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Ground
    ctx.fillStyle = 'rgba(20,15,10,0.8)';
    ctx.fillRect(0, h - 10, w, 10);

    // Update scatter result text
    var beta_r = rayleighCoeffs(altKm);
    var beta_m = mieCoeff(turbidity, altKm);
    $('scatterResult').textContent =
      '瑞利散射系数 β_R:\n' +
      '  R(680nm): ' + beta_r[0].toExponential(2) + ' /m\n' +
      '  G(550nm): ' + beta_r[1].toExponential(2) + ' /m\n' +
      '  B(440nm): ' + beta_r[2].toExponential(2) + ' /m\n' +
      '米氏散射系数 β_M: ' + beta_m.toExponential(2) + ' /m\n' +
      'Mie 方向性 g: ' + g + '\n' +
      '瑞利相函数 P(90°): ' + rayleighPhase(0).toFixed(4) + '\n' +
      'HG 相函数 P(0°,g): ' + henyeyGreenstein(1, g).toFixed(4);
  }

  /* ========== 3. Color Temperature ========== */
  function kelvinToRGB(kelvin) {
    // Tanner Helland approximation
    var temp = kelvin / 100;
    var r, g, b;

    if (temp <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(temp) - 161.1195681661;
      b = temp <= 19 ? 0 : (138.5177312231 * Math.log(temp - 10) - 305.0447927307);
    } else {
      r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
      b = 255;
    }

    return [
      Math.min(Math.max(Math.round(r), 0), 255),
      Math.min(Math.max(Math.round(g), 0), 255),
      Math.min(Math.max(Math.round(b), 0), 255)
    ];
  }

  function updateKelvin() {
    var k = parseInt($('kelvin').value);
    $('kelvinVal').textContent = k + 'K';
    var rgb = kelvinToRGB(k);
    var hex = '#' + rgb.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('').toUpperCase();
    $('kelvinSwatch').style.background = hex;
    $('kelvinRGB').textContent = 'R: ' + rgb[0] + '  G: ' + rgb[1] + '  B: ' + rgb[2] + '  |  ' + hex;
    drawKelvinBand(k);
  }

  function drawKelvinBand(currentK) {
    var canvas = $('kelvinBand');
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    for (var x = 0; x < w; x++) {
      var k = 1000 + (x / w) * 11000;
      var rgb = kelvinToRGB(k);
      ctx.fillStyle = 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
      ctx.fillRect(x, 0, 1, h);
    }
    // Current position marker
    var markerX = ((currentK - 1000) / 11000) * w;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(markerX, 0);
    ctx.lineTo(markerX, h);
    ctx.stroke();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(markerX - 1, 0);
    ctx.lineTo(markerX - 1, h);
    ctx.moveTo(markerX + 1, 0);
    ctx.lineTo(markerX + 1, h);
    ctx.stroke();
  }

  /* ========== 4. Light Falloff ========== */
  function calcFalloff() {
    var I = parseFloat($('lightIntensity').value);
    var d = parseFloat($('lightDistance').value);
    if (isNaN(I) || isNaN(d) || I <= 0 || d <= 0) {
      $('falloffResult').textContent = '请输入有效参数';
      return;
    }
    var E = I / (d * d);
    $('falloffResult').textContent =
      '照度 E = I / d² = ' + I + ' / ' + d + '²\n' +
      'E = ' + E.toFixed(2) + ' lux\n' +
      '等效约 EV' + (Math.log2(E / 2.5)).toFixed(1);
    drawFalloffChart(I);
  }

  function drawFalloffChart(intensity) {
    var canvas = $('falloffChart');
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var pad = { left: 50, right: 20, top: 20, bottom: 30 };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(9,16,24,0.96)';
    ctx.fillRect(0, 0, w, h);

    var maxDist = 20; // meters
    var maxLux = intensity; // at 1m

    // Grid
    ctx.strokeStyle = 'rgba(74,222,128,0.1)';
    ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var gy = pad.top + plotH * i / 4;
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(pad.left + plotW, gy); ctx.stroke();
    }
    for (var j = 0; j <= 4; j++) {
      var gx = pad.left + plotW * j / 4;
      ctx.beginPath(); ctx.moveTo(gx, pad.top); ctx.lineTo(gx, pad.top + plotH); ctx.stroke();
    }

    // Curve
    ctx.strokeStyle = 'rgba(74,222,128,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = 0; x <= plotW; x++) {
      var dist = 0.5 + (x / plotW) * (maxDist - 0.5);
      var lux = intensity / (dist * dist);
      var ny = 1.0 - Math.min(lux / maxLux, 1.0);
      var px = pad.left + x;
      var py = pad.top + ny * plotH;
      if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Fill under curve
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.lineTo(pad.left, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = 'rgba(74,222,128,0.08)';
    ctx.fill();

    // Labels
    ctx.fillStyle = '#9ca3af';
    ctx.font = '10px "Yu Gothic UI"';
    ctx.textAlign = 'center';
    for (var k = 0; k <= 4; k++) {
      var d = (0.5 + (maxDist - 0.5) * k / 4).toFixed(1);
      ctx.fillText(d + 'm', pad.left + plotW * k / 4, h - 8);
    }
    ctx.textAlign = 'right';
    for (var m = 0; m <= 4; m++) {
      var lv = (maxLux * (4 - m) / 4).toFixed(0);
      ctx.fillText(lv, pad.left - 4, pad.top + plotH * m / 4 + 4);
    }
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText('距离 (m)', pad.left + plotW / 2, h - 0);
    ctx.save();
    ctx.translate(12, pad.top + plotH / 2);
    ctx.rotate(-PI / 2);
    ctx.fillText('照度 (lux)', 0, 0);
    ctx.restore();

    // Mark current distance
    var curDist = parseFloat($('lightDistance').value) || 2;
    if (curDist >= 0.5 && curDist <= maxDist) {
      var mx = pad.left + ((curDist - 0.5) / (maxDist - 0.5)) * plotW;
      var mLux = intensity / (curDist * curDist);
      var my = pad.top + (1.0 - Math.min(mLux / maxLux, 1.0)) * plotH;
      ctx.fillStyle = 'rgba(251,191,36,0.9)';
      ctx.beginPath();
      ctx.arc(mx, my, 4, 0, 2 * PI);
      ctx.fill();
      ctx.fillStyle = '#fbbf24';
      ctx.font = '11px "Yu Gothic UI"';
      ctx.textAlign = 'left';
      ctx.fillText(mLux.toFixed(1) + ' lux', mx + 8, my - 6);
    }
  }

  /* ========== Reference Tables ========== */
  function buildRefTables() {
    // EV reference
    $('evRefTable').innerHTML = EV_REF.map(function (r) {
      return '<div class="pl-ref-row"><span class="pl-ref-label">' + r.scene +
             '</span><span class="pl-ref-value">EV ' + r.ev + '</span></div>';
    }).join('');

    // Kelvin reference
    $('kelvinRefTable').innerHTML = KELVIN_REF.map(function (r) {
      var rgb = kelvinToRGB(r.kelvin);
      var hex = '#' + rgb.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
      return '<div class="pl-ref-row">' +
        '<span style="display:inline-block;width:14px;height:14px;border-radius:4px;background:' + hex + ';border:1px solid rgba(0,0,0,0.15);flex-shrink:0"></span>' +
        '<span class="pl-ref-label">' + r.source +
        '</span><span class="pl-ref-value">' + r.kelvin + 'K</span></div>';
    }).join('');

    // Kelvin markers under band
    $('kelvinMarkers').innerHTML = [1000, 2000, 4000, 6500, 9000, 12000].map(function (k) {
      return '<span>' + k + 'K</span>';
    }).join('');

    // Light reference
    $('lightRefTable').innerHTML =
      '<div class="pl-ref-row" style="font-weight:600;background:rgba(55,177,140,0.1)">' +
        '<span class="pl-ref-label">场景</span>' +
        '<span class="pl-ref-value" style="min-width:70px">照度(lux)</span>' +
        '<span class="pl-ref-value" style="min-width:80px">亮度(cd/m²)</span>' +
      '</div>' +
      LIGHT_REF.map(function (r) {
        return '<div class="pl-ref-row">' +
          '<span class="pl-ref-label">' + r.scene + '</span>' +
          '<span class="pl-ref-value" style="min-width:70px">' + r.lux + '</span>' +
          '<span class="pl-ref-value" style="min-width:80px">' + r.cdm2 + '</span></div>';
      }).join('');
  }

  /* ========== UI Binding ========== */
  function bindUI() {
    // Exposure
    ['fStop', 'shutter', 'iso'].forEach(function (id) {
      $(id).addEventListener('input', calcExposure);
    });

    // Scatter preset
    $('scatterPreset').addEventListener('change', function () {
      var p = SCATTER_PRESETS[this.value];
      if (!p) return;
      $('sunAngle').value = p.sunAngle;
      $('sunAngleVal').textContent = p.sunAngle + '°';
      $('turbidity').value = p.turbidity;
      $('turbidityVal').textContent = p.turbidity;
      $('mieG').value = p.mieG;
      $('mieGVal').textContent = p.mieG;
      drawSkyPreview();
    });

    // Scatter sliders
    $('sunAngle').addEventListener('input', function () {
      $('sunAngleVal').textContent = this.value + '°';
      drawSkyPreview();
    });
    $('turbidity').addEventListener('input', function () {
      $('turbidityVal').textContent = this.value;
      drawSkyPreview();
    });
    $('mieG').addEventListener('input', function () {
      $('mieGVal').textContent = this.value;
      drawSkyPreview();
    });
    $('altitude').addEventListener('input', function () {
      $('altitudeVal').textContent = this.value + ' km';
      drawSkyPreview();
    });

    // Kelvin
    $('kelvin').addEventListener('input', updateKelvin);

    // Falloff
    $('lightIntensity').addEventListener('input', function () { calcFalloff(); });
    $('lightDistance').addEventListener('input', function () { calcFalloff(); });
  }

  /* ========== Init ========== */
  function init() {
    buildRefTables();
    bindUI();
    calcExposure();
    drawSkyPreview();
    updateKelvin();
    calcFalloff();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
