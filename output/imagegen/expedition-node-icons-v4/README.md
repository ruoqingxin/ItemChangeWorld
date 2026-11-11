# 氛围节点切图 V4

- 来源：`C:\Users\Administrator\Downloads\8369bfcb-cc27-4822-b6dc-e8cec45b9833_0_84a5cffc.png`
- 原图为 2736×1536 RGBA，已确认有真实透明和半透明像素，不是棋盘格底图。
- `png128`：19 张独立的 128×128 透明 PNG，仅导出这一种图标尺寸。
- 主体长边目标为 112px；普通敌人 100px、精英 110px、首领 116px，兼顾烟雾和角冠宽度。
- 直接保留来源的颜色和透明信息，不重绘、不重新去底、不整体提高不透明度。仅对裁切边缘和画布最外侧光晕做柔和收边，远端弥散光不强求完整收纳，以保证主体大小。
- `preview-dark.jpg`、`preview-light.jpg` 为 128px 实际尺寸的深浅底对照。
- `map-node-atmosphere-128.zip` 仅包含 19 张图标。
- `extraction-report.json` 记录来源哈希、裁切区域、输出哈希与透明通道核验。
- 用户随后明确要求替换游戏资源，19 张同名文件已直接复制到 `assets/ui/image/expeditionNodes`，没有再次缩放或去底；原 `.meta`、资源 UUID 和导入设置保持不变。
- 维持当前节点映射：空节点只显示通用底座，敌人仍放大显示，战胜后保留原敌人图标并轻度置灰。药草、矿石、三档宝箱及洞府资源一并更新，但不因此新增地图节点或改玩法。
- 未改玩法代码、配置或存档。替换核验见 `integration-report.json`；可用 `tools/import-expedition-node-art-v4.cjs --check` 重验。
- 已通过桌面 1280×720、宽屏 1560×720、手机横屏 844×390 的真实浏览器检查，截图位于 `bin/node-art-v4-browser`。

复现脚本：`extract_nodes_128.py`，依赖 Pillow 和 NumPy。
