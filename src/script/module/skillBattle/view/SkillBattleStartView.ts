import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { SkillBattlePanel } from "./SkillBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

/** Entry screen for a run. It is opened and closed independently by UIManager. */
export class SkillBattleStartView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleStartView.lh"; }
    private panel: SkillBattlePanel;

    protected onConstruct(): void {
        const expedition = SkillBattleUISession.getExpedition();
        this.panel = new SkillBattlePanel(this, expedition.configuration, expedition,
            screen => openSkillBattleScreen(screen), "start");
    }

    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }

    startRun(): void { this.panel.startRun(); }

    protected onClose(): void { this.panel?.suspend(); }
}
