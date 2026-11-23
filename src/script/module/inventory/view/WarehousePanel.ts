import type { UIBaseView } from "../../../games/ui/UIBaseView";
import type { List } from "../../../games/uilib/List";
import type { BuildToken } from "../../build/types/BuildTypes";
import type { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";
import { InventoryRules as Rules } from "../utils/InventoryRules";
import { InventoryConfigUtils } from "../utils/InventoryConfigUtils";
import { InventoryTransferUtils } from "../utils/InventoryTransferUtils";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { InventoryDragController } from "../ctrl/InventoryDragController";
import { InventoryGridItemCtrl } from "../ctrl/InventoryGridItemCtrl";
import { InventoryItemCtrl } from "../ctrl/InventoryItemCtrl";
import type { InventoryAction, InventoryCommand, InventoryConfig, InventoryItem, InventoryLocation, InventorySpace, InventoryState } from "../types/InventoryTypes";
import { openSkillBattleScreen } from "../../gameplay/utils/GameplayNavigation";
import { UIManager } from "../../../games/ui/UIManager";
import { ItemDetailView } from "./ItemDetailView";

type GridName = "safe" | "battle" | "bag" | "source";
type DropTarget = InventoryLocation & {page?: number};
interface HeldItem {
    uid: string; node: Laya.GWidget; point: Laya.Point; grabX: number; grabY: number; rotated: boolean;
    previous: string; token: BuildToken; target: DropTarget | null; command: InventoryCommand | null;
    valid: boolean; error: string;
}

export class WarehousePanel {
    readonly pageRole = "inventory";
    readonly nodes: Record<string,Laya.GWidget> = {};
    readonly buttons: Record<string,Laya.GWidget> = {};
    readonly root: Laya.GWidget;
    readonly bagScroller = new Laya.Scroller();
    opened = false;
    inventoryPage = 0;
    visibleItems: InventoryItem[] = [];
    gridItems: InventoryItem[] = [];
    private config: InventoryConfig;
    private state: InventoryState | null;
    private displayState: InventoryState | null;
    private overflow: string[] = [];
    private selected = "";
    private notice = "";
    private held: HeldItem | null = null;
    private readonly drag: InventoryDragController;
    private readonly itemCtrls = new Map<string,InventoryItemCtrl>();
    private readonly itemRotations = new Map<string,boolean>();
    private readonly equipment = new Map<string,InventoryItemCtrl>();
    private readonly captions = new Map<Laya.GWidget,Laya.GTextField>();
    private readonly skins = new Map<Laya.GWidget,Laya.GImage>();
    private readonly pageLocks = new Map<Laya.GWidget,Laya.GImage>();
    private readonly equipmentHints = new Map<string,Laya.GWidget>();
    private readonly controlSkins = new Map<Laya.GWidget,{image:Laya.GImage;family:string}>();
    private pressedControl: Laya.GWidget | null = null;
    private availablePages = 1;
    private floating: InventoryItemCtrl;
    private autoRotateKey = "";
    private presentedRunId = "";
    private readonly bagScrollBar: Laya.GScrollBar;
    private detailView: ItemDetailView | null = null;
    private readonly safeSpecs = [
        {name:"普通归真匣",cols:2,rows:1},
        {name:"优秀归真匣",cols:2,rows:2},
        {name:"精良归真匣",cols:3,rows:2},
        {name:"稀有归真匣",cols:3,rows:3},
    ];
    private safeIndex = 0;

    constructor(view: UIBaseView, readonly inventorySession: ExpeditionRunManager,
        private readonly lists: Record<GridName,List<InventoryGridItemCtrl>>) {
        this.root = view.getElement("box_inventory_popup");
        for(const n of view.uiElement.elementMapper.elements)if(n)this.nodes[n.name]=n as Laya.GWidget;
        for(const list of Object.values(this.lists))list.setClickListener(this,this.onClickGridCell);
        this.drag = new InventoryDragController(this.root,{
            begin:(key,point)=>this.beginDrag(key,point),move:point=>this.moveDrag(point),
            release:()=>this.releaseDrag(),cancel:()=>this.cancelDrag(),rotate:()=>this.rotateDrag(),
        });
        for(const name of ["btn_take_all","btn_store_all","btn_sell","btn_sort","btn_safe_left","btn_safe_right",
            "btn_repair_all",
            ...Array.from({length:7},(_,i)=>"expLootPage"+(i+1))]) {
            const node=this.nodes[name];this.buttons[name]=node;
            node.on(Laya.Event.CLICK,this,()=>this.onClick(name));
            if(name.startsWith("expLootPage")){
                this.captions.set(node,node.getChildAt(1) as Laya.GTextField);
                this.skins.set(node,node.getChildAt(0) as Laya.GImage);
                this.pageLocks.set(node,node.getChildAt(2) as Laya.GImage);
            }
        }
        for(const name of ["invWeapon","invArmor","invAccessory","invContainer"]){
            const node=this.nodes[name],ctrl=new InventoryItemCtrl();
            ctrl.setComponents(node,0);this.equipment.set(name,ctrl);this.bindItem(node);
            this.equipmentHints.set(name,node.parent.getChildByName(
                name==="invWeapon"?"img_weapon_hint":name==="invArmor"?"img_armor_hint":name==="invAccessory"?"img_accessory_hint":"img_container_hint") as Laya.GWidget);
        }
        this.bagScroller.direction=Laya.ScrollDirection.Vertical;
        this.bagScroller.barDisplay=Laya.ScrollBarDisplay.Hidden;
        this.bagScroller.touchEffect=Laya.ScrollTouchEffect.Off;
        this.bagScroller.bouncebackEffect=Laya.ScrollBounceBackEffect.Off;
        const bag=this.nodes.bagItemsArea as Laya.GPanel;
        bag.scroller=this.bagScroller;bag.layout.foldInvisibles=true;
        this.bagScrollBar=this.nodes.box_bag_scrollbar as Laya.GScrollBar;
        this.bagScrollBar.setOwner(this.bagScroller,true);
        for(const name of ["btn_close","btn_sell","btn_sort","btn_repair_all","btn_safe_left","btn_safe_right","btn_take_all","btn_store_all"]){
            const node=this.nodes[name];
            this.bindControlSkin(node,node.getChildAt(0) as Laya.GImage,
                name==="btn_take_all"||name==="btn_store_all"||name.startsWith("btn_safe_")?"square":"button");
        }
        this.bindControlSkin(this.bagScrollBar._gripButton,this.bagScrollBar._gripButton as Laya.GImage,"scroll");
        this.bagScroller.step=56;
        bag.on(Laya.UIEvent.Scroll,this,this.onBagScroll);
        this.root.on(Laya.Event.RESIZE,this,this.onResize);
        view.view.on(Laya.Event.RESIZE,this,this.onResize);
        this.config=InventoryConfigUtils.read(ConfigUtil.Tables);
    }
    getNode(name: string): Laya.GWidget { return this.nodes[name]; }
    openHubScreen(): void {
        this.notice="";
        const runId=this.inventorySession.inventory?.runId || "";
        if(runId!==this.presentedRunId){
            this.presentedRunId=runId;this.inventoryPage=0;this.selected="";this.safeIndex=0;
            for(const ctrl of this.itemCtrls.values())ctrl.rootNode.destroy();
            this.itemCtrls.clear();
        }
        this.opened=true;this.refresh();Laya.timer.loop(50,this,this.tick);
    }
    resizeTo(_view: Laya.GWidget): void { this.onResize(); }
    suspend(): void {
        this.closeDetail();
        this.releaseControl();this.drag.cancel();this.opened=false;Laya.timer.clearAll(this);
        try { this.inventorySession.pauseSearch(); } catch { /* 写失败由现有存档入口继续提示。 */ }
    }
    private onResize(): void {
        this.drag.cancel();
        if(this.opened)Laya.timer.callLater(this,this.refresh);
    }
    private tick(): void {
        if(!this.opened||this.held)return;
        try {
            if(this.inventorySession.expire()){openSkillBattleScreen("settlement");return;}
            const revision=this.inventorySession.token.revision;
            if(this.inventorySession.searching)this.inventorySession.advanceSearch();
            if(revision!==this.inventorySession.token.revision||this.inventorySession.searching)this.refresh();
        } catch(e){this.notice=(e as Error).message;this.updateNotice();}
    }
    private label(name: string,value: string): void {
        const n=this.nodes[name] as Laya.GTextField;
        n.text=value;n.visible=true;
    }
    private caption(node: Laya.GWidget,value: string): void {
        const text=this.captions.get(node)!;
        text.text=value;text.visible=true;
    }
    private enabled(node: Laya.GWidget,value: boolean): void {
        node.mouseEnabled=value;node.alpha=value?1:0.35;
        this.refreshControlSkin(node);
    }
    private bindControlSkin(node: Laya.GWidget,image: Laya.GImage,family: string): void {
        this.controlSkins.set(node,{image,family});
        node.on(Laya.Event.MOUSE_DOWN,this,()=>{
            if(!node.mouseEnabled)return;
            this.releaseControl();this.pressedControl=node;this.refreshControlSkin(node);
            Laya.stage.once(Laya.Event.MOUSE_UP,this,this.releaseControl);
        });
    }
    private releaseControl(): void {
        const node=this.pressedControl;this.pressedControl=null;
        Laya.stage.off(Laya.Event.MOUSE_UP,this,this.releaseControl);
        if(node)this.refreshControlSkin(node);
    }
    private refreshControlSkin(node: Laya.GWidget): void {
        const control=this.controlSkins.get(node);
        if(!control)return;
        const state=control.family!=="scroll"&&!node.mouseEnabled?"disabled":
            this.pressedControl===node?"pressed":"normal";
        control.image.src=`ui/atlas/module/warehouse/graphite/${control.family}-${state}.png`;
    }
    private onClick(name: string): void {
        if(this.held||this.drag.suppressClick())return;
        this.notice="";
        try {
            const selected=this.selected;
            this.closeDetail();
            if(name==="btn_take_all"||name==="btn_store_all")this.transferAll(name==="btn_take_all");
            else if(name==="btn_sort")this.sortStorage();
            else if(name==="btn_safe_left"||name==="btn_safe_right"){
                this.safeIndex=Math.max(0,Math.min(this.safeSpecs.length-1,this.safeIndex+(name==="btn_safe_right"?1:-1)));
                this.selected="";
            }
            else if(name==="btn_sell"){
                if(!selected)throw new Error("请先选中仓库物品");
                const item=Rules.item(this.state!,selected);
                this.inventorySession.inventoryCommand({type:"sell",uid:item.uid,from:item.location},this.inventorySession.token);
            }
            else if(name==="btn_repair_all")this.inventorySession.inventoryCommand({type:"repairAll"},this.inventorySession.token);
            else if(name.startsWith("expLootPage")){
                const page=Number(name.slice(11))-1;
                if(page<0||page>=this.availablePages)return;
                this.inventoryPage=page;
            }
        } catch(e){this.notice=(e as Error).message;}
        this.refresh();
    }
    private sortStorage(): void {
        this.inventorySession.pauseSearch();
        const state=this.inventorySession.inventory;
        if(!state)return;
        const layout=Rules.sortedStorage(this.config,state,this.inventoryPage);
        const current=state.phase==="active"?Rules.sourcePlacements(this.config,state):Rules.warehousePlacements(this.config,state);
        if(Rules.same(layout,current)){this.notice="当前页已整理";return;}
        this.inventorySession.inventoryCommand({type:"sortStorage",page:this.inventoryPage},this.inventorySession.token);
        this.selected="";
    }
    private transferAll(intoBag: boolean): void {
        this.inventorySession.pauseSearch();
        const snapshot=this.inventorySession.inventory;
        if(!snapshot)return;
        const plan=InventoryTransferUtils.plan(this.config,snapshot,intoBag,this.inventoryPage);
        if(plan.command){
            this.inventorySession.inventoryCommand(plan.command,this.inventorySession.token);
            this.selected="";
        }
        const destination=intoBag?"背包":snapshot.phase==="active"?"来源仓库":"仓库";
        this.notice=plan.moved?`已移入${destination} ${plan.moved} 件`:"没有可转移的物品";
        if(plan.remaining)this.notice+=`，剩余 ${plan.remaining} 件（${plan.reason}）`;
    }
    private onClickGridCell(_index: number,_ctrl: InventoryGridItemCtrl): void {
        if(!this.held&&!this.drag.suppressClick()){this.closeDetail();this.refresh();}
    }
    private setupGrid(name: GridName,cols: number,count: number): void {
        const list=this.lists[name],node=list.rootNode;
        node.layout.type=Laya.LayoutType.FlowX;node.layout.columns=cols;
        node.layout.columnGap=2;node.layout.rowGap=2;
        node.size(cols*56-2,Math.max(0,Math.ceil(count/cols)*56-2));
        const prefix=name==="source"?"invSourceCell":`invCell_${name}_`;
        for(const key of Object.keys(this.nodes))if(key.startsWith(prefix))delete this.nodes[key];
        const changed=list.arrayLen!==count;
        if(changed)list.array=Array.from({length:count},(_,i)=>({
            name:prefix+i,skin:"ui/atlas/module/warehouse/graphite/cell.png",
        }));
        node.layout.refresh(true);
        for(let i=0;i<node.numChildren;i++){
            const cell=node.getChildAt(i) as Laya.GWidget;
            if(!cell.name.startsWith(prefix))continue;
            this.nodes[cell.name]=cell;
        }
    }
    refresh(): void {
        const save=this.inventorySession.archive;
        this.state=save?.state||null;this.config=save?.config||this.config;
        const projection=this.state&&Rules.bagProjection(this.config,this.state);
        this.displayState=projection?.state||null;this.overflow=projection?.overflow||[];
        const safeSpec=this.safeSpecs[this.safeIndex],capacity=this.state?Rules.bagCapacity(this.config,this.state):0;
        this.setupGrid("safe",safeSpec.cols,safeSpec.cols*safeSpec.rows);
        this.setupGrid("battle",5,5);this.setupGrid("bag",7,capacity);this.setupGrid("source",8,56);
        const safe=this.nodes.box_safe_content,safeList=this.lists.safe.rootNode;
        safeList.pos((safe.width-safeList.width)/2,(safe.height-safeList.height)/2);
        safeList.alpha=this.safeIndex===0?1:0.4;
        const safeLock=this.nodes.img_safe_lock;
        safeLock.visible=this.safeIndex!==0;
        safeLock.pos((safe.width-safeLock.width)/2,(safe.height-safeLock.height)/2);
        this.label("invSafeTitle",safeSpec.name);
        this.enabled(this.nodes.btn_safe_left,this.safeIndex>0&&!this.held);
        this.enabled(this.nodes.btn_safe_right,this.safeIndex<this.safeSpecs.length-1&&!this.held);
        const battle=this.nodes.box_battle_content,battleList=this.lists.battle.rootNode;
        battleList.pos((battle.width-battleList.width)/2,(battle.height-battleList.height)/2);
        this.label("invBattleTitle","斗法匣");
        const weight=this.state?Rules.weight(this.config,this.state):null;
        this.label("txt_bagWeightLimit",weight?`负重：${weight.current}/${weight.limit}`:"负重：0/0");
        this.nodes.img_bag_empty.visible=capacity===0;
        this.nodes.bagItemsArea.visible=capacity>0;
        this.label("invSourceTitle",this.state?.phase==="active"?"来源仓库":"仓库");
        for(const key of Object.keys(this.nodes))if(/^inv(?:Item|List)\d+$/.test(key)){
            delete this.nodes[key];delete this.buttons[key];
        }
        for(const ctrl of this.itemCtrls.values())ctrl.rootNode.visible=false;
        this.itemRotations.clear();
        this.renderEquipment();
        this.renderCarried();
        this.renderSource();
        this.updateNotice();
        (this.nodes.bagItemsArea as Laya.GPanel).layout.refresh(true);
        this.refreshScroll();
        if(this.held)this.renderHeld();
    }
    private renderEquipment(): void {
        for(const [space,name] of [["weapon","invWeapon"],["armor","invArmor"],["accessory","invAccessory"],["container","invContainer"]] as const){
            const item=this.state?.items.find(i=>i.location.space===space),ctrl=this.equipment.get(name)!;
            this.equipmentHints.get(name)!.visible=!item;
            if(!item){ctrl.clear();continue;}
            const t=Rules.template(this.config,item);
            ctrl.update({template:t,width:110,height:space==="weapon"||space==="armor"?166:110,rotated:false,selected:this.selected===item.uid},0);
            this.itemRotations.set(item.uid,false);
        }
    }
    private createItem(): InventoryItemCtrl {
        const prefab=Laya.loader.getRes("ui/prefab/common/inventory/InventoryItem.lh") as Laya.Prefab;
        const ctrl=new InventoryItemCtrl();ctrl.setComponents(prefab.create() as Laya.GWidget,0);
        return ctrl;
    }
    private renderItem(item: InventoryItem,name: string,parent: Laya.GWidget,x: number,y: number,rotated: boolean): void {
        let ctrl=this.itemCtrls.get(item.uid);
        if(!ctrl){ctrl=this.createItem();this.itemCtrls.set(item.uid,ctrl);this.bindItem(ctrl.rootNode);}
        const node=ctrl.rootNode;
        node.name=name;this.nodes[name]=node;this.buttons[name]=node;
        if(node.parent!==parent)parent.addChild(node);
        const t=Rules.template(this.config,item),[w,h]=Rules.dimensions(t,{space:"bag",rotated});
        ctrl.update({template:t,width:w*56-2,height:h*56-2,rotated,selected:this.selected===item.uid},0);
        node.pos(x,y);this.itemRotations.set(item.uid,rotated);
    }
    private renderCarried(): void {
        const state=this.displayState;
        this.gridItems=state?.items.filter(i=>["battle","safe","bag"].includes(i.location.space)&&
            (i.location.space!=="safe"||this.safeIndex===0))||[];
        for(const [i,item] of this.gridItems.entries()){
            const space=item.location.space as "safe"|"battle"|"bag",grid=this.lists[space].rootNode;
            const parent=space==="bag"?this.nodes.bagItemsArea:space==="safe"?this.nodes.box_safe_content:this.nodes.box_battle_content;
            this.renderItem(item,"invItem"+i,parent,grid.x+item.location.x!*56,grid.y+item.location.y!*56,!!item.location.rotated);
        }
    }
    private renderSource(): void {
        const state=this.state,active=state?.phase==="active",space=active?"source":"warehouse";
        const items=state?.items.filter(i=>i.location.space===space&&(!active||i.location.node===state.node))||[];
        const slots=state?(active?Rules.sourcePlacements(this.config,state):Rules.warehousePlacements(this.config,state)):[];
        const pages=active?this.config.weight.sourcePages:Math.max(1,...slots.map(s=>s.page+1));
        this.availablePages=pages;
        this.inventoryPage=Math.min(this.inventoryPage,pages-1);
        const byUid=new Map(items.map(i=>[i.uid,i]));
        const visible=slots.filter(s=>s.page===this.inventoryPage&&byUid.has(s.uid)&&(!active||state.interactionSource===state.node));
        this.visibleItems=visible.map(s=>byUid.get(s.uid)!);
        visible.forEach((slot,index)=>this.renderItem(byUid.get(slot.uid)!,"invList"+index,this.nodes.sourceItemsArea,
            slot.x*56,slot.y*56,slot.rotated));
        for(let i=1;i<=7;i++){
            const button=this.nodes["expLootPage"+i],locked=i>pages;button.visible=true;
            this.caption(button,String(i));
            const caption=this.captions.get(button)!;
            caption.visible=!locked;caption.bold=i===this.inventoryPage+1;
            caption.color=i===this.inventoryPage+1?"#dfc58d":"#b3bbb6";
            const lock=this.pageLocks.get(button)!;
            lock.visible=locked;lock.alpha=0.55;
            button.mouseEnabled=!locked&&!this.held;button.alpha=this.held?0.6:1;
            const skin=this.skins.get(button)!;
            skin.alpha=1;
            skin.src=`ui/atlas/module/warehouse/graphite/page-${locked?"locked":i===this.inventoryPage+1?"selected":"normal"}.png`;
            skin.color="#ffffff";
        }
    }
    private closeDetail(): void {
        this.detailView?.close();
        this.detailView=null;
        this.selected="";
    }
    private updateNotice(): void {
        this.label("txt_inventory_feedback",this.inventorySession.error||this.notice||
            (this.overflow.length?`${this.overflow.length} 件物品需要先取出，再完成七列整理`:`愿力 ${this.state?.wish??0}`));
        const button=this.nodes.btn_repair_all,price=this.state?Rules.repairCost(this.state):0;
        (this.nodes.txt_repair_all as Laya.GTextField).text=`修理 · ${price} 愿力`;
        const state=this.state,forge=(state as InventoryState & {map?:{nodes:Array<{id:number;icon?:string}>}})?.map?.nodes.some(n=>n.id===state.node&&n.icon==="forge");
        this.enabled(button,!!state&&state.flow?.phase!=="battle"&&(state.phase==="preparation"||!!forge)&&price>0&&!this.held);
    }
    private refreshScroll(): void {
        const content=this.bagScroller.contentHeight,view=this.bagScroller.viewHeight;
        const overflow=content>view+1;
        this.bagScrollBar.setDisplayPerc(content>0?Math.min(1,view/content):1);
        this.bagScrollBar.setScrollPerc(overflow?this.bagScroller.posY/(content-view):0);
        this.bagScrollBar.visible=this.nodes.bagItemsArea.visible;
        this.bagScrollBar.mouseEnabled=overflow&&!this.held;
        this.bagScrollBar.alpha=overflow?1:0.3;
        const editable=!this.held&&this.state?.phase!=="ended"&&this.state?.flow?.phase!=="battle";
        this.enabled(this.nodes.btn_take_all,!!editable&&this.visibleItems.length>0&&
            !!this.state&&Rules.bagCapacity(this.config,this.state)>0);
        this.enabled(this.nodes.btn_store_all,!!editable&&!!this.state?.items.some(i=>i.location.space==="bag"));
        this.enabled(this.nodes.btn_sort,!!editable&&this.visibleItems.length>0);
    }
    private onBagScroll(): void {
        this.closeDetail();
        this.refreshScroll();
    }
    private bindItem(node: Laya.GWidget): void {
        node.on(Laya.Event.MOUSE_DOWN,this,(event:Laya.Event)=>this.drag.arm(node.name,event));
        node.on(Laya.Event.CLICK,this,()=>{
            if(this.held||this.drag.suppressClick())return;
            const item=this.itemForNode(node.name);
            if(item){
                this.closeDetail();this.selected=item.uid;this.notice="";this.refresh();
                this.detailView=UIManager.ins().openForm(ItemDetailView,{
                    template:Rules.template(this.config,item),durability:item.durability,
                    equipment:item.equipment,
                    rotated:!!this.itemRotations.get(item.uid),anchor:node,
                    action:this.itemAction(item),
                    perform:()=>this.performItemAction(item),
                    closed:()=>{this.detailView=null;if(this.opened)this.refresh();},
                });
            }
        });
    }
    private itemForNode(name: string): InventoryItem | undefined {
        const space={invWeapon:"weapon",invArmor:"armor",invAccessory:"accessory",invContainer:"container"}[name];
        if(space)return this.state?.items.find(i=>i.location.space===space);
        return /^invList\d+$/.test(name)?this.visibleItems[Number(name.slice(7))]:
            /^invItem\d+$/.test(name)?this.gridItems[Number(name.slice(7))]:undefined;
    }
    private itemAction(item:InventoryItem):string {
        if(!this.state||this.state.phase==="ended"||this.state.flow?.phase==="battle")return "";
        const kind=Rules.template(this.config,item).kind;
        if(Rules.isEquipment(kind)&&!Rules.isEquipment(item.location.space))return "装备";
        if(kind==="container"&&item.location.space!=="container")return "装备";
        if(["hp","mp","mixed","stamina"].includes(kind)&&this.state.phase==="active"&&["battle","bag","safe"].includes(item.location.space))return "使用";
        return "";
    }
    private performItemAction(item:InventoryItem):void {
        try{
            const t=Rules.template(this.config,item);
            const action:InventoryAction=Rules.isEquipment(t.kind)?Rules.equipmentPlan(this.config,this.workingState(),item.uid):
                t.kind==="container"?Rules.containerPlan(this.config,this.workingState(),item.uid):{type:"use",uid:item.uid,from:item.location};
            const touchesBag=action.type==="equipContainer"||action.type==="equipEquipment"&&
                (action.from?.space==="bag"||action.oldTo?.space==="bag");
            this.inventorySession.inventoryCommand(!this.state.bagColumns&&!this.overflow.length&&touchesBag?
                {type:"reflowBag",action}:action,this.inventorySession.token);
            this.notice="";
        }catch(e){this.notice=(e as Error).message;}
        this.refresh();
    }
    private workingState(): InventoryState { return this.overflow.length?this.state!:this.displayState!; }
    private beginDrag(key: string,point: Laya.Point): boolean {
        try { this.inventorySession.pauseSearch(); }
        catch(e){this.notice=(e as Error).message;this.updateNotice();return false;}
        if(!this.state||this.state.phase==="ended"||this.state.flow?.phase==="battle")return false;
        const item=this.itemForNode(key),node=this.nodes[key];if(!item)return false;
        const origin=this.position(node);
        this.closeDetail();
        this.held={uid:item.uid,node,point,grabX:(point.x-origin.x)/node.width,grabY:(point.y-origin.y)/node.height,
            rotated:!!this.itemRotations.get(item.uid),previous:this.selected,token:this.inventorySession.token,
            target:null,command:null,valid:false,error:""};
        this.selected=item.uid;
        if(!this.floating){this.floating=this.createItem();this.nodes.box_drag_feedback.addChild(this.floating.rootNode);}
        return true;
    }
    position(node: Laya.GWidget): Laya.Point { return this.root.globalToLocal(node.localToGlobal(new Laya.Point())); }
    gridGeometry(space: InventorySpace) {
        const name=space==="warehouse"||space==="source"?"source":space as GridName;
        const grid=this.lists[name].rootNode;
        const [cols,rows]=name==="source"?[8,7]:name==="bag"?[7,Math.ceil(Rules.bagCapacity(this.config,this.displayState!)/7)]:
            name==="safe"?[this.safeSpecs[this.safeIndex].cols,this.safeSpecs[this.safeIndex].rows]:[5,1];
        return {...this.position(grid),cols,rows,size:56};
    }
    hitDrag(point: Laya.Point,h: Pick<HeldItem,"uid"|"rotated"|"grabX"|"grabY">=this.held!): DropTarget | null {
        const item=Rules.item(this.state!,h.uid),t=Rules.template(this.config,item);
        const [w,height]=Rules.dimensions(t,{space:"bag",rotated:h.rotated});
        for(const space of ["safe","battle","bag","source"] as const){
            if(space==="safe"&&this.safeIndex!==0)continue;
            if(space==="bag"){
                const p=this.position(this.nodes.bagItemsArea),v=this.nodes.bagItemsArea;
                if(point.x<p.x||point.x>=p.x+v.width||point.y<p.y||point.y>=p.y+v.height)continue;
            }
            const g=this.gridGeometry(space);
            if(point.x<g.x||point.x>=g.x+g.cols*56||point.y<g.y||point.y>=g.y+g.rows*56)continue;
            return {space:space==="source"?(this.state!.phase==="active"?"source":"warehouse"):space,
                ...(space==="source"?{page:this.inventoryPage,...(this.state!.phase==="active"?{node:this.state!.node}:{})}:{}),
                x:Math.round((point.x-g.x-h.grabX*w*56)/56),
                y:Math.round((point.y-g.y-h.grabY*height*56)/56),rotated:h.rotated};
        }
        for(const [space,name] of [["weapon","invWeapon"],["armor","invArmor"],["accessory","invAccessory"],["container","invContainer"]] as const){
            const node=this.nodes[name],p=this.position(node);
            if(point.x>=p.x&&point.x<p.x+node.width&&point.y>=p.y&&point.y<p.y+node.height)return {space};
        }
        return null;
    }
    private commandFor(h: HeldItem,to: DropTarget): InventoryCommand | null {
        const state=this.workingState(),item=Rules.item(state,h.uid),t=Rules.template(this.config,item);
        const {space,x,y,rotated,page,node}=to;
        let action: InventoryAction;
        if(Rules.isEquipment(space)){
            if(t.kind==="repair"){
                const target=state.items.find(i=>i.location.space===space);
                if(!target)throw new Error("该部位没有可修理装备");
                action={type:"repair",uid:item.uid,from:item.location,targetUid:target.uid};
            }else{
                if(t.kind!==space)throw new Error("装备部位不匹配");
                if(item.location.space===space)return null;
                action=Rules.equipmentPlan(this.config,state,item.uid);
            }
        } else if(space==="container"){
            if(t.kind!=="container")throw new Error("背包位只能放纳虚器");
            if(item.location.space==="container")return null;
            action=Rules.containerPlan(this.config,state,item.uid);
        } else {
            if(this.overflow.length&&space==="bag")throw new Error("请先取出待整理物品");
            const to:InventoryLocation=space==="warehouse"?{space}:space==="source"?
                {space,node,x,y:y!+page!*7,rotated}:{space,x,y,rotated};
            const warehouseTo=space==="warehouse"?{page:page!,x:x!,y:y!,rotated:!!rotated}:undefined;
            if(item.location.space==="warehouse"&&space==="warehouse")
                action={type:"arrangeWarehouse",uid:item.uid,from:item.location,to:warehouseTo!};
            else if(Rules.isEquipment(item.location.space))action={type:"equipEquipment",slot:item.location.space,uid:null,oldTo:to,...(warehouseTo?{warehouseTo}:{})};
            else if(item.location.space==="container"){
                if(space!==(state.phase==="active"?"source":"warehouse"))throw new Error("背包本体只能卸回当前交互仓库");
                action={...Rules.containerPlan(this.config,state,null),...(warehouseTo?{warehouseTo}:{})};
            } else action={type:"move",move:{uid:item.uid,from:item.location,to},...(warehouseTo?{warehouseTo}:{})};
        }
        const touchesBag=action.type==="equipContainer"||action.type==="move"&&
            (action.move.from.space==="bag"||action.move.to.space==="bag")||action.type==="equipEquipment"&&
            (action.from?.space==="bag"||action.oldTo?.space==="bag");
        return !this.state!.bagColumns&&!this.overflow.length&&touchesBag?{type:"reflowBag",action}:action;
    }
    private moveDrag(point: Laya.Point): void {
        const h=this.held;if(!h)return;
        h.point=point;h.valid=false;h.command=null;h.error="";
        try {
            if(this.inventorySession.expire()){this.drag.cancel();openSkillBattleScreen("settlement");return;}
            h.target=this.hitDrag(point);
            if(!h.target)throw new Error("落点不在储物区域");
            h.command=this.commandFor(h,h.target);
            if(h.command)this.inventorySession.previewMove(h.command,h.token);
            h.valid=true;
        } catch(e){h.error=(e as Error).message;}
        this.renderHeld();
        const key=h.target?`${h.target.space}:${h.target.x}:${h.target.y}`:"";
        if(key!==this.autoRotateKey){
            Laya.timer.clear(this,this.autoRotate);this.autoRotateKey=key;
            if(!h.valid&&Rules.template(this.config,Rules.item(this.state!,h.uid)).rotate)
                Laya.timer.once(400,this,this.autoRotate);
        }
    }
    private autoRotate(): void {
        const h=this.held;if(!h||h.valid)return;
        const next={...h,rotated:!h.rotated,grabX:h.rotated?h.grabY:1-h.grabY,grabY:h.rotated?1-h.grabX:h.grabX};
        try {
            const target=this.hitDrag(h.point,next);if(!target||target.space!==h.target?.space)return;
            const command=this.commandFor(next,target);
            if(command)this.inventorySession.previewMove(command,h.token);
            this.rotateDrag();
        } catch { /* 悬停旋转只在另一方向可放时触发。 */ }
    }
    private rotateDrag(): void {
        const h=this.held;if(!h||!Rules.template(this.config,Rules.item(this.state!,h.uid)).rotate)return;
        const oldX=h.grabX;h.grabX=h.rotated?h.grabY:1-h.grabY;h.grabY=h.rotated?1-oldX:oldX;
        h.rotated=!h.rotated;Laya.timer.clear(this,this.autoRotate);this.moveDrag(h.point);
    }
    private renderHeld(): void {
        const h=this.held;if(!h)return;
        h.node.alpha=0.16;
        const t=Rules.template(this.config,Rules.item(this.state!,h.uid)),[w,height]=Rules.dimensions(t,{space:"bag",rotated:h.rotated});
        this.floating.update({template:t,width:w*56-2,height:height*56-2,rotated:h.rotated,
            selected:true,outline:h.valid?"#76ffad":"#ff6262"},0);
        this.floating.rootNode.pos(h.point.x-h.grabX*w*56,h.point.y-h.grabY*height*56);
        this.notice=h.error;this.updateNotice();this.refreshScroll();
    }
    private releaseDrag(): void {
        const h=this.held;if(!h)return;
        this.held=null;Laya.timer.clear(this,this.autoRotate);this.autoRotateKey="";
        this.floating.rootNode.visible=false;this.selected=h.previous;
        try {
            if(!h.valid)throw new Error(h.error);
            if(h.command){this.inventorySession.inventoryCommand(h.command,h.token);this.selected="";}
            this.notice="";
        } catch(e){this.notice=(e as Error).message;}
        this.refresh();
    }
    private cancelDrag(): void {
        if(!this.held)return;
        this.selected=this.held.previous;this.held=null;this.autoRotateKey="";
        Laya.timer.clear(this,this.autoRotate);if(this.floating)this.floating.rootNode.visible=false;
        if(this.opened)this.refresh();
    }
}
