import type {
    ManualTestSetup, ManualTestState, ManualTestAction, ManualTestResult, FightCounters,
    SwordShadow, ShadowKind, EnemyStyle, EnemyIntent,
} from "../types/ManualTestTypes";
import { ManualTestConfig as C } from "./ManualTestConfig";

/** One pure run resolver for both previews and commits; no storage or production dependencies. */
export class ManualTestRules {
    static clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }
    static has(s: ManualTestState, star: number, rank: number): boolean { return C.has(s.setup, star, rank); }
    static h(s: ManualTestState): number { return Math.round(s.player.defense * 1.5); }
    static array(s: ManualTestState): string {
        if (!this.has(s, 2, 6) || s.shadows.length !== 3) return "";
        const kinds = new Set(s.shadows.map(x => x.kind));
        return kinds.size === 3 ? "三才" : kinds.size === 1 ? { edge: "万锋", guard: "玄壁", guide: "星罗" }[s.shadows[0].kind] : "";
    }
    static finisherReady(s: ManualTestState): boolean {
        return s.phase === "fighting" && this.has(s, 5, 6) && s.round >= 3 && !s.finisherUsed &&
            s.shadows.some(x => !s.delayed?.ids.includes(x.id));
    }
    static counters(): FightCounters {
        return { damage: 0, taken: 0, shield: 0, mpSpent: 0, warmHarvested: 0, actions: 0,
            healUsed: 0, manaUsed: 0, skills: {}, specials: {} };
    }
    static validateSetup(d: ManualTestSetup): void {
        if (!d || !Number.isInteger(d.star) || !Number.isInteger(d.rank) ||
            d.star < 0 || d.star > 5 || (d.star === 0 ? d.rank !== 0 : d.rank < 1 || d.rank > 6))
            throw new Error("成长须为0星0阶或1至5星1至6阶");
        if (!Object.prototype.hasOwnProperty.call(C.styles, d.style)) throw new Error("敌阵无效");
        for (const [key, low, high] of [["battles", 1, 20], ["seed", 1, 2147483646],
            ["healPotions", 0, 99], ["manaPotions", 0, 99]] as const) {
            if (!Number.isSafeInteger(d[key]) || d[key] < low || d[key] > high) throw new Error(`${key}超出范围`);
        }
        if (!["auto", "edge", "guard", "guide"].includes(d.openingKind)) throw new Error("起手剑影无效");
        for (const actor of [d.player, d.enemy]) for (const key of ["hp", "mp", "attack", "defense"]) {
            if (!actor || !Number.isSafeInteger(actor[key]) || actor[key] < (key === "hp" ? 1 : 0) || actor[key] > 1000000)
                throw new Error("属性须为0至1000000整数，生命至少1");
        }
    }
    static start(d: ManualTestSetup): ManualTestState {
        this.validateSetup(d);
        const s: ManualTestState = {
            setup: this.clone(d), revision: 0, phase: "fighting", battle: 0, round: 1, ap: 3, outcome: "active",
            player: { ...d.player, maxHp: d.player.hp, maxMp: d.player.mp, shield: 0 },
            enemy: { ...d.enemy, maxHp: d.enemy.hp, maxMp: d.enemy.mp, shield: 0, charged: false,
                exposed: false, style: "dummy", tier: "普通" },
            shadows: [], body: null, nextId: 1, path: "none", upgrades: [], offers: [], rng: d.seed,
            potions: { heal: d.healPotions, mana: d.manaPotions }, potionUsed: false, finisherUsed: false,
            firstEdge: false, firstGuide: false, firstFall: false, bodyAttackUsed: false,
            suppression: [0, 0, 0], interrupts: [false, false, false], delayed: null, intentions: [], logs: [],
            totals: this.counters(), fight: this.counters(), fightStart: { hp: d.player.hp, mp: d.player.mp }, reports: [],
        };
        this.beginFight(s); return s;
    }
    private static log(s: ManualTestState, message: string): void {
        s.logs.push(`[战${s.battle}/回${s.round}] ${message}`);
        if (s.logs.length > 600) s.logs.splice(0, s.logs.length - 600);
    }
    private static count(s: ManualTestState, key: keyof Omit<FightCounters, "skills" | "specials">, n: number): void {
        s.totals[key] += n; s.fight[key] += n;
    }
    private static beginFight(s: ManualTestState): void {
        s.battle++; s.phase = "fighting"; s.outcome = "active"; s.round = 1; s.ap = 3;
        s.shadows = []; s.body = null; s.player.shield = 0; s.delayed = null;
        s.suppression = [0, 0, 0]; s.interrupts = [false, false, false];
        s.potionUsed = false; s.finisherUsed = false; this.resetTurn(s);
        s.fight = this.counters(); s.fightStart = { hp: s.player.hp, mp: s.player.mp };
        const tier = s.setup.battles > 1 && s.battle === s.setup.battles ? "首领" :
            s.battle % 4 === 0 ? "精英" : "普通";
        const hpFactor = tier === "首领" ? 3 : tier === "精英" ? 1.7 : 1;
        const atkFactor = tier === "首领" ? 1.6 : tier === "精英" ? 1.3 : 1;
        const base = s.setup.enemy, hp = Math.max(1, Math.round(base.hp * hpFactor));
        const style: EnemyStyle = s.setup.style === "mixed" ?
            (["assault", "defensive", "burst"] as EnemyStyle[])[(s.battle - 1) % 3] : s.setup.style;
        s.enemy = { ...base, hp, maxHp: hp, attack: Math.round(base.attack * atkFactor),
            maxMp: base.mp, shield: 0, charged: false, exposed: false, style, tier };
        const kind = this.has(s, 1, 6) && s.setup.openingKind !== "auto" ? s.setup.openingKind :
            s.path === "none" ? "edge" : s.path;
        this.addShadow(s, kind, false);
        s.intentions = this.intents(s);
        this.log(s, `${tier}·${C.styles[style]}；起手一道新${C.kinds[kind]}影，血蓝与补给不重置`);
    }
    private static resetTurn(s: ManualTestState): void {
        s.firstEdge = false; s.firstGuide = false; s.firstFall = false; s.bodyAttackUsed = false;
    }
    private static finish(s: ManualTestState, won: boolean): void {
        if (s.phase !== "fighting") return;
        s.outcome = won ? "victory" : "defeat"; s.ap = 0;
        s.reports.push({ ...this.clone(s.fight), battle: s.battle, tier: s.enemy.tier, style: s.enemy.style,
            rounds: s.round, won, startHp: s.fightStart.hp, startMp: s.fightStart.mp,
            endHp: s.player.hp, endMp: s.player.mp, path: s.path, upgrades: s.upgrades.slice() });
        s.shadows = []; s.body = null; s.delayed = null; s.player.shield = 0; s.enemy.shield = 0;
        s.suppression = [0, 0, 0]; s.interrupts = [false, false, false];
        s.finisherUsed = false; s.enemy.exposed = false; s.intentions = []; s.offers = [];
        s.phase = !won ? "defeat" : s.battle >= s.setup.battles ? "complete" : "between";
        if (won && s.phase === "between") {
            if (s.battle === 1) { s.offers = ["edge", "guard", "guide"]; s.phase = "reward"; }
            else if (s.battle === 3 || s.battle === 6) {
                const pool = Object.keys(C.upgrades).filter(k => C.upgrades[k].path === s.path && !s.upgrades.includes(k));
                // Deterministic shuffle occurs only on a victory transition, never on reopening a menu.
                for (let i = pool.length - 1; i > 0; i--) {
                    s.rng = s.rng * 16807 % 2147483647;
                    const j = s.rng % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                s.offers = pool.slice(0, 2); s.phase = "reward";
            }
        }
        this.log(s, won ? `胜利；余生命${s.player.hp}，法力${s.player.mp}` : "倒下，本局终止");
    }
    private static shield(s: ManualTestState, n: number, source: string): number {
        if (s.phase !== "fighting") return 0;
        n = Math.max(0, Math.min(Math.round(n), 3 * this.h(s) - s.player.shield));
        s.player.shield += n; this.count(s, "shield", n);
        if (n) this.log(s, `${source} 护体+${n}`);
        return n;
    }
    private static damage(s: ManualTestState, n: number, source: string, bypass = 0): void {
        if (s.phase !== "fighting") return;
        n = Math.max(0, Math.round(n));
        const blocked = Math.min(s.enemy.shield, Math.round(n * (1 - bypass)));
        s.enemy.shield -= blocked;
        const loss = Math.min(s.enemy.hp, n - blocked);
        s.enemy.hp -= loss; this.count(s, "damage", loss);
        this.log(s, `${source} 伤害${loss}${blocked ? ` / 抵盾${blocked}` : ""}`);
        if (!s.enemy.hp) this.finish(s, true);
    }
    private static addShadow(s: ManualTestState, kind: ShadowKind, warm: boolean): void {
        if (s.phase !== "fighting") return;
        if (s.shadows.length >= 3) throw new Error("影位已满，请明确选择替换剑影");
        s.shadows.push({ id: s.nextId++, kind, warm });
    }
    private static selected(s: ManualTestState, ids?: number[]): SwordShadow[] {
        const list = ids === undefined ? s.shadows.map(x => x.id) : ids;
        if (!list.length || new Set(list).size !== list.length) throw new Error("请选择1至3道不同的剑影");
        return list.map(id => {
            const x = s.shadows.find(x => x.id === id);
            if (!x) throw new Error("剑影已不在场");
            if (s.delayed?.ids.includes(id)) throw new Error("该剑影已预约应剑，不能重复使用或替换");
            return x;
        });
    }
    private static suppress(s: ManualTestState, at: number, value: number, interrupt: boolean): void {
        s.suppression[at - 1] = Math.max(s.suppression[at - 1], Math.min(65, value));
        s.interrupts[at - 1] ||= interrupt;
    }
    private static special(s: ManualTestState, key: string): void {
        for (const counter of [s.fight, s.totals]) counter.specials[key] = (counter.specials[key] || 0) + 1;
    }
    private static guideCut(s: ManualTestState, at: number, warm: boolean, formation = ""): void {
        const value = (warm ? 35 : 20) + (this.has(s, 2, 5) ? 10 : 0) +
            (s.upgrades.includes("pressure") ? 15 : 0) + (formation === "星罗" ? 10 : 0);
        const nonAttack = ["guard", "heal"].includes(s.intentions[at - 1]?.kind);
        this.suppress(s, at, s.upgrades.includes("cutFlow") && nonAttack ? Math.max(50, value) : value,
            warm || s.upgrades.includes("cutFlow"));
    }
    private static expose(s: ManualTestState): void {
        if (s.enemy.exposed) return;
        s.enemy.exposed = true; this.special(s, "break");
        this.log(s, "破招成功：下一己方回合首次本体攻击追击破绽");
    }
    private static refund(s: ManualTestState, n: number): void {
        n = Math.max(0, Math.min(n, C.cost("fall"), s.player.maxMp - s.player.mp));
        s.player.mp += n;
        if (n) this.log(s, `收剑返还${n}法力`);
    }
    private static harvest(s: ManualTestState, shadows: SwordShadow[], at: number, twice = false): void {
        const formation = this.array(s), first = !s.firstFall;
        s.firstFall = true;
        const warm = shadows.filter(x => x.warm), types = new Set(shadows.map(x => x.kind));
        this.count(s, "warmHarvested", warm.length);
        s.shadows = s.shadows.filter(x => !shadows.some(y => y.id === x.id));
        const factor = (twice ? 2 : 1) * (formation === "三才" ? 1.25 : 1);
        for (const x of shadows) {
            if (s.phase !== "fighting") break;
            let percent = x.warm ? 120 : 70;
            if (x.kind !== "guide") {
                if (x.warm && this.has(s, 1, 2)) percent += 20;
                if (!x.warm && this.has(s, 2, 1)) percent += 10;
            }
            if (x.kind === "edge") {
                if (this.has(s, 1, 4)) percent += 15;
                this.damage(s, s.player.attack * percent / 100 * factor, `${x.warm ? "温养" : "新"}锋收剑`,
                    x.warm && s.upgrades.includes("cleave") ? 0.5 : 0);
            } else if (x.kind === "guard") {
                if (this.has(s, 2, 2)) percent += 20;
                if (x.warm && this.has(s, 4, 2)) percent += 20;
                const gained = this.shield(s, this.h(s) * percent / 100 * factor, "守影收剑");
                if (s.upgrades.includes("riposte")) this.damage(s, gained, "御守反锋");
                if (s.phase === "fighting" && s.upgrades.includes("shelter")) {
                    const next = s.intentions.findIndex((i, n) => n >= at - 1 && i.kind === "attack");
                    if (next >= 0) this.suppress(s, next + 1, 20, false);
                }
            } else {
                this.guideCut(s, at, x.warm, formation);
                this.damage(s, s.player.attack * (this.has(s, 3, 2) ? 0.6 : 0.3) * factor, "引影收剑");
            }
        }
        if (s.phase !== "fighting") return;
        if (this.has(s, 3, 5)) this.damage(s, s.player.attack * 0.4 * (twice ? 2 : 1), "落剑震敌");
        if (first && warm.some(x => x.kind === "edge") && s.upgrades.includes("afterEdge"))
            this.damage(s, s.player.attack * 0.4, "剑落余锋");
        if (s.phase !== "fighting") return;
        const refund = (this.has(s, 3, 4) ? Math.min(2, warm.length) : 0) +
            (this.has(s, 4, 4) ? types.size : 0) + (first && this.has(s, 5, 4) ? 2 : 0);
        this.refund(s, refund);
        if (first && warm.length && this.has(s, 5, 2)) this.addShadow(s, warm[0].kind, false);
        if (first && types.has("guide") && s.upgrades.includes("followCut") && s.shadows.length < 3)
            this.addShadow(s, "edge", false);
    }
    static resolve(original: ManualTestState, a: ManualTestAction): ManualTestResult {
        const s = this.clone(original);
        try {
            if (!a || !Object.prototype.hasOwnProperty.call(C.moves, a.move)) throw new Error("行动无效");
            const branch = a.branch || "normal";
            if (branch !== "normal" && (a.move !== "fall" || !C.branches(s.setup, a.move).some(x => x.key === branch)))
                throw new Error("尚未解锁该派生");
            if (["complete", "defeat", "retreated"].includes(s.phase)) throw new Error("本局已结束，请重新开始");
            if (a.move === "route" || a.move === "upgrade") {
                const choosingPath = s.battle === 1 && s.path === "none";
                if (s.phase !== "reward" || (a.move === "route") !== choosingPath || !s.offers.includes(a.choice))
                    throw new Error("当前不能选择该奖励");
                if (choosingPath) s.path = a.choice as ShadowKind;
                else s.upgrades.push(a.choice);
                s.offers = []; s.phase = "between"; this.log(s, `取得${choosingPath ? C.paths[s.path] : C.upgrades[a.choice].name}`);
            } else if (a.move === "next") {
                if (s.phase !== "between") throw new Error("请先完成本战与奖励选择");
                this.beginFight(s);
            } else if (a.move === "retreat") {
                if (!["between", "reward"].includes(s.phase)) throw new Error("只能在战间撤离");
                s.phase = "retreated"; s.offers = []; this.log(s, "主动结束本局演练");
            } else if (a.move === "heal" || a.move === "mana") {
                if (s.potionUsed) throw new Error("本回合血蓝药共用一次机会");
                const key = a.move === "heal" ? "hp" : "mp", bag = a.move === "heal" ? "heal" : "mana";
                const max = key === "hp" ? s.player.maxHp : s.player.maxMp;
                if (s.potions[bag] < 1) throw new Error("本局丹药已用完");
                if (s.player[key] >= max) throw new Error("该项已满");
                const n = Math.min(max - s.player[key], Math.max(1, Math.round(max * 0.3)));
                s.player[key] += n; s.potions[bag]--; s.potionUsed = true;
                // Between-fight medicine is accounted to run totals, not the already sealed fight report.
                const counter = a.move === "heal" ? "healUsed" : "manaUsed";
                s.totals[counter]++; if (s.phase === "fighting") s.fight[counter]++;
                this.log(s, `${C.moves[a.move]} +${n}；余${s.potions[bag]}，不耗行动`);
            } else {
                if (s.phase !== "fighting" || s.ap < 1) throw new Error("当前不是出招阶段");
                const cost = C.cost(a.move);
                if (s.player.mp < cost) throw new Error("法力不足");
                const at = a.enemyAction ?? 1;
                if (!Number.isInteger(at) || at < 1 || at > 3) throw new Error("敌行动须为1至3");
                const making = ["edge", "wind", "guide"].includes(a.move);
                if (making && s.shadows.length === 3) {
                    this.selected(s, [a.replacementId]);
                    s.shadows = s.shadows.filter(x => x.id !== a.replacementId);
                    this.log(s, `替换旧影#${a.replacementId}，不触发收剑`);
                }
                let chosen: SwordShadow[] = [];
                if (a.move === "fall") {
                    chosen = this.selected(s, a.shadowIds);
                    if (branch === "delay" && s.delayed) throw new Error("已有应剑预约");
                    if (branch === "absorb" && (s.body !== null || chosen.length !== 1 || !chosen[0].warm))
                        throw new Error("每战只能纳一把身剑，须选一道温养影");
                    if (branch === "finish" && !this.finisherReady(s)) throw new Error("终式须第3回合起且每战一次");
                }
                const beforeArray = this.array(original), full = original.shadows.length === 3;
                s.player.mp -= cost; this.count(s, "mpSpent", cost); this.count(s, "actions", 1);
                for (const counter of [s.fight, s.totals]) counter.skills[a.move] = (counter.skills[a.move] || 0) + 1;
                if (branch !== "normal") this.special(s, branch);
                s.ap--;
                const attack = s.player.attack, h = this.h(s);
                const opening = s.enemy.exposed && ["basic", "edge", "guide"].includes(a.move);
                if (opening) s.enemy.exposed = false;
                if (a.move === "basic") this.damage(s, attack, "普攻");
                if (a.move === "guard") this.shield(s, h, "防御");
                if (a.move === "edge") {
                    if (s.path === "edge" && !s.firstEdge) {
                        const old = s.shadows.find(x => x.kind === "edge" && !x.warm && !s.delayed?.ids.includes(x.id));
                        if (old) {
                            old.warm = true; this.special(s, "cultivate");
                            this.log(s, `养锋：旧锋影#${old.id}即时温养`);
                        }
                    }
                    const factor = 0.9 + (this.has(s, 1, 1) ? 0.15 : 0) +
                        (this.has(s, 3, 1) && s.enemy.charged ? 0.25 : 0) +
                        (this.has(s, 4, 1) && s.suppression.some(x => x > 0) ? 0.2 : 0) +
                        (this.has(s, 5, 1) && full ? 0.25 : 0);
                    this.damage(s, attack * factor, "青锋斩", beforeArray === "万锋" ? 0.5 : this.has(s, 2, 3) ? 0.25 : 0);
                    this.addShadow(s, "edge", !s.firstEdge && s.upgrades.includes("quickEdge")); s.firstEdge = true;
                }
                if (a.move === "wind") {
                    const factor = 1 + (this.has(s, 1, 3) ? 0.2 : 0) +
                        (this.has(s, 3, 3) && s.intentions.some(x => x.kind === "attack" && x.percent >= 200) ? 0.25 : 0) +
                        (this.has(s, 4, 5) && s.player.shield < h ? 0.3 : 0) +
                        (s.body === "guard" ? 0.35 : 0) + (beforeArray === "玄壁" ? 0.5 : 0);
                    this.shield(s, h * factor, "回风式");
                    this.addShadow(s, "guard", this.has(s, 5, 3) && s.shadows.some(x => x.warm));
                }
                if (a.move === "guide") {
                    this.damage(s, attack * (0.5 + (this.has(s, 1, 5) ? 0.15 : 0) +
                        (this.has(s, 4, 3) && !original.shadows.some(x => x.kind === "guide") ? 0.25 : 0)), "引星刺");
                    this.addShadow(s, "guide", s.body === "guide" || !s.firstGuide && this.has(s, 5, 5)); s.firstGuide = true;
                    if (s.phase === "fighting" && s.path === "guide") {
                        this.guideCut(s, at, s.body === "guide", beforeArray);
                        this.log(s, `截脉：引星直接压制敌第${at}行动`);
                    }
                }
                if (opening && s.phase === "fighting") {
                    this.special(s, "opening");
                    this.damage(s, attack * C.openingStrike, "破绽追击", 1);
                }
                if (s.phase === "fighting" && ["basic", "edge", "guide"].includes(a.move) &&
                    s.body === "edge" && !s.bodyAttackUsed) {
                    s.bodyAttackUsed = true; this.damage(s, attack * 0.35, "锋身剑·追击");
                }
                if (a.move === "fall") {
                    if (branch === "delay") {
                        s.delayed = { at, ids: chosen.map(x => x.id) }; this.log(s, `预约敌第${at}行动前收剑`);
                    } else if (branch === "absorb") {
                        s.body = chosen[0].kind; s.shadows = s.shadows.filter(x => x.id !== chosen[0].id);
                        this.log(s, `温养${C.kinds[s.body]}影纳为唯一身剑`);
                        if (s.body === "edge") this.damage(s, attack * C.bodyEntry.edge, "纳锋·出鞘");
                        if (s.body === "guard") this.shield(s, h * C.bodyEntry.guard, "纳守·护身");
                        if (s.body === "guide") {
                            this.guideCut(s, at, true); this.damage(s, attack * C.bodyEntry.guide, "纳引·点破");
                        }
                    } else {
                        if (branch === "finish") { s.finisherUsed = true; this.log(s, "万剑归冥·双重收剑"); }
                        this.harvest(s, chosen, at, branch === "finish");
                    }
                }
                if (a.move === "end") s.ap = 0;
                if (s.phase === "fighting" && !s.ap) this.enemyTurn(s);
            }
            s.revision++; this.validateState(s);
            return { ok: true, state: s };
        } catch (e) { return { ok: false, reason: (e as Error).message, state: this.clone(original) }; }
    }
    static intents(s: ManualTestState): EnemyIntent[] {
        const attack = (percent: number, label = "攻击"): EnemyIntent => ({ kind: "attack", percent, label });
        let plan: EnemyIntent[];
        switch (s.enemy.style) {
            case "dummy": plan = [1, 2, 3].map(() => ({ kind: "wait", percent: 0, label: "待机" })); break;
            case "assault": plan = s.round % 2 === 1 ?
                [attack(80, "快斩"), attack(80, "连斩"), attack(140, "重击")] :
                [{ kind: "guard", percent: 100, label: "收势" }, attack(60, "探步"), attack(220, "破阵重斩")]; break;
            case "defensive": plan = s.round % 2 === 1 ?
                [{ kind: "guard", percent: 200, label: "架盾" }, attack(90), { kind: "heal", percent: 60, label: "调息" }] :
                [attack(180, "盾后突刺"), attack(60, "追刺"), { kind: "guard", percent: 150, label: "回守" }]; break;
            case "burst": plan = s.round % 2 === 1 ?
                [{ kind: "charge", percent: 0, label: "蓄力" }, { kind: "guard", percent: 150, label: "固守" }, attack(50, "试探")] :
                [attack(100, "破势"), attack(120, "追击"), attack(s.enemy.charged ? 330 : 220, "蓄力重斩")]; break;
        }
        let mana = s.enemy.mp;
        return plan.map(i => {
            const mpCost = i.kind === "heal" ? 5 : i.kind === "guard" ? 3 :
                i.kind === "charge" || i.kind === "attack" && i.percent > 100 ? 4 : 0;
            if (mana < mpCost) return i.kind === "attack" ? { ...attack(100, "普通斩"), mpCost: 0 } :
                { kind: "wait", percent: 0, label: "法力不足", mpCost: 0 };
            mana -= mpCost; return { ...i, mpCost };
        });
    }
    private static enemyTurn(s: ManualTestState): void {
        // A break lasts through exactly the next own turn, never banks across rounds.
        s.enemy.exposed = false;
        s.enemy.shield = 0;
        for (let at = 1; at <= 3 && s.phase === "fighting"; at++) {
            this.log(s, `敌行动${at}·${s.intentions[at - 1].label}`);
            if (s.delayed?.at === at) {
                const plan = s.delayed; s.delayed = null;
                this.harvest(s, plan.ids.map(id => s.shadows.find(x => x.id === id)), at);
            }
            if (s.phase !== "fighting") break;
            const intent = s.intentions[at - 1], reduction = s.suppression[at - 1], factor = 1 - reduction / 100;
            s.enemy.mp -= intent.mpCost || 0;
            if (reduction) this.log(s, `敌行动${at}削弱${reduction}%`);
            if (reduction > 0 && (intent.kind === "guard" && s.enemy.defense > 0 ||
                intent.kind === "heal" && s.enemy.hp < s.enemy.maxHp && s.enemy.attack > 0 ||
                intent.kind === "attack" && intent.percent >= 140 && s.enemy.attack > 0 ||
                intent.kind === "charge" && s.interrupts[at - 1])) this.expose(s);
            if (intent.kind === "attack") {
                const n = Math.round(s.enemy.attack * intent.percent / 100 * factor), blocked = Math.min(n, s.player.shield);
                s.player.shield -= blocked;
                const loss = Math.min(s.player.hp, n - blocked);
                s.player.hp -= loss; this.count(s, "taken", loss);
                this.log(s, `${intent.label} 伤害${loss} / 抵盾${blocked}`);
                if (!s.player.hp) this.finish(s, false);
                if (s.phase === "fighting" && blocked > 0 && s.path === "guard") {
                    const shadow = s.shadows.find(x => x.kind === "guard" && !s.delayed?.ids.includes(x.id));
                    if (shadow) {
                        s.shadows = s.shadows.filter(x => x.id !== shadow.id);
                        this.special(s, "counter");
                        this.damage(s, blocked + s.player.attack * (C.counterStrike + (shadow.warm ? C.warmCounter : 0)),
                            `${shadow.warm ? "温养" : "新"}守影#${shadow.id}格挡反击`);
                    }
                }
            } else if (intent.kind === "guard") s.enemy.shield += Math.round(s.enemy.defense * intent.percent / 100 * factor);
            else if (intent.kind === "heal") s.enemy.hp = Math.min(s.enemy.maxHp,
                s.enemy.hp + Math.round(s.enemy.attack * intent.percent / 100 * factor));
            else if (intent.kind === "charge") {
                s.enemy.charged = !s.interrupts[at - 1];
                if (!s.enemy.charged) this.log(s, "引影截断蓄力，下一回合重斩失去蓄力加成");
            }
        }
        if (s.phase !== "fighting") return;
        if (s.round % 2 === 0) s.enemy.charged = false;
        s.round++; s.ap = 3; s.potionUsed = false; this.resetTurn(s);
        const retain = s.upgrades.includes("retainShield") ||
            this.has(s, 2, 4) && s.shadows.some(x => x.kind === "guard");
        s.player.shield = retain ? Math.min(this.h(s), s.player.shield) : 0;
        s.shadows.forEach(x => x.warm = true);
        if (s.body === "guard") this.shield(s, this.h(s) * 0.25, "守身剑·护身");
        s.suppression = [0, 0, 0]; s.interrupts = [false, false, false];
        s.intentions = this.intents(s);
        this.log(s, "己方回合开始，存留影温养；无自动攻击");
    }
    static validateState(s: ManualTestState): void {
        if (s.shadows.length > 3 || new Set(s.shadows.map(x => x.id)).size !== s.shadows.length ||
            s.shadows.some(x => !Number.isInteger(x.id) || x.id < 1 || typeof x.warm !== "boolean"))
            throw new Error("剑影身份或容量异常");
        if ([s.player.hp, s.player.mp, s.enemy.hp, s.enemy.mp, s.player.shield, s.enemy.shield, s.ap,
            s.potions.heal, s.potions.mana].some(x => !Number.isSafeInteger(x) || x < 0) ||
            s.player.hp > s.player.maxHp || s.player.mp > s.player.maxMp || s.ap > 3 ||
            s.player.shield > this.h(s) * 3) throw new Error("战斗资源异常");
        if (s.delayed?.ids.some(id => !s.shadows.some(x => x.id === id))) throw new Error("预约剑影丢失");
        if (new Set(s.upgrades).size !== s.upgrades.length || s.upgrades.length > 2 ||
            s.upgrades.some(k => C.upgrades[k]?.path !== s.path)) throw new Error("剑路强化异常");
        if (s.phase !== "fighting" && (s.shadows.length || s.body || s.delayed || s.ap ||
            s.player.shield || s.enemy.exposed || s.suppression.some(x => x))) throw new Error("战后资源未清理");
        if (s.logs.length > 600 || s.reports.length > s.setup.battles || s.battle > s.setup.battles)
            throw new Error("连战边界异常");
    }
}
