import { GameplayPanelFactory } from "../utils/GameplayPanelFactory";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";

import { openLobbyScreen, openSkillBattleScreen } from "../utils/GameplayNavigation";
import { UIManager } from "../../../games/ui/UIManager";
import { ManualTestView } from "../../manualTest/view/ManualTestView";


export class SkillBattleStartView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/gameplay/SkillBattleStartView.lh"; }
    private panel: BattlePanel;
    private manualTestEntry: Laya.GWidget;

    protected onConstruct(): void {
        this.panel = GameplayPanelFactory.createPanel(this, "start", screen => openSkillBattleScreen(screen));
        this.addClickListener(this.getElement("btn_lobby_back"), openLobbyScreen);
        const button = this.getElement<Laya.GWidget>("manualTestEntry");
        this.manualTestEntry = button;
        button.graphics.drawRect(0,0,146,40,"#26372f","#8caa96",1);
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
