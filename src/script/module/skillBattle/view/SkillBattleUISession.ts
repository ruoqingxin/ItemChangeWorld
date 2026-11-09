import { ConfigUtil } from "../../../config/ConfigUtil";
import { ExpeditionConfigUtils } from "../../expedition/utils/ExpeditionConfigUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";
import { ExpeditionLocalStorage } from "../../expedition/data/ExpeditionData";
import { NewBattleSession } from "../newRules/NewBattleSession";
import { NewBattleConfigUtils } from "../newRules/NewBattleConfigUtils";
import { SkillBattleManager } from "../manager/SkillBattleManager";

/** Shared model for the independently opened start, battle, and settlement views. */
export class SkillBattleUISession {
    private static trial: NewBattleSession;
    static readonly trialOptions = NewBattleConfigUtils.defaults();
    static getTrial(): NewBattleSession {
        if (!this.trial) {
            this.trial = new NewBattleSession(SkillBattleManager.ins(), window.localStorage);
            const check = () => {
                try { if (!this.trial.error && this.trial.expire()) this.onTrialExpired?.(); }
                catch (error) { console.warn("试炼截止保存失败，将重试", error); }
            };
            Laya.timer.loop(250, this, check);
            window.addEventListener("focus", check);
            document.addEventListener("visibilitychange", check);
            check();
        }
        return this.trial;
    }
    static onTrialExpired: () => void;
    private static expedition: ExpeditionManager;
    private static notifiedTimeoutRun = "";

    static getExpedition(): ExpeditionManager {
        if (!this.expedition) {
            const config = ExpeditionConfigUtils.read(ConfigUtil.Tables, true, true);
            config.requireBuildSelection = true;
            this.expedition = new ExpeditionManager(config, undefined, new ExpeditionLocalStorage());
            Laya.timer.loop(250, this, this.checkDeadline);
            window.addEventListener("focus", () => this.checkDeadline());
            document.addEventListener("visibilitychange", () => this.checkDeadline());
        }
        return this.expedition;
    }

    private static checkDeadline(): void {
        if (!this.expedition || this.expedition.error) return;
        try {
            this.expedition.expireMap();
            const run = this.expedition.run;
            if (run?.report.endReason === "timeout" && run.runId !== this.notifiedTimeoutRun && this.onExpired) {
                this.notifiedTimeoutRun = run.runId;
                this.onExpired();
            }
        } catch (error) {
            console.error("秘境计时结算失败", error);
        }
    }

    static onExpired: () => void;
}
