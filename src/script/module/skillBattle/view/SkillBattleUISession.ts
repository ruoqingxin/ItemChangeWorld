import { ConfigUtil } from "../../../config/ConfigUtil";
import { ExpeditionConfigUtils } from "../../expedition/utils/ExpeditionConfigUtils";
import { ExpeditionManager } from "../../expedition/manager/ExpeditionManager";
import { ExpeditionLocalStorage } from "../../expedition/data/ExpeditionData";
import { NewBattleSession } from "../newRules/NewBattleSession";
import { NewBattleConfigUtils } from "../newRules/NewBattleConfigUtils";
import { SkillBattleManager } from "../manager/SkillBattleManager";
import { NewBuildSession } from "../newRules/NewBuildSession";
import { NewBuildPanel } from "./NewBuildPanel";
import { NewBuildConfigUtils } from "../newRules/NewBuildConfigUtils";
import { NewBattlePanel } from "./NewBattlePanel";
import type { UIBaseView } from "../../../games/ui/UIBaseView";

/** Shared model for the independently opened start, battle, and settlement views. */
export class SkillBattleUISession {
    static previewSingleTrial = false;
    private static build: NewBuildSession;
    static getActive(): NewBuildSession | NewBattleSession {
        return this.previewSingleTrial ? this.getTrial() : this.getBuild();
    }
    static getBuild(): NewBuildSession {
        if (!this.build) {
            this.build = new NewBuildSession(SkillBattleManager.ins(), window.localStorage,
                () => Date.now(), NewBuildConfigUtils.read(ConfigUtil.Tables));
            const check = () => {
                try { if (!this.build.error && this.build.expire()) this.onTrialExpired?.(); }
                catch (error) { console.warn("双道试炼截止保存失败，将重试", error); }
            };
            Laya.timer.loop(250, this, check);
            window.addEventListener("focus", check);
            document.addEventListener("visibilitychange", check);
            check();
        }
        return this.build;
    }
    static createPanel(view: UIBaseView, screen: "start" | "battle" | "settlement",
        navigate: (screen: "start" | "battle" | "settlement") => void): NewBattlePanel {
        return this.previewSingleTrial ? new NewBattlePanel(view, this.getTrial(), this.trialOptions, navigate, screen) :
            new NewBuildPanel(view, this.getBuild(), navigate, screen);
    }
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
