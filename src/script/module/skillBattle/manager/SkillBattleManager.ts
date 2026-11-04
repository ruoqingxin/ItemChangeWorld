import { SkillBattleData } from "../data/SkillBattleData";
import type {
    ISkillActionResolution,
    ISkillBattleAction,
    ISkillBattleInputToken,
    ISkillBattleSetup,
    ISkillBattleState,
} from "../types/SkillBattleTypes";
import { SkillBattleDebugUtils } from "../utils/SkillBattleDebugUtils";
import { SkillBattleFormulaUtils } from "../utils/SkillBattleFormulaUtils";

export class SkillBattleManager {
    private static _ins: SkillBattleManager;

    static ins(): SkillBattleManager {
        if (!this._ins) {
            this._ins = new SkillBattleManager();
        }
        return this._ins;
    }

    private readonly _data = new SkillBattleData();
    private _battleSequence = 0;

    get state(): ISkillBattleState | null {
        return this._data.state ? SkillBattleFormulaUtils.cloneState(this._data.state) : null;
    }

    get logs(): string[] {
        return this._data.logs.slice();
    }

    start(setup: ISkillBattleSetup): ISkillBattleState {
        const ownedSetup: ISkillBattleSetup = {
            ...setup,
            skills: setup.skills.map(row => ({ ...row })),
            enemy: { ...setup.enemy, intents: setup.enemy.intents.map(row => ({ ...row })) },
        };
        const state = SkillBattleFormulaUtils.startBattle(ownedSetup, `skill_battle_${++this._battleSequence}`);
        this._data.setup = ownedSetup;
        this._data.state = state;
        this._data.logs = [SkillBattleDebugUtils.formatState(ownedSetup, state)];
        return SkillBattleFormulaUtils.cloneState(state);
    }

    previewAction(action: ISkillBattleAction): ISkillActionResolution {
        this.requireBattle();
        return SkillBattleFormulaUtils.previewAction(this._data.setup!, this._data.state!, action);
    }

    confirmAction(action: ISkillBattleAction, token: ISkillBattleInputToken): ISkillActionResolution {
        this.requireBattle();
        const current = this._data.state!;
        if (!token || token.battleId !== current.battleId || token.revision !== current.revision) {
            return {
                ok: false, reason: "预览已过期，请根据当前回合重新选择",
                state: SkillBattleFormulaUtils.cloneState(current), events: [], preview: null,
            };
        }
        const result = SkillBattleFormulaUtils.resolveAction(this._data.setup!, current, action);
        if (result.ok) {
            // Keep returned preview/results separate from the manager-owned snapshot.
            this._data.state = SkillBattleFormulaUtils.cloneState(result.state);
            this._data.logs.push(...result.events.map(event => SkillBattleDebugUtils.formatEvent(event)));
        }
        return result;
    }

    printState(): string {
        this.requireBattle();
        return SkillBattleDebugUtils.formatState(this._data.setup!, this._data.state!);
    }

    reset(): void {
        this._data.reset();
    }

    private requireBattle(): void {
        if (!this._data.state || !this._data.setup) {
            throw new Error("[SkillBattle] 请先调用 SkillBattleDebug.start(1)");
        }
    }
}
