# 复古小霸王游戏机

> 在网页中寻回小时候的快乐 —— 一台长在网页里的旧电视 + 小霸王机身，纯前端 NES 模拟器。

[![Pure Frontend](https://img.shields.io/badge/技术栈-Vanilla%20JS%20%2B%20Canvas-9b59b6?style=flat-square)](#技术栈)
[![Offline](https://img.shields.io/badge/运行-完全离线-27ae60?style=flat-square)](#快速开始)
[![Tests](https://img.shields.io/badge/tests-46%20passing-2ecc71?style=flat-square)](#测试)

---

## ✨ 项目特点

- **🌟 零依赖、零构建**：纯 Vanilla JS + Canvas，双击 `index.html` 即可运行，无需 npm install、无需打包器。
- **📺 沉浸式复古体验**：旧电视开机动画 → CRT 电视（桶形畸变 / 扫描线 / 辉光 / 色散 / 暗角 / 噪点 / 滚屏）→ 小霸王机身，层层还原。
- **🎮 双档 CRT 渲染**：WebGL 片元着色器后处理，CSS 合成叠层兜底；尊重 `prefers-reduced-motion`，自动降级保护敏感用户。
- **💡 暗夜主题**：左上角灯泡一键切换。深蓝黑夜空 + 点点星光、电视屏幕边缘蓝白光晕、机身由奶白转为暗夜色。
- **🕹️ 全平台操控**：PC 键盘 + 移动端虚拟手柄（含 A/B 连发键 AA/BB、键盘 U/I 连发），按键可在设置中自定义。
- **📦 内置卡带即用**：4 款中文汉化 ROM（超级玛丽 / 魂斗罗2中文 / 坦克1990 / 热血进行曲中文版）已 base64 内联，**完全离线**也无需联网即可游玩；同时支持上传与拖拽 `.nes` 文件。
- **⚙️ 设置面板**：声音调节、按键自定义、CRT 强度（低/中/高）、屏幕雪花颜色（黑绿 / 经典黑白），全部本地持久化。

## 🚀 快速开始

### 方式一：直接打开

双击项目根目录下的 `index.html` 即可。（内置卡带已内联，离线也能玩。）

### 方式二：本地静态服务（推荐，体验最佳）

```bash
# 任选其一
python3 -m http.server 8099
npx serve .
```

然后浏览器访问 `http://localhost:8099/`。

## 🎮 玩法

1. 待机雪花画面下，点开 **「内置卡带」** 或 **「上传文件」**（也可把 `.nes` 文件拖到电视上）。
2. 选好卡带后，徽标变为 **START**，点击电视 / 徽标 **开机**。
3. 游戏中徽标变为 **ESC**，点击或按 **Esc** 退出回到待机。
4. 左上角 **灯泡** 可切换白天 / 暗夜主题。

### 默认键盘映射

| 功能 | 按键 |
| --- | --- |
| 方向 | ↑ ↓ ← → （或 W A S D） |
| A / B | J / K（或 Z / X） |
| Select / Start | Shift / Enter |
| 连发 A / B | U / I |
| 退出 | Esc |

> 以上按键均可在「设置 → 按键自定义」中重新映射。

## 🧱 技术栈

- **模拟核心**：[jsnes](https://github.com/bfirsh/jsnes)（内置 `vendor/jsnes.min.js`，离线可用）
- **渲染**：Canvas 2D + 自研 WebGL CRT 着色器 + CSS 叠层
- **架构**：经典脚本按序加载（`config → cartridge → builtin-cartridges → emulator → crt → input → boot → ui → main`），`file://` 下亦可运行

```
NES/
├── index.html              # 入口：电视 / 小霸王机身 / 卡带面板 / 设置
├── styles/main.css         # 布局、外壳、CRT 叠层、主题
├── src/                    # 各功能模块（见上）
├── vendor/jsnes.min.js     # NES 模拟内核（离线）
├── assets/                 # 卡带 manifest 与封面
└── tests/                  # 自动化测试
```

## 🧪 测试

```bash
node tests/validate.test.cjs
node tests/smoke.dom.cjs
node tests/input.test.cjs
node tests/bindings.test.cjs
node tests/jsnes_integration.test.cjs
```

## 📜 许可

本项目为学习与怀旧用途。内置 ROM 版权归原所有者所有；模拟内核 jsnes 遵循其原始许可。
