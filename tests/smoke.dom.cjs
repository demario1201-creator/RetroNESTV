/*
 * tests/smoke.dom.cjs — 轻量 DOM 桩，在 Node 的 vm 沙箱里真实执行浏览器脚本
 * 目的：捕捉 node --check 抓不到的运行时引用错误（构造期 / 初始 Idle / 错误路径 / 档位切换）。
 * 强制 WebGL 不可用 → 走 CSS 降级路径；rAF 限量回调避免死循环。
 * 注：不验证真实像素 / CRT / 可玩性（需真实浏览器）。
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('  \u2713 ' + m); } else { failed++; console.log('  \u2717 ' + m); } }

// ---- 2D 上下文桩 ----
function make2D() {
  var ctx = {
    fillStyle: '', strokeStyle: '', shadowColor: '', shadowBlur: 0, globalAlpha: 1,
    clearRect: function () {}, fillRect: function () {}, strokeRect: function () {},
    drawImage: function () {}, beginPath: function () {}, closePath: function () {},
    moveTo: function () {}, lineTo: function () {}, arc: function () {}, fill: function () {},
    stroke: function () {}, save: function () {}, restore: function () {},
    translate: function () {}, scale: function () {},
    putImageData: function () {}, getImageData: function (x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
  };
  return ctx;
}

function makeEl(tag) {
  var listeners = {};
  var el = {
    tagName: (tag || 'div').toUpperCase(),
    width: 256, height: 240, clientWidth: 256, clientHeight: 240,
    hidden: false, textContent: '', innerHTML: '',
    style: { setProperty: function () {}, getPropertyValue: function () { return ''; } },
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    setAttribute: function () {}, removeAttribute: function () {},
    appendChild: function () {}, focus: function () {}, click: function () {},
    addEventListener: function (t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    removeEventListener: function () {},
    querySelectorAll: function () { return []; },
    getContext: function (type) { return (type && type.indexOf('webgl') >= 0) ? null : make2D(); }
  };
  return el;
}

var elCache = {};
var documentStub = {
  readyState: 'complete',
  body: makeEl('body'),
  getElementById: function (id) { return elCache[id] || (elCache[id] = makeEl('div')); },
  createElement: function (tag) { return makeEl(tag); },
  querySelectorAll: function () { return []; },
  addEventListener: function () {}
};

// rAF 限量：最多回调 4 次后停，避免死循环
var rafCount = 0;
function raf(cb) { if (rafCount++ < 4) setImmediate(function () { cb(performanceNow()); }); return rafCount; }
function performanceNow() { return Date.now(); }

var sandbox = {};
sandbox.window = sandbox;
sandbox.document = documentStub;
sandbox.console = console;
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.requestAnimationFrame = raf;
sandbox.cancelAnimationFrame = function () {};
sandbox.performance = { now: performanceNow };
sandbox.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
sandbox.devicePixelRatio = 1;
sandbox.addEventListener = function () {};
sandbox.AudioContext = undefined;
sandbox.webkitAudioContext = undefined;

vm.createContext(sandbox);

function loadScript(rel) {
  var code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
}

try {
  console.log('smoke: load vendor + src in browser mode');
  loadScript('vendor/jsnes.min.js');
  ok(typeof sandbox.jsnes === 'object' && typeof sandbox.jsnes.NES === 'function', 'jsnes (含 NES) 已装入沙箱');
  loadScript('src/config.js');
  loadScript('src/cartridge.js');
  loadScript('src/emulator.js');
  loadScript('src/crt.js');
  loadScript('src/input.js');
  loadScript('src/boot.js');
  loadScript('src/ui.js');
  loadScript('src/main.js'); // readyState=complete → 立即执行 boot()

  ok(typeof sandbox.__NESCRT__ === 'object', 'main.js 装配完成，__NESCRT__ 存在');
  var app = sandbox.__NESCRT__;
  ok(app && app.ui && app.emulator && app.crt && app.input && app.boot, '各模块实例均已创建');
  ok(app.ui.state === 'idle', '初始状态为 idle');
  ok(app.crt.mode === 'css', 'WebGL 不可用时降级为 css 档');

  console.log('smoke: 错误路径（非 .nes）');
  app.ui._loadFromData({ name: 'bad.txt', buffer: new Uint8Array([1, 2, 3]), size: 3 });
  ok(app.ui.state === 'idle', '非法文件后回到 idle（不崩溃）');

  console.log('smoke: 档位 / reduced-motion / boot 不抛错');
  app.crt.setTier('high');
  app.crt.setReducedMotion(true);
  app.crt.setReducedMotion(false);
  app.boot.play(function () {});
  ok(true, 'boot.play 执行未抛异常');

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  if (failed > 0) process.exit(1);
  console.log('smoke 通过 ✓');
} catch (e) {
  console.error('\n\u2717 运行时异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
}
