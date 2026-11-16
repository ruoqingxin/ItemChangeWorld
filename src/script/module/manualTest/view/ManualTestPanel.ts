import type { ManualTestView } from "./ManualTestView";
import { ManualTestConfig as C } from "../utils/ManualTestConfig";
import { ManualTestRules as R } from "../utils/ManualTestRules";
import type { ManualMove, ManualTestAction, SwordGroup, ShadowKind } from "../types/ManualTestTypes";

const color = { bg: "#141d1a", pane: "#1c2824", line: "#46534d", text: "#edf0e8",
    muted: "#a8b8ac", jade: "#9cdbbc", red: "#efb0a2", gold: "#e4ce8e", blue: "#a2cdec" };
const art = "ui/atlas/module/skillBattle/";

/** Native UIBaseView content. The view projects state; it never calculates combat results. */
export class ManualTestPanel {
    readonly session;
    readonly buttons: Record<string, Laya.GWidget> = {};
    readonly labels: Record<string, Laya.GTextField> = {};
    readonly inputs: Record<string, Laya.GTextInput> = {};
    readonly root: Laya.GWidget;
    opened = false;
    private onBack: () => void;
    private selected: ManualTestAction | null = null;
    private tab: "log" | "growth" | "move" = "log";
    private notice = "";
    private popup: Laya.GWidget | null = null;
    private revision = -1;
    private logPage = 0;
    private width = 1280;
    private height = 720;
    constructor(private readonly view: ManualTestView) {
        this.session = view.session;
        this.root = view.getElement<Laya.GWidget>("adapter");
        view.view.on(Laya.Event.RESIZE, this, this.resize);
    }
    open(onBack: () => void): void {
        this.onBack = onBack; this.opened = true; this.selected = null; this.notice = "";
        this.resize();
    }
    suspend(): void { this.opened = false; this.closeMenu(); Laya.timer.clearAll(this); }
    private resize(): void {
        if (!this.opened) return;
        this.width = this.view.view.width; this.height = this.view.view.height;
        this.root.pos(0, 0).size(this.width, this.height);
        this.render();
    }
    private clear(): void {
        this.closeMenu(); this.root.destroyChildren();
        for (const map of [this.buttons, this.labels, this.inputs]) for (const key of Object.keys(map)) delete map[key];
    }
    private text(name: string, value: string, x: number, y: number, w: number, h: number,
        fontSize = 18, tint = color.text, parent = this.root): Laya.GTextField {
        const t = new Laya.GTextField(); t.name = name; t.text = value; t.font = "Microsoft YaHei";
        t.fontSize = fontSize; t.color = tint; t.mouseEnabled = false;
        t.wordWrap = true; t.overflow = "shrink"; t.valign = "middle"; t.leading = 4;
        t.pos(x, y).size(w, h); parent.addChild(t); this.labels[name] = t; return t;
    }
    private button(name: string, title: string, x: number, y: number, w: number, h: number,
        click: () => void, selected = false, enabled = true, parent = this.root): Laya.GWidget {
        const b = new Laya.GWidget(); b.name = name; b.pos(x, y).size(w, h);
        b.mouseEnabled = enabled; b.alpha = enabled ? 1 : 0.4;
        b.graphics.drawRect(0, 0, w, h, selected ? "#354f42" : "#26372f", selected ? color.jade : color.line, 1);
        const t = this.text(`${name}Text`, title, 5, 2, w - 10, h - 4, 17, selected ? color.jade : color.text, b);
        t.align = "center"; parent.addChild(b); this.buttons[name] = b;
        b.on(Laya.Event.CLICK, this, () => { if (this.opened) click(); });
        return b;
    }
    private line(x: number, y: number, w: number): void {
        this.root.graphics.drawLine(x, y, x + w, y, color.line, 1);
    }
    private input(actor: "player" | "enemy", key: string, x: number, y: number): void {
        const id = `${actor}_${key}`, input = new Laya.GTextInput();
        input.name = id; input.pos(x, y).size(78, 28);
        input.text = String(this.session.draft[actor][key]);
        input.font = "Microsoft YaHei"; input.fontSize = 16; input.color = color.text;
        input.align = "right"; input.valign = "middle"; input.padding = [2, 8, 2, 4];
        input.restrict = "0-9"; input.maxChars = 7;
        input.graphics.drawRect(0, 0, 78, 28, "#101b16", color.line, 1);
        input.on(Laya.Event.INPUT, this, () => {
            this.session.draft[actor][key] = input.text.trim() === "" ? NaN : Number(input.text);
            this.labels.draftStatus.text = "参数待应用";
        });
        this.root.addChild(input); this.inputs[id] = input;
    }
    private menu(name: string, title: string, rows: { key: any; name: string; }[],
        x: number, y: number, w: number, apply: (value: any) => void, enabled = true): void {
        this.button(name, title + "  v", x, y, w, 30, () => {
            this.closeMenu();
            const veil = new Laya.GWidget(); veil.name = "optionMenu"; veil.size(this.width, this.height);
            veil.mouseEnabled = true; veil.zOrder = 100;
            veil.on(Laya.Event.CLICK, this, () => this.closeMenu());
            this.root.addChild(veil); this.popup = veil;
            const mh = Math.min(rows.length * 30 + 8, this.height - 40);
            const top = Math.max(12, Math.min(y + 32, this.height - mh - 12));
            const list = new Laya.GPanel(); list.pos(x, top).size(w, mh);
            const scroll = new Laya.Scroller(); scroll.direction = Laya.ScrollDirection.Vertical;
            scroll.barDisplay = Laya.ScrollBarDisplay.Hidden; scroll.touchEffect = Laya.ScrollTouchEffect.On;
            scroll.bouncebackEffect = Laya.ScrollBounceBackEffect.Off; list.scroller = scroll;
            veil.addChild(list);
            rows.forEach((row, i) => {
                const b = this.button(`option_${i}`, row.name, 0, 4 + i * 30, w, 30,
                    () => { apply(row.key); this.closeMenu(); this.render(); }, false, true, list);
                b.on(Laya.Event.CLICK, this, (event: Laya.Event) => event.stopPropagation());
            });
        }, false, enabled);
    }
    private closeMenu(): void {
        if (this.popup) {
            for (const key of Object.keys(this.buttons).filter(k => k.startsWith("option_"))) {
                delete this.buttons[key]; delete this.labels[key + "Text"];
            }
            this.popup.destroy(); this.popup = null;
        }
    }
    private changeGrowth(key: "star" | "rank", direction: number): void {
        const d = this.session.draft;
        if (key === "star") {
            d.star = Math.max(0, Math.min(5, d.star + direction));
            d.rank = d.star === 0 ? 0 : Math.max(1, d.rank);
        } else if (d.star) d.rank = Math.max(1, Math.min(6, d.rank + direction));
        this.render();
    }
    private setup(): void {
        const d = this.session.draft;
        this.text("manualName", "青冥剑典", 20, 76, 226, 38, 26, color.gold);
        this.text("manualState", C.starThemes[d.star], 20, 114, 226, 28, 16, color.muted);
        for (const [i, key] of (["star", "rank"] as const).entries()) {
            const y = 154 + i * 40;
            this.text(key + "Label", key === "star" ? "星级" : "等阶", 20, y, 50, 30);
            this.button(key + "Down", "-", 80, y, 32, 30, () => this.changeGrowth(key, -1));
            this.text(key + "Value", String(d[key]), 120, y, 60, 30, 20, color.jade).align = "center";
            this.button(key + "Up", "+", 190, y, 32, 30, () => this.changeGrowth(key, 1), false, key === "star" || d.star > 0);
        }
        this.menu("enemyStyle", C.styles[d.style], Object.entries(C.styles).map(([key, name]) => ({ key, name })),
            20, 244, 214, value => { d.style = value; });
        this.text("selfHead", "己方", 85, 286, 70, 26, 17, color.jade);
        this.text("enemyHead", "敌方", 176, 286, 70, 26, 17, color.red);
        ["hp", "mp", "attack", "defense"].forEach((key, i) => {
            const y = 322 + i * 38;
            this.text(key + "Label", ({ hp: "生命", mp: "法力", attack: "攻击", defense: "防御" })[key], 20, y, 46, 28, 16, color.muted);
            this.input("player", key, 70, y); this.inputs["player_" + key].size(78, 28);
            this.input("enemy", key, 156, y); this.inputs["enemy_" + key].size(78, 28);
        });
        this.text("draftStatus", !this.session.state ? "未开始" :
            JSON.stringify(d) === JSON.stringify(this.session.state.setup) ? "参数已应用" : "参数待应用",
            20, 484, 214, 30, 16, color.muted);
        this.button("restart", this.session.state ? "应用并重开" : "开始演练", 20, 522, 214, 42, () => {
            if (this.session.start()) { this.selected = null; this.logPage = 0; this.notice = ""; }
            else this.notice = this.session.error;
            this.render();
        });
        this.button("heal", "回春丹", 20, 576, 102, 34, () => this.select("heal"), false, this.active());
        this.button("mana", "回灵丹", 132, 576, 102, 34, () => this.select("mana"), false, this.active());
        this.buttons.heal.tooltips = this.buttons.mana.tooltips = "每回合共用一次，恢复30%，不耗行动；演练补给无限";
    }
    private active(): boolean { return this.session.state?.outcome === "active"; }
    private select(move: ManualMove): void {
        this.selected = { move, branch: "normal", keep: false };
        this.revision = this.session.state?.revision ?? -1; this.notice = "";
        if (move === "edge" && C.has(this.session.state.setup, 1, 1)) this.selected.branch = "urge";
        this.render();
    }
    private board(x: number, y: number, w: number, name: string, groups: SwordGroup[],
        area: "sky" | "cache", h = 92): void {
        const s = this.session.state;
        this.text(name + "Head", name, x, y, w, 26, 17, area === "sky" ? color.jade : color.blue);
        if (!groups.length) this.text(name + "Empty", "—", x + 8, y + 34, w - 16, h - 36, 20, color.muted);
        const step = Math.min(114, (w - 10) / Math.max(1, groups.length));
        groups.forEach((g, i) => {
            const title = g.members.map(m => C.kinds[m.kind]).join("") +
                `${area === "sky" && i === 0 && R.has(s, 1, 6) ? " · 本命" : ""}\n` +
                g.members.map(m => `${m.age}势`).join(" ") +
                (g.members.every(m => area === "sky" && R.mature(s, g, m)) ? "\n已成锋" : "");
            const b = this.button(`${area}_${g.id}`, title, x + i * step, y + 30, step - 6, h - 32, () => {
                if (this.selected) { this.selected.target = g.id; this.render(); }
            }, this.selected?.target === g.id);
            b.tooltips = `${R.groupName(g)} · ${R.slots(g)}悬\n` + g.members.map(m =>
                `#${m.id} ${C.kinds[m.kind]}影 ${m.age}势`).join("\n");
            this.labels[`${area}_${g.id}Text`].fontSize = 14;
        });
    }
    private arena(x: number, w: number): void {
        const s = this.session.state;
        if (!s) {
            this.text("emptyArena", "青冥", x, 180, w, 96, 46, color.gold).align = "center";
            this.text("emptyState", `${this.session.draft.star}星${this.session.draft.rank}阶`,
                x, 280, w, 38, 22, color.muted).align = "center";
            return;
        }
        const half = (w - 24) / 2;
        this.text("playerState", `己方  ${s.player.hp}/${s.player.maxHp}\n法力 ${s.player.mp}/${s.player.maxMp}    护体 ${s.player.shield}`,
            x, 76, half, 66, 18, color.jade);
        this.text("enemyState", `${C.styles[s.setup.style]}  ${s.enemy.hp}/${s.enemy.maxHp}\n法力 ${s.enemy.mp}/${s.enemy.maxMp}    护体 ${s.enemy.shield}\n剑痕 ${s.marks}/${R.markCap(s)}`,
            x + half + 24, 76, half, 66, 18, color.red);
        this.bar(x, 148, half, s.player.hp / s.player.maxHp, color.jade);
        this.bar(x + half + 24, 148, half, s.enemy.hp / s.enemy.maxHp, color.red);
        this.text("enemyIntents", s.intentions.map((i, n) => `${n + 1} ${i.label}${i.percent ? ` ${i.percent}%` : ""}${i.mpCost ? `/${i.mpCost}蓝` : ""}`).join("   →   "),
            x, 164, w, 36, 17, color.red);
        this.line(x, 204, w);
        this.board(x, 214, w, `青冥  ${R.used(s.sky)}/${R.capacity(s)}悬`, s.sky, "sky", 110);
        this.line(x, 336, w);
        this.text("bodyHead", `身剑  ${s.body.length}/${R.bodyCapacity(s)}    剑元 ${s.energy}/${R.has(s, 4, 6) ? 9 : R.has(s, 4, 4) ? 6 : 0}`,
            x, 344, w, 28, 17, color.gold);
        this.text("bodyState", s.body.length ? s.body.map(m => `${C.kinds[m.kind]}剑 #${m.id}`).join("   /   ") +
            (R.bodyArray(s) ? `    ${R.bodyArray(s)}身阵` : "") : "—", x, 374, w, 28, 17, color.muted);
        const orbit = R.has(s, 5, 4) ? s.finisherUsed ? "    万剑归冥已施展" :
            `    归冥势 ${s.orbit}/${C.orbitNeed}${R.finisherReady(s) ? " · 可施终式" : ""}` : "";
        this.board(x, 412, w, `冥渊  ${R.used(s.cache)}/6悬${orbit}`, s.cache, "cache", 88);
        const appointments = [s.delayed ? `悬落·敌${s.delayed.at}` : "",
            s.ambush !== null ? `伏剑·敌${s.ambushAt}` : "",
            s.pinpoint !== null ? `点破·敌${s.pinpointAt}` : ""].filter(Boolean);
        if (appointments.length) this.text("scheduled", appointments.join("   "), x, 500, w, 24, 16, color.gold);
        this.text("totals", `累计伤害 ${s.totals.damage}    承伤 ${s.totals.taken}    获得护体 ${s.totals.shield}`,
            x, this.height - 194, w, 24, 16, color.muted);
    }
    private bar(x: number, y: number, w: number, ratio: number, tint: string): void {
        this.root.graphics.drawRect(x, y, w, 5, "#344239");
        if (ratio > 0) this.root.graphics.drawRect(x, y, Math.max(0, w * ratio), 5, tint);
    }
    private actionOptions(x: number, y: number, w: number): void {
        const a = this.selected, s = this.session.state;
        if (!a || !s) return;
        const list = C.branches(s.setup, a.move);
        const branchLabel = list.find(b => b.key === a.branch)?.name || "基础";
        this.menu("branch", branchLabel, list.map(b => ({ key: b.key, name: b.name })), x, y, 130,
            branch => { a.branch = branch; a.target = undefined; a.other = undefined; a.enemyAction = undefined; });
        const cache = a.branch === "recall" || a.branch === "reverse";
        const groups = cache ? s.cache : s.sky;
        const requiresTarget = ["copy", "reorder", "swap", "split", "ambush", "pluck", "pinpoint", "recall", "reverse"].includes(a.branch);
        if (requiresTarget && a.branch !== "copy") {
            const options = groups.map(g => ({ key: g.id, name: R.groupName(g) }));
            if (a.branch === "reorder") options.unshift({ key: 0, name: "本次新守影" });
            const g = groups.find(g => g.id === a.target);
            this.menu("target", a.target === 0 ? "新守影" : g ? R.groupName(g) : "目标剑组", options,
                x + 140, y, 160, value => { a.target = value; }, options.length > 0);
        }
        if (["swap", "recall", "reverse"].includes(a.branch)) {
            this.menu("other", a.other ? `替换／交换 #${a.other}` : "替换／交换", s.sky.map(g => ({ key: g.id, name: R.groupName(g) })),
                x + 310, y, 150, value => { a.other = value; }, s.sky.length > 0);
        }
        if (a.branch === "copy") this.menu("copyKind", C.kinds[a.kind] || "摹写类型",
            (["edge", "guard", "guide"] as ShadowKind[]).map(key => ({ key, name: C.kinds[key] + "影" })),
            x + 140, y, 160, value => { a.kind = value; });
        const appointment = ["delay", "ambush", "pinpoint"].includes(a.branch);
        if (appointment) this.menu("delayAt", `敌第${a.enemyAction || 1}行动`,
            [1, 2, 3].map(key => ({ key, name: `第${key}行动前` })), x + (a.branch === "delay" ? 140 : 310), y, 150,
            value => { a.enemyAction = value; });
        if (appointment && !a.enemyAction) a.enemyAction = 1;
        // Optional operations belong to the selected action, never separate free commands.
        const optional: { key: string; name: string; }[] = [{ key: "none", name: "无附加选择" }];
        if (a.move === "fall" && a.branch !== "finish" && R.has(s, 2, 1)) optional.push({ key: "keep", name: a.keep ? "取消保留本命" : "保留本命" });
        if (a.move === "fall" && a.branch !== "finish" && R.has(s, 4, 1))
            s.sky.flatMap(g => g.members).filter(m => R.canAbsorb(s, m)).forEach(m =>
                optional.push({ key: `absorb:${m.id}`, name: `纳入 ${C.kinds[m.kind]}影#${m.id}` }));
        if (a.move === "edge" && R.has(s, 4, 3)) s.body.forEach(m =>
            optional.push({ key: `member:${m.id}`, name: `出鞘 ${C.kinds[m.kind]}剑#${m.id}` }));
        if (cache) for (let i = 0; i <= s.sky.length; i++)
            optional.push({ key: `slot:${i}`, name: `回升至第${i + 1}组位置` });
        if (["edge", "wind", "guide"].includes(a.move) && R.has(s, 2, 6)) s.sky.forEach(g =>
            optional.push({ key: `form:${g.id}`, name: `以#${g.id}为首成阵` }));
        const title = [a.keep ? "留本命" : "", a.absorb !== undefined ? `纳#${a.absorb}` : "",
            a.form !== undefined ? `成阵#${a.form}` : "", a.member !== undefined ? `出鞘#${a.member}` : "",
            a.slot !== undefined ? `第${a.slot + 1}位` : ""].filter(Boolean).join(" ");
        this.menu("optional", title || "附加选择", optional, x + Math.max(470, w - 185), y, 185, key => {
            if (key === "none") { a.keep = false; delete a.absorb; delete a.form; delete a.member; delete a.slot; }
            else if (key === "keep") a.keep = !a.keep;
            else { const [prop, value] = key.split(":"); a[prop] = Number(value); }
        }, optional.length > 1);
    }
    private side(x: number, w: number): void {
        const s = this.session.state, y = 76;
        (["log", "growth", "move"] as const).forEach((key, i) =>
            this.button(`tab_${key}`, ({ log: "日志", growth: "成长", move: "招式" })[key],
                x + i * w / 3, y, w / 3 - 4, 32, () => { this.tab = key; this.render(); }, this.tab === key));
        const bodyY = y + 46, bodyH = this.height - bodyY - 160;
        const panel = new Laya.GPanel(); panel.name = "detailScroll"; panel.pos(x, bodyY).size(w, bodyH);
        const scroll = new Laya.Scroller(); scroll.direction = Laya.ScrollDirection.Vertical;
        scroll.barDisplay = Laya.ScrollBarDisplay.Hidden; scroll.touchEffect = Laya.ScrollTouchEffect.On;
        scroll.bouncebackEffect = Laya.ScrollBounceBackEffect.Off; panel.scroller = scroll; this.root.addChild(panel);
        let value = "";
        if (this.tab === "log") {
            const logs = s?.logs || [], maxPage = Math.max(0, Math.ceil(logs.length / 18) - 1);
            this.logPage = Math.min(this.logPage, maxPage);
            const end = logs.length - this.logPage * 18;
            value = logs.slice(Math.max(0, end - 18), end).join("\n\n") || "尚无结算";
            this.button("older", "<", x, this.height - 148, 32, 28, () => { this.logPage++; this.render(); }, false, this.logPage < maxPage).tooltips = "更早日志";
            this.text("logPage", `${this.logPage + 1}/${maxPage + 1}`, x + 38, this.height - 148, w - 76, 28, 15, color.muted).align = "center";
            this.button("newer", ">", x + w - 32, this.height - 148, 32, 28, () => { this.logPage--; this.render(); }, false, this.logPage > 0).tooltips = "更新日志";
        } else if (this.tab === "growth") {
            const d = this.session.draft;
            value = `待测 ${d.star}星${d.rank}阶\n四个基础主动已开放\n\n` +
                C.growth.flatMap((rows, i) => rows.map((name, j) =>
                    `${C.has(d, i + 1, j + 1) ? "已得" : "未得"} ${i + 1}星${j + 1}阶 · ${name}\n${C.descriptions[i][j]}`)).join("\n\n");
        } else {
            value = "青锋斩 · 5法力\n100%攻击，留锋影\n\n回风式 · 5法力\n150%防御护体，留守影\n\n引星刺 · 6法力\n50%攻击，叠2痕，留引影\n\n落青冥 · 8法力\n按剑序坠落，不留影\n\n" +
                "锋影：悬停20%攻击\n守影：悬停20%基础护体\n引影：悬停叠1痕\n\n落影：锋60%攻击、守60%基础护体、引30%攻击并叠1痕；每势加10个百分点。\n\n" +
                "普通三势成熟；本命六势成熟。成熟后停止免费悬停与自动应剑。\n首次催锋加一势。成熟影主动落剑额外30个百分点；成熟本命主动收取翻倍，成熟引落续留同类新影。\n\n" +
                "成阵立即阵鸣。万锋青锋穿盾50%；玄壁回风护体增50%；星罗引星叠3痕；三才随留影类型自动余响，与催锋／移剑共享额度。\n\n" +
                "自应：守影在攻击前卸力20%，锋影在攻击后反击，引影截断蓄力、减半架盾／调息；不回应待机。\n\n" +
                "每痕提升衍生伤害10%；余响取悬停数值的一半。\n\n" +
                "身剑：两势纳入。锋强化每轮首次攻击（含普攻）；守入体护体、回合开始温养、回风每把追加35%护体；引保底2痕，首次引星每把使剑首加一势。\n\n" +
                `出体：至少${C.releaseEnergy}剑元，耗尽剑元；每身剑65%攻击，每剑元40%攻击。\n\n` +
                `逆引：额外${C.reverseEnergy}剑元，每回合一次。\n\n` +
                `轮转：每道影每轮首次回升积1归冥势，并按组回元，与落剑／纳剑共用每轮两次。${C.orbitNeed}势且至少三道天影／归影可施终式，每战一次。\n\n` +
                "防御提供护体，不另减伤；测试药每回合共用一次。";
        }
        const text = this.text("detailText", value, 4, 0, w - 10, 100, 16, color.muted, panel);
        text.overflow = "visible"; text.valign = "top";
        text.textIns.typeset(); text.height = Math.max(bodyH, text.textIns.textHeight + 12);
        panel.mouseThrough = false;
    }
    render(): void {
        if (!this.opened) return;
        this.clear(); this.root.graphics.clear();
        this.root.graphics.drawRect(0, 0, this.width, this.height, color.bg);
        this.root.graphics.drawRect(0, 0, 254, this.height, color.pane);
        const right = this.width - 266, center = 276, centerW = right - center - 22;
        this.root.graphics.drawLine(254, 64, 254, this.height, color.line, 1);
        this.root.graphics.drawLine(right - 14, 64, right - 14, this.height - 110, color.line, 1);
        this.text("pageTitle", "功法测试界面", 20, 12, 240, 42, 25, color.gold);
        const s = this.session.state;
        this.text("roundState", s ? `${s.setup.star}星${s.setup.rank}阶    第${s.round}回合    ` +
            (s.outcome === "active" ? `行动 ${s.ap}/3` : s.outcome === "victory" ? "演练胜利" : "演练失败") : "青冥剑典 · 演练",
            center, 14, centerW, 38, 21, s?.outcome === "defeat" ? color.red : color.jade);
        this.button("back", "<", this.width - 62, 16, 42, 32, () => { this.view.close(); this.onBack(); }).tooltips = "返回";
        this.button("cancel", "x", this.width - 110, 16, 40, 32, () => {
            this.selected = null; this.notice = ""; this.render();
        }, false, !!this.selected).tooltips = "取消本次出招选择";
        this.line(0, 64, this.width);
        this.setup(); this.arena(center, centerW); this.side(right, 246);
        const footerY = this.height - 104;
        this.line(center, footerY - 8, this.width - center - 20);
        const actions: ManualMove[] = ["basic", "guard", "edge", "wind", "guide", "fall"];
        const step = Math.min(123, (this.width - center - 226) / 6);
        actions.forEach((move, i) => {
            const b = this.button("move_" + move, C.moves[move], center + i * step, footerY + 4, step - 8, 46,
                () => this.select(move), this.selected?.move === move, this.active());
            if (i >= 2) {
                const image = new Laya.GImage(); image.autoSize = false; image.src = art + `skill-${i - 1}.png`;
                image.pos(5, 7).size(30, 30); image.mouseEnabled = false; b.addChild(image);
                const label = this.labels["move_" + move + "Text"]; label.pos(34, 2).size(step - 46, 42);
            }
            b.tooltips = `${C.moves[move]} · 1行动${C.cost(move) ? ` · ${C.cost(move)}法力` : ""}`;
        });
        this.button("endTurn", "结束回合", this.width - 222, footerY + 4, 100, 46, () => this.select("end"), false, this.active());
        this.button("confirm", "出招", this.width - 112, footerY + 4, 92, 46, () => this.confirm(), true,
            this.active() && !!this.selected && this.session.preview(this.selected).ok);
        if (this.selected && s) {
            this.actionOptions(center, footerY - 48, centerW);
            const preview = this.session.preview(this.selected);
            const delta = preview.ok ? `伤害 +${preview.state.totals.damage - s.totals.damage}   护体 +${preview.state.totals.shield - s.totals.shield}` +
                (this.selected.branch === "reverse" ? `   消耗${C.reverseEnergy}剑元` : "") +
                (this.selected.branch === "release" ? `   消耗${s.energy}剑元` : "") +
                (preview.state.round > s.round ? `   敌方承接回合，承伤 +${preview.state.totals.taken - s.totals.taken}` : "") : preview.reason;
            this.text("preview", this.notice || delta, center, footerY + 58, this.width - center - 20, 36, 16, preview.ok ? color.muted : color.red);
            this.buttons.confirm.mouseEnabled = this.active() && preview.ok;
            this.buttons.confirm.alpha = this.buttons.confirm.mouseEnabled ? 1 : 0.4;
        } else this.text("preview", this.notice || "", center, footerY + 58, this.width - center - 20, 36, 16, color.red);
    }
    private confirm(): void {
        if (!this.selected) return;
        const result = this.session.commit(this.selected, this.revision);
        this.notice = result.reason || "";
        if (result.ok) { this.selected = null; this.logPage = 0; }
        this.render();
    }
}
