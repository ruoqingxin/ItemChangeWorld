import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { BuildPanel } from "../../build/view/BuildPanel";
import { InventoryPanel } from "../../inventory/view/InventoryPanel";
import { ExpeditionPanel } from "../../expedition/view/ExpeditionPanel";
import { GameplayManager } from "../manager/GameplayManager";
import type { SkillBattlePage } from "./GameplayLayout";

/** UI assembly stays outside the managers and their state/transaction code. */
export class GameplayPanelFactory {
    static createPanel(view: UIBaseView, screen: "start" | "battle" | "settlement",
        navigate: (screen: SkillBattlePage) => void, page: SkillBattlePage = screen): BattlePanel {
        return GameplayManager.previewSingleTrial ?
            new BattlePanel(view, GameplayManager.getTrial(), GameplayManager.trialOptions, navigate, screen, page) :
            GameplayManager.previewBuildTrial ?
                new BuildPanel(view, GameplayManager.getBuild(), navigate, screen, page) :
                GameplayManager.previewInventoryTrial ?
                    new InventoryPanel(view, GameplayManager.getInventory(), navigate, screen, page) :
                    new ExpeditionPanel(view, GameplayManager.getMapTrial(), navigate, screen, page);
    }
}
