# 架构文档 · 网页版 NES 模拟器（CRT 复古游玩台）

> 作者：engineering-lead（程基岩）
> 配套：design/gdd/concept.md · design/ux/flow.md · design/art-bible/art-bible.md
> 决策基线：纯前端 Vanilla JS + Canvas，无框架、无构建步骤；模拟核心 jsnes；CRT 双档栈（WebGL 高保真 + CSS 基线兜底）；评审强度 lean。

---

## 1. 总览

一台"长在网页里的旧电视 + 小霸王机身"。把 `.nes` 卡带（内置 / 上传 / 拖拽）插入，点击电视开机，进入 jsnes 仿真 + CRT 后处理的游玩闭环。所有逻辑在浏览器内完成，无后端。

**三层结构**

```
┌──────────────────────── 表现层 (DOM / CSS) ────────────────────────┐
│  index.html · styles/main.css（电视外壳 / 机身 / 卡带面板 / 虚拟按键）│
└───────────────────────────────────────────────────────────────────┘
            ▲ 状态/意图/内容源                 │ 帧/音频回流
┌──────────────────────── 编排层 (ui.js / main.js) ──────────────────┐
│  状态机 Idle→Browsing→Loading→Playing · 三来源汇聚 · 错误码 a–d      │
└───────────────────────────────────────────────────────────────────┘
       │                  │                    │
┌──────┴─────┐   ┌────────┴────────┐   ┌───────┴────────┐
│ emulator.js│   │     crt.js       │   │   input.js     │
│ (jsnes 封装)│   │ (双档 CRT 管线)  │   │ (八路意图层)    │
└──────┬─────┘   └────────┬────────┘   └───────┬────────┘
       │ frame(Uint32)    │ 内容源 canvas       │ 布尔意图
       ▼                  ▼                    ▼
  离屏 2D canvas ──▶ WebGL/canvas ──▶ 可见 #screen      emulator.setButton
       ▲                  ▲
       │                  │
   cartridge.js (校验门) · config.js (常量单一来源) · boot.js (F0–F4 开机瞬态)

vendor/jsnes.min.js（UMD，本地 vendor，离线可用）
```

---

## 2. 模块划分

| 文件 | 职责 | 关键接口 |
|---|---|---|
| `src/config.js` | 全局常量单一来源（魔数/键位/CRT 三档/开机分镜/配色令牌/错误码）。纯数据，可被 node require。 | `CONFIG`（window.CONFIG / module.exports） |
| `src/cartridge.js` | 卡带校验门 + 文件读取 + manifest + 拖拽。纯校验函数 `checkExtension/checkMagic/checkSize/validateCartridge` 可 node 测试。 | `validateCartridge(name,buf,size)`、`readFileToBuffer`、`loadManifest`、`attachDragAndDrop` |
| `src/emulator.js` | jsnes 封装：`new NES()`、`loadROM(Uint8Array)`、`onFrame`→离屏 2D canvas、`onAudioSample`→Web Audio 队列、`requestAnimationFrame` 主循环（60fps 累加器）。 | `Emulator`、`loadROM`、`applyIntent`、`start/stop`、`initAudio`、`playPowerOn`、`setMuted` |
| `src/crt.js` | CRT 后处理**双档栈**：WebGL 单 pass 着色器（桶形/扫描线/辉光/色散/暗角/噪点/滚屏）；WebGL 失败自动降级 CSS 叠层。强度三档 + reduced-motion 锁定低档静态。 | `CRT`、`setContentSource`、`setTier`、`setReducedMotion`、`isWebGL` |
| `src/input.js` | 八路意图层（up/down/left/right/A/B/Start/Select）。键盘（flow§3）与移动端虚拟按键（flow§4）都向同一组布尔输出；pointer 多点触控；触摸 `touch-action:none`。 | `InputLayer`、`set`、`attachKeyboard`、`attachVirtualPad`、`onChange` |
| `src/ui.js` | 状态机 Idle→Browsing→Loading→Playing；三来源汇入 Loading 前置校验门；人话错误提示；`aria-live` 播报。 | `UI`、`_enterIdle/_enterBrowsing/_loadFromData/_powerOn/_enterPlaying/exitToIdle` |
| `src/boot.js` | 开机动画 F0–F4（art-bible §7，≈1500ms）；点击/任意键快进；复用 CRT 管线；reduced-motion 跳 F0–F3。 | `Boot`、`play(onDone)`、`setReducedMotion` |
| `src/main.js` | `DOMContentLoaded` 后装配全部模块、监听 reduced-motion 变化、暴露 `window.__NESCRT__`。 | — |
| `index.html` + `styles/main.css` | 结构与样式：电视外壳 / 小霸王机身 / 卡带面板 / 响应式 / 可访问性 + CSS 基线 CRT 叠层。 | — |
| `vendor/jsnes.min.js` | jsnes UMD（本地 vendor，132KB，离线可用）。 | `jsnes.NES` |
| `assets/manifest.json` | 内置卡带清单（当前为空数组占位）。 | — |

