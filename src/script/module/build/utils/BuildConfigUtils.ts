import { EItemKind, EMapNodeKind, Tables } from "../../../config/schema";
import { byConfigId } from "../../../config/ConfigRows";
import { configCategory, ITEM_KINDS, POTION_RESOURCES } from "../../../config/ConfigCategories";
import type { BuildConfig } from "../types/BuildTypes";
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
        const startingWeapon = byConfigId(tables.inventory_start.getDataList(), "起始物品表")
            .filter(row => tables.item.get(row.item_id)?.kind === EItemKind.weapon);
        if (startingWeapon.length !== 1 || startingWeapon[0].count !== 1)
            throw new Error("起始物品必须指定一件武器");
        const weapon = tables.item.get(startingWeapon[0].item_id);
        const attributes = tables.weapon.get(startingWeapon[0].item_id);
        if (!weapon || weapon.enabled !== 1 || !attributes)
            throw new Error(`起始武器的物品编号无效：${startingWeapon[0].item_id}`);
        byConfigId(tables.potion.getDataList(), "药效表");
        const potions = byConfigId(tables.item.getDataList(), "物品表").flatMap(item => {
            const kind = configCategory(item.kind, ITEM_KINDS, "物品类别");
            const link = tables.potion_item.get(item.id);
            if (!["hp","mp","mixed","shield"].includes(kind)) {
                if (link) throw new Error(`非药品不能引用药效：${item.id}`);
                return [];
            }
            const effect = link && tables.potion.get(link.potion_id);
            if (!effect || configCategory(effect.resource, POTION_RESOURCES, "药效资源") !== kind ||
                !Number.isSafeInteger(effect.amount) || effect.amount <= 0 ||
                !Number.isSafeInteger(effect.secondary_amount) ||
                (kind === "mixed" ? effect.secondary_amount <= 0 : effect.secondary_amount !== 0))
                throw new Error(`物品 ${item.id} 引用的药效 ${link?.potion_id} 无效`);
            if (item.enabled === 0) return [];
            return [{itemId: item.id, name: item.name, resource: kind as "hp" | "mp" | "mixed" | "shield",
                amount: effect.amount, secondaryAmount: effect.secondary_amount}];
        });
        return {
            qingming: {version: rule.map_version, battleRewards: battle.battle_rewards,
                enemy: {hp: battle.enemy_hp, mp: battle.enemy_mp, attack: battle.enemy_attack, defense: battle.enemy_defense}},
            setup: {
                rulesId: rule.map_version,
                player: {maxHp: battle.player_hp, maxMp: battle.player_mp,
                    baseAttack: battle.base_attack, baseDefense: battle.base_defense},
                weapon: {id: weapon.id, name: weapon.name, attack: attributes.attack, defense: attributes.defense,
                    durability: startingWeapon[0].durability, maxDurability: attributes.durability},
                potions,
                qingming: {enemyId: first, enemyMp: battle.enemy_mp,
                    enemyAttack: battle.enemy_attack, enemyDefense: battle.enemy_defense,
                    seed: 17, loadout: QingmingBuildRules.empty(17)},
                enemy: {id: GuzongEnemyRules.enemies[first].id, name: GuzongEnemyRules.enemies[first].name, maxHp: battle.enemy_hp},
            },
            encounters: byConfigId(tables.map_node.getDataList(), "地图节点表")
                .filter(n => [EMapNodeKind.normal,EMapNodeKind.elite,EMapNodeKind.boss].includes(n.kind)).map(n => {
                const enemyId = n.kind === EMapNodeKind.boss ? "tortoise" : n.kind === EMapNodeKind.elite ? "gatekeeper" : "patrol";
                const enemy = GuzongEnemyRules.enemies[enemyId];
                return {id: `battle:${n.key}`, qingmingEnemy: enemyId,
                    enemy: {id: enemy.id, name: enemy.name, maxHp: battle.enemy_hp}};
            }),
        };
    }

}
