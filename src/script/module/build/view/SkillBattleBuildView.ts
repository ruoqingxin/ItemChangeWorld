import { GameplayPanelFactory } from "../../gameplay/utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { openSkillBattleScreen } from "../../gameplay/utils/GameplayNavigation";

export class SkillBattleBuildView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleBuildView.lh"; }
    private panel: BattlePanel;
    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this,"start",openSkillBattleScreen,"build");
    }
    onOpen(): void { this.panel.openHubScreen(); this.panel.resizeTo(this.view); }
    protected onClose(): void { this.panel?.suspend(); }
}
