import type { Tables } from "../../../config/schema";
import type { BuildConfig } from "../types/BuildTypes";
import type { RogueEnemyId } from "../../skillBattle/types/QingmingTypes";
import { QingmingBuildRules } from "./QingmingBuildRules";
import { QingmingConfig } from "../../skillBattle/utils/QingmingConfig";
import { GuzongEnemyRules } from "../../skillBattle/utils/GuzongEnemyRules";

export class BuildConfigUtils {
    static read(tables: Tables): BuildConfig {
        QingmingConfig.load(tables);
        GuzongEnemyRules.load(tables);
        const value = (id: string): number => {
            const row = tables.battle_rule.get(id);
            if (!row || !Number.isSafeInteger(row.value) || row.value < 0) throw new Error(`整数战斗规则缺失：${id}`);
            return row.value;
        };
        const rule = tables.map_rule.get(1);
        const first = tables.enemy.getDataList()[0];
        if (!rule || !first || value("version") !== 1) throw new Error("战斗或地图规则缺失");
        return {
            qingming: {version: rule.map_version, battleRewards: value("battle_rewards"),
                enemy: {hp: value("enemy_hp"), mp: value("enemy_mp"), attack: value("enemy_attack"), defense: value("enemy_defense")}},
            setup: {
                rulesId: rule.map_version,
                player: {maxHp: value("player_hp"), maxMp: value("player_mp"),
                    baseAttack: value("base_attack"), baseDefense: value("base_defense")},
                weapon: {id: rule.weapon_id, name: tables.item.get(rule.weapon_id).name,
                    attack: value("weapon_attack"), defense: value("weapon_defense"), durability: 60, maxDurability: 60},
                potions: tables.potion.getDataList().map(p => ({itemId: p.id, name: p.name,
                    resource: p.resource as "hp" | "mp", amount: p.amount})),
                qingming: {enemyId: first.id as RogueEnemyId, enemyMp: value("enemy_mp"),
                    enemyAttack: value("enemy_attack"), enemyDefense: value("enemy_defense"),
                    seed: 17, loadout: QingmingBuildRules.empty(17)},
                enemy: {id: 1, name: first.name, maxHp: value("enemy_hp")},
            },
            encounters: tables.map_node.getDataList().filter(n => n.enemy).map((n, i) => {
                const enemyId: RogueEnemyId = n.kind === "boss" ? "tortoise" : n.kind === "elite" ? "gatekeeper" : "patrol";
                return {id: `battle:${n.key}`, qingmingEnemy: enemyId,
                    enemy: {id: i + 1, name: GuzongEnemyRules.enemies[enemyId].name, maxHp: value("enemy_hp")}};
            }),
        };
    }

}
