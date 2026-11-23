import { UIManager } from "../../../games/ui/UIManager";
import { EnemyPickerView } from "./EnemyPickerView";
import { TrialOptionPickerView } from "./TrialOptionPickerView";
import { WeaponTrialRules as W } from "../../skillBattle/utils/WeaponTrialRules";
import { WeaponTrialConfig } from "../utils/WeaponTrialConfig";
import { EquipmentTrialRules as G } from "../../skillBattle/utils/EquipmentTrialRules";
import type { EquipmentPassive, EquipmentSlot } from "../../skillBattle/types/EquipmentTrialTypes";
import type { WeaponPassiveCode } from "../../skillBattle/types/WeaponTrialTypes";
import type { ManualTestView } from "./ManualTestView";
import type { RogueAction, RogueItem, RogueMove } from "../../skillBattle/types/QingmingTypes";
import { QingmingConfig as C } from "../../skillBattle/utils/QingmingConfig";
import { QingmingRules as R } from "../../skillBattle/utils/QingmingRules";
import { GuzongEnemyRules as E } from "../../skillBattle/utils/GuzongEnemyRules";
import type { RogueTestManager } from "../manager/RogueTestManager";

const colors = { bg: "#171e1d", pane: "#222c29", line: "#48564f", text: "#edf1ee",
    muted: "#b0bdb6", jade: "#9edbb8", gold: "#e3ce91", red: "#f0b5ac", blue: "#a4cfe7" };

