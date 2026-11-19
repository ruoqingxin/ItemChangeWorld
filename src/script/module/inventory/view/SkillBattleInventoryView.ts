import { GameplayPanelFactory } from "../../gameplay/utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { closeInventoryScreen, openSkillBattleScreen } from "../../gameplay/utils/GameplayNavigation";

export class SkillBattleInventoryView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/inventory/SkillBattleInventoryView.lh"; }
    private panel: BattlePanel;
    private lobbyBack: Laya.GWidget;
    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this,"start",openSkillBattleScreen,"inventory");
        this.lobbyBack = this.getElement("btn_lobby_back");
        this.addClickListener(this.lobbyBack, closeInventoryScreen);
    }
    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
        this.lobbyBack.visible = true;
    }
    protected onClose(): void { this.panel?.suspend(); }
}
