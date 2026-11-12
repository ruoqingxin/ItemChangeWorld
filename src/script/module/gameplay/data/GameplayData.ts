import type { BattleTrialManager } from "../../skillBattle/manager/BattleTrialManager";
import type { BuildManager } from "../../build/manager/BuildManager";
import type { InventoryManager } from "../../inventory/manager/InventoryManager";
import type { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";

export class GameplayData {
    previewSingleTrial = false;
    previewBuildTrial = false;
    previewInventoryTrial = false;
    trial: BattleTrialManager | null = null;
    build: BuildManager | null = null;
    inventory: InventoryManager | null = null;
    expedition: ExpeditionRunManager | null = null;
}
