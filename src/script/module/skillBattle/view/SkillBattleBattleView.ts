import { GameplayPanelFactory } from "../../gameplay/utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "./BattlePanel";
import { openSkillBattleScreen } from "../../gameplay/utils/GameplayNavigation";

/** Battle-only UI entry. Start and settlement are separate UIBaseViews. */
export class SkillBattleBattleView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleBattleView.lh"; }
    protected panel: BattlePanel;

    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this, "battle", screen => openSkillBattleScreen(screen));
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
