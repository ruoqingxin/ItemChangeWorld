# 路线节点的来源与划分

检查日期：2026-11-14。范围为当前工作区客户端源码、实际运行配置包、配置工程导出文件和 Excel。未读取浏览器当前局存档，下列数量和结构针对当前客户端新局使用的生成器 4。已有局可能按自己的原生成器保留旧图。

## 1. 实际来源链路

维护源表：`C:/work/NowChange/config/Datas/N-新版战斗配置表.xlsx`。

客户端实际读取：`C:/work/NowChange/ItemChangeWorld/assets/config/configbin.bin`。

`ConfigLoader` → `ExpeditionRunConfigUtils.read` → `ExpeditionRules.generateLongRouteMap` → 当前局 `state.map.nodes/edges` → `ExpeditionPanel.renderMap`。

模板表只有 32 条。生成器按类型抽样、复用模板，重新赋 ID、key、坐标、主路顺序和连线，生成 45–65 个实际路线点。实例 key 形如 `H01@23`；同一模板生成的多个点分别结算战斗、借法和物品来源。

**实际发现：源表和导出目录没有与客户端运行包同步。**

| 核对项 | 当前结果 |
| --- | --- |
| 客户端包 new_expedition_rule | 79 字节；独立搜索 8–12，普通 13–16，精英 4–7，悟道 2–4，借法 3–5 |
| config/output_client/data/new_expedition_rule.bin | 71 字节；搜索 3–5，缺少 normal/elite/insight/borrow 的八个 min/max 字段 |
| Excel 的 expedition_rule | 同样为旧表头与搜索 3–5，最后列为 search_max |
| config/configbin.bin 与客户端 assets/config/configbin.bin | 字节内容不同 |
| 本轮核对的 node、enemy、pool 三张表 | 配置导出文件与客户端包对应块逐字节相同 |

因此下文预算以实际客户端包为依据。当前源表直接重新导出，会有覆盖扩容规则或与客户端生成代码不匹配的风险。本次未修改或重新导表。此前界面总节点检查报告中的“源表→运行配置”是职责链路，不代表两边已经同步；本次增加了实际内容比对。

## 2. 按功能划分：10 类

| 类别 kind | 当前每局数量 | 模板来源 | 行为与掉落来源 |
| --- | --- | --- | --- |
| start 出生 | 1 | H00 | 固定 (0,0)，无独立奖励/物品来源 |
| transit 中转 | 10–14 | H11 | 只移动和连接，不提供独立动作或物品来源 |
| normal 普通敌人 | 13–16 | 11 条 normal 模板 | 绑定 N1/N2/N3，战胜后生成 normal 池来源 |
| elite 精英敌人 | 4–7 | H05/H10/B04 | 绑定 E1/E2/E3，战胜后生成 elite 池来源 |
| boss 首领 | 1 | H14 | 固定 (26,0)，绑定 BOSS，战胜后生成 boss 池来源 |
| search 搜索 | 8–12，包含补给 | H06/S01/S02/S03/S04 | supplyEarly/supplyMid、search、risk、deep；deep 实际映射 risk |
| borrow 借法 | 3–5 | 实际只取首条 H03 | 生成主动候选，使用一次；H08/H13 未作为生成器 4 的独立候选抽样 |
| insight 悟道 | 2–4 | W01 | 生成被动候选，使用一次 |
| recovery 恢复 | 1–2 | 实际只取首条 RA | 恢复血蓝各自上限的 20%，同局每处一次；不回体力 |
| extract 撤离 | 共 2–3 | 实际只取首条 H15 | 固定末撤离 (27,0) 加支路 1–2 处，可选择非首领撤离 |

合计：45–65 个路线点；战斗总数 18–24，包含首领。

normal/elite/search 的数量、transit 的数量由运行规则表预算抽取。recovery 和额外 extract 的 1–2 数量当前直接写在生成器中；本生成器不使用 placement 表来决定这两类的数量和位置。出生和首领各 1、末撤离 1 同样由生成器固定。

### 搜索、补给和战后箱

