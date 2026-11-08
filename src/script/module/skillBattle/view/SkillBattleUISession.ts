import { ConfigUtil } from "../../../config/ConfigUtil";
import { ExpeditionConfigUtils } from "../../expedition/utils/ExpeditionConfigUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";
import { ExpeditionLocalStorage } from "../../expedition/data/ExpeditionData";

/** Shared model for the independently opened start, battle, and settlement views. */
export class SkillBattleUISession {
    private static expedition: ExpeditionManager;
    private static mapEnabled = true;

    /** Preview and regression fixtures can opt into the retired linear route. */
    static setMapEnabled(enabled: boolean): void {
        if (this.expedition) throw new Error("秘境会话已经创建，不能切换地图模式");
        this.mapEnabled = enabled;
    }

    static getExpedition(): ExpeditionManager {
        if (!this.expedition) {
            const config = ExpeditionConfigUtils.read(ConfigUtil.Tables, true, this.mapEnabled);
            config.requireBuildSelection = true;
            this.expedition = new ExpeditionManager(config, undefined, new ExpeditionLocalStorage("new-rules"));
        }
        return this.expedition;
    }
}
