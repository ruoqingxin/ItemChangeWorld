import type { Tables } from "../../../config/schema";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";

import type { InventoryConfig, InventoryTemplate } from "../types/InventoryTypes";

export class InventoryConfigUtils {
    static read(tables: Tables): InventoryConfig {
        const rule = tables.inventory_rule.get(1);
        if (!rule) throw new Error("三空间规则表缺失");
        const config: InventoryConfig = {
            nodeLimit: 65,
            weight: { base: rule.base_weight, sourcePages: rule.source_pages },
            staminaMax: tables.map_rule.get(1).stamina_max,
            build: BuildConfigUtils.read(tables),
            spaces: { battleWidth: rule.battle_width, battleHeight: rule.battle_height,
                safeWidth: rule.safe_width, safeHeight: rule.safe_height, repair: rule.repair },
            templates: tables.item.getDataList().map(t => ({
                id: t.id, name: t.name, kind: t.kind as InventoryTemplate["kind"],
                width: t.width, height: t.height, rotate: t.rotate === 1, battle: t.battle === 1,
                safe: t.safe === 1, stack: t.stack, potionId: t.potion_id, bagWidth: t.bag_width, bagHeight: t.bag_height,
                icon: t.icon.startsWith("ui/") ? t.icon : `ui/atlas/module/inventory/${t.icon}.png`,
                quality: t.quality,
                weight: t.weight, weightLimit: t.weight_limit, staminaRestore: t.stamina_restore,
            })),
            fixtures: [],
        };
        return config;
    }
}
