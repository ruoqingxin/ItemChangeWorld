/**
 * 掉落配置
 * 每个掉落表 ID 对应一组掉落规则（物品ID + 概率/数量）
 */

export interface DropRule {
    /** 物品配置 ID */
    itemId: number;
    /** 最小数量 */
    minCount: number;
    /** 最大数量 */
    maxCount: number;
    /** 掉落概率 0~1 */
    probability: number;
}

/** 掉落表：dropTableId -> 规则数组 */
export type DropTableMap = Record<number, DropRule[]>;

/** 示例：怪物 dropTableId 1=野狼掉落表, 2=史莱姆掉落表 */
export const DefaultDropTableMap: DropTableMap = {
    1: [
        { itemId: 1002, minCount: 1, maxCount: 5, probability: 1 },   // 金币必掉 1~5
        { itemId: 1001, minCount: 0, maxCount: 1, probability: 0.3 }, // 小红瓶 30%
        { itemId: 3001, minCount: 0, maxCount: 2, probability: 0.5 }  // 狼牙 50%
    ],
    2: [
        { itemId: 1002, minCount: 0, maxCount: 2, probability: 1 },
        { itemId: 1001, minCount: 0, maxCount: 1, probability: 0.2 }
    ]
};
