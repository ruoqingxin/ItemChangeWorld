import type { Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";

import type { InventoryConfig, InventoryTemplate } from "../types/InventoryTypes";

export class InventoryConfigUtils {
    static read(tables: Tables): InventoryConfig {
        const rule = tables.inventory_rule.get(1), mapRule = tables.map_rule.get(1);
        if (!rule || !mapRule) throw new Error("三空间或地图规则表缺失");
        const items = byConfigId(tables.item.getDataList(), "物品表");
        for (const item of items) {
            if (item.enabled !== 0 && item.enabled !== 1)
                throw new Error(`物品 ${item.id} 的投放开关必须为 0 或 1`);
        }
        const config: InventoryConfig = {
            nodeLimit: 65,
            weight: { base: rule.base_weight, sourcePages: rule.source_pages },
            staminaMax: mapRule.stamina_max,
            build: BuildConfigUtils.read(tables),
            spaces: { battleWidth: rule.battle_width, battleHeight: rule.battle_height,
                safeWidth: rule.safe_width, safeHeight: rule.safe_height, repair: rule.repair },
            templates: items.filter(t => t.enabled === 1).map(t => ({
                id: t.id, name: t.name, kind: t.kind as InventoryTemplate["kind"],
                width: t.width, height: t.height, rotate: t.rotate === 1, battle: t.battle === 1,
                safe: t.safe === 1, stack: t.stack, bagWidth: t.bag_width, bagHeight: t.bag_height,
                icon: t.icon.startsWith("ui/") ? t.icon : `ui/atlas/module/inventory/${t.icon}.png`,
                quality: t.quality,
                weight: t.weight, weightLimit: t.weight_limit, staminaRestore: t.stamina_restore,
            })),
            fixtures: [],
        };
        return config;
    }
}
