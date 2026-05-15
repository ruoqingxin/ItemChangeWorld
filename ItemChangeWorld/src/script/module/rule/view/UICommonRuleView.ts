import { UIBaseView } from "src/games/ui/UIBaseView";
import { UILayer } from "src/games/ui/UILayer";


/**
 * 规则界面
 */
export class UICommonRuleView extends UIBaseView {
    public get layer(): UILayer {
        return UILayer.Second;
    }
    public get path(): string {
        return "ui/prefab/module/rule/UICommonRuleView.lh"
    }

    private txt_content: Laya.GTextField;

    protected onConstruct() {
        this.txt_content = this.getElement("txt_content");
        this.addClickListener(this.getElement("btn_close"), this.onClickClose);
    }

    onOpen(funcId?: number, customKey?: string) {

    }

    protected onClose() {

    }

    private onClickClose() {
        this.close();
    }
}