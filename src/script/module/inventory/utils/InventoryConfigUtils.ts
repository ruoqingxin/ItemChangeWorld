import type { Tables } from "../../../config/schema";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";
import { InventoryRules } from "./InventoryRules";
import type { InventoryConfig, InventoryTemplate } from "../types/InventoryTypes";

export class InventoryConfigUtils {
    static read(tables: Tables): InventoryConfig {
        const rule = tables.new_inventory_rule.get(1);
        if (!rule) throw new Error("三空间规则表缺失");
        const config: InventoryConfig = {
            build: BuildConfigUtils.read(tables),
            spaces: { battleWidth: rule.battle_width, battleHeight: rule.battle_height,
                safeWidth: rule.safe_width, safeHeight: rule.safe_height, repair: rule.repair },
            templates: tables.new_inventory_item.getDataList().map(t => ({
                id: t.id, name: t.name, kind: t.kind as InventoryTemplate["kind"],
                width: t.width, height: t.height, rotate: t.rotate === 1, battle: t.battle === 1,
                safe: t.safe === 1, stack: t.stack, potionId: t.potion_id, bagWidth: t.bag_width, bagHeight: t.bag_height,
                icon: t.icon.startsWith("ui/") ? t.icon : `ui/atlas/module/inventory/${t.icon}.png`,
                quality: t.quality,
                weight: t.weight, weightLimit: t.weight_limit, staminaRestore: t.stamina_restore,
            })),
            fixtures: tables.new_inventory_fixture.getDataList().map(f => ({
                id: f.id, templateId: f.item_id, count: f.count, node: f.node, durability: f.durability,
            })),
        };
        InventoryRules.validateConfig(config, BuildConfigUtils.profile(config.build));
        return config;
    }
}
