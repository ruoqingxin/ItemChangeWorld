import {
    IDropItemConfig,
    IDropTableConfig,
    IItemPlaceholderConfig,
} from "./BattleRewardTypes";

/**
 * 第三阶段掉落 / 物品配置占位。
 * drop_table / drop_item 导表完成后可删除，改由 ConfigUtil.Tables 读取。
 */
export class BattleDropPlaceholder {
    static readonly dropTables: IDropTableConfig[] = [
        { drop_table_id: 1001, name: "腐化灵鼠掉落", roll_count: 1, enabled: 1 },
        { drop_table_id: 1002, name: "赤眼妖兔掉落", roll_count: 1, enabled: 1 },
        { drop_table_id: 1003, name: "枯藤精掉落", roll_count: 2, enabled: 1 },
    ];

    static readonly dropItems: IDropItemConfig[] = [
        { id: 1, drop_table_id: 1001, item_id: 2301, weight: 40, min_count: 1, max_count: 1, enabled: 1 },
        { id: 2, drop_table_id: 1001, item_id: 2122, weight: 20, min_count: 1, max_count: 1, enabled: 1 },
        { id: 3, drop_table_id: 1001, item_id: 2601, weight: 20, min_count: 1, max_count: 1, enabled: 1 },
        { id: 4, drop_table_id: 1001, item_id: 0, weight: 20, min_count: 0, max_count: 0, enabled: 1 },
        { id: 5, drop_table_id: 1002, item_id: 2303, weight: 35, min_count: 1, max_count: 1, enabled: 1 },
        { id: 6, drop_table_id: 1002, item_id: 2142, weight: 25, min_count: 1, max_count: 1, enabled: 1 },
        { id: 7, drop_table_id: 1002, item_id: 2601, weight: 25, min_count: 1, max_count: 1, enabled: 1 },
        { id: 8, drop_table_id: 1002, item_id: 0, weight: 15, min_count: 0, max_count: 0, enabled: 1 },
        { id: 9, drop_table_id: 1003, item_id: 2301, weight: 30, min_count: 1, max_count: 2, enabled: 1 },
        { id: 10, drop_table_id: 1003, item_id: 2302, weight: 20, min_count: 1, max_count: 1, enabled: 1 },
        { id: 11, drop_table_id: 1003, item_id: 2122, weight: 30, min_count: 1, max_count: 1, enabled: 1 },
        { id: 12, drop_table_id: 1003, item_id: 2601, weight: 20, min_count: 1, max_count: 1, enabled: 1 },
    ];

    /** 新增测试物品占位，导表后删除 */
    static readonly items: IItemPlaceholderConfig[] = [
        { item_id: 2301, name: "低阶灵草", des: "基础炼丹材料", item_type: 3, sub_type: 301, quality: 1, icon: "", bag_width: 1, bag_height: 1, enabled: 1 },
        { item_id: 2302, name: "青玉灵果", des: "天材地宝", item_type: 3, sub_type: 302, quality: 2, icon: "", bag_width: 1, bag_height: 1, enabled: 1 },
        { item_id: 2303, name: "赤炎草", des: "火行灵草", item_type: 3, sub_type: 301, quality: 2, icon: "", bag_width: 1, bag_height: 1, enabled: 1 },
        { item_id: 2601, name: "劣品灵石袋", des: "撤离后打开获得灵石", item_type: 2, sub_type: 208, quality: 1, icon: "", bag_width: 1, bag_height: 1, enabled: 1 },
        { item_id: 2401, name: "一阶功法残卷", des: "后续功法系统用", item_type: 4, sub_type: 401, quality: 2, icon: "", bag_width: 1, bag_height: 1, enabled: 1 },
        { item_id: 1102, name: "普通铁剑", des: "测试武器掉落", item_type: 1, sub_type: 101, quality: 1, icon: "", bag_width: 1, bag_height: 4, enabled: 1 },
        { item_id: 1103, name: "破旧大刀", des: "测试大件占格压力", item_type: 1, sub_type: 103, quality: 1, icon: "", bag_width: 2, bag_height: 4, enabled: 1 },
    ];

    /** enemy.drop_table_id 占位映射（配置表未更新时使用） */
    static readonly enemyDropTableMap: Record<number, number> = {
        1: 1001,
        2: 1002,
        3: 1003,
    };

    static getDropTable(dropTableId: number): IDropTableConfig | undefined {
        return this.dropTables.find(row => Number(row.drop_table_id) === Number(dropTableId));
    }

    static getDropItems(dropTableId: number): IDropItemConfig[] {
        return this.dropItems.filter(row => Number(row.drop_table_id) === Number(dropTableId));
    }

    static getItem(itemId: number): IItemPlaceholderConfig | undefined {
        return this.items.find(row => Number(row.item_id) === Number(itemId));
    }

    static getEnemyDropTableId(enemyId: number, configDropTableId: number): number {
        if (configDropTableId > 0) {
            return configDropTableId;
        }

        return this.enemyDropTableMap[enemyId] || 0;
    }
}
