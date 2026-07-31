/*
 * jsnes_integration.test.cjs — 用真实 jsnes 验证「按键无效果」根因是否修复。
 * 根因：jsnes buttonDown/buttonUp 玩家索引为 1-based，传 0 会让内部 controllers[0-1] 越界抛错，
 *       导致每次按键被吞，游戏画面在动但所有按键失效。
 * 运行：node tests/jsnes_integration.test.cjs
 */
'use strict';

var path = require('path');
var fs = require('fs');
var ROOT = path.join(__dirname, '..');

// ---- 浏览器环境 mock（jsnes 不需 canvas；emulator 构造要 createElement('canvas')）----
global.window = global;
global.document = {
  createElement: function () {
    return {
      width: 0, height: 0,
      getContext: function () {
        return {
          createImageData: function () { return { data: new Uint8ClampedArray(256 * 240 * 4) }; },
          putImageData: function () {}
        };
      }
    };
  }
};
// 同步可控的 rAF：跑有限帧，避免无线递归
var frames = 0;
global.requestAnimationFrame = function (cb) { if (frames++ < 6) cb(frames * 20); return frames; };
global.cancelAnimationFrame = function () {};
global.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
global.AudioContext = function () {
  this.state = 'running'; this.resume = function () {}; this.currentTime = 0;
  this.createScriptProcessor = function () { return { connect: function () {}, onaudioprocess: null }; };
  this.createOscillator = function () { return { type: '', frequency: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () { return { connect: function () {} }; }, start: function () {}, stop: function () {} }; };
  this.createGain = function () { return { gain: { setValueAtTime: function () {}, exponentialRampToValueAtTime: function () {} }, connect: function () { return { connect: function () {} }; } }; };
  this.destination = {};
};

// 真实 jsnes
global.jsnes = require(path.join(ROOT, 'vendor', 'jsnes.min.js'));
var CONFIG = require(path.join(ROOT, 'src', 'config.js'));
global.CONFIG = CONFIG;
var Emulator = require(path.join(ROOT, 'src', 'emulator.js'));

var failures = 0;
function assert(cond, msg) { if (cond) console.log('  PASS  ' + msg); else { console.log('  FAIL  ' + msg); failures++; } }

// ---- 根因复现：player=0 抛错，player=1/2 正常 ----
var rawNes = new global.jsnes.NES({ onFrame: function () {}, onAudioSample: function () {} });
var rom = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets', 'roms', 'super-mario.nes')));
rawNes.loadROM(rom);
var err0 = null;
try { rawNes.buttonDown(0, CONFIG.INTENT_TO_NES.right); } catch (e) { err0 = e; }
assert(err0 !== null, '记录根因：buttonDown(玩家0) 抛错 -> ' + (err0 ? err0.message : ''));
var err1 = null;
try { rawNes.buttonDown(1, CONFIG.INTENT_TO_NES.right); } catch (e) { err1 = e; }
assert(err1 === null, 'buttonDown(玩家1) 正常不抛错');

// ---- 端到端：真实 emulator + 真实 jsnes，applyIntent(0,...) 不应抛错 ----
var emu = new Emulator();
var loadRes = emu.loadROM(rom);
assert(loadRes.ok, 'emulator.loadROM 成功');

var threw = null;
try {
  emu.applyIntent(0, { up: true, left: true, a: true, start: true, select: true });
  emu.applyIntent(0, { up: false, left: false, a: false, start: false, select: false });
} catch (e) { threw = e; }
assert(threw === null, 'emulator.applyIntent(0, 全键) 不抛错（修复前会抛 controllers[-1]）' + (threw ? ' -> ' + threw.message : ''));

// 跑几帧确认主循环 + 真实 jsnes 协同无异常
var frameErr = null;
try { emu.start(); } catch (e) { frameErr = e; }
assert(frameErr === null, 'emulator.start() + 真实 jsnes.frame() 运行无异常' + (frameErr ? ' -> ' + frameErr.message : ''));
emu.stop();

console.log('');
if (failures === 0) { console.log('ALL JSNES INTEGRATION TESTS PASSED'); process.exit(0); }
else { console.log(failures + ' JSNES INTEGRATION TEST(S) FAILED'); process.exit(1); }