---

## 3. 数据流（ROM → jsnes → 帧缓冲 → CRT → 屏幕）

```
.nes 文件 / ArrayBuffer
   │  cartridge.validateCartridge()  ← 前置校验门：扩展名(a)→魔数(b)→大小(c)
   ▼
emulator.loadROM(Uint8Array)          ← 注入失败 → 错误码(d)
   │  (jsnes 仿真循环，60fps 累加器)
   ▼
nes.frame() → onFrame(Uint32[256*240])
   │  ★ 像素格式 jsnes = 0x00RRGGBB（R 高字节，alpha=0）
   │    emulator 逐通道解出 R,G,B 并补 alpha=255 写入离屏 2D canvas 的 ImageData
   ▼
离屏 canvas（256×240，NES 原生分辨率）   ← 即 "内容源"
   │  crt.setContentSource(offscreen)   （待机时用内部绿噪点 canvas）
   ▼
CRT 管线（每帧 rAF）
   ├─ WebGL 档：离屏 canvas → 纹理上传 → 单 pass 片元着色器 → 可见 #screen
   └─ CSS  档：drawImage 缩放绘制 + DOM 叠层（扫描线/暗角/辉光/噪点/滚屏）
   ▼
可见 #screen（按客户端尺寸 × dpr 渲染，4:3）
```

**音频旁路**：`onAudioSample(l,r)` → 钳制 [-1,1] 入队列 → `ScriptProcessorNode` 缓冲 → `AudioContext.destination`。AudioContext 必须在用户手势内 `resume()`（点击电视即手势）。开机短音 `playPowerOn()` 在同一次手势中触发。

---

## 4. 状态机（flow.md §1）

```
        ┌─────────┐   选内置    ┌──────────┐
        │  Idle   │──────────▶│ Browsing │
        │ (待机)  │            │ (浏览)  │
        └────┬────┘◀──────────└────┬─────┘
             │ 内置/上传/拖拽(统一汇入 Loading)
             ▼
        ┌─────────┐   校验门通过 + loadROM 成功 → 武装就绪(等待点击电视开机)
        │ Loading │──────────┐
        │ (加载)  │          ▼
        └────┬────┘      ┌────────┐
             │ 取消      │Playing │ (开机动画结束进入)
             ▼           │ (游玩) │
        Idle/Browsing    └───┬────┘
                              │ Esc/退出
                              ▼
                             Idle
```

- **三来源统一汇入 Loading**：内置选择 / 上传文件 / 拖拽到电视 → 都先走 `cartridge.validateCartridge` 前置校验门。
- **校验门错误码**（flow §1.3，统一回 Idle + 一句人话）：
  - (a) 非 `.nes` 扩展名 → "这不是 .nes 卡带文件"
  - (b) 魔数不符（非 `NES`） → "卡带数据损坏或格式不支持"
  - (c) 文件 > 8MB → "卡带文件过大（上限 8MB）"
  - (d) 注入 jsnes 失败 → "卡带读取失败，请重试"
- **开机仪式**：loadROM 成功后进入"武装就绪"（`is-ready` 高亮 + "点击电视开机"），点击电视=用户手势→恢复音频→开机动画→Playing。满足支柱"即玩：选卡带→载入→点电视开机"。

---

## 5. 输入意图层（flow.md §3 / §4）

