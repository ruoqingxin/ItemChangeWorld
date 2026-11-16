import type {
    ManualTestSetup, ManualTestState, ManualTestAction, ManualTestResult, SwordGroup,
    SwordShadow, ShadowKind, EnemyIntent, FallPlan,
} from "../types/ManualTestTypes";
import { ManualTestConfig as C } from "./ManualTestConfig";

/** Pure prototype rules. Preview and commit both resolve the same bounded command on a copy. */
export class ManualTestRules {
    static clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
    static has(s: ManualTestState, star: number, rank: number): boolean { return C.has(s.setup, star, rank); }
    static capacity(s: ManualTestState): number {
        return this.has(s, 5, 6) ? 6 : this.has(s, 3, 6) ? 5 : this.has(s, 1, 6) ? 4 : 3;
    }
    static slots(g: SwordGroup): number { return g.members.length === 3 ? 2 : g.members.length; }
    static used(groups: SwordGroup[]): number { return groups.reduce((n, g) => n + this.slots(g), 0); }
    static bodyCapacity(s: ManualTestState): number { return this.has(s, 4, 6) ? 3 : this.has(s, 4, 1) ? 1 : 0; }
    static canAbsorb(s: ManualTestState, x: SwordShadow): boolean {
        return this.has(s, 4, 1) && (x.age >= 2 || this.has(s, 5, 6) && x.cycles >= 3);
    }
    static finisherReady(s: ManualTestState): boolean {
        return this.has(s, 5, 6) && s.outcome === "active" && !s.finisherUsed &&
            s.orbit >= C.orbitNeed && [...s.sky, ...s.cache].reduce((n, g) => n + g.members.length, 0) >= 3;
    }
    static ageCap(s: ManualTestState, g: SwordGroup): number {
        return this.has(s, 1, 6) && s.sky[0]?.id === g.id ? 6 : 3;
    }
    static mature(s: ManualTestState, g: SwordGroup, x: SwordShadow): boolean { return x.age >= this.ageCap(s, g); }
    static array(g: SwordGroup | SwordShadow[]): string {
        const members = Array.isArray(g) ? g : g.members;
        if (members.length !== 3) return "";
        const kinds = new Set(members.map(x => x.kind));
        return kinds.size === 3 ? "三才" : kinds.size === 1 ?
            ({ edge: "万锋", guard: "玄壁", guide: "星罗" })[members[0].kind] : "";
    }
    static groupName(g: SwordGroup): string {
        return this.array(g) ? `${this.array(g)}阵 #${g.id}` : `${C.kinds[g.members[0].kind]}影 #${g.id}`;
    }
    static h(s: ManualTestState): number { return Math.round(s.player.defense * 1.5); }
    static bodyArray(s: ManualTestState): string { return this.has(s, 4, 6) ? this.array(s.body) : ""; }
    static permission(s: ManualTestState, type: string): boolean {
        return this.bodyArray(s) === type || s.sky.some(g => this.array(g) === type);
    }
    static markCap(s: ManualTestState): number { return this.permission(s, "星罗") ? 8 : 5; }
    static retention(s: ManualTestState): number {
        return Math.max(this.bodyArray(s) === "星罗" ? 3 : 0,
            s.sky.some(g => this.array(g) === "星罗") ? Math.floor(s.marks / 2) : 0,
            s.body.filter(x => x.kind === "guide").length * 2);
    }
    static validateSetup(setup: ManualTestSetup): void {
        if (!setup || !Number.isInteger(setup.star) || !Number.isInteger(setup.rank) ||
            setup.star < 0 || setup.star > 5 || (setup.star === 0 ? setup.rank !== 0 : setup.rank < 1 || setup.rank > 6))
            throw new Error("成长状态须为0星0阶或1～5星1～6阶");
        if (!Object.prototype.hasOwnProperty.call(C.styles, setup.style)) throw new Error("敌人模板无效");
        for (const actor of [setup.player, setup.enemy]) {
            if (!actor) throw new Error("缺少对战属性");
            for (const key of ["hp", "mp", "attack", "defense"]) {
                const n = actor[key];
                if (!Number.isSafeInteger(n) || n < (key === "hp" ? 1 : 0) || n > 1000000)
                    throw new Error("属性须为0～1000000的整数，生命至少为1");
            }
        }
    }
    static start(setup: ManualTestSetup): ManualTestState {
        this.validateSetup(setup);
        const s: ManualTestState = {
            setup: this.clone(setup), round: 1, ap: 3, revision: 0, outcome: "active",
            player: { ...setup.player, maxHp: setup.player.hp, maxMp: setup.player.mp, shield: 0 },
            enemy: { ...setup.enemy, maxHp: setup.enemy.hp, maxMp: setup.enemy.mp, shield: 0, charged: false },
            sky: [], body: [], cache: [], nextId: 1, marks: 0, energy: 0,
            activeEnergy: 0, responseEnergy: false, firstRoot: false, firstReorder: false, firstKeep: false,
            bodyAttacked: [], bodySynced: [], guideBodyUsed: false, potionUsed: false,
            finisherUsed: false, orbit: 0, reverseUsed: false, delayed: null,
            ambush: null, ambushAt: 1, pinpoint: null, pinpointAt: 1, responseCount: 0, cutAt: 0,
            intentions: [], logs: [], totals: { damage: 0, taken: 0, shield: 0 },
        };
        s.intentions = this.intents(s);
        this.log(s, `青冥剑典 ${setup.star}星${setup.rank}阶 · ${C.styles[setup.style]} · 双方3行动`);
        return s;
    }
    private static log(s: ManualTestState, message: string): void {
        s.logs.push(`[${s.round}] ${message}`);
        if (s.logs.length > 600) s.logs.splice(0, s.logs.length - 600);
    }
    private static shield(s: ManualTestState, amount: number, source: string): void {
        if (s.outcome !== "active") return;
        amount = Math.max(0, Math.min(Math.round(amount), 3 * this.h(s) - s.player.shield));
        s.player.shield += amount; s.totals.shield += amount;
        if (amount) this.log(s, `${source} 护体+${amount}`);
    }
    private static damage(s: ManualTestState, amount: number, source: string, bypass = 0): void {
        if (s.outcome !== "active") return;
        amount = Math.max(0, Math.round(amount));
        const blocked = Math.min(s.enemy.shield, Math.round(amount * (1 - bypass)));
        s.enemy.shield -= blocked;
        const loss = Math.min(s.enemy.hp, amount - blocked);
        s.enemy.hp -= loss; s.totals.damage += loss;
        this.log(s, `${source} 伤害${loss}${blocked ? `／抵盾${blocked}` : ""}`);
        if (s.enemy.hp <= 0) this.finish(s, "victory");
    }
    private static finish(s: ManualTestState, outcome: "victory" | "defeat"): void {
        s.outcome = outcome; s.ap = 0;
        this.log(s, outcome === "victory" ? "演练胜利" : "演练失败");
        s.sky = []; s.body = []; s.cache = []; s.marks = 0; s.energy = 0; s.orbit = 0;
        s.delayed = null; s.ambush = null; s.pinpoint = null;
        s.player.shield = 0; s.enemy.shield = 0;
    }
    private static marks(s: ManualTestState, n: number): void {
        if (s.outcome !== "active") return;
        s.marks = Math.min(this.markCap(s), s.marks + n);
        this.log(s, `剑痕 ${s.marks}层`);
    }
    private static shadow(s: ManualTestState, kind: ShadowKind): SwordGroup {
        const id = s.nextId++;
        return { id, responded: false, members: [{ id, kind, age: 0, cycles: 0, cycledRound: 0 }] };
    }
    private static boost(s: ManualTestState, g: SwordGroup, x: SwordShadow, hover: boolean): number {
        let n = 100 + (this.has(s, 5, 4) ? x.cycles * 10 : 0);
        if (hover && this.has(s, 1, 2) && s.sky[0]?.id === g.id) n += 50;
        if (hover && this.has(s, 4, 2) && s.body.some(b => b.kind === x.kind)) n += 20;
        if (hover && this.array(g) && this.array(g) !== "三才" && this.array(g) === this.bodyArray(s)) n += 20;
        if (hover && this.has(s, 2, 2)) {
            if (g.members.length === 3 && this.array(g) !== "三才") n += 40;
            else if (g.members.length === 1) {
                const i = s.sky.findIndex(row => row.id === g.id);
                let count = 1;
                for (let j = i - 1; j >= 0 && s.sky[j].members.length === 1 &&
                    s.sky[j].members[0].kind === x.kind; j--) count++;
                for (let j = i + 1; j < s.sky.length && s.sky[j].members.length === 1 &&
                    s.sky[j].members[0].kind === x.kind; j++) count++;
                if (count >= 2) n += count >= 3 ? 40 : 20;
            }
        }
        return n;
    }
    private static echo(s: ManualTestState, g: SwordGroup, mode: "hover" | "echo",
        allowMature = true, extra = 100, member?: number): void {
        for (const x of g.members.slice()) {
            if (s.outcome !== "active") break;
            if (member !== undefined && x.id !== member) continue;
            if (!allowMature && this.mature(s, g, x)) continue;
            const factor = (this.boost(s, g, x, true) + extra - 100) / 100 * (mode === "echo" ? 0.5 : 1);
            const source = `${C.kinds[x.kind]}影#${x.id}${mode === "hover" ? "悬停" : "余响"}`;
            if (x.kind === "edge") this.damage(s, s.player.attack * 0.2 * factor * (1 + s.marks * 0.1),
                source, this.array(g) === "万锋" ? 0.5 : 0);
            if (x.kind === "guard") this.shield(s, this.h(s) * 0.2 * factor, source);
            if (x.kind === "guide") this.marks(s, 1);
        }
    }
    private static replay(s: ManualTestState, g: SwordGroup,
        mode: "fall" | "overflow" | "reverse" | "finish" | "body", extra = 100,
        batch?: SwordShadow[], matureIds?: Set<number>): void {
        for (let i = 0; i < g.members.length && s.outcome === "active"; i++) {
            const x = g.members[i];
            let percent = mode === "reverse" ? (x.kind === "guide" ? 50 : 100) :
                x.kind === "guide" ? 30 : 60;
            percent += x.age * 10 + (mode === "finish" ? 80 : 0);
            if ((mode === "fall" || mode === "finish") && this.has(s, 1, 4) &&
                (matureIds ? matureIds.has(x.id) : this.mature(s, g, x))) percent += 30;
            let factor = this.boost(s, g, x, false) / 100 * extra / 100;
            if (mode === "overflow") factor *= 0.5;
            const sequence = batch || g.members, position = sequence.indexOf(x);
            if (this.has(s, 2, 4) && (sequence[position - 1]?.kind === x.kind ||
                sequence[position + 1]?.kind === x.kind)) factor *= 1.1;
            const source = `${C.kinds[x.kind]}影#${x.id}${mode === "overflow" ? "挤落" : "落剑"}`;
            if (x.kind === "guard") this.shield(s, this.h(s) * percent / 100 * factor, source);
            else this.damage(s, s.player.attack * percent / 100 * factor * (1 + s.marks * 0.1), source);
            if (x.kind === "guide") this.marks(s, 1);
        }
    }
    private static store(s: ManualTestState, g: SwordGroup): void {
        if (s.outcome !== "active") return;
        g.responded = false;
        s.cache.push(g);
        this.log(s, `${this.groupName(g)} 归冥`);
        while (this.used(s.cache) > 6) this.log(s, `${this.groupName(s.cache.shift()!)} 冥渊满位消散`);
    }
    private static gainEnergy(s: ManualTestState): void {
        if (this.has(s, 4, 4) && s.activeEnergy < 2 && s.outcome === "active") {
            s.energy = Math.min(this.has(s, 4, 6) ? 9 : 6, s.energy + 1);
            s.activeEnergy++;
            this.log(s, `坠落回元 ${s.energy}`);
        }
    }
    private static fallGroups(s: ManualTestState, groups: SwordGroup[], mode: "fall" | "overflow",
        clear: boolean, retain = this.retention(s), plan: FallPlan = { keep: false }): void {
        const declared = new Set(groups.flatMap(g => g.members.map(x => x.id)));
        if (plan.absorb !== undefined) this.absorb(s, plan.absorb);
        const real = s.sky.filter(g => g.members.some(x => declared.has(x.id)));
        const sequence = real.flatMap(g => g.members), matureIds = new Set(real.flatMap(g =>
            g.members.filter(x => this.mature(s, g, x)).map(x => x.id)));
        let dropped = false;
        // Keep the original queue for boost/maturity lookups until each group has replayed.
        for (const g of real) {
            if (!s.sky.includes(g) || s.outcome !== "active") continue;
            this.replay(s, g, mode, 100, sequence, matureIds); dropped = true;
            s.sky = s.sky.filter(row => row !== g);
            if (this.has(s, 5, 1) && (mode === "fall" || this.has(s, 5, 6))) this.store(s, g);
        }
        if (dropped) this.gainEnergy(s);
        if (clear && s.outcome === "active") {
            s.marks = Math.max(retain, s.body.filter(x => x.kind === "guide").length * 2);
            s.marks = Math.min(this.markCap(s), s.marks);
            this.log(s, `落剑收束，保留${s.marks}痕`);
        }
    }
    private static overflow(s: ManualTestState): void {
        while (this.used(s.sky) > this.capacity(s) && s.outcome === "active") {
            const i = this.has(s, 1, 6) ? 1 : 0;
            const g = s.sky[i];
            if (!g) throw new Error("没有可挤落的剑组");
            this.fallGroups(s, [g], "overflow", false);
        }
    }
    private static form(s: ManualTestState, at?: number): void {
        if (at === undefined) return;
        if (!this.has(s, 2, 6)) throw new Error("尚未解锁剑阵");
        if (s.sky.filter(g => g.members.length === 3).length >= 2) throw new Error("最多两座天阵");
        const i = s.sky.findIndex(g => g.id === at), rows = s.sky.slice(i, i + 3);
        if (i < 0 || rows.length !== 3 || rows.some(g => g.members.length !== 1)) throw new Error("成阵须为相邻三道散影");
        const members = rows.flatMap(g => g.members);
        if (!this.array(members)) throw new Error("阵型须三同类或锋守引各一");
        const g = { id: rows[0].id, members, responded: rows.some(g => g.responded) };
        s.sky.splice(i, 3, g); this.log(s, `${this.groupName(g)} 成阵`);
    }
    private static find(groups: SwordGroup[], id?: number): SwordGroup {
        const g = groups.find(g => g.id === id);
        if (!g) throw new Error("请选择有效剑组");
        return g;
    }
    private static absorb(s: ManualTestState, id: number): void {
        if (!this.has(s, 4, 1)) throw new Error("尚未解锁纳剑");
        const g = s.sky.find(g => g.members.some(x => x.id === id)), x = g?.members.find(x => x.id === id);
        if (!g || !x || !this.canAbsorb(s, x))
            throw new Error("纳剑须选择两势剑影，周天后也可选择三转剑影");
        const i = s.sky.indexOf(g);
        s.sky.splice(i, 1, ...g.members.filter(y => y !== x).map(y => ({
            id: y.id, members: [y], responded: g.responded,
        })));
        if (s.body.length >= this.bodyCapacity(s)) {
            const old = s.body.shift()!;
            this.replay(s, { id: old.id, members: [old], responded: false }, "body");
        }
        if (s.outcome !== "active") return;
        s.body.push(x);
        this.log(s, `${C.kinds[x.kind]}影#${x.id} 纳入身剑`);
        this.gainEnergy(s);
        if (x.kind === "edge") this.damage(s, s.player.attack * 0.6 * (1 + s.marks * 0.1), "入体·开锋");
        if (x.kind === "guard") this.shield(s, this.h(s), "入体·护身");
        if (x.kind === "guide") this.marks(s, 2);
    }
    private static returnGroup(s: ManualTestState, g: SwordGroup, a?: ManualTestAction): void {
        const free = this.capacity(s) - this.used(s.sky);
        if (free < this.slots(g)) {
            if (!a) throw new Error("回升空间不足");
            const replace = this.find(s.sky, a.other);
            if (this.has(s, 1, 6) && replace === s.sky[0]) throw new Error("本命不可挤落");
            if (free + this.slots(replace) < this.slots(g)) throw new Error("指定替换组腾位不足");
            this.fallGroups(s, [replace], "overflow", false);
        }
        if (s.outcome !== "active") return;
        s.cache = s.cache.filter(row => row !== g);
        for (const x of g.members) {
            x.age = this.has(s, 5, 6) ? Math.floor(x.age / 2) : 0;
            if (this.has(s, 5, 4) && x.cycledRound !== s.round) {
                x.cycles = Math.min(this.has(s, 5, 6) ? 5 : 3, x.cycles + 1);
                x.cycledRound = s.round;
                if (this.has(s, 5, 6) && !s.finisherUsed) s.orbit = Math.min(C.orbitNeed, s.orbit + 1);
            }
        }
        g.responded = false;
        s.sky.splice(Math.min(a?.slot ?? s.sky.length, s.sky.length), 0, g);
        this.log(s, `${this.groupName(g)} 回升`);
    }
    private static bodyStrike(s: ManualTestState, source: string, spend: boolean): void {
        const participating = this.has(s, 4, 6) ? s.body.length : Math.min(1, s.body.length);
        if (!participating) throw new Error("没有身剑");
        if (spend && s.energy < C.releaseEnergy) throw new Error(`出体至少需要${C.releaseEnergy}剑元`);
        const amount = s.player.attack * (participating * 0.65 + s.energy * 0.4);
        if (spend) s.energy = 0;
        this.damage(s, amount * (1 + s.marks * 0.1), source, this.bodyArray(s) === "万锋" ? 0.5 : 0);
    }
    private static bodyAttack(s: ManualTestState): void {
        for (const x of s.body.filter(x => x.kind === "edge")) if (!s.bodyAttacked.includes(x.id)) {
            s.bodyAttacked.push(x.id);
            this.damage(s, s.player.attack * 0.35 * (1 + s.energy * 0.05) * (1 + s.marks * 0.1), "锋身剑");
        }
    }
    private static finisher(s: ManualTestState): void {
        if (!this.finisherReady(s))
            throw new Error(`万剑归冥须${C.orbitNeed}归冥势，天影与归影合计至少三道，每战一次`);
        s.finisherUsed = true; s.orbit = 0;
        const groups = [...s.sky, ...s.cache], sequence = groups.flatMap(g => g.members);
        const matureIds = new Set(groups.flatMap(g => g.members.filter(x =>
            s.sky.includes(g) ? this.mature(s, g, x) : x.age >= 3).map(x => x.id)));
        this.damage(s, s.player.attack * 2, "万剑归冥·剑鸣");
        for (const g of groups) this.replay(s, g, "finish", 100, sequence, matureIds);
        if (s.body.length && s.outcome === "active") this.bodyStrike(s, "万剑归冥·身剑合击", false);
        this.log(s, "万剑归冥：天冥共鸣，原影归位，不增转、不回元");
    }
    static resolve(original: ManualTestState, a: ManualTestAction): ManualTestResult {
        const s = this.clone(original);
        try {
            if (s.outcome !== "active") throw new Error("本场演练已结束，请重新开始");
            if (!Object.prototype.hasOwnProperty.call(C.moves, a.move)) throw new Error("行动无效");
            if (a.move === "heal" || a.move === "mana") {
                if (s.potionUsed) throw new Error("测试规则：每回合血蓝药共用一次机会");
                const key = a.move === "heal" ? "hp" : "mp", max = key === "hp" ? s.player.maxHp : s.player.maxMp;
                if (s.player[key] >= max) throw new Error(key === "hp" ? "生命已满" : "法力已满");
                const amount = Math.min(max - s.player[key], Math.max(1, Math.round(max * 0.3)));
                s.player[key] += amount; s.potionUsed = true; s.revision++;
                this.log(s, `${C.moves[a.move]} +${amount}，不耗行动`);
                return { ok: true, state: s };
            }
            if (s.ap < 1) throw new Error("行动点不足");
            const branch = a.branch || "normal";
            if (!C.branches(s.setup, a.move).some(row => row.key === branch)) throw new Error("派生尚未解锁");
            if (s.player.mp < C.cost(a.move)) throw new Error("法力不足");
            if (branch === "reverse") {
                if (s.reverseUsed) throw new Error("本回合已经逆引");
                if (s.energy < C.reverseEnergy) throw new Error(`逆引需要${C.reverseEnergy}剑元`);
            }
            if (["ambush", "pinpoint", "delay"].includes(branch) &&
                a.enemyAction !== undefined && ![1, 2, 3].includes(a.enemyAction))
                throw new Error("预约时机须为敌第1／2／3行动");
            const oldHead = s.sky[0];
            let echoed = false, newGroup: SwordGroup | undefined;
            s.player.mp -= C.cost(a.move); s.ap--; s.revision++;
            this.log(s, `${C.moves[a.move]}${branch !== "normal" ? `·${C.branches(s.setup, a.move).find(b => b.key === branch)!.name}` : ""}，余${s.ap}行动`);
            if (a.keep && !this.has(s, 2, 1)) throw new Error("尚未解锁留锋");
            if (a.move === "basic") this.damage(s, s.player.attack, "普攻");
            if (a.move === "guard") this.shield(s, this.h(s), "防御");
            if (a.move === "edge") {
                this.damage(s, s.player.attack, "青锋斩");
                if (s.outcome === "active") {
                    this.bodyAttack(s);
                    if (s.outcome !== "active") return { ok: true, state: s };
                    if (branch === "urge" && oldHead) {
                        this.echo(s, oldHead, "echo"); echoed = true;
                        if (this.has(s, 1, 6) && !s.firstRoot) {
                            oldHead.members.forEach(x => x.age = Math.min(6, x.age + 1)); s.firstRoot = true;
                        }
                    }
                    let kind: ShadowKind = "edge";
                    if (branch === "copy") {
                        const tail = s.sky[s.sky.length - 1];
                        if (!tail) throw new Error("没有可摹写的队尾剑影");
                        kind = a.kind || tail.members[0].kind;
                        if (!tail.members.some(x => x.kind === kind)) throw new Error("队尾没有此类型");
                    }
                    newGroup = this.shadow(s, kind);
                    if (branch === "copy") {
                        const model = s.sky[s.sky.length - 1].members.find(x => x.kind === kind)!;
                        newGroup.members[0].age = Math.min(2, model.age);
                    }
                    if (a.member !== undefined) {
                        if (!this.has(s, 4, 3)) throw new Error("尚未解锁出鞘");
                        const x = s.body.find(x => x.id === a.member);
                        if (!x || s.bodySynced.includes(x.id) || (!this.has(s, 4, 6) && s.bodySynced.length))
                            throw new Error("本回合该身剑不能再次协同");
                        s.bodySynced.push(x.id);
                        if (x.kind === "edge") this.damage(s, s.player.attack * 0.45 * (1 + s.energy * 0.05) * (1 + s.marks * 0.1),
                            "出鞘", this.bodyArray(s) === "万锋" ? 0.5 : 0);
                        if (x.kind === "guard") this.shield(s, this.h(s) * 0.45 * (1 + s.energy * 0.05), "出鞘");
                        if (x.kind === "guide") this.marks(s, 1);
                    }
                }
            }
            if (a.move === "wind" && s.outcome === "active") {
                this.shield(s, this.h(s), "回风式");
                if (branch === "recall") {
                    const g = this.find(s.cache, a.target); this.returnGroup(s, g, a);
                    if (this.has(s, 5, 2)) { this.echo(s, g, "echo"); echoed = true; }
                } else {
                    newGroup = this.shadow(s, "guard");
                    let moved: SwordGroup | undefined;
                    if (branch === "reorder") {
                        // target=0 explicitly selects the just-created guard shadow.
                        const g = a.target === 0 ? newGroup : this.find(s.sky, a.target);
                        s.sky = s.sky.filter(row => row !== g); s.sky.unshift(g);
                        if (g === newGroup) newGroup = undefined;
                        if (g !== oldHead) moved = g;
                    }
                    if (branch === "swap") {
                        const g = this.find(s.sky, a.target), h = this.find(s.sky, a.other);
                        const i = s.sky.indexOf(g), j = s.sky.indexOf(h); s.sky[i] = h; s.sky[j] = g;
                        if (g !== h) moved = g;
                    }
                    if (branch === "split") {
                        const g = this.find(s.sky, a.target);
                        if (g.members.length !== 3 || this.used(s.sky) + 2 > this.capacity(s))
                            throw new Error("拆阵后须有空间容纳散影和本次守影");
                        s.sky.splice(s.sky.indexOf(g), 1, ...g.members.map(x => ({
                            id: x.id, members: [x], responded: g.responded,
                        })));
                        moved = s.sky.find(row => row.id === g.id);
                    }
                    if (moved && !s.firstReorder) {
                        this.echo(s, moved, "echo"); echoed = true; s.firstReorder = true;
                        this.log(s, "移剑余响：本回合首次调序／易位／拆阵");
                    }
                    if (branch === "ambush") {
                        s.ambush = this.find(s.sky, a.target).id; s.ambushAt = a.enemyAction ?? 1;
                        this.log(s, `伏剑预约敌第${s.ambushAt}行动`);
                    }
                }
            }
            if (a.move === "guide" && s.outcome === "active") {
                if (branch === "release") this.bodyStrike(s, "引剑出体", true);
                else {
                    this.damage(s, s.player.attack * 0.5, "引星刺");
                    if (s.outcome !== "active") return { ok: true, state: s };
                    this.marks(s, 2); this.bodyAttack(s);
                    if (s.outcome !== "active") return { ok: true, state: s };
                    if (!s.guideBodyUsed && s.body.some(x => x.kind === "guide")) { this.marks(s, 1); s.guideBodyUsed = true; }
                    if (branch === "pluck") {
                        const g = this.find(s.sky, a.target);
                        const ripe = g.members.some(x => this.mature(s, g, x));
                        this.fallGroups(s, [g], "fall", false);
                        if (ripe && s.outcome === "active") {
                            newGroup = this.shadow(s, "guide");
                            this.log(s, "成熟引落：续留引影");
                        }
                    }
                    else if (branch === "reverse") {
                        s.energy -= C.reverseEnergy; s.reverseUsed = true;
                        const g = this.find(s.cache, a.target);
                        this.replay(s, g, "reverse");
                        this.returnGroup(s, g, a);
                        if (this.has(s, 5, 2)) { this.echo(s, g, "echo"); echoed = true; }
                        if (this.has(s, 5, 6)) {
                            const batch = s.cache.filter(x => x.members.length === 1).slice();
                            let count = 0;
                            for (const x of batch) if (count < 2 && this.used(s.sky) < this.capacity(s)) {
                                this.returnGroup(s, x); count++;
                            }
                        }
                    } else {
                        newGroup = this.shadow(s, "guide");
                        if (branch === "pinpoint") {
                            const g = this.find(s.sky, a.target);
                            if (!g.members.some(x => x.kind === "guide" && !this.mature(s, g, x)))
                                throw new Error("点破须选择含未成熟引影的剑组");
                            s.pinpoint = g.id;
                            s.pinpointAt = a.enemyAction ?? 1;
                            this.log(s, `点破预约敌第${s.pinpointAt}行动`);
                        }
                    }
                }
            }
            if (a.move === "fall" && s.outcome === "active") {
                if (branch === "finish") this.finisher(s);
                else {
                    const groups = s.sky.filter((g, i) => !(a.keep && i === 0));
                    if (a.keep && s.sky[0]?.members.some(x => x.id === a.absorb))
                        throw new Error("同一道剑影不能同时保留和纳入");
                    if (!groups.length && a.absorb === undefined) throw new Error("没有可落下的剑影");
                    if (a.keep && !s.firstKeep) {
                        const root = s.sky[0];
                        root.members.forEach(x => x.age = Math.min(this.ageCap(s, root), x.age + 1));
                        s.firstKeep = true; this.log(s, "留锋养势：本命加一势");
                    }
                    if (branch === "delay") {
                        if (s.delayed) throw new Error("已有悬落预约");
                        if (![1, 2, 3].includes(a.enemyAction)) throw new Error("悬落时机须为第1／2／3行动");
                        if (a.absorb !== undefined) this.absorb(s, a.absorb);
                        s.delayed = { at: a.enemyAction, ids: groups.flatMap(g => g.members
                            .filter(x => x.id !== a.absorb).map(x => x.id)),
                            keep: false, retain: this.retention(s) };
                        this.log(s, `预约敌第${a.enemyAction}行动前悬落`);
                    } else this.fallGroups(s, groups, "fall", true, this.retention(s), a);
                }
            }
            if (s.outcome === "active" && newGroup) s.sky.push(newGroup);
            if (s.outcome === "active") {
                if (echoed && a.echo !== undefined) throw new Error("本次额外余响已由催锋或回升使用，请取消三才余响选择");
                if (a.form !== undefined && (!newGroup && a.move !== "wind")) throw new Error("本次行动不允许成阵");
                this.form(s, a.form);
                this.overflow(s);
                if (!echoed && newGroup && s.sky.some(g => g.members.includes(newGroup!.members[0])) && a.echo !== undefined) {
                    const triad = s.sky.some(g => this.array(g) === "三才") || this.bodyArray(s) === "三才";
                    if (!triad) throw new Error("尚无三才余响权限");
                    const g = s.sky.find(g => g.members.some(x => x.id === a.echo));
                    if (!g) throw new Error("余响目标无效");
                    this.echo(s, g, "echo", true, this.array(g) === "三才" && this.bodyArray(s) === "三才" ? 120 : 100, a.echo);
                }
                s.marks = Math.min(this.markCap(s), Math.max(s.marks, s.body.filter(x => x.kind === "guide").length * 2));
                if (a.move === "end") s.ap = 0;
                if (s.ap === 0) this.endTurn(s);
            }
            this.validateState(s);
            return { ok: true, state: s };
        } catch (e) { return { ok: false, reason: (e as Error).message, state: this.clone(original) }; }
    }
    static intents(s: ManualTestState): EnemyIntent[] {
        const attack = (percent: number, label = "攻击") => ({ kind: "attack", percent, label } as EnemyIntent);
        let plan: EnemyIntent[];
        switch (s.setup.style) {
            case "dummy": plan = [1, 2, 3].map(() => ({ kind: "wait", percent: 0, label: "待机" })); break;
            case "assault": plan = [attack(80, "快斩"), attack(80, "连斩"), attack(140, "重击")]; break;
            case "defensive": plan = [{ kind: "guard", percent: 200, label: "架盾" }, attack(90),
                { kind: "heal", percent: 60, label: "调息" }]; break;
            case "burst": plan = s.round % 2 === 1 ?
                [{ kind: "charge", percent: 0, label: "蓄力" }, { kind: "guard", percent: 150, label: "固守" }, attack(50, "试探")] :
                [attack(100, "破势"), attack(120, "追击"),
                    attack(s.enemy.charged ? 330 : 220, "蓄力重斩")]; break;
        }
        let mana = s.enemy.mp;
        return plan.map(intent => {
            const mpCost = intent.kind === "heal" ? 5 : intent.kind === "guard" ? 3 :
                intent.kind === "charge" || intent.percent > 100 && intent.kind === "attack" ? 4 : 0;
            if (mana < mpCost) return intent.kind === "attack" ? { ...attack(100, "普通斩"), mpCost: 0 } :
                { kind: "wait", percent: 0, label: "法力不足", mpCost: 0 };
            mana -= mpCost; return { ...intent, mpCost };
        });
    }
    private static respond(s: ManualTestState, g: SwordGroup, manual: boolean, extra = 100): number {
        if (!s.sky.includes(g) || g.responded || (!manual && g.members.every(x => this.mature(s, g, x)))) return 0;
        const members = g.members.filter(x => manual || !this.mature(s, g, x));
        g.responded = true;
        this.log(s, `${this.groupName(g)} 应剑`);
        this.echo(s, g, "echo", manual, extra);
        if (this.has(s, 3, 4)) for (const x of members) x.age = Math.min(this.ageCap(s, g), x.age + 1);
        return this.has(s, 3, 6) && g.members.length === 3 ? 2 : 1;
    }
    private static responseDone(s: ManualTestState, index: number, weight = 1): void {
        if (s.outcome !== "active") return;
        const before = s.responseCount;
        s.responseCount += weight;
        if (this.has(s, 4, 6) && !s.responseEnergy) {
            s.energy = Math.min(9, s.energy + 1); s.responseEnergy = true;
            this.log(s, `应剑回元 ${s.energy}`);
        }
        if (this.has(s, 3, 6) && before < 2 && s.responseCount >= 2 && !s.cutAt) s.cutAt = index + 1;
    }
    private static endTurn(s: ManualTestState): void {
        this.log(s, "己方回合结束");
        for (const g of s.sky.slice()) for (const x of g.members.slice()) {
            if (s.outcome !== "active") return;
            if (this.mature(s, g, x)) continue;
            this.echo(s, g, "hover", false, 100, x.id);
            x.age = Math.min(this.ageCap(s, g), x.age + 1);
        }
        s.sky.forEach(g => g.responded = false); s.responseCount = 0; s.cutAt = 0;
        s.enemy.shield = 0;
        for (let i = 1; i <= 3 && s.outcome === "active"; i++) {
            const intent = s.intentions[i - 1], attacking = intent.kind === "attack";
            let response = 0, reduction = s.cutAt === i ? 25 : 0;
            const reserved = (g: SwordGroup) =>
                s.ambush === g.id && i < s.ambushAt || s.pinpoint === g.id && i < s.pinpointAt;
            let post: SwordGroup | undefined;
            this.log(s, `敌行动${i}·${intent.label}${reduction ? "（截招削弱25%）" : ""}`);
            if (s.delayed && s.delayed.at === i) {
                const plan = s.delayed; s.delayed = null;
                const groups: SwordGroup[] = [];
                for (const g of s.sky.slice()) {
                    const members = g.members.filter(x => plan.ids.includes(x.id));
                    if (!members.length) continue;
                    if (members.length === g.members.length) groups.push(g);
                    else {
                        const singles = g.members.map(x => ({ id: x.id, members: [x], responded: g.responded }));
                        s.sky.splice(s.sky.indexOf(g), 1, ...singles);
                        groups.push(...singles.filter(row => plan.ids.includes(row.id)));
                    }
                }
                if (groups.length) { this.fallGroups(s, groups, "fall", true, plan.retain); response = 1; }
            }
            if (!response && s.pinpoint !== null && s.pinpointAt === i) {
                const g = s.sky.find(g => g.id === s.pinpoint);
                if (g && (response = this.respond(s, g, true))) {
                    s.pinpoint = null; reduction = Math.max(reduction, this.has(s, 3, 6) ? 30 : 20);
                    this.log(s, `点破：敌第${i}行动削弱${reduction}%`);
                }
            }
            if (!response && attacking && s.ambush !== null && s.ambushAt === i) {
                const g = s.sky.find(g => g.id === s.ambush);
                if (g && (response = this.respond(s, g, true))) s.ambush = null;
            }
            if (!response && this.has(s, 3, 6)) {
                const g = s.sky.find(g => !reserved(g) && !g.responded && g.members.some(x => !this.mature(s, g, x)));
                if (g) {
                    if (attacking && g.members.every(x => x.kind === "edge")) post = g;
                    else response = this.respond(s, g, false);
                }
            }
            if (response) this.responseDone(s, i, response);
            if (s.outcome !== "active") break;
            s.enemy.mp -= intent.mpCost || 0;
            let hpLoss = 0;
            const factor = (100 - reduction) / 100;
            if (attacking) {
                const amount = Math.round(s.enemy.attack * intent.percent / 100 * factor);
                const absorbed = Math.min(amount, s.player.shield); s.player.shield -= absorbed;
                hpLoss = Math.min(s.player.hp, amount - absorbed);
                s.player.hp -= hpLoss; s.totals.taken += hpLoss;
                this.log(s, `${intent.label} 伤害${hpLoss}／抵盾${absorbed}`);
                if (i === 3 && s.round % 2 === 0) s.enemy.charged = false;
                if (s.player.hp <= 0) this.finish(s, "defeat");
            }
            if (intent.kind === "guard") {
                const shield = Math.round(s.enemy.defense * intent.percent / 100 * factor);
                s.enemy.shield += shield; this.log(s, `敌护体+${shield}`);
            }
            if (intent.kind === "heal") {
                const n = Math.min(s.enemy.maxHp - s.enemy.hp, Math.round(s.enemy.attack * intent.percent / 100 * factor));
                s.enemy.hp += n; this.log(s, `敌恢复${n}`);
            }
            if (intent.kind === "charge") s.enemy.charged = true;
            if (!response && s.outcome === "active" && attacking) {
                const g = post || (this.has(s, 3, 2) ? s.sky.find(g => !reserved(g) && !g.responded &&
                    g.members.every(x => x.kind === "edge") && g.members.some(x => !this.mature(s, g, x))) : undefined);
                if (g) {
                    const weight = this.respond(s, g, false, hpLoss === 0 ? 150 : 100);
                    if (weight) this.responseDone(s, i, weight);
                }
            }
        }
        s.ambush = null; s.pinpoint = null;
        if (s.outcome !== "active") return;
        s.round++; s.ap = 3; s.potionUsed = false; s.firstRoot = false; s.bodyAttacked = []; s.bodySynced = [];
        s.guideBodyUsed = false; s.activeEnergy = 0; s.responseEnergy = false;
        s.firstReorder = false; s.firstKeep = false; s.reverseUsed = false;
        s.player.shield = this.permission(s, "玄壁") ? Math.min(this.h(s), s.player.shield) : 0;
        for (const x of s.body.filter(x => x.kind === "guard")) this.shield(s,
            this.h(s) * 0.5 * (1 + s.energy * 0.05) * (this.bodyArray(s) === "玄壁" ? 1.5 : 1), "守身剑温养");
        // Snapshot once. Returns fill free slots only; no return processes new cache entries.
        if (this.has(s, 5, 1)) {
            let count = 0;
            for (const g of s.cache.slice()) {
                if (s.outcome !== "active") break;
                if (!this.has(s, 5, 6) && count >= 1) break;
                if (this.used(s.sky) + this.slots(g) <= this.capacity(s)) {
                    this.returnGroup(s, g); count++;
                    if (this.has(s, 5, 2)) this.echo(s, g, "echo");
                }
            }
        }
        s.intentions = this.intents(s);
        this.log(s, `己方回合开始 · 3行动 · 天${this.used(s.sky)}/${this.capacity(s)}悬`);
    }
    static validateState(s: ManualTestState): void {
        const shadows = [...s.sky.flatMap(g => g.members), ...s.body, ...s.cache.flatMap(g => g.members)];
        if (new Set(shadows.map(x => x.id)).size !== shadows.length) throw new Error("剑影身份重复");
        if (this.used(s.sky) > this.capacity(s) || this.used(s.cache) > 6 ||
            s.body.length > this.bodyCapacity(s) || s.sky.some(g => ![1, 3].includes(g.members.length) ||
                (g.members.length === 3 && !this.array(g))) ||
            s.sky.filter(g => g.members.length === 3).length > 2)
            throw new Error("剑影容量异常");
        if (s.player.hp < 0 || s.enemy.hp < 0 || s.player.mp < 0 ||
            s.ap < 0 || s.ap > 3 || s.energy < 0 || s.energy > (this.has(s, 4, 6) ? 9 : 6) ||
            !Number.isInteger(s.orbit) || s.orbit < 0 || s.orbit > C.orbitNeed)
            throw new Error("战斗资源异常");
    }
}
