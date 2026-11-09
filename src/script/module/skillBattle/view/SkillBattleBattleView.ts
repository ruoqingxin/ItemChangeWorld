import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { NewBattlePanel } from "./NewBattlePanel";
import { SkillBattleUISession } from "./SkillBattleUISession";
import { openSkillBattleScreen } from "./SkillBattleUINavigation";

/** Battle-only UI entry. Start and settlement are separate UIBaseViews. */
export class SkillBattleBattleView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleBattleView.lh"; }
    protected panel: NewBattlePanel;

    protected onConstruct(): void {
        this.panel = SkillBattleUISession.createPanel(this, "battle", screen => openSkillBattleScreen(screen));
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
