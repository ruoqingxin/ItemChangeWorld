import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { BattleRules } from "../utils/BattleRules";
import { BattleConfigUtils, NewTrialOptions } from "../utils/BattleConfigUtils";
import { BattleTrialManager } from "../manager/BattleTrialManager";
import type { NewBattleAction, NewBattleEvent, NewBattleResult } from "../types/BattleTypes";
import type { NewTrialRecord } from "../types/BattleTrialTypes";
import { UIManager } from "../../../games/ui/UIManager";
import { SkillBattleConfirmView } from "../../gameplay/view/SkillBattleConfirmView";
import { SkillBattleReportView } from "./SkillBattleReportView";
import { SkillBattleBuildInfoView } from "../../build/view/SkillBattleBuildInfoView";
import { placeInDesign, visitRegion } from "../../gameplay/utils/GameplayLayout";
import type { SkillBattlePage } from "../../gameplay/utils/GameplayLayout";

type Screen = "start" | "battle" | "settlement";
export type NewBattlePanelSession = Pick<BattleTrialManager, "error" | "outcome" | "state" | "record" |
    "remainingMs" | "expire" | "preview" | "confirm" | "resetConfirmed"> &
    { readonly snapshot: unknown; readonly records: NewTrialRecord[] };
const f = (n: number) => BattleRules.format(n);
const colors = { text: "#ecefe7", muted: "#bac3b6", gold: "#e3c98c", jade: "#a1d7ba",
    red: "#efa797", blue: "#9ec9ec", fill: "#1c2924", line: "#7a8876" };

