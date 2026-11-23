import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";

export class TrialOptionPickerView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/manualTest/TrialOptionPickerView.lh"; }
    private readonly buttons: Laya.GWidget[] = [];
    private readonly labels: Laya.GTextField[] = [];
    private selected: (index: number) => void;
    protected onConstruct(): void {
        for (let i = 0; i < 16; i++) {
            const button = this.getElement<Laya.GWidget>(`btn_option${i}`);
            this.buttons.push(button);
            this.labels.push(this.getElement<Laya.GTextField>(`txt_btn_option${i}`));
            this.addClickListener(button, () => {
                const callback = this.selected;
                this.close(); callback(i);
            });
        }
        this.addClickListener(this.getElement("btn_close"), this.close);
    }
    onOpen(options: readonly string[], current: number, selected: (index: number) => void): void {
        this.selected = selected;
        this.buttons.forEach((button, i) => {
            button.visible = i < options.length;
            this.labels[i].text = options[i] || "";
            button.graphics.clear();
            button.graphics.drawRect(0, 0, button.width, button.height,
                i === current ? "#385346" : "#26372f", i === current ? "#9edbb8" : "#8caa96", 1);
        });
    }
    protected onClose(): void { this.selected = null; }
}
