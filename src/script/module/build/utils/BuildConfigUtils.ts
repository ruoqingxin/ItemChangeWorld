import type { Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import type { BuildConfig } from "../types/BuildTypes";
import { isBattleNode } from "../../expedition/types/ExpeditionRunTypes";
import { QingmingBuildRules } from "./QingmingBuildRules";
import { QingmingConfig } from "../../skillBattle/utils/QingmingConfig";
import { GuzongEnemyRules } from "../../skillBattle/utils/GuzongEnemyRules";

export class BuildConfigUtils {
    static read(tables: Tables): BuildConfig {
        QingmingConfig.load(tables);
        GuzongEnemyRules.load(tables);
        const battle = tables.battle_rule.get(1);
        const rule = tables.map_rule.get(1);
        const first = "patrol";
        if (!rule || !battle || battle.version !== 1 || tables.battle_rule.getDataList().length !== 1)
            throw new Error("战斗或地图规则缺失");
        const weapon = tables.item.get(rule.weapon_id);
        if (!weapon || weapon.kind !== "weapon" || weapon.enabled !== 1)
            throw new Error(`起始武器的物品编号无效：${rule.weapon_id}`);
        byConfigId(tables.potion.getDataList(), "药效表");
        const potions = byConfigId(tables.item.getDataList(), "物品表").flatMap(item => {
            if (item.enabled === 0) return [];
            if (item.kind !== "hp" && item.kind !== "mp") {
                if (item.potion_id !== 0) throw new Error(`非血蓝药不能引用药效：${item.id}`);
                return [];
            }
            const effect = tables.potion.get(item.potion_id);
            if (!effect || effect.resource !== item.kind || !Number.isSafeInteger(effect.amount) || effect.amount <= 0)
                throw new Error(`物品 ${item.id} 引用的药效 ${item.potion_id} 无效`);
            return [{itemId: item.id, name: item.name, resource: item.kind as "hp" | "mp", amount: effect.amount}];
        });
        return {
            qingming: {version: rule.map_version, battleRewards: battle.battle_rewards,
                enemy: {hp: battle.enemy_hp, mp: battle.enemy_mp, attack: battle.enemy_attack, defense: battle.enemy_defense}},
            setup: {
                rulesId: rule.map_version,
                player: {maxHp: battle.player_hp, maxMp: battle.player_mp,
                    baseAttack: battle.base_attack, baseDefense: battle.base_defense},
                weapon: {id: weapon.id, name: weapon.name, attack: battle.weapon_attack, defense: battle.weapon_defense,
                    durability: battle.weapon_max_durability, maxDurability: battle.weapon_max_durability},
                potions,
                qingming: {enemyId: first, enemyMp: battle.enemy_mp,
                    enemyAttack: battle.enemy_attack, enemyDefense: battle.enemy_defense,
                    seed: 17, loadout: QingmingBuildRules.empty(17)},
                enemy: {id: GuzongEnemyRules.enemies[first].id, name: GuzongEnemyRules.enemies[first].name, maxHp: battle.enemy_hp},
            },
            encounters: byConfigId(tables.map_node.getDataList(), "地图节点表").filter(isBattleNode).map(n => {
                const enemyId = n.kind === "boss" ? "tortoise" : n.kind === "elite" ? "gatekeeper" : "patrol";
                const enemy = GuzongEnemyRules.enemies[enemyId];
                return {id: `battle:${n.key}`, qingmingEnemy: enemyId,
                    enemy: {id: enemy.id, name: enemy.name, maxHp: battle.enemy_hp}};
            }),
        };
    }

}
