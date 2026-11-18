import { BattleRules } from "../utils/BattleRules";
import type { BattleAction, BattleCarry, BattleResult, BattleSetup, BattleState, BattleToken } from "../types/BattleTypes";

export class SkillBattleManager {
    private static instance: SkillBattleManager;
    static ins(): SkillBattleManager { return this.instance ||= new SkillBattleManager(); }
    private currentState: BattleState | null = null;
    private currentSetup: BattleSetup | null = null;
    private committing = false;
    beforeCommit: ((state: BattleState, action: BattleAction) => void) | null = null;
    get state(): BattleState | null { return BattleRules.clone(this.currentState); }
    get setup(): BattleSetup | null { return BattleRules.clone(this.currentSetup); }
    start(setup: BattleSetup, battleId: string, carry?: BattleCarry): BattleState {
        this.restore(setup, BattleRules.start(setup, battleId, carry));
        return this.state;
    }
    restore(setup: BattleSetup, state: BattleState): void {
        BattleRules.validateSetup(setup);
        BattleRules.validateState(setup, state);
        this.currentSetup = BattleRules.clone(setup); this.currentState = BattleRules.clone(state);
    }
    preview(action: BattleAction): BattleResult {
        if (!this.currentSetup || !this.currentState) throw new Error("当前没有战斗");
        return BattleRules.resolve(this.currentSetup, this.currentState, action);
    }
    confirm(action: BattleAction, token: BattleToken): BattleResult {
        if (!this.currentSetup || !this.currentState) throw new Error("当前没有战斗");
        const reject = (reason: string): BattleResult =>
            ({ok: false, reason, state: this.state, events: [], preview: null});
        if (this.committing) return reject("行动正在提交");
        if (!token || token.battleId !== this.currentState.battleId || token.revision !== this.currentState.revision)
            return reject("预览已过期，请重新选择");
        const owned = BattleRules.clone(action), result = this.preview(owned);
        if (!result.ok) return result;
        this.committing = true;
        try {
            this.beforeCommit?.(BattleRules.clone(result.state), owned);
            this.currentState = BattleRules.clone(result.state);
            return result;
        } catch (error) {
            return reject(`行动未提交：${(error as Error).message}`);
        } finally { this.committing = false; }
    }
    reset(): void { this.currentSetup = null; this.currentState = null; }
}
