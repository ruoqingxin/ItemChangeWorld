import type { Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import { InventoryConfigUtils } from "../../inventory/utils/InventoryConfigUtils";

import { ExpeditionRules } from "./ExpeditionRules";
import type { ExpeditionConfig } from "../types/ExpeditionRunTypes";


export class ExpeditionRunConfigUtils {
    static read(tables: Tables): ExpeditionConfig {
        const base = InventoryConfigUtils.read(tables), r = tables.map_rule.get(1);
        if (!r) throw new Error("正式地图规则表缺失");
        const nodes = byConfigId(tables.map_node.getDataList(), "地图节点表").map(n => ({
            id: n.id, key: n.key, kind: n.kind, name: n.name, poolId: n.pool_id,
            mainOrder: n.main_order, x: n.x, y: n.y,
            ...(n.kind === "search" ? { icon: n.icon, searchMin: n.search_min,
                searchMax: n.search_max, searchWeight: n.search_weight } : {}),
        }));
        const startingItems = [[r.weapon_id,"weapon"],[r.container_id,"container"],[r.hp_id,"hp"],
            [r.mp_id,"mp"],[r.repair_id,"repair"]] as const;
        for (const [id, kind] of startingItems) {
            const item = tables.item.get(id);
            if (item?.kind !== kind || item.enabled !== 1)
                throw new Error(`起始物品编号 ${id} 未指向已投放的 ${kind} 类物品`);
        }
        const config: ExpeditionConfig = { ...base,
            fixtures: [[r.weapon_id,1,base.build.setup.weapon!.maxDurability],[r.container_id,1,0],
                [r.hp_id,2,0],[r.mp_id,2,0],[r.repair_id,1,0]]
                .concat(base.templates.filter(t=>t.kind==="stamina").map(t=>[t.id,1,0]))
                .map(([templateId,count,durability],i) => ({ id:i+1,templateId,count,durability,node:0 })),
            mapVersion: r.map_version, nodes,
            variants: byConfigId(tables.map_variant.getDataList(), "掉落条目表").map(v =>
                ({ family:v.family,templateId:v.item_id,weight:v.weight })),
            pools: byConfigId(tables.map_pool.getDataList(), "掉落池表").map(p => ({
                id:p.id,code:p.code,min:p.min_count,max:p.max_count,minWeight:p.min_weight,durability:[p.dur_min,p.dur_max],
                categories:[p.hp,p.mp,p.repair,p.herb,p.ore,p.small,p.book,p.container,p.weapon],
                qualities:[p.q1,p.q2,p.q3,p.q4,p.q5,p.q6],
            })),
            rules: { limitMs:r.limit_ms,searchMs:r.search_ms,recoveryPercent:r.recovery_percent,
                books:[r.book_sword,r.book_earth,r.book_common],
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
