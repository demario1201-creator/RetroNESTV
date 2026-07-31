/*
 * boot.js — 开机动画 F0–F4（art-bible §7，总时长 1200–1500ms）
 * 绘制通电瞬态到 256×240 离屏 canvas，复用 CRT 管线（ui 已 setContentSource 指向它）。
 * 交互：点击屏幕 / 按任意键可快进直达结束；prefers-reduced-motion 跳过 F0–F3 仅做一次淡入。
 */
(function (global) {
  'use strict';

  var CONFIG = (typeof require !== 'undefined') ? require('./config.js') : global.CONFIG;
  var BOOT = CONFIG.BOOT;
  var W = CONFIG.NES_WIDTH, H = CONFIG.NES_HEIGHT;

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
  function easeOutBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  function clamp01(p) { return p < 0 ? 0 : (p > 1 ? 1 : p); }
  function lerp(a, b, p) { return a + (b - a) * p; }

  function Boot(opts) {
    opts = opts || {};
    this.crt = opts.crt;
    this.reducedMotion = !!opts.reducedMotion;
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this._raf = null;
    this._skipHandlers = null;
  }

  Boot.prototype.setReducedMotion = function (on) { this.reducedMotion = !!on; };

  Boot.prototype.play = function (onDone) {
    var self = this;
    this.onDone = onDone;
    this._finished = false;   // 允许重复播放：重置一次性完成标志
    if (this.crt) this.crt.setContentSource(this.canvas);

    if (this.reducedMotion) {
      // 跳过 F0–F3：仅一次 <200ms 淡入到稳定态
      this._start = performance.now();
      this._dur = BOOT.reducedFadeMs;
      this._reduced = true;
    } else {
      this._start = performance.now();
      this._dur = BOOT.total;
      this._reduced = false;
    }
    this._attachSkip();
    this._loop();
  };

  Boot.prototype._attachSkip = function () {
    var self = this;
    function onKey(e) { if (e.code === 'Escape') return; self._finish(); }
    function onClick() { self._finish(); }
    // 下一拍再挂，避免触发本次开机点击被立即当作跳过
    setTimeout(function () {
      document.addEventListener('keydown', onKey);
      document.addEventListener('click', onClick);
      self._skipHandlers = { onKey: onKey, onClick: onClick };
    }, 0);
  };

  Boot.prototype._detachSkip = function () {
    if (!this._skipHandlers) return;
    document.removeEventListener('keydown', this._skipHandlers.onKey);
    document.removeEventListener('click', this._skipHandlers.onClick);
    this._skipHandlers = null;
  };

  Boot.prototype._loop = function () {
    var self = this;
    function tick(t) {
      var elapsed = t - self._start;
      self._draw(elapsed);
      if (elapsed >= self._dur) { self._finish(); return; }
      self._raf = global.requestAnimationFrame(tick);
    }
    self._raf = global.requestAnimationFrame(tick);
  };

  Boot.prototype._finish = function () {
    if (this._finished) return;
    this._finished = true;
    if (this._raf) global.cancelAnimationFrame(this._raf);
    this._raf = null;
    this._detachSkip();
    if (this.onDone) this.onDone();
  };

  // 根据 elapsed 绘制 F0–F4 瞬态
  Boot.prototype._draw = function (elapsed) {
    var ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (this._reduced) {
      // 稳定态淡入（磷光绿雪花）
      var p = clamp01(elapsed / this._dur);
      this._drawSnow(p);
      return;
    }

    var f1 = BOOT.f1, f2 = BOOT.f2, f3 = BOOT.f3, f4 = BOOT.f4;
    if (elapsed < f1[0]) {
      this._drawF0(elapsed);
    } else if (elapsed < f2[0]) {
      this._drawF1((elapsed - f1[0]) / (f1[1] - f1[0]));
    } else if (elapsed < f3[0]) {
      this._drawF2((elapsed - f2[0]) / (f2[1] - f2[0]));
    } else if (elapsed < f4[0]) {
      this._drawF3((elapsed - f3[0]) / (f3[1] - f3[0]));
    } else {
      this._drawF4((elapsed - f4[0]) / (f4[1] - f4[0]));
    }
  };

  Boot.prototype._drawF0 = function (elapsed) {
    // 纯黑 + 极淡噪点 a≈0.05
    var ctx = this.ctx;
    var n = 0.05;
    for (var i = 0; i < 60; i++) {
      var x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = 'rgba(180,200,180,' + (n * Math.random()).toFixed(3) + ')';
      ctx.fillRect(x, y, 1, 1);
    }
  };

  Boot.prototype._drawF1 = function (p) {
    var ctx = this.ctx;
    p = clamp01(p);
    var e = easeOutCubic(p);
    var r = lerp(6, 14, e);
    var cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.globalAlpha = e;
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  Boot.prototype._drawF2 = function (p) {
    var ctx = this.ctx;
    p = clamp01(p);
    var e = easeOutBack(p);            // 含 overshoot
    var w = Math.min(W, W * e);
    var cy = H / 2;
    ctx.save();
    ctx.shadowColor = 'rgba(255,255,255,0.9)';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#fff';
    ctx.fillRect((W - w) / 2, cy - 2, w, 4);
    ctx.restore();
  };

  Boot.prototype._drawF3 = function (p) {
    var ctx = this.ctx;
    p = clamp01(p);
    var e = easeOutCubic(p);
    var cy = H / 2;
    var top = lerp(cy, 0, e);
    var bot = lerp(cy, H, e);
    // 纵向展开亮屏
    ctx.fillStyle = 'rgba(230,235,225,0.95)';
    ctx.fillRect(0, top, W, bot - top);
    // 滚屏亮带自上而下扫过
    var bandY = lerp(0, H, e);
    var bh = H * 0.08;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, bandY - bh / 2, W, bh);
    ctx.restore();
  };

  Boot.prototype._drawF4 = function (p) {
    // 稳定：磷光绿雪花淡入（与待机/游玩画面衔接）
    p = clamp01(p);
    this._drawSnow(p);
  };

  Boot.prototype._drawSnow = function (alpha) {
    var ctx = this.ctx;
    var img = ctx.createImageData(W, H);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = (Math.random() * 90) | 0;
      d[i] = (v * 0.32) | 0; d[i + 1] = v; d[i + 2] = (v * 0.5) | 0; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (alpha < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - alpha;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Boot;
  } else {
    global.Boot = Boot;
  }
})(typeof window !== 'undefined' ? window : this);
