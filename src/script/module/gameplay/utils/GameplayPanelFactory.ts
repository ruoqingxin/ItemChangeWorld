import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { ExpeditionPanel } from "../../expedition/view/ExpeditionPanel";
import { GameplayManager } from "../manager/GameplayManager";
import type { SkillBattlePage } from "./GameplayLayout";


export class GameplayPanelFactory {
    static createPanel(view: UIBaseView, screen: "start" | "battle" | "settlement",
        navigate: (screen: SkillBattlePage) => void, page: SkillBattlePage = screen): BattlePanel {
        return new ExpeditionPanel(view, GameplayManager.getMapTrial(), navigate, screen, page);
    }
}
