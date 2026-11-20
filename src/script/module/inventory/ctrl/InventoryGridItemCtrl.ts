import { ListItemCtrl } from "../../../games/uilib/ListItemCtrl";

export interface IInventoryGridItemData { name: string; skin: string; }

export class InventoryGridItemCtrl extends ListItemCtrl<IInventoryGridItemData> {
    private image: Laya.GImage;
    setComponents(rootNode: Laya.GWidget, _index: number): void {
        this._rootNode = rootNode;
        this.image=rootNode.getChildByName("img_cell") as Laya.GImage;
    }
    update(data: IInventoryGridItemData, _index: number): void {
        this.rootNode.name = data.name;
        this.rootNode.visible = true;
        this.image.src=data.skin;
    }
}
