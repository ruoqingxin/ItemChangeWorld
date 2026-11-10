import type { Tables } from "../../../config/schema";
import { NewInventoryConfigUtils } from "./NewInventoryConfigUtils";
import { NewBuildConfigUtils } from "./NewBuildConfigUtils";
import { NewExpeditionRules } from "./NewExpeditionRules";
import type { ExpeditionConfig } from "./NewExpeditionTypes";

export class NewExpeditionConfigUtils {
    static read(tables: Tables): ExpeditionConfig {
        const base = NewInventoryConfigUtils.read(tables), r = tables.new_expedition_rule.get(1);
        if (!r) throw new Error("正式地图规则表缺失");
        base.build.setup.rulesId = r.map_version;
        const nodes = tables.new_expedition_node.getDataList().map(n => ({
            id: n.id, key: n.key, kind: n.kind, name: n.name, enemy: n.enemy, pool: n.pool,
            mainOrder: n.main_order, x: n.x, y: n.y,
        }));
        const enemies = tables.new_expedition_enemy.getDataList();
        base.build.encounters = nodes.filter(n => n.enemy).map(n => {
            const e = enemies.find(e => e.id === n.enemy);
            if (!e) throw new Error("节点敌人配置缺失");
            return { id: `battle:${n.key}`, elite: n.kind !== "normal", borrow: false, daoyun: e.daoyun,
                enemy: { id: enemies.indexOf(e)+1, name: e.name, maxHp: e.hp*100,
                    intents: tables.new_expedition_intent.getDataList().filter(i => i.enemy === e.id)
                        .sort((a,b) => a.order-b.order).map(i => ({
                            id: i.id, name: i.charging ? "蓄力重击" : i.block ? "架盾" : "进攻",
                            damage: i.damage*100, block: i.block*100, charging: i.charging === 1,
                        })) } };
        });
        const config: ExpeditionConfig = { ...base, groundNodeLimit: 32,
            fixtures: [[r.weapon_id,1,60],[r.container_id,1,0],[r.hp_id,2,0],[r.mp_id,2,0],[r.repair_id,1,0]]
                .map(([templateId,count,durability],i) => ({ id:i+1,templateId,count,durability,node:0 })),
            mapVersion: r.map_version, nodes,
            edges: tables.new_expedition_edge.getDataList().map(e => [e.from_node,e.to_node]),
            placements: tables.new_expedition_placement.getDataList().map(v =>
                ({ group:v.group,a:v.a,b:v.b,weight:v.weight })),
            variants: tables.new_expedition_variant.getDataList().map(v =>
                ({ family:v.family,templateId:v.item_id,weight:v.weight })),
            pools: tables.new_expedition_pool.getDataList().map(p => ({
                id:p.id,min:p.min_count,max:p.max_count,minWeight:p.min_weight,durability:[p.dur_min,p.dur_max],
                categories:[p.hp,p.mp,p.repair,p.herb,p.ore,p.small,p.book,p.container,p.weapon],
                qualities:[p.q1,p.q2,p.q3,p.q4,p.q5,p.q6],
            })),
            rules: { limitMs:r.limit_ms,searchMs:r.search_ms,checkpointMs:r.checkpoint_ms,recoveryPercent:r.recovery_percent,
                supply:[r.supply_hp,r.supply_mp,r.supply_repair],books:[r.book_sword,r.book_earth,r.book_common],
                weaponId:r.weapon_id,containerId:r.container_id,hpId:r.hp_id,mpId:r.mp_id,repairId:r.repair_id },
        };
        NewExpeditionRules.validateConfig(config,NewBuildConfigUtils.profile(config.build));
        return config;
    }
}