- 补给不是新的 kind，逻辑仍是 search。H06/supplyMid、S01/supplyEarly 使用补给图标，每处固定三件：一份血药、一份蓝药，第三件按血药/蓝药/修补 50%/35%/15% 抽取。这两个补给模板当前走同一处理分支。
- 普通搜索 S02 使用 search 池，每处 2 或 3 件；风险搜索 S03/risk 和 S04/deep 使用 risk 池，每处 3 或 4 件。后两类与普通搜索共用地图搜索图标。
- 8–12 个搜索点由这五个模板循环抽样后打乱，不是先单独抽一个“补给点数量”再抽“普通搜索点数量”。
- 普通/精英/首领战后来源分别是 1–2 / 2–3 / 3–4 件。战后箱挂在原敌人点的 `map.sources`，不会新建路线节点，不计入上述 8–12 个独立搜索点。
- 首次到搜索点时固定物品；敌人战胜时固定战后物品。搜索操作只是逐件揭示，不重抽。
- 药草、矿石、三档宝箱、洞府并非当前生成器中的独立路线类型；有对应图片或物品类别不等于已经有此类路线点。

## 3. 按路线归属划分

生成器先建立一条参考主路，再接三条错峰长支路，最后补首领和末撤离。没有 routeId/收益线/挑战线等持久字段；路线归属由 mainOrder、锚点和真实 edges 判断。

| 区域 | 生成方式与内容 |
| --- | --- |
| 出生 | H00，(0,0)，mainOrder=0 |
| 参考主路 | 六普通、两精英、三借法、1–2 搜索及 7–9 中转；开头先中转再普通，后续内容打乱；mainOrder>0 |
| 第一条长支路 | 至少 10 个内部点；从开头中转附近分出，到参考路线末端附近汇合；位于参考路线一侧 |
| 第二条长支路 | 至少 6 个内部点；较早分出，较早汇合，处在主路与第一条支路之间 |
| 第三条长支路 | 至少 5 个内部点；中段分出，在较后位置汇合，位于主路另一侧 |
| 首领接近与末撤离 | 参考路线尾点 → 首领 (26,0) → 末撤离 (27,0)；末撤离唯一邻点为首领 |

新增的剩余点随机增加到支路容量中。支路内部顺次连接，只通过两个端点接回参考主路，中途没有额外横向换路边；核心地带形成持续 2/3/4 条可选路线。地图整体可沿路线镜像，不固定上方为某种收益或下方为某种危险。

参考主路固定保留六普通两精英和三借法，但不要求所有实际走法都打八战；三条支路共享打乱后的剩余内容池，不固定为补给线、战斗线或安全线。全部悟道、恢复和额外撤离都放在支路；剩余普通、精英、搜索、借法、中转也放入支路池。

### 划分时容易误读的字段

1. **H/B/S 等模板键不代表当前所在路线。**普通点既可能来自旧 H 前缀模板，也可能来自旧 B 前缀模板，随后被放到新主路或新支路。
2. **模板 x/y、main_order 不是当前图的布局。**生成器覆盖这些字段；旧表中“外缘/中段/深入”等名称也不限制现在只能出现于该地段。
3. **mainOrder=-1 不完全等于支路。**生成器 4 的首领和末撤离调用 add 时也采用默认 -1；必须先按 boss 或 x=27 的终点锚点排除，再识别普通支路。
4. **固定末撤离模板也用于支路撤离。**pick(extract) 取到第一条 H15，因而支路撤离的底层 name 也继承“固定末撤离”；地图操作区按 kind 显示为“撤离点”。不能只按这个 name 判断是否需要经过首领。
5. **可见、可达、完成是三套状态。**displayNodes 按当前开放宽度筛选；travelPaths 只准直接相邻点；默认未胜敌人处全方向锁定。搜索完成/奖励使用则由 sources/used 判断。

## 4. 全部 32 条模板

以下 key 是模板键，实际实例增加 @ID 后缀。

