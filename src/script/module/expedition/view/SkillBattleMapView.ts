import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { SkillBattleUISession } from "../../skillBattle/view/SkillBattleUISession";
import { openSkillBattleScreen } from "../../skillBattle/view/SkillBattleUINavigation";
import { SkillBattleMapPanel } from "./SkillBattleMapPanel";

export class SkillBattleMapView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/expedition/SkillBattleMapView.lh"; }
    private panel: SkillBattleMapPanel;

    protected onConstruct(): void {
        const expedition = SkillBattleUISession.getExpedition();
        this.panel = new SkillBattleMapPanel(this, expedition, screen => openSkillBattleScreen(screen));
        this.view.on(Laya.Event.RESIZE, this, this.resize);
    }

    onOpen(): void {
        this.panel.open();
        this.resize();
        Laya.timer.loop(1000, this, this.tick);
    }

    protected onClose(): void {
        Laya.timer.clear(this, this.tick);
    }

    private tick(): void { this.panel.tick(); }

    private resize(): void {
        this.panel.resizeTo(this.view);
    }
}
