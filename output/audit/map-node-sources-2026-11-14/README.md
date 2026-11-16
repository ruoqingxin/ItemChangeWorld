# 当前地图界面节点来源检查

检查日期：2026-11-14。范围：工作区当前源码、预制体、资源依赖和实际图片文件。未连接正在运行的游戏，也未读取或修改用户当前游戏存档；下列数量表示界面构造能力，不是某一局当前可见节点数。本次只生成检查报告。

## 1. 当前入口和数量

当前正式入口：

`SkillBattleMapView.ts:9` → `assets/ui/prefab/module/expedition/SkillBattleMapView.lh` → `GameplayPanelFactory.ts:19` → `ExpeditionPanel`。

`UIBaseView.ts` 实例化预制体，`ElementMapper` 绑定节点，`ExpeditionPanel` 读取并更新这些节点。`SkillBattleMapPanel.ts` 在当前源码中没有调用方，不属于这条显示链路。工厂另有三个开发试炼分支，上述结论针对默认正式地图分支。

| 来源 | 数量 | 内容 |
| --- | ---: | --- |
| 地图预制体 | 215 | 54 个 GWidget、110 个 GImage、50 个 GTextField、1 个 GPanel，含页面根节点 |
| 运行时扩展地图点 | 132 | expNode33–expNode65，每个新建一个 GWidget、两个 GImage、一个 GTextField |
| 运行时完成标记 | 65 | expNode1–expNode65 各增加一个 expDone |
| 运行时测试开关 | 2 | expEnemyBlocking 和其 title 文本 |
| 合计 | 414 | 不含引擎内部对象、全局 UI 层和另外打开的确认弹窗 |

逐节点路径、类型、创建位置、预制体行号和资源来源见同目录 `nodes.csv`；当前引用图片及 SHA-256 见 `assets.csv`。

## 2. 预制体内全部节点的归属

以下按完整层级分组。范围写法中的每个编号都对应一个独立节点；逐项展开见 CSV。除特别注明外，均创建于同一地图预制体。

### 页面骨架

| 节点 | 来源和作用 |
| --- | --- |
| SkillBattleMapView | 页面根，1280×720 编辑设计尺寸 |
| screenBackground | 地面绘制容器，运行时由 ExpeditionPanel.backdrop 填充 |
| screenBackground/mapGroundTexture | 隐藏纹理载体，资源为 ancient-sect-ground-final.png |
| mapBackdropArea/result | 全屏遮色，由代码 drawRect 绘制 |
| mapBackdropArea | 遮色布局容器 |
| adapter | 原生自适应内容容器 |
| adapter/expeditionRoot | 地图业务根，含 desktop/compact 布局控制器 |
| expeditionRoot/expViewport | 横向滚动 GPanel，Scroller 在代码中创建 |
| expViewport/expMapContent | 地图点、道路和位置标记的父容器 |
| expMapContent/expLines | 道路绘制容器，真实边来自当前局 map.edges |
| expMapContent/expPlayer | 当前位置标记容器，由移动表现代码定位 |
| expPlayer/expPlayerAvatar | map-player-portrait.png |
| expPlayer/expPlayerFrame | map-avatar-frame.png |
| expeditionRoot/mapRouteTexture | 隐藏纹理载体 map-route-dash.png，供代码绘制虚线 |

### 地图点

| 节点 | 来源和运行时处理 |
| --- | --- |
| expMapContent/expNode1–expNode32 | 预制体内固定准备的 32 个显示槽，名称中的数字是运行时节点 ID，不固定表示某一种玩法 |
| 每个 expNodeN/expNodeNSkin | 预制体 GImage，使用 map-transit-stone-muted.png，仅 transit 显示 |
| 每个 expNodeN/expNodeNText | 预制体 GTextField，当前 renderMap 强制隐藏 |
| 每个 expNodeN/expNodeNIcon | 预制体 GImage，默认普通敌人图；运行时按节点 kind/pool 重设 src |
| expMapContent/expNode33–expNode65 | ExpeditionPanel.ts:88 新建；读取 expNode1 三个子节点的位置、尺寸和 autoSize，但不是完整克隆预制体 |
| 第 33–65 点的第 0/1/2 子节点 | 代码新建，分别为底座、隐藏文本、图标；代码未赋 name，CSV 用 [child0]–[child2] 区分 |
| 每个 expNodeN/expDone | ExpeditionPanel.ts:100 新建，map-completed-badge.png，30×30；来源全部揭示或节点已使用时显示 |

