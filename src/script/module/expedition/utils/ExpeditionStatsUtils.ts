import type { ISkillBattleState, ISkillBattleSetup, SkillBattleEvent } from "../../skillBattle/types/SkillBattleTypes";
import { SkillBattleFormulaUtils as Rules } from "../../skillBattle/utils/SkillBattleFormulaUtils";
import { SkillBattleDebugUtils } from "../../skillBattle/utils/SkillBattleDebugUtils";
import type { IExpeditionReport, IExpeditionState } from "../types/ExpeditionTypes";

export interface IExpeditionBattleStats {
    enemyId: number;
    startHp: number;
    endHp: number;
    rounds: number;
    result: string;
    skillUses: number[];
    medicineUses: number;
    blockAbsorbed: number;
    interrupts: number;
    damage: number;
    burnDamage: number;
    incomingDamage: number;
    healed: number;
    qiGenerated: number;
    qiSpent: number;
    qiOverflow: number;
    stonesUsed: number;
    durabilitySpent: number;
    upgradeIds: number[];
    logs: string[];
    state: ISkillBattleState;
}

/** Replays committed actions only; previews and animation events never enter this ledger. */
export class ExpeditionStatsUtils {
    static create(run: Pick<IExpeditionState, "runId" | "seed" | "battle">, partial = false): IExpeditionReport {
        return { runId: run.runId, seed: run.seed, partial,
            battles: [{ initial: Rules.cloneState(run.battle), actions: [] }], choices: [],
            outcome: null, exitEncounter: null, broughtLoot: [], remainingPouch: [],
            collectionUnlockIds: [] };
    }

    static battle(record: IExpeditionReport["battles"][number], setup: ISkillBattleSetup): IExpeditionBattleStats {
        let state = Rules.cloneState(record.initial);
        const stats: IExpeditionBattleStats = {
            enemyId: state.enemyId, startHp: state.player.hp, endHp: state.player.hp,
            rounds: 0, result: state.phase, skillUses: [0, 0, 0, 0], medicineUses: 0,
            blockAbsorbed: 0, interrupts: 0, damage: 0, burnDamage: 0, incomingDamage: 0, healed: 0,
            qiGenerated: 0, qiSpent: 0, qiOverflow: 0, stonesUsed: 0, durabilitySpent: 0,
            upgradeIds: state.upgradeIds.slice(), logs: [], state,
        };
        for (const action of record.actions) {
            const before = state, result = Rules.resolveAction(setup, state, action);
            if (!result.ok) throw new Error("行动记录无法重放");
            state = result.state;
            stats.rounds++;
            if (action.type === "skill") {
                stats.skillUses[action.skillId - 1]++;
                stats.qiGenerated += setup.skills.find(row => row.id === action.skillId)!.qiGain;
                stats.qiSpent += result.preview!.qiCost;
                if (action.stoneItemUid) stats.stonesUsed++;
            } else stats.medicineUses++;
            stats.durabilitySpent += before.weaponDurability - state.weaponDurability;
            for (const event of result.events) this.count(stats, event);
            const name = action.type === "skill" ? setup.skills.find(row => row.id === action.skillId)!.name : "疗伤丹";
            stats.logs.push(`第${before.round}回合 ${name}${action.type === "skill" && action.stoneItemUid ? "·注灵" : ""}`
                + ` 生命 ${before.player.hp}→${state.player.hp} 敌 ${before.enemy.hp}→${state.enemy.hp}`,
                ...result.events.map(event => SkillBattleDebugUtils.formatEvent(event)));
        }
        stats.state = state;
        stats.endHp = state.player.hp;
        stats.result = state.phase;
        return stats;
    }

    private static count(stats: IExpeditionBattleStats, event: SkillBattleEvent): void {
        if (event.type === "damage") {
            if (event.target === "player") {
                stats.blockAbsorbed += event.blockAbsorbed;
                stats.incomingDamage += event.hpLoss;
            } else stats.damage += event.hpLoss;
        } else if (event.type === "burn_damage") {
            stats.burnDamage += event.hpLoss;
            stats.damage += event.hpLoss;
        } else if (event.type === "intent_interrupted") stats.interrupts++;
        else if (event.type === "qi_changed") stats.qiOverflow += event.overflow;
        else if (event.type === "healed") stats.healed += event.amount;
    }
}
