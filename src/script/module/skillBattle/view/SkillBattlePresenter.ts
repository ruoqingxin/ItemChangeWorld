import { SkillBattleManager } from "../manager/SkillBattleManager";
import type { ISkillActionResolution, ISkillBattleAction, ISkillBattleSetup, ISkillBattleState, SkillBattleEvent } from "../types/SkillBattleTypes";
import { SkillBattleFormulaUtils } from "../utils/SkillBattleFormulaUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";

/** Presentation snapshots never write back into the committed battle. */
export class SkillBattlePresenter {
    setup: ISkillBattleSetup;
    display: ISkillBattleState;
    selection: ISkillActionResolution | null = null;
    selectedId = 0;
    busy = false;
    message = "";
    selectedAction: ISkillBattleAction | null = null;
    private expedition: ExpeditionManager;

    constructor(private readonly manager = SkillBattleManager.ins()) {
        this.expedition = new ExpeditionManager(manager);
    }

    open(setup: ISkillBattleSetup, restart = false): void {
        this.setup = setup;
        const state = this.manager.state;
        this.display = restart || !state || state.encounterId !== setup.encounterId
            ? this.expedition.startNew(setup) : state;
        this.busy = false;
        this.cancel();
    }

    select(skillId: number): void {
        if (this.busy || this.display.phase !== "player_input") return;
        this.selectedId = skillId;
        const stone = this.selectedAction?.type === "skill" ? this.selectedAction.stoneItemUid : undefined;
        const skill = this.setup.skills.find(row => row.id === skillId);
        this.preview({ type: "skill", skillId, ...(skill?.canEnchant && stone ? { stoneItemUid: stone } : {}) });
    }

    selectPouch(slot: number): void {
        if (this.busy || this.display.phase !== "player_input") return;
        const instance = this.display.pouchSlots[slot];
        if (!instance) return;
        const item = this.setup.items.find(row => row.itemId === instance.itemId)!;
        if (item.useType === "heal") {
            this.selectedId = 0;
            this.preview({ type: "use_item", itemUid: instance.itemUid });
        } else if (this.selectedAction?.type !== "skill") {
            this.cancel();
            this.message = "先选择可注灵的攻击招式";
        } else {
            const action = this.selectedAction;
            this.preview({ type: "skill", skillId: action.skillId,
                ...(action.stoneItemUid === instance.itemUid ? {} : { stoneItemUid: instance.itemUid }) });
        }
    }

    continueTo(setup: ISkillBattleSetup): boolean {
        if (this.busy) return false;
        try {
            this.display = this.expedition.continueTo(setup);
            this.setup = setup;
            this.cancel();
            return true;
        } catch (error) {
            this.message = (error as Error).message;
            return false;
        }
    }

    private preview(action: ISkillBattleAction): void {
        this.selectedAction = action;
        this.selection = this.manager.previewAction(action);
        this.message = this.selection.ok ? "" : this.selection.reason!;
    }

    cancel(): void {
        if (this.busy) return;
        this.selectedId = 0;
        this.selection = null;
        this.selectedAction = null;
        this.message = "";
    }

    confirm(): ISkillActionResolution | null {
        if (this.busy || !this.selectedAction || !this.selection?.ok || !this.selection.preview) return null;
        const result = this.manager.confirmAction(this.selectedAction, this.selection.preview.token);
        this.selectedAction = null;
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
            case "item_consumed": state.pouchSlots[event.slot] = null; break;
            case "durability_changed": state.weaponDurability = event.after; break;
            case "healed": state.player.hp = Math.min(state.player.maxHp, state.player.hp + event.amount); break;
            case "burn_changed": state.enemyBurn = event.after; break;
            case "burn_damage": state.enemy.hp = Math.max(0, state.enemy.hp - event.hpLoss); break;
        }
    }

    finishPlayback(): void {
        const state = this.manager.state;
        if (state) this.display = SkillBattleFormulaUtils.cloneState(state);
        this.busy = false;
        this.cancel();
    }
}