地图点点击区在渲染时设为 116×116；当前预制体图标和底座为 104×104。坐标由当前局节点 x/y 和 mapPositions 的布局计算确定，不能以编辑器里的原始位置推断实际地图。

### 当前节点操作区 nodeActionArea

| 节点 | 来源 |
| --- | --- |
| nodeActionArea | 预制体布局容器 |
| expContextBackground | map-panel.png |
| expContextIcon | 默认 clean/node-start.png，运行时使用当前节点图标同名的 clean/ 版本 |
| expContextTitle | 当前节点类型、名称或“战后掉落”，由 renderMap 赋值 |
| expContextStatus | 当前敌人、体力、搜索、使用或恢复状态，由 renderMap 赋值 |
| expUse | 动作按钮容器 |
| expUseSkin | map-button-normal/hover/pressed/disabled.png，由 mapButtonState 切换 |
| expUseText | “开战、搜索、休息、安全撤离、借法、悟道”等运行时文案 |

### 顶栏 mapHeaderArea

| 分组 | 全部节点和来源 |
| --- | --- |
| 顶栏 | mapHeaderArea、mapHeaderPanel；底图 map-header-panel.png |
| 时间 | mapClockArea、mapTimerFrame、expClock、mapClockGlyph；底框 map-slot.png，图标 map-icon-clock.png，时间来自 manager.remainingMs |
| 击杀 | mapKillsArea、mapKillsFrame、mapKillIcon0/1/2、expKillCount0/1/2；三个图标来自 expeditionNodes/hud/，数量统计本局 cleared 中的 normal/elite/boss |
| 体力 | mapStaminaArea、mapStaminaFrame、expStaminaLabel、mapStaminaSlot、mapStaminaTrack、mapStaminaFill、expStamina；当前值来自 s.stamina，上限来自 c.rules.staminaMax |
| 负重 | mapWeightArea、mapWeightFrame、expWeightLabel、mapWeightSlot、mapWeightTrack、mapWeightFill、expWeight；数值来自 InventoryRules.weight(c,s) |
| 按钮状态纹理 | mapButtonStatehover、mapButtonStatepressed、mapButtonStatedisabled；隐藏载体，对应 map-button-* |
| 工具按钮状态纹理 | mapToolbarStatehover、mapToolbarStatepressed、mapToolbarStatedisabled；隐藏载体，对应 map-toolbar-* |

mapTimerFrame、mapKillsFrame、mapStaminaFrame、mapWeightFrame 虽引用 map-slot.png，但当前预制体初始 visible=false，renderMapHud 未将其设为可见。不能把它们当作当前实际显示的框。

### 底部操作区 mapActionsArea

| 节点 | 来源 |
| --- | --- |
| mapActionsArea | 预制体布局容器 |
| mapNoticeSkin | map-notice-panel.png，存在提示文字时显示 |
| expNotice | 当前操作提示、移动状态或倒计时预警 |
| expStorage | 预制体按钮容器 |
| expStorageSkin、expStorageText、expStorageActionIcon | map-toolbar-*、运行时“行囊”、map-icon-inventory.png |
| expBuild | 预制体按钮容器 |
| expBuildSkin、expBuildText、expBuildActionIcon | map-toolbar-*、运行时“构筑”、map-icon-build.png |
| mapExitArea | 预制体布局容器 |
| expAbandon | 预制体按钮容器 |
| expAbandonSkin、expAbandonText、expAbandonActionIcon | map-button-*、运行时“放弃本局”、map-icon-exit.png |
| expEnemyBlocking | ExpeditionPanel.ts:108 代码新建 GButton；开关框和勾号由 graphics 绘制 |
| expEnemyBlocking/title | 同一处新建 GTextField，文字“测试·怪物拦路” |

### 玩家状态区 mapPlayerArea

