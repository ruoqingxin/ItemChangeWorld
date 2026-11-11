# 地图资源条、短横线与搜索圆环切图

日期：2026-11-12。来源为用户提供的 `e508957e-57cc-47ed-8f4c-bc58e432f5d8_0_857ce4b3.png`，原图 2896×1440，具有真实透明通道。

本批导入 7 张独立 PNG，与上一批 13 张素材共用 `assets/ui/atlas/module/expedition/handpainted/`，合计 20 张。已创建各图片的 Laya `.meta`，尚未修改界面图片引用和绘制代码。

| 编号 | 文件 | 尺寸 | 处理 |
| --- | --- | --- | --- |
| C01 | map-meter-track.png | 512×64 | 深色空轨纹理，满幅不透明 |
| C02 | map-meter-hp.png | 512×64 | 灰绿生命纹理，满幅不透明 |
| C03 | map-meter-mp.png | 512×64 | 青蓝灵力纹理，满幅不透明 |
| C04 | map-meter-stamina.png | 512×64 | 黄绿体力纹理，满幅不透明 |
| C05 | map-meter-weight.png | 512×64 | 灰青负重纹理，满幅不透明 |
| D01 | map-route-dash.png | 64×32 | 两侧透明，中央玉白短横线实心 |
| E01 | inventory-search-spinner.png | 128×128 | 内孔、顶部缺口、框外透明，适合等比显示为 44×44 |

五条原始资源带带有圆角、描边与端帽。运行用纹理从各条内部裁取 1024×128，再缩为 512×64；四边平直，alpha 统一为 255，保留原有 RGB 配色与材质，可按任意比例裁切显示。外框使用前一批独立槽框，不将原图整条压缩后重复叠框。

短横线保留原图的玉白实心中心和暗青边缘，仅缩短水平中段，避免把端部整体挤扁。圆环保留源图轮廓、明暗、透明内孔与缺口。两者仅清除 alpha 小于 8/255 的几乎不可见杂点，将透明像素 RGB 归零，不做黑色抠图或重绘。

## 备份与预览

- `art/reference/expedition/skill-map-resources-source.png`：用户原图的逐字节备份。
- `native-cuts/`：7 张原尺寸完整切片，包括资源条原有圆角与外框。
- `interior-cuts/`：5 张原尺寸内部纹理，保留原始 RGB 和 alpha。
- `preview-dark.png` / `preview-light.png`：深浅背景预览。每条纹理附 204×12 的 100%、50%、10% 裁切样张；圆环另附 44×44 样张。这些是素材预览，不是游戏截图。
- `extraction-report.json`：源图哈希、裁切范围、输出尺寸、输出哈希、UUID 与透明度检查。

## 重建与检查

在项目目录运行：

```text
node tools/import-skill-map-resources.cjs --write
node tools/import-skill-map-resources.cjs --check
```

重建优先使用项目保留的原图，保留已生成 UUID。校验包括图片尺寸和哈希、五种纹理全图不透明、纹理与记录的原图内部裁切一致、短横线中心实心、圆环内孔/缺口/外沿透明，以及两批素材 UUID 无重复。
