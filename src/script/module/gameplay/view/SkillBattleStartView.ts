import { GameplayPanelFactory } from "../utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";

import { openLobbyScreen, openSkillBattleScreen } from "../utils/GameplayNavigation";


export class SkillBattleStartView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/gameplay/SkillBattleStartView.lh"; }
    private panel: BattlePanel;

    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this, "start", screen => openSkillBattleScreen(screen));
        this.addClickListener(this.getElement("btn_lobby_back"), openLobbyScreen);
    }

    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }
    startRun(): void { this.panel.startRun(); }

    protected onClose(): void { this.panel?.suspend(); }
}
