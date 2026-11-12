import { ConfigUtil } from "../../../config/ConfigUtil";
import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { BattleTrialManager } from "../../skillBattle/manager/BattleTrialManager";
import { BattleConfigUtils } from "../../skillBattle/utils/BattleConfigUtils";
import { BuildManager } from "../../build/manager/BuildManager";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";
import { InventoryManager } from "../../inventory/manager/InventoryManager";
import { InventoryConfigUtils } from "../../inventory/utils/InventoryConfigUtils";
import { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";
import { ExpeditionRunConfigUtils } from "../../expedition/utils/ExpeditionRunConfigUtils";
import { GameplayData } from "../data/GameplayData";
import { GameplayLifecycleHelper } from "../utils/GameplayLifecycleHelper";

/** Composition root. Only the selected run owns the battle commit callback. */
export class GameplayManager {
    private static readonly data = new GameplayData();
    static readonly trialOptions = BattleConfigUtils.defaults();
    static onTrialExpired: () => void;

    static get previewSingleTrial() { return this.data.previewSingleTrial; }
    static set previewSingleTrial(value: boolean) { this.data.previewSingleTrial = value; }
    static get previewBuildTrial() { return this.data.previewBuildTrial; }
    static set previewBuildTrial(value: boolean) { this.data.previewBuildTrial = value; }
    static get previewInventoryTrial() { return this.data.previewInventoryTrial; }
    static set previewInventoryTrial(value: boolean) { this.data.previewInventoryTrial = value; }

    static getActive(): BuildManager | BattleTrialManager | InventoryManager | ExpeditionRunManager {
        return this.previewSingleTrial ? this.getTrial() : this.previewBuildTrial ? this.getBuild() :
            this.previewInventoryTrial ? this.getInventory() : this.getMapTrial();
    }

    static getMapTrial(): ExpeditionRunManager {
        if (!this.data.expedition) {
            this.data.expedition = new ExpeditionRunManager(SkillBattleManager.ins(), window.localStorage,
                () => Date.now(), ExpeditionRunConfigUtils.read(ConfigUtil.Tables));
            GameplayLifecycleHelper.watch(this, this.data.expedition, () => this.onTrialExpired?.());
        }
        return this.data.expedition;
    }

    static getInventory(): InventoryManager {
        if (!this.data.inventory) {
            this.data.inventory = new InventoryManager(SkillBattleManager.ins(), window.localStorage,
                () => Date.now(), InventoryConfigUtils.read(ConfigUtil.Tables));
            GameplayLifecycleHelper.watch(this, this.data.inventory, () => this.onTrialExpired?.());
        }
        return this.data.inventory;
    }

    static getBuild(): BuildManager {
        if (!this.data.build) {
            this.data.build = new BuildManager(SkillBattleManager.ins(), window.localStorage,
                () => Date.now(), BuildConfigUtils.read(ConfigUtil.Tables));
            GameplayLifecycleHelper.watch(this, this.data.build, () => this.onTrialExpired?.());
        }
        return this.data.build;
    }

    static getTrial(): BattleTrialManager {
        if (!this.data.trial) {
            this.data.trial = new BattleTrialManager(SkillBattleManager.ins(), window.localStorage);
            GameplayLifecycleHelper.watch(this, this.data.trial, () => this.onTrialExpired?.());
        }
        return this.data.trial;
    }
}
