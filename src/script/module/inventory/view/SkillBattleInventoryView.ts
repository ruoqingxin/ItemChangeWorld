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
    private lobbyBack: Laya.GWidget;
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
        this.lobbyBack = this.getElement("btn_lobby_back");
        this.addClickListener(this.lobbyBack, closeInventoryScreen);
    }
    private configurePanelBackgrounds(root: Laya.GWidget): void {
        if(root instanceof Laya.GImage&&/^ui\/atlas\/module\/warehouse\/popup-panel(?:-plain)?\.png$/.test(root.src)){
            const texture=Laya.loader.getRes(root.src) as Laya.Texture;
            if(texture){
                // 原图直载的预览同样使用九宫，保持与编辑器导入参数一致。
                texture._sizeGrid=root.src.endsWith("-plain.png")?[8,8,8,8,0]:[44,12,8,12,0];
                const src=root.src;root.src="";root.src=src;
            }
        }
        for(let i=0;i<root.numChildren;i++)
            this.configurePanelBackgrounds(root.getChildAt(i) as Laya.GWidget);
    }
    onOpen(): void {
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
        this.lobbyBack.visible = true;
    }
    protected onClose(): void { this.panel?.suspend(); }
}
