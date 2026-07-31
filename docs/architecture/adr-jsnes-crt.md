# ADR-001 · 模拟核心与 CRT 后处理栈选型

- **状态**：已采纳（Accepted）
- **日期**：2026-07-30
- **决策人**：engineering-lead（程基岩），主理人游承峰拍板

---

## 1. 背景（Context）

网页版 NES 模拟器需在"纯前端、无框架、无构建步骤、双击 `index.html` 即可运行"的强约束下，复刻 8-bit 主机"看一台电视"的体验（概念支柱 1·还原）。两件事必须落地：

1. **仿真核心**：把 `.nes`（iNES）ROM 跑起来，输出 256×240 画面 + APU 音频。
2. **CRT 视觉**：高保真曲面屏 + 扫描线 + 辉光 + 暗角 + 机身外壳 + 开机仪式，且默认开启、可降级不可省略（art-bible §0）。

明确约束来自已确认决策：Vanilla JS + Canvas、无框架无构建、jsnes 作模拟核心、CRT 高保真双档栈（WebGL 片元着色器 + CSS 合成叠层兜底）。

---

## 2. 待决问题

- 仿真核心自研还是复用成熟库？
- CRT 后处理用 WebGL、CSS 还是 SVG 滤镜？是否需要多档与降级？
- 如何兼顾"默认高保真"与"弱设备 / 无 WebGL / 减弱动效"三类兜底？

---

## 3. 备选方案

### 仿真核心
- **(A) 自研 6502 + PPU + APU**：完全可控，但工程量巨大、正确性风险高，与"无构建、lean 评审"目标冲突。
- **(B) 复用 jsnes（纯 JS，MIT）**：成熟、体积小（UMD ~132KB）、API 简洁（`new NES({onFrame,onAudioSample})`、`loadROM(Uint8Array)`、`buttonDown/Up`、60fps `frame()`）。

### CRT 后处理
- **(C) WebGL 单 pass 片元着色器**：桶形畸变/扫描线/辉光/色散/暗角/噪点/滚屏一次完成，性能最优，保真度最高。
- **(D) CSS 合成叠层**：扫描线用 `repeating-linear-gradient`、暗角 `radial-gradient`、辉光 `blur+screen`、噪点 SVG `feTurbulence`。零逐帧 JS，成本极低，但保真度中。
- **(E) SVG 滤镜（feDisplacementMap + feTurbulence）**：轻量畸变/噪点，但实时作用于 canvas 易掉帧，保真度中低。

---

## 4. 决策（Decision）

1. **仿真核心采用 jsnes（方案 B）**，UMD 构建 vendor 到本地 `vendor/jsnes.min.js`，保证离线 / `file://` 可运行。
2. **CRT 采用"WebGL 高保真档（C）+ CSS 基线档（D）"双档栈**：默认走 WebGL 单 pass 着色器；WebGL 初始化失败自动降级 CSS 叠层；两档通过容器 CSS 类 `crt--webgl` / `crt--css` 互斥启用，绝不叠加。
3. **强度三档 low/mid/high（art-bible §5.2）**由 `CONFIG.CRT.tiers` 驱动，`<select>` 实时切换；**`prefers-reduced-motion` 强制锁定低档静态版**（关噪点/闪烁/滚屏，开机动画跳 F0–F3）。

---

## 5. 后果（Consequences）

### 正面
- 工程量与风险大幅降低：仿真正确性由 jsnes 背书；CRT 视觉可在无构建下实现高保真。
- 覆盖三档兜底（无 WebGL / 弱 GPU / 减弱动效），满足 art-bible §5.0 与 §9 Standard 可访问性。
- 本地 vendor 保证离线可用，符合"双击即玩"主路径。

### 负面 / 代价
- **对 jsnes 像素格式有硬依赖**：jsnes 帧缓冲为 `Uint32Array(61440)`，像素打包为 `0x00RRGGBB`（R 高字节、alpha=0）。`emulator.js` 必须逐通道解出 R,G,B 并补 `alpha=255`，**不可**直接 `Uint32` 整体拷贝（否则通道错位且透明）。已据此实现并单测校验逻辑。
- **`file://` 下 `fetch` 本地文件被 CORS 限制**：内置清单/ROM 经 `fetch()` 加载，双击模式会失败，仅上传/拖拽可用；完整功能需静态服务器。属浏览器安全模型限制，已在架构文档风险项标注。
- **WebGL 路径无法在本环境肉眼验证**，需真实浏览器确认像素与性能。
- 音频采用 `ScriptProcessorNode`（已弃用但 file:// 无需独立 worklet 文件、兼容性最好）；若未来要走 AudioWorklet 需额外 vendor 一个 worklet 模块。

### 后续
- 内置 ROM 实际文件到位后登记 `assets/manifest.json`。
- 开机"通电嗡"音频默认开启，提供静音开关；若主理人判定风险可改为默认关（非阻塞）。

---

*本 ADR 与 `docs/architecture/architecture.md` 同源，冲突以 ADR 为准。*
