import { EMapNodeKind, EQuality, Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import { configCategory, LOOT_FAMILIES, MAP_NODE_KINDS } from "../../../config/ConfigCategories";
import { InventoryConfigUtils } from "../../inventory/utils/InventoryConfigUtils";

import { ExpeditionRules } from "./ExpeditionRules";
import type { ExpeditionConfig } from "../types/ExpeditionRunTypes";
import { EXPEDITION_LOOT_FAMILIES } from "../types/ExpeditionRunTypes";


export class ExpeditionRunConfigUtils {
    static read(tables: Tables): ExpeditionConfig {
        const base = InventoryConfigUtils.read(tables), r = tables.map_rule.get(1);
        if (!r) throw new Error("正式地图规则表缺失");
        const searches = new Map(byConfigId(tables.map_search.getDataList(), "搜索参数表").map(row => {
            if (tables.map_node.get(row.id)?.kind !== EMapNodeKind.search)
                throw new Error(`搜索参数引用的节点无效：${row.id}`);
            return [row.id, row] as const;
        }));
        const nodes = byConfigId(tables.map_node.getDataList(), "地图节点表").map(n => {
            const search = searches.get(n.id);
            if (n.kind === EMapNodeKind.search && !search)
                throw new Error(`搜索节点缺少专属参数：${n.id}`);
            return {
                id: n.id, key: n.key, kind: configCategory(n.kind, MAP_NODE_KINDS, "地图节点类别"), name: n.name, poolId: n.pool_id,
                mainOrder: n.main_order, x: n.x, y: n.y,
                ...(search ? { icon: search.icon, searchMin: search.min_count,
                    searchMax: search.max_count, searchWeight: search.weight } : {}),
            };
        });
        const categories = new Map<number, Map<string, number>>();
        for (const row of byConfigId(tables.map_pool_category.getDataList(), "掉落类别权重表")) {
            const family = configCategory(row.family, LOOT_FAMILIES, "掉落类别");
            if (!tables.map_pool.get(row.pool_id) || !Number.isSafeInteger(row.weight) || row.weight < 0)
                throw new Error(`掉落类别权重或掉落池引用无效：${row.id}`);
            const weights = categories.get(row.pool_id) ?? new Map<string, number>();
            if (weights.has(family)) throw new Error(`掉落池类别权重重复：${row.pool_id}/${family}`);
            weights.set(family, row.weight); categories.set(row.pool_id, weights);
        }
        const qualities = new Map<number, Map<EQuality, number>>();
        for (const row of byConfigId(tables.map_pool_quality.getDataList(), "掉落品质权重表")) {
            if (!tables.map_pool.get(row.pool_id) || !Number.isSafeInteger(row.quality) ||
                row.quality < EQuality.normal || row.quality > EQuality.legendary ||
                !Number.isSafeInteger(row.weight) || row.weight < 0)
                throw new Error(`掉落品质权重或掉落池引用无效：${row.id}`);
            const weights = qualities.get(row.pool_id) ?? new Map<EQuality, number>();
            if (weights.has(row.quality)) throw new Error(`掉落池品质权重重复：${row.pool_id}/${row.quality}`);
            weights.set(row.quality, row.weight); qualities.set(row.pool_id, weights);
        }
        const weaponRanges = new Map(byConfigId(tables.map_pool_weapon.getDataList(), "武器掉落耐久表").map(row => {
            const weaponWeight = categories.get(row.id)?.get("weapon");
            if (!tables.map_pool.get(row.id) || !weaponWeight ||
                !Number.isSafeInteger(row.dur_min) || row.dur_min < 0 ||
                !Number.isSafeInteger(row.dur_max) || row.dur_max < row.dur_min)
                throw new Error(`武器掉落耐久或掉落池引用无效：${row.id}`);
            return [row.id, row] as const;
        }));
        const pools = byConfigId(tables.map_pool.getDataList(), "掉落池表").map(p => {
            const category = categories.get(p.id), quality = qualities.get(p.id), weapon = weaponRanges.get(p.id);
            if (category?.size !== EXPEDITION_LOOT_FAMILIES.length || quality?.size !== 6 ||
                (category.get("weapon")! > 0 && !weapon))
                throw new Error(`掉落池缺少类别、品质或武器耐久配置：${p.id}`);
            return {id:p.id,code:p.code,min:p.min_count,max:p.max_count,minWeight:p.min_weight,
                durability:[weapon?.dur_min ?? 0,weapon?.dur_max ?? 0] as [number,number],
                categories:EXPEDITION_LOOT_FAMILIES.map(family=>category.get(family)!),
                qualities:[1,2,3,4,5,6].map(q=>quality.get(q)!)};
        });
        const config: ExpeditionConfig = { ...base,
            mapVersion: r.map_version, nodes,
            variants: byConfigId(tables.map_variant.getDataList(), "掉落条目表").map(v =>
                ({ family:configCategory(v.family, LOOT_FAMILIES, "掉落类别"),templateId:v.item_id,weight:v.weight })),
            pools,
            rules: { limitMs:r.limit_ms,searchMs:r.search_ms,recoveryPercent:r.recovery_percent,
                staminaMax:r.stamina_max,moveCost:r.move_cost,normalCost:r.normal_cost,eliteCost:r.elite_cost,
                bossCost:r.boss_cost,searchCost:r.search_cost,moveHpPercent:r.move_hp_percent,searchHpPercent:r.search_hp_percent,
                transitMin:r.transit_min,transitMax:r.transit_max,searchMin:r.search_min,searchMax:r.search_max,
                normalMin:r.normal_min,normalMax:r.normal_max,eliteMin:r.elite_min,eliteMax:r.elite_max,
                insightMin:r.insight_min,insightMax:r.insight_max,borrowMin:r.borrow_min,borrowMax:r.borrow_max },
        };
        ExpeditionRules.validateConfig(config);
        return config;
    }
}
