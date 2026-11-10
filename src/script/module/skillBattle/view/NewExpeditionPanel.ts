import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { NewBattleCore as Core } from "../newRules/NewBattleCore";
import { NewBuildConfigUtils } from "../newRules/NewBuildConfigUtils";
import { NewExpeditionConfigUtils } from "../newRules/NewExpeditionConfigUtils";
import { NewExpeditionRules as Rules } from "../newRules/NewExpeditionRules";
import { NewExpeditionSession } from "../newRules/NewExpeditionSession";
import { NewInventoryPanel } from "./NewInventoryPanel";

export class NewExpeditionPanel extends NewInventoryPanel {
    private mapOpen = true;
    private selectedNode: number | null = null;
    private centerMap = true;
    private scroller: Laya.Scroller;
    private expeditionNodes: { [key: string]: Laya.GWidget } = {};
    private abandonConfirm = false;
    private extractConfirm = false;
    private renderedRevision = -1;
    constructor(view: UIBaseView, readonly expedition: NewExpeditionSession,
        navigate: (s: "start"|"battle"|"settlement") => void, screen: "start"|"battle"|"settlement") {
        super(view,expedition,s => navigate(s==="settlement" && expedition.inventory?.phase==="active" ? "start" : s),screen);
        const root = view.getElement<Laya.GWidget>("expeditionRoot",false);
        if (!root) return;
        this.expeditionNodes.expeditionRoot = root;
        const bind=(n:Laya.GWidget) => {
            this.expeditionNodes[n.name]=n;
            if (n instanceof Laya.GTextField) { this.labels[n.name]=n;return; }
            else if (/^exp(?:Node\d+|Storage|Build|Use|Abandon)$/.test(n.name)) {
                this.buttons[n.name]=n;
                n.on(Laya.Event.CLICK,this,() => this.command(n.name));
                return;
            }
            for(let i=0;i<n.numChildren;i++) bind(n.getChildAt(i) as Laya.GWidget);
        };
        for (let i=0;i<root.numChildren;i++) bind(root.getChildAt(i) as Laya.GWidget);
        const viewport=this.expeditionNodes.expViewport as Laya.GPanel;
        this.scroller=new Laya.Scroller();
        this.scroller.direction=Laya.ScrollDirection.Horizontal;
        this.scroller.barDisplay=Laya.ScrollBarDisplay.Hidden;
        this.scroller.touchEffect=Laya.ScrollTouchEffect.On;
        this.scroller.bouncebackEffect=Laya.ScrollBounceBackEffect.Off;
        viewport.scroller=this.scroller;
        for(let i=1;i<=7;i++) {
            const n=this.nodes[`expLootPage${i}`];
            this.buttons[n.name]=n;
            n.on(Laya.Event.CLICK,this,()=>this.command(n.name));
        }
    }
    openHubScreen(): void { super.openHubScreen(); Laya.timer.loop(50,this,this.searchTick); }
    openSettlementScreen(): void { super.openSettlementScreen(); Laya.timer.loop(50,this,this.searchTick); }
    openEncounter(): void { super.openEncounter(); Laya.timer.loop(50,this,this.searchTick); }
    suspend(): void {
        this.run(() => this.expedition.pauseSearch(),false);
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
                this.inventoryMode="storage"; this.mapOpen=false; this.centerMap=true;this.inventoryPage=0;
                this.selectedNode=null;
                if (this.screen==="settlement") this.navigate("start");
            } else if (s.phase==="preparation") {
                this.expedition.inventoryCommand({type:"enter"}); this.inventoryMode="build"; this.mapOpen=false;
            } else if (s.flow?.phase==="battle") this.navigate("battle");
            else { this.mapOpen=true; this.inventoryMode=s.flow?.pending ? "build" : "storage"; }
        });
    }
    protected command(key: string): void {
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
            this.run(() => { this.expedition.pauseSearch(); this.mapOpen=true; }); return;
        }
        if (key==="invPrimary" && this.expedition.inventory?.phase==="active" && !this.expedition.flow?.pending) {
            this.run(() => { this.expedition.pauseSearch(); this.mapOpen=true; }); return;
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
                if (key==="expBuild") { this.mapOpen=false; this.inventoryMode="build"; return; }
                if (key==="expAbandon") {
                    if (this.extractConfirm) { this.extractConfirm=false;return; }
                    if (this.abandonConfirm) {
                        this.expedition.mapCommand({type:"abandon"}); this.navigate("settlement");
                    } else { this.abandonConfirm=true; this.extractConfirm=false; }
                    return;
                }
                if (key==="expUse") {
                    const c=this.expedition.archive!.config, id=this.selectedNode??s.node,n=Rules.node(c,id);
                    if (this.abandonConfirm || this.extractConfirm) {
                        if (this.extractConfirm) {
                            this.expedition.mapCommand({type:"extract"}); this.navigate("settlement");
                        }
                        this.abandonConfirm=false; this.extractConfirm=false; return;
                    }
                    if(id!==s.node) {
                        this.expedition.mapCommand({type:"travel",node:id});
                        this.centerMap=true;this.inventoryPage=0;
                    }
                    if(this.expedition.flow?.phase==="battle") { this.navigate("battle");return; }
                    if(s.map.used.includes(id))return;
                    if (n.kind==="extract") { this.extractConfirm=true; return; }
                    if (n.kind==="borrow" || n.kind==="insight") {
                        this.expedition.mapCommand({type:n.kind}); this.mapOpen=false; this.inventoryMode="build";
                    } else if (n.kind==="recovery") this.expedition.mapCommand({type:"recover"});
                    else if(Rules.source(this.expedition.inventory!))this.openGround(true);
                    return;
                }
                const target=/^expNode(\d+)$/.exec(key);
                if (target) {
                    if (this.scroller.isDragged) return;
                    this.abandonConfirm=false; this.extractConfirm=false;
                    const id=+target[1];
                    if(!Rules.reachable(this.expedition.archive!.config,s).has(id))return;
                    this.selectedNode=id;
                }
            }); return;
        }
        super.command(key);
    }
    private openGround(search=false): void {
        if(search)this.expedition.openSource();
        this.mapOpen=false;this.inventoryMode="storage";
    }
    protected beginDrag(key: string, point: Laya.Point): boolean {
        try { this.expedition.pauseSearch(); }
        catch (error) { this.notice=(error as Error).message;return false; }
        return super.beginDrag(key,point);
    }
    protected renderStart(): void {
        const s=this.expedition.inventory;
        if (s?.phase==="active" && s.flow?.phase!=="battle" && !s.flow?.pending && this.mapOpen) {
            this.renderMap(); return;
        }
        if (s?.flow?.pending) this.inventoryMode="build";
        if (s?.phase==="active") this.filter="all";
        super.renderStart();
        if (s?.phase==="active" && this.labels.resultTitle?.text==="剑土双道试炼")
            this.labels.resultTitle.text="秘境构筑";
        if (s?.flow?.pending && this.buttons.invToggle) this.buttons.invToggle.visible=false;
        if (this.nodes?.inventoryRoot?.visible) {
            this.label("invTitle","末法寻仙 · 秘境行囊",26,"#e3c98c");
            this.control("invPrimary",!s || s.phase==="ended" ? "建立探索测试库存" : s.phase==="preparation" ? "入境" :
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
                    const cell=Array.from({length:56},(_,i)=>this.nodes[`invSourceCell${i}`]).find(cell=>
                        items.every(n=>cell.x>=n.x+n.width||cell.x+cell.width<=n.x||cell.y>=n.y+n.height||cell.y+cell.height<=n.y));
                    if(cell) {
                        this.nodes.expUnknown.visible=true;
                        this.nodes.expUnknown.pos(cell.x+(cell.width-28)/2,cell.y+(cell.height-28)/2);
                        this.nodes.expSearchSpinner.pos(cell.x+(cell.width-44)/2,cell.y+(cell.height-44)/2);
                    }
                    this.nodes.invSourceTitle.width=380;
                    this.renderSearchSpinner();
                }
                this.nodes.invExtract.visible=n.kind==="extract" && !s.flow?.pending;
                for(const key of ["invAll","invMedicine","invMaterials","invEquipment","invPrev","invNext","invPage"])
                    this.nodes[key].visible=false;
                this.nodes.invReveal.pos(804,112);this.nodes.invReveal.size(180,30);
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
        super.renderReset();
        this.labels.resultTitle.text="清除本阶段探索档？";
        this.labels.resultDetail.text="仅清除阶段 4 当前档，不删除其他应用数据。";
    }
    protected button(key: string, value: string, x: number, y: number, w: number, h=54, enabled=true, selected=false): void {
        if (!key.startsWith("exp")) { super.button(key,value,x,y,w,h,enabled,selected); return; }
        const n=this.buttons[key],label=n.getChildAt(1) as Laya.GTextField;
        n.visible=true;n.pos(x,y);n.size(w,h);n.mouseEnabled=enabled;n.alpha=enabled||selected?1:0.55;
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
    private renderMap(): void {
        this.backdrop();
        const c=this.expedition.archive!.config,s=this.expedition.inventory!,current=Rules.node(c,s.node);
        this.expeditionNodes.expeditionRoot.visible=true;
        this.text("expTitle","末法寻仙 · 秘境",32,14,620,42,26,"#e3c98c");
        this.text("expClock",this.timeText(),1080,16,168,40,22);
        const weapon=s.items.find(i=>i.location.space==="weapon");
        this.text("expResources",`生命 ${Core.format(s.hp)} / ${Core.format(c.build.setup.player.maxHp)}    灵力 ${Core.format(s.mp)} / ${Core.format(c.build.setup.player.maxMp)}    耐久 ${weapon?.durability ?? "无武器"}    已胜 ${s.map.cleared.length} 场`,
            32,64,1216,38,20,"#c7d9d5");
        const reach=Rules.reachable(c,s),points=new Map<number,{x:number;y:number}>();
        this.expeditionNodes.expViewport.visible=true;
        this.expeditionNodes.expMapContent.visible=true;
        for(const id of s.map.visible) {
            const n=Rules.node(c,id),edge=id>27?s.map.edges.find(e=>e.includes(id)):null;
            const parent=edge?Rules.node(c,edge[0]===id?edge[1]:edge[0]):null;
            const x=id===28 ? parent!.x+(parent!.id===7?0.9:-0.5) :
                id===29 ? parent!.x-0.5 : parent?.x??n.x;
            const y=id>=30 ? id===30?-1.1:1.1 : id>=28?-1.1:n.y;
            const px=80+x*242,py=190+y*112;
            points.set(id,{x:px,y:py});
            const key=`expNode${id}`,kind=({normal:"普通",elite:"精英",boss:"首领",search:n.pool.startsWith("supply")?"补给":"搜索",
                borrow:"借法",insight:"悟道",extract:"撤离",recovery:"恢复",start:"入境处",transit:"岔口"})[n.kind];
            this.button(key,`${kind}${s.map.cleared.includes(id)?"·胜":s.map.used.includes(id)?"·尽":""}`,
                px-58,py-34,116,108,reach.has(id),id===s.node||id===this.selectedNode);
            const b=this.buttons[key],l=b.getChildAt(1) as Laya.GTextField;
            // Image-backed mapped node controls have their caption after the skin.
            (b.getChildAt(0) as Laya.GImage).visible=false;
            l.text=`${kind}${s.map.cleared.includes(id)?"·胜":s.map.used.includes(id)?"·尽":""}`;
            l.pos(0,72);l.size(116,32);l.fontSize=17;l.textIns.color=id===s.node?"#ffd879":"#e8edf0";
            const image=b.getChildAt(2) as Laya.GImage;
            const art=({normal:"battle",elite:"elite",boss:"boss",search:"search"})[n.kind];
            image.src=`ui/atlas/module/expedition/${art?`${art}_${s.map.cleared.includes(id)?"inactive":"active"}`:
                ({borrow:"borrow",insight:"enlightenment",extract:"exit",recovery:"recovery",start:"back",transit:"back"})[n.kind]}.png`;
            image.visible=true;
            b.graphics.clear();
            if(id===s.node) b.graphics.drawCircle(58,34,39,null,"#ffd879",2);
            else if(id===this.selectedNode)b.graphics.drawCircle(58,34,39,null,"#c9ded4",2);
        }
        const viewport=this.expeditionNodes.expViewport as Laya.GPanel;
        const width=Math.max(viewport.width,...[...points.values()].map(p=>p.x+80));
        this.expeditionNodes.expMapContent.size(width,414);
        viewport.layout.refresh(true);
        if(this.centerMap) {
            this.scroller.posX=Math.max(0,points.get(s.node)!.x-viewport.width/2);
            this.centerMap=false;
        }
        this.renderMapConnections(points,s.map.edges);
        const recovered=Rules.recovery(c,s);
        this.text("expStatus",this.extractConfirm?"确认撤离：携带物带回，地面物品损失。":
            this.abandonConfirm?"确认放弃：仅保留归真匣，装备及其他携带物损失。":`${current.key} · ${current.name}${
                current.kind==="recovery"?` · 可恢复生命 ${Core.format(recovered.hp)} / 灵力 ${Core.format(recovered.mp)}`:""}`,
            180,548,920,42,20,"#d4dfda");
        this.text("expNotice",this.notice || (s.map.warning===300000?"剩余时间不足五分钟":s.map.warning===600000?"剩余时间不足十分钟":""),
            32,592,1216,34,18,"#efa797");
        this.button("expStorage","行囊 / 搜索",130,640,180,48);
        this.button("expBuild","构筑",332,640,180,48);
        if(this.selectedNode!==null || this.extractConfirm || this.abandonConfirm) {
            const n=Rules.node(c,this.selectedNode??s.node),used=s.map.used.includes(n.id);
            const source=s.map.sources.find(box=>box.node===n.id);
            const enemy=n.enemy&&!s.map.cleared.includes(n.id);
            const action=this.extractConfirm?"确认撤离":this.abandonConfirm?"取消放弃":
                used?n.id===s.node?"已使用":"前往":enemy?"开战":
                source||n.kind==="search"?"搜索":n.kind==="extract"?"安全撤离":n.kind==="recovery"?"休息":
                n.kind==="borrow"?"借法":n.kind==="insight"?"悟道":n.id===s.node?"已在此处":"前往";
            const title=enemy?({normal:"普通敌人",elite:"精英敌人",boss:"首领"})[n.kind]:
                source&&n.enemy?"战后掉落":n.kind==="recovery"?"恢复点":n.kind==="extract"?"撤离点":n.name;
            this.expeditionNodes.expContextBackground.visible=true;
            this.text("expContextTitle",title,1012,210,224,88,22,"#e3c98c");
            this.labels.expContextTitle.align="center";this.labels.expContextTitle.valign="middle";
            this.button("expUse",action,1020,354,208,54,this.abandonConfirm||this.extractConfirm||
                reach.has(n.id)&&(used?n.id!==s.node:
                    (n.kind!=="recovery"||!!recovered.hp||!!recovered.mp)&&
                    (n.id!==s.node||!!source||!["start","transit"].includes(n.kind))));
            this.buttons.expUse.getChildAt(0).visible=false;
            this.buttons.expUse.graphics.clear();
            this.buttons.expUse.graphics.drawRoundRect(0,0,208,54,6,6,6,6,"#66532e","#c7b279",2);
        }
        this.button("expAbandon",this.extractConfirm?"取消撤离":this.abandonConfirm?"确认放弃":"放弃本局",1000,640,148,48);
    }
    private renderMapConnections(points: Map<number,{x:number;y:number}>, edges: number[][]): void {
        const lines=this.expeditionNodes.expLines;lines.visible=true;lines.graphics.clear();
        const obstacles=[...points.values()],bounds=new Map<{x:number;y:number},number[][]>();
        for(const [id,p]of points) {
            const caption=this.buttons[`expNode${id}`].getChildAt(1) as Laya.GTextField;
            caption.textIns.typeset(true);
            const half=Math.min(58,caption.textIns.textWidth/2+4);
            bounds.set(p,[[p.x-40,p.y-40,p.x+40,p.y+40],[p.x-half,p.y+36,p.x+half,p.y+74]]);
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
                return path.some((v,i)=>i&&blocked(path[i-1],v))?null:path;
            };
            let route=candidate([p,q]);
            if(!route) {
                // Try unobstructed doglegs only when a straight edge crosses a node.
                const options:{x:number;y:number}[][]=[];
                for(const x of new Set([p.x,q.x,(p.x+q.x)/2,...obstacles.flatMap(n=>[n.x-66,n.x+66])]))
                    options.push([p,{x,y:p.y},{x,y:q.y},q]);
                for(const y of new Set([p.y,q.y,(p.y+q.y)/2,...obstacles.flatMap(n=>[n.y-46,n.y+84])]))
                    if(y>=4&&y<=410)options.push([p,{x:p.x,y},{x:q.x,y},q]);
                let shortest=Infinity;
                for(const option of options) {
                    const path=candidate(option);
                    if(!path)continue;
                    const length=path.reduce((sum,v,i)=>sum+(i?Math.hypot(v.x-path[i-1].x,v.y-path[i-1].y):0),0);
                    if(length<shortest){shortest=length;route=path;}
                }
            }
            if(route)for(let i=1;i<route.length;i++)
                lines.graphics.drawLine(route[i-1].x,route[i-1].y,route[i].x,route[i].y,"#70878a",3);
        }
    }
}
