/**
 * 运行时物品实例
 * 对应背包/地面上一份可堆叠的物品
 */

import type { ItemConfig } from "../config/ItemConfig";

export interface ItemData {
    /** 物品配置 ID */
    id: number;
    /** 当前数量（堆叠） */
    count: number;
    /** 唯一实例 ID（装备、绑定物品时用，可选） */
    uid?: string;
    /** 耐久等扩展（可选） */
    durability?: number;
}

/** 根据配置创建一份物品数据 */
export function createItemData(itemId: number, count: number, uid?: string): ItemData {
    return { id: itemId, count, uid };
}

/** 从配置取最大堆叠数 */
export function getMaxStack(config: ItemConfig): number {
    return config.maxStack ?? 99;
}
