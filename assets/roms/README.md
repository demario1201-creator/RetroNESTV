# 内置卡带 ROM 目录

把你的 `.nes` 文件放在这个目录（assets/roms/），然后在 `assets/manifest.json` 中登记：

```json
{
  "version": 1,
  "cartridges": [
    {
      "id": "super-mario-bros",
      "name": "超级马里奥兄弟",
      "file": "assets/roms/smb.nes",
      "cover": "assets/covers/smb.png"
    }
  ]
}
```

- 仅支持 iNES 格式（头部以 `NES\x1a` 开头）。
- 文件大小上限 8MB（concept.md §6 / flow.md §1.3）。
- `cover` 留空时使用占位图，不影响游玩。

> 注意：请勿分享受版权保护的 ROM；仅放入你拥有合法权利的备份。
