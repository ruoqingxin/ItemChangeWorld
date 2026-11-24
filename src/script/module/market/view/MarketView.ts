import { UIBaseView } from "../../../games/ui/UIBaseView";
import { UILayer } from "../../../games/ui/UILayer";
import { GameplayManager } from "../../gameplay/manager/GameplayManager";
import { closeMarketScreen } from "../../gameplay/utils/GameplayNavigation";
import { InventoryGridItemCtrl } from "../../inventory/ctrl/InventoryGridItemCtrl";
import { WarehouseSkinUtils } from "../../inventory/utils/WarehouseSkinUtils";
import { WarehousePanel } from "../../inventory/view/WarehousePanel";
import { InventoryItemCtrl } from "../../inventory/ctrl/InventoryItemCtrl";
import { InventoryRules } from "../../inventory/utils/InventoryRules";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { UIManager } from "../../../games/ui/UIManager";
import { ItemDetailView } from "../../inventory/view/ItemDetailView";
import { MarketConfigUtils } from "../utils/MarketConfigUtils";
import { MarketRules } from "../utils/MarketRules";
import type { MarketGoods } from "../types/MarketTypes";
import type { BuildToken } from "../../build/types/BuildTypes";
import type { InventoryItem, InventoryLocation } from "../../inventory/types/InventoryTypes";
import type { ExpeditionCommand } from "../../expedition/types/ExpeditionRunTypes";

const CATEGORIES = [
    { code: "weapon", name: "武器" },
    { code: "armor", name: "防具" },
    { code: "accessory", name: "饰品" },
    { code: "container", name: "纳虚" },
    { code: "material", name: "材料" },
] as const;

export class MarketView extends UIBaseView {
    get layer(): UILayer { return UILayer.Second; }
    get path(): string { return "ui/prefab/module/market/MarketView.lh"; }
    private panel: WarehousePanel;
    private category = 0;
    private title: Laya.GTextField;
    private empty: Laya.GTextField;
    private readonly tabs: Array<{ skin: Laya.GImage; text: Laya.GTextField }> = [];
    private goods: MarketGoods[] = [];
    private page = 0;
    private pageCount = 1;
    private previous: Laya.GWidget;
    private next: Laya.GWidget;
    private pageText: Laya.GTextField;
    private readonly items = new Map<number, InventoryItemCtrl>();
    private source: Laya.GWidget;
    private detail: ItemDetailView | null = null;
    private selected = 0;
    private draggedOffer: MarketGoods | null = null;

    protected onConstruct(): void {
        WarehouseSkinUtils.configure(this.view);
        this.title = this.getElement("invSourceTitle");
        this.empty = this.getElement("txt_market_empty");
        this.source = this.getElement("sourceItemsArea");
        this.previous=this.getElement("btn_market_prev");
        this.next=this.getElement("btn_market_next");
        this.pageText=this.getElement("txt_market_page");
        this.addClickListener(this.previous,()=>this.onClickPage(-1));
        this.addClickListener(this.next,()=>this.onClickPage(1));
        CATEGORIES.forEach((category, index) => {
            const button = this.getElement<Laya.GWidget>(`btn_category_${category.code}`);
            const skin = this.getElement<Laya.GImage>(`img_category_${category.code}`);
            const text = this.getElement<Laya.GTextField>(`txt_category_${category.code}`);
            this.tabs.push({ skin, text });
            this.addClickListener(button, () => this.onClickCategory(index));
        });
        const lists = {
            safe: this.elems.getList<InventoryGridItemCtrl>("list_safe_cells"),
            battle: this.elems.getList<InventoryGridItemCtrl>("list_battle_cells"),
            bag: this.elems.getList<InventoryGridItemCtrl>("list_bag_cells"),
            source: this.elems.getList<InventoryGridItemCtrl>("list_source_cells"),
        };
        for (const list of Object.values(lists)) {
            list.itemCtrl = InventoryGridItemCtrl;
            list.isVirtual = false;
            list.autoSelectOnChange = false;
            list.rootNode.itemTemplate = Laya.loader.getRes("ui/prefab/common/inventory/InventoryGridCell.lh");
        }
        this.panel = new WarehousePanel(this, GameplayManager.getMapTrial(), lists, {
            refresh:()=>this.refreshMarket(),
            itemForNode:key=>this.sourceItemForNode(key),
            closeDetail:()=>this.closeDetail(),
            previewDrop:(item,to,token)=>this.previewTrade(item,to,token),
            drop:(item,to,token)=>this.commitTrade(item,to,token),
        });
        this.addClickListener(this.getElement("btn_close"), closeMarketScreen);
    }

