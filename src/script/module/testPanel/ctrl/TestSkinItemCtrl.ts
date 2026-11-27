import { ListItemCtrl } from "../../../games/uilib/ListItemCtrl";

export interface ITestSkinItemData {
    label: string;
    meta: string;
    width: number;
    selected: boolean;
}

export class TestSkinItemCtrl extends ListItemCtrl<ITestSkinItemData> {
    private background: Laya.GImage;
    private label: Laya.GTextField;
    private meta: Laya.GTextField;

    setComponents(rootNode: Laya.GWidget): void {
        this._rootNode = rootNode;
        this.background = rootNode.getChildByName("img_item_bg") as Laya.GImage;
        this.label = rootNode.getChildByName("txt_item_name") as Laya.GTextField;
        this.meta = rootNode.getChildByName("txt_item_meta") as Laya.GTextField;
    }

    update(data: ITestSkinItemData): void {
        this.rootNode.visible = true;
        this.rootNode.size(data.width, 38);
        this.background.size(data.width, 38);
        this.background.src = data.selected
            ? "ui/atlas/module/warehouse/graphite/page-selected.png"
            : "ui/atlas/module/warehouse/graphite/page-normal.png";
        this.label.text = data.label;
        this.label.color = data.selected ? "#fff0c9" : "#d9dfda";
        this.label.bold = data.selected;
        this.meta.pos(data.width - 50, 2);
        this.meta.text = data.meta;
        this.meta.color = data.selected ? "#f0d79c" : "#9faca7";
    }
}
