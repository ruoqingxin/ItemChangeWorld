import { EMapNodeKind, Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import { configCategory, POTION_RESOURCES } from "../../../config/ConfigCategories";
import type { BuildConfig } from "../types/BuildTypes";
import { CombatConfig, ENEMIES, RULES, START_SKILLS, combatSignature } from "../../skillBattle/utils/CombatConfig";

export class BuildConfigUtils {
    static read(tables:Tables):BuildConfig {
        CombatConfig.load(tables);
        const version=tables.map_rule.get(1)?.map_version;
        if(!version)throw new Error("地图配置缺失");
        const first=ENEMIES[0],p=RULES.player;
        return {version,combatSignature:combatSignature(),setup:{
            rulesId:version,skills:START_SKILLS.slice(),enemyId:first.id,pressure:0,equipment:[],weapon:null,
            player:{maxHp:p.hp,maxMp:p.mp,baseAttack:p.a,baseSpirit:p.s,baseDefense:p.armor,baseSpeed:p.speed},
            enemy:{id:first.id,name:first.name,maxHp:first.hp},
            potions:byConfigId(tables.potion.getDataList(),"药效表").map(effect=>{
                const link=tables.potion_item.getDataList().find(v=>v.potion_id===effect.id),item=link&&tables.item.get(link.id);
                if(!item)throw new Error("药效缺少实际物品");
                return {itemId:item.id,name:item.name,resource:configCategory(effect.resource,POTION_RESOURCES,"药效资源"),
                    amount:effect.amount,secondaryAmount:effect.secondary_amount};
            }),
        },encounters:byConfigId(tables.map_node.getDataList(),"地图节点表")
            .filter(n=>[EMapNodeKind.normal,EMapNodeKind.elite,EMapNodeKind.boss].includes(n.kind)).map(n=>{
                const enemy=ENEMIES.find(e=>e.tier===(n.kind===EMapNodeKind.boss?3:n.kind===EMapNodeKind.elite?2:1));
                return {id:`battle:${n.key}`,enemyId:enemy.id,enemy:{id:enemy.id,name:enemy.name,maxHp:enemy.hp}};
            })};
    }
}
