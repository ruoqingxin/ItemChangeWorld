import type { BattleAction, BattleCarry, BattleResult, BattleSetup, BattleState } from "../types/BattleTypes";
import { QingmingBattleAdapter } from "./QingmingBattleAdapter";

/** 战斗统一使用整数，实际物品和耐久由正式适配器结算。 */
export class BattleRules {
    static clone<T>(value: T): T { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }
    static format(value: number): string { return String(value); }
    static scale(value: number, percent: number): number {
        if (![value, percent].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error("战斗倍率无效");
        const result = (BigInt(value) * BigInt(percent) + BigInt(50)) / BigInt(100);
        if (result > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("战斗数值超过安全范围");
        return Number(result);
    }
    static attributes(setup: BattleSetup, state: BattleState): { attack: number; defense: number } {
        const weapon = state.weapon, ratio = !weapon ? 0 : weapon.durability > 0 ? 100 : 50;
        return { attack: setup.player.baseAttack + this.scale(weapon?.attack || 0, ratio),
            defense: setup.player.baseDefense + this.scale(weapon?.defense || 0, ratio) };
    }
    static start(setup: BattleSetup, battleId: string, carry?: BattleCarry): BattleState {
        this.validateSetup(setup);
        if (!battleId) throw new Error("战斗标识无效");
        return QingmingBattleAdapter.start(setup, battleId, carry,
            this.attributes(setup, {weapon: carry ? carry.weapon : setup.weapon} as BattleState));
    }
    static validateSetup(setup: BattleSetup): void {
        const int = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min && n <= 100000000;
        if (!setup?.rulesId || !setup.player || !setup.enemy ||
            ![setup.player.maxHp, setup.player.maxMp, setup.player.baseAttack, setup.player.baseDefense,
                setup.enemy.id, setup.enemy.maxHp].every(n => int(n, 1)) ||
            !Array.isArray(setup.potions) || !setup.potions.length ||
            new Set(setup.potions.map(p => p.itemId)).size !== setup.potions.length ||
            setup.potions.some(p => !int(p.itemId, 1) || !p.name || !["hp","mp","mixed","shield"].includes(p.resource) ||
                !int(p.amount, 1) || !int(p.secondaryAmount) ||
                (p.resource === "mixed" ? p.secondaryAmount <= 0 : p.secondaryAmount !== 0)))
            throw new Error("战斗配置无效");
        if (setup.weapon && (!int(setup.weapon.id, 1) || !setup.weapon.name ||
            ![setup.weapon.attack, setup.weapon.defense, setup.weapon.durability, setup.weapon.maxDurability].every(n => int(n)) ||
            !setup.weapon.maxDurability || setup.weapon.durability > setup.weapon.maxDurability))
            throw new Error("武器属性或耐久无效");
        QingmingBattleAdapter.validateSetup(setup);
    }
    static validateState(setup: BattleSetup, state: BattleState): void {
        QingmingBattleAdapter.validateState(setup, state);
    }
    static resolve(setup: BattleSetup, state: BattleState, action: BattleAction): BattleResult {
        return QingmingBattleAdapter.resolve(setup, state, action, this.attributes(setup, state));
    }
}
