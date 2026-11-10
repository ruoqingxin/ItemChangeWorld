import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { NewBattlePanel } from "./NewBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

/** Settlement screen for a completed run. */
export class SkillBattleSettlementView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return SkillBattleUISession.previewSingleTrial ?
        "ui/prefab/module/skillBattle/SkillBattleTrialResultView.lh" :
        "ui/prefab/module/skillBattle/SkillBattleSettlementView.lh"; }
    private panel: NewBattlePanel;

    protected onConstruct(): void {
        this.panel = SkillBattleUISession.createPanel(this, "settlement", screen => openSkillBattleScreen(screen));
    }

    onOpen(): void {
        this.panel.openSettlementScreen();
        this.panel.resizeTo(this.view);
    }

    protected onClose(): void { this.panel?.suspend(); }
}
