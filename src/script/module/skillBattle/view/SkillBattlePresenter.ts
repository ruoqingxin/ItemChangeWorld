import { SkillBattleManager } from "../manager/SkillBattleManager";
import type { ISkillActionResolution, ISkillBattleSetup, ISkillBattleState, SkillBattleEvent } from "../types/SkillBattleTypes";
import { SkillBattleFormulaUtils } from "../utils/SkillBattleFormulaUtils";

/** Presentation snapshots never write back into the committed battle. */
export class SkillBattlePresenter {
    setup: ISkillBattleSetup;
    display: ISkillBattleState;
    selection: ISkillActionResolution | null = null;
    selectedId = 0;
    busy = false;
    message = "";

    constructor(private readonly manager = SkillBattleManager.ins()) {}

    open(setup: ISkillBattleSetup, restart = false): void {
        this.setup = setup;
        const state = this.manager.state;
        this.display = restart || !state || state.encounterId !== setup.encounterId
            ? this.manager.start(setup) : state;
        this.busy = false;
        this.cancel();
    }

    select(skillId: number): void {
        if (this.busy || this.display.phase !== "player_input") return;
        this.selectedId = skillId;
        this.selection = this.manager.previewAction({ type: "skill", skillId });
        this.message = this.selection.ok ? "" : this.selection.reason!;
    }

    cancel(): void {
        if (this.busy) return;
        this.selectedId = 0;
        this.selection = null;
        this.message = "";
    }

    confirm(): ISkillActionResolution | null {
        if (this.busy || !this.selection?.ok || !this.selection.preview) return null;
        const result = this.manager.confirmAction(
            { type: "skill", skillId: this.selectedId }, this.selection.preview.token);
        this.selection = null;
        this.selectedId = 0;
        this.message = result.reason || "";
        if (result.ok) this.busy = true;
        else this.display = result.state;
        return result;
    }

    applyEvent(event: SkillBattleEvent): void {
        if (!this.busy) return;
        const state = this.display;
        switch (event.type) {
            case "qi_changed": state.swordQi = event.after; break;
            case "damage":
                state[event.target].hp = Math.max(0, state[event.target].hp - event.hpLoss);
                state[event.target].block = Math.max(0, state[event.target].block - event.blockAbsorbed);
                break;
            case "block_gained": state[event.target].block += event.amount; break;
            case "block_cleared": state[event.target].block = 0; break;
        }
    }

    finishPlayback(): void {
        const state = this.manager.state;
        if (state) this.display = SkillBattleFormulaUtils.cloneState(state);
        this.busy = false;
        this.cancel();
    }
}
