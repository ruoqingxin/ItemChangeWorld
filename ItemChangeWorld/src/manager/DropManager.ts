/**
 * 掉落管理器
 * 根据怪物死亡时的 dropTableId 进行概率判定，生成掉落物品列表
 */

import type { DropTableMap, DropRule } from "../config/DropConfig";
import { DefaultDropTableMap } from "../config/DropConfig";
import type { ItemData } from "../model/ItemData";

export class DropManager {
    private dropTables: DropTableMap = DefaultDropTableMap;

    setDropTables(tables: DropTableMap): void {
        this.dropTables = tables;
    }

    /**
     * 执行一次掉落判定，返回本次掉落的物品列表（可再交给背包或地面表现）
     */
    rollDrops(dropTableId: number): ItemData[] {
        const rules = this.dropTables[dropTableId];
        if (!rules || rules.length === 0) return [];

        const result: ItemData[] = [];
        for (const rule of rules) {
            if (Math.random() > rule.probability) continue;
            const count = rule.minCount + Math.floor(Math.random() * (rule.maxCount - rule.minCount + 1));
            if (count <= 0) continue;
            result.push({ id: rule.itemId, count });
        }
        return result;
    }
}
