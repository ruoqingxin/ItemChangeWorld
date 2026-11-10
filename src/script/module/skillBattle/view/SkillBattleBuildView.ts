import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { NewBattlePanel } from "./NewBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

export class SkillBattleBuildView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleBuildView.lh"; }
    private panel: NewBattlePanel;
    protected onConstruct(): void {
        this.panel = SkillBattleUISession.createPanel(this,"start",openSkillBattleScreen,"build");
    }
    onOpen(): void { this.panel.openHubScreen(); this.panel.resizeTo(this.view); }
    protected onClose(): void { this.panel?.suspend(); }
}
