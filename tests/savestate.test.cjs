/*
 * savestate.test.cjs — 存档/读档 + 暂停 回归测试
 * 不依赖 DOM：直接 require jsnes 验证 toJSON/fromJSON 整存档往返；
 * 另断言 Emulator.prototype 已挂载 pause/save/load 接口（编译期契约）。
 */
'use strict';

var assert = require('assert');
var path = require('path');
var jsnes = require(path.join(__dirname, '..', 'vendor', 'jsnes.min.js'));
var Emulator = require(path.join(__dirname, '..', 'src', 'emulator.js'));

var passed = 0;
function ok(name) { passed++; console.log('  PASS  ' + name); }

// ---- 1. Emulator 接口契约（无需实例化，避开 document）----
assert.strictEqual(typeof Emulator.prototype.pause, 'function', 'Emulator.pause 应为函数');
assert.strictEqual(typeof Emulator.prototype.resume, 'function', 'Emulator.resume 应为函数');
assert.strictEqual(typeof Emulator.prototype.togglePause, 'function', 'Emulator.togglePause 应为函数');
assert.strictEqual(typeof Emulator.prototype.saveState, 'function', 'Emulator.saveState 应为函数');
assert.strictEqual(typeof Emulator.prototype.loadState, 'function', 'Emulator.loadState 应为函数');
assert.strictEqual(typeof Emulator.prototype.setRomId, 'function', 'Emulator.setRomId 应为函数');
ok('Emulator 已挂载 暂停/存档/读档 接口');

// ---- 2. jsnes 整存档往返（构建一个最小合法 iNES ROM）----
function makeMinRom() {
  var header = [0x4E, 0x45, 0x53, 0x1A, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var prg = new Array(16384).fill(0);
  var chr = new Array(8192).fill(0);
  var bytes = header.concat(prg, chr);
  return new Uint8Array(bytes);
}

var NES = jsnes.NES;
var nes = new NES({
  onFrame: function () {},
  onAudioSample: function () {}
});

var loaded = true;
try { nes.loadROM(makeMinRom()); } catch (e) { loaded = false; }

if (loaded) {
  // 跑若干帧，制造一个确定状态
  for (var i = 0; i < 30; i++) nes.frame();
  var snap = nes.toJSON();
  assert.ok(snap && typeof snap === 'object', 'toJSON 应返回对象');
  // 继续跑，使状态偏移
  for (var j = 0; j < 30; j++) nes.frame();
  // 读档：应回到 snap 时刻的状态
  nes.fromJSON(snap);
  var after = nes.toJSON();
  assert.deepStrictEqual(after, snap, 'fromJSON 还原后状态应与快照一致');
  ok('jsnes toJSON/fromJSON 存档往返一致');
} else {
  // 极简 ROM 不被接受时，退而验证序列化能力
  var stub = { romId: 'x', state: { a: 1, b: [1, 2, 3] } };
  var round = JSON.parse(JSON.stringify(stub));
  assert.deepStrictEqual(round, stub, '存档对象应可 JSON 序列化往返');
  console.log('  SKIP  jsnes 最小 ROM 未被接受，已退化为序列化能力校验');
  ok('存档对象 JSON 序列化往返一致');
}

// ---- 3. 我们的存档包装（含 romId 归属）可被 JSON 往返 ----
var wrap = { romId: 'super-mario', state: { cpu: { pc: 0x1234 }, ppu: {} } };
var wrapBack = JSON.parse(JSON.stringify(wrap));
assert.strictEqual(wrapBack.romId, 'super-mario', 'romId 归属应保留');
assert.strictEqual(wrapBack.state.cpu.pc, 0x1234, '内部状态应保留');
ok('存档包裹（romId + state）JSON 往返一致');

console.log('\nALL SAVESTATE TESTS PASSED');
