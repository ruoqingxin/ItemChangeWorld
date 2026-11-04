import type {
    ISkillActionPreview,
    ISkillActionResolution,
    ISkillBattleAction,
    ISkillBattleSetup,
    ISkillBattleState,
    ISkillIntentConfig,
    SkillBattleEvent,
    SkillBattleSide,
} from "../types/SkillBattleTypes";

export class SkillBattleFormulaUtils {
    static startBattle(setup: ISkillBattleSetup, battleId: string): ISkillBattleState {
        return {
            battleId,
            encounterId: setup.encounterId,
            phase: "player_input",
            revision: 0,
            round: 1,
            player: { hp: setup.playerMaxHp, maxHp: setup.playerMaxHp, block: 0 },
            enemy: { hp: setup.enemy.maxHp, maxHp: setup.enemy.maxHp, block: 0 },
            swordQi: setup.startQi,
            swordQiMax: setup.qiMax,
            enemyId: setup.enemy.id,
            enemyIntentIndex: 0,
            weaponDurability: setup.weaponDurability,
        };
    }

    static cloneState(state: ISkillBattleState): ISkillBattleState {
        return { ...state, player: { ...state.player }, enemy: { ...state.enemy } };
    }

    static currentIntent(setup: ISkillBattleSetup, state: ISkillBattleState): ISkillIntentConfig {
        return setup.enemy.intents[state.enemyIntentIndex];
    }

    static previewAction(
        setup: ISkillBattleSetup,
        snapshot: ISkillBattleState,
        action: ISkillBattleAction,
    ): ISkillActionResolution {
        return this.resolveAction(setup, snapshot, action);
    }

    /** Compute the complete round on a copy. Only the manager commits the result. */
    static resolveAction(
        setup: ISkillBattleSetup,
        snapshot: ISkillBattleState,
        action: ISkillBattleAction,
    ): ISkillActionResolution {
        const reject = (reason: string): ISkillActionResolution => ({
            ok: false, reason, state: this.cloneState(snapshot), events: [], preview: null,
        });
        if (snapshot.phase !== "player_input") {
            return reject("当前不是可行动阶段");
        }
        if (snapshot.encounterId !== setup.encounterId || snapshot.enemyId !== setup.enemy.id ||
            snapshot.player.hp <= 0 || snapshot.enemy.hp <= 0) {
            return reject("战斗快照与当前遭遇不匹配或战斗已结束");
        }
        if (!action || action.type !== "skill" || !Number.isSafeInteger(action.skillId)) {
            return reject("无效行动，阶段 A 只支持招式");
        }
        if ("stoneItemUid" in action) {
            return reject("阶段 A 尚未开放注灵");
        }
        const skill = setup.skills.find(row => row.id === action.skillId);
        if (!skill) {
            return reject("当前武器没有这个招式");
        }
        if (snapshot.swordQi < skill.qiCost) {
            return reject(`剑势不足，需要 ${skill.qiCost}，当前 ${snapshot.swordQi}`);
        }
        const intent = this.currentIntent(setup, snapshot);
        if (!intent) {
            return reject("当前敌人意图不存在");
        }

        const state = this.cloneState(snapshot);
        const events: SkillBattleEvent[] = [];
        const preview: ISkillActionPreview = {
            token: { battleId: snapshot.battleId, revision: snapshot.revision },
            qiCost: skill.qiCost,
            qiAfterAction: 0,
            baseDamage: skill.damage,
            blockAbsorbed: 0,
            enemyHpLoss: 0,
            blockGained: skill.block,
            interrupted: false,
            enemyDamage: 0,
            playerBlockAbsorbed: 0,
            playerHpLoss: 0,
        };
        state.phase = "resolving";
        state.revision++;
        events.push({ type: "skill_used", skillId: skill.id, name: skill.name });
        const beforeQi = state.swordQi;
        const availableQi = beforeQi - skill.qiCost + skill.qiGain;
        state.swordQi = Math.min(state.swordQiMax, availableQi);
        preview.qiAfterAction = state.swordQi;
        events.push({
            type: "qi_changed", before: beforeQi, after: state.swordQi,
            overflow: Math.max(0, availableQi - state.swordQiMax),
        });
        if (skill.damage > 0) {
            const hit = this.damage(state, "player", "enemy", skill.damage);
            events.push(hit);
            preview.blockAbsorbed = hit.blockAbsorbed;
            preview.enemyHpLoss = hit.hpLoss;
        }
        if (skill.block > 0) {
            state.player.block += skill.block;
            events.push({ type: "block_gained", target: "player", amount: skill.block });
        }
        if (state.enemy.hp === 0) {
            this.finish(state, events, "victory");
            return { ok: true, state, events, preview };
        }

        // Enemy block lasts through one player action, including a non-attack action.
        this.clearBlock(state, "enemy", events);
        preview.interrupted = skill.interrupts && intent.interruptible;
        if (preview.interrupted) {
            events.push({ type: "intent_interrupted", intentId: intent.id, name: intent.name });
        } else {
            events.push({ type: "intent_executed", intentId: intent.id, name: intent.name });
            if (intent.type === "attack") {
                const hit = this.damage(state, "enemy", "player", intent.damage);
                events.push(hit);
                preview.enemyDamage = hit.amount;
                preview.playerBlockAbsorbed = hit.blockAbsorbed;
                preview.playerHpLoss = hit.hpLoss;
            } else if (intent.type === "block" && intent.block > 0) {
                state.enemy.block += intent.block;
                events.push({ type: "block_gained", target: "enemy", amount: intent.block });
            }
        }
        if (state.player.hp === 0) {
            this.finish(state, events, "defeat");
            return { ok: true, state, events, preview };
        }
        this.clearBlock(state, "player", events);
        state.enemyIntentIndex = (state.enemyIntentIndex + 1) % setup.enemy.intents.length;
        state.round++;
        state.phase = "player_input";
        const nextIntent = this.currentIntent(setup, state);
        events.push({ type: "round_started", round: state.round, intentId: nextIntent.id, name: nextIntent.name });
        return { ok: true, state, events, preview };
    }

    private static damage(
        state: ISkillBattleState,
        source: SkillBattleSide,
        target: SkillBattleSide,
        amount: number,
    ): Extract<SkillBattleEvent, { type: "damage" }> {
        const unit = state[target];
        const blockAbsorbed = Math.min(unit.block, amount);
        const hpLoss = Math.min(unit.hp, amount - blockAbsorbed);
        unit.block -= blockAbsorbed;
        unit.hp -= hpLoss;
        return { type: "damage", source, target, amount, blockAbsorbed, hpLoss };
    }

    private static clearBlock(state: ISkillBattleState, target: SkillBattleSide, events: SkillBattleEvent[]): void {
        const amount = state[target].block;
        if (amount > 0) {
            state[target].block = 0;
            events.push({ type: "block_cleared", target, amount });
        }
    }

    private static finish(
        state: ISkillBattleState,
        events: SkillBattleEvent[],
        result: "victory" | "defeat",
    ): void {
        state.phase = result;
        this.clearBlock(state, "player", events);
        this.clearBlock(state, "enemy", events);
        state.swordQi = 0;
        events.push({ type: "battle_ended", result });
    }
}
