import { ListItemCtrl } from "../../../games/uilib/ListItemCtrl";

export interface IInventoryGridItemData { name: string; }

export class InventoryGridItemCtrl extends ListItemCtrl<IInventoryGridItemData> {
    setComponents(rootNode: Laya.GWidget, _index: number): void {
        this._rootNode = rootNode;
    }
    update(data: IInventoryGridItemData, _index: number): void {
        this.rootNode.name = data.name;
        this.rootNode.visible = true;
    }
}
