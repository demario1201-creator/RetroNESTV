/*
 * crt.js — CRT 后处理双档栈（art-bible §5.0）
 *   高保真档：WebGL 单 pass 片元着色器（桶形畸变 / 扫描线 / 辉光 / 色散 / 暗角 / 噪点 / 滚屏）。
 *   基线档：WebGL 不可用时自动降级为 CSS 合成叠层（扫描线/暗角/辉光/噪点由 main.css 负责）。
 *   强度：low/mid/high 三档（§5.2）实时映射；reduced-motion 强制锁定低档静态版（§5.0/§9）。
 *   复用：待机雪花 / 开机瞬态 / 游玩画面 均通过同一管线（统一 setContentSource）。
 */
(function (global) {
  'use strict';

  var CONFIG = (typeof require !== 'undefined') ? require('./config.js') : global.CONFIG;

  var VERT_SRC =
    'attribute vec2 aPos;' +
    'varying vec2 vUv;' +
    'void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }';

  var FRAG_SRC = [
    'precision mediump float;',
    'varying vec2 vUv;',
    'uniform sampler2D uTex;',
    'uniform float uTime;',
    'uniform float uMode;',      // 0=内容, 1=待机雪花
    'uniform float uDistort;',   // 桶形曲率
    'uniform float uScan;',      // 扫描线暗线不透明度
    'uniform float uGrille;',    // 孔栅不透明度
    'uniform float uBloom;',     // 辉光强度
    'uniform float uVignette;',  // 暗角强度
    'uniform float uAberr;',     // 色散 px
    'uniform float uNoise;',     // 噪点不透明度
    'uniform float uFlicker;',   // 闪烁开关
    'uniform float uRoll;',      // 滚屏周期秒(0=关)
    'uniform float uSnow;',      // 待机雪花配色：0=黑绿(磷光绿) 1=经典黑白
    'uniform float uSharpness;',// 清晰度 0~1：越高色散重影/辉光越收敛、画面越锐利
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 cc = uv-0.5;',
    '  float r2 = dot(cc,cc);',
    '  uv = uv + cc*r2*uDistort;',                       // 桶形畸变
    '  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor=vec4(0.04,0.04,0.03,1.0); return; }',
    '  vec3 col;',
    '  if(uMode > 0.5){',                                 // 待机雪花
    '    float n = hash(floor(uv*vec2(256.0,240.0)) + floor(uTime*12.0));',
    '    float g = n*0.55 + 0.15;',
    '    if(uSnow > 0.5){',                               // 经典黑白雪花
    '      col = vec3(g, g, g);',
    '    } else {',                                       // 黑绿雪花（磷光绿）
    '      col = vec3(g*0.32, g, g*0.5);',
    '    }',
    '  } else {',
    '    float a = uAberr/256.0;',                        // 色散（边缘强）
    '    float rad = length(cc);',
    '    float sh = uSharpness;',                         // 清晰度 0~1
    '    float ab = a*(0.4+rad)*(1.0 - sh*0.92);',        // 清晰度越高，色散(重影)越小（最低保留 8%）
    '    float rC = texture2D(uTex, uv+vec2(ab,0.0)).r;',
    '    float gC = texture2D(uTex, uv).g;',
    '    float bC = texture2D(uTex, uv-vec2(ab,0.0)).b;',
    '    vec3 center = texture2D(uTex, uv).rgb;',
    '    col = vec3(rC,gC,bC);',
    '    float spread = 2.0/256.0;',                       // 廉价辉光（同时作锐化基准）
    '    vec3 blur = texture2D(uTex, uv+vec2(spread,0.0)).rgb;',
    '    blur += texture2D(uTex, uv-vec2(spread,0.0)).rgb;',
    '    blur += texture2D(uTex, uv+vec2(0.0,spread)).rgb;',
    '    blur += texture2D(uTex, uv-vec2(0.0,spread)).rgb;',
    '    blur *= 0.25;',
    '    col += blur*uBloom*mix(1.0, 0.28, sh);',         // 清晰度越高，辉光越收敛
    '    col += (center - blur) * sh * 0.5;',             // 锐化：unsharp mask，抵消线性放大/辉光糊感
    '  }',
    '  float scan = sin(uv.y*240.0*3.14159)*0.5+0.5;',    // 扫描线
    '  col *= 1.0 - uScan*(1.0-scan);',
    '  if(uGrille > 0.001){',                             // 孔栅（RGB 竖条）
    '    float gx = mod(floor(uv.x*256.0*3.0),3.0);',
    '    vec3 mask = gx<1.0 ? vec3(1.0,0.85,0.85) : (gx<2.0 ? vec3(0.85,1.0,0.85) : vec3(0.85,0.85,1.0));',
    '    col *= mix(vec3(1.0), mask, uGrille);',
    '  }',
    '  if(uNoise > 0.001){',                              // 噪点颗粒
    '    float n = hash(uv*vec2(640.0,480.0) + uTime*16.0);',
    '    col += (n-0.5)*uNoise;',
    '  }',
    '  float vig = smoothstep(0.85, 0.2, length(cc));',   // 暗角
    '  col *= mix(1.0, vig, uVignette);',
    '  if(uRoll > 0.5){',                                 // 滚屏亮带
    '    float band = fract(uv.y + uTime/uRoll);',
    '    float bar = smoothstep(0.0,0.08,band)*smoothstep(0.16,0.08,band);',
    '    col += bar*0.06*vec3(1.0,0.95,0.85);',
    '  }',
    '  if(uFlicker > 0.5){',                              // 轻微闪烁
    '    col *= 1.0 + (hash(vec2(uTime,1.0))-0.5)*0.02;',
    '  }',
    '  gl_FragColor = vec4(col,1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('CRT shader compile error: ' + info);
    }
    return s;
  }

  function CRT(destCanvas, opts) {
    opts = opts || {};
    this.canvas = destCanvas;
    this.container = opts.container || destCanvas.parentNode;
    this.reducedMotion = !!opts.reducedMotion;
    this.tierName = this.reducedMotion ? CONFIG.CRT.reducedMotionTier : CONFIG.CRT.defaultTier;
    this.source = null;       // 内容源 canvas（null=待机雪花）
    this.snowMode = (CONFIG.DEFAULTS && CONFIG.DEFAULTS.snowMode) ? CONFIG.DEFAULTS.snowMode : 'green';
    this.clarity = (CONFIG.DEFAULTS && CONFIG.DEFAULTS.clarity != null) ? (CONFIG.DEFAULTS.clarity / 100) : 0.7;
    this.time = 0;
    this._raf = null;
    this.gl = null;
    this.mode = 'css';        // 先假设 css，WebGL 成功则覆盖
    this._noiseCanvas = null;
    this._initWebGL();
    if (this.gl) this.mode = 'webgl';
    this._applyClarityToDOM();
    this._applyTierToDOM();
    this.resize();
    this._start();
  }

  CRT.prototype._initWebGL = function () {
    var gl = null;
    try {
      var attrs = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
      gl = this.canvas.getContext('webgl', attrs) || this.canvas.getContext('experimental-webgl', attrs);
    } catch (e) { gl = null; }
    if (!gl) return; // 降级 css

    try {
      var vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      var prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('CRT link error: ' + gl.getProgramInfoLog(prog));
      }
      gl.useProgram(prog);

      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

      this.gl = gl;
      this.prog = prog;
      this.u = {
        tex: gl.getUniformLocation(prog, 'uTex'),
        time: gl.getUniformLocation(prog, 'uTime'),
        mode: gl.getUniformLocation(prog, 'uMode'),
        distort: gl.getUniformLocation(prog, 'uDistort'),
        scan: gl.getUniformLocation(prog, 'uScan'),
        grille: gl.getUniformLocation(prog, 'uGrille'),
        bloom: gl.getUniformLocation(prog, 'uBloom'),
        vignette: gl.getUniformLocation(prog, 'uVignette'),
        aberr: gl.getUniformLocation(prog, 'uAberr'),
        noise: gl.getUniformLocation(prog, 'uNoise'),
        flicker: gl.getUniformLocation(prog, 'uFlicker'),
        roll: gl.getUniformLocation(prog, 'uRoll'),
        snow: gl.getUniformLocation(prog, 'uSnow'),
        sharpness: gl.getUniformLocation(prog, 'uSharpness')
      };
      gl.uniform1i(this.u.tex, 0);
    } catch (e) {
      this.gl = null; // 初始化失败 -> css
    }
  };

  CRT.prototype._initCSS = function () {
    // CSS 档：2D context 绘制内容源，效果来自 DOM 叠层（main.css）
    this.cssCtx = this.canvas.getContext('2d');
  };

  CRT.prototype.isWebGL = function () { return this.mode === 'webgl' && !!this.gl; };

  // 内容源：canvas 或 null（待机雪花）
  CRT.prototype.setContentSource = function (canvas) {
    this.source = canvas;
  };

  CRT.prototype.setTier = function (name) {
    if (!CONFIG.CRT.tiers[name]) return;
    if (this.reducedMotion) name = CONFIG.CRT.reducedMotionTier; // 锁定低档
    this.tierName = name;
    this._applyTierToDOM();
  };

  CRT.prototype.getTier = function () { return this.tierName; };

  // 待机雪花配色：'green'(黑绿) | 'white'(经典黑白)
  CRT.prototype.setSnowMode = function (mode) {
    this.snowMode = (mode === 'white') ? 'white' : 'green';
  };
  CRT.prototype.getSnowMode = function () { return this.snowMode; };

  // 清晰度 0~1：越高色散重影/辉光越收敛、画面越锐利
  CRT.prototype.setClarity = function (v01) {
    if (v01 == null || isNaN(v01)) v01 = 0.7;
    v01 = Math.max(0, Math.min(1, v01));
    this.clarity = v01;
    this._applyClarityToDOM();
  };
  CRT.prototype.getClarity = function () { return this.clarity; };
  CRT.prototype._applyClarityToDOM = function () {
    if (!this.container) return;
    this.container.style.setProperty('--crt-clarity', this.clarity.toFixed(3));
  };

  CRT.prototype.setReducedMotion = function (on) {
    this.reducedMotion = !!on;
    if (this.reducedMotion) this.tierName = CONFIG.CRT.reducedMotionTier;
    this._applyTierToDOM();
  };

  CRT.prototype._tierParams = function () {
    var t = CONFIG.CRT.tiers[this.tierName] || CONFIG.CRT.tiers.mid;
    if (this.reducedMotion) {
      // 静态版：关噪点/闪烁/滚屏
      return {
        distortionK: t.distortionK, scanline: t.scanline * 0.6, grille: 0,
        bloom: t.bloom * 0.5, vignette: t.vignette * 0.6, aberration: t.aberration,
        noise: 0, roll: 0, flicker: false
      };
    }
    return {
      distortionK: t.distortionK, scanline: t.scanline, grille: t.grille,
      bloom: t.bloom, vignette: t.vignette, aberration: t.aberration,
      noise: t.noise, roll: t.roll, flicker: t.flicker
    };
  };

  // 把档位同步到 DOM（CSS 叠层用 CSS 变量；reduced 类关动画）
  CRT.prototype._applyTierToDOM = function () {
    if (!this.container) return;
    var p = this._tierParams();
    var s = this.container.style;
    s.setProperty('--crt-scanline', p.scanline.toFixed(3));
    s.setProperty('--crt-vignette', p.vignette.toFixed(3));
    s.setProperty('--crt-bloom', p.bloom.toFixed(3));
    s.setProperty('--crt-grille', p.grille.toFixed(3));
    s.setProperty('--crt-noise', p.noise.toFixed(3));
    s.setProperty('--crt-roll-duration', (p.roll ? p.roll + 's' : '0s'));
    this.container.classList.toggle('crt--reduced', this.reducedMotion);
    this.container.classList.toggle('crt--webgl', this.isWebGL());
    this.container.classList.toggle('crt--css', !this.isWebGL());
  };

  CRT.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(c.clientWidth * dpr));
    var h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    if (this.gl) this.gl.viewport(0, 0, w, h);
  };

  CRT.prototype._idleNoiseCanvas = function () {
    if (!this._noiseCanvas) {
      this._noiseCanvas = document.createElement('canvas');
      this._noiseCanvas.width = CONFIG.NES_WIDTH;
      this._noiseCanvas.height = CONFIG.NES_HEIGHT;
      this._noiseCtx = this._noiseCanvas.getContext('2d');
    }
    var ctx = this._noiseCtx;
    var img = ctx.createImageData(CONFIG.NES_WIDTH, CONFIG.NES_HEIGHT);
    var d = img.data;
    var white = (this.snowMode === 'white');
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 90) | 0;
      if (white) { d[i] = v; d[i + 1] = v; d[i + 2] = v; }
      else { d[i] = (v * 0.32) | 0; d[i + 1] = v; d[i + 2] = (v * 0.5) | 0; }
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return this._noiseCanvas;
  };

  CRT.prototype._start = function () {
    if (this._raf) return;
    var self = this;
    var last = 0;
    function loop(t) {
      if (last) self.time += (t - last) / 1000;
      last = t;
      self._frame();
      self._raf = global.requestAnimationFrame(loop);
    }
    this._raf = global.requestAnimationFrame(loop);
  };

  CRT.prototype._frame = function () {
    if (this.gl) this._renderWebGL();
    else this._renderCSS();
  };

  CRT.prototype._renderWebGL = function () {
    var gl = this.gl;
    var src = this.source || this._idleNoiseCanvas();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } catch (e) { return; }
    var p = this._tierParams();
    gl.uniform1f(this.u.time, this.time);
    gl.uniform1f(this.u.mode, this.source ? 0.0 : 1.0);
    gl.uniform1f(this.u.distort, p.distortionK);
    gl.uniform1f(this.u.scan, p.scanline);
    gl.uniform1f(this.u.grille, p.grille);
    gl.uniform1f(this.u.bloom, p.bloom);
    gl.uniform1f(this.u.vignette, p.vignette);
    gl.uniform1f(this.u.aberr, p.aberration);
    gl.uniform1f(this.u.noise, p.noise);
    gl.uniform1f(this.u.flicker, p.flicker ? 1.0 : 0.0);
    gl.uniform1f(this.u.roll, p.roll);
    gl.uniform1f(this.u.snow, this.snowMode === 'white' ? 1.0 : 0.0);
    gl.uniform1f(this.u.sharpness, this.clarity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  CRT.prototype._renderCSS = function () {
    var ctx = this.cssCtx;
    if (!ctx) this._initCSS();
    var c = this.canvas;
    if (!this.cssCtx) return;
    var src = this.source || this._idleNoiseCanvas();
    // 内容源直接等比绘制（CRT 视觉由 DOM 叠层提供）
    this.cssCtx.clearRect(0, 0, c.width, c.height);
    this.cssCtx.drawImage(src, 0, 0, c.width, c.height);
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CRT;
  } else {
    global.CRT = CRT;
  }
})(typeof window !== 'undefined' ? window : this);
