import type { Tables } from "../../../config/schema";
import { NewBuildConfigUtils } from "./NewBuildConfigUtils";
import { NewInventoryRules } from "./NewInventoryRules";
import type { InventoryConfig, InventoryTemplate } from "./NewInventoryTypes";

export class NewInventoryConfigUtils {
    static read(tables: Tables): InventoryConfig {
        const rule = tables.new_inventory_rule.get(1);
        if (!rule) throw new Error("三空间规则表缺失");
        const config: InventoryConfig = {
            build: NewBuildConfigUtils.read(tables),
            spaces: { battleWidth: rule.battle_width, battleHeight: rule.battle_height,
                safeWidth: rule.safe_width, safeHeight: rule.safe_height, repair: rule.repair },
            templates: tables.new_inventory_item.getDataList().map(t => ({
                id: t.id, name: t.name, kind: t.kind as InventoryTemplate["kind"],
                width: t.width, height: t.height, rotate: t.rotate === 1, battle: t.battle === 1,
                safe: t.safe === 1, stack: t.stack, potionId: t.potion_id, bagWidth: t.bag_width, bagHeight: t.bag_height,
                icon: t.icon.startsWith("ui/") ? t.icon : `ui/atlas/module/inventory/${t.icon}.png`,
                quality: t.quality,
            })),
            fixtures: tables.new_inventory_fixture.getDataList().map(f => ({
                id: f.id, templateId: f.item_id, count: f.count, node: f.node, durability: f.durability,
            })),
        };
        NewInventoryRules.validateConfig(config, NewBuildConfigUtils.profile(config.build));
        return config;
    }
}