| ID | key | 类型 | 名称 | 敌人/来源池 | 生成器 4 使用方式 |
| --- | --- | --- | --- | --- | --- |
| 1 | H00 | start | 入境处 | 无 | 固定出生 |
| 2 | H01 | normal | 外缘一 | N1 / normal | 普通抽样池 |
| 3 | H02 | normal | 外缘二 | N2 / normal | 普通抽样池 |
| 4 | H03 | borrow | 借法台一 | 主动候选 | 全部借法复用此模板 |
| 5 | H04 | normal | 前隘 | N3 / normal | 普通抽样池 |
| 6 | H05 | elite | 守隘精英 | E1 / elite | 精英抽样池 |
| 7 | H06 | search | 中途补给处 | supplyMid | 搜索抽样池 |
| 8 | H07 | normal | 中段一 | N1 / normal | 普通抽样池 |
| 9 | H08 | borrow | 借法台二 | 主动候选 | 当前 pick(borrow) 不会取到此条 |
| 10 | H09 | normal | 中段二 | N2 / normal | 普通抽样池 |
| 11 | H10 | elite | 凝击精英 | E2 / elite | 精英抽样池 |
| 12 | H11 | transit | 深入岔口 | 无 | 全部中转复用此模板 |
| 13 | H12 | normal | 内隘 | N3 / normal | 普通抽样池 |
| 14 | H13 | borrow | 借法台三 | 主动候选 | 当前 pick(borrow) 不会取到此条 |
| 15 | H14 | boss | 首领 | BOSS / boss | 固定首领 |
| 16 | H15 | extract | 固定末撤离 | 无 | 末撤离及所有额外撤离复用 |
| 17 | S01 | search | 外缘补给处 | supplyEarly | 搜索抽样池 |
| 18 | B01 | normal | 岔路一 | N1 / normal | 普通抽样池 |
| 19 | S02 | search | 岔路搜寻处 | search | 搜索抽样池 |
| 20 | B02 | normal | 岔路二 | N3 / normal | 普通抽样池 |
| 21 | W01 | insight | 悟道处 | 被动候选 | 全部悟道复用此模板 |
| 22 | B03 | normal | 险路一 | N2 / normal | 普通抽样池 |
| 23 | B04 | elite | 巡游精英 | E3 / elite | 精英抽样池 |
| 24 | S03 | search | 险路搜寻处 | risk | 搜索抽样池 |
| 25 | B05 | normal | 深路一 | N1 / normal | 普通抽样池 |
| 26 | B06 | normal | 深路二 | N3 / normal | 普通抽样池 |
| 27 | S04 | search | 深路搜寻处 | deep → risk | 搜索抽样池 |
| 28 | RA | recovery | 恢复处一 | 无物品池 | 全部恢复复用此模板 |
| 29 | RB | recovery | 恢复处二 | 无物品池 | 当前 pick(recovery) 不会取到此条 |
| 30 | XA | extract | 外缘撤离 | 无 | 当前 pick(extract) 不会取到此条 |
| 31 | XB | extract | 中段撤离 | 无 | 当前 pick(extract) 不会取到此条 |
| 32 | XC | extract | 深入撤离 | 无 | 当前 pick(extract) 不会取到此条 |

普通模板绑定的真实敌人只有三种：N1 巡游残影、N2 凝击残影、N3 守隘残影；精英为 E1 护隘残影、E2 聚力残影、E3 巡猎残影；首领为 BOSS 护境残影。11 条普通模板并非 11 种独立敌人。

## 5. 图案与逻辑的对应

地图图案位于 `assets/ui/image/expeditionNodes/`，按 kind/pool 指定：start→node-start、normal/elite/boss→node-enemy-*、borrow→node-borrow、insight→node-insight、recovery→node-recovery、extract→node-extract。search 只分 node-supply 与 node-search 两种图案。transit 实际显示 handpainted/map-transit-stone-muted.png，自己的 node-transit 图片隐藏。

战胜后保留原敌人图并降低饱和度；来源全部搜索完成才置灰，不生成新的“箱子路线点”。图案文件的实际来源记录及哈希差异见同目录 README.md 和 assets.csv，不能从图片文件数量倒推出玩法类型数量。

## 6. 代码定位和核对方法

- `src/script/module/expedition/utils/ExpeditionRunConfigUtils.ts:8`：模板、规则、敌人和掉落表接入。
- `src/script/module/expedition/utils/ExpeditionRules.ts:124`：生成器 4；pick 为取该类型第一条，sample 为类型模板循环抽样。
- 同文件 `:154`：参考主路；`:176`：三条长支路；`:199`：首领和末撤离。
- 同文件 `:438`：浏览宽度；`:442`：显示列表；`:449`：相邻移动与拦路。
- 同文件 `:468`：物品来源；`:543`：移动到搜索点固定来源；`:635`：战胜固定来源。
- `src/script/module/expedition/view/ExpeditionPanel.ts:591`：地图图案映射。

本轮实际解码客户端配置包的 node/enemy/rule/pool 四块，均检查完整消费字节；逐字节比较同名配置导出文件，另用 ZIP/XML 读取 Excel 对应四个 sheet 核对。未将旧测试报告视作本轮测试结果，未修改代码、配置、存档或路线。
