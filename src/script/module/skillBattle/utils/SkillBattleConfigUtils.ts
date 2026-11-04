import type { Tables } from "../../../config/schema";
import type {
    ISkillBattleSetup,
    ISkillConfig,
    ISkillIntentConfig,
    ISkillItemConfig,
    SkillItemUseType,
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
            items: this.readItems(tables),
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

    private static readItems(tables: Tables): ISkillItemConfig[] {
        if (!tables.skill_item_use) throw new Error("[SkillBattle] 请重新导出阶段 C 物品配置");
        const slots = new Set<number>();
        return tables.skill_item_use.getDataList().filter(row => row.enabled === 1).map(row => {
            const display = this.enabled(tables.item.get(row.item_id), `item ${row.item_id}`);
            if (!["fire_stone", "earth_stone", "heal"].includes(row.use_type))
                throw new Error(`[SkillBattle] Unsupported item use ${row.use_type}`);
            const initialSlot = this.integer(row.initial_slot, "initial_slot");
            if (initialSlot > 5 || (initialSlot > 0 && slots.has(initialSlot)))
                throw new Error("[SkillBattle] Invalid or duplicate initial pouch slot");
            if (initialSlot) slots.add(initialSlot);
            const stone = row.use_type === "heal" ? null : tables.element_stone.getDataList()
                .find(value => value.item_id === row.item_id && value.enabled === 1);
            const healValue = this.integer(row.heal_value, "heal_value");
            const burnStacks = this.integer(row.burn_stacks, "burn_stacks");
            const blockValue = this.integer(row.block_value, "block_value");
            if (row.use_type === "heal" ? healValue <= 0 || burnStacks !== 0 || blockValue !== 0
                : !stone || stone.element !== (row.use_type === "fire_stone" ? 4 : 5) || healValue !== 0 ||
                    (row.use_type === "fire_stone" ? burnStacks <= 0 || blockValue !== 0 : blockValue <= 0 || burnStacks !== 0))
                throw new Error(`[SkillBattle] Incompatible item effects ${row.item_id}`);
            return {
                itemId: row.item_id, name: display.name, useType: row.use_type as SkillItemUseType,
                initialSlot, healValue, burnStacks, blockValue,
                element: stone?.element || 0,
                damageRate: stone ? this.integer(stone.damage_rate, "damage_rate") : 0,
                durabilityCost: stone ? this.integer(stone.durability_cost, "durability_cost") : 0,
            };
        });
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
