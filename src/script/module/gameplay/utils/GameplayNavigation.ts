import { UIManager } from "../../../games/ui/UIManager";
import { SkillBattleStartView } from "../view/SkillBattleStartView";
import { SkillBattleBattleView } from "../../skillBattle/view/SkillBattleBattleView";
import { SkillBattleSettlementView } from "../view/SkillBattleSettlementView";
import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { SkillBattleMapView } from "../../expedition/view/SkillBattleMapView";
import { GameplayManager } from "../manager/GameplayManager";
import { SkillBattleInventoryView } from "../../inventory/view/SkillBattleInventoryView";
import { SkillBattleBuildView } from "../../build/view/SkillBattleBuildView";
import { SkillBattleConfirmView } from "../view/SkillBattleConfirmView";
import { SkillBattleReportView } from "../../skillBattle/view/SkillBattleReportView";
import { SkillBattleBuildInfoView } from "../../build/view/SkillBattleBuildInfoView";
import type { SkillBattlePage } from "./GameplayLayout";

export type SkillBattleScreen = SkillBattlePage;
export let currentSkillBattleView: UIBaseView;

export function closeSkillBattleScreens(): void {
    const ui = UIManager.ins();
    for (const view of [SkillBattleStartView, SkillBattleBattleView, SkillBattleMapView,
        SkillBattleSettlementView, SkillBattleInventoryView, SkillBattleBuildView,
        SkillBattleConfirmView, SkillBattleReportView, SkillBattleBuildInfoView]) ui.closeForm<UIBaseView>(view);
}

export function openSkillBattleScreen(screen: SkillBattleScreen): void {
    if ((GameplayManager.previewBuildTrial || GameplayManager.previewInventoryTrial) &&
        screen === "settlement") screen = "start";
    if (!GameplayManager.previewSingleTrial && !GameplayManager.previewBuildTrial) {
        const state = (GameplayManager.previewInventoryTrial ?
            GameplayManager.getInventory() : GameplayManager.getMapTrial()).inventory;
        if (state?.phase === "ended") screen = "settlement";
        else if (state?.phase === "active" && state.flow?.phase === "battle") screen = "battle";
        else if (state?.phase === "active" && state.flow?.pending) screen = "build";
        else if (screen === "start" && state?.phase === "active")
            screen = GameplayManager.previewInventoryTrial ? "inventory" : "map";
        else if (!state || state.phase === "preparation") screen = "start";
    }
    GameplayManager.onTrialExpired = () => openSkillBattleScreen("settlement");
    const ui = UIManager.ins();
    closeSkillBattleScreens();
    if (screen === "start") currentSkillBattleView = ui.openForm(SkillBattleStartView);
    else if (screen === "battle") currentSkillBattleView = ui.openForm(SkillBattleBattleView);
    else if (screen === "map") currentSkillBattleView = ui.openForm(SkillBattleMapView);
    else if (screen === "inventory") currentSkillBattleView = ui.openForm(SkillBattleInventoryView);
    else if (screen === "build") currentSkillBattleView = ui.openForm(SkillBattleBuildView);
    else currentSkillBattleView = ui.openForm(SkillBattleSettlementView);
}
