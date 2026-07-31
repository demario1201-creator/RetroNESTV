/*
 * ui.js — 状态机 Idle→Browsing→Loading→Playing + 卡带面板 + 人话错误提示 + aria-live
 * 三种来源（内置 / 上传 / 拖拽）统一汇入 Loading 前置校验门；成功→开机动画→Playing。
 * 错误码 a–d 对应 flow.md §1.3，失败统一回 Idle 并一句人话提示。
 */
(function (global) {
  'use strict';

  var CONFIG = (typeof require !== 'undefined') ? require('./config.js') : global.CONFIG;
  var STATES = CONFIG.STATES;
  var ERRORS = CONFIG.ERRORS;

  function $(id) { return document.getElementById(id); }

  var WARNING_DEFAULT = '注意：插拔卡带请先关闭电源';

  function UI(opts) {
    this.emulator = opts.emulator;
    this.crt = opts.crt;
    this.input = opts.input;
    this.cartridge = opts.cartridge;
    this.boot = opts.boot;
    this.manifestUrl = opts.manifestUrl || 'assets/manifest.json';

    this.state = STATES.IDLE;
    this.manifest = null;
    this.ready = false;          // 卡带已载入就绪，等待"点击电视开机"
    this.reducedMotion = opts.reducedMotion || false;

    this.el = {
      tv: $('tv'),
      panel: $('cartridge-panel'),
      sourceBuiltin: $('source-builtin'),
      sourceUpload: $('source-upload'),
      fileInput: $('file-input'),
      status: $('status'),
      error: $('error-toast'),
      browsing: $('browsing'),
      browsingGrid: $('browsing-grid'),
      browsingBack: $('browsing-back'),
      bootHint: $('boot-hint'),
      mobilePad: $('mobile-pad'),
      cartridgeName: $('cartridge-name'),
      suborBrand: $('subor-brand'),
      suborWarning: $('subor-warning')
    };

    this._bind();
    this._enterIdle();
  }

  // ---- DOM 绑定 ----
  UI.prototype._bind = function () {
    var self = this;

    this.el.sourceBuiltin.addEventListener('click', function () { self._enterBrowsing(); });
    this.el.sourceUpload.addEventListener('click', function () { self.el.fileInput.click(); });
    this.el.fileInput.addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) self._loadFromFile(f);
      e.target.value = ''; // 允许重复选同一文件
    });

    // 拖拽（桌面专属）
    this.cartridge.attachDragAndDrop(this.el.tv, function (file) { self._loadFromFile(file); });

    // 点击电视：已就绪则开机；否则提示先选卡带
    function onScreenActivate() {
      if (self.state === STATES.PLAYING) return;
      if (self.ready) { self._powerOn(); return; }
      if (self.state === STATES.IDLE) self._announce('请先选择卡带：内置游戏、上传文件或拖拽到电视');
    }
    this.el.tv.addEventListener('click', onScreenActivate);
    this.el.tv.addEventListener('keydown', function (e) {
      if (e.code !== 'Enter' && e.code !== 'Space') return;
      if (self.state === STATES.PLAYING) return;
      e.preventDefault();
      onScreenActivate();
    });
    // SUBOR/ESC 徽标：游戏中作为退出按钮；否则等同点击电视
    if (this.el.suborBrand) {
      this.el.suborBrand.addEventListener('click', function () {
        if (self.state === STATES.PLAYING) { self.exitToIdle(); return; }
        onScreenActivate();
      });
      this.el.suborBrand.addEventListener('keydown', function (e) {
        if (e.code !== 'Enter' && e.code !== 'Space') return;
        e.preventDefault();
        if (self.state === STATES.PLAYING) self.exitToIdle();
        else onScreenActivate();
      });
    }

    // 浏览返回
    this.el.browsingBack.addEventListener('click', function () { self._enterIdle(); });

    // Esc 退出
    global.addEventListener('keydown', function (e) {
      if (e.code === 'Escape' && self.state === STATES.PLAYING) self.exitToIdle();
    });

    // P 暂停 / 继续（游戏中）
    global.addEventListener('keydown', function (e) {
      if (e.code === 'KeyP' && self.state === STATES.PLAYING) {
        e.preventDefault();
        self.togglePause();
      }
    });
  };

  // ---- 状态切换 ----
  UI.prototype._setState = function (s) {
    this.state = s;
    document.body.setAttribute('data-state', s);
    // 卡带面板：idle/loading/playing 都保留顶部铭牌 + SUBOR/ESC 徽标，仅浏览时隐藏
    this.el.panel.hidden = (s === STATES.BROWSING);
    this.el.browsing.hidden = (s !== STATES.BROWSING);
    this.el.bootHint.hidden = true;
    this.el.tv.classList.toggle('is-ready', this.ready && s === STATES.LOADING);
  };

  UI.prototype._announce = function (text) {
    if (this.el.status) this.el.status.textContent = text;
  };

  UI.prototype._showError = function (err) {
    var msg = (err && err.message) ? err.message : '发生未知错误';
    if (this.el.error) {
      this.el.error.textContent = msg;
      this.el.error.hidden = false;
      this.el.error.setAttribute('role', 'alert');
    }
    this._announce(msg);
    var self = this;
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(function () {
      if (self.el.error) self.el.error.hidden = true;
    }, 5000);
  };

  UI.prototype._enterIdle = function () {
    this.ready = false;
    this.crt.setContentSource(null);     // 待机雪花
    this.input.setEnabled(false);
    this._hideError();
    this._setPausedUI(false);
    this._setState(STATES.IDLE);
    this._announce('待机中，请插入卡带');
    this._updateSuborLabel('SUBOR', '等同点击电视开机');
    if (this.el.suborWarning) this.el.suborWarning.textContent = WARNING_DEFAULT;
  };

  UI.prototype._updateSuborLabel = function (text, actionHint) {
    if (!this.el.suborBrand) return;
    this.el.suborBrand.textContent = text;
    var hint = actionHint || (text === 'ESC' ? '点击退出游戏' : '等同点击电视开机');
    this.el.suborBrand.setAttribute('aria-label', text + '，' + hint);
  };

  UI.prototype._hideError = function () {
    if (this.el.error) this.el.error.hidden = true;
  };

  UI.prototype._enterBrowsing = function () {
    this._setState(STATES.BROWSING);
    this._announce('浏览内置卡带');
    this._renderBrowsing();
  };

  UI.prototype._renderBrowsing = function () {
    var self = this;
    var grid = this.el.browsingGrid;
    grid.innerHTML = '';

    // 优先使用内联卡带（无需 fetch，file:// 与预览环境也能用）
    var builtin = (typeof window !== 'undefined' && window.BUILTIN_CARTRIDGES) ? window.BUILTIN_CARTRIDGES : null;
    if (builtin && builtin.length > 0) {
      this._renderCartridgeCards(builtin);
      return;
    }

    // 回退：尝试外部 manifest（需静态服务器）
    this.cartridge.loadManifest(this.manifestUrl).then(function (manifest) {
      self.manifest = manifest;
      var list = (manifest && manifest.cartridges) || [];
      if (list.length === 0) { self._showEmptyBrowsing(); return; }
      self._renderCartridgeCards(list);
    }).catch(function () {
      self._showEmptyBrowsing();
    });
  };

  UI.prototype._showEmptyBrowsing = function () {
    var empty = document.createElement('p');
    empty.className = 'browsing-empty';
    empty.textContent = '暂无内置卡带';
    this.el.browsingGrid.appendChild(empty);
  };

  UI.prototype._renderCartridgeCards = function (list) {
    var self = this;
    list.forEach(function (c) {
      var card = document.createElement('button');
      card.className = 'cartridge-card';
      card.type = 'button';
      card.setAttribute('aria-label', '选择卡带：' + (c.name || c.id));
      var cover = document.createElement('span');
      cover.className = 'cartridge-cover';
      if (c.cover) {
        var img = document.createElement('img');
        img.src = c.cover; img.alt = ''; img.className = 'cartridge-cover-img'; img.setAttribute('aria-hidden', 'true');
        cover.appendChild(img);
      } else {
        // 纯 CSS 模拟 NES 卡带（灰壳 + 橙黄标签），标签显示完整游戏名，字号自适应
        var name = (c.name || c.id || '?');
        var tag = document.createElement('span');
        tag.className = 'cartridge-cover-tag';
        tag.textContent = name;
        // 名字越长字号越小，避免溢出标签区
        var size = name.length <= 2 ? 20
                 : name.length <= 4 ? 15
                 : name.length <= 6 ? 12
                 : name.length <= 9 ? 10 : 9;
        tag.style.fontSize = size + 'px';
        cover.appendChild(tag);
      }
      var label = document.createElement('span');
      label.className = 'cartridge-label';
      label.textContent = c.name || c.id;
      card.appendChild(cover); card.appendChild(label);
      card.addEventListener('click', function () { self._loadBuiltin(c); });
      self.el.browsingGrid.appendChild(card);
    });
  };

  // ---- 三种来源 → 统一载入 ----
  UI.prototype._loadFromFile = function (file) {
    var self = this;
    this.cartridge.readFileToBuffer(file).then(function (meta) {
      self._loadFromData(meta, file.name);
    }).catch(function () {
      self._showError(ERRORS.INJECT_FAILED);
      self._enterIdle();
    });
  };

  UI.prototype._loadBuiltin = function (cart) {
    var self = this;
    this._setState(STATES.LOADING);
    this._announce('正在读取卡带：' + (cart.name || cart.id));

    // 内联 ROM（base64）：直接解码，免去 fetch
    if (cart.rom) {
      try {
        var buf = this.cartridge.decodeBase64Rom(cart.rom);
        this._loadFromData({ name: (cart.id || 'cart') + '.nes', buffer: buf, size: buf.length }, cart.name || cart.id);
      } catch (e) {
        this._showError(ERRORS.INJECT_FAILED);
        this._enterIdle();
      }
      return;
    }

    // 外部 manifest 的 ROM：fetch 二进制
    this.cartridge.fetchCartridgeROM(cart.file).then(function (meta) {
      meta.name = cart.file; // 用路径做扩展名校验
      self._loadFromData(meta, cart.name || cart.id);
    }).catch(function () {
      self._showError(ERRORS.INJECT_FAILED);
      self._enterIdle();
    });
  };

  // 前置校验门 + 注入；成功 → 武装就绪等待点击电视开机
  // label 为展示用名称（不影响以 meta.name 做的扩展名校验）
  UI.prototype._loadFromData = function (meta, label) {
    var self = this;
    this._setState(STATES.LOADING);
    this._announce('正在读取卡带…');

    var v = this.cartridge.validateCartridge(meta.name, meta.buffer, meta.size);
    if (!v.ok) { this._showError(v.error); this._enterIdle(); return; }

    var res = this.emulator.loadROM(meta.buffer);
    if (!res.ok) { this._showError(res.error); this._enterIdle(); return; }
    // 记录卡带标识，用于存档归属校验
    this.emulator.setRomId(cartLabel);

    // 成功：武装就绪
    this.ready = true;
    var cartLabel = label || meta.name || '卡带';
    if (this.el.cartridgeName) this.el.cartridgeName.textContent = cartLabel;
    this._setState(STATES.LOADING);
    this._announce('卡带已就绪，点击电视开机');
    this.el.bootHint.hidden = false;
    this.el.tv.classList.add('is-ready');
    this._updateSuborLabel('START', '点击电视开机');
    if (this.el.suborWarning) this.el.suborWarning.textContent = cartLabel;
  };

  // 点击电视开机：用户手势 → 恢复音频 → 开机动画 → Playing
  UI.prototype._powerOn = function () {
    if (!this.ready) return;
    this.ready = false;
    this.el.tv.classList.remove('is-ready');
    this.el.bootHint.hidden = true;

    this.emulator.initAudio();          // 手势内 resume
    this.emulator.playPowerOn();         // 通电嗡（默认开，可静音）
    this._announce('开机中…');

    var self = this;
    this.boot.play(function () {
      self._enterPlaying();
    });
  };

  UI.prototype._enterPlaying = function () {
    this.input.setEnabled(true);
    this.crt.setContentSource(this.emulator.getFrameCanvas());
    this.emulator.start();
    this._setState(STATES.PLAYING);
    // ESC 徽标在游戏中变为退出入口
    this._updateSuborLabel('ESC', '退出游戏');
    // 焦点管理：移开电视、聚焦 body（tabindex=-1），确保键盘不被可聚焦控件拦截
    if (this.el.tv) this.el.tv.blur();
    if (document.body) document.body.focus();
    this._announce('游玩中');
  };

  UI.prototype.exitToIdle = function () {
    this.emulator.stop();
    this.emulator.reset();
    this._enterIdle();
  };

  // ---- 暂停 / 存档 / 读档（游玩中可用）----
  UI.prototype._setPausedUI = function (paused) {
    paused = !!paused;
    document.body.classList.toggle('is-paused', paused);
    if (global.CustomEvent) {
      try { global.dispatchEvent(new CustomEvent('nes-pause', { detail: { paused: paused } })); } catch (e) { /* noop */ }
    }
  };

  UI.prototype.togglePause = function () {
    if (this.state !== STATES.PLAYING) return false;
    var paused = this.emulator.togglePause();
    this._setPausedUI(paused);
    this._announce(paused ? '已暂停' : '继续');
    return paused;
  };

  UI.prototype.save = function (slot) {
    if (this.state !== STATES.PLAYING) return;
    var r = this.emulator.saveState(slot);
    this._announce(r.ok ? ('已存档 ' + slot) : '存档失败');
  };

  UI.prototype.load = function (slot) {
    if (this.state !== STATES.PLAYING) return;
    var r = this.emulator.loadState(slot);
    if (r.ok) { this._setPausedUI(false); this._announce('已读档 ' + slot); }
    else this._announce('槽位 ' + slot + ' 无存档');
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
  } else {
    global.UI = UI;
  }
})(typeof window !== 'undefined' ? window : this);
