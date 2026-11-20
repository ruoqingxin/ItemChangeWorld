import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { closeInventoryScreen } from "../../gameplay/utils/GameplayNavigation";
import { GameplayManager } from "../../gameplay/manager/GameplayManager";
import { WarehousePanel } from "./WarehousePanel";
import { InventoryGridItemCtrl } from "../ctrl/InventoryGridItemCtrl";

export class SkillBattleInventoryView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/inventory/SkillBattleInventoryView.lh"; }
    private panel: WarehousePanel;
    protected onConstruct(): void {
        this.configurePanelBackgrounds(this.view);
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
    private configurePanelBackgrounds(root: Laya.GWidget): void {
        const grids: Record<string,number[]> = {
            "graphite/panel":[20,20,20,20,0],
            "graphite/scroll-track":[8,4,8,4,0],
        };
        for(const state of ["normal","pressed","disabled"]){
            grids[`graphite/button-${state}`]=[6,38,16,38,0];
            grids[`graphite/square-${state}`]=[8,18,20,18,0];
        }
        for(const state of ["normal","selected","locked"])grids[`graphite/page-${state}`]=[10,12,10,12,0];
        for(const state of ["normal","pressed"])grids[`graphite/scroll-${state}`]=[8,6,8,6,0];
        // 原 PNG 预览和编辑器导入共用相同九宫，切换状态前也准备好选中纹理。
        for(const [name,grid] of Object.entries(grids)){
            const texture=Laya.loader.getRes(`ui/atlas/module/warehouse/${name}.png`) as Laya.Texture;
            if(texture)texture._sizeGrid=grid;
        }
        const refresh=(node:Laya.GWidget):void=>{
            if(node instanceof Laya.GImage&&node.src.startsWith("ui/atlas/module/warehouse/")){
                const src=node.src;node.src="";node.src=src;
            }
            for(let i=0;i<node.numChildren;i++)refresh(node.getChildAt(i) as Laya.GWidget);
        };
        refresh(root);
    }
    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }
    protected onClose(): void { this.panel?.suspend(); }
}