export class RogueTestPanel {
    readonly session: RogueTestManager;
    readonly root: Laya.GWidget;
    readonly buttons: Record<string, Laya.GWidget> = {};
    readonly labels: Record<string, Laya.GTextField> = {};
    readonly inputs: Record<string, Laya.GTextInput> = {};
    opened = false;
    private width = 1280;
    private height = 720;
    private onBack: () => void;
    private selected: RogueAction = null;
    private revision = -1;
    private notice = "";
    private tab: "log" | "build" | "pool" | "report" | "enemy" = "log";
    private popup: EnemyPickerView | TrialOptionPickerView = null;
    private trialSlot: "weapon" | EquipmentSlot = "weapon";
    private readonly clicks: Record<string, () => void> = {};
    private readonly changes: Record<string, (n: number) => void> = {};
    private detailScroll: Laya.GPanel;
    private readonly icons: Record<string, Laya.GImage> = {};
    constructor(private readonly view: ManualTestView) {
        this.session = view.rogueSession; this.root = view.getElement<Laya.GWidget>("adapter");
        for (const key of ["preset", "weapon", "quality", "weaponPassive"]) {
            const b = view.getElement<Laya.GWidget>("btn_" + key);
            this.buttons[key] = b;
            this.labels[key + "Text"] = view.getElement<Laya.GTextField>("txt_" + key + "Text");
            b.on(Laya.Event.CLICK, this, () => { if (this.opened) this.clicks[key]?.(); });
        }
        for (const key of ["pressure_relaxed","pressure_standard","pressure_hard","battles_1","battles_12","battles_15","enemyPick","restart","heal","mana","intent_1","intent_2","intent_3","reward_0","reward_1","reward_2","nextBattle","retreat","tab_log","tab_build","tab_pool","tab_report","tab_enemy","cancel","back","endTurn","confirm","move_basic","move_guard","move_edge","move_wind","move_guide","move_fall"]) {
            const b = view.getElement<Laya.GWidget>("btn_" + key);
            this.buttons[key] = b;
            b.on(Laya.Event.CLICK, this, () => { if (this.opened) this.clicks[key]?.(); });
            this.labels[key + "Text"] = view.getElement<Laya.GTextField>("txt_" + key + "Text");
        }
        for (const key of ["manualName","selfHead","enemyHead","hpLabel","mpLabel","attackLabel","defenseLabel","seedLabel","supplyLabel","draftStatus","emptyArena","playerState","enemyState","flyingState","coreState","enemyMechanic","mutationState","passiveState","mechanicState","runOutcome","totals","detailText","pageTitle","roundState","bossForecast","preview"]) this.labels[key] = view.getElement<Laya.GTextField>("txt_" + key);
        for (const key of ["seed","healPotions","manaPotions","player_hp","player_mp","player_attack","player_defense","enemy_hp","enemy_mp","enemy_attack","enemy_defense"]) {
            const input = view.getElement<Laya.GTextInput>("input_" + key);
            this.inputs[key] = input;
            input.restrict = "0-9"; input.maxChars = 10;
            input.on(Laya.Event.INPUT, this, () => {
                this.changes[key]?.(input.text.trim() ? Number(input.text) : NaN);
                this.labels.draftStatus.text = "参数待应用";
            });
        }
        for (const key of ["edge","wind","guide","fall"]) this.icons[key] = view.getElement<Laya.GImage>("img_" + key);
        this.detailScroll = view.getElement<Laya.GPanel>("box_detailScroll");
        const scroll = new Laya.Scroller();
        scroll.direction = Laya.ScrollDirection.Vertical; scroll.barDisplay = Laya.ScrollBarDisplay.Hidden;
        scroll.touchEffect = Laya.ScrollTouchEffect.On; scroll.bouncebackEffect = Laya.ScrollBounceBackEffect.Off;
        this.detailScroll.scroller = scroll;
        view.view.on(Laya.Event.RESIZE, this, this.resize);
    }
    open(onBack: () => void): void {
        this.onBack = onBack; this.opened = true; this.selected = null; this.notice = ""; this.resize();
    }
    suspend(): void { this.closeMenu(); this.opened = false; Laya.timer.clearAll(this); }
    private resize(): void {
        if (!this.opened) return;
        this.width = this.view.view.width; this.height = this.view.view.height;
        this.root.pos(0, 0).size(this.width, this.height); this.render();
    }
    private text(name: string, value: string, x: number, y: number, w: number, h: number,
        size = 17, color = colors.text): Laya.GTextField {
        const t = this.labels[name]; t.visible = true; t.text = value; t.font = "Microsoft YaHei";
        t.fontSize = size; t.color = color; t.wordWrap = true; t.overflow = "shrink"; t.valign = "middle";
        t.leading = 4; t.align = "left"; t.mouseEnabled = false; t.pos(x, y).size(w, h); return t;
    }
    private button(name: string, title: string, x: number, y: number, w: number, h: number,
        click: () => void, selected = false, enabled = true): Laya.GWidget {
        const b = this.buttons[name]; b.visible = true; b.pos(x,y).size(w,h); b.graphics.clear();
        this.clicks[name] = click;
        b.mouseEnabled = enabled; b.alpha = enabled ? 1 : 0.4;
        b.graphics.drawRect(0, 0, w, h, selected ? "#385346" : "#2b3b34", selected ? colors.jade : colors.line, 1);
        this.text(name + "Text", title, 8, 3, w - 16, h - 6, 16, selected ? colors.jade : colors.text).align = "center";
        return b;
    }
    private input(name: string, value: number, x: number, y: number, w: number, apply: (n: number) => void): void {
        const t = this.inputs[name]; t.visible = true; t.pos(x,y).size(w,28); t.text = String(value);
        t.graphics.clear(); this.changes[name] = apply;
        t.font = "Microsoft YaHei"; t.fontSize = 16; t.color = colors.text; t.align = "right"; t.valign = "middle";
        t.padding = [2, 6, 2, 4]; t.restrict = "0-9"; t.maxChars = 10;
        t.graphics.drawRect(0, 0, w, 28, "#151e1a", colors.line, 1);
    }
    private select(move: RogueMove, extra: Partial<RogueAction> = {}): void {
        this.selected = { move, ...extra }; this.revision = this.session.state?.revision ?? -1; this.notice = ""; this.render();
    }
    private closeMenu(): void { this.popup?.close(); this.popup = null; }
    private enemyMenu(): void {
        this.closeMenu();
        this.popup = UIManager.ins().openForm(EnemyPickerView, (key) => {
            this.session.draft.enemyId = key;
            if (key) this.session.draft.battles = 1;
            this.popup = null; this.render();
        });
    }
    private optionMenu(options: string[], current: number, apply: (index: number) => void): void {
        this.closeMenu();
        this.popup = UIManager.ins().openForm(TrialOptionPickerView, options, current, (index: number) => {
            apply(index); this.popup = null; this.render();
        });
    }
    private setup(): void {
        const d = this.session.draft, s = this.session.state;
        this.text("manualName", "青冥剑典", 20, 82, 214, 36, 24, colors.gold);
        Object.entries(C.pressures).forEach(([key, value], i) => {
            const b = this.button("pressure_" + key, value.name, 20 + i * 73, 120, 68, 28,
                () => { d.pressure = key as typeof d.pressure; this.render(); }, d.pressure === key);
            b.tooltips = `连战压力：每过3战，敌生命增加${Math.round(value.hp * 100)}%、攻击增加${Math.round(value.attack * 100)}%；最多3段`;
        });
        this.text("selfHead", "自身基准", 70, 158, 78, 28, 16);
        this.text("enemyHead", "敌方基准", 154, 158, 82, 28, 16, colors.red);
        for (const [i, key] of (["hp", "mp", "attack", "defense"] as const).entries()) {
            const y = 194 + i * 34;
            this.text(key + "Label", ({ hp: "生命", mp: "法力", attack: "攻击", defense: d.armorMitigation ? "护甲" : "防御" })[key], 20, y, 46, 28, 16, colors.muted);
            for (const [actor, x] of [["player", 70], ["enemy", 156]] as const)
                this.input(`${actor}_${key}`, d[actor][key], x, y, 78, n => { d[actor][key] = n; });
        }
        this.text("seedLabel", "种子", 20, 336, 46, 28, 16, colors.muted);
        this.input("seed", d.seed, 70, 336, 164, n => { d.seed = n; });
        [1, 12, 15].forEach((n, i) => this.button(`battles_${n}`, n === 1 ? "单场" : `${n}战`,
            20 + i * 73, 378, 68, 30, () => { d.battles = n; if (n !== 1) d.enemyId = null; this.render(); }, d.battles === n));
        const preset = WeaponTrialConfig.presets.findIndex(p =>
            JSON.stringify(p.player) === JSON.stringify(d.player) && JSON.stringify(p.enemy) === JSON.stringify(d.enemy));
        this.button("preset", `数值·${WeaponTrialConfig.presets[preset]?.name || "自定"} v`, 20, 414, 102, 30,
            () => this.optionMenu(WeaponTrialConfig.presets.map(p => p.name), preset, i => WeaponTrialConfig.apply(d, i)));
        const slot = this.trialSlot, key = `${slot}Trial` as const;
        const bases = slot === "weapon" ? W.bases : G.bases[slot];
        const w = d[key], slotName = {weapon:"武器",armor:"防具",accessory:"饰品"}[slot];
        this.button("weapon", `${slotName}·${w ? bases[w.base-1].name : "空"} v`, 132, 414, 102, 30,
            () => this.optionMenu(["选择武器部位", "选择防具部位", "选择饰品部位", `卸下${slotName}`, ...bases.map(b => b.name)],
                w ? w.base + 3 : 3, i => {
                    if (i < 3) this.trialSlot = (["weapon","armor","accessory"] as const)[i];
                    else if (i === 3) delete d[key];
                    else d[key] = {base:i-3,quality:w?.quality || 3};
                }));
        this.button("quality", `${w ? W.qualities[w.quality - 1] : "品质"} v`, 20, 452, 102, 30,
            () => this.optionMenu(W.qualities.slice(), w.quality - 1, i => { w.quality = i + 1; }), false, !!w);
        const codes: (WeaponPassiveCode | EquipmentPassive)[] = slot === "weapon" ? Object.keys(W.names) as WeaponPassiveCode[] : G.pools[slot];
        const names = {...W.names,...G.names};
        this.button("weaponPassive", `${w?.passive ? names[w.passive] : "随机被动"} v`, 132, 452, 102, 30,
            () => this.optionMenu(["随机被动", ...codes.map(k => names[k])], w?.passive ? codes.indexOf(w.passive) + 1 : 0,
                i => {
                    if (!i) delete w.passive;
                    else if (slot === "weapon") d.weaponTrial.passive = codes[i-1] as WeaponPassiveCode;
                    else d[`${slot}Trial`].passive = codes[i-1] as EquipmentPassive;
                }), false, !!w);
        if (w && Number.isInteger(d.seed) && d.seed > 0)
            this.buttons.weapon.tooltips = slot === "weapon" ? W.describe(W.roll(d.weaponTrial, d.seed)) :
                G.describe(slot, G.roll(slot, d[`${slot}Trial`], d.seed));
        this.button("enemyPick", d.enemyId ? E.enemies[d.enemyId].name + "  v" : "指定古宗敌人  v",
            20, 490, 214, 30, this.enemyMenu.bind(this));
        this.text("supplyLabel", "血/蓝药", 20, 522, 50, 28, 14, colors.muted);
        this.input("healPotions", d.healPotions, 70, 522, 78, n => { d.healPotions = n; });
        this.input("manaPotions", d.manaPotions, 156, 522, 78, n => { d.manaPotions = n; });
        this.button("restart", s ? "应用并重开" : "开始演练", 20, 564, 214, 38, () => {
            this.notice = this.session.start() ? "" : this.session.error; this.selected = null; this.render();
        });
        const live = !!s && ["fighting", "reward", "between"].includes(s.phase);
        this.button("heal", `回春丹 ${s?.potions.heal ?? d.healPotions}`, 20, 616, 102, 30, () => this.select("heal"), false, live);
        this.button("mana", `回灵丹 ${s?.potions.mana ?? d.manaPotions}`, 132, 616, 102, 30, () => this.select("mana"), false, live);
        this.buttons.heal.tooltips = this.buttons.mana.tooltips = "恢复最大值30%；战内占用本回合行动，战间不耗行动";
        this.text("draftStatus", !s ? "未开始" : JSON.stringify(s.setup) === JSON.stringify(d) ? "参数已应用" : "参数待应用",
            20, 666, 214, 26, 15, colors.muted);
    }
    private arena(x: number, w: number): void {
        const s = this.session.state, active = s?.phase === "fighting";
        if (!s) { this.text("emptyArena", "青冥剑典", x, 200, w, 70, 36, colors.gold).align = "center"; return; }
        const half = (w - 20) / 2;
        this.text("playerState", `己方 ${s.player.hp}/${s.player.maxHp} · 攻${G.attack(s)}\n法力 ${s.player.mp}/${s.player.maxMp} · 护甲${G.armor(s)} · 盾${s.player.shield}`,
            x, 82, half, 64, 16, colors.jade);
        this.text("enemyState", `${s.enemy.tier}·${E.title(s)} ${s.enemy.hp}/${s.enemy.maxHp}\n护盾 ${s.enemy.shield} · 剑伤 ${s.wounds}/6`,
            x + half + 20, 82, half, 64, 18, colors.red);
        for (const [actor, offset, tint] of [[s.player, 0, colors.jade], [s.enemy, half + 20, colors.red]] as const) {
            this.root.graphics.drawRect(x + offset, 150, half, 5, "#3e4c44");
            if (actor.hp) this.root.graphics.drawRect(x + offset, 150, half * actor.hp / actor.maxHp, 5, tint);
        }
        const iw = (w - (s.intentions.length - 1) * 8) / Math.max(1, s.intentions.length);
        s.intentions.forEach((intent, i) => {
            const percent = E.percent(s, intent), ratio = 1 - s.suppression[i] / 100;
            const [low, high] = E.range(intent);
            const fallback = intent.maxHpHeal && s.enemy.hp === s.enemy.maxHp;
            const value = intent.kind === "attack" ? W.armorDamage(s.enemy.attack * percent / 100 * ratio, G.armor(s), !!s.setup.armorMitigation) :
                intent.kind === "guard" ? Math.round(s.enemy.defense * percent / 100 * ratio) :
                intent.kind === "heal" ? fallback ? Math.round(s.enemy.defense * ratio) :
                    Math.min(s.enemy.maxHp - s.enemy.hp, intent.maxHpHeal ?
                        Math.floor(s.enemy.maxHp * percent / 100 * ratio) : Math.round(s.enemy.attack * percent / 100 * ratio)) : null;
            const b = this.button("intent_" + (i + 1),
                `${i + 1} · ${fallback ? "满血架盾" : intent.label}${intent.percent ? ` ${fallback ? 100 : low === high ? percent : low + "~" + high}%` : ""}\n` +
                (value == null ? `${intent.mpCost || 0} 法力` :
                    `现${intent.kind === "attack" ? "伤" : intent.kind === "guard" || fallback ? "盾" : "疗"}${value} · ${fallback ? 3 : intent.mpCost || 0}蓝`),
                x + i * (iw + 8), 174, iw, 58, () => this.select("guide", { enemyAction: i + 1 }),
                this.selected?.move === "guide" && (this.selected.enemyAction ?? 1) === i + 1, active && !R.has(s, "rupture"));
            b.tooltips = (s.foe.id ? E.hint(s) + "\n" : "") +
                `当前${percent}%；压制${s.suppression[i]}%` +
                (intent.condition ? "\n条件攻击按上限预留法力；条件未触发仍耗预留值" : "") +
                (intent.maxHpHeal ? "\n治疗不超生命缺口；满血改100%防御护盾，耗3蓝" : "");
        });
        this.text("flyingState", `飞剑 ${s.flying}/${R.has(s, "swordUnity") ? 5 : 3}  ·  ` +
            (R.has(s, "swordUnity") ? "青锋引动" : "回合末攻击"), x, 246, w, 28, 17, colors.blue);
        this.text("coreState", `核心：${s.core ? C.items[s.core].name : "无"}` +
            ` · 耐久 ${[s.weapon,s.armor,s.accessory].map((e,i)=>["武","防","饰"][i]+(e ? e.durability : "—")).join("/")}`,
            x, 282, w, 28, 16, colors.gold);
        this.text("enemyMechanic", E.summary(s), x, 308, w, 20, 14, colors.red);
        const mechanics = [
            R.has(s, "storedEdge") || R.has(s, "meditation") ? `势 ${s.momentum}/3` : "",
            R.has(s, "delayedFall") ? `悬剑 ${s.pendingSword || "未悬"}` : "",
            R.has(s, "tempo") ? `上式 ${s.lastActive ? C.moves[s.lastActive] : "无"}` : "",
            R.has(s, "cycle") ? `归一 ${s.forms.map(k => C.moves[k]).join("、") || "未起式"}` : "",
        ].filter(Boolean).join(" · ");
        if (s.phase === "reward") {
            s.offers.forEach((key, i) => {
                const item = C.items[key], old = item.type === "core" ? s.core : item.slot ? s.mutations[item.slot] : null;
                const role = C.offerRoles[s.offerRoles[key]];
                const related = R.related(s, key);
                const description = WeaponTrialConfig.itemDescription(key,s.setup);
                const title = `${item.name}${role ? ` · ${role}` : ""}${old ? `  ← 替换${C.items[old].name}` : ""}\n${description}`;
                const b = this.button("reward_" + i, title, x, 330 + i * 70, w, 64,
                    () => this.select("choose", { choice: key }), this.selected?.choice === key);
                this.labels["reward_" + i + "Text"].align = "left";
                b.tooltips = description + (related.length ? `\n联动：${related.map(k => C.items[k].name).join("、")}` : "");
            });
        } else {
            const mutationText = Object.values(s.mutations).map(k => C.items[k].name).join(" / ");
            this.text("mutationState", mutationText || "基础四招", x, 330, w, 50, 19, colors.blue);
            this.text("passiveState", s.passives.map(k => C.items[k].name).join(" / ") || "尚未获得被动",
                x, 390, w, 62, 17, colors.muted);
            this.text("mechanicState", mechanics, x, 452, w, 26, 15, colors.gold);
            if (s.phase === "between") this.button("nextBattle", "下一战  >", x, 488, 154, 40, () => this.select("next"));
            else if (s.phase !== "fighting") this.text("runOutcome",
                ({ complete: "本局连战完成", defeat: "本局失败", retreated: "已撤离" })[s.phase],
                x, 476, w, 40, 24, s.phase === "defeat" ? colors.red : colors.jade);
        }
        if (["between", "reward"].includes(s.phase))
            this.button("retreat", "撤离", x + w - 86, 552, 86, 28, () => this.select("retreat"));
        this.text("totals", `伤害 ${s.totals.damage} · 承伤 ${s.totals.taken} · 耗蓝 ${s.totals.mpSpent} · 血祭 ${s.totals.bloodSpent}`,
            x, 550, w - 96, 30, 15, colors.muted);
    }
    private side(x: number, w: number): void {
        (["log", "build", "pool", "report", "enemy"] as const).forEach((key, i) => this.button("tab_" + key,
            ({ log: "日志", build: "构筑", pool: "奖励池", report: "逐战", enemy: "敌情" })[key], x + i * w / 5, 82, w / 5 - 4, 30,
            () => { this.tab = key; this.render(); }, this.tab === key));
        const s = this.session.state;
        let text = "";
        if (this.tab === "log") text = s?.logs.slice(-60).reverse().join("\n\n") || "尚无结算";
        else if (this.tab === "build") text = s?.rewards.map(r =>
            `第${r.battle}战 · ${C.items[r.choice].name} · ${R.has(s, r.choice) ? "生效中" : "已替换"}${r.replaced ? `\n替换 ${C.items[r.replaced].name}` : ""}\n${WeaponTrialConfig.itemDescription(r.choice,s.setup)}`).join("\n\n") || "尚未获得局内内容";
        else if (this.tab === "pool") text = WeaponTrialConfig.skillSummary(s?.setup || this.session.draft) + "\n" +
            ((s ? s.setup.style : this.session.draft.style) === "guzong" ?
                `古宗普攻回${s?.setup.combatTrial?.basicMana ?? this.session.draft.combatTrial?.basicMana ?? C.guzongTempo.basicMana}蓝，吐纳另加4蓝\n\n` : "\n") +
            (Object.entries(C.items) as [RogueItem, typeof C.items[RogueItem]][]).map(([k, v]) =>
                `${s && R.has(s, k) ? "● " : ""}${v.name} · ${{ passive: "被动", mutation: "改招", core: "核心" }[v.type]}\n${WeaponTrialConfig.itemDescription(k,s?.setup || this.session.draft)}`).join("\n\n");
        else if (this.tab === "enemy") text = s?.foe.id ? `${E.title(s)}\n${E.hint(s)}\n\n${E.summary(s)}\n\n` +
            `意图${s.foe.phase2 ? " · 第二阶段" : ""}\n` + s.intentions.map((a, i) =>
                `${i + 1} · ${a.label} ${E.range(a).join("~")}% · 当前${E.percent(s, a)}% · ${a.mpCost || 0}蓝` +
                (a.maxHpHeal ? "\n按最大生命治疗，不超缺口；满血改100%防御护盾/3蓝" : "")).join("\n") +
            "\n\n条件攻击按上限预留法力，条件未触发仍耗预留值；不足时按预告降为普攻。" +
            `\n\n本局敌阵\n${s.enemyPlan.map((k, i) => `${i + 1} · ${E.enemies[k].name}`).join("\n")}` :
            "尚未开始演练";
        else text = s?.reports.slice().reverse().map(r =>
            `第${r.battle}战 ${r.tier}${r.enemyId ? "·" + E.enemies[r.enemyId].name : ""} · ${r.won ? "胜" : "败"}\n${r.rounds}回合 / ${r.actions}行动\n生命 ${r.startHp} → ${r.endHp}\n法力 ${r.startMp} → ${r.endMp}\n承伤${r.taken} / 耗蓝${r.mpSpent} / 血祭${r.bloodSpent}\n` +
            Object.entries(r.skills).map(([k, n]) => `${C.moves[k]}${n}`).join(" ") + "\n" +
            Object.entries(r.events).map(([k, n]) => `${G.events[k] || W.events[k] || C.events[k] || k}:${n}`).join(" ")).join("\n\n") || "尚无完整战报";
        if (this.tab === "build") text = (s?.weapon ? W.describe(s.weapon.roll) +
            `\n耐久 ${s.weapon.durability}/${s.weapon.roll.maxDurability} · 击杀 ${s.weapon.kills}\n` +
            `攻击计数 ${s.weapon.attacks} · 蓄能 ${s.weapon.charge}\n\n` : "未装备武器\n\n") + text;
        if (this.tab === "build") text = (["armor","accessory"] as const).map(slot=>s?.[slot] ?
            `${G.describe(slot,s[slot].roll)}\n耐久 ${s[slot].durability}/${s[slot].roll.maxDurability}\n\n` :
            `未装备${slot === "armor" ? "防具" : "饰品"}\n\n`).join("") + text;
        const panel = this.detailScroll; panel.visible = true; panel.pos(x,128).size(w,this.height-256);
        const t = this.text("detailText", text, 4, 0, w - 10, 100, 16, colors.muted);
        t.overflow = "visible"; t.valign = "top"; t.textIns.typeset(); t.height = Math.max(panel.height, t.textIns.textHeight + 12);
    }
    render(): void {
        if (!this.opened) return;
        this.closeMenu();
        this.root.graphics.clear();
        for (const map of [this.buttons, this.labels, this.inputs, this.icons])
            for (const node of Object.values(map)) node.visible = false;
        this.detailScroll.visible = false;
        this.root.graphics.drawRect(0, 0, this.width, this.height, colors.bg);
        this.root.graphics.drawRect(0, 0, 254, this.height, colors.pane);
        const x = 276, right = this.width - 300, w = right - x - 24, s = this.session.state;
        this.text("pageTitle", "功法测试 · 肉鸽", 20, 14, 240, 36, 24, colors.gold);
        this.text("roundState", s ? `战${s.battle}/${s.setup.battles} · 回${s.round} · ` +
            (s.phase === "fighting" ? `行动 ${s.ap}/${R.actionLimit(s)}` : ({ reward: "选择奖励", between: "战间", complete: "完成", defeat: "失败", retreated: "撤离" })[s.phase]) :
            "青冥剑典 · 局内构筑", x, 14, w - 10, 36, 20, colors.jade);
        const boss = s?.enemyPlan.find(k => E.enemies[k].tier === "首领");
        if (boss) this.text("bossForecast", `本局首领：${E.enemies[boss].name}`, x, 50, w, 24, 15, colors.red);
        this.button("cancel", "x", this.width - 110, 16, 40, 32, () => { this.selected = null; this.notice = ""; this.render(); }, false, !!this.selected).tooltips = "取消选择";
        this.button("back", "<", this.width - 62, 16, 42, 32, () => { this.view.close(); this.onBack(); }).tooltips = "返回";
        this.setup(); this.arena(x, w); this.side(right, 280);
        const footer = this.height - 104, step = Math.min(126, (this.width - x - 234) / 6);
        (["basic", "guard", "edge", "wind", "guide", "fall"] as RogueMove[]).forEach((move, i) => {
            const title = s?.mutations[move] ? C.items[s.mutations[move]].name : C.moves[move];
            const b = this.button("move_" + move, title, x + i * step, footer, step - 8, 46,
                () => this.select(move, move === "guide" ? { enemyAction: 1 } : {}), this.selected?.move === move, s?.phase === "fighting");
            b.tooltips = `${title} · 1行动 · ${C.cost(move, s)}法力` + (s?.mutations[move] ? `\n${WeaponTrialConfig.itemDescription(s.mutations[move],s.setup)}` : "");
            if (move === "basic" && s?.foe.id) b.tooltips += `\n普攻后回${s.setup.combatTrial?.basicMana ?? C.guzongTempo.basicMana}蓝，吐纳再加4；致胜不回蓝`;
            if (s?.setup.combatTrial) b.tooltips += "\n" + WeaponTrialConfig.skillSummary(s.setup);
            if (i >= 2) {
                const image = this.icons[move]; image.visible = true;
                image.pos(4,8).size(28,28);
                this.labels["move_" + move + "Text"].pos(32, 2).size(step - 44, 42);
            }
        });
        this.button("endTurn", "结束回合", this.width - 222, footer, 100, 46, () => this.select("end"), false, s?.phase === "fighting");
        const preview = this.selected ? this.session.preview(this.selected) : null;
        this.button("confirm", "确认", this.width - 112, footer, 92, 46, () => {
            const r = this.session.commit(this.selected, this.revision); this.notice = r.reason || "";
            if (r.ok) this.selected = null; this.render();
        }, true, !!preview?.ok);
        const message = this.notice || (preview ? preview.ok ?
            `${C.moves[this.selected.move]}${this.selected.choice ? " · " + C.items[this.selected.choice].name : ""}  ` +
            `伤害+${preview.state.totals.damage - s.totals.damage} · 承伤+${preview.state.totals.taken - s.totals.taken} · ` +
            `法力 ${preview.state.player.mp - s.player.mp}` : preview.reason : "");
        this.text("preview", message, x, footer + 54, this.width - x - 20, 40, 16, preview?.ok ? colors.muted : colors.red);
    }
}