    onOpen(): void {
        this.category = 0;
        this.page = 0;
        this.draggedOffer = null;
        this.goods = MarketConfigUtils.read(ConfigUtil.Tables);
        this.panel.openHubScreen();
        this.panel.resizeTo(this.view);
    }

    private onClickCategory(index: number): void {
        if(this.panel.dragging)return;
        this.closeDetail();
        this.category = index;
        this.page = 0;
        this.panel.closeItemDetail();
        this.panel.refresh();
    }

    private refreshMarket(): void {
        this.title.text = "坊市";
        this.tabs.forEach((tab, index) => {
            const selected = index === this.category;
            tab.skin.src = `ui/atlas/module/warehouse/graphite/page-${selected ? "selected" : "normal"}.png`;
            tab.text.color = selected ? "#dfc58d" : "#b3bbb6";
            tab.text.bold = selected;
        });
        const save=GameplayManager.getMapTrial().archive;
        for(const ctrl of this.items.values())ctrl.rootNode.visible=false;
        if(!save)return;
        const shelf=MarketRules.shelf(save.config,save.state,this.goods,CATEGORIES[this.category].code,save.seed);
        this.pageCount=Math.max(1,...shelf.map(row=>row.slot.page+1));
        this.page=Math.max(0,Math.min(this.page,this.pageCount-1));
        this.empty.visible=shelf.length===0;
        this.empty.text=`暂无在售${CATEGORIES[this.category].name}`;
        for(const row of shelf.filter(row=>row.slot.page===this.page)){
            const {offer,item,slot}=row;
            let ctrl=this.items.get(offer.id);
            if(!ctrl){
                const prefab=Laya.loader.getRes("ui/prefab/common/inventory/InventoryItem.lh") as Laya.Prefab;
                ctrl=new InventoryItemCtrl();ctrl.setComponents(prefab.create() as Laya.GWidget,0);
                ctrl.rootNode.name=`marketGoods${offer.id}`;
                ctrl.rootNode.on(Laya.Event.CLICK,this,()=>this.onClickGoods(offer.id));
                this.panel.bindSourceItem(ctrl.rootNode);
                this.source.addChild(ctrl.rootNode);this.items.set(offer.id,ctrl);
                this.panel.nodes[ctrl.rootNode.name]=ctrl.rootNode;
            }
            const remaining=MarketRules.remaining(save.state,offer);
            const template=InventoryRules.template(save.config,item);
            ctrl.update({template,width:template.width*56-2,height:template.height*56-2,rotated:false,
                selected:this.selected===offer.id,footer:remaining?`${offer.price}愿力`:"售罄"},0);
            ctrl.rootNode.pos(slot.x*56,slot.y*56);
            ctrl.rootNode.alpha=remaining?1:0.45;
        }
        this.pageText.text=`${this.page+1} / ${this.pageCount}`;
        this.previous.mouseEnabled=this.page>0;
        this.next.mouseEnabled=this.page<this.pageCount-1;
        this.previous.alpha=this.previous.mouseEnabled?1:0.35;
        this.next.alpha=this.next.mouseEnabled?1:0.35;
    }

