import { ListItemCtrl } from "../../../games/uilib/ListItemCtrl";
import type { InventoryTemplate } from "../types/InventoryTypes";

export interface IInventoryItemData {
    template: InventoryTemplate; width: number; height: number; rotated: boolean;
    selected?: boolean; outline?: string;
    footer?: string;
}

export class InventoryItemCtrl extends ListItemCtrl<IInventoryItemData> {
    private frame: Laya.GImage;
    private icon: Laya.GImage;
    private selection: Laya.GWidget;
    private caption: Laya.GTextField;
    setComponents(rootNode: Laya.GWidget, _index: number): void {
        this._rootNode = rootNode;
        // 每个物品只缓存自身组件，内部节点不加入页面映射。
        this.frame = rootNode.getChildAt(0) as Laya.GImage;
        this.icon = rootNode.getChildAt(2) as Laya.GImage;
        this.selection = rootNode.getChildAt(rootNode.numChildren-1) as Laya.GWidget;
        (rootNode.getChildAt(1) as Laya.GWidget).visible = false;
        if(rootNode.numChildren>4){
            this.caption=rootNode.getChildAt(3) as Laya.GTextField;
            this.caption.visible=false;
        }
        this.frame.on(Laya.Event.LOADED,this,this.refreshFrame);
    }
    update(data: IInventoryItemData, _index: number): void {
        const {template:t,width,height,rotated,selected,outline} = data;
        this.rootNode.size(width,height); this.rootNode.visible = true; this.rootNode.alpha = 1;
        this.frame.size(width,height); this.frame.visible = true;
        this.frame.src = `ui/atlas/module/inventory/quality-${t.quality || 1}.png`;
        this.refreshFrame();
        this.icon.src = t.icon; this.icon.visible = true;
        const texture = Laya.loader.getRes(t.icon) as Laya.Texture;
        const tw = texture?.width || 54, th = texture?.height || 54;
        const footerHeight=data.footer?20:0;
        const ratio = Math.min((width-12)/(rotated?th:tw),(height-12-footerHeight)/(rotated?tw:th));
        const w=tw*ratio,h=th*ratio;
        this.icon.rotation=rotated?90:0;this.icon.size(w,h);
        this.icon.pos((width-(rotated?h:w))/2+(rotated?h:0),(height-footerHeight-(rotated?w:h))/2);
        if(this.caption){
            this.caption.visible=!!data.footer;
            this.caption.text=data.footer||"";
            this.caption.pos(3,height-23);this.caption.size(width-6,20);
            this.caption.fontSize=12;this.caption.align="center";this.caption.valign="middle";
            this.caption.color="#dfc58d";
        }
        this.selection.size(width,height); this.selection.visible=!!selected;
        this.selection.graphics.clear();
        if(selected)this.selection.graphics.drawRoundRect(1,1,width-2,height-2,6,6,6,6,null,outline||"#f4f5e9",2);
    }
    clear(): void {
        this.rootNode.visible=true;this.rootNode.alpha=1;
        this.frame.visible=false;this.icon.visible=false;this.selection.visible=false;
        if(this.caption)this.caption.visible=false;
    }
    private refreshFrame(): void {
        const texture=this.frame.texture;
        if(!texture)return;
        if(texture._sizeGrid?.join(",")==="8,8,8,8,0"&&
            this.frame.graphics.cmds.some(c=>c.cmdID===Laya.Draw9GridTextureCmd.ID))return;
        texture._sizeGrid=[8,8,8,8,0];
        const src=this.frame.src;this.frame.src="";this.frame.src=src;
    }
}
