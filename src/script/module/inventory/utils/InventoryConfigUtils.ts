import { EItemKind, Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import { configCategory, ITEM_KINDS } from "../../../config/ConfigCategories";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";

import type { InventoryConfig } from "../types/InventoryTypes";

export class InventoryConfigUtils {
    static read(tables: Tables): InventoryConfig {
        const rule = tables.inventory_rule.get(1), mapRule = tables.map_rule.get(1);
        if (!rule || !mapRule) throw new Error("三空间或地图规则表缺失");
        const items = byConfigId(tables.item.getDataList(), "物品表");
        const detailKinds = [
            [tables.weapon, [EItemKind.weapon], "武器表"],
            [tables.potion_item, [EItemKind.hp, EItemKind.mp, EItemKind.mixed, EItemKind.shield], "药品表"],
            [tables.repair, [EItemKind.repair], "修理补给表"],
            [tables.stamina, [EItemKind.stamina], "体力补给表"],
            [tables.container, [EItemKind.container], "纳虚器表"],
        ] as const;
        for (const [table, kinds, name] of detailKinds) {
            const detailIds = new Set<number>();
            for (const detail of byConfigId<{ id: number }>(table.getDataList(), name)) {
                const item = tables.item.get(detail.id);
                if (!item || !(kinds as readonly EItemKind[]).includes(item.kind))
                    throw new Error(`${name} 引用的物品编号或类别无效：${detail.id}`);
                detailIds.add(detail.id);
            }
            for (const item of items) {
                if ((kinds as readonly EItemKind[]).includes(item.kind) && !detailIds.has(item.id))
                    throw new Error(`${name} 缺少物品 ${item.id} 的专属配置`);
            }
        }
        for (const item of items) {
            configCategory(item.kind, ITEM_KINDS, "物品类别");
            if (item.enabled !== 0 && item.enabled !== 1)
                throw new Error(`物品 ${item.id} 的投放开关必须为 0 或 1`);
        }
        const fixtures = byConfigId(tables.inventory_start.getDataList(), "起始物品表").map(t => {
            const item = tables.item.get(t.item_id);
            const weapon = tables.weapon.get(t.item_id);
            if (!item || item.enabled !== 1 || !Number.isSafeInteger(t.count) || t.count <= 0 ||
                !Number.isSafeInteger(t.durability) || t.durability < 0 ||
                (weapon ? t.durability > weapon.durability : t.durability !== 0))
                throw new Error(`起始物品编号或数量、耐久无效：${t.item_id}`);
            return { id: t.id, templateId: t.item_id, count: t.count, durability: t.durability, node: 0 };
        });
        for (const kind of [EItemKind.weapon, EItemKind.container]) {
            const equipped = fixtures.filter(f => tables.item.get(f.templateId)?.kind === kind);
            if (equipped.length !== 1 || equipped[0].count !== 1)
                throw new Error("起始装备必须各有一件武器和纳虚器");
        }
        const config: InventoryConfig = {
            nodeLimit: 65,
            weight: { base: rule.base_weight, sourcePages: rule.source_pages },
            staminaMax: mapRule.stamina_max,
            build: BuildConfigUtils.read(tables),
            spaces: { battleWidth: rule.battle_width, battleHeight: rule.battle_height,
                safeWidth: rule.safe_width, safeHeight: rule.safe_height },
            templates: items.filter(t => t.enabled === 1).map(t => {
                const weapon = tables.weapon.get(t.id), container = tables.container.get(t.id);
                return {
                    id: t.id, name: t.name, kind: configCategory(t.kind, ITEM_KINDS, "物品类别"),
                    width: t.width, height: t.height, rotate: t.rotate === 1, battle: t.battle === 1,
                    safe: t.safe === 1, stack: t.stack, bagWidth: container?.width ?? 0, bagHeight: container?.height ?? 0,
                    icon: t.icon.startsWith("ui/") ? t.icon : `ui/atlas/module/inventory/${t.icon}.png`,
                    quality: t.quality,
                    weight: t.weight, weightLimit: container?.weight_limit ?? 0,
                    staminaRestore: tables.stamina.get(t.id)?.amount ?? 0,
                    weaponAttack: weapon?.attack ?? 0, weaponDefense: weapon?.defense ?? 0,
                    weaponDurability: weapon?.durability ?? 0, repairAmount: tables.repair.get(t.id)?.amount ?? 0,
                    recyclePrice: t.recycle_price,
                };
            }),
            fixtures,
        };
        return config;
    }
}
