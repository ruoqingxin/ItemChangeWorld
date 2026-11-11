# 地图手绘 UI 切图

来源：用户提供的 `bb97c47f-11f0-4b05-a79f-592fa62fba6f_0_7d14c8ca.png`，原始尺寸 2736×1536，带真实透明通道。

本次完成 **13 张独立 PNG 的切图和资源导入**。运行资源位于 `assets/ui/atlas/module/expedition/handpainted/`，均已配套 Laya `.meta`。尚未修改 `SkillBattleMapView` 的图片绑定或绘制代码。

| 素材 | 文件名 | 导入尺寸 | 九宫格保留边 |
| --- | --- | --- | --- |
| 地图人物 | map-player-traveler.png | 128×160 | 无，等比显示 |
| 头肩头像 | map-player-portrait.png | 128×128 | 无 |
| 时钟 | map-icon-clock.png | 128×128 | 无 |
| 行囊 | map-icon-inventory.png | 128×128 | 无 |
| 构筑卷册 | map-icon-build.png | 128×128 | 无 |
| 退出 | map-icon-exit.png | 128×128 | 无 |
| 通用面板 | map-panel.png | 64×64 | 上右下左各 16 px |
| 凹槽 | map-slot.png | 32×32 | 上右下左各 6 px |
| 头像外框 | map-avatar-frame.png | 128×128 | 无，内孔透明 |
| 按钮常态 | map-button-normal.png | 64×48 | 上右下左各 10 px |
| 按钮悬停 | map-button-hover.png | 64×48 | 上右下左各 10 px |
| 按钮按下 | map-button-pressed.png | 64×48 | 上右下左各 10 px |
| 按钮禁用 | map-button-disabled.png | 64×48 | 上右下左各 10 px |

## 处理方式

- 裁去原图编号和说明，保留源图透明通道。仅清除 alpha 小于 8/255 的几乎不可见杂点，并将全透明像素的 RGB 归零；未按黑色抠图，也未重新绘制或改变配色。
- 地图人物保留全身、发髻、剑与双脚。头像另做方形头肩构图；原始完整头像仍保存在高清切片中。人物接入 56×60 容器时应等比适配，避免直接横向拉宽。
- 四态按钮的可见边界统一为 58×42、位于 64×48 画布的 (3,3)。先对齐源图，再缩放并压缩中段，保留端角比例；不是直接把长条整张压扁。
- 面板、凹槽、按钮已配套九宫格导入参数；可以分别拉伸为顶部横栏、细槽和 112×104 / 120×64 / 208×64 等现有按钮。
- 这张源图没有资源条纹理、路线虚线或搜索转圈图，未补画这些素材。

2026-11-12 用户提供了第二张素材图，已另行补入 5 张资源条纹理、1 张实心短横线和 1 张搜索圆环。同一资源目录现共 20 张图片；本文件和本批重建脚本仍只负责原有 13 张。新增部分的尺寸、预览及重建记录见 `../skill-map-resources/README.md`。

## 备份与预览

- 原图：`art/reference/expedition/skill-map-handpainted-source.png`，与用户文件 SHA-256 一致。
- `native-cuts/`：13 张原始分辨率切片。
- `aligned-buttons/`：四态按钮统一为 576×192 的中间稿。
- `preview-dark.png` / `preview-light.png`：深浅背景总览；面板和按钮以九宫格方式展示。
- `preview-actual-sizes.png`：现有按钮尺寸的拉伸样张与小尺寸图标预览，不是游戏运行截图。
- `extraction-report.json`：来源哈希、裁切范围、导入尺寸、资源 UUID、输出哈希和透明度检查。

## 重建与检查

项目目录下使用 Node.js 运行：

```text
node tools/import-skill-map-handpainted.cjs --write
node tools/import-skill-map-handpainted.cjs --check
```

重建默认读取项目中保留的原图，保留已生成资源的 UUID，不依赖下载目录继续存在。检查覆盖 13 张图片的尺寸、哈希、透明留边、头像框内孔、面板/按钮中心、按钮四态对齐及九宫格元数据。
