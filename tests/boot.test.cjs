/*
 * boot.test.cjs — 回归测试：开机动画 play() 必须支持重复调用。
 * 背景：boot 用一次性标志 _finished 防止重复结束；修复前 play() 不会重置它，
 *       导致 ESC 退出后再次加载游戏时 _finish() 直接 return，onDone（->_enterPlaying）永不触发，
 *       表现为"加载后卡死/无法进入游戏"。见 src/boot.js。
 * 运行：node tests/boot.test.cjs
 */
'use strict';

global.window = global;
var fakeNow = 0;
global.performance = { now: function () { return fakeNow; } };
var rafQueue = [];
global.requestAnimationFrame = function (cb) { rafQueue.push(cb); return rafQueue.length; };
global.cancelAnimationFrame = function () {};

function makeCtx() {
  return {
    fillStyle: '', shadowColor: '', shadowBlur: 0, globalAlpha: 1,
    fillRect: function () {}, save: function () {}, restore: function () {},
    beginPath: function () {}, arc: function () {}, fill: function () {},
    clearRect: function () {}, drawImage: function () {},
    createImageData: function (w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData: function () {}
  };
}
global.document = {
  createElement: function () { return { width: 0, height: 0, getContext: function () { return makeCtx(); } }; },
  addEventListener: function () {}, removeEventListener: function () {}
};

var Boot = require('../src/boot.js');

var failures = 0;
function assert(cond, msg) { if (cond) console.log('  PASS  ' + msg); else { console.log('  FAIL  ' + msg); failures++; } }

function flushBoot() {
  var guard = 0;
  while (rafQueue.length && guard < 500) {
    var cbs = rafQueue; rafQueue = [];
    fakeNow += 2000;
    cbs.forEach(function (cb) { cb(fakeNow); });
    guard++;
  }
}

// 连续播放 N 次，每次都应触发 onDone
function playManyTimes(n, reduced) {
  var calls = 0;
  var boot = new Boot({ crt: { setContentSource: function () {} }, reducedMotion: reduced });
  for (var i = 0; i < n; i++) {
    fakeNow = 0;
    boot.play(function () { calls++; });
    flushBoot();
  }
  return calls;
}

console.log('== 连续两次播放（正常模式）==');
var normal = playManyTimes(2, false);
assert(normal === 2, '两次 play() 都触发 onDone（normal=' + normal + '）');

console.log('== 连续三次播放（正常模式）==');
var normal3 = playManyTimes(3, false);
assert(normal3 === 3, '三次 play() 都触发 onDone（normal3=' + normal3 + '）');

console.log('== 连续两次播放（reduced-motion 模式）==');
var reduced = playManyTimes(2, true);
assert(reduced === 2, 'reduced-motion 下两次 play() 都触发 onDone（reduced=' + reduced + '）');

if (failures === 0) { console.log('\nALL BOOT TESTS PASSED'); process.exit(0); }
else { console.log('\n' + failures + ' BOOT TEST(S) FAILED'); process.exit(1); }
