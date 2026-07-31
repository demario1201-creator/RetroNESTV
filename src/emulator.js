/*
 * emulator.js — jsnes 封装
 * 职责：new NES()、loadROM(Uint8Array)、frame/audio 回调、requestAnimationFrame 主循环。
 * 帧流程：jsnes onFrame(Uint32[256*240]) → 写入离屏 2D canvas 的 ImageData
 *         → 该 canvas 作为 CRT 后处理的源（WebGL 纹理 / CSS 档直接显示）。
 * 音频：onAudioSample(l,r) 攒入队列 → ScriptProcessor 缓冲（Web Audio）。
 */
(function (global) {
  'use strict';

  var CONFIG = (typeof require !== 'undefined') ? require('./config.js') : global.CONFIG;
  var NES_WIDTH = CONFIG.NES_WIDTH;
  var NES_HEIGHT = CONFIG.NES_HEIGHT;
  var INTENT_TO_NES = CONFIG.INTENT_TO_NES;

  var FRAME_MS = 1000 / 60;
  var MAX_AUDIO_QUEUE = 8192; // 防止队列无限增长

  function Emulator() {
    this.running = false;
    this._raf = null;
    this.lastT = 0;
    this.acc = 0;
    this.volume = (CONFIG.DEFAULTS && CONFIG.DEFAULTS.volume != null) ? CONFIG.DEFAULTS.volume : 0.8;
    this.muted = (this.volume <= 0);
    this.gainNode = null;

    // 离屏 2D canvas：NES 原生 256x240，作为 CRT 源
    this.offscreen = document.createElement('canvas');
    this.offscreen.width = NES_WIDTH;
    this.offscreen.height = NES_HEIGHT;
    this.offCtx = this.offscreen.getContext('2d');
    this.imageData = this.offCtx.createImageData(NES_WIDTH, NES_HEIGHT);
    this.pixels = this.imageData.data; // Uint8ClampedArray(R,G,B,A)

    // 音频队列
    this.audioL = [];
    this.audioR = [];

    var self = this;
    this.nes = new jsnes.NES({
      onFrame: function (frameBuffer) { self._onFrame(frameBuffer); },
      onAudioSample: function (left, right) { self._onAudioSample(left, right); }
    });

    this.audioCtx = null;
    this.scriptNode = null;
  }

  // ---- 帧回调：jsnes 像素为 0x00RRGGBB（R 高字节，alpha=0）----
  // 逐通道解出 R,G,B 并补足 alpha=255（ImageData 为 R,G,B,A）。
  Emulator.prototype._onFrame = function (buf) {
    var d = this.pixels;
    var n = Math.min(buf.length, NES_WIDTH * NES_HEIGHT);
    for (var i = 0; i < n; i++) {
      var v = buf[i];
      var o = i << 2;
      d[o] = (v >> 16) & 0xff;
      d[o + 1] = (v >> 8) & 0xff;
      d[o + 2] = v & 0xff;
      d[o + 3] = 255;
    }
    this.offCtx.putImageData(this.imageData, 0, 0);
    if (this.onFrameReady) this.onFrameReady(this.offscreen);
  };

  // ---- 音频采样：攒入队列（钳制到 [-1,1] 防止爆音）----
  Emulator.prototype._onAudioSample = function (left, right) {
    if (this.muted || !this.audioCtx) return;
    if (this.audioL.length > MAX_AUDIO_QUEUE) return; // 溢出丢弃
    this.audioL.push(left < -1 ? -1 : (left > 1 ? 1 : left));
    this.audioR.push(right < -1 ? -1 : (right > 1 ? 1 : right));
  };

  // ---- 用户手势后初始化音频（必须在手势中 resume）----
  Emulator.prototype.initAudio = function () {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      return;
    }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return; // 无 Web Audio：静默降级
    this.audioCtx = new AC();
    this.scriptNode = this.audioCtx.createScriptProcessor(4096, 0, 2);
    var self = this;
    this.scriptNode.onaudioprocess = function (e) {
      var outL = e.outputBuffer.getChannelData(0);
      var outR = e.outputBuffer.getChannelData(1);
      var n = outL.length;
      var q = self.audioL, qr = self.audioR;
      for (var i = 0; i < n; i++) {
        if (q.length > 0) { outL[i] = q.shift(); outR[i] = qr.shift(); }
        else { outL[i] = 0; outR[i] = 0; }
      }
    };
    // 音量增益节点：scriptNode -> gainNode -> destination
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = this.volume;
    this.scriptNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
  };

  // 音量调节：0~1（0 等价于静音）。用 GainNode 控制输出增益。
  Emulator.prototype.setVolume = function (v) {
    v = Math.max(0, Math.min(1, v));
    this.volume = v;
    this.muted = (v <= 0);
    if (this.gainNode) {
      try { this.gainNode.gain.value = v; } catch (e) { /* 某些实现需 setValueAtTime */ }
    }
    if (this.muted) { this.audioL.length = 0; this.audioR.length = 0; }
  };
  Emulator.prototype.getVolume = function () { return this.volume; };
  Emulator.prototype.isMuted = function () { return this.muted; };

  // 开机"通电嗡"短音（任务待定项，默认开）
  Emulator.prototype.playPowerOn = function () {
    if (this.muted || !this.audioCtx) return;
    var ctx = this.audioCtx;
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(CONFIG.AUDIO.powerOnFreqStart, now);
    osc.frequency.exponentialRampToValueAtTime(CONFIG.AUDIO.powerOnFreqEnd, now + CONFIG.AUDIO.powerOnDurationMs / 1000);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + CONFIG.AUDIO.powerOnDurationMs / 1000);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + CONFIG.AUDIO.powerOnDurationMs / 1000 + 0.02);
  };

  // ---- loadROM：注入并捕获异常（错误码 d）----
  Emulator.prototype.loadROM = function (uint8) {
    try {
      this.nes.loadROM(uint8);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: CONFIG.ERRORS.INJECT_FAILED, detail: err };
    }
  };

  // ---- 输入：意图 -> jsnes 按钮 ----
  // 注意：jsnes 的 buttonDown/buttonUp 玩家索引是 1-based（controller 1/2），
  // 传 0 会让内部 controllers[0-1] 越界并抛错。故这里规范为 (player||1)。
  Emulator.prototype.setButton = function (player, intent, pressed) {
    var btn = INTENT_TO_NES[intent];
    if (btn === undefined) return;
    var ctrl = (player === 0 || player == null) ? 1 : player;
    if (pressed) this.nes.buttonDown(ctrl, btn);
    else this.nes.buttonUp(ctrl, btn);
  };

  // 批量设置意图布尔状态（来自 input.js 意图层）
  Emulator.prototype.applyIntent = function (player, intentState) {
    var self = this;
    CONFIG.INTENTS.forEach(function (k) {
      self.setButton(player, k, !!intentState[k]);
    });
  };

  Emulator.prototype.getFrameCanvas = function () { return this.offscreen; };

  // ---- 主循环：requestAnimationFrame + 时间累加器，固定 60fps 仿真 ----
  Emulator.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.lastT = 0;
    this.acc = 0;
    var self = this;
    function loop(t) {
      if (!self.running) return;
      if (!self.lastT) self.lastT = t;
      var dt = t - self.lastT;
      self.lastT = t;
      self.acc += dt;
      var steps = 0;
      while (self.acc >= FRAME_MS && steps < 4) {
        self.nes.frame();
        self.acc -= FRAME_MS;
        steps++;
      }
      if (self.acc > FRAME_MS * 4) self.acc = 0; // 防螺旋
      self._raf = global.requestAnimationFrame(loop);
    }
    this._raf = global.requestAnimationFrame(loop);
  };

  Emulator.prototype.stop = function () {
    this.running = false;
    if (this._raf) global.cancelAnimationFrame(this._raf);
    this._raf = null;
  };

  // 重置仿真内部状态（退出回到 Idle 时调用）
  Emulator.prototype.reset = function () {
    try { this.nes.reset(); } catch (e) { /* 忽略 */ }
    this.audioL.length = 0;
    this.audioR.length = 0;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Emulator;
  } else {
    global.Emulator = Emulator;
  }
})(typeof window !== 'undefined' ? window : this);
