import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { ManualTestManager } from "../manager/ManualTestManager";
import { ManualTestPanel } from "./ManualTestPanel";
import { RogueTestManager } from "../manager/RogueTestManager";
import { RogueTestPanel } from "./RogueTestPanel";

export class ManualTestView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/manualTest/ManualTestView.lh"; }
    protected get dependencyRes(): string[] {
        return [1, 2, 3, 4].map(i => `ui/atlas/module/skillBattle/skill-${i}.png`);
    }
    readonly session = new ManualTestManager();
    readonly rogueSession = new RogueTestManager();
    panel: ManualTestPanel | RogueTestPanel;
    private legacyPanel: ManualTestPanel;
    private roguePanel: RogueTestPanel;
    private onBack: () => void;
    protected onConstruct(): void {
        this.legacyPanel = new ManualTestPanel(this); this.roguePanel = new RogueTestPanel(this);
        const search = typeof window !== "undefined" ? window.location?.search || "" : "";
        this.panel = new URLSearchParams(search).get("manualLegacy") === "1" ? this.legacyPanel : this.roguePanel;
    }
    switchMode(mode: "legacy" | "rogue"): void {
        this.panel.suspend(); this.panel = mode === "legacy" ? this.legacyPanel : this.roguePanel;
        this.panel.open(this.onBack);
    }
    onOpen(onBack?: () => void): void { this.onBack = onBack || (() => this.close()); this.panel.open(this.onBack); }
    protected onClose(): void { this.panel.suspend(); }
}
