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
    constructor(private readonly manager = SkillBattleManager.ins(), readonly expedition?: ExpeditionManager) {}

    open(setup: ISkillBattleSetup, restart = false): void {
        if (this.expedition) {
            this.setup = this.expedition.setup;
            this.display = this.manager.state;
            this.busy = false;
            this.cancel();
            return;
        }
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
        const stone = this.selectedAction?.type === "skill" ? this.selectedAction.stoneItemUid : undefined;
        const medicine = this.selectedAction?.type === "use_item" ? this.selectedAction.itemUid : undefined;
        const skill = this.setup.skills.find(row => row.id === skillId);
        this.preview({ type: "skill", skillId,
            ...(skill?.canEnchant && stone ? { stoneItemUid: stone } : {}),
            ...(medicine ? { itemUid: medicine } : {}) });
    }

    selectPouch(slot: number): void {
        if (this.busy || this.display.phase !== "player_input") return;
        const instance = this.display.pouchSlots[slot];
        if (!instance) return;
        const item = this.setup.items.find(row => row.itemId === instance.itemId)!;
        if (item.useType === "heal") {
            if (this.selectedAction?.type === "skill") {
                this.preview({ ...this.selectedAction, itemUid: instance.itemUid });
            } else {
                this.selectedId = 0;
                this.preview({ type: "use_item", itemUid: instance.itemUid });
            }
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
            if (this.expedition) this.display = this.expedition.continueNext();
            else {
                const state = this.manager.state;
                if (state?.phase !== "victory" || setup.order !== this.manager.encounterOrder + 1)
                    throw new Error("只有胜利后才能进入下一场遭遇");
                this.display = this.manager.start(setup, {
                    playerHp: state.player.hp, playerMaxHp: state.player.maxHp,
                    weaponId: state.weaponId, weaponDurability: state.weaponDurability, pouchSlots: state.pouchSlots,
                    upgradeIds: state.upgradeIds,
                });
            }
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
            case "keen_changed": state.keen = event.active; break;
        }
    }

    finishPlayback(): void {
        const state = this.manager.state;
        if (state) this.display = SkillBattleFormulaUtils.cloneState(state);
        this.busy = false;
        this.cancel();
    }
}
