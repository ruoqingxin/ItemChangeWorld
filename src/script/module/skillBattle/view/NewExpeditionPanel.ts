import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { NewBattleCore as Core } from "../newRules/NewBattleCore";
import { NewBuildConfigUtils } from "../newRules/NewBuildConfigUtils";
import { NewExpeditionConfigUtils } from "../newRules/NewExpeditionConfigUtils";
import { NewExpeditionRules as Rules } from "../newRules/NewExpeditionRules";
import { NewExpeditionSession } from "../newRules/NewExpeditionSession";
import { NewInventoryPanel } from "./NewInventoryPanel";
import { placeInDesign, visitRegion } from "./SkillBattleUILayout";
import type { SkillBattlePage } from "./SkillBattleUILayout";

type MapPoint = { x: number; y: number };
const MAP_HEIGHT = 430;
const MARKER_HALF = 58;

export class NewExpeditionPanel extends NewInventoryPanel {
    private mapOpen = true;
    private selectedNode: number | null = null;
    private centerMap = true;
    private scroller: Laya.Scroller;
    private expeditionNodes: { [key: string]: Laya.GWidget } = {};
    private presentedMapRunId = "";
    private renderedRevision = -1;
    private openingGround = false;
    private pendingPath: number[] | null = null;
    private mapRoutes = new Map<string,MapPoint[]>();
    private movement: { points: MapPoint[]; lengths: number[]; total: number; startedAt: number;
        duration: number; cameraFrom: number; cameraTo: number } | null = null;
    constructor(view: UIBaseView, readonly expedition: NewExpeditionSession,
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
        visitRegion(view,root,n => {
            this.expeditionNodes[n.name]=n;
            if (n instanceof Laya.GTextField) { this.labels[n.name]=n;return false; }
            else if (/^exp(?:Node\d+|Storage|Build|Use|Abandon)$/.test(n.name)) {
                this.buttons[n.name]=n;
                n.on(Laya.Event.CLICK,this,() => this.command(n.name));
                return false;
            }
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
    }
    openHubScreen(): void { super.openHubScreen(); Laya.timer.loop(50,this,this.searchTick); }
    openSettlementScreen(): void { super.openSettlementScreen(); Laya.timer.loop(50,this,this.searchTick); }
    openEncounter(): void { super.openEncounter(); Laya.timer.loop(50,this,this.searchTick); }
    suspend(): void {
        if (!this.openingGround) this.run(() => this.expedition.pauseSearch(),false);
        this.openingGround=false;
        if(this.movement)this.scroller.posX=this.movement.cameraTo;
        this.movement=null;this.pendingPath=null;
        super.suspend();
    }
    private searchTick(): void {
        this.run(() => {
            this.expedition.advanceSearch(!document.hidden && document.hasFocus());
            if (this.renderedRevision!==this.expedition.token.revision && !this.busy) {
                this.renderedRevision=this.expedition.token.revision;this.refresh();
            }
            if (this.mapOpen && this.labels.expClock?.visible) this.labels.expClock.text=this.timeText();
            this.renderSearchSpinner();
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
                const c=NewExpeditionConfigUtils.read(ConfigUtil.Tables), seed=new Uint32Array(1);
                crypto.getRandomValues(seed);
                this.expedition.prepare(c,NewBuildConfigUtils.profile(c.build),seed[0]||1);
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
                    const c=this.expedition.archive!.config, id=s.node,n=Rules.node(c,id);
                    if(n.enemy&&!s.map.cleared.includes(id)) {
                        this.expedition.mapCommand({type:"fight"});this.navigate("battle");return;
                    }
                    if(s.map.used.includes(id))return;
                    if (n.kind==="extract") {
                        this.requestConfirmation("确认安全撤离？","携带物带回，地面物品损失，本局临时构筑结束。",
                            () => { this.expedition.mapCommand({type:"extract"}); this.navigate("settlement"); });
                        return;
                    }
                    if (n.kind==="borrow" || n.kind==="insight") {
                        this.expedition.mapCommand({type:n.kind}); this.mapOpen=false;
                        this.navigate("build");
                    } else if (n.kind==="recovery") this.expedition.mapCommand({type:"recover"});
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
            this.label("invSourceTitle",s?.phase==="active" ? "当前地面" : "仓库",20,"#e3c98c");
            if (!s) this.label("invClock","行前整备",22);
            this.control("invPrimary",!s || s.phase==="ended" ? "开始整备" : s.phase==="preparation" ? "入境" :
                s.flow?.pending ? "领取借法" : "地图",!this.expedition.error);
            for (const key of ["invNodePrev","invNodeNext"]) this.nodes[key].visible=false;
            if (s?.phase==="active") {
                this.button("invToggle","地图",630,16,128,46);
                const c=this.expedition.archive!.config,n=Rules.node(c,s.node),box=Rules.source(s);
                this.label("invSourceTitle",n.name+(box && box.revealed<box.entries.length ?
                    ` · 搜索 ${Math.floor(box.progressMs/Rules.searchDuration(c,s)*100)}%` : " · 地面"),20,"#e3c98c");
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
        n.size(w,h);n.mouseEnabled=enabled;n.alpha=mapNode||enabled||selected?1:0.55;
        const skin=n.getChildAt(0) as Laya.GImage;skin.size(w,h);
        label.text=value;label.pos(4,2);label.size(w-8,h-4);label.fontSize=18;
        label.color=selected?"#ffd879":"#e8edf0";label.textIns.color=label.color;
        label.align="center";label.valign="middle";label.textIns.wordWrap=true;
    }
    private renderSearchSpinner(): void {
        const spinner=this.nodes.expSearchSpinner;
        if (!spinner) return;
        spinner.visible=!!this.nodes.inventoryRoot?.visible && !!this.nodes.expUnknown?.visible && this.expedition.searching;
        spinner.graphics.clear();
        if (!spinner.visible) return;
        const phase=Math.floor(performance.now()/60)%24;
        for(let i=0;i<24;i++) {
            const angle=i*Math.PI/12,next=(i+0.8)*Math.PI/12,tail=(i-phase+24)%24;
            const color=tail<5?"#e8eee9":tail<11?"#a6b8b0":"#53655d";
            spinner.graphics.drawLine(22+18*Math.cos(angle),22+18*Math.sin(angle),
                22+18*Math.cos(next),22+18*Math.sin(next),color,2);
        }
    }
    private updateMapBackground(): void {
        if(this.opened && this.expeditionNodes.expeditionRoot.visible)this.backdrop();
    }
    private get mapBandTop(): number {
        return 112+(this.expeditionNodes.expViewport.height-720)/2;
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
        shade.graphics.drawRect(at.x,at.y,page.width,page.height,"rgba(12,20,16,0.28)");
        const regions=this.expeditionNodes.expeditionRoot;
        const headerArea=regions.getChildByName("mapHeaderArea") as Laya.GWidget;
        const footerArea=regions.getChildByName("mapActionsArea") as Laya.GWidget;
        const headerEnd=page.globalToLocal(headerArea.localToGlobal(new Laya.Point(0,headerArea.height)));
        const footerStart=page.globalToLocal(footerArea.localToGlobal(new Laya.Point()));
        const header=Math.max(0,Math.min(page.height,headerEnd.y+6));
        const footer=Math.max(0,Math.min(page.height,footerStart.y-6));
        shade.graphics.drawRect(at.x,at.y,page.width,header,"rgba(12,20,16,0.55)");
        shade.graphics.drawRect(at.x,at.y+footer,page.width,page.height-footer,"rgba(12,20,16,0.55)");
    }
    private renderMap(): void {
        this.backdrop();
        const c=this.expedition.archive!.config,s=this.expedition.inventory!,current=Rules.node(c,s.node);
        if(this.presentedMapRunId!==s.runId) {
            this.presentedMapRunId=s.runId;this.selectedNode=null;this.centerMap=true;
        }
        this.expeditionNodes.expeditionRoot.visible=true;
        for (const name of ["mapTitleFrame","mapResourceStrip","mapTopTrim","mapFooterTrim",
            "mapTimerFrame","mapIconLife","mapIconSpirit","mapIconGuard","mapIconBattle"])
            if (this.expeditionNodes[name]) this.expeditionNodes[name].visible=true;
        this.text("expTitle","末法寻仙 · 古宗山门外围",48,16,680,36,24,"#e3c98c");
        this.labels.expTitle.valign="middle";
        this.text("expClock",this.timeText(),1080,32,166,36,24);
        this.labels.expClock.align="center";this.labels.expClock.valign="middle";
        const weapon=s.items.find(i=>i.location.space==="weapon");
        this.text("expResources",`生命 ${Core.format(s.hp)} / ${Core.format(c.build.setup.player.maxHp)}`,
            80,64,138,28,16,"#dbe6e2");
        this.text("expSpirit",`灵力 ${Core.format(s.mp)} / ${Core.format(c.build.setup.player.maxMp)}`,
            268,64,142,28,16,"#dbe6e2");
        this.text("expDurability",`耐久 ${weapon?.durability ?? "无武器"}`,
            456,64,138,28,16,"#dbe6e2");
        this.text("expWins",`已胜 ${s.map.cleared.length} 场`,
            644,64,138,28,16,"#dbe6e2");
        for (const name of ["expResources","expSpirit","expDurability","expWins"])
            this.labels[name].valign="middle";
        const reach=Rules.reachable(c,s),points=new Map<number,MapPoint>();
        const viewport=this.expeditionNodes.expViewport as Laya.GPanel;
        this.expeditionNodes.expViewport.visible=true;
        this.expeditionNodes.expMapContent.visible=true;
        const positions=new Map<number,MapPoint>();
        for(const id of s.map.present) {
            const n=Rules.node(c,id),edge=id>27?s.map.edges.find(e=>e.includes(id)):null;
            const parent=edge?Rules.node(c,edge[0]===id?edge[1]:edge[0]):null;
            const x=id===28 ? parent!.x+(parent!.id===7?0.9:-0.5) :
                id===29 ? parent!.x-0.5 : parent?.x??n.x;
            const y=id>=30 ? id===30?-1.1:1.1 : id>=28?-1.1:n.y;
            positions.set(id,{x:112+x*242,y:this.mapBandTop+198+y*128});
        }
        for(const id of s.map.visible) {
            const n=Rules.node(c,id),{x:px,y:py}=positions.get(id)!;
            points.set(id,{x:px,y:py});
            const cleared=!!n.enemy&&s.map.cleared.includes(id),source=s.map.sources.find(box=>box.node===id);
            const explored=!!source&&source.revealed===source.entries.length;
            const depleted=s.map.used.includes(id)||explored&&
                !s.items.some(item=>item.location.space==="ground"&&item.location.node===id);
            const key=`expNode${id}`,kind=cleared?"遗藏":({normal:"普通",elite:"精英",boss:"首领",search:n.pool.startsWith("supply")?"补给":"搜索",
                borrow:"借法",insight:"悟道",extract:"撤离",recovery:"恢复",start:"入境处",transit:"岔口"})[n.kind];
            const caption=`${kind}${depleted?source?"·空":"·尽":""}`;
            this.button(key,caption,px-58,py-52,116,132,reach.has(id),id===s.node||id===this.selectedNode);
            const b=this.buttons[key],l=b.getChildAt(1) as Laya.GTextField;
            // Image-backed mapped node controls have their caption after the skin.
            (b.getChildAt(0) as Laya.GImage).visible=false;
            l.text=caption;
            l.pos(0,104);l.size(116,28);l.fontSize=17;
            l.textIns.color=id===s.node?"#ffd879":explored?"#9ca9a0":"#e8edf0";
            const image=b.getChildAt(2) as Laya.GImage;
            const art=cleared?"battle-loot":n.kind==="search"?(n.pool.startsWith("supply")?"supply":"search"):
                ({normal:"enemy-normal",elite:"enemy-elite",boss:"enemy-boss",borrow:"borrow",insight:"insight",
                    extract:"extract",recovery:"recovery",start:"start",transit:"transit"})[n.kind];
            image.src=`ui/image/expeditionNodes/node-${art}.png`;
            image.pos(6,0);image.size(104,104);image.visible=true;
            image.grayed=explored;image.alpha=1;image.color="#ffffff";
            b.graphics.clear();
        }
        // Actual arrival history opens whole screens; revealing or dragging never extends them.
        const furthest=Math.max(...s.revealed.map(id=>positions.get(id)?.x??0));
        const screens=Math.max(1,Math.floor(furthest/viewport.width+0.5)+1);
        const totalScreens=Math.ceil(Math.max(...[...positions.values()].map(p=>p.x+80))/viewport.width);
        const width=Math.min(screens,totalScreens)*viewport.width;
        this.expeditionNodes.expMapContent.size(width,viewport.height);
        viewport.layout.refresh(true);
        if(this.centerMap) {
            this.scroller.posX=Math.max(0,points.get(s.node)!.x-viewport.width*0.42);
            this.centerMap=false;
        }
        this.renderMapConnections(points,s.map.edges);
        const marker=this.expeditionNodes.expPlayer,p=points.get(s.node)!;
        marker.visible=true;marker.graphics.clear();
        const markerRing=marker.getChildByName("expPlayerRing") as Laya.GImage;
        if (markerRing) {
            markerRing.visible=true;
            markerRing.pos(0,0);
            markerRing.size(116,116);
        } else {
            marker.graphics.drawCircle(MARKER_HALF,MARKER_HALF,54,null,"#ffd879",2);
        }
        if(this.pendingPath) {
            const path=this.pendingPath;this.pendingPath=null;
            this.beginMovement(path,points);
        }
        if(this.movement)this.positionMovement(performance.now());
        else marker.pos(p.x-MARKER_HALF,p.y-MARKER_HALF);
        this.scroller.touchEffect=this.movement?Laya.ScrollTouchEffect.Off:Laya.ScrollTouchEffect.On;
        this.scroller.mouseWheelDisabled=!!this.movement;
        const recovered=Rules.recovery(c,s);
        this.text("expStatus",`${current.name}${
                current.kind==="recovery"?` · 可恢复生命 ${Core.format(recovered.hp)} / 灵力 ${Core.format(recovered.mp)}`:""}`,
            180,548,920,42,20,"#d4dfda");
        this.text("expNotice",this.notice || (s.map.warning===300000?"剩余时间不足五分钟":s.map.warning===600000?"剩余时间不足十分钟":""),
            32,592,1216,34,18,"#efa797");
        this.button("expStorage","行囊",32,628,162,60);
        this.button("expBuild","构筑",210,628,162,60);
        if(!this.movement && (this.selectedNode!==null || s.node!==1)) {
            const n=current,used=s.map.used.includes(n.id);
            const source=s.map.sources.find(box=>box.node===n.id);
            const enemy=n.enemy&&!s.map.cleared.includes(n.id);
            const action=used?"已使用":enemy?"开战":
                source||n.kind==="search"?"搜索":n.kind==="extract"?"安全撤离":n.kind==="recovery"?"休息":
                n.kind==="borrow"?"借法":n.kind==="insight"?"悟道":"已在此处";
            const title=enemy?({normal:"普通敌人",elite:"精英敌人",boss:"首领"})[n.kind]:
                source&&n.enemy?"战后掉落":n.kind==="recovery"?"恢复点":n.kind==="extract"?"撤离点":n.name;
            const context=this.expeditionNodes.expContextBackground;
            context.visible=true;
            context.graphics.clear();
            context.graphics.drawRoundRect(0,0,context.width,context.height,8,8,8,8,
                "rgba(17,24,22,1)","#9a7d52",2);
            context.graphics.drawLine(18,118,230,118,"#6f6049",1);
            const contextIcon=this.expeditionNodes.expContextIcon as Laya.GImage;
            contextIcon.src=(this.buttons[`expNode${n.id}`].getChildAt(2) as Laya.GImage).src;
            contextIcon.visible=true;
            this.text("expContextTitle",title,1012,316,224,56,22,"#e3c98c");
            this.labels.expContextTitle.align="center";this.labels.expContextTitle.valign="middle";
            this.button("expUse",action,1020,390,208,76,reach.has(n.id)&&!used&&(
                    (n.kind!=="recovery"||!!recovered.hp||!!recovered.mp)&&
                    (!!source||!["start","transit"].includes(n.kind))));
            this.buttons.expUse.getChildAt(0).visible=true;
            this.buttons.expUse.graphics.clear();
        }
        this.button("expAbandon","放弃本局",1076,628,172,60);
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
    private renderMapConnections(points: Map<number,MapPoint>, edges: number[][]): void {
        this.mapRoutes.clear();
        const lines=this.expeditionNodes.expLines;lines.visible=true;lines.graphics.clear();
        const obstacles=[...points.values()],bounds=new Map<{x:number;y:number},number[][]>();
        for(const [id,p]of points) {
            const caption=this.buttons[`expNode${id}`].getChildAt(1) as Laya.GTextField;
            caption.textIns.typeset(true);
            const half=Math.min(58,caption.textIns.textWidth/2+4);
            bounds.set(p,[[p.x-54,p.y-54,p.x+54,p.y+54],[p.x-half,p.y+50,p.x+half,p.y+84]]);
        }
        const rectangles=[...bounds.values()].flat();
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
        const blocked=(p:{x:number;y:number},q:{x:number;y:number})=>rectangles.some(box=>!!interval(p,q,box));
        const trim=(p:{x:number;y:number},q:{x:number;y:number})=>{
            const dx=q.x-p.x,dy=q.y-p.y;
            const t=Math.max(...bounds.get(p)!.map(box=>interval(p,q,box)?.[1]??0))+2/Math.hypot(dx,dy);
            return{x:p.x+dx*t,y:p.y+dy*t};
        };
        for(const [a,b]of edges) {
            const p=points.get(a),q=points.get(b);
            if(!p||!q)continue;
            const candidate=(path:{x:number;y:number}[])=>{
                path=path.filter((v,i)=>!i||v.x!==path[i-1].x||v.y!==path[i-1].y);
                path=[trim(p,path[1]),...path.slice(1,-1),trim(q,path[path.length-2])];
                const length=path.reduce((sum,v,i)=>sum+(i?Math.hypot(v.x-path[i-1].x,v.y-path[i-1].y):0),0);
                return length<21||path.some((v,i)=>i&&blocked(path[i-1],v))?null:path;
            };
            let route=candidate([p,q]);
            if(!route) {
                // Keep a readable connection when a direct edge is obscured or too short.
                const options:{x:number;y:number}[][]=[];
                for(const x of new Set([p.x,q.x,(p.x+q.x)/2,...obstacles.flatMap(n=>[n.x-66,n.x+66])]))
                    options.push([p,{x,y:p.y},{x,y:q.y},q]);
                for(const y of new Set([p.y,q.y,(p.y+q.y)/2,...obstacles.flatMap(n=>[n.y-60,n.y+90])]))
                    if(y>=this.mapBandTop+4&&y<=this.mapBandTop+MAP_HEIGHT-4)options.push([p,{x:p.x,y},{x:q.x,y},q]);
                let shortest=Infinity;
                for(const option of options) {
                    const path=candidate(option);
                    if(!path)continue;
                    const length=path.reduce((sum,v,i)=>sum+(i?Math.hypot(v.x-path[i-1].x,v.y-path[i-1].y):0),0);
                    if(length<shortest){shortest=length;route=path;}
                }
            }
            const path=[p,...(route||[]),q];
            this.mapRoutes.set(`${a}:${b}`,path);
            this.mapRoutes.set(`${b}:${a}`,[...path].reverse());
            if(route)this.dashedRoute(lines.graphics,route);
        }
    }
    private dashedRoute(graphics: Laya.Graphics, route: MapPoint[]): void {
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
                if(phase<dash)graphics.drawLine(start.x+ux*offset,start.y+uy*offset,
                    start.x+ux*(offset+step),start.y+uy*(offset+step),"#8b9b8e",3);
                offset+=step;
            }
        }
    }
}
