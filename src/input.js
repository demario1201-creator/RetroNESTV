/*
 * input.js — 输入意图层（八路：up/down/left/right/A/B/Start/Select）
 * 键盘（flow.md §3）与移动端虚拟按键（flow.md §4）都向同一组布尔意图输出，禁止两套逻辑。
 * 移动端：pointer 事件 + 多点触控并发 + touch-action:none（CSS）。
 */
(function (global) {
  'use strict';

  var CONFIG = (typeof require !== 'undefined') ? require('./config.js') : global.CONFIG;
  var KEY_MAP = CONFIG.KEY_MAP;
  var TURBO_KEYS = CONFIG.TURBO_KEYS;
  var INTENTS = CONFIG.INTENTS;

  function InputLayer(opts) {
    opts = opts || {};
    this.state = {
      up: false, down: false, left: false, right: false,
      a: false, b: false, start: false, select: false
    };
    this.onChange = opts.onChange || function () {};
    this.enabled = true;
    this._keyTarget = null;
    this._padRoot = null;
    this._keyHandlers = null;
    this._turboTimers = {};   // 连发（turbo）定时器，按意图分桶
    this._turboActive = {};   // 连发是否激活，按意图分桶
    this._directHeld = {};    // 主键（A/B 实体键）是否被直接按住，用于停止连发时不误松主键
    // 可自定义按键绑定（运行时可被设置面板覆盖）
    this._initBindings(CONFIG.KEY_BINDINGS, CONFIG.TURBO_BINDINGS);
  }

  // 用绑定数组构建 code -> intent 反向表（键盘处理用）
  InputLayer.prototype._initBindings = function (bindings, turbo) {
    this.bindings = (bindings || []).map(function (b) { return { intent: b.intent, codes: b.codes.slice() }; });
    this.turboBindings = (turbo || []).map(function (b) { return { intent: b.intent, codes: b.codes.slice() }; });
    this._rebuildMaps();
  };

  InputLayer.prototype._rebuildMaps = function () {
    var self = this;
    this._codeMap = {};
    this.bindings.forEach(function (b) {
      b.codes.forEach(function (c) { self._codeMap[c] = b.intent; });
    });
    this._turboMap = {};
    this.turboBindings.forEach(function (b) {
      b.codes.forEach(function (c) { self._turboMap[c] = b.intent; });
    });
  };

  // 把某个 code 从其它意图/连发中清除，避免一个物理键映射多个动作
  InputLayer.prototype._clearCodeEverywhere = function (code, exceptIntent, exceptTurboIntent) {
    this.bindings.forEach(function (b) {
      if (b.intent === exceptIntent) return;
      b.codes = b.codes.filter(function (c) { return c !== code; });
    });
    this.turboBindings.forEach(function (b) {
      if (b.intent === exceptTurboIntent) return;
      b.codes = b.codes.filter(function (c) { return c !== code; });
    });
  };

  // 重映射某个意图的主键（替换其全部 code 为该新码）
  InputLayer.prototype.setIntentBinding = function (intent, code) {
    this._clearCodeEverywhere(code, intent, null);
    var found = null;
    for (var i = 0; i < this.bindings.length; i++) {
      if (this.bindings[i].intent === intent) { found = this.bindings[i]; break; }
    }
    if (found) { found.codes = [code]; this._rebuildMaps(); }
  };

  // 重映射连发意图
  InputLayer.prototype.setTurboBinding = function (intent, code) {
    this._clearCodeEverywhere(code, null, intent);
    var found = null;
    for (var i = 0; i < this.turboBindings.length; i++) {
      if (this.turboBindings[i].intent === intent) { found = this.turboBindings[i]; break; }
    }
    if (found) { found.codes = [code]; this._rebuildMaps(); }
  };

  InputLayer.prototype.getBindings = function () {
    return this.bindings.map(function (b) { return { intent: b.intent, codes: b.codes.slice() }; });
  };
  InputLayer.prototype.getTurboBindings = function () {
    return this.turboBindings.map(function (b) { return { intent: b.intent, codes: b.codes.slice() }; });
  };

  // 从持久化数据整体恢复（bindings + turbo 为数组）
  InputLayer.prototype.applyBindings = function (bindings, turbo) {
    if (bindings) this.bindings = bindings.map(function (b) { return { intent: b.intent, codes: b.codes.slice() }; });
    if (turbo) this.turboBindings = turbo.map(function (b) { return { intent: b.intent, codes: b.codes.slice() }; });
    this._rebuildMaps();
  };

  // 恢复默认按键
  InputLayer.prototype.resetBindings = function () {
    this._initBindings(CONFIG.KEY_BINDINGS, CONFIG.TURBO_BINDINGS);
  };

  // 设置某意图布尔；变更则广播
  InputLayer.prototype.set = function (intent, pressed) {
    if (INTENTS.indexOf(intent) < 0) return;
    pressed = !!pressed;
    if (this.state[intent] === pressed) return;
    this.state[intent] = pressed;
    this.emit();
  };

  InputLayer.prototype.emit = function () {
    if (this.enabled) this.onChange(this.state);
  };

  InputLayer.prototype.reset = function () {
    var self = this;
    // 停止所有连发定时器
    Object.keys(this._turboTimers).forEach(function (k) {
      if (self._turboTimers[k]) { clearInterval(self._turboTimers[k]); self._turboTimers[k] = null; }
    });
    this._turboActive = {};
    this._directHeld = {};
    var s = this.state;
    for (var i = 0; i < INTENTS.length; i++) s[INTENTS[i]] = false;
    this.emit();
  };

  InputLayer.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!this.enabled) this.reset();
  };

  // ---- 键盘 ----
  InputLayer.prototype.attachKeyboard = function (target) {
    target = target || global;
    this._keyTarget = target;
    var self = this;
    // 焦点在交互控件（按钮/输入等）时不拦截按键，保证键盘可达性
    function onInteractive(e) {
      var t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(t.tagName)) return true;
      return false;
    }
    function onKeyDown(e) {
      // 游戏中（input.enabled）：无条件接管键盘，不受焦点所在元素影响，
      // 避免"点击电视后焦点残留在可聚焦控件上导致整个键盘被屏蔽"的陷阱。
      if (!self.enabled && onInteractive(e)) return;
      var intent = self._codeMap[e.code];
      if (intent) {
        e.preventDefault(); // 阻止方向键/空格滚动页面
        if (e.repeat) return;
        self._directHeld[intent] = true;
        self.set(intent, true);
        return;
      }
      // 连发键：按住即对该意图高频通断
      var tIntent = self._turboMap[e.code];
      if (tIntent) {
        e.preventDefault();
        if (e.repeat) return;
        self._startTurbo(tIntent, null);
      }
    }
    function onKeyUp(e) {
      if (!self.enabled && onInteractive(e)) return;
      var intent = self._codeMap[e.code];
      if (intent) {
        e.preventDefault();
        self._directHeld[intent] = false;
        self.set(intent, false);
        return;
      }
      var tIntent = self._turboMap[e.code];
      if (tIntent) {
        e.preventDefault();
        self._stopTurbo(tIntent, null);
      }
    }
    function onBlur() { self.reset(); }
    target.addEventListener('keydown', onKeyDown);
    target.addEventListener('keyup', onKeyUp);
    global.addEventListener('blur', onBlur);
    this._keyHandlers = { onKeyDown: onKeyDown, onKeyUp: onKeyUp, onBlur: onBlur };
  };

  InputLayer.prototype.detachKeyboard = function () {
    var t = this._keyTarget;
    if (t && this._keyHandlers) {
      t.removeEventListener('keydown', this._keyHandlers.onKeyDown);
      t.removeEventListener('keyup', this._keyHandlers.onKeyUp);
      global.removeEventListener('blur', this._keyHandlers.onBlur);
      this._keyHandlers = null;
    }
  };

  // ---- 移动端虚拟按键（pointer，多点触控）----
  // 容器内带 [data-intent="up|down|left|right|a|b|start|select"] 的元素
  InputLayer.prototype.attachVirtualPad = function (root) {
    if (!root) return;
    this._padRoot = root;
    var self = this;
    var buttons = root.querySelectorAll('[data-intent]');
    var bound = [];
    Array.prototype.forEach.call(buttons, function (btn) {
      var intent = btn.getAttribute('data-intent');
      function press(e) {
        e.preventDefault();
        btn.classList.add('is-pressed');
        self._directHeld[intent] = true;
        self.set(intent, true);
      }
      function release(e) {
        e.preventDefault();
        btn.classList.remove('is-pressed');
        self._directHeld[intent] = false;
        self.set(intent, false);
      }
      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
      bound.push({ btn: btn, press: press, release: release });
    });

    // ---- 连发（turbo）键：按住即对该意图高频通断 ----
    var turboButtons = root.querySelectorAll('[data-turbo]');
    Array.prototype.forEach.call(turboButtons, function (btn) {
      var intent = btn.getAttribute('data-turbo'); // 'a' | 'b'
      function startTurbo(e) { e.preventDefault(); self._startTurbo(intent, btn); }
      function stopTurbo(e) { e.preventDefault(); self._stopTurbo(intent, btn); }
      btn.addEventListener('pointerdown', startTurbo);
      btn.addEventListener('pointerup', stopTurbo);
      btn.addEventListener('pointercancel', stopTurbo);
      // 注意：触摸下隐式指针捕获使 pointerup 仍在 btn 上触发，故不绑定 pointerleave，
      // 以免手指微移即误停连发。
      bound.push({ btn: btn, press: startTurbo, release: stopTurbo });
    });
    this._padBound = bound;
  };

  // 启动连发：立即按下一次，随后以 TURBO.intervalMs 周期通断
  InputLayer.prototype._startTurbo = function (intent, btnEl) {
    var self = this;
    if (this._turboTimers[intent]) clearInterval(this._turboTimers[intent]);
    this._turboActive[intent] = true;
    this.set(intent, true);
    var on = false;
    this._turboTimers[intent] = setInterval(function () {
      on = !on;
      self.set(intent, on);
    }, CONFIG.TURBO.intervalMs);
    if (btnEl) btnEl.classList.add('is-pressed');
  };

  // 停止连发：清除定时器；仅当主键（A/B 实体键）未被直接按住时才松开该意图
  InputLayer.prototype._stopTurbo = function (intent, btnEl) {
    this._turboActive[intent] = false;
    if (this._turboTimers[intent]) {
      clearInterval(this._turboTimers[intent]);
      this._turboTimers[intent] = null;
    }
    if (btnEl) btnEl.classList.remove('is-pressed');
    if (!this._directHeld[intent]) this.set(intent, false);
  };

  InputLayer.prototype.detachVirtualPad = function () {
    var self = this;
    if (!this._padBound) return;
    this._padBound.forEach(function (b) {
      b.btn.removeEventListener('pointerdown', b.press);
      b.btn.removeEventListener('pointerup', b.release);
      b.btn.removeEventListener('pointercancel', b.release);
      b.btn.removeEventListener('pointerleave', b.release);
    });
    Object.keys(this._turboTimers).forEach(function (k) {
      if (self._turboTimers[k]) { clearInterval(self._turboTimers[k]); self._turboTimers[k] = null; }
    });
    this._turboActive = {};
    this._directHeld = {};
    this._padBound = null;
    this._padRoot = null;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InputLayer;
  } else {
    global.InputLayer = InputLayer;
  }
})(typeof window !== 'undefined' ? window : this);
