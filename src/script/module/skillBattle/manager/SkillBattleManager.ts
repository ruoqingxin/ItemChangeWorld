import { SkillBattleData } from "../data/SkillBattleData";
import type {
    ISkillActionResolution,
    ISkillBattleAction,
    ISkillBattleInputToken,
    ISkillBattleSetup,
    ISkillBattleState,
    ISkillBattleCarry,
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
    beforeCommit: ((state: ISkillBattleState) => void) | null = null;

    get state(): ISkillBattleState | null {
        return this._data.state ? SkillBattleFormulaUtils.cloneState(this._data.state) : null;
    }

    get logs(): string[] {
        return this._data.logs.slice();
    }

    get encounterOrder(): number { return this._data.setup?.order || 0; }

    start(setup: ISkillBattleSetup, carry?: ISkillBattleCarry): ISkillBattleState {
        const ownedSetup: ISkillBattleSetup = {
            ...setup,
            skills: setup.skills.map(row => ({ ...row })),
            items: setup.items.map(row => ({ ...row })),
            upgrades: setup.upgrades?.map(row => ({ ...row })),
            enemy: { ...setup.enemy, intents: setup.enemy.intents.map(row => ({ ...row })) },
        };
        const battleId = `skill_battle_${++this._battleSequence}`;
        const initial: ISkillBattleCarry = carry || {
            playerHp: setup.playerMaxHp, playerMaxHp: setup.playerMaxHp, weaponId: setup.weaponId,
            weaponDurability: setup.weaponDurability,
            pouchSlots: [null, null, null, null, null],
        };
        if (!carry) ownedSetup.items.forEach(item => {
            if (item.initialSlot) initial.pouchSlots[item.initialSlot - 1] = {
                itemUid: `${battleId}_item_${item.initialSlot}`, itemId: item.itemId,
            };
        });
        const state = SkillBattleFormulaUtils.startBattle(ownedSetup, battleId, initial);
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
            try {
                this.beforeCommit?.(SkillBattleFormulaUtils.cloneState(result.state));
            } catch (error) {
                return { ok: false, reason: `存档未成功，行动未提交：${(error as Error).message}`,
                    state: SkillBattleFormulaUtils.cloneState(current), events: [], preview: null };
            }
            // Keep returned preview/results separate from the manager-owned snapshot.
            this._data.state = SkillBattleFormulaUtils.cloneState(result.state);
            this._data.logs.push(...result.events.map(event => SkillBattleDebugUtils.formatEvent(event)));
        }
        return result;
    }

    restore(setup: ISkillBattleSetup, state: ISkillBattleState): void {
        this._data.setup = JSON.parse(JSON.stringify(setup));
        this._data.state = SkillBattleFormulaUtils.cloneState(state);
        this._data.logs = [SkillBattleDebugUtils.formatState(setup, state)];
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
