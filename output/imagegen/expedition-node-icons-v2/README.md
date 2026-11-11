# 地图节点透明素材

来源：`E:\CjnxSQpp.png`，1920×1072 RGB PNG。包含 18 种节点中心图案和 1 枚独立通用底座。

## 文件

- `native`：按原图像素切出的 RGBA PNG，裁去多余空白，四周另留 16 像素透明边距。优先用于后续编辑。
- `png512`：统一 512×512 透明画布，以相同的 1.2 倍导出比例安排主体和落脚基准，保留三级敌人的相对体量。512 是画布尺寸，不代表原图增加了高清细节。
- `png128`：最初按共同尺度、共同落脚基准导出的 128×128 预览，留白较多，现不用于运行资源。
- `runtime128`：用户反馈留白后重新裁边的游戏版本，从 `native` 透明包围盒裁切、等比缩放至长边 116 像素，在 128×128 画布居中，最窄安全边距 6 像素。非方形图案不拉伸，不裁掉光效。三级敌人例外：以首领宽 116 像素为基准共同缩放，保持同尺寸脸部、递增的角与冠，避免普通面具独立撑满后反而显得更大。
- `preview-compact.png`：重新切图后的 19 张资源总览；`crop-comparison.png`：首领、撤离点的旧图 / 调整前 / 重新切图对照。
- `preview-dark.png` / `preview-light.png`：深浅背景对照。背景和名称只在预览图中，不在独立素材中。
- `preview-small.png`：上排 84、下排 64 像素的阅读检查，编号对应下表。
- `extraction-report.json`：来源哈希、裁切坐标、透明范围及导出说明。
- `extract_nodes.py`：本地可复现处理脚本，使用 Pillow、NumPy、OpenCV，不调用生成模型或生图 API。
- `diagnostics` / `background-model.png`：处理过程检查文件，不必导入游戏，交付压缩包中不含这些中间图。`map-node-transparent-pack.zip` 保留最初提取交付，不含后来新增的 `runtime128` 紧凑版。

| 编号 | 文件 | 内容 |
| --- | --- | --- |
| 01 | node-start.png | 入境处 |
| 02 | node-transit.png | 空节点 |
| 03 | node-enemy-normal.png | 普通敌人 |
| 04 | node-enemy-elite.png | 精英敌人 |
| 05 | node-enemy-boss.png | 首领 |
| 06 | node-supply.png | 补给处 |
| 07 | node-search.png | 搜索点 |
| 08 | node-borrow.png | 借法台 |
| 09 | node-insight.png | 悟道处 |
| 10 | node-recovery.png | 恢复点 |
| 11 | node-extract.png | 撤离点 |
| 12 | node-battle-loot.png | 战后遗藏 |
| 13 | node-herb.png | 药品采集处 |
| 14 | node-ore.png | 矿石采集处 |
| 15 | node-chest-common.png | 普通宝箱 |
| 16 | node-chest-refined.png | 精制宝箱 |
| 17 | node-chest-treasure.png | 珍藏宝箱 |
| 18 | node-cave.png | 洞府 |
| 19 | node-base.png | 通用底座 |

## 处理与检查

从原图估算棋盘格，提取封闭主体轮廓，对被光效打断的实体部分补充遮罩；边缘反混色，光效单独恢复为半透明区域，避免把灰石和面甲当背景删除。

原图没有 alpha 或独立图层，所以不可能无损恢复原始透明度。入口、撤离、借法、悟道的半透明效果采用按原画方向与形状的近似恢复和去网格平滑，局部亮度、柔化程度可能与平铺原图不同，不宣称逐像素还原。

提取阶段已检查 19×3 张独立 PNG 的 RGBA、透明角点、主体不裁边、部分透明边缘和实体像素，另以深浅底与 64/84 像素预览目检。原图不改动。

## 项目接入

2026-11-11 用户明确要求放入项目并替换原资源，随后反馈新版留白过多、要求重新切图。`assets/ui/image/expeditionNodes` 中原有 12 张图已替换为 `runtime128` 紧凑版并保留 UUID；新增 7 张图也采用同样裁边，均使用精灵纹理、sRGB、预乘透明。地图中心图案与通用底座分层，保留当前位置金环、点击范围、虚线与现有交互。

药品采集、矿石采集、三档宝箱和洞府这 6 张仅作为素材入库，不新增节点类型、生成规则或掉落；配置和存档未改动。

随后用户要求：空节点地图上只保留通用底座，隐藏石板图案，到达/重复点选均不显示右侧提示；普通、精英、首领地图图案从 104 放大到 144 设计像素，底座与点击范围不变，虚线避让同步扩大。战胜后不再替换为遗藏宝箱，保留原敌人图案及放大尺寸，仅降低饱和度并略微压暗；来源搜索完成后保留原图并按既有规则完全置灰。右侧搜索入口与原来源仓库不变。

复现导入：`node tools/import-expedition-node-art-v2.cjs --write`，随后 `node tools/ui-assets.cjs --write`。检查：`node tools/import-expedition-node-art-v2.cjs --check`。接入文件、哈希和原 UUID 见 `integration-report.json`；旧版导入脚本已阻止覆盖回旧图。

局部验证：19 张运行图的源切图哈希、可复现裁边、透明边界、UUID 和导入设置通过；UI 资源依赖检查与 `tsc --noEmit` 通过。`tools/test-expedition-node-art-browser.cjs` 使用真实 Laya 预制体，桌面 1280×720、宽屏 1560×720、手机横屏 844×390 均通过，覆盖动态节点、空节点仅底座/无面板、敌人放大/战后原图轻灰/搜索完成全灰、搜索入口、金环和虚线避让。截图位于 `bin/node-art-v2-browser`，未测试实体手机或发布包。
