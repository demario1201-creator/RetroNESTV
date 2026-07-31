/*
 * cartridge.js — 卡带加载与校验
 * 纯校验函数（checkExtension/checkMagic/checkSize/validateCartridge）可在 Node 下被测试。
 * 浏览器专属逻辑（拖拽、文件读取、manifest）仅在被调用时执行，不影响 node 引入。
 */
(function (global) {
  'use strict';

  var CONFIG = (typeof require !== 'undefined') ? require('./config.js') : global.CONFIG;
  var ROM = CONFIG.ROM;
  var ERRORS = CONFIG.ERRORS;

  // ---- 纯校验函数 ----

  // 统一为 Uint8Array（支持 ArrayBuffer 与 Uint8Array 两种输入）
  function normalizeBuffer(buf) {
    if (buf instanceof Uint8Array) return buf;
    if (buf instanceof ArrayBuffer) return new Uint8Array(buf);
    if (buf && buf.buffer instanceof ArrayBuffer) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    return null;
  }

  // (a) 扩展名校验：不区分大小写，必须以 .nes 结尾
  function checkExtension(name) {
    if (!name || typeof name !== 'string') return false;
    var lower = name.toLowerCase();
    return ROM.EXTENSIONS.some(function (ext) { return lower.slice(-ext.length) === ext; });
  }

  // (b) 魔数校验：前 3 字节必须为 N E S（0x4E 0x45 0x53）
  function checkMagic(buffer) {
    var u = normalizeBuffer(buffer);
    if (!u || u.length < ROM.MIN_SIZE) return false;
    for (var i = 0; i < ROM.MAGIC.length; i++) {
      if (u[i] !== ROM.MAGIC[i]) return false;
    }
    return true;
  }

  // (c) 大小校验：> 0 且 <= 8MB
  function checkSize(size) {
    return typeof size === 'number' && size > 0 && size <= ROM.MAX_SIZE;
  }

  // 综合前置校验门：扩展名(a) → 魔数(b) → 大小(c)
  // 返回 { ok:true } 或 { ok:false, error:{ code, message } }
  function validateCartridge(name, buffer, size) {
    if (!checkExtension(name)) return { ok: false, error: ERRORS.NOT_NES };
    if (!checkMagic(buffer)) return { ok: false, error: ERRORS.BAD_MAGIC };
    var byteLen = (typeof size === 'number') ? size : (normalizeBuffer(buffer) ? normalizeBuffer(buffer).length : 0);
    if (!checkSize(byteLen)) return { ok: false, error: ERRORS.TOO_LARGE };
    return { ok: true };
  }

  // 将 base64 字符串解码为 Uint8Array（用于内联 ROM，免去 fetch）
  // 浏览器用 atob；Node 下回退到 Buffer，便于单元测试。
  function decodeBase64Rom(b64) {
    var bin;
    if (typeof atob === 'function') {
      bin = atob(b64);
    } else if (typeof Buffer !== 'undefined') {
      bin = Buffer.from(b64, 'base64').toString('binary');
    } else {
      throw new Error('no base64 decoder available');
    }
    var len = bin.length;
    var u = new Uint8Array(len);
    for (var i = 0; i < len; i++) u[i] = bin.charCodeAt(i) & 0xff;
    return u;
  }

  // ---- 浏览器专属：文件读取 ----

  // 将 File 读为 { name, buffer(Uint8Array), size }
  function readFileToBuffer(file) {
    return file.arrayBuffer().then(function (ab) {
      return { name: file.name, buffer: new Uint8Array(ab), size: file.size };
    });
  }

  // ---- 浏览器专属：manifest ----

  function loadManifest(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('manifest fetch failed: ' + r.status);
      return r.json();
    });
  }

  function getCartridgeById(manifest, id) {
    if (!manifest || !manifest.cartridges) return null;
    for (var i = 0; i < manifest.cartridges.length; i++) {
      if (manifest.cartridges[i].id === id) return manifest.cartridges[i];
    }
    return null;
  }

  // 通过 fetch 拉取内置卡带 ROM 二进制
  function fetchCartridgeROM(fileUrl) {
    return fetch(fileUrl).then(function (r) {
      if (!r.ok) throw new Error('rom fetch failed: ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      return { buffer: new Uint8Array(ab), size: ab.byteLength };
    });
  }

  // ---- 浏览器专属：拖拽（桌面专属）----
  // 在 tvEl 上挂载 dragover/dragleave/drop，drop 成功后回调 onFile(File)
  function attachDragAndDrop(tvEl, onFile) {
    if (!tvEl) return function () {};
    function onDragOver(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      tvEl.classList.add('is-dragover');
      tvEl.setAttribute('aria-dropeffect', 'copy');
    }
    function onDragLeave(e) {
      // 仅在真正离开元素时移除高亮
      if (e.relatedTarget && tvEl.contains(e.relatedTarget)) return;
      tvEl.classList.remove('is-dragover');
      tvEl.removeAttribute('aria-dropeffect');
    }
    function onDrop(e) {
      e.preventDefault();
      tvEl.classList.remove('is-dragover');
      tvEl.removeAttribute('aria-dropeffect');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length > 0) onFile(files[0]);
    }
    tvEl.addEventListener('dragover', onDragOver);
    tvEl.addEventListener('dragleave', onDragLeave);
    tvEl.addEventListener('drop', onDrop);
    // 返回解绑函数
    return function detach() {
      tvEl.removeEventListener('dragover', onDragOver);
      tvEl.removeEventListener('dragleave', onDragLeave);
      tvEl.removeEventListener('drop', onDrop);
    };
  }

  var Cartridge = {
    checkExtension: checkExtension,
    checkMagic: checkMagic,
    checkSize: checkSize,
    validateCartridge: validateCartridge,
    decodeBase64Rom: decodeBase64Rom,
    // 浏览器专属
    readFileToBuffer: readFileToBuffer,
    loadManifest: loadManifest,
    getCartridgeById: getCartridgeById,
    fetchCartridgeROM: fetchCartridgeROM,
    attachDragAndDrop: attachDragAndDrop
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Cartridge;
  } else {
    global.Cartridge = Cartridge;
  }
})(typeof window !== 'undefined' ? window : this);
