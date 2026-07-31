/*
 * input.test.cjs — 验证 input 意图层 → emulator(jsnes) 按键链路的可见性。
 * 复现点：游戏中(input.enabled)焦点停留在 BUTTON 等可聚焦元素上时，键盘被 onInteractive 误拦。
 * 运行：node tests/input.test.cjs
 */
'use strict';

// ---- 最小浏览器环境 mock ----
global.window = global;
global.document = {
  createElement: function () {
    return {
      width: 0, height: 0,
      getContext: function () {
        return { createImageData: function () { return { data: new Uint8ClampedArray(256 * 240 * 4) }; } };
      }
    };
  }
};
global.requestAnimationFrame = function () { return 0; };
global.cancelAnimationFrame = function () {};
global.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
global.AudioContext = function () {
  this.state = 'running';
  this.resume = function () {};
  this.currentTime = 0;
  this.createScriptProcessor = function () { return { connect: function () {}, onaudioprocess: null }; };
  this.createOscillator = function () { return { type: '', frequency: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () { return { connect: function () {} }; }, start: function () {}, stop: function () {} }; };
  this.createGain = function () { return { gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () { return { connect: function () {} }; } }; };
  this.destination = {};
};

// 记录 jsnes 收到的按钮事件
var buttonLog = [];
global.jsnes = {
  NES: function () {
    this.buttonDown = function (p, b) { buttonLog.push(['down', p, b]); };
    this.buttonUp = function (p, b) { buttonLog.push(['up', p, b]); };
    this.loadROM = function () {};
    this.frame = function () {};
    this.reset = function () {};
  }
};

var CONFIG = require('../src/config.js');
global.CONFIG = CONFIG;
var Emulator = require('../src/emulator.js');
var InputLayer = require('../src/input.js');

var failures = 0;
function assert(cond, msg) {
  if (cond) { console.log('  PASS  ' + msg); }
  else { console.log('  FAIL  ' + msg); failures++; }
}

var emu = new Emulator();
var input = new InputLayer({ onChange: function (s) { emu.applyIntent(0, s); } });

// 键盘绑在 window（= global）
var L = {};
global.addEventListener = function (t, f) { (L[t] = L[t] || []).push(f); };
global.removeEventListener = function (t, f) { if (L[t]) L[t] = L[t].filter(function (x) { return x !== f; }); };
input.attachKeyboard(global);

function fire(type, code, tag) {
  var e = { type: type, code: code, repeat: false, preventDefault: function () {}, target: { tagName: tag || 'BODY' } };
  (L[type] || []).forEach(function (fn) { fn(e); });
}
function clearLog() { buttonLog = []; }

// ---- 测试中（enabled=true）：焦点在 BUTTON 上，键盘必须被接管 ----
input.setEnabled(true);

clearLog();
fire('keydown', 'ArrowUp', 'BUTTON');   // 焦点在按钮，游戏中应放行
assert(
  buttonLog.some(function (x) { return x[0] === 'down' && x[1] === 1 && x[2] === CONFIG.INTENT_TO_NES.up; }),
  '游戏中焦点在 BUTTON 上：ArrowUp(up) 仍触发 buttonDown'
);

clearLog();
fire('keydown', 'KeyJ', 'BUTTON');       // A 键
assert(
  buttonLog.some(function (x) { return x[0] === 'down' && x[1] === 1 && x[2] === CONFIG.INTENT_TO_NES.a; }),
  '游戏中焦点在 BUTTON 上：KeyJ(a) 仍触发 buttonDown'
);

clearLog();
fire('keydown', 'ArrowLeft', 'DIV');     // TV 是 div，原本就放行
assert(
  buttonLog.some(function (x) { return x[0] === 'down' && x[1] === 1 && x[2] === CONFIG.INTENT_TO_NES.left; }),
  '游戏中焦点在 DIV(TV) 上：ArrowLeft(left) 触发 buttonDown'
);

clearLog();
fire('keyup', 'ArrowUp', 'BUTTON');      // 松开
assert(
  buttonLog.some(function (x) { return x[0] === 'up' && x[1] === 1 && x[2] === CONFIG.INTENT_TO_NES.up; }),
  '游戏中焦点在 BUTTON 上：ArrowUp 松开触发 buttonUp'
);

// ---- 未激活（enabled=false）：焦点在可交互控件时保护可访问性（不接管）----
input.setEnabled(false);
clearLog();
fire('keydown', 'ArrowUp', 'INPUT');     // 焦点在输入框，不应接管游戏键
assert(
  !buttonLog.some(function (x) { return x[0] === 'down' && x[1] === 0 && x[2] === CONFIG.INTENT_TO_NES.up; }),
  '未激活且焦点在 INPUT 上：不接管游戏键（保护可访问性）'
);

console.log('');
if (failures === 0) { console.log('ALL INPUT LINK TESTS PASSED'); process.exit(0); }
else { console.log(failures + ' INPUT TEST(S) FAILED'); process.exit(1); }