    private onClickPage(direction: number): void {
        const page=this.page+direction;
        if(this.panel.dragging||page<0||page>=this.pageCount)return;
        this.closeDetail();this.page=page;this.panel.refresh();
    }

    private onClickGoods(goodsId: number): void {
        if(this.panel.dragging)return;
        this.closeDetail();this.panel.closeItemDetail();
        const session=GameplayManager.getMapTrial(),save=session.archive;
        const offer=this.goods.find(row=>row.id===goodsId);
        if(!save||!offer)return;
        const item=MarketRules.preview(save.config,save.state,offer,save.seed);
        const remaining=MarketRules.remaining(save.state,offer);
        this.selected=goodsId;this.refreshMarket();
        this.detail=UIManager.ins().openForm(ItemDetailView,{
            template:InventoryRules.template(save.config,item),durability:item.durability,equipment:item.equipment,
            rotated:false,anchor:this.items.get(goodsId).rootNode,
            extra:`售价 ${offer.price} 愿力\n剩余限购 ${remaining}/${offer.limitCount}\n当前愿力 ${save.state.wish}`,
            closed:()=>{this.detail=null;this.selected=0;if(this.isOpened)this.refreshMarket();},
        });
    }

    private sourceItemForNode(key: string): InventoryItem | undefined {
        const save=GameplayManager.getMapTrial().archive;
        const offer=this.goods.find(row=>key===`marketGoods${row.id}`);
        if(!save||!offer)return;
        this.draggedOffer={...offer};
        return MarketRules.preview(save.config,save.state,offer,save.seed);
    }

    private tradeCommand(item: InventoryItem,to: InventoryLocation): Extract<ExpeditionCommand,{type:"buyMarketGoods"|"sellMarketItem"}> {
        if(item.location.space==="warehouse"){
            const offer=this.draggedOffer;
            if(!offer||offer.itemId!==item.templateId)throw new Error("商品信息已改变，请重新拖动");
            if(to.space!=="bag")throw new Error("商品只能拖入当前背包购买");
            return {type:"buyMarketGoods",offer,to:{space:"bag",x:to.x,y:to.y,rotated:to.rotated}};
        }
        if(to.space!=="warehouse")throw new Error("物品须拖入坊市格子出售");
        return {type:"sellMarketItem",uid:item.uid,from:item.location};
    }

    private previewTrade(item: InventoryItem,to: InventoryLocation,token: BuildToken): string {
        const session=GameplayManager.getMapTrial(),command=this.tradeCommand(item,to);
        session.previewMarketTrade(command,token);
        return command.type==="buyMarketGoods"?`购买 · ${command.offer.price} 愿力`:
            `出售 · ${InventoryRules.template(session.archive.config,item).recyclePrice} 愿力`;
    }

    private commitTrade(item: InventoryItem,to: InventoryLocation,token: BuildToken): string {
        const session=GameplayManager.getMapTrial(),command=this.tradeCommand(item,to);
        if(command.type==="buyMarketGoods"){
            const shown=command.offer;
            const catalog=MarketConfigUtils.read(ConfigUtil.Tables);
            const current=catalog.find(row=>row.id===shown.id);
            this.goods=catalog;
            if(!current||current.itemId!==shown.itemId||current.price!==shown.price||
                current.limitCount!==shown.limitCount||current.enabled!==shown.enabled)
                throw new Error("商品信息已更新，请重新查看后购买");
            session.buyMarketGoods(shown.id,catalog,command.to,token);
            return "购买成功，商品已放入背包";
        }
        const price=InventoryRules.template(session.archive.config,item).recyclePrice;
        session.sellMarketItem(item.uid,command.from,token);
        return `出售成功，获得 ${price} 愿力`;
    }

    private closeDetail(): void {
        this.detail?.close();this.detail=null;this.selected=0;
    }

    protected onClose(): void {
        this.closeDetail();
        this.panel?.suspend();
        this.draggedOffer=null;
    }
}