| 节点 | 来源 |
| --- | --- |
| mapPlayerArea | 预制体布局容器 |
| mapPlayerPanel | map-player-panel.png |
| mapAvatarPlaceholder | map-player-portrait.png，当前实际使用头像图片 |
| mapAvatarFrame | map-avatar-frame.png |
| expPlayerName | renderMapHud 写死为“散修”，没有读取角色姓名表 |
| mapHpSlot、mapHpTrack、mapHpFill、expHpValue | map-bar-frame/track/hp.png；数值来自 s.hp 和 c.build.setup.player.maxHp |
| mapMpSlot、mapMpTrack、mapMpFill、expMpValue | map-bar-frame/track/mp.png；数值来自 s.mp 和 c.build.setup.player.maxMp |
| mapHpIcon、mapMpIcon | map-icon-hp.png、map-icon-mp.png |

所有进度条通过 scrollRect 裁出实际比例；不是运行时重新生成位图。

## 3. 玩法节点的数据来源

源表为 `C:/work/NowChange/config/Datas/N-新版战斗配置表.xlsx`。运行时由 ConfigUtil 从 `assets/config/configbin.bin` 加载生成表，ExpeditionRunConfigUtils.read 组装正式探索配置：

| 表/状态 | 用途 |
| --- | --- |
| new_expedition_node | 节点模板：类型、名称、敌人、掉落池等；不是当前随机局全部地图点 |
| new_expedition_rule | 各类节点预算、体力、计时、搜索和恢复规则 |
| new_expedition_enemy、new_expedition_intent | 敌人属性和意图 |
| new_expedition_edge | 配置边；新局生成器 4 实际重新建立路网 |
| new_expedition_placement、new_expedition_pool、new_expedition_variant | 布点/掉落相关配置，具体使用依生成器和动作分支而定 |
| 当前存档 state.map.nodes / edges | 页面实际读取的本局节点和连线 |
| state.map.cleared / used / sources | 战胜、使用、搜索及完成状态 |

新开局由 ExpeditionRules.generateLongRouteMap（生成器 4）从模板抽样，重新分配 ID、key、坐标和连线，预算合计 45–65 点。出生固定 x=0，首领 x=26，最终撤离 x=27；其他路线和内容随机。当前显示范围还经过 browseWidth/displayNodes 按到达历史筛选，并非 65 个槽始终全部可见。

既有局从 localStorage 键 `nowchange.stage4-expedition.v1` 恢复。保存正文版本为 4，保存种子、配置、生成器版本、操作序列和结果；校验会按原生成器重放。因此单看当前源表不能得知用户当前存档中每个编号是什么点。本次没有读取该浏览器存档。

## 4. 地图图标映射

下表文件名相对于 `assets/ui/image/expeditionNodes/`。操作区使用对应 `clean/` 图片，击杀计数使用独立 `hud/` 图片。

| 玩法类型 | 地图实际图案 |
| --- | --- |
| start | node-start.png |
| normal | node-enemy-normal.png |
| elite | node-enemy-elite.png |
| boss | node-enemy-boss.png |
| search 且 pool 以 supply 开头 | node-supply.png |
| 其他 search | node-search.png |
| recovery | node-recovery.png |
| borrow | node-borrow.png |
| insight | node-insight.png |
| extract | node-extract.png |
| transit | 图标 src 设置为 node-transit.png，但 image.visible=false；实际显示 handpainted/map-transit-stone-muted.png |

敌人战胜后保留敌人图，不替换 node-battle-loot.png；未搜完时降低饱和度和亮度，全部搜完时 grayed=true。普通搜索点同样仅在来源全部揭示后置灰。

node-battle-loot、node-base、node-herb、node-ore、node-chest-common/refined/treasure、node-cave 等文件存在，但当前正式地图 renderMap 没有将它们作为独立类型显示。map-current-locator、map-reachable-locator、map-player-traveler 等依赖或资源也不能据“存在/被预加载”认定为当前显示内容；当前位置实际使用头像加头像框。

## 5. 位图原始来源与核验

