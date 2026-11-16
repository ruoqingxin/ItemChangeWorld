import { GameplayPanelFactory } from "../utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import { GameplayManager } from "../manager/GameplayManager";
import { openSkillBattleScreen } from "../utils/GameplayNavigation";
import { UIManager } from "../../../games/ui/UIManager";
import { ManualTestView } from "../../manualTest/view/ManualTestView";

/** Entry screen for a run. It is opened and closed independently by UIManager. */
export class SkillBattleStartView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string {
        return GameplayManager.previewSingleTrial || GameplayManager.previewBuildTrial ?
            "ui/prefab/module/skillBattle/SkillBattleTrialView.lh" :
            "ui/prefab/module/skillBattle/SkillBattleStartView.lh";
    }
    private panel: BattlePanel;
    private manualTestEntry: Laya.GWidget;

    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this, "start", screen => openSkillBattleScreen(screen));
        const button = new Laya.GWidget(); button.name = "manualTestEntry"; button.size(146, 40);
        button.graphics.drawRect(0, 0, 146, 40, "#26372f", "#8caa96", 1);
        const title = new Laya.GTextField(); title.text = "功法测试"; title.font = "Microsoft YaHei";
        title.fontSize = 18; title.color = "#e4ce8e"; title.align = "center"; title.valign = "middle";
        title.mouseEnabled = false; title.size(146, 40); button.addChild(title);
        this.view.addChild(button); this.manualTestEntry = button;
        button.on(Laya.Event.CLICK, this, () => {
            this.panel.suspend();
            UIManager.ins().openForm(ManualTestView, () => {
                if (this.isOpened) this.panel.openHubScreen();
            });
        });
        this.view.on(Laya.Event.RESIZE, this, this.placeManualTestEntry);
    }

    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
        this.placeManualTestEntry();
    }

    private placeManualTestEntry(): void {
        this.manualTestEntry.pos(this.view.width / 2 - 12, 16);
    }
    startRun(): void { this.panel.startRun(); }

    protected onClose(): void { this.panel?.suspend(); }
}
