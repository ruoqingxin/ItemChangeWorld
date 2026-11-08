import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { SkillBattlePanel } from "./SkillBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

/** Settlement screen for a completed run. */
export class SkillBattleSettlementView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleSettlementView.lh"; }
    private panel: SkillBattlePanel;

    protected onConstruct(): void {
        const expedition = SkillBattleUISession.getExpedition();
        this.panel = new SkillBattlePanel(this, expedition.configuration, expedition,
            screen => openSkillBattleScreen(screen), "settlement");
    }

    onOpen(): void {
        this.panel.openSettlementScreen();
        this.panel.resizeTo(this.view);
    }

    protected onClose(): void { this.panel?.suspend(); }
}
