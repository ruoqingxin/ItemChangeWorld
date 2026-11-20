import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import type { InventoryTemplate } from "../types/InventoryTypes";

export interface IItemDetailRequest {
    template: InventoryTemplate;
    durability: number | null;
    rotated: boolean;
    anchor: Laya.GWidget;
    closed?(): void;
}

export class ItemDetailView extends UIBaseView {
    get layer(): UILayer { return UILayer.OnlyTip; }
    get path(): string { return "ui/prefab/module/inventory/ItemDetailView.lh"; }
    private panel: Laya.GWidget;
    private title: Laya.GTextField;
    private detail: Laya.GTextField;
    private request: IItemDetailRequest | null = null;

    protected onConstruct(): void {
        this.panel=this.getElement("box_item_detail");
        this.title=this.getElement("txt_item_name");
        this.detail=this.getElement("txt_item_detail");
        this.addClickListener(this.getElement("btn_close"),this.close);
    }

    onOpen(request: IItemDetailRequest): void {
        this.request=request;
        const t=request.template,w=request.rotated?t.height:t.width,h=request.rotated?t.width:t.height;
        const quality=["","普通","优秀","精良","稀有","史诗","传说"][t.quality||1];
        this.title.text=t.name;
        this.detail.text=`${quality} · ${w}×${h}\n重量 ${t.weight}${
            request.durability!==null?`\n耐久 ${request.durability}/${t.weaponDurability}\n攻击 +${t.weaponAttack} · 防御 +${t.weaponDefense}`:""}${
            t.kind==="container"?`\n容量 ${t.bagWidth*t.bagHeight} 格 · 承重 +${t.weightLimit}`:""}${
            t.kind==="repair"?`\n修理 ${t.repairAmount===-1?"全部耐久":t.repairAmount+" 耐久"}`:""}${
            t.kind==="stamina"?`\n恢复体力 ${t.staminaRestore}`:""}\n${t.safe?"可放归真匣":"禁止归真匣"}`;
        this.placeNearItem();
        Laya.stage.on(Laya.Event.MOUSE_DOWN,this,this.onPointerDown);
        Laya.stage.on(Laya.Event.KEY_DOWN,this,this.onKeyDown);
        Laya.stage.on(Laya.Event.RESIZE,this,this.onResize);
    }

    private placeNearItem(): void {
        const anchor=this.request?.anchor;
        if(!anchor||anchor.destroyed||!anchor.visible){this.close();return;}
        const parent=this.panel.parent as Laya.GWidget;
        const start=parent.globalToLocal(anchor.localToGlobal(new Laya.Point()));
        const end=parent.globalToLocal(anchor.localToGlobal(new Laya.Point(anchor.width,anchor.height)));
        const topLeft=parent.globalToLocal(new Laya.Point());
        const bottomRight=parent.globalToLocal(new Laya.Point(Laya.stage.width,Laya.stage.height));
        const margin=12,gap=10,width=bottomRight.x-topLeft.x,height=bottomRight.y-topLeft.y;
        const scale=Math.min(1,(width-margin*2)/this.panel.width,(height-margin*2)/this.panel.height);
        this.panel.scale(scale,scale);
        const panelWidth=this.panel.width*scale,panelHeight=this.panel.height*scale;
        // 优先贴物品右侧，右侧不足则翻到左侧，再限制到完整视口内。
        const right=end.x+gap,left=start.x-gap-panelWidth;
        const x=right+panelWidth<=bottomRight.x-margin?right:left>=topLeft.x+margin?left:start.x;
        this.panel.pos(
            Math.max(topLeft.x+margin,Math.min(x,bottomRight.x-margin-panelWidth)),
            Math.max(topLeft.y+margin,Math.min(start.y,bottomRight.y-margin-panelHeight)));
    }

    private onResize(): void { Laya.timer.callLater(this,this.placeNearItem); }
    private onPointerDown(event: Laya.Event): void {
        for(let node=event.target as Laya.Node;node;node=node.parent)if(node===this.panel)return;
        this.close();
    }
    private onKeyDown(event: Laya.Event): void {
        if((event.nativeEvent as KeyboardEvent)?.key==="Escape")this.close();
    }
    protected onClose(): void {
        Laya.stage.off(Laya.Event.MOUSE_DOWN,this,this.onPointerDown);
        Laya.stage.off(Laya.Event.KEY_DOWN,this,this.onKeyDown);
        Laya.stage.off(Laya.Event.RESIZE,this,this.onResize);
        Laya.timer.clearAll(this);
        const request=this.request;this.request=null;request?.closed?.();
    }
}
