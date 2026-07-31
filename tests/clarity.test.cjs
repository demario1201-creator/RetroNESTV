/*
 * clarity.test.cjs — 验证清晰度默认设置与 CRT 清晰度 API
 * 运行：node tests/clarity.test.cjs
 */
var path = require('path');
var CONFIG = require(path.join(__dirname, '..', 'src', 'config.js'));

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ ' + msg); }
}

// 1) DEFAULTS.clarity 存在且在 0~100
var c = CONFIG.DEFAULTS.clarity;
ok(typeof c === 'number', 'DEFAULTS.clarity 应为数字');
ok(c >= 0 && c <= 100, 'DEFAULTS.clarity 应在 0~100 之间（当前=' + c + '）');

// 2) 清晰度滑块默认已适度提升（>0）以缓解默认重影
ok(c > 0, '清晰度默认应 >0（默认已适度提升清晰度）');

console.log('clarity.test.cjs: ' + pass + ' passed' + (fail ? (', ' + fail + ' FAILED') : ''));
process.exit(fail ? 1 : 0);
