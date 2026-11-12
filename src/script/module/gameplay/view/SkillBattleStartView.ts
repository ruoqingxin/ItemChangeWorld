import { GameplayPanelFactory } from "../utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { GameplayManager } from "../manager/GameplayManager";
import { openSkillBattleScreen } from "../utils/GameplayNavigation";

/** Entry screen for a run. It is opened and closed independently by UIManager. */
export class SkillBattleStartView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string {
        return GameplayManager.previewSingleTrial || GameplayManager.previewBuildTrial ?
            "ui/prefab/module/skillBattle/SkillBattleTrialView.lh" :
            "ui/prefab/module/skillBattle/SkillBattleStartView.lh";
    }
    private panel: BattlePanel;

    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this, "start", screen => openSkillBattleScreen(screen));
    }

    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }

    startRun(): void { this.panel.startRun(); }

    protected onClose(): void { this.panel?.suspend(); }
}