- 抽象为**八路意图**：up/down/left/right/A/B/Start/Select。
- 键盘映射（flow §3）与移动端虚拟按键（flow §4）**共用同一组布尔状态**，禁止两套逻辑：`InputLayer.state` 是唯一真相，任何源变更都经 `emit()` 广播给 `emulator.applyIntent(0, state)`。
- 键盘用 `event.code`（布局无关）；虚拟按键用 pointer 事件支持**多点触控并发**，`touch-action:none` 防误触。
- 焦点在交互控件（BUTTON/INPUT/…）时不拦截按键，保证键盘可达性（art-bible §9 Standard）。
- `INTENT_TO_NES` 将意图映射到 jsnes 按钮索引（A=0,B=1,SELECT=2,START=3,UP=4,DOWN=5,LEFT=6,RIGHT=7）。

---

## 6. 双档 CRT 选型与降级（art-bible §5.0）

| 档位 | 实现 | 触发 |
|---|---|---|
| 高保真 | WebGL 单 pass 片元着色器（桶形畸变/扫描线/辉光/色散/暗角/噪点/滚屏） | 支持 WebGL 时默认 |
| 基线 | CSS 合成叠层（repeating-linear-gradient 扫描线 / radial-gradient 暗角 / blur+screen 辉光 / SVG feTurbulence 噪点 / 滚屏 keyframes） | WebGL 初始化失败自动降级 |

- **降级策略**：`CRT` 构造时尝试 `getContext('webgl')`；失败则 `mode='css'`，容器加 `crt--css` 类启用 DOM 叠层、`crt--webgl` 时隐藏叠层（避免双 CRT）。
- **强度三档**（art-bible §5.2）：low/mid/high 的曲率/扫描线/孔栅/辉光/暗角/色散/噪点/滚屏参数存于 `CONFIG.CRT.tiers`，由 `<select id="crt-strength">` 实时切换并写入容器 CSS 变量。
- **reduced-motion**（art-bible §9 Standard）：`prefers-reduced-motion: reduce` 时强制锁定 `low` 档静态版（关噪点/闪烁/滚屏，开机动画跳 F0–F3 仅一次淡入）。

---

## 7. 风险与限制（待用户拍板 / 已知约束）

1. **`file://` 双击模式下的 fetch 限制（重要）**：`manifest.json` 与内置 ROM 通过 `fetch()` 加载；多数浏览器在 `file://` 下对 `fetch` 本地文件施加 CORS 限制（origin `null`）会失败。因此**双击 `index.html` 时：上传/拖拽可正常游玩，但"内置卡带"浏览会退化为"暂无内置卡带"**。**完整功能（含内置清单）需经静态服务器打开**（如 `python3 -m http.server`）。这是浏览器安全模型限制，非实现缺陷。
2. **jsnes 仿真性能**：弱 GPU / 移动端跑 WebGL 着色器 + 60fps 仿真可能有压力 → 已提供 low 档 + CSS 降级档兜底。
3. **音频自动播放策略**：AudioContext 必须用户手势 resume，已在"点击电视开机"手势内处理；提供静音开关。
4. **开机"通电嗡"音频（用户待定项）**：默认开启（`CONFIG.AUDIO.powerOnEnabled=true`），UI 提供静音开关。若主理人判断有风险可改为默认关——属非阻塞项。
5. **内置 ROM 实际文件**：`assets/manifest.json` 当前为空占位，真实 ROM 由用户后续放入 `assets/roms/` 并登记。
6. **视觉/CRT 真实渲染需在浏览器肉眼验证**（本环境无法看像素），见 Handoff 第 6 项。

---

## 8. 落盘路径清单

```
/Users/vividz/WorkBuddy/NES/
├── index.html
├── styles/main.css
├── src/
│   ├── config.js        # 常量单一来源
│   ├── cartridge.js     # 校验门 + 拖拽 + manifest
│   ├── emulator.js      # jsnes 封装 + 主循环 + 音频
│   ├── crt.js           # 双档 CRT 管线
│   ├── input.js         # 八路意图层
│   ├── ui.js            # 状态机编排
│   ├── boot.js          # F0–F4 开机动画
│   └── main.js          # 装配
├── vendor/jsnes.min.js  # jsnes UMD（132KB，本地 vendor）
├── assets/
│   ├── manifest.json    # 内置卡带清单（空占位）
│   ├── roms/  (.gitkeep + README)
│   └── covers/ (.gitkeep)
├── tests/
│   ├── validate.test.cjs  # 校验纯逻辑（node 可跑，16 用例）
│   └── smoke.dom.cjs      # DOM 桩烟雾测试（vm 沙箱执行浏览器脚本）
└── docs/architecture/
    ├── architecture.md
    └── adr-jsnes-crt.md
```
