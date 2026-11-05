import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { ExpeditionConfigUtils } from "../../expedition/utils/ExpeditionConfigUtils";
import { SkillBattlePanel } from "./SkillBattlePanel";

export class SkillBattleView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/skillBattle/SkillBattleView.lh"; }
    private panel: SkillBattlePanel;

    protected onConstruct(): void {
        this.panel = new SkillBattlePanel(ExpeditionConfigUtils.read(ConfigUtil.Tables));
        this.view.addChild(this.panel);
        this.view.on(Laya.Event.RESIZE, this, this.resize);
    }

    onOpen(): void {
        this.panel.openEncounter();
        this.resize();
    }

    protected onClose(): void { this.panel.suspend(); }

    private resize(): void {
        const scale = Math.min(this.view.width / 720, this.view.height / 1280);
        this.view.graphics.clear();
        this.view.graphics.drawRect(0, 0, this.view.width, this.view.height, "#171d1b");
        this.panel.scale(scale, scale);
        this.panel.pos((this.view.width - 720 * scale) / 2, (this.view.height - 1280 * scale) / 2);
    }
}
