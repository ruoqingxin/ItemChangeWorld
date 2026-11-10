import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { NewBattlePanel } from "../../skillBattle/view/NewBattlePanel";
import { SkillBattleUISession } from "../../skillBattle/view/SkillBattleUISession";
import { openSkillBattleScreen } from "../../skillBattle/view/SkillBattleUINavigation";

export class SkillBattleMapView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/expedition/SkillBattleMapView.lh"; }
    private panel: NewBattlePanel;
    protected onConstruct(): void {
        this.panel = SkillBattleUISession.createPanel(this,"start",openSkillBattleScreen,"map");
    }
    onOpen(): void { this.panel.openHubScreen(); this.panel.resizeTo(this.view); }
    protected onClose(): void { this.panel?.suspend(); }
}
