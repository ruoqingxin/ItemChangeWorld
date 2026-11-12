import type { Tables } from "../../../config/schema";
import { BattleRules } from "./BattleRules";
import type { NewBattleSetup, NewSwordPassive, NewSwordSkill } from "../types/BattleTypes";

export interface NewTrialOptions {
    enemyId: number;
    weapon: "full" | "zero" | "none";
    actives: Array<{ skillId: number; level: number }>;
    passiveIds: number[];
    sword: boolean;
    emptyPouch: boolean;
}

/** Fixture selection is separate from permanent learning and the future two-school pool. */
export class BattleConfigUtils {
    static defaults(): NewTrialOptions {
        return { enemyId: 1, weapon: "full", actives: [
            { skillId: 1, level: 0 }, { skillId: 2, level: 0 }, { skillId: 5, level: 0 },
        ], passiveIds: [1, 2, 3], sword: true, emptyPouch: false };
    }

    static read(tables: Tables, options: NewTrialOptions): NewBattleSetup {
        const rule = tables.new_battle_rule.get(1);
        const enemy = tables.new_battle_enemy.get(options.enemyId);
        if (!rule || !enemy) throw new Error("新版战斗源表缺少规则或敌人");
        const u = (value: number) => value * BattleRules.unit;
        const setup: NewBattleSetup = {
            rulesId: "stage1-approved-2026-11-09",
            player: { maxHp: u(rule.player_hp), maxMp: u(rule.player_mp),
                baseAttack: u(rule.base_attack), baseDefense: u(rule.base_defense) },
            weapon: options.weapon === "none" ? null : { id: 1, name: "试炼剑",
                attack: u(rule.weapon_attack), defense: u(rule.weapon_defense),
                durability: options.weapon === "zero" ? 0 : rule.max_durability,
                maxDurability: rule.max_durability },
            skills: tables.new_sword_skill.getDataList().map(row => ({
                id: row.id, name: row.name, kind: row.kind as NewSwordSkill, school: "sword",
                mpCost: u(row.mp_cost), damagePercent: row.damage_percent,
                shieldPercent: row.shield_percent, shredPercent: row.shred_percent, markPercent: row.mark_percent,
            })),
            passives: tables.new_sword_passive.getDataList().map(row => ({
                id: row.id, name: row.name, kind: row.kind as NewSwordPassive, value: row.value,
            })),
            potions: tables.new_battle_potion.getDataList().map(row => {
                if (row.resource !== "hp" && row.resource !== "mp") throw new Error("药品恢复资源无效");
                return { itemId: row.id, name: row.name, resource: row.resource, amount: u(row.amount) };
            }),
            build: { schools: options.sword ? ["sword"] : [],
                actives: options.sword ? BattleRules.clone(options.actives) : [],
                passiveIds: options.sword ? options.passiveIds.slice() : [] },
            enemy: { id: enemy.id, name: enemy.name, maxHp: u(enemy.hp),
                intents: [enemy.intent1, enemy.intent2, enemy.intent3].map(id => {
                    const row = tables.new_battle_intent.get(id);
                    if (!row) throw new Error(`敌人引用缺失意图 ${id}`);
                    return { id: row.id, name: row.name, damage: u(row.damage),
                        block: u(row.block), charging: row.charging === 1 };
                }) },
        };
        BattleRules.validateSetup(setup);
        return setup;
    }
}
