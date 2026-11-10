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
    private mapPage = 0;
    private expeditionNodes: { [key: string]: Laya.GWidget } = {};
    private abandonConfirm = false;
    private extractConfirm = false;
    private renderedRevision = -1;
    constructor(view: UIBaseView, readonly expedition: NewExpeditionSession,
        navigate: (s: "start"|"battle"|"settlement") => void, screen: "start"|"battle"|"settlement") {
        super(view,expedition,s => navigate(s==="settlement" && expedition.inventory?.phase==="active" ? "start" : s),screen);
        const saved=expedition.archive;
        if (saved?.state.phase==="active") {
            const node=Rules.node(saved.config,saved.state.node);
            const parent=node.id>27?saved.state.map.edges.find(e=>e.includes(node.id)):null;
            const x=parent?Rules.node(saved.config,parent.find(id=>id!==node.id)!).x:node.x;
            this.mapPage=Math.min(12,Math.floor(x/3)*3);
        }
        const root = view.getElement<Laya.GWidget>("expeditionRoot",false);
        if (!root) return;
        this.expeditionNodes.expeditionRoot = root;
        for (let i=0;i<root.numChildren;i++) {
            const n=root.getChildAt(i) as Laya.GWidget;
            this.expeditionNodes[n.name]=n;
            if (n instanceof Laya.GTextField) this.labels[n.name]=n;
            else if (n.numChildren) {
                this.buttons[n.name]=n;
                n.on(Laya.Event.CLICK,this,() => this.command(n.name));
            }
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
                this.inventoryMode="storage"; this.mapOpen=false; this.mapPage=0;
                if (this.screen==="settlement") this.navigate("start");
            } else if (s.phase==="preparation") {
                this.expedition.inventoryCommand({type:"enter"}); this.inventoryMode="build"; this.mapOpen=false;
            } else if (s.flow?.phase==="battle") this.navigate("battle");
            else { this.mapOpen=true; this.inventoryMode=s.flow?.pending ? "build" : "storage"; }
        });
    }
    protected command(key: string): void {
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
                if (key==="expPrev" || key==="expNext") {
                    this.mapPage=Math.max(0,Math.min(12,this.mapPage+(key==="expPrev"?-3:3))); return;
                }
                if (key==="expStorage") { this.mapOpen=false; this.inventoryMode="storage"; return; }
                if (key==="expBuild") { this.mapOpen=false; this.inventoryMode="build"; return; }
                if (key==="expAbandon") {
                    if (this.extractConfirm) { this.extractConfirm=false;return; }
                    if (this.abandonConfirm) {
                        this.expedition.mapCommand({type:"abandon"}); this.navigate("settlement");
                    } else { this.abandonConfirm=true; this.extractConfirm=false; }
                    return;
                }
                if (key==="expUse") {
                    const c=this.expedition.archive!.config, n=Rules.node(c,s.node);
                    if (this.abandonConfirm || this.extractConfirm) {
                        if (this.extractConfirm) {
                            this.expedition.mapCommand({type:"extract"}); this.navigate("settlement");
                        }
                        this.abandonConfirm=false; this.extractConfirm=false; return;
                    }
                    if (n.kind==="extract") { this.extractConfirm=true; return; }
                    if (n.kind==="borrow" || n.kind==="insight") {
                        this.expedition.mapCommand({type:n.kind}); this.mapOpen=false; this.inventoryMode="build";
                    } else if (n.kind==="recovery") this.expedition.mapCommand({type:"recover"});
                    else { this.mapOpen=false; this.inventoryMode="storage"; }
                    return;
                }
                const target=/^expNode(\d+)$/.exec(key);
                if (target) {
                    this.abandonConfirm=false; this.extractConfirm=false;
                    this.expedition.mapCommand({type:"travel",node:+target[1]});
                    if (this.expedition.flow?.phase==="battle") this.navigate("battle");
                }
            }); return;
        }
        super.command(key);
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
                    ` · 未知物 ${box.progressMs/c.rules.searchMs*100}%` : " · 地面"),20,"#e3c98c");
                this.nodes.invReveal.visible=false;
                if (box && box.revealed<box.entries.length)
                    this.control("invReveal",this.expedition.searching ? "暂停搜索" : "搜索",!s.flow?.pending);
                if (box && box.revealed<box.entries.length) {
                    this.nodes.expUnknown.visible=true;
                    this.nodes.invSourceTitle.width=380;
                    this.renderSearchSpinner();
                }
                this.nodes.invExtract.visible=n.kind==="extract" && !s.flow?.pending;
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
        const phase=Math.floor(performance.now()/100)%8;
        for(let i=0;i<8;i++) {
            const angle=i*Math.PI/4;
            spinner.graphics.drawCircle(22+19*Math.cos(angle),22+19*Math.sin(angle),2,
                i===phase?"#e3c98c":"#6e8180");
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
        for(const id of s.map.visible) {
            const n=Rules.node(c,id),edge=id>27?s.map.edges.find(e=>e.includes(id)):null;
            const parent=edge?Rules.node(c,edge[0]===id?edge[1]:edge[0]):null;
            const x=parent?.x??n.x,y=id>=30?-1.6:id>=28?-0.8:n.y;
            if(x<this.mapPage || x>this.mapPage+4) continue;
            const px=100+(x-this.mapPage)*260,py=280+y*104;
            points.set(id,{x:px,y:py});
            const key=`expNode${id}`,kind=({normal:"普通",elite:"精英",boss:"首领",search:n.pool.startsWith("supply")?"补给":"搜索",
                borrow:"借法",insight:"悟道",extract:"撤离",recovery:"恢复",start:"入境处",transit:"岔口"})[n.kind];
            this.button(key,`${n.key}\n${kind}${s.map.cleared.includes(id)?"·胜":s.map.used.includes(id)?"·尽":""}`,
                px-63,py-33,126,66,reach.has(id)&&id!==s.node,id===s.node);
            const b=this.buttons[key],l=b.getChildAt(1) as Laya.GTextField;
            // Image-backed mapped node controls have their caption after the skin.
            (b.getChildAt(0) as Laya.GImage).visible=true;
            l.text=`${n.key}\n${kind}${s.map.cleared.includes(id)?"·胜":s.map.used.includes(id)?"·尽":""}`;
            l.pos(44,3);l.size(78,60);l.fontSize=16;l.textIns.color=id===s.node?"#ffd879":"#e8edf0";
            const image=b.getChildAt(2) as Laya.GImage;
            const art=({normal:"battle",elite:"elite",boss:"boss",search:"search"})[n.kind];
            image.src=`ui/atlas/module/expedition/${art?`${art}_${s.map.cleared.includes(id)?"inactive":"active"}`:
                ({borrow:"borrow",insight:"enlightenment",extract:"exit",recovery:"recovery",start:"back",transit:"back"})[n.kind]}.png`;
            image.visible=true;
            b.graphics.clear();b.graphics.drawRoundRect(0,0,126,66,6,6,6,6,null,id===s.node?"#ffd879":"#65777a",id===s.node?2:1);
        }
        const lines=this.expeditionNodes.expLines;lines.visible=true;lines.graphics.clear();
        for(const [a,b]of s.map.edges) {
            const p=points.get(a),q=points.get(b);
            if(p&&q) {
                const dx=q.x-p.x,dy=q.y-p.y,cut=Math.min(dx?68/Math.abs(dx):1,dy?38/Math.abs(dy):1,0.45);
                lines.graphics.drawLine(p.x+dx*cut,p.y+dy*cut,q.x-dx*cut,q.y-dy*cut,"#70878a",3);
            }
        }
        const recovered=Rules.recovery(c,s);
        this.text("expStatus",this.extractConfirm?"确认撤离：携带物带回，地面物品损失。":
            this.abandonConfirm?"确认放弃：仅保留归真匣，装备及其他携带物损失。":`${current.key} · ${current.name}${
                current.kind==="recovery"?` · 可恢复生命 ${Core.format(recovered.hp)} / 灵力 ${Core.format(recovered.mp)}`:""}`,
            180,548,920,42,20,"#d4dfda");
        this.text("expNotice",this.notice || (s.map.warning===300000?"剩余时间不足五分钟":s.map.warning===600000?"剩余时间不足十分钟":""),
            32,592,1216,34,18,"#efa797");
        this.button("expPrev","<",32,640,70,48,this.mapPage>0);
        this.button("expNext",">",1178,640,70,48,this.mapPage<12);
        this.button("expStorage","行囊 / 搜索",130,640,180,48);
        this.button("expBuild","构筑",332,640,180,48);
        const used=s.map.used.includes(s.node), action=this.extractConfirm?"确认撤离":this.abandonConfirm?"取消放弃":
            current.kind==="extract"?"撤离":current.kind==="recovery"?"恢复":current.kind==="borrow"?"借法":
            current.kind==="insight"?"悟道":"查看地面";
        this.button("expUse",action,534,640,250,48,this.abandonConfirm||this.extractConfirm||
            !used && (current.kind!=="recovery"||!!recovered.hp||!!recovered.mp));
        this.button("expAbandon",this.extractConfirm?"取消撤离":this.abandonConfirm?"确认放弃":"放弃本局",1000,640,148,48);
    }
}
