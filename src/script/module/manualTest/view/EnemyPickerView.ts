import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { GuzongEnemyRules } from "../../skillBattle/utils/GuzongEnemyRules";
import type { RogueEnemyId } from "../../skillBattle/types/QingmingTypes";

export class EnemyPickerView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/manualTest/EnemyPickerView.lh"; }
    private readonly buttons: Laya.GWidget[] = [];
    private readonly labels: Laya.GTextField[] = [];
    private selected: (id: RogueEnemyId | null) => void;
    private rows: Array<RogueEnemyId | null> = [];
    protected onConstruct(): void {
        for (let i = 0; i < 16; i++) {
            const button = this.getElement<Laya.GWidget>(`btn_enemy${i}`);
            this.buttons.push(button);
            this.labels.push(this.getElement<Laya.GTextField>(`txt_btn_enemy${i}`));
            this.addClickListener(button, () => {
                const callback = this.selected, id = this.rows[i];
                this.close(); callback(id);
            });
        }
        this.addClickListener(this.getElement("btn_close"), this.close);
    }
    onOpen(selected: (id: RogueEnemyId | null) => void): void {
        this.selected = selected;
        this.rows = [null, ...Object.keys(GuzongEnemyRules.enemies) as RogueEnemyId[]];
        this.buttons.forEach((button, i) => {
            const enemy = GuzongEnemyRules.enemies[this.rows[i]];
            this.labels[i].text = enemy ? `${enemy.tier} · ${enemy.name}` : "随机古宗敌阵";
            button.graphics.clear();
            button.graphics.drawRect(0, 0, button.width, button.height, "#26372f", "#8caa96", 1);
        });
    }
    protected onClose(): void { this.selected = null; }
}
