# 复古小霸王游戏机

> 在网页中寻回小时候的快乐 —— 一台长在浏览器里的旧电视 + 小霸王机身，纯前端 NES 模拟器。

[![Pure Frontend](https://img.shields.io/badge/技术栈-Vanilla%20JS%20%2B%20Canvas-9b59b6?style=flat-square)](#)
[![Offline](https://img.shields.io/badge/运行-完全离线-27ae60?style=flat-square)](#快速开始)
[![Tests](https://img.shields.io/badge/tests-passing-2ecc71?style=flat-square)](#)

---

## ✨ 为什么用它

- **🌟 零依赖、零构建**：纯 Vanilla JS + Canvas，双击 `index.html` 即可运行，无需 npm install、无需打包器、无需联网。
- **📦 内置卡带，开箱即玩**：4 款中文汉化 ROM（超级玛丽 / 魂斗罗2中文 / 坦克1990 / 热血进行曲中文版）已内联，**完全离线**也能直接游玩；同时支持上传与拖拽任意 `.nes` 文件。
- **📺 真·复古观感**：旧电视开机动画 → CRT 电视（扫描线 / 辉光 / 色散 / 暗角 / 噪点 / 滚屏）→ 小霸王机身，层层还原。WebGL 着色器渲染，并尊重 `prefers-reduced-motion` 自动降级。
- **💡 暗夜主题**：左上角灯泡一键切换。深蓝黑夜空 + 点点星光、电视屏幕边缘蓝白光晕、机身由奶白转为暗夜色。
- **🕹️ 全平台操控**：PC 键盘 + 移动端虚拟手柄（含 A/B 连发键），按键可在设置中自定义。
- **⚙️ 可自定义**：声音、按键映射、CRT 强度（低/中/高）、屏幕雪花颜色、画面清晰度均可调，且全部本地持久化。

## 🚀 快速开始

```bash
# 方式一：直接双击 index.html 即可（内置卡带已内联，离线可玩）

# 方式二：本地静态服务（推荐，体验最佳）
python3 -m http.server 8099
# 浏览器访问 http://localhost:8099/
```

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
- **架构**：经典脚本按序加载，`file://` 下亦可运行

## 📜 许可

本项目为学习与怀旧用途。内置 ROM 版权归原所有者所有；模拟内核 jsnes 遵循其原始许可。
