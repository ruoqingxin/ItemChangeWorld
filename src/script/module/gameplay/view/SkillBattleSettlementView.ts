import { GameplayPanelFactory } from "../utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";

import { openSkillBattleScreen } from "../utils/GameplayNavigation";


export class SkillBattleSettlementView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/gameplay/SkillBattleSettlementView.lh"; }
    private panel: BattlePanel;

    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this, "settlement", screen => openSkillBattleScreen(screen));
    }

    onOpen(): void {
        this.panel.openSettlementScreen();
        this.panel.resizeTo(this.view);
    }

    protected onClose(): void { this.panel?.suspend(); }
}
