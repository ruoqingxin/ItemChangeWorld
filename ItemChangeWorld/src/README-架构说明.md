# LayaAir 3.x 单机架构：打怪 / 掉落 / 物品系统

## 目录结构

```
src/
├── Main.ts                 # 入口，初始化 GameManager
├── config/                 # 配置层（可改为 JSON/表加载）
│   ├── ItemConfig.ts       # 物品类型、物品表
│   ├── MonsterConfig.ts    # 怪物表（血量、攻击、经验、掉落表ID）
│   └── DropConfig.ts       # 掉落表（概率、数量区间）
├── model/                  # 数据模型
│   ├── ItemData.ts         # 运行时物品实例（id、count）
│   └── Inventory.ts        # 背包（格子、堆叠、增删查）
├── manager/                # 管理器
│   ├── ItemManager.ts      # 物品配置查询、创建 ItemData
│   ├── DropManager.ts      # 按 dropTableId 概率摇掉落
│   ├── MonsterManager.ts   # 怪物配置、死亡回调（经验/金币/掉落）
│   └── GameManager.ts      # 总入口，串联打怪→掉落→入背包
└── README-架构说明.md
```

## 流程简述

1. **打怪**：场景/战斗逻辑中，怪物死亡时调用 `GameManager.instance.onMonsterKilled(monsterId)`。
2. **掉落**：`GameManager` 根据怪物配置的 `dropTableId` 用 `DropManager.rollDrops()` 摇出本次掉落列表。
3. **物品**：掉落的 `ItemData[]` 通过 `MonsterManager` 的死亡回调，自动加入 `GameManager.inventory`（背包），并给玩家加经验、金币。

## 扩展建议

- **配置**：将 `DefaultItemConfigTable`、`DefaultMonsterConfigTable`、`DefaultDropTableMap` 改为从 JSON/Excel 表加载。
- **表现**：在场景里为怪物挂载脚本，死亡时调用 `GameManager.instance.onMonsterKilled(this.monsterId)`；地面掉落物可先生成 `ItemData`，再创建精灵或飞入背包动画。
- **装备**：在 `ItemConfig` 中已预留 `equipSlot`、`attrs`，可增加 `EquipmentManager` 与装备栏 UI。
- **存档**：对 `GameManager.player`、`inventory.getSlots()` 做序列化（如 JSON）配合 Laya 的本地存储即可。
