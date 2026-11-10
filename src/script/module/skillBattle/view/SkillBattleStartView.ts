import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { NewBattlePanel } from "./NewBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

/** Entry screen for a run. It is opened and closed independently by UIManager. */
export class SkillBattleStartView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string {
        return SkillBattleUISession.previewSingleTrial || SkillBattleUISession.previewBuildTrial ?
            "ui/prefab/module/skillBattle/SkillBattleTrialView.lh" :
            "ui/prefab/module/skillBattle/SkillBattleStartView.lh";
    }
    private panel: NewBattlePanel;

    protected onConstruct(): void {
        this.panel = SkillBattleUISession.createPanel(this, "start", screen => openSkillBattleScreen(screen));
    }

    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }

    startRun(): void { this.panel.startRun(); }

    protected onClose(): void { this.panel?.suspend(); }
}
