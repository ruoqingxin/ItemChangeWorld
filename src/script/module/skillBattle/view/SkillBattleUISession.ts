import { ConfigUtil } from "../../../config/ConfigUtil";
import { ExpeditionConfigUtils } from "../../expedition/utils/ExpeditionConfigUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";

/** Shared model for the independently opened start, battle, and settlement views. */
export class SkillBattleUISession {
    private static expedition: ExpeditionManager;

    static getExpedition(): ExpeditionManager {
        if (!this.expedition) {
            this.expedition = new ExpeditionManager(ExpeditionConfigUtils.read(ConfigUtil.Tables));
        }
        return this.expedition;
    }
}
