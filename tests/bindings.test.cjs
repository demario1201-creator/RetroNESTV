/*
 * bindings.test.cjs — 验证 input 按键自定义 API（设置面板依赖）。
 * 运行：node tests/bindings.test.cjs
 */
'use strict';

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

var CONFIG = require('../src/config.js');
var InputLayer = require('../src/input.js');

var failures = 0;
function assert(cond, msg) { if (cond) console.log('  PASS  ' + msg); else { console.log('  FAIL  ' + msg); failures++; } }

var layer = new InputLayer({ onChange: function () {} });

// 默认映射：ArrowUp -> up
assert(layer._codeMap['ArrowUp'] === 'up', '默认映射 ArrowUp -> up');
assert(layer._codeMap['KeyJ'] === 'a', '默认映射 KeyJ -> a');
assert(layer._turboMap['KeyU'] === 'a', '默认连发 KeyU -> a(连发)');

// 重映射 up 到 KeyP
layer.setIntentBinding('up', 'KeyP');
assert(layer._codeMap['KeyP'] === 'up', 'setIntentBinding: KeyP -> up');
assert(layer._codeMap['ArrowUp'] === undefined, 'setIntentBinding: 旧码 ArrowUp 已失效');
assert(layer.getBindings().filter(function (b) { return b.intent === 'up'; })[0].codes.join() === 'KeyP', 'getBindings: up 仅含 KeyP');

// 冲突清除：把 left 也设为 KeyP，应清除 up 的 KeyP
layer.setIntentBinding('left', 'KeyP');
assert(layer._codeMap['KeyP'] === 'left', '冲突：KeyP 现在归 left');
assert(layer._codeMap['ArrowUp'] === undefined && layer.getBindings().filter(function (b) { return b.intent === 'up'; })[0].codes.length === 0, '冲突：up 的 KeyP 被清除');

// 连发重映射
layer.setTurboBinding('b', 'KeyO');
assert(layer._turboMap['KeyO'] === 'b', 'setTurboBinding: KeyO -> b(连发)');

// 恢复默认
layer.resetBindings();
assert(layer._codeMap['ArrowUp'] === 'up', 'resetBindings: ArrowUp 恢复 -> up');
assert(layer._turboMap['KeyU'] === 'a' && layer._turboMap['KeyI'] === 'b', 'resetBindings: 连发恢复 U/I');

// applyBindings 整体恢复
layer.applyBindings([{ intent: 'a', codes: ['KeyM'] }], [{ intent: 'a', codes: ['KeyN'] }]);
assert(layer._codeMap['KeyM'] === 'a', 'applyBindings: 自定义 a -> KeyM');
assert(layer._turboMap['KeyN'] === 'a', 'applyBindings: 自定义连发 a -> KeyN');

console.log('');
if (failures === 0) { console.log('ALL BINDINGS TESTS PASSED'); process.exit(0); }
else { console.log(failures + ' BINDINGS TEST(S) FAILED'); process.exit(1); }
