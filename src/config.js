/*
 * config.js — 全局常量与可调参数（单一事实来源）
 * 设计对齐：
 *   - jsnes iNES 魔数            design/ux/flow.md §5.2 / concept.md §2.1
 *   - 键盘映射                  design/ux/flow.md §3
 *   - CRT 三档强度              design/art-bible/art-bible.md §5.2
 *   - 开机分镜 F0–F4 时间窗      design/art-bible/art-bible.md §7
 *   - 配色令牌                  design/art-bible/art-bible.md 附录 A
 * 该文件为纯数据，可被 Node 直接 require（用于 cartridge 纯逻辑测试）。
 */
(function (global) {
  'use strict';

  // ---- ROM / 卡带校验 ----
  // iNES 魔数："NES" + 0x1A。前 3 字节固定为 0x4E 0x45 0x53（N E S）。
  var ROM = {
    // 文件扩展名白名单（不区分大小写）
    EXTENSIONS: ['.nes'],
    // iNES 头部前 3 字节：N E S
    MAGIC: [0x4E, 0x45, 0x53],
    // 完整魔数字符串（"NES\x1a"），用于测试与可读提示
    MAGIC_STRING: 'NES\x1a',
    // 文件大小上限：8MB（concept.md §6 待确认 + flow.md §1.3 建议）
    MAX_SIZE: 8 * 1024 * 1024,
    // 前置门至少需要的最小字节数（至少能放下魔数）
    MIN_SIZE: 4
  };

  // ---- 输入意图层：键盘映射（flow.md §3）----
  // 可自定义：每个意图对应一组 event.code（布局无关）。
  // 这些默认值同时作为「恢复默认按键」的基准；运行时玩家修改后会覆盖。
  var KEY_BINDINGS = [
    { intent: 'up',    codes: ['ArrowUp', 'KeyW'] },
    { intent: 'down',  codes: ['ArrowDown', 'KeyS'] },
    { intent: 'left',  codes: ['ArrowLeft', 'KeyA'] },
    { intent: 'right', codes: ['ArrowRight', 'KeyD'] },
    { intent: 'a',     codes: ['KeyJ', 'KeyZ'] },
    { intent: 'b',     codes: ['KeyK', 'KeyX'] },
    { intent: 'start', codes: ['Enter'] },
    { intent: 'select',codes: ['ShiftLeft', 'ShiftRight', 'Backquote', 'Backspace'] }
  ];

  // 连发键（按住即对该意图高频通断），独立于普通按键映射，同样可自定义。
  var TURBO_BINDINGS = [
    { intent: 'a', codes: ['KeyU'] }, // 连发 A
    { intent: 'b', codes: ['KeyI'] }  // 连发 B
  ];

  // 旧式单层映射（保留作回退/调试；input.js 实际以 KEY_BINDINGS 构建反向表）
  var KEY_MAP = {
    'ArrowUp': 'up', 'KeyW': 'up',
    'ArrowDown': 'down', 'KeyS': 'down',
    'ArrowLeft': 'left', 'KeyA': 'left',
    'ArrowRight': 'right', 'KeyD': 'right',
    'KeyJ': 'a', 'KeyZ': 'a',
    'KeyK': 'b', 'KeyX': 'b',
    'Enter': 'start',
    'ShiftLeft': 'select', 'ShiftRight': 'select', 'Backquote': 'select', 'Backspace': 'select'
  };

  // 意图 -> jsnes 按钮索引（jsnes buttonMap 约定）
  // A=0 B=1 SELECT=2 START=3 UP=4 DOWN=5 LEFT=6 RIGHT=7
  var INTENT_TO_NES = {
    a: 0, b: 1, select: 2, start: 3,
    up: 4, down: 5, left: 6, right: 7
  };

  var INTENTS = ['up', 'down', 'left', 'right', 'a', 'b', 'start', 'select'];

  // ---- CRT 三档强度（art-bible §5.2）----
  // 单位：distortionK(曲率) / scanline(暗线不透明度) / grille(孔栅不透明度)
  //       bloom(泛光强度) / vignette(暗角强度) / aberration(色散 px)
  //       noise(噪点不透明度) / roll(滚屏周期秒, 0=关)
  var CRT = {
    tiers: {
      low: {
        label: '低（省电/移动端）',
        distortionK: 0.06, scanline: 0.18, grille: 0.0,
        bloom: 0.30, vignette: 0.35, aberration: 1,
        noise: 0.0, roll: 0, flicker: false
      },
      mid: {
        label: '中（默认）',
        distortionK: 0.10, scanline: 0.25, grille: 0.15,
        bloom: 0.45, vignette: 0.45, aberration: 2,
        noise: 0.06, roll: 8, flicker: true
      },
      high: {
        label: '高（桌面旗舰）',
        distortionK: 0.15, scanline: 0.32, grille: 0.22,
        bloom: 0.55, vignette: 0.55, aberration: 3,
        noise: 0.08, roll: 7, flicker: true
      }
    },
    defaultTier: 'mid',
    // reduced-motion 强制锁定的静态低档
    reducedMotionTier: 'low',
    // 通用参数区间（供滑块映射参考，art-bible §5.1）
    ranges: {
      distortionK: [0.06, 0.16],
      scanline: [0.15, 0.35],
      grille: [0.0, 0.25],
      bloom: [0.30, 0.60],
      vignette: [0.30, 0.60],
      aberration: [1, 3],
      noise: [0.0, 0.10]
    }
  };

  // ---- 开机动画分镜 F0–F4（art-bible §7，总时长 1200–1500ms）----
  // 时间单位 ms，相对动画启动时刻。reduced-motion 跳过 F0–F3 直达 F4。
  var BOOT = {
    total: 1500,
    f0: [0, 150],     // 断电待机：纯黑 + 极淡噪点
    f1: [150, 350],   // 中心白点：r 6px → 14px
    f2: [350, 650],   // 横向亮线：scaleX 0→1.08→1
    f3: [650, 1100],  // 纵向展开 + 滚屏亮带
    f4: [1100, 1500], // 稳定：各叠加 opacity 0→目标，闪烁收敛
    // 减弱动效时 F4 的淡入时长（<200ms，art-bible §7）
    reducedFadeMs: 180
  };

  // ---- 状态机状态集合（flow.md §1）----
  var STATES = {
    IDLE: 'idle',
    BROWSING: 'browsing',
    LOADING: 'loading',
    PLAYING: 'playing'
  };

  // ---- 加载错误码（flow.md §1.3 a–d）----
  var ERRORS = {
    NOT_NES: { code: 'a', message: '这不是 .nes 卡带文件' },
    BAD_MAGIC: { code: 'b', message: '卡带数据损坏或格式不支持' },
    TOO_LARGE: { code: 'c', message: '卡带文件过大（上限 8MB）' },
    INJECT_FAILED: { code: 'd', message: '卡带读取失败，请重试' }
  };

  // ---- 配色令牌（art-bible 附录 A，CSS 变量同名；此处供 JS 侧引用/校验）----
  var COLORS = {
    shellLight: '#E4D6B8', shellDark: '#C7B188', shellEdge: '#8A6E45',
    shellHi: '#F7EFDC', grille: '#9C8763',
    screenWarm: '#F3E9C8', phosphorGreen: '#7CF2A0', scanline: '#0A0A0A', edgeDark: '#1A1206',
    bg: '#1C1813', bgWall: '#2E2519',
    accent: '#E8541E', accent2: '#36C5D6', ok: '#5FD17A', warn: '#D83A2E', focus: '#FFD23F'
  };

  // ---- 音频（开机"通电嗡"短音，任务待定项，默认开，提供静音开关）----
  var AUDIO = {
    powerOnEnabled: true, // 用户待定项；默认开启，UI 提供静音开关
    powerOnDurationMs: 220,
    powerOnFreqStart: 60,  // 低频通电嗡
    powerOnFreqEnd: 120
  };

  // ---- 虚拟按键连发（turbo）：按住连发键即对该意图高频通断 ----
  var TURBO = {
    intervalMs: 55 // 通断周期（半周期），约 9 次/秒有效连发
  };

  // 键盘连发键（旧式单层回退；实际以 TURBO_BINDINGS 为准）
  var TURBO_KEYS = {
    'KeyU': 'a', // 连发 A
    'KeyI': 'b'  // 连发 B
  };

  // ---- 用户默认设置（设置面板持久化前的初始值）----
  var DEFAULTS = {
    volume: 0.8,        // 音量 0~1
    crtTier: 'mid',      // low / mid / high
    snowMode: 'green',  // 'green' 黑绿雪花 / 'white' 经典黑白雪花
    clarity: 70         // 清晰度 0~100：越高色散重影/辉光越收敛、画面越锐利（默认已适度提升清晰度，缓解默认重影）
  };

  var CONFIG = {
    ROM: ROM,
    KEY_MAP: KEY_MAP,
    INTENT_TO_NES: INTENT_TO_NES,
    INTENTS: INTENTS,
    CRT: CRT,
    BOOT: BOOT,
    STATES: STATES,
    ERRORS: ERRORS,
    COLORS: COLORS,
    AUDIO: AUDIO,
    TURBO: TURBO,
    TURBO_KEYS: TURBO_KEYS,
    KEY_BINDINGS: KEY_BINDINGS,
    TURBO_BINDINGS: TURBO_BINDINGS,
    DEFAULTS: DEFAULTS,
    // 原生 NES 分辨率（jsnes frame 输出）
    NES_WIDTH: 256,
    NES_HEIGHT: 240,
    STORAGE_PREFIX: 'nescrt.'
  };

  // 浏览器与 Node 双导出
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  } else {
    global.CONFIG = CONFIG;
  }
})(typeof window !== 'undefined' ? window : this);
