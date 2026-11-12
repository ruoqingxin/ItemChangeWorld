import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { BuildConfigUtils } from "../../build/utils/BuildConfigUtils";
import { ExpeditionRunConfigUtils } from "../utils/ExpeditionRunConfigUtils";
import { ExpeditionRules as Rules } from "../utils/ExpeditionRules";
import { ExpeditionRunManager } from "../manager/ExpeditionRunManager";
import type { ExpeditionState } from "../types/ExpeditionRunTypes";
import { InventoryPanel } from "../../inventory/view/InventoryPanel";
import { InventoryRules as Inventory } from "../../inventory/utils/InventoryRules";
import { placeInDesign, visitRegion } from "../../gameplay/utils/GameplayLayout";
import type { SkillBattlePage } from "../../gameplay/utils/GameplayLayout";

type MapPoint = { x: number; y: number };
const MARKER_HALF = 58;
const ENEMY_ICON_SIZES = { normal: 104, elite: 144, boss: 192 };
const MAP_ART = "ui/atlas/module/expedition/handpainted/";

export class ExpeditionPanel extends InventoryPanel {
    private mapOpen = true;
    private selectedNode: number | null = null;
    private centerMap = true;
    private scroller: Laya.Scroller;
    private expeditionNodes: { [key: string]: Laya.GWidget } = {};
    private readonly mapAreas: { [key:string]: Laya.GWidget } = {};
    private presentedMapRunId = "";
    private renderedRevision = -1;
    private openingGround = false;
    private pendingPath: number[] | null = null;
    private mapRoutes = new Map<string,MapPoint[]>();
    private movement: { points: MapPoint[]; lengths: number[]; total: number; startedAt: number;
        duration: number; cameraFrom: number; cameraTo: number } | null = null;
    constructor(view: UIBaseView, readonly expedition: ExpeditionRunManager,
        navigate: (s: SkillBattlePage) => void, screen: "start"|"battle"|"settlement",
        page: SkillBattlePage = screen) {
        super(view,expedition,s => navigate(s==="settlement" && expedition.inventory?.phase==="active" ? "start" : s),screen,page);
        for(let i=1;i<=7;i++) {
            const n=this.nodes[`expLootPage${i}`];
            if (!n) continue;
            this.buttons[n.name]=n;
            n.on(Laya.Event.CLICK,this,()=>this.command(n.name));
        }
        const root = view.getElement<Laya.GWidget>("expeditionRoot",false);
        if (!root) return;
        this.expeditionNodes.expeditionRoot = root;
        for(const name of ["mapHeaderArea","mapClockArea","mapKillsArea","mapStaminaArea","mapWeightArea",
            "mapPlayerArea","mapActionsArea","mapExitArea","nodeActionArea"])
            this.mapAreas[name]=view.getElement<Laya.GWidget>(name);
        visitRegion(view,root,n => {
            this.expeditionNodes[n.name]=n;
            if (n instanceof Laya.GTextField) { this.labels[n.name]=n;return false; }
            else if (/^exp(?:Node\d+|Storage|Build|Use|Abandon)$/.test(n.name)) {
                this.buttons[n.name]=n;
                n.on(Laya.Event.CLICK,this,() => this.command(n.name));
                if (!/^expNode/.test(n.name)) {
                    this.prepareMapImage(n.getChildAt(0) as Laya.GImage);
                    n.on(Laya.Event.MOUSE_OVER,this,()=>this.mapButtonState(n,"hover"));
                    n.on(Laya.Event.MOUSE_DOWN,this,()=>this.mapButtonState(n,"pressed"));
                    n.on(Laya.Event.MOUSE_UP,this,()=>this.mapButtonState(n,
                        !Laya.Browser.onMobile && n.mouseX>=0 && n.mouseX<n.width &&
                        n.mouseY>=0 && n.mouseY<n.height ? "hover" : "normal"));
                    n.on(Laya.Event.MOUSE_OUT,this,()=>this.mapButtonState(n,"normal"));
                }
                return false;
            }
            if (n instanceof Laya.GImage && n.src?.startsWith(MAP_ART))
                this.prepareMapImage(n);
        });
        const viewport=this.expeditionNodes.expViewport as Laya.GPanel;
        this.scroller=new Laya.Scroller();
        this.scroller.direction=Laya.ScrollDirection.Horizontal;
        this.scroller.barDisplay=Laya.ScrollBarDisplay.Hidden;
        this.scroller.touchEffect=Laya.ScrollTouchEffect.On;
        this.scroller.bouncebackEffect=Laya.ScrollBounceBackEffect.Off;
        viewport.scroller=this.scroller;
        viewport.on(Laya.UIEvent.Scroll,this,this.updateMapBackground);
        this.elements.mapGroundTexture.on(Laya.Event.LOADED,this,this.updateMapBackground);
        this.expeditionNodes.mapRouteTexture.on(Laya.Event.LOADED,this,this.mapArtLoaded);
        this.elements.screenBackground.filters=[new Laya.ColorFilter([
            0.62,0,0,0,45,0,0.62,0,0,46,0,0,0.62,0,43,0,0,0,1,0,
        ])];
        const content=this.expeditionNodes.expMapContent;
        for(let id=33;id<=44;id++) {
            const node=new Laya.GWidget();node.name=`expNode${id}`;node.mouseEnabled=true;
            node.addChild(new Laya.GImage());node.addChild(new Laya.GTextField());node.addChild(new Laya.GImage());
            content.addChild(node);this.expeditionNodes[node.name]=node;this.buttons[node.name]=node;
            node.on(Laya.Event.CLICK,this,()=>this.command(node.name));
        }
        const reachTint=new Laya.ColorFilter([
            0,0,0,0,152,0,0,0,0,229,0,0,0,0,215,0,0,0,1,0,
        ]);
        for(let id=1;id<=44;id++) {
            const node=this.buttons[`expNode${id}`];
            if(!node)continue;
            const hint=new Laya.GImage();hint.name="expReachHint";hint.mouseEnabled=false;
            hint.autoSize=false;hint.src="ui/atlas/module/expedition/map-ui-current-ring.png";
            hint.pos(18,92);hint.size(80,14);hint.filters=[reachTint];
            hint.alpha=0.82;hint.visible=false;node.addChild(hint);
            const done=new Laya.GWidget();done.name="expDone";done.mouseEnabled=false;
            done.size(30,30);done.visible=false;
            done.graphics.drawCircle(15,15,13,"#29443a","#a9c4b5",1.5);
            const check=new Laya.GTextField();check.mouseEnabled=false;check.size(30,30);
            check.text="\u2713";check.fontSize=24;check.color="#e0f1e5";check.align="center";check.valign="middle";
            done.addChild(check);node.addChild(done);
            const feedback=(alpha:number) => {
                if(node.visible&&node.mouseEnabled&&hint.visible)hint.alpha=alpha;
            };
            node.on(Laya.Event.MOUSE_OVER,this,()=>feedback(1));
            node.on(Laya.Event.MOUSE_DOWN,this,()=>feedback(0.6));
            node.on(Laya.Event.MOUSE_UP,this,()=>feedback(!Laya.Browser.onMobile&&
                node.mouseX>=0&&node.mouseX<node.width&&node.mouseY>=0&&node.mouseY<node.height?1:0.82));
            node.on(Laya.Event.MOUSE_OUT,this,()=>feedback(0.82));
        }
    }
    openHubScreen(): void {
        super.openHubScreen(); Laya.timer.loop(50,this,this.searchTick);
        Laya.stage.off(Laya.Event.CLICK,this,this.dismissContext);
        Laya.stage.on(Laya.Event.CLICK,this,this.dismissContext);
    }
    openSettlementScreen(): void { super.openSettlementScreen(); Laya.timer.loop(50,this,this.searchTick); }
    openEncounter(): void { super.openEncounter(); Laya.timer.loop(50,this,this.searchTick); }
    suspend(): void {
        Laya.stage.off(Laya.Event.CLICK,this,this.dismissContext);
        if (!this.openingGround) this.run(() => this.expedition.pauseSearch(),false);
        this.openingGround=false;
        if(this.movement)this.scroller.posX=this.movement.cameraTo;
        this.movement=null;this.pendingPath=null;
        super.suspend();
    }
    private dismissContext(event: Laya.Event): void {
        if(!this.opened || this.pageRole!=="map" || this.selectedNode===null || this.modalOpen || this.movement)return;
        let target=event.target as Laya.Node;
        while(target) {
            if(/^expNode\d+$/.test(target.name) || ["expUse","expContextBackground","expContextTitle","expContextIcon"].includes(target.name))return;
            target=target.parent;
        }
        const panel=this.expeditionNodes.expContextBackground;
        const p=panel.globalToLocal(new Laya.Point(Laya.stage.mouseX,Laya.stage.mouseY),true);
        if(panel.visible && p.x>=0&&p.y>=0&&p.x<=panel.width&&p.y<=panel.height)return;
        this.selectedNode=null;this.refresh();
    }
    private searchTick(): void {
        this.run(() => {
            this.expedition.advanceSearch(!document.hidden && document.hasFocus());
            if (this.renderedRevision!==this.expedition.token.revision && !this.busy) {
                this.renderedRevision=this.expedition.token.revision;this.refresh();
            }
            if (this.mapOpen && this.labels.expClock?.visible) {
                this.labels.expClock.text=this.timeText();
                this.labels.expClock.color=this.expedition.inventory?.map.warning?"#f1b586":"#f5f2e7";
            }
            this.renderSearchSpinner();
            this.renderMapFeedback();
        },false);
    }
    refresh(): void {
        if (this.modalOpen || this.resetConfirm || this.overlay) { super.refresh(); return; }
        for (const n of Object.values(this.expeditionNodes || {})) n.visible=false;
        super.refresh();
        const s=this.expedition.inventory,warning=s?.phase==="active" ?
            s.map.warning===300000?"剩余时间不足五分钟":s.map.warning===600000?"剩余时间不足十分钟":"" : "";
        if (warning && !this.notice && !this.resetConfirm && !this.overlay) {
            if (this.nodes?.invNotice?.visible && !(this.nodes.invNotice as Laya.GTextField).text)
                this.label("invNotice",warning,18,"#efa797");
            else if (this.labels.overlayMessage?.visible && !this.labels.overlayMessage.text)
                this.labels.overlayMessage.text=warning;
            else if (this.screen==="battle" && this.labels.event?.visible && !this.busy)
                this.labels.event.text=warning;
        }
    }
    startRun(): void {
        this.run(() => {
            const s=this.expedition.inventory;
            if (!s || s.phase==="ended") {
                const c=ExpeditionRunConfigUtils.read(ConfigUtil.Tables), seed=new Uint32Array(1);
                crypto.getRandomValues(seed);
                this.expedition.prepare(c,BuildConfigUtils.profile(c.build),seed[0]||1);
                this.mapOpen=false; this.centerMap=true;this.inventoryPage=0;
                this.selectedNode=null;
                if (this.screen==="settlement") this.navigate("start");
            } else if (s.phase==="preparation") {
                this.expedition.inventoryCommand({type:"enter"}); this.mapOpen=false;
                this.navigate("build");
            } else if (s.flow?.phase==="battle") this.navigate("battle");
            else this.navigate(s.flow?.pending ? "build" : "map");
        });
    }
    protected command(key: string): void {
        if (this.modalOpen) return;
        if(this.movement && /^(?:exp(?:Node|Use|Storage|Build)|invToggle|invPrimary)/.test(key))return;
        if (this.held && /^expLootPage/.test(key)) return;
        if (/^inv(?:List\d+|Item\d+|Use|Drop|Extract|Abandon)$/.test(key))
            this.run(() => this.expedition.pauseSearch(),false);
        if (this.screen==="battle" && ["loot","hub","extract","continue"].includes(key)) return;
        if (key==="actions" && this.expedition.inventory?.phase==="active") return;
        if (key==="invReveal") {
            this.run(() => {
                if (this.expedition.searching) this.expedition.pauseSearch(); else this.expedition.startSearch();
            }); return;
        }
        if (["invNodePrev","invNodeNext"].includes(key)) return;
        if (key==="invToggle") {
            this.run(() => { this.expedition.pauseSearch(); this.navigate("map"); }); return;
        }
        if (key==="invPrimary" && this.expedition.inventory?.phase==="active" && !this.expedition.flow?.pending) {
            this.run(() => { this.expedition.pauseSearch(); this.navigate("map"); }); return;
        }
        if (key.startsWith("exp")) {
            this.run(() => {
                const s=this.expedition.inventory;
                if (!s) return;
                const page=/^expLootPage([1-7])$/.exec(key);
                if (page) {
                    this.expedition.pauseSearch();this.inventoryPage=+page[1]-1;return;
                }
                if (key==="expStorage") { this.openGround(); return; }
                if (key==="expBuild") { this.navigate("build"); return; }
                if (key==="expAbandon") {
                    this.requestConfirmation("放弃本局？","仅保留归真匣合规物品，装备及其他携带物损失。",
                        () => { this.expedition.mapCommand({type:"abandon"}); this.navigate("settlement"); });
                    return;
                }
                if (key==="expUse") {
                    const c=this.expedition.archive!.config, id=s.node,n=Rules.node(c,id,s);
                    if(n.enemy&&!s.map.cleared.includes(id)) {
                        this.expedition.mapCommand({type:"fight"});this.navigate("battle");return;
                    }
                    if(s.map.used.includes(id))return;
                    if (n.kind==="extract") {
                        this.requestConfirmation("确认安全撤离？","携带物带回，来源仓库内未携带物不带出，本局临时构筑结束。",
                            () => { this.expedition.mapCommand({type:"extract"}); this.navigate("settlement"); });
                        return;
                    }
                    if (n.kind==="borrow" || n.kind==="insight") {
                        this.expedition.mapCommand({type:n.kind}); this.mapOpen=false;
                        this.navigate("build");
                    } else if (n.kind==="recovery") {
                        this.expedition.mapCommand({type:"recover"});
                        const after=this.expedition.inventory!;
                        this.notice=`生命 +${Core.format(after.hp-s.hp)} · 灵力 +${Core.format(after.mp-s.mp)}`;
                    }
                    else if(Rules.source(this.expedition.inventory!))this.openGround(true);
                    return;
                }
                const target=/^expNode(\d+)$/.exec(key);
                if (target) {
                    if (this.scroller.isDragged) return;
                    const id=+target[1];
                    const path=Rules.travelPaths(this.expedition.archive!.config,s).get(id);
                    if(!path)return;
                    if(id!==s.node)this.expedition.mapCommand({type:"travel",node:id});
                    if(this.expedition.inventory!.phase==="ended") {this.navigate("settlement");return;}
                    this.notice="";
                    this.selectedNode=id;
                    this.pendingPath=path;this.centerMap=false;this.inventoryPage=0;
                }
            }); return;
        }
        const pending = this.expedition.flow?.pending;
        super.command(key);
        if (this.opened && pending && !this.expedition.flow?.pending) this.navigate("map");
    }
    private openGround(search=false): void {
        if(search)this.expedition.openSource();
        else if(Rules.source(this.expedition.inventory!)?.opened)this.expedition.mapCommand({type:"interactSource"});
        if(this.expedition.inventory!.phase==="ended") {this.navigate("settlement");return;}
        this.mapOpen=false;
        this.openingGround=true;
        this.navigate("inventory");
    }
    protected beginDrag(key: string, point: Laya.Point): boolean {
        try { this.expedition.pauseSearch(); }
        catch (error) { this.notice=(error as Error).message;return false; }
        return super.beginDrag(key,point);
    }
    protected renderStart(): void {
        const s=this.expedition.inventory;
        this.mapOpen = this.pageRole === "map";
        if (s?.phase==="active" && this.pageRole === "map") {
            this.renderMap(); return;
        }
        if (s?.phase==="active") this.filter="all";
        super.renderStart();
        if (s?.phase==="active" && this.labels.resultTitle?.text==="剑土双道试炼")
            this.labels.resultTitle.text="秘境构筑";
        if (s?.flow?.pending && this.buttons.invToggle) this.buttons.invToggle.visible=false;
        if (this.nodes?.inventoryRoot?.visible) {
            this.label("invTitle",this.pageRole==="start" ? "末法寻仙 · 行前整备" : "末法寻仙 · 秘境行囊",26,"#e3c98c");
            this.label("invSourceTitle",s?.phase==="active" ? "来源仓库" : "仓库",20,"#e3c98c");
            if (!s) this.label("invClock","行前整备",22);
            this.control("invPrimary",!s || s.phase==="ended" ? "开始整备" : s.phase==="preparation" ? "入境" :
                s.flow?.pending ? "领取借法" : "地图",!this.expedition.error);
            for (const key of ["invNodePrev","invNodeNext"]) this.nodes[key].visible=false;
            if (s?.phase==="active") {
                this.button("invToggle","地图",630,16,128,46);
                const c=this.expedition.archive!.config,n=Rules.node(c,s.node,s),box=Rules.source(s);
                this.label("invSourceTitle",n.name+(box && box.revealed<box.entries.length ?
                    ` · 搜索 ${Math.floor(box.progressMs/Rules.searchDuration(c,s)*100)}%` : " · 交互仓库"),20,"#e3c98c");
                this.nodes.invReveal.visible=false;
                if (box && box.revealed<box.entries.length)
                    this.control("invReveal",this.expedition.searching ? "暂停搜索" : box.opened ? "继续搜索" : "搜索",!s.flow?.pending&&!this.held);
                if (box && box.revealed<box.entries.length && this.inventoryPage===0) {
                    const items=Object.entries(this.buttons).filter(([key,n])=>/^invList\d+$/.test(key)&&n.visible).map(([,n])=>n);
                    const cell=Array.from({length:56},(_,i)=>this.nodes[`invSourceCell${i}`]).find(cell=> {
                        const a=this.position(cell);
                        return items.every(n=> {
                            const b=this.position(n);
                            return a.x>=b.x+n.width||a.x+cell.width<=b.x||a.y>=b.y+n.height||a.y+cell.height<=b.y;
                        });
                    });
                    if(cell) {
                        const point=this.position(cell);
                        this.nodes.expUnknown.visible=true;
                        this.place(this.nodes.expUnknown,point.x+(cell.width-28)/2,point.y+(cell.height-28)/2);
                        this.place(this.nodes.expSearchSpinner,point.x+(cell.width-44)/2,point.y+(cell.height-44)/2);
                    }
                    this.nodes.invSourceTitle.width=380;
                    this.renderSearchSpinner();
                }
                this.nodes.invExtract.visible=n.kind==="extract" && !s.flow?.pending;
                for(const key of ["invAll","invMedicine","invMaterials","invEquipment","invPrev","invNext","invPage"])
                    this.nodes[key].visible=false;
                placeInDesign(this.nodes.invReveal,this.root,804,112);this.nodes.invReveal.size(180,30);
                for(let i=1;i<=7;i++) this.button(`expLootPage${i}`,String(i),
                    800+(i-1)*64,550,58,38,!this.held,this.inventoryPage===i-1);
            }
        } else if (s?.phase==="active" && !s.flow?.pending) {
            this.buttons.actions.visible=false;
            const b=this.buttons.invToggle;
            if (b) { b.visible=true; }
            // Ready construction retains its existing upgrade confirmation.
            if (this.buttons.newRun?.visible) {
                const l=this.buttons.newRun.getChildAt(0) as Laya.GTextField;
                if (l.text==="进入下一战" || l.text==="结束演练") l.text="返回地图";
            }
        }
        if (this.pageRole==="build") {
            const reset=this.buttons.reset?.getChildAt(0) as Laya.GTextField;
            if(reset)reset.text="放弃本局";
        }
    }
    protected renderSettlement(): void {
        super.renderSettlement();
        if (this.expedition.inventory?.phase==="ended" && this.nodes.inventoryRoot?.visible) {
            this.label("invTitle","末法寻仙 · 本局结算",26,"#e3c98c");
            this.label("invClock","本局结束",22);
        }
    }
    protected sourcePageCount(count: number): number {
        return this.expedition.inventory?.phase==="active" ? Math.max(7,count) : count;
    }
    protected renderBattle(): void {
        super.renderBattle();
        this.buttons.loot.visible=false;
        this.labels.brand.text="末法寻仙 · 秘境斗法";
    }
    protected renderReset(): void {
        this.requestConfirmation("重建当前探索档？","仅重建阶段 4 当前档，不删除其他应用数据。",
            () => { this.expedition.resetConfirmed(); this.resetConfirm=false; this.navigate("start"); },
            "确认重建");
    }
    protected button(key: string, value: string, x: number, y: number, w: number, h=54, enabled=true, selected=false): void {
        if (!key.startsWith("exp")) { super.button(key,value,x,y,w,h,enabled,selected); return; }
        const n=this.buttons[key],label=n.getChildAt(1) as Laya.GTextField;
        const mapNode=/^expNode\d+$/.test(key);
        n.visible=true;
        if (mapNode) n.pos(x,y); else placeInDesign(n,this.root,x,y);
        n.size(w,h);n.mouseEnabled=enabled;n.alpha=this.pageRole==="map"||enabled||selected?1:0.55;
        const skin=n.getChildAt(0) as Laya.GImage;skin.size(w,h);
        label.text=value;label.pos(4,2);label.size(w-8,h-4);label.fontSize=18;
        label.color=selected?"#ffd879":"#e8edf0";label.textIns.color=label.color;
        label.align="center";label.valign="middle";label.textIns.wordWrap=true;
        if (this.pageRole==="map" && !mapNode) {
            this.mapButtonState(n,"normal");
            label.bold=true;label.color="#fbf7e9";label.textIns.color=label.color;
            if (key==="expUse") label.fontSize=this.compactMap?30:24;
            else {
                const exit=key==="expAbandon";
                label.pos(exit?40:6,exit?0:this.compactMap?70:62);
                label.size(exit?w-48:w-12,exit?h:this.compactMap?34:30);
                label.fontSize=exit?(this.compactMap?26:20):this.compactMap?28:22;
                if(exit) {label.bold=false;label.color="#d8c7ba";label.textIns.color=label.color;}
                n.getChildAt(2).visible=true;
            }
        }
    }
    private get compactMap(): boolean {
        return Math.min(Laya.Browser.clientWidth,Laya.Browser.clientHeight)<540;
    }
    private layoutMapHud(): void {
        const compact=this.compactMap,width=this.root.width,height=compact?96:80;
        const fit=(name:string,x:number,y:number,w:number,h:number,font?:number) => {
            const n=this.expeditionNodes[name]||this.mapAreas[name];n.pos(x,y);n.size(w,h);
            if(font)(n as Laya.GTextField).fontSize=font;
        };
        fit("mapHeaderArea",0,0,width,height);fit("mapHeaderPanel",0,0,width,height);
        const clockWidth=compact?176:156;
        fit("mapClockArea",16,12,clockWidth,height-24);
        fit("mapClockGlyph",8,(height-24-28)/2,28,28);
        fit("expClock",44,0,clockWidth-48,height-24,compact?32:28);
        const group=compact?148:116;
        fit("mapKillsArea",clockWidth+28,12,group*3,height-24);
        for(let i=0;i<3;i++) {
            const icon=compact?40:36;
            fit(`mapKillIcon${i}`,i*group,(height-24-icon)/2,icon,icon);
            fit(`expKillCount${i}`,i*group+icon+4,0,group-icon-8,height-24,compact?26:21);
        }
        const staminaWidth=compact?280:268,weightWidth=compact?240:232;
        for(const [key,groupWidth,x] of [
            ["Stamina",staminaWidth,width-16-weightWidth-16-staminaWidth],
            ["Weight",weightWidth,width-16-weightWidth],
        ] as const) {
            const labelWidth=compact?60:52,barHeight=compact?34:28,barX=labelWidth+12;
            const barWidth=groupWidth-barX-8,barY=(height-24-barHeight)/2;
            fit(`map${key}Area`,x,12,groupWidth,height-24);
            fit(`exp${key}Label`,0,0,labelWidth,height-24,compact?26:20);
            fit(`map${key}Slot`,barX,barY,barWidth,barHeight);
            fit(`map${key}Track`,barX+3,barY+3,barWidth-6,barHeight-6);
            fit(`map${key}Fill`,barX+3,barY+3,barWidth-6,barHeight-6);
            fit(`exp${key}`,barX,barY,barWidth,barHeight,compact?26:19);
        }
        const playerWidth=compact?348:300,playerHeight=compact?132:112,barX=compact?96:84;
        fit("mapPlayerArea",16,height+12,playerWidth,playerHeight);
        fit("mapPlayerPanel",0,0,playerWidth,playerHeight);
        const frame=compact?76:64;
        fit("mapAvatarFrame",12,(playerHeight-frame)/2,frame,frame);
        fit("mapAvatarPlaceholder",18,(playerHeight-frame)/2+6,frame-12,frame-12);
        fit("expPlayerName",barX,compact?6:8,playerWidth-barX-12,compact?36:26,compact?26:20);
        for(const [key,y] of [["Hp",compact?46:40],["Mp",compact?90:76]] as const) {
            const h=compact?32:26,w=playerWidth-barX-12;
            fit(`map${key}Slot`,barX,y,w,h);fit(`map${key}Track`,barX+3,y+3,w-6,h-6);
            fit(`map${key}Fill`,barX+3,y+3,w-6,h-6);
            fit(`exp${key}Value`,barX,y,w,h,compact?26:19);
        }
    }
    private layoutMapControls(): void {
        const compact=this.compactMap,area=this.mapAreas.mapActionsArea,height=compact?202:174;
        area.pos(16,this.root.height-height-16);area.size(this.root.width-32,height);
        const buttonHeight=compact?112:100,buttonWidth=compact?124:112;
        for(const [i,key] of ["expStorage","expBuild"].entries()) {
            const button=this.buttons[key];
            button.pos(i*(buttonWidth+12),height-buttonHeight);
            const icon=button.getChildAt(2) as Laya.GImage,size=compact?46:42;
            icon.pos((buttonWidth-size)/2,12);icon.size(size,size);
        }
        const exit=this.buttons.expAbandon,exitArea=this.mapAreas.mapExitArea;
        exitArea.pos(0,0);exitArea.size(exit.width,exit.height);exit.pos(0,0);
        const icon=exit.getChildAt(2) as Laya.GImage;
        icon.pos(12,(exit.height-24)/2);icon.size(24,24);
        const notice=this.labels.expNotice;
        notice.pos(buttonWidth*2+40,height-48);notice.size(area.width-buttonWidth*2-56,44);
        notice.fontSize=compact?26:18;
    }
    private layoutMapContext(points:Map<number,MapPoint>,reach:Set<number>): void {
        const compact=this.compactMap,area=this.mapAreas.nodeActionArea;
        const width=compact?288:236,height=compact?252:210,x=this.root.width-width-16;
        const ys=[(compact?96:80)+16,this.root.height-height-20];
        const score=(y:number) => [...reach].reduce((sum,id) => {
            const p=points.get(id);if(!p)return sum;
            const left=p.x-this.scroller.scrollingPosX-64;
            const overlap=Math.max(0,Math.min(x+width,left+128)-Math.max(x,left))*
                Math.max(0,Math.min(y+height,p.y+104)-Math.max(y,p.y-100));
            return sum+overlap*(id===this.expedition.inventory!.node?10:1);
        },0);
        area.pos(x,score(ys[0])<=score(ys[1])?ys[0]:ys[1]);area.size(width,height);
        const background=this.expeditionNodes.expContextBackground;
        background.pos(0,0);background.size(width,height);
        const icon=this.expeditionNodes.expContextIcon,size=compact?88:72;
        icon.pos(12,12);icon.size(size,size);
        const title=this.labels.expContextTitle,titleX=size+20;
        title.pos(titleX,18);title.size(width-titleX-12,compact?68:58);
        title.fontSize=compact?30:24;title.align="left";
        const status=this.labels.expContextStatus;
        status.pos(16,compact?110:92);status.size(width-32,compact?32:26);
        status.fontSize=compact?26:18;status.align="center";status.valign="middle";
        const button=this.buttons.expUse,buttonHeight=compact?80:60;
        button.pos(12,height-buttonHeight-16);button.size(width-24,buttonHeight);
        button.getChildAt(0).size(button.width,button.height);
        const label=button.getChildAt(1) as Laya.GTextField;
        label.pos(4,2);label.size(button.width-8,button.height-4);
    }
    private prepareMapImage(image: Laya.GImage): void {
        image.on(Laya.Event.LOADED,this,this.mapImageLoaded,[image]);
        this.mapImageLoaded(image);
    }
    private mapImageLoaded(image: Laya.GImage): void {
        const inset=image.src.endsWith("/map-panel.png")?16:image.src.endsWith("/map-slot.png")?6:
            image.src.includes("/map-button-")?10:0;
        const texture=image.texture,grid=[inset,inset,inset,inset,0];
        if (!inset || !texture || texture._sizeGrid?.join(",")===grid.join(",") &&
            image.graphics.cmds.some(cmd=>cmd.cmdID===Laya.Draw9GridTextureCmd.ID)) return;
        // Direct PNG previews bypass the IDE importer; retain real nine-slice drawing there too.
        texture._sizeGrid=grid;
        const src=image.src;
        image.texture=texture;image.src=src;
    }
    private mapButtonState(button: Laya.GWidget,state: "normal"|"hover"|"pressed"): void {
        const image=button.getChildAt(0) as Laya.GImage;
        // A brief movement lock blocks input without flashing the persistent toolbar disabled.
        const movementLock=!!this.movement && (button.name==="expStorage" || button.name==="expBuild");
        const disabled=!button.mouseEnabled&&!movementLock;
        if (!button.mouseEnabled) state="normal";
        const src=MAP_ART+`map-button-${disabled?"disabled":state}.png`;
        if (image.src!==src) image.src=src;
        this.mapImageLoaded(image);
        button.graphics.clear();
    }
    private mapLabel(key: string,value: string): void {
        const label=this.labels[key];label.visible=true;label.text=value;
    }
    private renderMapHud(): void {
        const c=this.expedition.archive!.config,s=this.expedition.inventory!;
        this.layoutMapHud();
        for (const name of ["mapHeaderPanel","mapClockGlyph",
            "mapPlayerPanel","mapAvatarFrame","mapAvatarPlaceholder","mapHpSlot","mapHpTrack","mapMpSlot","mapMpTrack"])
            this.expeditionNodes[name].visible=true;
        this.mapLabel("expClock",this.timeText());
        for (const [key,title] of [["Stamina","体力"],["Weight","负重"]]) {
            this.mapLabel(`exp${key}Label`,title);
            const weight=Inventory.weight(c,s);
            const value=key==="Stamina"?s.stamina!:weight.current,max=key==="Stamina"?c.rules.staminaMax:weight.limit;
            this.mapLabel(`exp${key}`,`${value} / ${max}`);
            this.expeditionNodes[`map${key}Slot`].visible=true;
            this.expeditionNodes[`map${key}Track`].visible=true;
            this.mapMeter(key,value,max);
        }
        this.mapLabel("expPlayerName","散修");
        for (const [i,kind] of ["normal","elite","boss"].entries()) {
            this.expeditionNodes[`mapKillIcon${i}`].visible=true;
            this.mapLabel(`expKillCount${i}`,`${["普通","精英","首领"][i]} ${s.map.cleared.filter(id=>Rules.node(c,id,s).kind===kind).length}`);
        }
        for (const [key,value,max] of [
            ["Hp",s.hp,c.build.setup.player.maxHp],
            ["Mp",s.mp,c.build.setup.player.maxMp],
        ] as const) {
            this.mapMeter(key,value,max);
            this.mapLabel(`exp${key}Value`,`${key==="Hp"?"生命":"灵力"}  ${Core.format(value)} / ${Core.format(max)}`);
        }
    }
    private mapMeter(key: string,value: number,max: number): void {
        const fill=this.expeditionNodes[`map${key}Fill`];
        const ratio=max>0?Math.min(1,Math.max(0,value/max)):0;
        fill.visible=ratio>0;
        // Crop the fixed-size artwork so low values do not squeeze its painted texture.
        fill.scrollRect=new Laya.Rectangle(0,0,fill.width*ratio,fill.height);
    }
    private renderSearchSpinner(): void {
        const spinner=this.nodes.expSearchSpinner;
        if (!spinner) return;
        spinner.visible=!!this.nodes.inventoryRoot?.visible && !!this.nodes.expUnknown?.visible && this.expedition.searching;
        if (!spinner.visible) return;
        spinner.getChildAt(0).rotation=performance.now()*0.24%360;
    }
    private updateMapBackground(): void {
        if(this.opened && this.expeditionNodes.expeditionRoot.visible)this.backdrop();
    }
    private mapArtLoaded(): void {
        if(this.opened && this.mapOpen)this.refresh();
    }
    private styleNodeIcon(image: Laya.GImage,defeated: boolean,searched: boolean): void {
        image.grayed=false;
        image.filters=defeated&&!searched?
            [new Laya.ColorFilter().adjustSaturation(-65).adjustBrightness(-12)]:null;
        image.grayed=searched;image.alpha=1;image.color="#ffffff";
    }
    private renderPlayerMarker(): void {
        const marker=this.expeditionNodes.expPlayer;
        marker.visible=true;marker.mouseEnabled=false;marker.zOrder=2;
        marker.size(116,160);marker.graphics.clear();
        const ring=marker.getChildByName("expPlayerRing");
        if(ring) {ring.visible=true;ring.pos(20,142);ring.size(76,18);ring.alpha=0.95;}
        const avatar=marker.getChildByName("expPlayerAvatar") as Laya.GImage;
        avatar.visible=true;avatar.pos(22,70);avatar.size(72,90);
    }
    private renderMapFeedback(): void {
        if(!this.opened||!this.mapOpen||!this.expeditionNodes.expeditionRoot?.visible)return;
        const ring=this.expeditionNodes.expPlayer.getChildByName("expPlayerRing");
        const reducedMotion=typeof window.matchMedia==="function"&&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if(ring)ring.alpha=this.movement||reducedMotion?
            0.95:0.88+Math.sin(performance.now()*Math.PI/1200)*0.12;
    }
    private get mapBandTop(): number {
        return 112+(this.expeditionNodes.expViewport.height-720)/2;
    }
    private mapPositions(s: ExpeditionState): Map<number,MapPoint> {
        const height=this.expeditionNodes.expViewport.height;
        const rows=s.map.nodes.map(n=>{
            const size=ENEMY_ICON_SIZES[n.kind]||104;
            let hash=2166136261;
            for(const char of `${s.runId}:${n.key}`)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
            hash=Math.imul(hash^(hash>>>16),0x7feb352d);
            hash=Math.imul(hash^(hash>>>15),0x846ca68b);
            hash=(hash^(hash>>>16))>>>0;
            const above=58+(size-104)*0.75,below=Math.max(64,46+(size-104)*0.25);
            const x=112+n.x*242,underHud=x<(this.compactMap?348:300)+70;
            return { id:n.id,x:112+n.x*242,lane:n.y,above,below,
                desired:height/2-4+n.y*158+(hash%89)-44,
                min:Math.max(this.mapBandTop-22+above,underHud?(this.compactMap?240:204)+above+8:0),
                max:height-104,y:0 };
        }).sort((a,b)=>a.lane-b.lane||a.id-b.id);
        // Reserve vertical room for nearby columns before applying each node's stable offset.
        const before=rows.map((row,i)=>rows.slice(0,i).filter(other=>Math.abs(row.x-other.x)<116));
        for(let i=0;i<rows.length;i++)
            for(const other of before[i])rows[i].min=Math.max(rows[i].min,other.min+other.below+rows[i].above+12);
        for(let i=rows.length-1;i>=0;i--)
            for(const other of before[i])other.max=Math.min(other.max,rows[i].max-other.below-rows[i].above-12);
        for(let i=0;i<rows.length;i++) {
            const row=rows[i];
            const min=Math.max(row.min,...before[i].map(other=>other.y+other.below+row.above+12));
            row.y=Math.max(min,Math.min(row.max,row.desired));
        }
        return new Map(rows.map(row=>[row.id,{x:row.x,y:row.y}]));
    }
    protected backdrop(): void {
        if(this.pageRole!=="map") { super.backdrop();return; }
        const page=this.root.parent as Laya.GWidget,ground=this.elements.screenBackground;
        const shade=this.elements.result,texture=(this.elements.mapGroundTexture as Laya.GImage).texture;
        const origin=page.localToGlobal(new Laya.Point());
        const start=ground.globalToLocal(origin,true);
        ground.visible=true;ground.graphics.clear();
        ground.graphics.drawRect(start.x,start.y,page.width,page.height,"#3d4640");
        if(texture) {
            // Texture phase is in map coordinates, independent of revealed map length.
            const anchor=page.globalToLocal(this.root.localToGlobal(new Laya.Point()));
            const x=anchor.x-(this.scroller?.scrollingPosX||0);
            const offset=(value:number,size:number)=>-((-value%size+size)%size);
            ground.graphics.fillTexture(texture,start.x,start.y,page.width,page.height,"repeat",
                new Laya.Point(offset(x,texture.width),offset(anchor.y,texture.height)));
        }
        const at=shade.globalToLocal(origin,true);
        shade.visible=true;shade.graphics.clear();
        shade.graphics.drawRect(at.x,at.y,page.width,page.height,"rgba(12,14,14,0.08)");
    }
    private renderMap(): void {
        const c=this.expedition.archive!.config,s=this.expedition.inventory!,current=Rules.node(c,s.node,s);
        if(this.presentedMapRunId!==s.runId) {
            this.presentedMapRunId=s.runId;this.selectedNode=null;this.centerMap=true;
        }
        this.expeditionNodes.expeditionRoot.visible=true;
        this.renderMapHud();
        const reach=Rules.reachable(c,s),points=new Map<number,MapPoint>();
        const viewport=this.expeditionNodes.expViewport as Laya.GPanel;
        this.expeditionNodes.expViewport.visible=true;
        this.expeditionNodes.expMapContent.visible=true;
        const positions=this.mapPositions(s);
        for(const id of Rules.displayNodes(s,viewport.width)) {
            const n=Rules.node(c,id,s),{x:px,y:py}=positions.get(id)!;
            points.set(id,{x:px,y:py});
            const cleared=!!n.enemy&&s.map.cleared.includes(id),source=s.map.sources.find(box=>box.node===id);
            const explored=!!source&&source.revealed===source.entries.length;
            const key=`expNode${id}`;
            this.button(key,"",px-58,py-52,116,116,reach.has(id),id===s.node||id===this.selectedNode);
            const b=this.buttons[key],l=b.getChildAt(1) as Laya.GTextField;
            const base=b.getChildAt(0) as Laya.GImage;
            base.src="ui/image/expeditionNodes/node-base.png";
            base.pos(6,18);base.size(104,104);base.visible=n.kind==="transit";
            base.grayed=explored;base.alpha=1;base.color="#ffffff";
            l.visible=false;
            const image=b.getChildAt(2) as Laya.GImage;
            const art=n.kind==="search"?(n.pool.startsWith("supply")?"supply":"search"):
                ({normal:"enemy-normal",elite:"enemy-elite",boss:"enemy-boss",borrow:"borrow",insight:"insight",
                    extract:"extract",recovery:"recovery",start:"start",transit:"transit"})[n.kind];
            image.src=`ui/image/expeditionNodes/node-${art}.png`;
            const size=ENEMY_ICON_SIZES[n.kind]||104;
            image.pos((116-size)/2,-6-(size-104)*0.75);image.size(size,size);image.visible=n.kind!=="transit";
            this.styleNodeIcon(image,cleared,explored);
            b.graphics.clear();
            const hint=b.getChildByName("expReachHint");
            hint.visible=reach.has(id)&&id!==s.node&&!this.movement&&!this.pendingPath;hint.alpha=0.82;
            const done=b.getChildByName("expDone");
            done.visible=explored||s.map.used.includes(id);
            done.pos(image.x+image.width-22,image.y+4);
        }
        const width=Rules.browseWidth(s,viewport.width);
        this.expeditionNodes.expMapContent.size(width,viewport.height);
        viewport.layout.refresh(true);
        if(this.centerMap) {
            this.scroller.posX=Math.max(0,points.get(s.node)!.x-viewport.width*0.42);
            this.centerMap=false;
        }
        // Native layout can clamp scroll position without emitting a Scroll event.
        this.backdrop();
        this.renderMapConnections(points,s.map.edges,reach);
        const marker=this.expeditionNodes.expPlayer,p=points.get(s.node)!;
        this.renderPlayerMarker();
        if(this.pendingPath) {
            const path=this.pendingPath;this.pendingPath=null;
            this.beginMovement(path,points);
        }
        if(this.movement)this.positionMovement(performance.now());
        else marker.pos(p.x-MARKER_HALF,p.y-MARKER_HALF);
        this.renderMapFeedback();
        this.scroller.touchEffect=this.movement?Laya.ScrollTouchEffect.Off:Laya.ScrollTouchEffect.On;
        this.scroller.mouseWheelDisabled=!!this.movement;
        const recovered=Rules.recovery(c,s);
        this.text("expNotice",this.notice || (this.movement?"移动中":
            s.map.warning===300000?"剩余时间不足五分钟":s.map.warning===600000?"剩余时间不足十分钟":""),
            288,650,944,34,18,"#efa797");
        this.button("expStorage","行囊",24,596,this.compactMap?124:112,this.compactMap?112:100,!this.movement);
        this.button("expBuild","构筑",148,596,this.compactMap?124:112,this.compactMap?112:100,!this.movement);
        if(!this.movement && this.selectedNode!==null && current.kind!=="transit") {
            const n=current,used=s.map.used.includes(n.id);
            const source=s.map.sources.find(box=>box.node===n.id);
            const enemy=n.enemy&&!s.map.cleared.includes(n.id);
            const fightCost=n.kind==="boss"?c.rules.bossCost:n.kind==="elite"?c.rules.eliteCost:c.rules.normalCost;
            const tired=enemy&&s.stamina!<fightCost;
            const searched=!!source&&source.revealed===source.entries.length;
            const uncollected=s.items.some(item=>item.location.space==="source"&&item.location.node===n.id);
            const action=used?"已使用":enemy?"开战":
                source?.opened?searched?"查看物品":"查看来源":source||n.kind==="search"?"搜索":
                n.kind==="extract"?"安全撤离":n.kind==="recovery"?"休息":
                n.kind==="borrow"?"借法":n.kind==="insight"?"悟道":"已在此处";
            const title=enemy?({normal:"普通敌人",elite:"精英敌人",boss:"首领"})[n.kind]:
                source&&n.enemy?"战后掉落":n.kind==="recovery"?"恢复点":n.kind==="extract"?"撤离点":n.name;
            const context=this.expeditionNodes.expContextBackground;
            context.visible=true;
            const contextIcon=this.expeditionNodes.expContextIcon as Laya.GImage;
            contextIcon.src=(this.buttons[`expNode${n.id}`].getChildAt(2) as Laya.GImage).src;
            contextIcon.visible=true;
            this.styleNodeIcon(contextIcon,!!n.enemy&&s.map.cleared.includes(n.id),
                !!source&&source.revealed===source.entries.length);
            this.text("expContextTitle",title,1012,316,224,56,24,"#e3c98c");
            this.labels.expContextTitle.align="center";this.labels.expContextTitle.valign="middle";
            this.mapLabel("expContextStatus",enemy?tired?`体力不足 · 需${fightCost}`:`阻路 · 开战需${fightCost}体力`:
                source?searched?uncollected?"已搜完 · 有物品":"已搜索完毕":source.opened?"搜索已暂停":"尚未搜索":
                used?"已使用":n.kind==="recovery"?recovered.hp||recovered.mp?
                    `生命+${Core.format(recovered.hp)}  灵力+${Core.format(recovered.mp)}`:"生命灵力已满":
                n.kind==="extract"?"携带物品可带出":n.kind==="start"?"入境处":"尚未使用");
            this.labels.expContextStatus.color=enemy?"#efb7a5":used||searched?"#b8dbc6":
                n.kind==="extract"?"#b7ded9":"#d4d9d1";
            this.button("expUse",action,1020,390,208,64,reach.has(n.id)&&!used&&!tired&&(
                    (n.kind!=="recovery"||!!recovered.hp||!!recovered.mp)&&
                    (!!source||!["start","transit"].includes(n.kind))));
            this.buttons.expUse.getChildAt(0).visible=true;
            this.layoutMapContext(points,reach);
        }
        this.button("expAbandon","放弃本局",24,518,this.compactMap?204:168,this.compactMap?64:52);
        this.layoutMapControls();
    }
    private beginMovement(path: number[], points: Map<number,MapPoint>): void {
        const route: MapPoint[]=[points.get(path[0])!];
        for(let i=1;i<path.length;i++) {
            const edge=this.mapRoutes.get(`${path[i-1]}:${path[i]}`);
            route.push(...(edge||[points.get(path[i-1])!,points.get(path[i])!]).slice(1));
        }
        const lengths=route.map((p,i)=>i?Math.hypot(p.x-route[i-1].x,p.y-route[i-1].y):0);
        const total=lengths.reduce((sum,n)=>sum+n,0),last=route[route.length-1];
        const cameraFrom=this.scroller.scrollingPosX;
        const cameraTo=Math.max(0,Math.min(this.scroller.contentWidth-this.scroller.viewWidth,
            last.x-this.scroller.viewWidth*0.42));
        if(total<1&&Math.abs(cameraTo-cameraFrom)<1)return;
        this.scroller.cancelDragging();
        this.movement={points:route,lengths,total,startedAt:performance.now(),
            duration:Math.min(1000,Math.max(360,total/1.4)),cameraFrom,cameraTo};
        Laya.timer.frameLoop(1,this,this.movementTick);
    }
    private positionMovement(now: number): boolean {
        const m=this.movement!;
        const t=Math.min(1,Math.max(0,(now-m.startedAt)/m.duration)),ease=t*t*(3-2*t);
        let distance=m.total*ease,p=m.points[0];
        for(let i=1;i<m.points.length;i++) {
            const length=m.lengths[i];
            if(distance<=length&&length>0) {
                const from=m.points[i-1],to=m.points[i],ratio=distance/length;
                p={x:from.x+(to.x-from.x)*ratio,y:from.y+(to.y-from.y)*ratio};break;
            }
            distance-=length;p=m.points[i];
        }
        this.expeditionNodes.expPlayer.pos(p.x-MARKER_HALF,p.y-MARKER_HALF);
        this.scroller.posX=m.cameraFrom+(m.cameraTo-m.cameraFrom)*ease;
        return t===1;
    }
    private movementTick(): void {
        if(!this.movement)return;
        if(!this.mapOpen||!this.expeditionNodes.expeditionRoot.visible||this.expedition.inventory?.phase!=="active") {
            this.movement=null;Laya.timer.clear(this,this.movementTick);return;
        }
        if(this.positionMovement(performance.now())) {
            this.movement=null;Laya.timer.clear(this,this.movementTick);this.refresh();
        }
    }
    private renderMapConnections(points: Map<number,MapPoint>, edges: number[][], reach:Set<number>): void {
        this.mapRoutes.clear();
        const lines=this.expeditionNodes.expLines;lines.visible=true;lines.graphics.clear();
        const rectangles:number[][]=[];
        for(const [id,p] of points) {
            const image=this.buttons[`expNode${id}`].getChildAt(2) as Laya.GImage;
            const halfWidth=Math.max(54,image.width/2-4),above=Math.max(54,30-image.y);
            rectangles.push([p.x-halfWidth-2,p.y-above-2,p.x+halfWidth+2,p.y+56]);
        }
        const interval=(p:{x:number;y:number},q:{x:number;y:number},box:number[])=>{
            let low=0,high=1;
            for(const [start,delta,min,max]of [[p.x,q.x-p.x,box[0],box[2]],[p.y,q.y-p.y,box[1],box[3]]]) {
                if(delta===0) { if(start<=min||start>=max)return null; }
                else {
                    const a=(min-start)/delta,b=(max-start)/delta;
                    low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));
                }
            }
            return low<high?[low,high]:null;
        };
        for(const [a,b]of edges) {
            const p=points.get(a),q=points.get(b);
            if(!p||!q)continue;
            this.mapRoutes.set(`${a}:${b}`,[p,q]);
            this.mapRoutes.set(`${b}:${a}`,[q,p]);
            const current=this.expedition.inventory!.node;
            const active=!this.movement&&!this.pendingPath&&((a===current&&reach.has(b))||(b===current&&reach.has(a)));
            // Hide the portions under node artwork without bending the connection.
            const hidden=rectangles.map(box=>interval(p,q,box)).filter((v):v is number[]=>!!v)
                .sort((a,b)=>a[0]-b[0]);
            const at=(t:number)=>({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});
            let cursor=0;
            for(const [low,high]of hidden) {
                if(low>cursor)this.dashedRoute(lines.graphics,[at(cursor),at(low)],active);
                cursor=Math.max(cursor,high);
            }
            if(cursor<1)this.dashedRoute(lines.graphics,[at(cursor),q],active);
        }
    }
    private dashedRoute(graphics: Laya.Graphics, route: MapPoint[],active:boolean): void {
        const texture=(this.expeditionNodes.mapRouteTexture as Laya.GImage).texture;
        if(!texture)return;
        const dash=12,gap=9,period=dash+gap;
        // Anchor collinear segments to the same phase so shared routes cannot fill each other's gaps.
        for(let i=1;i<route.length;i++) {
            const a=route[i-1],b=route[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
            if(length<0.0001)continue;
            const reverse=dx<0||dx===0&&dy<0,start=reverse?b:a;
            const ux=(reverse?-dx:dx)/length,uy=(reverse?-dy:dy)/length;
            const anchor=start.x*ux+start.y*uy;
            for(let offset=0;offset<length;) {
                const phase=((anchor+offset)%period+period)%period;
                const step=Math.min(length-offset,phase<dash?dash-phase:period-phase);
                if(step<0.0001) { offset+=0.0001;continue; }
                if(phase<dash) {
                    const x=start.x+ux*offset,y=start.y+uy*offset;
                    const endX=start.x+ux*(offset+step),endY=start.y+uy*(offset+step);
                    const span=Math.hypot(endX-x,endY-y);
                    const matrix=new Laya.Matrix(ux,uy,-uy,ux,x,y);
                    // The source's transparent padding preserves the painted caps and shadow.
                    const height=active?8:6;
                    graphics.drawTexture(texture,-span*0.3,-height/2,span*1.6,height,matrix,
                        active?1:0.6,active?"#ffe8b0":"#ffffff");
                }
                offset+=step;
            }
        }
    }
}
