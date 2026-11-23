import { EEnemyTier, EItemKind, ELootFamily, EMapNodeKind, EPotionResource } from "./schema";

export const ITEM_KINDS = {
    [EItemKind.weapon]: "weapon", [EItemKind.hp]: "hp", [EItemKind.mp]: "mp", [EItemKind.mixed]: "mixed",
    [EItemKind.shield]: "shield", [EItemKind.repair]: "repair", [EItemKind.stamina]: "stamina",
    [EItemKind.book]: "book", [EItemKind.material]: "material", [EItemKind.container]: "container",
    [EItemKind.armor]: "armor", [EItemKind.accessory]: "accessory",
} as const satisfies Record<EItemKind, string>;
export const POTION_RESOURCES = {
    [EPotionResource.hp]: "hp", [EPotionResource.mp]: "mp", [EPotionResource.mixed]: "mixed",
    [EPotionResource.shield]: "shield",
} as const satisfies Record<EPotionResource, string>;
export const ENEMY_TIERS = {
    [EEnemyTier.normal]: "普通", [EEnemyTier.elite]: "精英", [EEnemyTier.boss]: "首领",
} as const satisfies Record<EEnemyTier, string>;
export const MAP_NODE_KINDS = {
    [EMapNodeKind.start]: "start", [EMapNodeKind.normal]: "normal", [EMapNodeKind.elite]: "elite",
    [EMapNodeKind.boss]: "boss", [EMapNodeKind.search]: "search", [EMapNodeKind.borrow]: "borrow",
    [EMapNodeKind.insight]: "insight", [EMapNodeKind.transit]: "transit",
    [EMapNodeKind.recovery]: "recovery", [EMapNodeKind.extract]: "extract",
} as const satisfies Record<EMapNodeKind, string>;
export const LOOT_FAMILIES = {
    [ELootFamily.hp]: "hp", [ELootFamily.mp]: "mp", [ELootFamily.mixed]: "mixed", [ELootFamily.shield]: "shield",
    [ELootFamily.repair]: "repair", [ELootFamily.stamina]: "stamina", [ELootFamily.herb]: "herb",
    [ELootFamily.ore]: "ore", [ELootFamily.beast]: "beast", [ELootFamily.relic]: "relic",
    [ELootFamily.book]: "book", [ELootFamily.container]: "container", [ELootFamily.weapon]: "weapon",
    [ELootFamily.armor]: "armor", [ELootFamily.accessory]: "accessory",
} as const satisfies Record<ELootFamily, string>;

// 配置使用数值枚举，在读取边界转为规则核的行为标识，未知值必须拒绝。
export function configCategory<T extends string>(value: number, codes: Readonly<Record<number, T>>, field: string): T {
    if (!Number.isSafeInteger(value) || !Object.prototype.hasOwnProperty.call(codes, value))
        throw new Error(`${field} 的枚举值无效：${value}`);
    return codes[value];
}
