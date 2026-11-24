import { ConfigUtil } from "../../../config/ConfigUtil";
import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";
import { ExpeditionRunConfigUtils } from "../../expedition/utils/ExpeditionRunConfigUtils";
import { GameplayLifecycleHelper } from "../utils/GameplayLifecycleHelper";

/** 正式入口只组装当前探索流程。 */
export class GameplayManager {
    private static expedition: ExpeditionRunManager;
    static onTrialExpired: () => void;
    static getActive(): ExpeditionRunManager { return this.getMapTrial(); }
    static createInitialSave(): void {
        const trial = this.getActive();
        if (trial.error) throw new Error(trial.error);
        if (trial.inventory) return;
        const seed = new Uint32Array(1);
        crypto.getRandomValues(seed);
        trial.prepare(ExpeditionRunConfigUtils.read(ConfigUtil.Tables), seed[0] || 1);
    }
    static resetSaveConfirmed(): void {
        const seed = new Uint32Array(1);
        crypto.getRandomValues(seed);
        this.getActive().restartConfirmed(ExpeditionRunConfigUtils.read(ConfigUtil.Tables), seed[0] || 1);
    }
    static getMapTrial(): ExpeditionRunManager {
        if (!this.expedition) {
            this.expedition = new ExpeditionRunManager(SkillBattleManager.ins(), window.localStorage,
                () => Date.now(), ExpeditionRunConfigUtils.read(ConfigUtil.Tables));
            GameplayLifecycleHelper.watch(this, this.expedition, () => this.onTrialExpired?.());
        }
        return this.expedition;
    }
}
