import { BattleEngine } from "../core/BattleEngine";
import BattleData from "../data/BattleData";
import { IDamagePreview, IBattleItemSlotRuntime, IBattleState, IEnchantCheckResult } from "../types/BattleTypes";

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

    get state(): IBattleState | null {
        return BattleData.ins().state;
    }

    startScenario(scenarioId: number): IBattleState {
        const state = this._engine.startScenario(scenarioId);
        BattleData.ins().state = state;
        return state;
    }

    playCard(handIndex: number, targetEnemyIndex: number = 0): void {
        const state = this.requireState();
        this._engine.playCard(state, handIndex, targetEnemyIndex);
    }

    /** 注灵：将法囊 slotIndex 的属性石注入 handIndex 手牌 */
    enchantCard(handIndex: number, pouchSlotIndex: number): IEnchantCheckResult {
        const state = this.requireState();
        return this._engine.enchantCard(state, handIndex, pouchSlotIndex);
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
    }

    printState(): void {
        const state = this.requireState();
        this._engine.printState(state);
    }

    reset(): void {
        BattleData.ins().reset();
    }

    private requireState(): IBattleState {
        const state = BattleData.ins().state;

        if (!state) {
            throw new Error("[BattleManager] 当前没有战斗，请先调用 startScenario()");
        }

        return state;
    }
}