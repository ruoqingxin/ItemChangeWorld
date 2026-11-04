import type { Tables } from "../../../config/schema";
import type {
    ISkillBattleSetup,
    ISkillConfig,
    ISkillIntentConfig,
    SkillIntentType,
} from "../types/SkillBattleTypes";

export class SkillBattleConfigUtils {
    static readEncounter(tables: Tables, encounterId: number): ISkillBattleSetup {
        if (!tables?.skill_encounter) {
            throw new Error("[SkillBattle] New battle tables are not loaded; regenerate and reload config.");
        }
        const encounter = this.enabled(tables.skill_encounter.get(encounterId), `encounter ${encounterId}`);
        const rule = this.enabled(tables.skill_battle_rule.get(encounter.rule_id), `rule ${encounter.rule_id}`);
        if (rule.action_count !== 1 || rule.enable_intent !== 1) {
            throw new Error("[SkillBattle] Phase A requires one action and visible intent.");
        }
        const weapon = this.enabled(tables.weapon.get(encounter.weapon_id), `weapon ${encounter.weapon_id}`);
        const enemy = this.enabled(tables.enemy.get(encounter.enemy_id), `enemy ${encounter.enemy_id}`);
        const slots = tables.weapon_skill.getDataList()
            .filter(row => row.weapon_id === weapon.weapon_id)
            .slice().sort((a, b) => a.slot_index - b.slot_index);
        this.checkOrder(slots.map(row => row.slot_index), "weapon slots");
        const skillIds = new Set<number>();
        const skills: ISkillConfig[] = slots.map(slot => {
            const row = this.enabled(tables.skill.get(slot.skill_id), `skill ${slot.skill_id}`);
            if (skillIds.has(row.skill_id)) {
                throw new Error(`[SkillBattle] Duplicate weapon skill ${row.skill_id}`);
            }
            skillIds.add(row.skill_id);
            return {
                id: row.skill_id,
                name: row.name,
                icon: row.icon,
                qiCost: this.integer(row.qi_cost, "qi_cost"),
                damage: this.integer(row.damage, "damage"),
                block: this.integer(row.block, "block"),
                qiGain: this.integer(row.qi_gain, "qi_gain"),
                canEnchant: this.flag(row.can_enchant, "can_enchant"),
                interrupts: this.flag(row.interrupt_mode, "interrupt_mode"),
            };
        });
        const steps = tables.skill_enemy_intent_step.getDataList()
            .filter(row => row.intent_group_id === encounter.intent_group_id)
            .slice().sort((a, b) => a.step_index - b.step_index);
        this.checkOrder(steps.map(row => row.step_index), "intent steps");
        const intents: ISkillIntentConfig[] = steps.map(step => {
            const row = this.enabled(tables.skill_enemy_intent.get(step.intent_id), `intent ${step.intent_id}`);
            if (!["attack", "charge", "block"].includes(row.intent_type)) {
                throw new Error(`[SkillBattle] Unsupported intent type ${row.intent_type}`);
            }
            const damage = this.integer(row.damage, "intent damage");
            const block = this.integer(row.block, "intent block");
            if ((row.intent_type !== "attack" && damage !== 0) ||
                (row.intent_type !== "block" && block !== 0)) {
                throw new Error(`[SkillBattle] Intent ${row.intent_id} has effects incompatible with its type.`);
            }
            return {
                id: row.intent_id,
                name: row.name,
                icon: row.icon,
                type: row.intent_type as SkillIntentType,
                damage,
                block,
                interruptible: this.flag(row.interruptible, "interruptible"),
            };
        });
        const qiMax = this.integer(rule.qi_max, "qi_max", 1);
        const startQi = this.integer(rule.start_qi, "start_qi");
        if (startQi > qiMax || skills.some(skill => skill.qiCost > qiMax)) {
            throw new Error("[SkillBattle] Starting qi or skill cost exceeds qi_max.");
        }
        return {
            encounterId: encounter.encounter_id,
            order: this.integer(encounter.order, "encounter order", 1),
            playerMaxHp: this.integer(rule.player_hp, "player_hp", 1),
            qiMax,
            startQi,
            weaponId: weapon.weapon_id,
            weaponDurability: this.integer(weapon.max_durability, "max_durability"),
            skills,
            enemy: {
                id: enemy.enemy_id,
                name: enemy.name,
                icon: enemy.icon,
                maxHp: this.integer(enemy.hp, "enemy hp", 1),
                element: enemy.element,
                intents,
            },
        };
    }

    private static enabled<T extends { enabled: number }>(row: T | undefined, label: string): T {
        if (!row || row.enabled !== 1) {
            throw new Error(`[SkillBattle] Missing or disabled ${label}`);
        }
        return row;
    }

    private static integer(value: number, label: string, minimum = 0): number {
        if (!Number.isSafeInteger(value) || value < minimum) {
            throw new Error(`[SkillBattle] Invalid ${label}: ${value}`);
        }
        return value;
    }

    private static flag(value: number, label: string): boolean {
        if (value !== 0 && value !== 1) {
            throw new Error(`[SkillBattle] Invalid ${label}: ${value}`);
        }
        return value === 1;
    }

    private static checkOrder(values: number[], label: string): void {
        if (values.length === 0 || values.some((value, index) => value !== index + 1)) {
            throw new Error(`[SkillBattle] ${label} must be nonempty and contiguous, starting at 1.`);
        }
    }
}