/** A projection of saved results onto the existing UIBaseView / ElementMapper prefabs. */
export class BattlePanel {
    readonly buttons: { [key: string]: Laya.GWidget } = {};
    readonly labels: { [key: string]: Laya.GTextField } = {};
    protected selected: NewBattleAction | null = null;
    protected selection: NewBattleResult | null = null;
    protected notice = "";
    protected opened = false;
    protected busy = false;
    private mode: "actives" | "passives" | "environment" = "actives";
    private selectedSkill = 1;
    protected resetConfirm = false;
    protected overlay: "log" | "build" | null = null;
    private queue: NewBattleEvent[] = [];
    protected root: Laya.GWidget;
    private viewport: Laya.GWidget;
    protected elements: { [key: string]: Laya.GWidget } = {};
    protected modalOpen = false;
    private popup: UIBaseView;
    constructor(view: UIBaseView, readonly session: NewBattlePanelSession, readonly options: NewTrialOptions,
        protected readonly navigate: (screen: SkillBattlePage) => void, readonly screen: Screen,
        readonly pageRole: SkillBattlePage = screen) {
        this.viewport = view.view;
        this.root = view.getElement<Laya.GWidget>("adapter", false) || view.view;
        visitRegion(view, view.view, child => {
            this.elements[child.name] = child;
            if (child.name === "inventoryRoot" || child.name === "expeditionRoot") return false;
            if (child instanceof Laya.GTextField) {
                this.labels[child.name] = child;
                child.color = colors.text;
                child.fontSize = 20;
                child.textIns.bgColor = null as any;
                child.textIns.borderColor = null as any;
            } else if (child.numChildren > 0 && child.getChildAt(0) instanceof Laya.GTextField) {
                this.buttons[child.name] = child;
                return false;
            }
        });
        // Bind through ElementMapper, just like the existing panels.
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
    startRun(): void {
        this.run(() => {
            if (this.session.outcome === "active") { this.navigate("battle"); return; }
            const setup = BattleConfigUtils.read(ConfigUtil.Tables, this.options);
            (this.session as BattleTrialManager).start(setup, this.options.emptyPouch);
            this.navigate("battle");
        });
    }
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
            if (key === "lootClose") { (this.session as BattleTrialManager).continueBattle(); this.navigate("battle"); return; }
            if (key === "battleReport" || (key === "report" && this.screen !== "start")) {
                this.openReport(); return;
            }
            if (key === "build" && this.screen !== "start") { this.openReport(true); return; }
            if (this.screen === "start") { this.configure(key); return; }
            if (this.screen !== "battle") return;
            if (key === "cancel") { this.selected = null; this.selection = null; this.notice = ""; return; }
            if (key === "confirm") { this.confirm(); return; }
            const keys = ["skill1", "skill2", "skill3", "skill4", "upgrade0"];
            const index = keys.indexOf(key);
            if (index >= 0) {
                const build = this.session.record!.setup.build;
                this.select(index === 0 ? { type: "basic" } : index === 1 ? { type: "guard" }
                    : { type: "skill", skillId: build.actives[index - 2].skillId });
            }
            if (/^pouch[0-4]$/.test(key)) {
                const item = this.session.state!.pouch[Number(key.slice(5))];
                if (item) this.select({ type: "potion", itemUid: item.itemUid });
            }
        });
    }
    private configure(key: string): void {
        if (key === "report") this.mode = "actives";
        if (key === "summary") this.mode = "passives";
        if (key === "actions") this.mode = "environment";
        const index = /^warehouse[0-5]$/.test(key) ? Number(key.slice(9)) : -1;
        if (index >= 0 && this.session.outcome !== "active" && !this.session.error) {
            if (this.mode === "actives" && index < 5) {
                const id = ConfigUtil.Tables.new_sword_skill.getDataList()[index].id;
                this.selectedSkill = id;
                const old = this.options.actives.findIndex(row => row.skillId === id);
                if (old >= 0) this.options.actives.splice(old, 1);
                else if (this.options.actives.length >= 3) this.notice = "主动位已满";
                else { this.options.sword = true; this.options.actives.push({ skillId: id, level: 0 }); }
            } else if (this.mode === "passives") {
                const id = ConfigUtil.Tables.new_sword_passive.getDataList()[index].id;
                const old = this.options.passiveIds.indexOf(id);
                if (old >= 0) this.options.passiveIds.splice(old, 1);
                else this.options.passiveIds.push(id);
            } else if (this.mode === "environment") {
                if (index < 3) this.options.enemyId = ConfigUtil.Tables.new_battle_enemy.getDataList()[index].id;
                if (index === 3) this.options.weapon = this.options.weapon === "full" ? "zero"
                    : this.options.weapon === "zero" ? "none" : "full";
                if (index === 4) this.options.sword = !this.options.sword;
                if (index === 5) this.options.emptyPouch = !this.options.emptyPouch;
            }
        }
        if ((key === "previousPage" || key === "nextPage") && this.session.outcome !== "active") {
            const active = this.options.actives.find(row => row.skillId === this.selectedSkill);
            if (active) active.level = Math.max(0, Math.min(5, active.level + (key === "previousPage" ? -1 : 1)));
        }
    }
    private select(action: NewBattleAction): void {
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
        const label = button.getChildAt(0) as Laya.GTextField;
        label.pos(6, 4); label.size(w - 12, h - 8); label.text = value; label.fontSize = 18;
        label.color = selected ? colors.gold : colors.text;
        label.textIns.color = label.color; label.textIns.wordWrap = true;
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
    protected renderStart(): void {
        this.backdrop();
        this.text("overlayBrand", "末法寻仙", 32, 20, 420, 44, 26, colors.gold);
        this.text("currency", this.timeText(), 1000, 24, 248, 40, 20, colors.muted);
        this.text("resultTitle", "剑道试炼", 290, 72, 700, 54, 32);
        const active = this.session.outcome === "active", readable = !this.session.error;
        const names = this.options.actives.map(row => `${ConfigUtil.Tables.new_sword_skill.get(row.skillId)!.name}+${row.level}`);
        this.text("resultDetail", active ? "当前试炼进行中" : `单场测试构筑    ${names.join("  /  ") || "无主动"}`,
            180, 132, 920, 40, 20, colors.muted);
        this.button("report", "主动", 170, 190, 290, 48, true, this.mode === "actives");
        this.button("summary", "被动", 490, 190, 290, 48, true, this.mode === "passives");
        this.button("actions", "环境", 810, 190, 290, 48, true, this.mode === "environment");
        const choose = (i: number, name: string, checked: boolean) => this.button(`warehouse${i}`,
            `${checked ? "[x]" : "[ ]"} ${name}`, 170 + (i % 3) * 320, 278 + Math.floor(i / 3) * 96,
            290, 76, readable && !active, checked);
        if (this.mode === "actives") {
            this.text("section", `主动位 ${this.options.actives.length}/3`, 170, 242, 940, 32, 18, colors.jade);
            ConfigUtil.Tables.new_sword_skill.getDataList().forEach((row, i) => {
                const selected = this.options.actives.find(a => a.skillId === row.id);
                choose(i, `${row.name}${selected ? ` +${selected.level}` : ""}\n灵力 ${row.mp_cost}`, !!selected);
            });
            const chosen = this.options.actives.find(row => row.skillId === this.selectedSkill);
            const skill = ConfigUtil.Tables.new_sword_skill.get(this.selectedSkill)!;
            this.text("choiceTitle", `${skill.name}    +${chosen?.level || 0}`, 170, 474, 540, 40, 20, colors.gold);
            this.button("previousPage", "-", 810, 474, 130, 48, readable && !active && !!chosen && chosen.level > 0);
            this.button("nextPage", "+", 970, 474, 130, 48, readable && !active && !!chosen && chosen.level < 5);
        } else if (this.mode === "passives") {
            this.text("section", `被动 ${this.options.passiveIds.length}/6`, 170, 242, 940, 32, 18, colors.jade);
            ConfigUtil.Tables.new_sword_passive.getDataList().forEach((row, i) =>
                choose(i, row.name, this.options.passiveIds.includes(row.id)));
        } else {
            this.text("section", "试炼条件", 170, 242, 940, 32, 18, colors.jade);
            ConfigUtil.Tables.new_battle_enemy.getDataList().forEach((row, i) =>
                choose(i, `${row.name}\n生命 ${row.hp}`, this.options.enemyId === row.id));
            choose(3, `武器：${{ full: "完整", zero: "零耐久", none: "无" }[this.options.weapon]}`, this.options.weapon !== "none");
            choose(4, "借取剑道", this.options.sword);
            choose(5, this.options.emptyPouch ? "空斗法匣" : "两血药 / 两蓝药", !this.options.emptyPouch);
        }
        this.text("overlayMessage", this.session.error || this.notice, 170, 540, 940, 64, 18, colors.red);
        this.button("newRun", active ? "继续试炼" : "开始试炼", 810, 628, 290, 54, readable);
        this.button("reset", active ? "放弃试炼" : "清除试炼档", 170, 628, 290);
    }
    protected renderBattle(): void {
        const record = this.session.record;
        if (!record) { this.navigate("start"); return; }
        const s = record.state, setup = record.setup, a = BattleRules.attributes(setup, s);
        this.text("brand", setup.earthRules ? "末法寻仙 · 双道试炼" : "末法寻仙 · 剑道试炼", 24, 12, 380, 52, 26, colors.gold);
        this.text("round", `第 ${s.round} 回合`, 420, 16, 250, 46, 24);
        this.text("upgrades", this.timeText(), 750, 16, 250, 46, 20, colors.muted);
        this.text("enemyName", setup.enemy.name, 720, 110, 284, 44, 26);
        this.text("enemyBlock", `护盾 ${f(s.enemy.block)}`, 800, 156, 204, 40, 20, colors.gold);
        this.text("enemyHp", `${f(s.enemy.hp)} / ${f(s.enemy.maxHp)}`, 720, 200, 284, 38);
        const intent = setup.enemy.intents[s.enemy.intentIndex];
        this.text("intent", intent.name, 410, 210, 280, 44, 24, colors.red);
        this.text("interrupt", `${intent.damage ? `伤害 ${f(intent.damage)}` : `得盾 ${f(intent.block)}`}${intent.charging ? " · 蓄力" : ""}`,
            410, 258, 280, 40, 20, colors.muted);
        this.text("event", this.notice || (this.busy ? "结算中" : "主行动前"), 400, 338, 600, 48, 18, colors.gold);
        this.text("playerName", "散修", 80, 410, 320, 42, 26);
        this.text("durability", s.weapon ? `${s.weapon.name} ${s.weapon.durability}/${s.weapon.maxDurability}  攻 ${f(a.attack)} / 防 ${f(a.defense)}`
            : `无武器  攻 ${f(a.attack)} / 防 ${f(a.defense)}`, 30, 460, 390, 40, 18, colors.muted);
        this.text("playerHp", `生命 ${f(s.player.hp)} / ${f(s.player.maxHp)}`, 30, 504, 390, 40, 22, colors.jade);
        this.text("playerBlock", `灵力 ${f(s.player.mp)} / ${f(s.player.maxMp)}`, 30, 554, 390, 40, 22, colors.blue);
        this.text("qi", `剑势 ${s.sword.momentum}/3${s.sword.keen ? " · 锋意" : ""}${s.earth?.power ? " · 磐劲" : ""}\n药品机会：${s.potionUsed ? "已使用" : "可用"}`,
            30, 604, 390, 72, 20, colors.gold);
        this.bar("enemyHpBar", s.enemy.hp / s.enemy.maxHp, 720, 244, 284, colors.red);
        this.bar("playerHpBar", s.player.hp / s.player.maxHp, 30, 546, 370, colors.jade);
        this.drawActors(setup.enemy.id);
        const p = this.selection?.ok ? this.selection.preview : null;
        this.text("previewTitle", p ? p.name : "行动预览", 454, 396, 550, 28, 20, colors.jade);
        let detail = this.notice;
        if (p?.potion) detail = `恢复${p.resource === "hp" ? "生命" : "灵力"} ${f(p.recovery)}${p.shield ? ` · 得盾 ${f(p.shield)}` : ""}\n不占主行动`;
        else if (p) {
            const lines: string[] = [], action = this.selected;
            const ningfeng = action?.type === "skill" &&
                setup.skills.find(row => row.id === action.skillId)?.kind === "ningfeng";
            if (p.body || p.shred || p.shield)
                lines.push(`本体 ${f(p.body)} · 削盾 ${f(p.shred)} · 得盾 ${f(p.shield)}`);
            if (p.keen || p.difeng || p.guanxi)
                lines.push(`锋意 ${f(p.keen)} · 递锋 ${f(p.difeng)} · 贯隙 ${f(p.guanxi)}`);
            if (p.earthBonus || p.commonBonus || p.powerUsed)
                lines.push(`磐劲${p.powerUsed ? "已计入本体" : "未兑现"} · 土道附伤 ${f(p.earthBonus || 0)} · 先机 ${f(p.commonBonus || 0)}`);
            if (p.counter || p.reduction) lines.push(`存活吸盾后反击 ${f(p.counter || 0)} · 本次减伤 ${f(p.reduction || 0)}`);
            if (p.momentumGain) lines.push(`剑势 +${p.momentumGain}${ningfeng ? ` · 本轮锋意 ${p.keenEnhancement}%` : ""}`);
            if (p.mark) lines.push(`剑痕 ${f(p.mark)} × ${p.markTicks}（阶段末）`);
            lines.push(`灵力 -${f(p.mpCost)} · 耐久 -${p.durabilityCost} · 本次承伤 ${f(p.playerHpLoss)}`);
            detail = lines.join("\n");
        }
        this.text("preview", detail, 454, 418, 550, 114, 16, colors.text);
        const enabled = !this.busy && this.session.outcome === "active";
        ["skill1", "skill2", "skill3", "skill4", "upgrade0"].forEach((key, i) => {
            const active = setup.build.actives[i - 2], skill = active && setup.skills.find(row => row.id === active.skillId);
            const action: NewBattleAction | null = i === 0 ? { type: "basic" } : i === 1 ? { type: "guard" }
                : active ? { type: "skill", skillId: active.skillId } : null;
            const available = action ? BattleRules.resolve(setup, s, action).ok : false;
            this.button(key, i === 0 ? "普攻" : i === 1 ? "防御" : skill
                ? `${skill.name} +${active.level}\n灵力 ${f(skill.mpCost)}` : "空主动位",
                454 + i * 152, 614, 144, 76, enabled && !!action,
                !!action && JSON.stringify(action) === JSON.stringify(this.selected));
            if (!available && action && enabled) this.buttons[key].alpha = 0.6;
        });
        for (let i = 0; i < 5; i++) {
            const item = s.pouch[i], potion = item && setup.potions.find(row => row.itemId === item.itemId);
            this.button(`pouch${i}`, potion ? `${potion.resource === "hp" ? "血药" : "蓝药"}\n+${f(potion.amount)}` : "空",
                454 + i * 112, 540, 102, 62, enabled && !!item && !s.potionUsed,
                this.selected?.type === "potion" && this.selected.itemUid === item?.itemUid);
        }
        this.button("confirm", p?.potion ? "确认用药" : "确认行动", 1034, 540, 176, 62, enabled && !!p, true);
        this.button("cancel", "取消", 1034, 474, 176, 54, enabled && !!this.selected);
        this.button("battleReport", "战斗记录", 1034, 24, 176);
        this.button("build", "构筑", 1034, 88, 176);
        this.button("loot", "返回据点", 1034, 152, 176);
    }
    protected renderSettlement(): void {
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
            if (build) {
                lines = [record.setup.build.schools.map(s => s === "earth" ? "土道 · 承岳" : "剑道 · 养锋").join(" / "),
                    ...record.setup.build.actives.map(a => `${record.setup.skills.find(s => s.id === a.skillId)!.name} +${a.level}`),
                    ...record.setup.build.passiveIds.map(id => record.setup.passives.find(row => row.id === id)!.name)];
            } else {
            let state = BattleRules.clone(record.initial);
            for (const row of record.actions) {
                const result = BattleRules.resolve(record.setup, state, row.action);
                if (!result.ok) break;
                lines.push(`第 ${state.round} 回合 · ${result.preview.name}    灵力 ${f(result.state.player.mp)}    生命 ${f(result.state.player.hp)}`);
                lines.push(...result.events.filter(e => e.type === "damage" || e.type === "passive").map(e => this.eventText(e)));
                state = result.state;
            }
            }
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
    private eventText(event: NewBattleEvent): string {
        if (event.type === "damage") return `${{ body: "本体", keen: "锋意", difeng: "递锋", guanxi: "贯隙",
            mark: "剑痕", enemy: "敌方", xianji: "先机", lifeng: "砾锋", zhongyue: "重岳", jieshan: "借山", counter: "返震" }[event.part]}  ${f(event.amount)}    抵盾 ${f(event.absorbed)}    扣血 ${f(event.hpLoss)}`;
        if (event.type === "passive") return event.name;
        return "";
    }
    private bar(key: string, ratio: number, x: number, y: number, width: number, color: string): void {
        const bar = this.elements[key]; bar.visible = true; placeInDesign(bar, this.root, x, y); bar.size(width, 8);
        bar.graphics.clear(); bar.graphics.drawRect(0, 0, width, 8, "#39443c");
        if (ratio > 0) bar.graphics.drawRect(0, 0, width * ratio, 8, color);
    }
    private drawActors(enemyId: number): void {
        const player = this.elements.player, enemy = this.elements.enemy;
        player.visible = enemy.visible = true;
        placeInDesign(player, this.root, 250, 340); placeInDesign(enemy, this.root, 970, 350);
        for (const actor of [player, enemy]) {
            const g = actor.graphics, isPlayer = actor === player;
            g.clear(); g.drawEllipse(-61, 64, 122, 22, "#18201a", null, 0);
            g.drawPoly(0, 0, [-22,-34, 19,-34, 49,61, 13,70, -43,62],
                isPlayer ? "#a9b9aa" : enemyId === 3 ? "#aa8f68" : "#7e929d", "#dce3d3", 2);
            g.drawPoly(0, 0, [-18,-27, 10,-24, 29,60, -10,64], isPlayer ? "#465f51" : "#414f60");
            g.drawCircle(0, -49, 20, "#c4c9b4");
            g.drawPoly(0, 0, [-23,-49, -17,-72, 13,-74, 24,-51, 9,-56, -4,-43], "#17211c");
            g.drawLine(24, 5, 88, -65, "#d9e3d4", 6); g.drawLine(40, -3, 21, -21, colors.gold, 5);
            if (!isPlayer && enemyId !== 1)
                g.drawPoly(0, 0, [-46,-18, -10,-18, -10,30, -28,48, -46,30], "#9baaaa", colors.gold, 2);
        }
    }
}
