import type { ManualTestView } from "./ManualTestView";
import { ManualTestConfig as C } from "../utils/ManualTestConfig";
import { ManualTestRules as R } from "../utils/ManualTestRules";
import type { ManualMove, ManualTestAction } from "../types/ManualTestTypes";

const color = { bg: "#141d1a", pane: "#1c2824", line: "#46534d", text: "#edf0e8",
    muted: "#a8b8ac", jade: "#9cdbbc", red: "#efb0a2", gold: "#e4ce8e", blue: "#a2cdec" };
const art = "ui/atlas/module/skillBattle/";

/** Native sandbox UI; results and previews are exclusively resolved by the session. */
export class ManualTestPanel {
    readonly session;
    readonly buttons: Record<string, Laya.GWidget> = {};
    readonly labels: Record<string, Laya.GTextField> = {};
    readonly inputs: Record<string, Laya.GTextInput> = {};
    readonly root: Laya.GWidget;
    opened = false;
    private onBack: () => void;
    private selected: ManualTestAction | null = null;
    private tab: "log" | "growth" | "move" | "report" = "log";
    private notice = "";
    private popup: Laya.GWidget | null = null;
    private revision = -1;
    private logPage = 0;
    private width = 1280;
    private height = 720;
    constructor(private readonly view: ManualTestView) {
        this.session = view.session; this.root = view.getElement<Laya.GWidget>("adapter");
        view.view.on(Laya.Event.RESIZE, this, this.resize);
    }
    open(onBack: () => void): void {
        this.onBack = onBack; this.opened = true; this.selected = null; this.notice = ""; this.resize();
    }
    suspend(): void { this.opened = false; this.closeMenu(); Laya.timer.clearAll(this); }
    private resize(): void {
        if (!this.opened) return;
        this.width = this.view.view.width; this.height = this.view.view.height;
        this.root.pos(0, 0).size(this.width, this.height); this.render();
    }
    private clear(): void {
        this.closeMenu(); this.root.destroyChildren();
        for (const map of [this.buttons, this.labels, this.inputs]) for (const key of Object.keys(map)) delete map[key];
    }
    private text(name: string, value: string, x: number, y: number, w: number, h: number,
        fontSize = 18, tint = color.text, parent = this.root): Laya.GTextField {
        const t = new Laya.GTextField(); t.name = name; t.text = value; t.font = "Microsoft YaHei";
        t.fontSize = fontSize; t.color = tint; t.mouseEnabled = false; t.wordWrap = true;
        t.overflow = "shrink"; t.valign = "middle"; t.leading = 4;
        t.pos(x, y).size(w, h); parent.addChild(t); this.labels[name] = t; return t;
    }
    private button(name: string, title: string, x: number, y: number, w: number, h: number,
        click: () => void, selected = false, enabled = true, parent = this.root): Laya.GWidget {
        const b = new Laya.GWidget(); b.name = name; b.pos(x, y).size(w, h);
        b.mouseEnabled = enabled; b.alpha = enabled ? 1 : 0.4;
        b.graphics.drawRect(0, 0, w, h, selected ? "#354f42" : "#26372f", selected ? color.jade : color.line, 1);
        this.text(name + "Text", title, 5, 2, w - 10, h - 4, 17, selected ? color.jade : color.text, b).align = "center";
        parent.addChild(b); this.buttons[name] = b;
        b.on(Laya.Event.CLICK, this, () => { if (this.opened) click(); }); return b;
    }
    private line(x: number, y: number, w: number): void { this.root.graphics.drawLine(x, y, x + w, y, color.line, 1); }
    private input(id: string, value: number, x: number, y: number, w: number, apply: (n: number) => void): void {
        const input = new Laya.GTextInput(); input.name = id; input.pos(x, y).size(w, 28); input.text = String(value);
        input.font = "Microsoft YaHei"; input.fontSize = 16; input.color = color.text;
        input.align = "right"; input.valign = "middle"; input.padding = [2, 8, 2, 4];
        input.restrict = "0-9"; input.maxChars = 10;
        input.graphics.drawRect(0, 0, w, 28, "#101b16", color.line, 1);
        input.on(Laya.Event.INPUT, this, () => {
            apply(input.text.trim() === "" ? NaN : Number(input.text)); this.labels.draftStatus.text = "参数待应用";
        });
        this.root.addChild(input); this.inputs[id] = input;
    }
    private menu(name: string, title: string, rows: { key: any; name: string; }[],
        x: number, y: number, w: number, apply: (value: any) => void, enabled = true): void {
        this.button(name, title + "  v", x, y, w, 30, () => {
            this.closeMenu();
            const veil = new Laya.GWidget(); veil.name = "optionMenu"; veil.size(this.width, this.height);
            veil.mouseEnabled = true; veil.zOrder = 100; veil.on(Laya.Event.CLICK, this, () => this.closeMenu());
            this.root.addChild(veil); this.popup = veil;
            const mh = Math.min(rows.length * 30 + 8, this.height - 40);
            const list = new Laya.GPanel(); list.pos(x, Math.max(12, Math.min(y + 32, this.height - mh - 12))).size(w, mh);
            const scroll = new Laya.Scroller(); scroll.direction = Laya.ScrollDirection.Vertical;
            scroll.barDisplay = Laya.ScrollBarDisplay.Hidden; scroll.touchEffect = Laya.ScrollTouchEffect.On;
            scroll.bouncebackEffect = Laya.ScrollBounceBackEffect.Off; list.scroller = scroll; veil.addChild(list);
            rows.forEach((row, i) => {
                const b = this.button(`option_${i}`, row.name, 0, 4 + i * 30, w, 30,
                    () => { apply(row.key); this.closeMenu(); this.render(); }, false, true, list);
                b.on(Laya.Event.CLICK, this, (event: Laya.Event) => event.stopPropagation());
            });
        }, false, enabled);
    }
    private closeMenu(): void {
        if (!this.popup) return;
        for (const key of Object.keys(this.buttons).filter(k => k.startsWith("option_"))) {
            delete this.buttons[key]; delete this.labels[key + "Text"];
        }
        this.popup.destroy(); this.popup = null;
    }
    private changeGrowth(key: "star" | "rank", direction: number): void {
        const d = this.session.draft;
        if (key === "star") {
            d.star = Math.max(0, Math.min(5, d.star + direction)); d.rank = d.star === 0 ? 0 : Math.max(1, d.rank);
        } else if (d.star) d.rank = Math.max(1, Math.min(6, d.rank + direction));
        this.render();
    }
    private setup(): void {
        const d = this.session.draft, s = this.session.state;
        this.text("manualName", "青冥剑典", 20, 76, 220, 34, 26, color.gold);
        this.text("manualState", C.starThemes[d.star], 20, 112, 220, 26, 16, color.muted);
        for (const [i, key] of (["star", "rank"] as const).entries()) {
            const y = 144 + i * 36;
            this.text(key + "Label", key === "star" ? "星级" : "等阶", 20, y, 50, 30);
            this.button(key + "Down", "-", 80, y, 32, 30, () => this.changeGrowth(key, -1));
            this.text(key + "Value", String(d[key]), 120, y, 60, 30, 20, color.jade).align = "center";
            this.button(key + "Up", "+", 190, y, 32, 30, () => this.changeGrowth(key, 1), false, key === "star" || d.star > 0);
        }
        this.menu("battleCount", d.battles === 1 ? "单场" : `${d.battles}场连战`,
            [1, 10, 12, 15].map(key => ({ key, name: key === 1 ? "单场" : `${key}场连战` })),
            20, 218, 102, key => { d.battles = key; });
        this.menu("enemyStyle", C.styles[d.style], Object.entries(C.styles).map(([key, name]) => ({ key, name })),
            132, 218, 102, value => { d.style = value; });
        this.text("selfHead", "己方", 76, 258, 72, 28, 17, color.jade);
        this.text("enemyHead", "敌方基准", 158, 258, 78, 28, 16, color.red);
        ["hp", "mp", "attack", "defense"].forEach((key, i) => {
            const y = 294 + i * 34;
            this.text(key + "Label", ({ hp: "生命", mp: "法力", attack: "攻击", defense: "防御" })[key], 20, y, 46, 28, 16, color.muted);
            for (const [actor, x] of [["player", 70], ["enemy", 156]] as const)
                this.input(`${actor}_${key}`, d[actor][key], x, y, 78, n => { d[actor][key] = n; });
        });
        this.text("seedLabel", "种子", 20, 432, 45, 28, 16, color.muted);
        this.input("seed", d.seed, 70, 432, 164, n => { d.seed = n; });
        this.text("supplyLabel", "血/蓝药", 20, 468, 50, 28, 14, color.muted);
        this.input("healPotions", d.healPotions, 70, 468, 78, n => { d.healPotions = n; });
        this.input("manaPotions", d.manaPotions, 156, 468, 78, n => { d.manaPotions = n; });
        this.menu("opening", d.openingKind === "auto" ? "起手随剑路" : `本命起手 · ${C.kinds[d.openingKind]}`,
            [{ key: "auto", name: "起手随剑路" }, ...Object.keys(C.kinds).map(key => ({ key, name: `本命起手 · ${C.kinds[key]}` }))],
            20, 504, 214, v => { d.openingKind = v; }, C.has(d, 1, 6));
        this.button("restart", s ? "应用并重开" : "开始演练", 20, 544, 214, 38, () => {
            if (this.session.start()) { this.selected = null; this.logPage = 0; this.notice = ""; }
            else this.notice = this.session.error;
            this.render();
        });
        const canMed = !!s && ["fighting", "reward", "between"].includes(s.phase);
        this.button("heal", `回春丹 ${s?.potions.heal ?? d.healPotions}`, 20, 592, 102, 30,
            () => this.select("heal"), false, canMed);
        this.button("mana", `回灵丹 ${s?.potions.mana ?? d.manaPotions}`, 132, 592, 102, 30,
            () => this.select("mana"), false, canMed);
        this.buttons.heal.tooltips = this.buttons.mana.tooltips = "有限库存，血蓝药每回合共用一次；恢复30%，不耗行动";
        this.text("draftStatus", !s ? "未开始" : JSON.stringify(d) === JSON.stringify(s.setup) ? "参数已应用" : "参数待应用",
            20, 636, 214, 28, 16, color.muted);
        this.text("tuning", "独立原型 · 可调整测试值", 20, 674, 214, 26, 14, color.gold);
    }
    private active(): boolean { return this.session.state?.phase === "fighting"; }
    private select(move: ManualMove, extra: Partial<ManualTestAction> = {}): void {
        this.selected = { move, branch: "normal", ...extra };
        if (move === "fall") this.selected.shadowIds = this.session.state.shadows.filter(x => !this.session.state.delayed?.ids.includes(x.id)).map(x => x.id);
        this.revision = this.session.state?.revision ?? -1; this.notice = ""; this.render();
    }
    private arena(x: number, w: number): void {
        const s = this.session.state;
        if (!s) {
            this.text("emptyArena", "青冥", x, 190, w, 96, 46, color.gold).align = "center";
            this.text("emptyState", `${this.session.draft.star}星${this.session.draft.rank}阶`, x, 290, w, 38, 22, color.muted).align = "center";
            return;
        }
        const half = (w - 24) / 2;
        this.text("playerState", `己方  ${s.player.hp}/${s.player.maxHp}\n法力 ${s.player.mp}/${s.player.maxMp}    护体 ${s.player.shield}`,
            x, 76, half, 66, 18, color.jade);
        this.text("enemyState", `${s.enemy.tier} · ${C.styles[s.enemy.style]}  ${s.enemy.hp}/${s.enemy.maxHp}${s.enemy.exposed ? " · 破绽" : ""}\n法力 ${s.enemy.mp}/${s.enemy.maxMp}    护体 ${s.enemy.shield}`,
            x + half + 24, 76, half, 66, 18, color.red);
        this.bar(x, 148, half, s.player.hp / s.player.maxHp, color.jade);
        this.bar(x + half + 24, 148, half, s.enemy.hp / s.enemy.maxHp, color.red);
        this.text("enemyIntents", s.intentions.length ? s.intentions.map((i, n) =>
            `${n + 1} ${i.label}${i.percent ? ` ${i.percent}%` : ""}${s.suppression[n] ? ` ↓${s.suppression[n]}%` : ""}`).join("  /  ") :
            s.phase === "complete" ? "本局连战完成" : s.phase === "defeat" ? "本局失败" : s.phase === "retreated" ? "已撤离" : "战间休整",
            x, 164, w, 36, 17, color.red);
        this.line(x, 204, w);
        this.text("shadowHead", `剑影 ${s.shadows.length}/3    ${R.array(s) ? R.array(s) + "阵" : ""}`, x, 210, w, 28, 18, color.jade);
        const gap = 10, step = (w - gap * 2) / 3;
        for (let i = 0; i < 3; i++) {
            const shadow = s.shadows[i], a = this.selected, reserved = s.delayed?.ids.includes(shadow?.id);
            const title = shadow ? `${C.kinds[shadow.kind]}影 #${shadow.id}\n${shadow.warm ? "已温养" : "新影"}${reserved ? "\n应剑已预约" :
                s.path === "guard" && shadow.kind === "guard" ? "\n格挡可反击" : ""}` : "空";
            this.button(`shadow_${i}`, title, x + i * (step + gap), 246, step, 80, () => {
                if (a?.move === "fall") {
                    if (a.branch === "absorb") a.shadowIds = [shadow.id];
                    else {
                        const ids = a.shadowIds || [];
                        a.shadowIds = ids.includes(shadow.id) ? ids.filter(id => id !== shadow.id) : [...ids, shadow.id];
                    }
                } else if (a && ["edge", "wind", "guide"].includes(a.move)) a.replacementId = shadow.id;
                this.render();
            }, !!shadow && (a?.move === "fall" ? a.shadowIds?.includes(shadow.id) : a?.replacementId === shadow.id),
            !!shadow && !reserved && !!a && ["edge", "wind", "guide", "fall"].includes(a.move) && this.active());
        }
        this.text("bodyState", `身剑：${s.body ? C.kinds[s.body] + "剑" : "未纳入"}    ` +
            (s.finisherUsed ? "终式已用" : R.finisherReady(s) ? "终式可用" : this.session.state.setup.star === 5 && R.has(s, 5, 6) ? "终式：第3回合起" : ""),
            x, 344, w, 28, 17, color.gold);
        this.text("scheduled", s.delayed ? `应剑：敌第${s.delayed.at}行动前收取 #${s.delayed.ids.join("、#")}` :
            s.enemy.exposed ? "破绽待击：下次本体攻击追加75%攻击穿盾伤害，本回合有效" :
            s.body ? ({ edge: "锋身剑：每回合首次本体攻击追击", guard: "守身剑：温养护体，增强回风", guide: "引身剑：新引影直接温养" })[s.body] : "",
            x, 378, w, 28, 16, color.muted);
        this.line(x, 414, w);
        this.text("pathState", s.path === "none" ? "剑路未定" : C.paths[s.path] +
            (s.upgrades.length ? " · " + s.upgrades.map(k => C.upgrades[k].name).join(" / ") : ""),
            x, 420, w, 30, 17, color.blue);
        if (s.phase === "reward") {
            const route = s.path === "none", sw = (w - 8 * (s.offers.length - 1)) / s.offers.length;
            s.offers.forEach((key, i) => {
                const b = this.button("reward_" + key, route ? C.paths[key] : C.upgrades[key].name,
                    x + i * (sw + 8), 460, sw, 44,
                    () => this.select(route ? "route" : "upgrade", { choice: key }), this.selected?.choice === key);
                b.tooltips = route ? `${C.pathDescriptions[key]}\n后续起手为${C.kinds[key]}影` : C.upgrades[key].description;
            });
        } else if (s.phase === "between") {
            this.button("nextBattle", "下一战  >", x, 460, 148, 38, () => this.select("next"));
        } else this.text("checkpoints", s.phase === "fighting" && s.path !== "none" ? C.pathDescriptions[s.path] :
            "剑路 1战后 / 强化 3、6战后", x, 460, w, 38, 16, color.muted);
        if (["between", "reward"].includes(s.phase)) this.button("retreat", "撤离", x + w - 86, 512, 86, 30, () => this.select("retreat"));
        this.text("totals", `总伤害 ${s.totals.damage}   承伤 ${s.totals.taken}   耗蓝 ${s.totals.mpSpent}`,
            x, 514, w - 96, 28, 16, color.muted);
    }
    private bar(x: number, y: number, w: number, ratio: number, tint: string): void {
        this.root.graphics.drawRect(x, y, w, 5, "#344239");
        if (ratio > 0) this.root.graphics.drawRect(x, y, w * ratio, 5, tint);
    }
    private actionOptions(x: number, y: number): void {
        const a = this.selected, s = this.session.state;
        if (!a || !s) return;
        if (a.move === "fall") {
            const rows = C.branches(s.setup, a.move);
            this.menu("branch", rows.find(b => b.key === (a.branch || "normal"))?.name || "基础", rows, x, y, 148, key => {
                a.branch = key;
                a.shadowIds = s.shadows.filter(v => !s.delayed?.ids.includes(v.id)).map(v => v.id);
                if (key === "absorb") a.shadowIds = a.shadowIds.slice(0, 1);
            });
            this.menu("delayAt", `敌第${a.enemyAction || 1}行动`,
                [1, 2, 3].map(key => ({ key, name: `第${key}行动前` })), x + 158, y, 148, key => { a.enemyAction = key; });
            this.text("selection", `已选 ${(a.shadowIds || []).length} 道`, x + 318, y, 144, 30, 16, color.gold);
        } else if (["edge", "wind", "guide"].includes(a.move) && s.shadows.length === 3) {
            this.menu("replace", a.replacementId ? `替换 #${a.replacementId}` : "选择替换旧影",
                s.shadows.filter(v => !s.delayed?.ids.includes(v.id)).map(v => ({ key: v.id, name: `#${v.id} ${C.kinds[v.kind]}影` })),
                x, y, 200, id => { a.replacementId = id; });
        }
        if (a.move === "guide" && s.path === "guide") this.menu("delayAt", `截脉 · 敌第${a.enemyAction || 1}行动`,
            [1, 2, 3].map(key => ({ key, name: `第${key}行动前` })), x + (s.shadows.length === 3 ? 210 : 0), y, 180,
            key => { a.enemyAction = key; });
    }
    private side(x: number, w: number): void {
        const s = this.session.state;
        (["log", "report", "growth", "move"] as const).forEach((key, i) =>
            this.button(`tab_${key}`, ({ log: "日志", report: "逐战", growth: "成长", move: "招式" })[key],
                x + i * w / 4, 76, w / 4 - 3, 32, () => { this.tab = key; this.render(); }, this.tab === key));
        const bodyY = 122, bodyH = this.height - bodyY - 160;
        const panel = new Laya.GPanel(); panel.name = "detailScroll"; panel.pos(x, bodyY).size(w, bodyH);
        const scroll = new Laya.Scroller(); scroll.direction = Laya.ScrollDirection.Vertical;
        scroll.barDisplay = Laya.ScrollBarDisplay.Hidden; scroll.touchEffect = Laya.ScrollTouchEffect.On;
        scroll.bouncebackEffect = Laya.ScrollBounceBackEffect.Off; panel.scroller = scroll; this.root.addChild(panel);
        let value = "";
        if (this.tab === "log") {
            const logs = s?.logs || [], max = Math.max(0, Math.ceil(logs.length / 18) - 1);
            this.logPage = Math.min(max, this.logPage);
            const end = logs.length - this.logPage * 18;
            value = logs.slice(Math.max(0, end - 18), end).reverse().join("\n\n") || "尚无结算";
            this.button("older", "<", x, this.height - 148, 32, 28, () => { this.logPage++; this.render(); }, false, this.logPage < max).tooltips = "更早日志";
            this.text("logPage", `${this.logPage + 1}/${max + 1}`, x + 38, this.height - 148, w - 76, 28, 15, color.muted).align = "center";
            this.button("newer", ">", x + w - 32, this.height - 148, 32, 28, () => { this.logPage--; this.render(); }, false, this.logPage > 0).tooltips = "更新日志";
        } else if (this.tab === "growth") {
            const d = this.session.draft;
            value = `待测 ${d.star}星${d.rank}阶\n\n` + C.growth.flatMap((rows, i) => rows.map((name, j) =>
                `${C.has(d, i + 1, j + 1) ? "已得" : "未得"} ${i + 1}星${j + 1}阶 · ${name}\n${C.descriptions[i][j]}`)).join("\n\n");
        } else if (this.tab === "report") {
            value = s?.reports.slice().reverse().map(r => `第${r.battle}战 ${r.tier} · ${r.won ? "胜" : "败"}\n` +
                `${r.rounds}回合 / ${r.actions}行动\n生命 ${r.startHp} → ${r.endHp}\n法力 ${r.startMp} → ${r.endMp}\n` +
                `承伤${r.taken} / 耗蓝${r.mpSpent}\n血药${r.healUsed} / 蓝药${r.manaUsed}\n` +
                Object.entries(r.skills).map(([k, n]) => `${C.moves[k]}${n}`).join(" ") + "\n" +
                Object.entries(r.specials).map(([k, n]) => `${C.specialNames[k] || k}${n}`).join(" ")).join("\n\n") || "尚无完整战报";
        } else {
            value = [
                "青锋斩 · 5法力\n90%A伤害，留锋影", "回风式 · 5法力\nH护体，留守影",
                "引星刺 · 6法力\n50%A伤害，留引影", "落青冥 · 8法力\n收取选定的1至3影",
                "锋影收剑：新70%A，温养120%A。\n守影收剑：新70%H，温养120%H。\n引影收剑：30%A；所选敌行动削弱20%/35%，温养影可断蓄力。",
                "破招：有效削弱架盾、治疗、重击，或截断蓄力后，敌露出破绽；下回合首次本体攻击追击75%A穿盾，不叠层、不跨战。",
                "锋路首次青锋催熟旧锋影。守路实际格挡时消耗一道未预约守影，反击50%A+实际格挡量，温养额外35%A。引路引星直接压制所选敌行动。",
                "A为攻击，H为150%防御。护体上限3H，下回合到期。",
                "存留到下一己方回合即温养；满位替换不触发收剑。",
                "万锋：青锋穿盾50%。玄壁：回风+50%H。星罗：引影削弱+10点。三才：收剑伤害/护体+25%。",
                `纳剑即得：锋${C.bodyEntry.edge * 100}%A，守H，引${C.bodyEntry.guide * 100}%A并以温养强度压制所选意图。\n` +
                "锋身剑每回合首次本体攻击+35%A；守每回合开始25%H，回风+35%H；引使新引影直接温养。",
                "本局生命、法力、丹药、剑路和强化跨战保留。",
            ].join("\n\n");
        }
        const text = this.text("detailText", value, 4, 0, w - 10, 100, 16, color.muted, panel);
        text.overflow = "visible"; text.valign = "top"; text.textIns.typeset();
        text.height = Math.max(bodyH, text.textIns.textHeight + 12); panel.mouseThrough = false;
    }
    render(): void {
        if (!this.opened) return;
        this.clear(); this.root.graphics.clear(); this.root.graphics.drawRect(0, 0, this.width, this.height, color.bg);
        this.root.graphics.drawRect(0, 0, 254, this.height, color.pane);
        const right = this.width - 266, center = 276, centerW = right - center - 22;
        this.root.graphics.drawLine(254, 64, 254, this.height, color.line, 1);
        this.root.graphics.drawLine(right - 14, 64, right - 14, this.height - 110, color.line, 1);
        this.text("pageTitle", "功法测试界面", 20, 12, 240, 42, 25, color.gold);
        const s = this.session.state;
        this.text("roundState", s ? `${s.setup.star}星${s.setup.rank}阶  战${s.battle}/${s.setup.battles}  回${s.round}  ` +
            (s.phase === "fighting" ? `行动${s.ap}/3` : ({ reward: "待选奖励", between: "战间", complete: "完成", defeat: "失败", retreated: "撤离" })[s.phase]) :
            "青冥剑典 · 连战演练", center, 14, centerW, 38, 21, s?.phase === "defeat" ? color.red : color.jade);
        this.button("back", "<", this.width - 62, 16, 42, 32, () => { this.view.close(); this.onBack(); }).tooltips = "返回";
        this.button("rogueMode", "肉鸽构筑", this.width - 248, 16, 126, 32, () => this.view.switchMode("rogue"));
        this.button("cancel", "x", this.width - 110, 16, 40, 32, () => {
            this.selected = null; this.notice = ""; this.render();
        }, false, !!this.selected).tooltips = "取消本次选择";
        this.line(0, 64, this.width); this.setup(); this.arena(center, centerW); this.side(right, 246);
        const footerY = this.height - 104; this.line(center, footerY - 8, this.width - center - 20);
        const actions: ManualMove[] = ["basic", "guard", "edge", "wind", "guide", "fall"];
        const step = Math.min(123, (this.width - center - 226) / 6);
        actions.forEach((move, i) => {
            const b = this.button("move_" + move, C.moves[move], center + i * step, footerY + 4, step - 8, 46,
                () => this.select(move), this.selected?.move === move, this.active());
            if (i >= 2) {
                const image = new Laya.GImage(); image.autoSize = false; image.src = art + `skill-${i - 1}.png`;
                image.pos(5, 7).size(30, 30); image.mouseEnabled = false; b.addChild(image);
                this.labels["move_" + move + "Text"].pos(34, 2).size(step - 46, 42);
            }
            b.tooltips = `${C.moves[move]} · 1行动${C.cost(move) ? ` · ${C.cost(move)}法力` : ""}`;
        });
        this.button("endTurn", "结束回合", this.width - 222, footerY + 4, 100, 46, () => this.select("end"), false, this.active());
        const preview = this.selected && s ? this.session.preview(this.selected) : null;
        this.button("confirm", "确认", this.width - 112, footerY + 4, 92, 46, () => this.confirm(), true, !!preview?.ok);
        if (this.selected && s) {
            this.actionOptions(center, footerY - 48);
            this.text("preview", this.notice || (preview.ok ?
                `${C.moves[this.selected.move]}${this.selected.choice ? " · " + (C.paths[this.selected.choice] || C.upgrades[this.selected.choice]?.name) : ""}  ` +
                `伤害+${preview.state.totals.damage - s.totals.damage}  护体+${preview.state.totals.shield - s.totals.shield}` +
                `  承伤+${preview.state.totals.taken - s.totals.taken}  法力${preview.state.player.mp - s.player.mp >= 0 ? "+" : ""}${preview.state.player.mp - s.player.mp}` :
                preview.reason), center, footerY + 58, this.width - center - 20, 36, 16, preview.ok ? color.muted : color.red);
        } else this.text("preview", this.notice, center, footerY + 58, this.width - center - 20, 36, 16, color.red);
    }
    private confirm(): void {
        if (!this.selected) return;
        const result = this.session.commit(this.selected, this.revision); this.notice = result.reason || "";
        if (result.ok) { this.selected = null; this.logPage = 0; }
        this.render();
    }
}
