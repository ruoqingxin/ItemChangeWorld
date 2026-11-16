import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { ManualTestManager } from "../manager/ManualTestManager";
import { ManualTestPanel } from "./ManualTestPanel";

export class ManualTestView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/manualTest/ManualTestView.lh"; }
    protected get dependencyRes(): string[] {
        return [1, 2, 3, 4].map(i => `ui/atlas/module/skillBattle/skill-${i}.png`);
    }
    readonly session = new ManualTestManager();
    panel: ManualTestPanel;
    protected onConstruct(): void { this.panel = new ManualTestPanel(this); }
    onOpen(onBack?: () => void): void { this.panel.open(onBack || (() => this.close())); }
    protected onClose(): void { this.panel.suspend(); }
}
