/**
 * 物品管理器
 * 提供配置查询、创建物品数据、与背包协作
 */

import type { ItemConfig, ItemConfigTable } from "../config/ItemConfig";
import { DefaultItemConfigTable } from "../config/ItemConfig";
import type { ItemData } from "../model/ItemData";
import { getMaxStack } from "../model/ItemData";

export class ItemManager {
    private configTable: ItemConfigTable = DefaultItemConfigTable;

    /** 可替换为从 JSON/表加载 */
    setConfigTable(table: ItemConfigTable): void {
        this.configTable = table;
    }

    getConfig(itemId: number): ItemConfig | null {
        return this.configTable[itemId] ?? null;
    }

    getMaxStack(itemId: number): number {
        const cfg = this.getConfig(itemId);
        return cfg ? (cfg.maxStack ?? 99) : 99;
    }

    /** 创建一份物品数据（用于掉落、奖励） */
    createItemData(itemId: number, count: number): ItemData | null {
        if (!this.getConfig(itemId)) return null;
        return { id: itemId, count };
    }
}
