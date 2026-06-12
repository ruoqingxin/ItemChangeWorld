/** 掉落物实例 */
export interface IDropItemRuntime {
    /** 掉落实例 ID */
    dropUid: string;

    /** 物品实例唯一 ID */
    itemUid: string;

    /** 物品配置 ID */
    itemId: number;

    /** 是否已拾取 */
    picked: boolean;
}

/** 战斗奖励状态 */
export interface IBattleRewardState {
    /** 来源战斗场景 ID */
    scenarioId: number;

    /** 掉落物列表 */
    drops: IDropItemRuntime[];
}

/** 掉落表占位结构（待导表后替换） */
export interface IDropTableConfig {
    drop_table_id: number;
    name: string;
    roll_count: number;
    enabled: number;
}

/** 掉落条目占位结构（待导表后替换） */
export interface IDropItemConfig {
    id: number;
    drop_table_id: number;
    item_id: number;
    weight: number;
    min_count: number;
    max_count: number;
    enabled: number;
}

/** 物品占位结构（待导表后替换） */
export interface IItemPlaceholderConfig {
    item_id: number;
    name: string;
    des: string;
    item_type: number;
    sub_type: number;
    quality: number;
    icon: string;
    bag_width: number;
    bag_height: number;
    enabled: number;
}
