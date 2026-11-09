import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { SkillBattlePanel } from "./SkillBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

/** Battle-only UI entry. Start and settlement are separate UIBaseViews. */
export class SkillBattleBattleView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleBattleView.lh"; }
    protected panel: SkillBattlePanel;

    protected onConstruct(): void {
        const expedition = SkillBattleUISession.getExpedition();
        this.panel = new SkillBattlePanel(this, expedition.configuration, expedition,
            screen => openSkillBattleScreen(screen), "battle");
        this.view.on(Laya.Event.RESIZE, this, this.resize);
    }

    onOpen(): void {
        this.panel.openEncounter();
        this.resize();
    }

    protected onClose(): void { this.panel?.suspend(); }

    protected resize(): void {
        this.panel.resizeTo(this.view);
    }
}