| 当前素材组 | 可追溯来源 |
| --- | --- |
| 11 张面板和按钮状态 | art/reference/expedition/map-style-2026-11-13/panel-source.png，经 import-map-approved-style.cjs 处理；11/11 当前哈希匹配 import.json |
| 常规图标、头像、头像框、完成标记、道路纹理、clean/ 详情图、hud/ 敌人计数图 | art/reference/expedition/map-unified-2026-11-12 的 panels.png、nodes.png、icons.png、atmosphere.png、hud-enemies.png；核对当前文件，不能仅看旧目录名 |
| 血蓝/体力/负重条 | art/reference/expedition/map-progress-bars/source.png；裁切规则见 cuts.json 和 prepare-map-polish.cjs，六个当前条素材哈希与 unified 清单的 preserved_progress_bars 一致 |
| map-slot.png | 旧 handpainted 提取包，清单见 output/imagegen/skill-map-handpainted/extraction-report.json |
| 地面 | import-map-final-ground.cjs 指向 1794555013914_fd7e6da294934c6682911e8d6939044b 原图和 art/reference/expedition 的同号备份，处理为 1376×768 的 ancient-sect-ground-final.png；当前用于重复填充 |

旧 `map-ui-bundle-02ef9c94/import-report.json` 中 16 个文件的哈希均已与当前文件不同；旧 V4 节点导入报告中仅 7 个库内素材仍匹配，不能将旧报告当作当前地图所有图案的来源凭据。

## 6. 检查发现与边界

1. **来源记录不完整：**当前 node-start、node-transit、node-enemy-normal/elite/boss、node-recovery、node-borrow、node-insight、node-extract 共 9 张 256×256 图片与 unified 导入清单不匹配，搜索现有 art/output/tmp/tools 下的 JSON、Markdown 和处理脚本也未找到其当前 SHA-256。可以确定运行时文件路径，尚不能仅凭现有记录证明其最新原图和处理步骤。assets.csv 保留当前哈希。
2. **9 张图片导入设置需注意：**这组当前 .meta 未显式记录 sRGB/premultiplyAlpha，不能据缺失认定实际为 false；还需由 IDE 的有效导入结果确认。静态检查只记录此差异，没有修改设置。
3. **节点创建方式不统一：**1–32 点在预制体，33–65 点在代码中新建；后者只复制三个子节点的部分布局属性，修改模板的其他属性不保证同步。新增子节点未命名，也不进入预制体 ElementMapper 列表。当前代码通过下标访问它们。
4. **预制体包含隐藏载体：**四个 map-slot 框、六张按钮状态纹理、mapGroundTexture、mapRouteTexture 都有其加载或历史用途，不能统计为始终可见的装饰。
5. **依赖表有历史余项：**地图依赖共 94 项，包含当前地图未直接显示的旧 UI、计量条、位置环和图案。未做删除；预加载不等于显示。
6. **静态完整性：**215 个预制体节点名称唯一，214 个 ElementMapper 子节点引用均能解析，没有嵌套 _$prefab；全部静态图片路径和依赖文件均存在。合并代码动态可引用的图案后共 55 张图片，全部存在且已纳入地图依赖。CSV 中 414 个节点完整路径唯一。另核对 unified 的五张原始图、样式 panel-source 和进度条 source，均与各自来源记录的哈希相符。
7. **未做运行验收：**本次不声称已确认用户当前运行窗口使用的构建版本、具体存档节点列表或 IDE 导入后的视觉效果，没有修改玩法、预制体、图片、配置或存档。

## 7. 定位入口

- src/script/module/expedition/view/SkillBattleMapView.ts:9：页面资源及组装入口。
- src/script/module/gameplay/utils/GameplayPanelFactory.ts:11：正式/试炼分支。
- src/script/module/expedition/view/ExpeditionPanel.ts:88：第 33–65 点；:100：完成标记；:108：测试开关。
- src/script/module/expedition/view/ExpeditionPanel.ts:424：状态栏；:493：图标完成状态；:499：位置标记；:510：地图布局。
- src/script/module/expedition/view/ExpeditionPanel.ts:545：背景；:565：实际节点显示；:591：图案映射；:654：详情图来源。
- src/script/module/expedition/view/ExpeditionPanel.ts:719：真实连线；:759：位图虚线绘制。
- src/script/module/expedition/utils/ExpeditionRunConfigUtils.ts:8：生成表到运行配置。
- src/script/module/expedition/utils/ExpeditionRules.ts:124：生成器 4；:438：浏览宽度；:442：显示节点。
- src/script/module/expedition/manager/ExpeditionRunManager.ts:14：存档键；:211：完整重放校验。
