import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { BattleRules } from "../utils/BattleRules";
import type { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";
import type { BattleAction, BattleEvent, BattleResult } from "../types/BattleTypes";

import { UIManager } from "../../../games/ui/UIManager";
import { SkillBattleConfirmView } from "../../gameplay/view/SkillBattleConfirmView";
import { SkillBattleReportView } from "./SkillBattleReportView";
import { SkillBattleBuildInfoView } from "../../build/view/SkillBattleBuildInfoView";
import { placeInDesign, visitRegion } from "../../gameplay/utils/GameplayLayout";
import type { SkillBattlePage } from "../../gameplay/utils/GameplayLayout";
import { BY_SKILL, traitDescription } from "../utils/CombatConfig";
import { intent, layers, skillCost } from "../utils/CombatEngine";
import type { StatusType } from "../types/CombatTypes";

type Screen = "start" | "battle" | "settlement";
export type BattlePanelSession = ExpeditionRunManager;
const colors = { text: "#ecefe7", muted: "#bac3b6", gold: "#e3c98c", jade: "#a1d7ba",
    red: "#efa797", blue: "#9ec9ec", fill: "#1c2924", line: "#7a8876" };


export class BattlePanel {
    readonly buttons: { [key: string]: Laya.GWidget } = {};
    readonly labels: { [key: string]: Laya.GTextField } = {};
    protected selected: BattleAction | null = null;
    protected selection: BattleResult | null = null;
    protected notice = "";
    protected opened = false;
    protected busy = false;
    protected resetConfirm = false;
    protected overlay: "log" | "build" | null = null;
    private queue: BattleEvent[] = [];
    protected root: Laya.GWidget;
    private viewport: Laya.GWidget;
    protected elements: { [key: string]: Laya.GWidget } = {};
    protected modalOpen = false;
    private popup: UIBaseView;
    private readonly qKeys = ["skill1","skill2","skill3","skill4","upgrade0","qFall","qEnd"];
    private readonly childNodes = new Map<Laya.Node, Laya.GWidget[]>();
    protected child(node: Laya.Node, index: number): Laya.GWidget { return this.childNodes.get(node)?.[index]; }
    protected namedChild(node: Laya.Node, name: string): Laya.GWidget { return this.childNodes.get(node)?.find(n => n.name === name); }
    constructor(view: UIBaseView, readonly session: BattlePanelSession,
        protected readonly navigate: (screen: SkillBattlePage) => void, readonly screen: Screen,
        readonly pageRole: SkillBattlePage = screen) {
        const cache = (node: Laya.Node) => {
            const children: Laya.GWidget[] = [];
            for (let i = 0; i < node.numChildren; i++) {
                const child = node.getChildAt(i) as Laya.GWidget;
                children.push(child); cache(child);
            }
            this.childNodes.set(node, children);
        };
        cache(view.view);
        this.viewport = view.view;
        this.root = view.getElement<Laya.GWidget>("adapter", false) || view.view;
        visitRegion(view, view.view, child => {
            if (child.name === "box_inventory_popup") return false;
            // 大厅返回按钮由所属界面管理，不参与战斗和储物区域的显隐。
            if (child.name === "btn_lobby_back") return false;
            this.elements[child.name] = child;
            if (child.name === "inventoryRoot" || child.name === "expeditionRoot") return false;
            if (child instanceof Laya.GTextField) {
                this.labels[child.name] = child;
                child.color = colors.text;
                child.fontSize = 20;
                child.textIns.bgColor = null as any;
                child.textIns.borderColor = null as any;
            } else if (this.child(child,0) instanceof Laya.GTextField) {
                this.buttons[child.name] = child;
                this.labels[`txt_${child.name}`] = view.getElement<Laya.GTextField>(`txt_${child.name}`);
                return false;
            }
        });
        for (let i = 1; i <= 4; i++) {
            const name = `img_skill${i}`;
            const icon = view.getElement<Laya.GWidget>(name, false);
            if (icon) this.elements[name] = icon;
        }
        // 通过预制体映射统一绑定按钮。
        for (const key of Object.keys(this.buttons)) {
            const button = view.getElement<Laya.GWidget>(key, false);
            if (!button) throw new Error(`预制按钮未绑定：${key}`);
            button.on(Laya.Event.CLICK, this, () => this.command(key));
        }
        const resizeBackdrop = () => {
            if (this.elements.result?.visible) this.backdrop();
        };
        this.viewport.on(Laya.Event.RESIZE, this, resizeBackdrop);
        this.root.on(Laya.Event.MOVED, this, resizeBackdrop);
        this.elements.result?.parent.on(Laya.Event.MOVED, this, resizeBackdrop);
        this.root.on(Laya.Event.RESIZE, this, () => Laya.timer.callLater(this, this.resizeLayout));
        Object.assign(this.root as any, { skillBattleController: this, session, buttons: this.buttons });
    }
    openHubScreen(): void { this.open(); }
    openEncounter(): void { this.open(); }
    openSettlementScreen(): void { this.open(); }
    resizeTo(_view: Laya.GWidget): void { this.root.scale(1, 1); }
    protected resizeLayout(): void {
        if (this.opened) this.refresh();
    }
    suspend(): void {
        this.opened = false; this.busy = false; this.queue = [];
        this.popup?.close();
        this.popup = null; this.modalOpen = false;
        Laya.timer.clearAll(this);
        const numbers = this.labels.numbers;
        if (numbers) Laya.Tween.clearAll(numbers);
    }
    startRun(): void { this.navigate("map"); }
    private open(): void {
        this.opened = true; this.busy = false; this.selected = null; this.selection = null;
        this.overlay = null; this.resetConfirm = false; this.notice = "";
        this.refresh();
        Laya.timer.loop(250, this, this.tick);
    }
    private tick(): void {
        if (!this.opened) return;
        this.run(() => {
            if (this.session.expire() || (this.screen === "battle" && this.session.outcome !== "active")) {
                if (!this.busy) this.navigate("settlement");
            } else {
                const time = this.timeText();
                if (this.labels.upgrades?.visible) this.labels.upgrades.text = time;
                if (this.labels.currency?.visible) this.labels.currency.text = time;
            }
        }, false);
    }
    protected run(fn: () => void, refresh = true): void {
        try { fn(); }
        catch (error) {
            this.notice = (error as Error).message;
            if (this.opened && !refresh) this.refresh();
        }
        if (this.opened && refresh) this.refresh();
    }
    protected format(n: number): string { return String(n); }
    protected command(key: string): void {
        if (this.modalOpen) return;
        this.run(() => {
            if (this.busy) return;
            if (this.resetConfirm) {
                if (key === "resetNo") this.resetConfirm = false;
                if (key === "resetYes") { this.session.resetConfirmed(); this.resetConfirm = false; this.navigate("start"); }
                return;
            }
            if (key === "reset") { this.resetConfirm = true; return; }
            if (key === "newRun") { this.startRun(); return; }
            if (key === "hub" || key === "loot") { this.navigate("start"); return; }
            if (key === "battleReport" || (key === "report" && this.screen !== "start")) {
                this.openReport(); return;
            }
            if (key === "build" && this.screen !== "start") { this.openReport(true); return; }
            if (this.screen === "start") return;
            if (this.screen !== "battle") return;
            if (key === "cancel") { this.selected = null; this.selection = null; this.notice = ""; return; }
            if (key === "confirm") { this.confirm(); return; }
            {
                if(key==="qIntent1" && this.selected?.type==="skill" && this.selected.code==="pierce") {
                    this.select({...this.selected,consumeMark:this.selected.consumeMark===false});return;
                }
                const cleanseIndex=["qIntent1","qIntent2","qIntent3","qIntent4"].indexOf(key);
                if(cleanseIndex>=0 && this.selected?.type==="skill" && ["cleanse","frostheal"].includes(this.selected.code)) {
                    const types=[...new Set(this.session.state.combat.p.statuses.map(s=>s.type))];
                    const type=types[cleanseIndex];if(!type)return;
                    let chosen=(this.selected.cleanseTypes||[]).slice();
                    if(chosen.includes(type))chosen=chosen.filter(t=>t!==type);
                    else {
                        if(chosen.length>=BY_SKILL[this.selected.code].effect.cleanseTypes)chosen.pop();
                        chosen.push(type);
                    }
                    this.select({...this.selected,cleanseTypes:chosen});return;
                }
                const i=this.qKeys.indexOf(key);
                if(i>=0) {
                    const code=i===0?"basic":i===1?"guard":this.session.state?.combat.build.skills[i-2];
                    if(code){
                        const skill=BY_SKILL[code],types=[...new Set(this.session.state.combat.p.statuses.map(s=>s.type))];
                        this.select(i<2?{type:code as "basic"|"guard"}:{type:"skill",code,target:0,
                            ...(skill.effect.cleanseTypes?{cleanseTypes:types.slice(0,skill.effect.cleanseTypes)}:{})});
                    }
                    return;
                }
            }
            if (/^pouch[0-4]$/.test(key)) {
                const item = this.session.state!.pouch[Number(key.slice(5))];
                if (item) this.select({ type: "potion", itemUid: item.itemUid });
            }
        });
    }
    private select(action: BattleAction): void {
        this.selected = action;
        this.selection = this.session.preview(action);
        this.notice = this.selection.ok === false ? this.selection.reason : "";
    }
    private confirm(): void {
        if (!this.selected || !this.selection?.ok) return;
        const result = this.session.confirm(this.selected, this.selection.preview.token);
        if (result.ok === false) {
            this.notice = result.reason; this.selection = null; this.selected = null; return;
        }
        this.selected = null; this.selection = null; this.notice = "";
        this.queue = result.events.slice(); this.busy = true;
        this.refresh(); this.playNext();
    }
    private playNext(): void {
        const f=(n:number)=>this.format(n);
        if (!this.opened) return;
        const event = this.queue.shift();
        if (!event) {
            this.busy = false; this.refresh();
            if (this.session.outcome !== "active") this.navigate("settlement");
            return;
        }
        if (event.type === "damage") {
            const numbers = this.labels.numbers;
            numbers.visible = true; numbers.text = `-${f(event.hpLoss)}${event.absorbed ? `  盾 -${f(event.absorbed)}` : ""}`;
            numbers.color = event.target === "player" ? colors.red : colors.gold;
            numbers.fontSize = 24; placeInDesign(numbers, this.root, event.target === "player" ? 140 : 850, 300); numbers.alpha = 1;
            Laya.Tween.clearAll(numbers);
            Laya.Tween.to(numbers, { y: numbers.y - 40, alpha: 0 }, 280);
            this.text("event", this.eventText(event), 400, 348, 600, 48, 18, colors.gold);
        }
        Laya.timer.once(event.type === "damage" ? 300 : 20, this, this.playNext);
    }
    refresh(): void {
        if (this.resetConfirm) { this.renderReset(); return; }
        if (this.overlay) { this.renderOverlay(); return; }
        for (const key of Object.keys(this.elements)) this.elements[key].visible = key === "screenBackground";
        if (this.screen === "start") this.renderStart();
        else if (this.screen === "battle") this.renderBattle();
        else this.renderSettlement();
    }
    protected text(key: string, value: string, x: number, y: number, w: number, h: number,
        fontSize = 20, color: string = colors.text): void {
        const label = this.labels[key];
        if (!label) throw new Error(`预制缺少文本 ${key}`);
        label.visible = true; placeInDesign(label, this.root, x, y); label.size(w, h);
        label.text = value; label.fontSize = fontSize; label.color = color;
        label.textIns.color = color; label.textIns.wordWrap = true;
    }
    protected button(key: string, value: string, x: number, y: number, w: number, h = 54,
        enabled = true, selected = false): void {
        const button = this.buttons[key];
        if (!button) throw new Error(`预制缺少按钮 ${key}`);
        button.visible = true; placeInDesign(button, this.root, x, y); button.size(w, h); button.alpha = enabled ? 1 : 0.48;
        button.mouseEnabled = enabled;
        button.graphics.clear();
        button.graphics.drawRect(0, 0, w, h, selected ? "#314e3e" : colors.fill,
            selected ? colors.gold : colors.line, selected ? 2 : 1);
        const label = this.buttonLabel(key);
        label.pos(6, 4); label.size(w - 12, h - 8); label.text = value; label.fontSize = 18;
        label.color = selected ? colors.gold : colors.text;
        label.textIns.color = label.color; label.textIns.wordWrap = true;
    }
    private buttonLabel(key: string): Laya.GTextField {
        const label = this.labels[`txt_${key}`];
        if (!label) throw new Error(`按钮文本未绑定：${key}`);
        return label;
    }
    protected backdrop(): void {
        const result = this.elements.result;
        result.visible = true; result.graphics.clear();
        const origin = result.globalToLocal(this.viewport.localToGlobal(new Laya.Point()));
        result.graphics.drawRect(origin.x, origin.y, this.viewport.width, this.viewport.height, "rgba(12,20,16,0.88)");
    }
    protected timeText(): string {
        if (!this.session.snapshot) return "单场试炼";
        const s = Math.ceil(this.session.remainingMs / 1000);
        return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
    }
    protected renderStart(): void { this.navigate("map"); }
    protected renderBattle(): void {
        if (!this.session.record) { this.navigate("start"); return; }
        this.renderCombat();
    }
    private renderCombat(): void {
        const record=this.session.record,s=record.state,c=s.combat,e=c.enemies[0],a=BattleRules.attributes(record.setup,s);
        const enabled=!this.busy&&s.phase==="player_input";
        this.text("brand","末法寻仙 · 秘境斗法",24,12,380,48,26,colors.gold);
        this.text("round",`第 ${c.round} 回合 · 一次行动`,420,16,350,44,23);
        this.text("upgrades",this.timeText(),800,16,200,44,20,colors.muted);
        this.text("playerName","散修",30,110,320,40,26);
        this.text("playerHp",`生命 ${s.player.hp} / ${s.player.maxHp}`,30,158,340,36,22,colors.jade);
        this.bar("playerHpBar",s.player.hp/s.player.maxHp,30,198,340,colors.jade);
        this.text("playerBlock",`灵力 ${s.player.mp} / ${s.player.maxMp}`,30,214,340,36,22,colors.blue);
        this.text("durability",`物攻 ${a.attack} · 精神 ${a.spirit}\n护甲 ${a.defense} · 速度 ${a.speed}\n`+
            `流血 ${layers(c.p,"bleed")} · 灼烧 ${layers(c.p,"burn")} · 寒意 ${layers(c.p,"chill")} · 雷印 ${layers(c.p,"mark")}`,
            30,254,340,78,17,colors.muted);
        this.text("enemyName",e.name,880,150,330,36,24);
        this.text("enemyHp",`${s.enemy.hp} / ${s.enemy.maxHp}`,880,190,330,32,22,colors.red);
        this.bar("enemyHpBar",s.enemy.hp/s.enemy.maxHp,880,228,330,colors.red);
        this.text("enemyBlock",`护盾 ${e.shield} · 法力 ${e.mp}/${e.maxMp}\n护甲 ${e.armor}${e.sunderUntil>=c.round?"（破甲）":""} · 速度 ${e.speed}`,
            880,242,330,64,18,colors.gold);
        const code=intent(e,c.round+(e.speed>c.p.speed?1:0));
        const names={strike:"普攻",flurry:"连击",heavy:"重击",bolt:"灵弹",ignite:"点火",frost:"寒霜",charge:"蓄力",
            slam:"重砸",storm:"雷暴",guard:"防御",ward:"结界",mend:"疗伤",purify:"净化",drain:"噬血"};
        this.text("intent",`下一行动：${names[code]||code}${e.charged?" · 已蓄力":""}\n${e.speed>c.p.speed?"敌方先手":"我方先手"}${e.phase?" · 半血强化":""}`,410,116,440,72,20,colors.red);
        this.text("interrupt",`流血 ${layers(e,"bleed")} · 灼烧 ${layers(e,"burn")}\n寒意 ${layers(e,"chill")} · 雷印 ${layers(e,"mark")}`,
            410,204,440,68,18,colors.blue);
        this.drawActors(String(record.setup.enemyId));
        this.text("event",this.notice||(this.busy?"结算中":""),410,345,440,42,17,colors.gold);
        const mechanics=[`护盾 ${c.p.shield} · 本回合${s.potionUsed?"已用药":"可用药"}`,
            ...s.equipment.map(g=>`${g.name} ${g.instance.durability}/${g.instance.maxDurability}\n${g.instance.trait.name}${g.instance.kills?` · 击杀 ${g.instance.kills}`:""}`)];
        this.text("qi",mechanics.join("\n"),30,442,370,160,16,colors.gold);
        const result=this.selection?.ok?this.selection:null,p=result?.preview,next=result?.state;
        this.text("previewTitle",p?p.name:"选择招式",440,396,560,30,20,colors.jade);
        const detail=!p?this.notice:p.potion?
            (p.resource==="shield"?`护盾 +${p.shield}`:p.resource==="mixed"?
                `恢复生命 ${p.recovery} · 灵力 ${p.secondaryRecovery}`:`恢复${p.resource==="hp"?"生命":"灵力"} ${p.recovery}`)+
                "\n不消耗行动":
            `敌生命 -${p.enemyHpLoss} · 自身承伤 ${p.playerHpLoss}\n`+
            `法力 ${s.player.mp} → ${next.player.mp} · 护盾 ${next.player.block}\n`+
            (p.durabilityCost?`战后耐久合计 -${p.durabilityCost}`:`下一回合 ${next.round}`);
        this.text("preview",detail,440,432,560,100,17);
        this.qKeys.forEach((key,i)=>{
            const code=i===0?"basic":i===1?"guard":c.build.skills[i-2],skill=BY_SKILL[code];
            const action:BattleAction=i<2?{type:code as "basic"|"guard"}:{type:"skill",code,target:0};
            const cd=Math.max(0,(c.p.cds[code]??0)-c.p.turns);
            this.button(key,skill?`${skill.name}${i>=2?`\n${skillCost(c,code)} 法力${cd?` · 冷却${cd}`:""}`:""}`:"空技能位",
                30+i*170,614,160,76,enabled&&!!skill,
                this.selected?.type==="skill"?this.selected.code===code:this.selected?.type===code);
            this.buttons[key].tooltips=skill?.description||"";
            if(enabled&&skill&&!BattleRules.resolve(record.setup,s,action).ok)this.buttons[key].alpha=0.45;
        });
        if(this.selected?.type==="skill"&&this.selected.code==="pierce")
            this.button("qIntent1",this.selected.consumeMark===false?"保留雷印":"消耗雷印穿甲",410,292,200,42,enabled);
        if(this.selected?.type==="skill"&&["cleanse","frostheal"].includes(this.selected.code)){
            const types=[...new Set(c.p.statuses.map(s=>s.type))],names={bleed:"流血",burn:"灼烧",chill:"寒意",mark:"雷印"};
            types.forEach((type:StatusType,i)=>
                this.button(`qIntent${i+1}`,`净化${names[type]}`,410+i%2*212,282+Math.floor(i/2)*44,202,40,enabled,
                    this.selected.type==="skill"&&this.selected.cleanseTypes?.includes(type)));
        }
        for(let i=0;i<5;i++) {
            const item=s.pouch[i],potion=item&&record.setup.potions.find(p=>p.itemId===item.itemId);
            this.button(`pouch${i}`,potion?`${potion.name}\n${potion.resource==="mixed"?`血${potion.amount} 蓝${potion.secondaryAmount}`:
                `${potion.resource==="shield"?"盾":potion.resource==="hp"?"血":"蓝"} +${potion.amount}`}`:"空",
                440+i*112,540,102,62,enabled&&!!item&&!s.potionUsed,
                this.selected?.type==="potion"&&this.selected.itemUid===item?.itemUid);
        }
        this.button("confirm",p?.potion?"确认用药":"确认行动",1034,540,176,62,enabled&&!!p,true);
        this.button("cancel","取消",1034,474,176,54,enabled&&!!this.selected);
        this.button("battleReport","战斗记录",1034,24,176);
        this.button("build","构筑",1034,88,176);
    }
    protected renderSettlement(): void {
        const f=(n:number)=>this.format(n);
        this.backdrop();
        const record = this.session.record, s = record?.state;
        this.text("overlayBrand", "末法寻仙", 32, 20, 420, 44, 26, colors.gold);
        this.text("resultTitle", { victory: "试炼胜利", defeat: "试炼失败", timeout: "试炼超时",
            active: "试炼进行中", empty: "暂无试炼" }[this.session.outcome], 290, 88, 700, 58, 32, colors.gold);
        this.text("resultDetail", s ? `生命 ${f(s.player.hp)}/${f(s.player.maxHp)}    灵力 ${f(s.player.mp)}/${f(s.player.maxMp)}\n耐久 ${s.weapon ? `${s.weapon.durability}/${s.weapon.maxDurability}` : "无武器"}    主行动 ${s.mainActions}    用药 ${record!.actions.filter(row => row.action.type === "potion").length}`
            : "", 200, 190, 880, 110, 24);
        this.text("section", record ? `${record.setup.enemy.name}    第 ${this.session.records.length} 场` : "",
            170, 340, 940, 40, 22, colors.jade);
        this.text("overlayMessage", this.notice, 170, 470, 940, 70, 18, colors.red);
        this.button("report", "战斗记录", 170, 600, 240, 54, !!record);
        this.button("lootClose", "继续试炼", 490, 600, 290, 54,
            this.session.outcome === "victory" && this.session.remainingMs > 0);
        this.button("hub", "返回据点", 860, 600, 240);
    }
    protected renderReset(): void {
        this.requestConfirmation("清除本次试炼？", "仅清除当前试炼档，其他存档保留。", () => {
            this.session.resetConfirmed(); this.resetConfirm = false; this.navigate("start");
        }, "确认清除");
    }
    protected requestConfirmation(title: string, detail: string, confirm: () => void, confirmText = "确认"): void {
        if (this.modalOpen || !this.opened) return;
        this.modalOpen = true;
        this.popup = UIManager.ins().openForm(SkillBattleConfirmView, {
            title, detail, confirmText, confirm,
            closed: () => {
                this.modalOpen = false; this.popup = null; this.resetConfirm = false;
                if (this.opened) this.refresh();
            },
        });
    }
    protected openReport(build = false): void {
        this.overlay = build ? "build" : "log";
        this.renderOverlay();
    }
    protected renderOverlay(): void {
        if (this.modalOpen || !this.opened) return;
        const build = this.overlay === "build";
        const records = (build ? [this.session.record].filter(Boolean) : this.session.records).map((record,index) => {
            let lines: string[] = [];
            lines=build?[...record.setup.skills.map(k=>`${BY_SKILL[k].name} · ${BY_SKILL[k].description}`),
                ...record.state.equipment.map(g=>`${g.name} · ${traitDescription(g.instance)}`)]:record.state.combat.log.slice();
            return { title: build ? record.setup.enemy.name : `第 ${index + 1} 场 · ${record.setup.enemy.name}`, lines };
        });
        this.modalOpen = true;
        this.popup = UIManager.ins().openForm(build ? SkillBattleBuildInfoView : SkillBattleReportView, {
            title: build ? "当前构筑" : "战斗记录", records,
            closed: () => {
                this.overlay = null; this.modalOpen = false; this.popup = null;
                if (this.opened) this.refresh();
            },
        });
    }
    private eventText(event: BattleEvent): string {
        const f=(n:number)=>this.format(n);
        if (event.type === "damage") return `${{ body: "本体", enemy: "敌方" }[event.part]}  ${f(event.amount)}    抵盾 ${f(event.absorbed)}    扣血 ${f(event.hpLoss)}`;
        return "";
    }
    private bar(key: string, ratio: number, x: number, y: number, width: number, color: string): void {
        const bar = this.elements[key]; bar.visible = true; placeInDesign(bar, this.root, x, y); bar.size(width, 8);
        bar.graphics.clear(); bar.graphics.drawRect(0, 0, width, 8, "#39443c");
        if (ratio > 0) bar.graphics.drawRect(0, 0, width * ratio, 8, color);
    }
    private drawActors(enemyCode: string): void {
        const player = this.elements.player, enemy = this.elements.enemy;
        player.visible = enemy.visible = true;
        placeInDesign(player, this.root, 250, 380); placeInDesign(enemy, this.root, 1100, 380);
        player.scale(0.65,0.65);enemy.scale(0.65,0.65);
        for (const actor of [player, enemy]) {
            const g = actor.graphics, isPlayer = actor === player;
            g.clear(); g.drawEllipse(-61, 64, 122, 22, "#18201a", null, 0);
            g.drawPoly(0, 0, [-22,-34, 19,-34, 49,61, 13,70, -43,62],
                isPlayer ? "#a9b9aa" : enemyCode === "thunder" ? "#aa8f68" : "#7e929d", "#dce3d3", 2);
            g.drawPoly(0, 0, [-18,-27, 10,-24, 29,60, -10,64], isPlayer ? "#465f51" : "#414f60");
            g.drawCircle(0, -49, 20, "#c4c9b4");
            g.drawPoly(0, 0, [-23,-49, -17,-72, 13,-74, 24,-51, 9,-56, -4,-43], "#17211c");
            g.drawLine(24, 5, 88, -65, "#d9e3d4", 6); g.drawLine(40, -3, 21, -21, colors.gold, 5);
            if (!isPlayer && enemyCode !== "patrol")
                g.drawPoly(0, 0, [-46,-18, -10,-18, -10,30, -28,48, -46,30], "#9baaaa", colors.gold, 2);
        }
    }
}
