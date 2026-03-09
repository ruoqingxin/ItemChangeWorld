/**
 * 物品配置与类型定义
 * 用于打怪掉落、背包、装备等物品系统
 */

/** 物品类型 */
export enum ItemType {
    Consumable = "consumable",   // 消耗品（药水等）
    Equipment = "equipment",     // 装备（武器、防具）
    Material = "material",      // 材料
    Currency = "currency",      // 货币
    Other = "other"
}

/** 装备槽位（若为装备类型） */
export enum EquipSlot {
    Weapon = "weapon",
    Head = "head",
    Body = "body",
    Legs = "legs",
    Accessory = "accessory"
}

/** 物品静态配置（表结构） */
export interface ItemConfig {
    id: number;
    name: string;
    nameKey?: string;           // 多语言 key
    type: ItemType;
    icon: string;               // 图标资源路径
    desc?: string;
    maxStack?: number;          // 最大堆叠数，默认 99
    /** 装备专用：槽位 */
    equipSlot?: EquipSlot;
    /** 装备专用：属性加成 */
    attrs?: Record<string, number>;  // 如 { "atk": 10, "def": 5 }
}

/** 物品配置表：id -> 配置 */
export type ItemConfigTable = Record<number, ItemConfig>;

/** 默认物品配置表示例（可改为从 JSON/表加载） */
export const DefaultItemConfigTable: ItemConfigTable = {
    1001: { id: 1001, name: "小红瓶", type: ItemType.Consumable, icon: "ui/icon_item_1001.png", maxStack: 99, desc: "恢复少量生命" },
    1002: { id: 1002, name: "金币", type: ItemType.Currency, icon: "ui/icon_gold.png", maxStack: 999999 },
    2001: { id: 2001, name: "新手剑", type: ItemType.Equipment, icon: "ui/icon_weapon_2001.png", equipSlot: EquipSlot.Weapon, attrs: { atk: 5 }, maxStack: 1 },
    2002: { id: 2002, name: "皮甲", type: ItemType.Equipment, icon: "ui/icon_body_2002.png", equipSlot: EquipSlot.Body, attrs: { def: 3 }, maxStack: 1 },
    3001: { id: 3001, name: "狼牙", type: ItemType.Material, icon: "ui/icon_material_3001.png", maxStack: 99 },
};
