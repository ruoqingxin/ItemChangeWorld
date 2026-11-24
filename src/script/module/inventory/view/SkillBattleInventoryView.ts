import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { closeInventoryScreen } from "../../gameplay/utils/GameplayNavigation";
import { GameplayManager } from "../../gameplay/manager/GameplayManager";
import { WarehousePanel } from "./WarehousePanel";
import { InventoryGridItemCtrl } from "../ctrl/InventoryGridItemCtrl";
import { WarehouseSkinUtils } from "../utils/WarehouseSkinUtils";

export class SkillBattleInventoryView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/inventory/SkillBattleInventoryView.lh"; }
    private panel: WarehousePanel;
    protected onConstruct(): void {
        WarehouseSkinUtils.configure(this.view);
        const lists = {
            safe:this.elems.getList<InventoryGridItemCtrl>("list_safe_cells"),
            battle:this.elems.getList<InventoryGridItemCtrl>("list_battle_cells"),
            bag:this.elems.getList<InventoryGridItemCtrl>("list_bag_cells"),
            source:this.elems.getList<InventoryGridItemCtrl>("list_source_cells"),
        };
        for(const list of Object.values(lists)){
            list.itemCtrl=InventoryGridItemCtrl;list.isVirtual=false;list.autoSelectOnChange=false;
            list.rootNode.itemTemplate=Laya.loader.getRes("ui/prefab/common/inventory/InventoryGridCell.lh");
        }
        this.panel = new WarehousePanel(this,GameplayManager.getMapTrial(),lists);
        this.addClickListener(this.getElement("btn_close"), closeInventoryScreen);
    }
    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }
    protected onClose(): void { this.panel?.suspend(); }
}
