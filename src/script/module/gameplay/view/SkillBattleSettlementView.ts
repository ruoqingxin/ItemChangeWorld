import { GameplayPanelFactory } from "../utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { GameplayManager } from "../manager/GameplayManager";
import { openSkillBattleScreen } from "../utils/GameplayNavigation";

/** Settlement screen for a completed run. */
export class SkillBattleSettlementView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return GameplayManager.previewSingleTrial ?
        "ui/prefab/module/skillBattle/SkillBattleTrialResultView.lh" :
        "ui/prefab/module/skillBattle/SkillBattleSettlementView.lh"; }
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
