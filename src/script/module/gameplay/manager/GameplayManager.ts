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
    static getMapTrial(): ExpeditionRunManager {
        if (!this.expedition) {
            this.expedition = new ExpeditionRunManager(SkillBattleManager.ins(), window.localStorage,
                () => Date.now(), ExpeditionRunConfigUtils.read(ConfigUtil.Tables));
            GameplayLifecycleHelper.watch(this, this.expedition, () => this.onTrialExpired?.());
        }
        return this.expedition;
    }
}
