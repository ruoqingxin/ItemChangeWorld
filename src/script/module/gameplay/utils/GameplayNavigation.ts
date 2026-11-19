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
import { LobbyView } from "../../lobby/view/LobbyView";
import { LobbySettingsView } from "../../lobby/view/LobbySettingsView";
import { LobbySaveView } from "../../lobby/view/LobbySaveView";
import type { BattlePanel } from "../../skillBattle/view/BattlePanel";

export type SkillBattleScreen = SkillBattlePage;
export let currentSkillBattleView: UIBaseView;
let inventoryReturnView: UIBaseView | null = null;

export function closeSkillBattleScreens(): void {
    inventoryReturnView = null;
    const ui = UIManager.ins();
    for (const view of [SkillBattleStartView, SkillBattleBattleView, SkillBattleMapView,
        SkillBattleSettlementView, SkillBattleInventoryView, SkillBattleBuildView,
        SkillBattleConfirmView, SkillBattleReportView, SkillBattleBuildInfoView,
        LobbyView, LobbySettingsView, LobbySaveView]) ui.closeForm<UIBaseView>(view);
}

export function openGameEntry(): void {
    closeSkillBattleScreens();
    GameplayManager.onTrialExpired = () => {};
    currentSkillBattleView = UIManager.ins().openForm(LobbySaveView);
}

export function closeInventoryScreen(): void {
    const previous = inventoryReturnView;
    inventoryReturnView = null;
    UIManager.ins().closeForm(SkillBattleInventoryView);
    if (previous?.isOpened) {
        currentSkillBattleView = previous;
        const panel = (previous as UIBaseView & { panel?: BattlePanel }).panel;
        if (panel) { panel.openHubScreen(); panel.resizeTo(previous.view); }
    } else openLobbyScreen();
}

export function openLobbyScreen(): void {
    const trial = GameplayManager.getActive();
    if (!trial.error && !trial.inventory) {
        openGameEntry();
        return;
    }
    if (trial.error || trial.inventory?.phase === "active" || trial.inventory?.phase === "ended") {
        openSkillBattleScreen(trial.screen);
        return;
    }
    closeSkillBattleScreens();
    currentSkillBattleView = UIManager.ins().openForm(LobbyView);
}

export function openSkillBattleScreen(screen: SkillBattleScreen): void {
    const state = GameplayManager.getMapTrial().inventory;
    if (state?.phase === "ended") screen = "settlement";
    else if (state?.phase === "active" && state.flow?.phase === "battle") screen = "battle";
    else if (state?.phase === "active" && state.flow?.pending) screen = "build";
    else if (screen === "start" && state?.phase === "active") screen = "map";
    else if (!state || state.phase === "preparation") screen = screen === "inventory" ? "inventory" : "start";
    GameplayManager.onTrialExpired = () => openSkillBattleScreen("settlement");
    const ui = UIManager.ins();
    if (screen === "inventory") {
        if (currentSkillBattleView instanceof SkillBattleInventoryView &&
            currentSkillBattleView.isOpenedOrOpening) return;
        if (!currentSkillBattleView?.isOpenedOrOpening) {
            currentSkillBattleView = state?.phase === "active" ?
                ui.openForm(SkillBattleMapView) : ui.openForm(LobbyView);
        }
        inventoryReturnView = currentSkillBattleView;
        (inventoryReturnView as UIBaseView & { panel?: BattlePanel }).panel?.suspend();
        currentSkillBattleView = ui.openForm(SkillBattleInventoryView);
        return;
    }
    closeSkillBattleScreens();
    if (screen === "start") currentSkillBattleView = ui.openForm(SkillBattleStartView);
    else if (screen === "battle") currentSkillBattleView = ui.openForm(SkillBattleBattleView);
    else if (screen === "map") currentSkillBattleView = ui.openForm(SkillBattleMapView);
    else if (screen === "build") currentSkillBattleView = ui.openForm(SkillBattleBuildView);
    else currentSkillBattleView = ui.openForm(SkillBattleSettlementView);
}
