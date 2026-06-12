import { EElement } from "src/script/config/schema";
import { BattleConfigUtils } from "../utils/BattleConfigUtils";
import { EPurityGrade, IElementStoneConfig } from "../types/BattleTypes";

/**
 * 第二阶段属性石 Debug 配置。
 * element_stone 表接入后可改为从 ConfigUtil.Tables 读取。
 */
const ELEMENT_STONE_DEBUG_LIST: IElementStoneConfig[] = [
    {
        stoneId: 4112,
        itemId: 2112,
        name: "金属性石·一阶·普通",
        element: EElement.metal,
        level: 1,
        purityGrade: EPurityGrade.Normal,
        purityValue: 60,
        damageRate: 100,
        durabilityCost: 5,
        minorEffectGroup: [[3, 1, 3, 6]],
        enabled: 1,
    },
    {
        stoneId: 4122,
        itemId: 2122,
        name: "木属性石·一阶·普通",
        element: EElement.wood,
        level: 1,
        purityGrade: EPurityGrade.Normal,
        purityValue: 60,
        damageRate: 100,
        durabilityCost: 5,
        minorEffectGroup: [[3, 2, 3, 3]],
        enabled: 1,
    },
    {
        stoneId: 4132,
        itemId: 2132,
        name: "水属性石·一阶·普通",
        element: EElement.water,
        level: 1,
        purityGrade: EPurityGrade.Normal,
        purityValue: 60,
        damageRate: 100,
        durabilityCost: 5,
        minorEffectGroup: [[3, 1, 3, 2]],
        enabled: 1,
    },
    {
        stoneId: 4142,
        itemId: 2142,
        name: "火属性石·一阶·普通",
        element: EElement.fire,
        level: 1,
        purityGrade: EPurityGrade.Normal,
        purityValue: 60,
        damageRate: 100,
        durabilityCost: 5,
        minorEffectGroup: [[3, 2, 3, 4]],
        enabled: 1,
    },
    {
        stoneId: 4152,
        itemId: 2152,
        name: "土属性石·一阶·普通",
        element: EElement.earth,
        level: 1,
        purityGrade: EPurityGrade.Normal,
        purityValue: 60,
        damageRate: 100,
        durabilityCost: 5,
        minorEffectGroup: [[2, 4, 1]],
        enabled: 1,
    },
];

const ITEM_ID_MAP = new Map<number, IElementStoneConfig>();
const STONE_ID_MAP = new Map<number, IElementStoneConfig>();

for (const row of ELEMENT_STONE_DEBUG_LIST) {
    ITEM_ID_MAP.set(row.itemId, row);
    STONE_ID_MAP.set(row.stoneId, row);
}

export class ElementStoneDebugConfig {
    static getByItemId(itemId: number): IElementStoneConfig | undefined {
        const row = ITEM_ID_MAP.get(Number(itemId));
        return row && BattleConfigUtils.isEnabled(row) ? row : undefined;
    }

    static getByStoneId(stoneId: number): IElementStoneConfig | undefined {
        const row = STONE_ID_MAP.get(Number(stoneId));
        return row && BattleConfigUtils.isEnabled(row) ? row : undefined;
    }

    static getAll(): IElementStoneConfig[] {
        return ELEMENT_STONE_DEBUG_LIST.filter(row => BattleConfigUtils.isEnabled(row));
    }
}
