/*
 * tests/validate.test.cjs — node 可跑的卡带校验纯逻辑测试
 * 用法：node tests/validate.test.cjs
 * 覆盖：合法 .nes 通过 / 非 .nes 扩展名拒绝 / 非 NES 魔数拒绝 / 超大拒绝
 */
'use strict';

var path = require('path');
var cartridge = require(path.join(__dirname, '..', 'src', 'cartridge.js'));
var CONFIG = require(path.join(__dirname, '..', 'src', 'config.js'));

var passed = 0;
var failed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  \u2713 ' + msg); }
  else { failed++; console.log('  \u2717 ' + msg); }
}

function nesBuffer() {
  // 构造最小 iNES 头 + 少量填充
  var buf = new Uint8Array(16);
  buf[0] = 0x4E; buf[1] = 0x45; buf[2] = 0x53; buf[3] = 0x1A; // "NES\x1a"
  return buf;
}

console.log('cartridge.validateCartridge:');

// 1) 合法 .nes（魔数 NES\x1a）通过
(function () {
  var buf = nesBuffer();
  var r = cartridge.validateCartridge('game.nes', buf, buf.length);
  ok(r.ok === true, '合法 .nes（魔数 NES\\x1a）通过');
})();

// 1b) 大写扩展名 .NES 也应通过
(function () {
  var buf = nesBuffer();
  var r = cartridge.validateCartridge('GAME.NES', buf, buf.length);
  ok(r.ok === true, '大写扩展名 .NES 通过');
})();

// 2) 非 .nes 扩展名拒绝（错误码 a）
(function () {
  var buf = nesBuffer();
  var r = cartridge.validateCartridge('game.txt', buf, buf.length);
  ok(r.ok === false && r.error && r.error.code === 'a', '非 .nes 扩展名被拒绝（a）');
})();

// 3) 非 NES 魔数拒绝（错误码 b）
(function () {
  var buf = new Uint8Array(16); // 全 0，魔数不符
  var r = cartridge.validateCartridge('game.nes', buf, buf.length);
  ok(r.ok === false && r.error && r.error.code === 'b', '非 NES 魔数被拒绝（b）');
})();

// 3b) 魔数前 3 字节非 N E S 拒绝（即便第 4 字节是 0x1A）
(function () {
  var buf = new Uint8Array([0x00, 0x45, 0x53, 0x1A]);
  var r = cartridge.validateCartridge('game.nes', buf, buf.length);
  ok(r.ok === false && r.error && r.error.code === 'b', '魔数首字节错误被拒绝（b）');
})();

// 4) 超大文件拒绝（错误码 c，>8MB）
(function () {
  var buf = nesBuffer();
  var bigSize = CONFIG.ROM.MAX_SIZE + 1;
  var r = cartridge.validateCartridge('big.nes', buf, bigSize);
  ok(r.ok === false && r.error && r.error.code === 'c', '超大文件被拒绝（c，>' + (CONFIG.ROM.MAX_SIZE / 1048576) + 'MB）');
})();

// 4b) 恰好等于上限应通过大小校验（仍需魔数，这里魔数对）
(function () {
  var buf = nesBuffer();
  var r = cartridge.validateCartridge('max.nes', buf, CONFIG.ROM.MAX_SIZE);
  ok(r.ok === true, '恰等于 8MB 上限通过大小校验');
})();

// 5) 纯函数独立验证
console.log('cartridge.check* 纯函数:');
ok(cartridge.checkExtension('a.nes') === true, 'checkExtension("a.nes") === true');
ok(cartridge.checkExtension('a.NES') === true, 'checkExtension("a.NES") === true');
ok(cartridge.checkExtension('a.txt') === false, 'checkExtension("a.txt") === false');
ok(cartridge.checkExtension('') === false, 'checkExtension("") === false');
ok(cartridge.checkMagic(nesBuffer()) === true, 'checkMagic(合法) === true');
ok(cartridge.checkMagic(new Uint8Array([0, 0, 0])) === false, 'checkMagic(非NES) === false');
ok(cartridge.checkSize(1024) === true, 'checkSize(1024) === true');
ok(cartridge.checkSize(CONFIG.ROM.MAX_SIZE + 1) === false, 'checkSize(>8MB) === false');
ok(cartridge.checkSize(0) === false, 'checkSize(0) === false');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
if (failed > 0) process.exit(1);
console.log('全部通过 ✓');
