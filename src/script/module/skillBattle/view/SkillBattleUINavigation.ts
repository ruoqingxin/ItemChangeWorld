import { UIManager } from "../../../games/ui/UIManager";
import { SkillBattleStartView } from "./SkillBattleStartView";
import { SkillBattleBattleView } from "./SkillBattleBattleView";
import { SkillBattleSettlementView } from "./SkillBattleSettlementView";
import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { SkillBattleMapView } from "../../expedition/view/SkillBattleMapView";
import { SkillBattleUISession } from "./SkillBattleUISession";

export type SkillBattleScreen = "start" | "battle" | "map" | "settlement";
export let currentSkillBattleView: UIBaseView;

export function openSkillBattleScreen(screen: SkillBattleScreen): void {
    SkillBattleUISession.onExpired = () => openSkillBattleScreen("settlement");
    SkillBattleUISession.onTrialExpired = () => openSkillBattleScreen("settlement");
    const ui = UIManager.ins();
    ui.closeForm(SkillBattleStartView);
    ui.closeForm(SkillBattleBattleView);
    ui.closeForm(SkillBattleMapView);
    ui.closeForm(SkillBattleSettlementView);
    if (screen === "start") currentSkillBattleView = ui.openForm(SkillBattleStartView);
    else if (screen === "battle") currentSkillBattleView = ui.openForm(SkillBattleBattleView);
    else if (screen === "map") currentSkillBattleView = ui.openForm(SkillBattleMapView);
    else currentSkillBattleView = ui.openForm(SkillBattleSettlementView);
}
