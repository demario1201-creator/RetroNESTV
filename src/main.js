/*
 * main.js — DOMContentLoaded 后装配所有模块
 * 顺序：emulator → crt → input → cartridge(全局) → boot → ui。
 */
(function (global) {
  'use strict';

  function reduceMotionNow() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function boot() {
    var reduced = reduceMotionNow();

    var screenCanvas = document.getElementById('screen');
    var screenWrap = document.getElementById('screen-wrap');

    var emulator = new Emulator();
    var crt = new CRT(screenCanvas, { container: screenWrap, reducedMotion: reduced });
    crt.setContentSource(null); // 待机雪花

    var input = new InputLayer({
      onChange: function (state) { emulator.applyIntent(0, state); }
    });
    input.attachKeyboard(global);
    var mobilePad = document.getElementById('mobile-pad');
    if (mobilePad) input.attachVirtualPad(mobilePad);

    var cartridge = global.Cartridge;
    var bootAnim = new Boot({ crt: crt, reducedMotion: reduced });

    var ui = new UI({
      emulator: emulator, crt: crt, input: input,
      cartridge: cartridge, boot: bootAnim,
      reducedMotion: reduced, manifestUrl: 'assets/manifest.json'
    });

    // reduced-motion 实时变化
    if (global.matchMedia) {
      var mq = global.matchMedia('(prefers-reduced-motion: reduce)');
      var handler = function (e) {
        crt.setReducedMotion(e.matches);
        bootAnim.setReducedMotion(e.matches);
      };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }

    global.addEventListener('resize', function () { crt.resize(); });

    // 调试句柄
    global.__NESCRT__ = { emulator: emulator, crt: crt, input: input, ui: ui, boot: bootAnim };

    // ===== 按键说明 / 设置 / 持久化 =====
    var STORE_KEY = (CONFIG.STORAGE_PREFIX || 'nescrt.') + 'settings';

    // ---- 按键说明（按当前绑定动态渲染，修改自定义键后自动同步）----
    var helpToggle = document.getElementById('help-toggle');
    var helpPanel = document.getElementById('help-panel');
    var helpClose = document.getElementById('help-close');
    var helpKeys = document.getElementById('help-keys');

    function setHelp(open) {
      if (!helpPanel) return;
      helpPanel.hidden = !open;
      if (helpToggle) helpToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    // event.code -> 可读标签
    function codeLabel(code) {
      if (!code) return '';
      var map = {
        ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
        ShiftLeft: '左Shift', ShiftRight: '右Shift', Backquote: '`', Backspace: 'Backspace',
        Enter: 'Enter', Space: '空格', Escape: 'Esc', Tab: 'Tab',
        ControlLeft: '左Ctrl', ControlRight: '右Ctrl', AltLeft: '左Alt', AltRight: '右Alt'
      };
      if (map[code]) return map[code];
      if (code.indexOf('Key') === 0) return code.slice(3);
      if (code.indexOf('Digit') === 0) return code.slice(5);
      if (code.indexOf('Numpad') === 0) return '小键' + code.slice(6);
      return code;
    }

    var INTENT_LABELS = {
      up: '上', down: '下', left: '左', right: '右',
      a: 'A', b: 'B', start: 'Start', select: 'Select',
      'turbo-a': '连发A', 'turbo-b': '连发B'
    };

    function renderHelp() {
      if (!helpKeys) return;
      helpKeys.innerHTML = '';
      var mains = input.getBindings();
      var turbos = input.getTurboBindings();
      function li(html) { var el = document.createElement('li'); el.innerHTML = html; helpKeys.appendChild(el); }
      ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'].forEach(function (it) {
        var b = null;
        mains.forEach(function (x) { if (x.intent === it) b = x; });
        var keys = (b && b.codes.length) ? b.codes.map(codeLabel).join(' / ') : '未设置';
        li('<b>' + (INTENT_LABELS[it] || it) + '</b>：' + keys);
      });
      turbos.forEach(function (b) {
        var keys = b.codes.length ? b.codes.map(codeLabel).join(' / ') : '未设置';
        li('<b>' + (INTENT_LABELS['turbo-' + b.intent] || b.intent) + '</b>：' + keys);
      });
      li('<b>退出</b>：Esc');
    }

    if (helpToggle && helpPanel) {
      helpToggle.addEventListener('click', function () { setHelp(helpPanel.hidden); });
      if (helpClose) helpClose.addEventListener('click', function () { setHelp(false); });
    }

    // ---- 设置面板 ----
    var settingsToggle = document.getElementById('settings-toggle');
    var settingsPanel = document.getElementById('settings-panel');
    var settingsClose = document.getElementById('settings-close');
    var volEl = document.getElementById('set-volume');
    var volVal = document.getElementById('set-volume-val');
    var crtSel = document.getElementById('set-crt');
    var clarityEl = document.getElementById('set-clarity');
    var clarityVal = document.getElementById('set-clarity-val');
    var keyList = document.getElementById('key-bind-list');
    var keyReset = document.getElementById('key-reset');
    var snowEls = document.querySelectorAll('input[name="snow"]');

    // ---- 主题切换（左上角灯泡：亮=白天，灭=暗夜）----
    var themeToggle = document.getElementById('theme-toggle');
    function applyTheme(night) {
      document.body.classList.toggle('theme-night', night);
      if (themeToggle) {
        themeToggle.classList.toggle('is-lit', !night);
        themeToggle.setAttribute('aria-pressed', night ? 'true' : 'false');
      }
    }
    if (themeToggle) {
      themeToggle.addEventListener('click', function () {
        applyTheme(!document.body.classList.contains('theme-night'));
        persist();
      });
    }

    function setSettings(open) {
      if (!settingsPanel) return;
      settingsPanel.hidden = !open;
      if (settingsToggle) settingsToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function persist() {
      try {
        var data = {
          volume: emulator.getVolume(),
          crtTier: crt.getTier(),
          snowMode: crt.getSnowMode(),
          clarity: Math.round(crt.getClarity() * 100),
          bindings: input.getBindings(),
          turbo: input.getTurboBindings(),
          theme: document.body.classList.contains('theme-night') ? 'night' : 'day'
        };
        global.localStorage.setItem(STORE_KEY, JSON.stringify(data));
      } catch (e) { /* 忽略：隐私模式/无 localStorage */ }
    }

    function applyVolume(v) {
      v = Math.round(v);
      emulator.setVolume(v / 100);
      if (volVal) volVal.textContent = v + '%';
      if (volEl) volEl.value = v;
      persist();
    }
    function applyCrt(name) { crt.setTier(name); if (crtSel) crtSel.value = name; persist(); }
    function applyClarity(v) {
      v = Math.round(v);
      crt.setClarity(v / 100);
      if (clarityVal) clarityVal.textContent = v + '%';
      if (clarityEl) clarityEl.value = v;
      persist();
    }
    function applySnow(mode) {
      crt.setSnowMode(mode);
      snowEls.forEach(function (r) { r.checked = (r.value === mode); });
      persist();
    }

    function renderKeyList() {
      if (!keyList) return;
      keyList.innerHTML = '';
      var mains = input.getBindings();
      var turbos = input.getTurboBindings().map(function (b) { return { intent: 'turbo-' + b.intent, codes: b.codes }; });
      mains.concat(turbos).forEach(function (b) {
        var row = document.createElement('div'); row.className = 'key-bind-row';
        var label = document.createElement('span'); label.className = 'key-bind-label';
        label.textContent = INTENT_LABELS[b.intent] || b.intent;
        var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'key-bind-btn';
        btn.setAttribute('data-bind', b.intent);
        btn.textContent = (b.codes.length ? b.codes.map(codeLabel).join(' / ') : '未设置');
        btn.addEventListener('click', function () { startListening(b.intent, btn); });
        row.appendChild(label); row.appendChild(btn);
        keyList.appendChild(row);
      });
    }

    var listening = null;
    function startListening(intent, btn) {
      listening = { intent: intent, btn: btn };
      btn.classList.add('is-listening');
      btn.textContent = '按下新键…';
    }
    function stopListening() {
      if (!listening) return;
      listening.btn.classList.remove('is-listening');
      listening = null;
      renderKeyList();
    }

    if (settingsToggle && settingsPanel) {
      settingsToggle.addEventListener('click', function () { setSettings(settingsPanel.hidden); });
      if (settingsClose) settingsClose.addEventListener('click', function () { setSettings(false); });
    }
    if (volEl) volEl.addEventListener('input', function () { applyVolume(+volEl.value); });
    if (crtSel) crtSel.addEventListener('change', function () { applyCrt(crtSel.value); });
    if (clarityEl) clarityEl.addEventListener('input', function () { applyClarity(+clarityEl.value); });
    snowEls.forEach(function (r) {
      r.addEventListener('change', function () { if (r.checked) applySnow(r.value); });
    });
    if (keyReset) keyReset.addEventListener('click', function () {
      input.resetBindings(); persist(); renderHelp(); renderKeyList();
    });

    // 捕获阶段：统一处理 Esc（关闭面板/取消监听）与按键重映射（拦截穿透到游戏）
    global.addEventListener('keydown', function (e) {
      if (listening) {
        e.preventDefault(); e.stopPropagation();
        if (e.code === 'Escape') { stopListening(); return; }
        var intent = listening.intent;
        if (intent.indexOf('turbo-') === 0) input.setTurboBinding(intent.slice(6), e.code);
        else input.setIntentBinding(intent, e.code);
        persist(); renderHelp();
        stopListening();
        return;
      }
      if (e.code === 'Escape') {
        if (settingsPanel && !settingsPanel.hidden) { e.preventDefault(); e.stopPropagation(); setSettings(false); return; }
        if (helpPanel && !helpPanel.hidden) { e.preventDefault(); e.stopPropagation(); setHelp(false); return; }
        // 否则交还 ui.js 处理（游戏中 Esc 退出）
      }
    }, true);

    // ---- 载入持久化设置 ----
    (function loadSettings() {
      try {
        var raw = global.localStorage.getItem(STORE_KEY);
        if (!raw) return;
        var d = JSON.parse(raw);
        if (typeof d.volume === 'number') emulator.setVolume(d.volume);
        if (d.crtTier) crt.setTier(d.crtTier);
        if (d.snowMode) crt.setSnowMode(d.snowMode);
        if (typeof d.clarity === 'number') crt.setClarity(d.clarity / 100);
        if (d.bindings && d.turbo) input.applyBindings(d.bindings, d.turbo);
        if (d.theme === 'night') applyTheme(true);
      } catch (e) { /* 忽略损坏数据 */ }
    })();

    // 同步 UI 初始值
    if (volEl) volEl.value = Math.round(emulator.getVolume() * 100);
    if (volVal) volVal.textContent = Math.round(emulator.getVolume() * 100) + '%';
    if (crtSel) crtSel.value = crt.getTier();
    snowEls.forEach(function (r) { r.checked = (r.value === crt.getSnowMode()); });
    if (clarityEl) clarityEl.value = Math.round(crt.getClarity() * 100);
    if (clarityVal) clarityVal.textContent = Math.round(crt.getClarity() * 100) + '%';
    renderKeyList();
    renderHelp();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : this);
