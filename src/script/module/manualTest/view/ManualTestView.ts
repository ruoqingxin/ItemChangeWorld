import { ConfigUtil } from "../../../config/ConfigUtil";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";
import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { RogueTestManager } from "../manager/RogueTestManager";
import { RogueTestPanel } from "./RogueTestPanel";

export class ManualTestView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/manualTest/ManualTestView.lh"; }
    protected get dependencyRes(): string[] {
        return [1, 2, 3, 4].map(i => `ui/atlas/module/skillBattle/skill-${i}.png`);
    }
    readonly rogueSession = new RogueTestManager();
    panel: RogueTestPanel;
    protected onConstruct(): void { BuildConfigUtils.read(ConfigUtil.Tables); this.panel = new RogueTestPanel(this); }
    onOpen(onBack?: () => void): void { this.panel.open(onBack || (() => this.close())); }
    protected onClose(): void { this.panel.suspend(); }
}
