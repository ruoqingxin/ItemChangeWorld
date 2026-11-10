import { UIManager } from "../../../games/ui/UIManager";
import { SkillBattleStartView } from "./SkillBattleStartView";
import { SkillBattleBattleView } from "./SkillBattleBattleView";
import { SkillBattleSettlementView } from "./SkillBattleSettlementView";
import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { SkillBattleMapView } from "../../expedition/view/SkillBattleMapView";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { SkillBattleInventoryView } from "./SkillBattleInventoryView";
import { SkillBattleBuildView } from "./SkillBattleBuildView";
import { SkillBattleConfirmView } from "./SkillBattleConfirmView";
import { SkillBattleReportView } from "./SkillBattleReportView";
import { SkillBattleBuildInfoView } from "./SkillBattleBuildInfoView";
import type { SkillBattlePage } from "./SkillBattleUILayout";

export type SkillBattleScreen = SkillBattlePage;
export let currentSkillBattleView: UIBaseView;

export function closeSkillBattleScreens(): void {
    const ui = UIManager.ins();
    for (const view of [SkillBattleStartView, SkillBattleBattleView, SkillBattleMapView,
        SkillBattleSettlementView, SkillBattleInventoryView, SkillBattleBuildView,
        SkillBattleConfirmView, SkillBattleReportView, SkillBattleBuildInfoView]) ui.closeForm<UIBaseView>(view);
}

export function openSkillBattleScreen(screen: SkillBattleScreen): void {
    if ((SkillBattleUISession.previewBuildTrial || SkillBattleUISession.previewInventoryTrial) &&
        screen === "settlement") screen = "start";
    if (!SkillBattleUISession.previewSingleTrial && !SkillBattleUISession.previewBuildTrial) {
        const state = (SkillBattleUISession.previewInventoryTrial ?
            SkillBattleUISession.getInventory() : SkillBattleUISession.getMapTrial()).inventory;
        if (state?.phase === "ended") screen = "settlement";
        else if (state?.phase === "active" && state.flow?.phase === "battle") screen = "battle";
        else if (state?.phase === "active" && state.flow?.pending) screen = "build";
        else if (screen === "start" && state?.phase === "active")
            screen = SkillBattleUISession.previewInventoryTrial ? "inventory" : "map";
        else if (!state || state.phase === "preparation") screen = "start";
    }
    SkillBattleUISession.onExpired = () => openSkillBattleScreen("settlement");
    SkillBattleUISession.onTrialExpired = () => openSkillBattleScreen("settlement");
    const ui = UIManager.ins();
    closeSkillBattleScreens();
    if (screen === "start") currentSkillBattleView = ui.openForm(SkillBattleStartView);
    else if (screen === "battle") currentSkillBattleView = ui.openForm(SkillBattleBattleView);
    else if (screen === "map") currentSkillBattleView = ui.openForm(SkillBattleMapView);
    else if (screen === "inventory") currentSkillBattleView = ui.openForm(SkillBattleInventoryView);
    else if (screen === "build") currentSkillBattleView = ui.openForm(SkillBattleBuildView);
    else currentSkillBattleView = ui.openForm(SkillBattleSettlementView);
}
