import { BattleEngine } from "../core/BattleEngine";
import BattleData from "../data/BattleData";
import { BattleRewardManager } from "../reward/BattleRewardManager";
import { IBattleRewardState } from "../reward/BattleRewardTypes";
import {
    IDamagePreview,
    IBattleItemSlotRuntime,
    IBattleState,
    IEnchantCheckResult,
    EBattleResult,
} from "../types/BattleTypes";

/**
 * 战斗业务入口。
 *
 * 后面 UI、秘境、背包都不要直接操作 BattleEngine。
 * 统一通过 BattleManager 调用，方便之后扩展。
 */
export class BattleManager {
    private static _ins: BattleManager;

    static ins(): BattleManager {
        if (!this._ins) {
            this._ins = new BattleManager();
        }

        return this._ins;
    }

    private _engine: BattleEngine = new BattleEngine();
    private _rewardState: IBattleRewardState | null = null;
    private _rewardGenerated = false;

    get state(): IBattleState | null {
        return BattleData.ins().state;
    }

    /** 战斗胜利后的掉落列表，未生成时为 null */
    get rewardState(): IBattleRewardState | null {
        return this._rewardState;
    }

    /** 是否处于掉落拾取阶段（战斗胜利且已生成掉落） */
    get isLootPhase(): boolean {
        return !!this._rewardState && this.state?.result === EBattleResult.Win;
    }

    startScenario(scenarioId: number): IBattleState {
        this.clearReward();
        BattleRewardManager.resetUidCounter();
        const state = this._engine.startScenario(scenarioId);
        BattleData.ins().state = state;
        return state;
    }

    playCard(handIndex: number, targetEnemyIndex: number = 0): void {
        const state = this.requireState();
        this._engine.playCard(state, handIndex, targetEnemyIndex);
        this.tryGenerateReward();
    }

    /** 注灵：将法囊 slotIndex 的属性石注入 handIndex 手牌 */
    enchantCard(handIndex: number, pouchSlotIndex: number): IEnchantCheckResult {
        const state = this.requireState();
        const result = this._engine.enchantCard(state, handIndex, pouchSlotIndex);
        this.tryGenerateReward();
        return result;
    }

    /** 伤害预览（指定目标后显示真实预计伤害） */
    previewDamage(handIndex: number, targetEnemyIndex: number = 0): IDamagePreview | null {
        const state = this.requireState();
        return this._engine.previewDamage(state, handIndex, targetEnemyIndex);
    }

    getBattlePouch(): IBattleItemSlotRuntime[] {
        const state = BattleData.ins().state;
        return state?.battlePouch || [];
    }

    endTurn(): void {
        const state = this.requireState();
        this._engine.endPlayerTurn(state);
        this.tryGenerateReward();
    }

    printState(): void {
        const state = this.requireState();
        this._engine.printState(state);
    }

    reset(): void {
        this.clearReward();
        BattleData.ins().reset();
    }

    private clearReward(): void {
        this._rewardState = null;
        this._rewardGenerated = false;
    }

    /** 战斗胜利后生成掉落，只执行一次 */
    private tryGenerateReward(): void {
        const state = BattleData.ins().state;
        if (!state || state.result !== EBattleResult.Win || this._rewardGenerated) {
            return;
        }

        this._rewardState = BattleRewardManager.generateReward(state);
        this._rewardGenerated = true;
    }

    private requireState(): IBattleState {
        const state = BattleData.ins().state;

        if (!state) {
            throw new Error("[BattleManager] 当前没有战斗，请先调用 startScenario()");
        }

        return state;
    }
}
