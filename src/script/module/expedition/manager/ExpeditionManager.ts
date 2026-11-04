import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import type { ISkillBattleSetup, ISkillBattleState } from "../../skillBattle/types/SkillBattleTypes";

/** Phase C only bridges supplies; rewards, extraction and persistence belong to phase D. */
export class ExpeditionManager {
    constructor(private readonly battle = SkillBattleManager.ins()) {}

    startNew(setup: ISkillBattleSetup): ISkillBattleState {
        return this.battle.start(setup);
    }

    continueTo(setup: ISkillBattleSetup): ISkillBattleState {
        const state = this.battle.state;
        if (!state || state.phase !== "victory") throw new Error("只有战斗胜利后才能携物继续");
        if (setup.order !== this.battle.encounterOrder + 1) throw new Error("只能进入下一场遭遇");
        return this.battle.start(setup, {
            playerHp: state.player.hp, playerMaxHp: state.player.maxHp,
            weaponId: state.weaponId, weaponDurability: state.weaponDurability,
            pouchSlots: state.pouchSlots,
        });
    }
}
