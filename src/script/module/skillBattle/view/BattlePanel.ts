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
import { intent, skillCost } from "../utils/CombatEngine";
import type { StatusType } from "../types/CombatTypes";
import { BattleSpineActor } from "./BattleSpineActor";
import { BattleUISkin } from "./BattleUISkin";

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
    private spinePlayer: BattleSpineActor | null = null;
    private spineEnemy: BattleSpineActor | null = null;
    private spineLoading = false;
    private spineLoadFailed = false;
    private battleSkin: BattleUISkin | null = null;
    private battleSkinLoading = false;
    private pendingActionType: BattleAction["type"] | null = null;
    private battleChromeLayer: Laya.Sprite | null = null;
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
        this.spinePlayer?.pause();
        this.spineEnemy?.pause();
        if (this.battleChromeLayer) this.battleChromeLayer.visible = false;
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
        this.spinePlayer?.resume();
        this.spineEnemy?.resume();
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
        this.pendingActionType = this.selected.type;
        this.selected = null; this.selection = null; this.notice = "";
        this.queue = result.events.slice(); this.busy = true;
        this.refresh(); this.playNext();
    }
    private playNext(): void {
        if (!this.opened) return;
        const event = this.queue.shift();
        if (!event) {
            if (this.session.outcome !== "active") {
                this.busy = false; this.pendingActionType = null; this.refresh();
                this.navigate("settlement");
            } else {
                this.playTurnTransition(() => {
                    this.busy = false; this.pendingActionType = null; this.refresh();
                });
            }
            return;
        }
        if (event.type === "damage") {
            this.playDamageEvent(event);
            return;
        }
        Laya.timer.once(160, this, this.playNext);
    }

    private playDamageEvent(event: Extract<BattleEvent, { type: "damage" }>): void {
        const isEnemyTarget = event.target === "enemy";
        if (isEnemyTarget) {
            this.spinePlayer?.playAttack(this.isSkillAction());
            Laya.timer.once(380, this, () => this.showDamageResult(event, true));
        } else {
            this.spineEnemy?.playAttack();
            Laya.timer.once(420, this, () => this.showDamageResult(event, false));
        }
    }

    private showDamageResult(event: Extract<BattleEvent, { type: "damage" }>, enemyTarget: boolean): void {
        if (enemyTarget) this.spineEnemy?.playHit();
        else this.spinePlayer?.playHit();
        const f = (n: number) => this.format(n);
        const numbers = this.labels.numbers;
        numbers.visible = true;
        numbers.text = `-${f(event.hpLoss)}${event.absorbed ? `  盾 -${f(event.absorbed)}` : ""}`;
        numbers.color = enemyTarget ? colors.gold : colors.red;
        numbers.fontSize = 24;
        placeInDesign(numbers, this.root, enemyTarget ? 850 : 140, 300);
        numbers.alpha = 1;
        Laya.Tween.clearAll(numbers);
        Laya.Tween.to(numbers, { y: numbers.y - 40, alpha: 0 }, 280);
        this.text("event", this.eventText(event), 400, 348, 600, 48, 18, colors.gold);
        Laya.timer.once(900, this, this.playNext);
    }

    private playTurnTransition(onComplete: () => void): void {
        const label = this.labels.event;
        const nextRound = this.session.state?.round ?? this.session.record?.state.round ?? 0;
        label.visible = true;
        placeInDesign(label, this.root, 390, 236);
        label.size(500, 60);
        label.text = `—— 第 ${nextRound} 回合 ——`;
        label.fontSize = 28;
        label.color = colors.gold;
        label.textIns.color = colors.gold;
        label.align = "center";
        label.alpha = 0;
        Laya.Tween.clearAll(label);
        Laya.Tween.to(label, { alpha: 1 }, 180);
        Laya.timer.once(660, this, () => {
            Laya.Tween.to(label, { alpha: 0 }, 180);
            Laya.timer.once(200, this, onComplete);
        });
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

    private combatButton(key: string, value: string, x: number, y: number, w: number, h: number,
        enabled = true, selected = false, fontSize = 17): void {
        this.button(key, value, x, y, w, h, enabled, selected);
        const button = this.buttons[key];
        button.graphics.clear();
        const texture = this.battleSkin?.texture(
            selected ? "buttonSelected" : enabled ? "buttonNormal" : "buttonDisabled",
        );
        if (texture) {
            button.graphics.draw9Grid(texture, 0, 0, w, h, [8, 8, 8, 8]);
        } else if (selected) {
            button.graphics.drawRoundRect(0, 0, w, h, 6, 6, 6, 6,
                "rgba(37, 72, 55, 0.96)", colors.jade, 2);
            button.graphics.drawRect(1, 1, w - 2, 2, colors.jade);
        } else {
            button.graphics.drawRoundRect(0, 0, w, h, 6, 6, 6, 6,
                enabled ? "rgba(8, 20, 14, 0.58)" : "rgba(8, 16, 12, 0.38)",
                "rgba(139, 164, 147, 0.2)", 1);
            button.graphics.drawLine(4, h - 1, w - 4, h - 1,
                enabled ? "rgba(139, 181, 155, 0.24)" : "rgba(139, 164, 147, 0.1)", 1);
        }
        button.alpha = enabled ? 1 : 0.48;
        const label = this.buttonLabel(key);
        label.pos(6, 3);
        label.size(w - 12, h - 6);
        label.fontSize = fontSize;
        label.align = "center";
        label.valign = "middle";
        label.color = selected ? "#ecfff4" : enabled ? colors.text : colors.muted;
        label.textIns.color = label.color;
        label.textIns.wordWrap = true;
    }

    private statusSummary(statuses: Array<{ type: StatusType }>): string {
        const names: Record<StatusType, string> = { bleed: "流血", burn: "灼烧", chill: "寒意", mark: "雷印" };
        const active = (Object.keys(names) as StatusType[])
            .map(type => ({ name: names[type], count: statuses.filter(status => status.type === type).length }))
            .filter(item => item.count > 0)
            .map(item => `${item.name} ${item.count}`);
        return active.join(" · ");
    }

    private battleContext(): string {
        const inventory = this.session.inventory;
        const battleIndex = Math.max(1, this.session.records.length);
        if (!inventory) return `秘境试炼 · 第 ${battleIndex} 战`;
        const current = inventory.map?.nodes?.find(node => node.id === inventory.node);
        return current ? `${current.name} · 第 ${battleIndex} 战` : `第 ${battleIndex} 战`;
    }

    private ensureBattleSkin(): void {
        if (this.battleSkin || this.battleSkinLoading) return;
        this.battleSkinLoading = true;
        BattleUISkin.load().then(skin => {
            this.battleSkin = skin;
            this.battleSkinLoading = false;
            if (this.opened) this.refresh();
        }).catch((error: unknown) => {
            this.battleSkinLoading = false;
            console.warn("战斗 UI 皮肤加载失败：", error);
        });
    }

    private drawBattleChrome(): void {
        if (!this.battleChromeLayer) {
            this.battleChromeLayer = new Laya.Sprite();
            this.battleChromeLayer.mouseEnabled = false;
            this.root.addChildAt(this.battleChromeLayer, Math.min(1, this.root.numChildren));
        }
        const layer = this.battleChromeLayer;
        layer.visible = true;
        layer.pos(0, 0);
        if (layer.parent) layer.parent.setChildIndex(layer, Math.min(1, layer.parent.numChildren - 1));
        const g = layer.graphics;
        g.clear();
        this.ensureBattleSkin();

        g.drawRect(0, 0, 1280, 34, "rgba(4, 11, 8, 0.68)");
        g.drawRect(0, 34, 1280, 34, "rgba(4, 11, 8, 0.28)");
        g.drawLine(0, 68, 1280, 68, "rgba(195, 188, 151, 0.2)", 1);
        const jade = this.battleSkin?.texture("panelJade");
        const ember = this.battleSkin?.texture("panelEmber");
        const intentTexture = this.battleSkin?.texture("intentPanel");
        const dock = this.battleSkin?.texture("dockPanel");
        const combat = this.session.record?.state.combat;
        const playerStatus = combat ? this.statusSummary(combat.p.statuses) : "";
        const enemyUnit = combat?.enemies[0];
        const enemyStatus = enemyUnit ? this.statusSummary(enemyUnit.statuses) : "";
        const playerPanelHeight = playerStatus ? 124 : 98;
        const enemyPanelHeight = enemyStatus ? 124 : enemyUnit?.shield ? 98 : 70;
        if (jade) g.draw9Grid(jade, 280, 78, 280, playerPanelHeight, [12, 12, 12, 12]);
        else g.drawRoundRect(280, 78, 280, playerPanelHeight, 8, 8, 8, 8,
            "rgba(6, 17, 12, 0.42)", "rgba(145, 172, 151, 0.22)", 1);
        if (ember) g.draw9Grid(ember, 710, 78, 260, enemyPanelHeight, [12, 12, 12, 12]);
        else g.drawRoundRect(710, 78, 260, enemyPanelHeight, 8, 8, 8, 8,
            "rgba(12, 18, 14, 0.4)", "rgba(196, 143, 128, 0.26)", 1);
        if (intentTexture) g.draw9Grid(intentTexture, 980, 150, 280, 68, [12, 12, 12, 12]);
        else g.drawRoundRect(980, 150, 280, 68, 8, 8, 8, 8,
            "rgba(16, 20, 15, 0.54)", "rgba(203, 141, 123, 0.32)", 1);
        if (dock) g.draw9Grid(dock, 0, 500, 1280, 220, [12, 12, 12, 12]);
        else {
            g.drawRect(0, 500, 1280, 66, "rgba(4, 10, 8, 0.58)");
            g.drawRect(0, 566, 1280, 48, "rgba(4, 10, 8, 0.74)");
            g.drawRect(0, 614, 1280, 106, "rgba(4, 10, 8, 0.9)");
        }
        g.drawLine(18, 500, 1262, 500, "rgba(150, 181, 158, 0.42)", 1);
        g.drawLine(280, 78, 344, 78, "rgba(161, 215, 186, 0.66)", 1);
        g.drawLine(280, 78, 280, 128, "rgba(161, 215, 186, 0.44)", 1);
        g.drawLine(710, 78, 774, 78, "rgba(239, 167, 151, 0.58)", 1);
        g.drawLine(970, 78, 970, 128, "rgba(239, 167, 151, 0.38)", 1);
        g.drawLine(36, 500, 1244, 500, "rgba(150, 181, 158, 0.12)", 1);
        g.drawLine(36, 602, 1244, 602, "rgba(150, 181, 158, 0.12)", 1);

        const intentArea = (this.elements.intentArea || this.root.getChildByName("intentArea")) as Laya.GWidget;
        if (intentArea) intentArea.visible = true;
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
        const record=this.session.record,s=record.state,c=s.combat,e=c.enemies[0];
        const enabled=!this.busy&&s.phase==="player_input";
        this.drawBattleChrome();
        this.text("brand",this.battleContext(),28,14,330,40,18,colors.gold);
        this.text("round",`第 ${c.round} 回合 · 一次行动`,470,12,340,42,21);
        this.labels.round.align = "center";
        this.text("upgrades",this.timeText(),924,20,136,30,15,colors.muted);
        this.labels.upgrades.align = "right";

        const playerStatus = this.statusSummary(c.p.statuses);
        this.text("playerName","散修",296,92,150,28,21);
        this.text("playerHp",`${s.player.hp} / ${s.player.maxHp}`,430,95,112,24,16,colors.jade);
        this.labels.playerHp.align = "right";
        this.bar("playerHpBar",s.player.hp/s.player.maxHp,296,126,240,colors.jade);
        this.text("playerBlock",`灵力 ${s.player.mp}/${s.player.maxMp}${c.p.shield ? `    护盾 ${c.p.shield}` : ""}`,
            296,144,240,22,14,colors.blue);
        this.text("durability",playerStatus,296,168,240,24,13,colors.muted);
        this.labels.durability.visible = !!playerStatus;
        this.labels.qi.visible = false;

        this.text("enemyName",e.name,726,92,140,28,21);
        this.text("enemyHp",`${s.enemy.hp} / ${s.enemy.maxHp}`,878,95,76,24,16,colors.red);
        this.labels.enemyHp.align = "right";
        this.bar("enemyHpBar",s.enemy.hp/s.enemy.maxHp,726,126,228,colors.red);
        this.text("enemyBlock",e.shield ? `护盾 ${e.shield}` : "",
            726,144,228,22,14,colors.gold);
        this.labels.enemyBlock.visible = e.shield > 0;
        const enemyStatus = this.statusSummary(e.statuses);
        this.text("interrupt",enemyStatus,726,168,228,24,14,colors.blue);
        this.labels.interrupt.visible = !!enemyStatus;

        const code=intent(e,c.round+(e.speed>c.p.speed?1:0));
        const names={strike:"普攻",flurry:"连击",heavy:"重击",bolt:"灵弹",ignite:"点火",frost:"寒霜",charge:"蓄力",
            slam:"重砸",storm:"雷暴",guard:"防御",ward:"结界",mend:"疗伤",purify:"净化",drain:"噬血"};
        this.text("intent",`敌方意图 · ${names[code]||code}${e.charged?" · 已蓄力":""}\n${e.speed>c.p.speed?"敌方先手":"我方先手"}${e.phase?" · 半血强化":""}`,
            988,154,264,56,16,colors.red);
        this.labels.intent.align = "center";
        this.drawActors(String(record.setup.enemyId));
        const eventNotice = this.notice || (this.busy ? "招式结算中" : "");
        this.text("event",eventNotice,520,552,340,28,16,colors.gold);
        this.labels.event.visible = !!eventNotice;
        this.labels.event.align = "center";

        const result=this.selection?.ok?this.selection:null,p=result?.preview,next=result?.state;
        const previewTitle = !p ? "选择招式" : p.potion ? p.name : `${p.name} · ${p.mpCost} 灵力`;
        this.text("previewTitle",previewTitle,28,510,210,28,17,colors.jade);
        const effects: string[] = [];
        if (p?.potion) {
            if (p.recovery > 0) effects.push(`恢复${p.resource === "hp" ? "气血" : p.resource === "mp" ? "灵力" : "气血"} ${p.recovery}`);
            if (p.secondaryRecovery > 0) effects.push(`灵力 +${p.secondaryRecovery}`);
            if (p.shield > 0) effects.push(`护盾 +${p.shield}`);
            effects.push("不消耗行动");
        } else if (p) {
            if (p.enemyHpLoss > 0) effects.push(`敌方气血 -${p.enemyHpLoss}`);
            if (p.playerHpLoss > 0) effects.push(`自身承伤 ${p.playerHpLoss}`);
            if (p.shield > 0) effects.push(`护盾 +${p.shield}`);
            if (p.recovery > 0) effects.push(`恢复气血 ${p.recovery}`);
            effects.push(`灵力 ${s.player.mp} → ${next.player.mp}`);
            if (p.durabilityCost) effects.push(`耐久 -${p.durabilityCost}`);
        }
        const detail = !p ? this.notice : effects.join(" · ");
        this.text("preview",detail||"点选招式查看伤害、消耗与冷却",250,510,740,28,15);
        this.labels.preview.valign = "middle";
        this.labels.previewTitle.visible = !!p;
        this.labels.preview.visible = !!p;
        const actionEntries: { key: string; label: string; enabled: boolean; selected: boolean; fontSize: number }[] = [];
        for (let i = 0; i < this.qKeys.length; i++) {
            const key = this.qKeys[i];
            const code=i===0?"basic":i===1?"guard":c.build.skills[i-2],skill=BY_SKILL[code];
            const action:BattleAction=i<2?{type:code as "basic"|"guard"}:{type:"skill",code,target:0};
            const cd=Math.max(0,(c.p.cds[code]??0)-c.p.turns);
            if (!skill) {
                this.buttons[key].visible = false;
                continue;
            }
            actionEntries.push({
                key,
                label: `${skill.name}${i>=2?` · ${skillCost(c,code)}灵${cd?` · 冷却${cd}`:""}`:""}`,
                enabled: enabled && !!skill,
                selected: this.selected?.type==="skill"?this.selected.code===code:this.selected?.type===code,
                fontSize: i<2?18:17,
            });
            this.buttons[key].tooltips=skill?.description||"";
            if(enabled&&skill&&!BattleRules.resolve(record.setup,s,action).ok)this.buttons[key].alpha=0.38;
        }
        actionEntries.forEach((entry,index) => {
            this.combatButton(entry.key, entry.label, 28 + index * 172, 620, 164, 72,
                entry.enabled, entry.selected, entry.fontSize);
        });
        if(this.selected?.type==="skill"&&this.selected.code==="pierce")
            this.combatButton("qIntent1",this.selected.consumeMark===false?"保留雷印":"消耗雷印穿甲",508,158,176,34,enabled,false,14);
        if(this.selected?.type==="skill"&&["cleanse","frostheal"].includes(this.selected.code)){
            const types=[...new Set(c.p.statuses.map(s=>s.type))],names={bleed:"流血",burn:"灼烧",chill:"寒意",mark:"雷印"};
            types.forEach((type:StatusType,i)=>
                this.combatButton(`qIntent${i+1}`,`净化${names[type]}`,450+i%2*210,184+Math.floor(i/2)*38,202,34,enabled,
                    this.selected.type==="skill"&&this.selected.cleanseTypes?.includes(type),14));
        }
        let pouchIndex = 0;
        for(let i=0;i<5;i++) {
            const item=s.pouch[i],potion=item&&record.setup.potions.find(p=>p.itemId===item.itemId);
            if (!item) {
                this.buttons[`pouch${i}`].visible = false;
                continue;
            }
            this.combatButton(`pouch${i}`,potion?`${potion.name}\n${potion.resource==="mixed"?`血${potion.amount} 蓝${potion.secondaryAmount}`:
                `${potion.resource==="shield"?"盾":potion.resource==="hp"?"血":"蓝"} +${potion.amount}`}`:"空",
                28+pouchIndex*100,548,92,50,enabled&&!!item&&!s.potionUsed,
                this.selected?.type==="potion"&&this.selected.itemUid===item?.itemUid,14);
            pouchIndex += 1;
        }
        this.combatButton("confirm",p?.potion?"确认用药":"确认行动",1030,548,200,50,enabled&&!!p,true,17);
        this.combatButton("cancel","取消",900,548,104,50,enabled&&!!this.selected,false,15);
        this.buttons.cancel.visible = !!this.selected;
        this.combatButton("battleReport","记录",1082,18,76,30,true,false,13);
        this.combatButton("build","构筑",1162,18,76,30,true,false,13);
    }
    protected renderSettlement(): void {
        const f=(n:number)=>this.format(n);
        if (this.battleChromeLayer) this.battleChromeLayer.visible = false;
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
        const bar = this.elements[key]; bar.visible = true; placeInDesign(bar, this.root, x, y); bar.size(width, 12);
        bar.graphics.clear();
        const frame = this.battleSkin?.texture("barFrame");
        const fill = this.battleSkin?.texture("barHp");
        if (frame) bar.graphics.draw9Grid(frame, 0, 0, width, 12, [3, 3, 3, 3]);
        else bar.graphics.drawRect(0, 0, width, 12, "#39443c");
        if (ratio > 0) {
            if (fill) bar.graphics.draw9Grid(fill, 4, 3, Math.max(6, (width - 8) * ratio), 7, [3, 3, 3, 3]);
            else bar.graphics.drawRect(4, 3, Math.max(6, (width - 8) * ratio), 7, color);
        }
    }
    private drawActors(enemyCode: string): void {
        const player = this.elements.player, enemy = this.elements.enemy;
        player.visible = enemy.visible = true;
        placeInDesign(player, this.root, 420, 530); placeInDesign(enemy, this.root, 840, 530);
        player.scale(1, 1); enemy.scale(1, 1);
        if (this.spinePlayer && this.spineEnemy) {
            player.graphics.clear();
            enemy.graphics.clear();
            return;
        }
        this.loadBattleSpine();
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

    private isSkillAction(): boolean {
        return this.pendingActionType === "skill";
    }

    private loadBattleSpine(): void {
        if (this.spineLoading || this.spineLoadFailed) return;
        this.spineLoading = true;
        BattleSpineActor.loadTemplet().then((templet) => {
            this.spineLoading = false;
            if (!this.opened || this.screen !== "battle") return;
            const player = this.elements.player, enemy = this.elements.enemy;
            player.graphics.clear(); enemy.graphics.clear();
            this.spinePlayer = new BattleSpineActor(player, templet, {
                body: "body/skin39",
                head: "head/skin19",
                weapon: "weapon_j/skin1",
            }, {
                width: 235, height: 305, facing: 1,
                idleAnimation: "idle_j", attackAnimation: "attack1_j1",
                skillAnimation: "skill_j", hitAnimation: "hit_j",
            });
            this.spineEnemy = new BattleSpineActor(enemy, templet, {
                body: "body/skin13",
                head: "head/skin57",
                weapon: "weapon_j/skin13",
            }, {
                width: 250, height: 325, facing: -1,
                idleAnimation: "idle_j", attackAnimation: "attack1_j1",
                skillAnimation: "skill_j", hitAnimation: "hit_j",
                faceTint: [0.9, 0.8, 0.72, 1],
            });
        }).catch((error: unknown) => {
            this.spineLoading = false;
            this.spineLoadFailed = true;
            console.warn("战斗 Spine 角色加载失败：", error);
        });
    }
}
