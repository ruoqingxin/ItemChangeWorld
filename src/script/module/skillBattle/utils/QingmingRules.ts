import type { RogueAction, RogueCounters, RogueEnemyIntent, RogueItem, RogueLoadout, RogueMove, RogueResult, RogueSetup, RogueState } from "../types/QingmingTypes";
import { QingmingConfig as C } from "./QingmingConfig";
import { GuzongEnemyRules as E } from "./GuzongEnemyRules";
import { WeaponTrialRules as W } from "./WeaponTrialRules";
import { EquipmentTrialRules as G } from "./EquipmentTrialRules";


export class QingmingRules {
    static actionLimit(s: Pick<RogueState, "setup">): number { return s.setup.singleAction ? 1 : 3; }
    static clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
    static has(s: RogueLoadout, item: RogueItem): boolean {
        return s.passives.includes(item) || s.core === item || Object.values(s.mutations).includes(item);
    }
    static build(s: RogueLoadout): RogueItem[] { return [...s.passives, ...Object.values(s.mutations), ...(s.core ? [s.core] : [])]; }
    static validateLoadout(s: RogueLoadout): void {
        if(!s || !Array.isArray(s.acquired) || !Array.isArray(s.passives) || !Array.isArray(s.offers) ||
            !s.mutations || Array.isArray(s.mutations) || !s.offerRoles ||
            !Number.isSafeInteger(s.rng) || s.rng<1 || s.rng>2147483646 ||
            new Set(s.acquired).size!==s.acquired.length || new Set(s.passives).size!==s.passives.length ||
            new Set(s.offers).size!==s.offers.length || s.offers.length>3 ||
            s.acquired.some(k=>!C.items[k]) || s.passives.some(k=>C.items[k]?.type!=="passive") ||
            s.core!==null && C.items[s.core]?.type!=="core" ||
            Object.entries(s.mutations).some(([slot,k])=>C.items[k]?.type!=="mutation" || C.items[k].slot!==slot) ||
            this.build(s).some(k=>!s.acquired.includes(k) || !this.supported(s,k)) ||
            s.offers.some(k=>!this.eligible(s,k)) ||
            Object.keys(s.offerRoles).some(k=>!s.offers.includes(k as RogueItem)) ||
            s.offers.some(k=>!Object.prototype.hasOwnProperty.call(C.offerRoles,s.offerRoles[k])))
            throw new Error("功法构筑快照无效");
    }
    static counters(): RogueCounters {
        return { damage: 0, taken: 0, shield: 0, mpSpent: 0, bloodSpent: 0, actions: 0,
            healUsed: 0, manaUsed: 0, skills: {}, events: {} };
    }
    static start(d: RogueSetup): RogueState {
        if (!d || !Object.prototype.hasOwnProperty.call(C.styles, d.style)) throw new Error("敌阵无效");
        if (!Object.prototype.hasOwnProperty.call(C.pressures, d.pressure)) throw new Error("连战压力无效");
        if (d.enemyId != null && (!Object.prototype.hasOwnProperty.call(E.enemies, d.enemyId) ||
            d.style !== "guzong" || d.battles !== 1)) throw new Error("指定敌人须选择古宗单场");
        for (const [key, lo, hi] of [["battles", 1, 20], ["seed", 1, 2147483646],
            ["healPotions", 0, 99], ["manaPotions", 0, 99]] as const)
            if (!Number.isSafeInteger(d[key]) || d[key] < lo || d[key] > hi) throw new Error(`${key}超出范围`);
        for (const actor of [d.player, d.enemy]) for (const key of ["hp", "mp", "attack", "defense"])
            if (!actor || !Number.isSafeInteger(actor[key]) || actor[key] < (key === "hp" ? 1 : 0) || actor[key] > 1000000)
                throw new Error("属性须为0至1000000整数，生命至少1");
        const s: RogueState = {
            setup: this.clone(d), revision: 0, phase: "fighting", battle: 0, round: 1, ap: 3,
            player: { ...d.player, maxHp: d.player.hp, maxMp: d.player.mp, shield: 0 },
            enemy: { ...d.enemy, maxHp: d.enemy.hp, maxMp: d.enemy.mp, shield: 0, charged: false, style: "guzong", tier: "普通" },
            enemyPlan: E.lineup(d), foe: E.fresh(null),
            acquired: [], passives: [], mutations: {}, core: null, offers: [], offerRoles: {}, rng: d.seed, rewards: [],
            flying: 0, wounds: 0, firstActive: false, fallUsed: false, wave: false, counterAttacks: 0, lostAP: 0,
            momentum: 0, pendingSword: 0, lastActive: null, forms: [], siphonUses: 0,
            suppression: [0, 0, 0], intentions: [], potions: { heal: d.healPotions, mana: d.manaPotions }, potionUsed: false,
            fightStart: { hp: d.player.hp, mp: d.player.mp }, fight: this.counters(), totals: this.counters(), reports: [], logs: [],
        };
        if (d.armorMitigation !== undefined && typeof d.armorMitigation !== "boolean") throw new Error("护甲开关无效");
        if (d.singleAction !== undefined && typeof d.singleAction !== "boolean") throw new Error("行动规则无效");
        if (d.weaponTrial) s.weapon = W.create(d.weaponTrial, d.seed);
        if (d.armorTrial) s.armor = G.create("armor", d.armorTrial, d.seed);
        if (d.accessoryTrial) s.accessory = G.create("accessory", d.accessoryTrial, d.seed);
        if (d.combatTrial) {
            const p = d.combatTrial;
            if ([p.edge,p.guide,p.guideMp,p.fall,p.guard,p.wind,p.shieldAttack,p.shieldArmor,p.shieldCap,p.basicMana,
                ...Object.values(p.costs),...Object.values(p.enemyHp)].some(n => !Number.isFinite(n) || n < 0 || n > 100) ||
                !Number.isInteger(p.basicMana) || Object.values(p.costs).some(n => !Number.isInteger(n)) ||
                p.shieldCap <= 0 || Object.values(p.enemyHp).some(n => n <= 0)) throw new Error("试调倍率无效");
        }
        this.beginFight(s);
        // 新局满血满蓝；后续战斗只调整上限，不因属性增长回血回蓝。
        if (G.enabled(s)) {
            s.player.hp = s.player.maxHp; s.player.mp = s.player.maxMp;
            s.fightStart = { hp: s.player.hp, mp: s.player.mp };
        }
        return s;
    }
    private static log(s: RogueState, text: string): void {
        s.logs.push(`[战${s.battle}/回${s.round}] ${text}`);
        if (s.logs.length > 400) s.logs.splice(0, s.logs.length - 400);
    }
    private static count(s: RogueState, key: string, n = 1, map?: "skills" | "events"): void {
        for (const target of [s.totals, s.fight]) {
            if (map) target[map][key] = (target[map][key] || 0) + n;
            else target[key] += n;
        }
    }
    private static resetTurn(s: RogueState): void {
        s.firstActive = false; s.fallUsed = false; s.wave = false; s.counterAttacks = 0; s.lostAP = 0;
        s.potionUsed = false; s.suppression = Array(this.actionLimit(s)).fill(0); s.ap = this.actionLimit(s);
        s.siphonUses = 0;
    }
    private static beginFight(s: RogueState): void {
        W.beginFight(s);
        G.beginFight(s);
        s.battle++; s.round = 1; s.phase = "fighting"; s.flying = 0; s.wounds = 0; s.player.shield = 0;
        s.momentum = 0; s.pendingSword = 0; s.lastActive = null; s.forms = [];
        this.resetTurn(s); s.fight = this.counters(); s.fightStart = { hp: s.player.hp, mp: s.player.mp };
        const enemyId = s.enemyPlan[s.battle - 1] || null;
        s.foe = E.fresh(enemyId);
        const tier = E.enemies[enemyId].tier;
        const base = s.setup.enemy, stage = Math.min(3, Math.floor((s.battle - 1) / 3));
        const pressure = C.pressures[s.setup.pressure];
        const hp = Math.max(1, Math.round(base.hp * (tier === "首领" ? 3 : tier === "精英" ? 1.6 : 1) *
            (s.setup.combatTrial?.enemyHp[tier] ?? C.guzongTempo.hp[tier]) *
            (1 + stage * pressure.hp)));
        const style = "guzong" as const;
        s.enemy = { ...base, hp, maxHp: hp, maxMp: base.mp, shield: 0, charged: false, style, tier,
            attack: Math.round(base.attack * (tier === "首领" ? 1.5 : tier === "精英" ? 1.2 : 1) *
                (1 + stage * pressure.attack)) };
        if (enemyId) s.enemy.shield = Math.min(s.enemy.defense * 6, Math.round(s.enemy.defense * (E.enemies[enemyId].opening || 0) / 100));
        E.playerTurn(s);
        G.playerTurn(s, this.equipmentHooks(s));
        s.intentions = this.intents(s); this.log(s, `${tier}·${E.title(s)}·${pressure.name}；生命${hp}，攻击${s.enemy.attack}；战内机制清空，血蓝和丹药继承`);
    }
    static flyingSource(s: RogueLoadout): boolean {
        return this.has(s, "swordcraft") || this.has(s, "flyingEdge") || this.has(s, "shieldWind");
    }
    private static supported(s: RogueLoadout, key: RogueItem): boolean {
        const flying = this.flyingSource(s);
        if (key === "swordUnity" || key === "salvo") return flying;
        if (key === "swordSiphon") return flying;
        if (["rupture", "pinGuide", "woundGuard"].includes(key)) return this.has(s, "wound");
        if (key === "endlessWound") return this.has(s, "rupture");
        if (key === "heavyEdge") return this.has(s, "storedEdge") || this.has(s, "meditation");
        if (key === "stillness") return this.has(s, "delayedFall");
        if (key === "dye") return this.has(s, "wound") &&
            (flying || this.has(s, "riposte") || this.has(s, "breakingWave") || this.has(s, "turnTables"));
        return true;
    }
    static eligible(s: RogueLoadout, key: RogueItem): boolean {
        if (!C.items[key] || s.acquired.includes(key)) return false;
        const item = C.items[key];
        const projected = { ...s, passives: s.passives.slice(), mutations: { ...s.mutations } };
        if (item.type === "core") projected.core = key;
        else if (item.type === "mutation") projected.mutations[item.slot] = key;
        else projected.passives.push(key);
        return this.build(projected).every(k => this.supported(projected, k));
    }
    static related(s: RogueLoadout, key: RogueItem): RogueItem[] {
        const item = C.items[key];
        const active = this.build(s).filter(k => !(item.type === "core" && k === s.core) &&
            !(item.slot && k === s.mutations[item.slot]));
        return active.filter(k => C.links.some(([a, b]) => a === key && b === k || b === key && a === k));
    }
    private static random(s: RogueLoadout, n: number): number {
        s.rng = s.rng * 16807 % 2147483647; return s.rng % n;
    }
    private static shuffle<T>(s: RogueLoadout, input: T[]): T[] {
        const rows = input.slice();
        for (let i = rows.length - 1; i > 0; i--) {
            const j = this.random(s, i + 1); [rows[i], rows[j]] = [rows[j], rows[i]];
        }
        return rows;
    }
    private static offer(s: RogueState): void {
        this.rollOffers(s, s.battle % 3 === 0);
        s.phase = s.offers.length ? "reward" : "between";
    }
    static rollOffers(s: RogueLoadout, milestone: boolean): void {
        const keys = Object.keys(C.items) as RogueItem[];
        const pool = this.shuffle(s, keys.filter(k => this.eligible(s, k) && (milestone || C.items[k].type !== "core")));
        const selected: RogueItem[] = []; s.offerRoles = {};
        const add = (key: RogueItem, role: typeof s.offerRoles[RogueItem]) => {
            if (key) { selected.push(key); s.offerRoles[key] = role; }
        };
        const weighted = (rows: RogueItem[]): RogueItem => {
            if (!rows.length) return null;
            const weights = rows.map(k => 1 + this.related(s, k).length * 2);
            let at = this.random(s, weights.reduce((a, b) => a + b, 0));
            for (let i = 0; i < rows.length; i++) { at -= weights[i]; if (at < 0) return rows[i]; }
            return rows[0];
        };
        const cores = pool.filter(k => C.items[k].type === "core");
        const anchored = cores.filter(k => (C.coreAnchors[k] || []).some(anchor => this.has(s, anchor)));
        if (milestone && cores.length) add(weighted(anchored.length ? anchored : cores), "core");
        else add(weighted(pool.filter(k => this.related(s, k).length > 0)), "extend");

        const ordinary = pool.filter(k => !selected.includes(k) && C.items[k].type !== "core");
        const unrelated = ordinary.filter(k => this.related(s, k).length === 0);
        const different = unrelated.find(k => !selected.some(old => C.items[old].family === C.items[k].family));
        const alternative = different || unrelated[0] || ordinary[0];
        add(alternative, unrelated.includes(alternative) ? "explore" : "random");
        for (const k of pool) if (!selected.includes(k) && selected.length < 3) add(k, "random");
        s.offers = this.shuffle(s, selected);
    }
    static choose(s: RogueLoadout, key: RogueItem): RogueItem | null {
        if (!s.offers.includes(key) || !this.eligible(s,key)) throw new Error("奖励已变化或替换会失去构筑前置");
        const item = C.items[key]; let replaced: RogueItem = null;
        if (item.type === "mutation") { replaced = s.mutations[item.slot] || null; s.mutations[item.slot] = key; }
        else if (item.type === "core") { replaced = s.core; s.core = key; }
        else s.passives.push(key);
        s.acquired.push(key);
        return replaced;
    }
    private static finish(s: RogueState, won: boolean): void {
        if (s.phase !== "fighting") return;
        W.endAction(s, this.weaponHooks(s));
        W.finish(s, won);
        G.finish(s, won, this.equipmentHooks(s));
        s.reports.push({ ...this.clone(s.fight), battle: s.battle, tier: s.enemy.tier, style: s.enemy.style,
            enemyId: s.foe.id, rounds: s.round,
            won, startHp: s.fightStart.hp, startMp: s.fightStart.mp, endHp: s.player.hp, endMp: s.player.mp,
            build: this.build(s), core: s.core, ...(s.weapon ? { weapon: this.clone(s.weapon) } : {}),
            ...(s.armor ? {armor:this.clone(s.armor)} : {}), ...(s.accessory ? {accessory:this.clone(s.accessory)} : {}) });
        s.ap = 0; s.flying = 0; s.wounds = 0; s.player.shield = 0; s.enemy.shield = 0; s.enemy.charged = false;
        s.momentum = 0; s.pendingSword = 0; s.lastActive = null; s.forms = [];
        s.foe = E.fresh(s.foe.id);
        s.suppression = [0, 0, 0]; s.intentions = []; s.offers = []; s.offerRoles = {};
        s.phase = !won ? "defeat" : s.battle >= s.setup.battles ? "complete" : "between";
        if (won && s.phase === "between" && s.battle <= 9) this.offer(s);
        this.log(s, won ? `胜利；生命${s.player.hp}，法力${s.player.mp}` : "倒下，本局终止");
    }
    private static weaponHooks(s: RogueState) {
        return { damage: (n: number) => this.damage(s, n, `武器·${W.names[s.weapon.roll.passive]}`, false, true),
            log: (text: string) => this.log(s, text) };
    }
    private static equipmentHooks(s: RogueState) {
        return { damage: (n: number) => this.damage(s, n, "反震", false, true),
            shield: (n: number) => this.shield(s, n), log: (text: string) => this.log(s, text) };
    }
    private static damage(s: RogueState, n: number, source: string, main = false, equipment = false): void {
        if (s.phase !== "fighting") return;
        n = W.armorDamage(n * (s.foe.vulnerable ? 1.2 : 1) * (main ? W.directMultiplier(s) : 1),
            s.enemy.defense, !!s.setup.armorMitigation);
        if (main && n > 0 && s.foe.id) {
            s.foe.hits = Math.min(3, s.foe.hits + 1);
            if (s.foe.formation && s.foe.hits >= (s.setup.singleAction ? 1 : 3)) {
                s.foe.formation = false; this.count(s, "enemyArrayBreak", 1, "events"); this.log(s, "本体命中达标，剑阵已拆");
            }
        }
        const shieldBefore = s.enemy.shield, blocked = Math.min(s.enemy.shield, n);
        s.enemy.shield -= blocked; const loss = Math.min(s.enemy.hp, n - blocked);
        if (s.foe.id && !s.foe.acting && shieldBefore > 0 && s.enemy.shield === 0 && !s.foe.broken) {
            s.foe.broken = true; this.count(s, "enemyBreak", 1, "events"); this.log(s, "实际破盾");
        }
        s.enemy.hp -= loss; this.count(s, "damage", loss);
        if (s.weapon?.action && !equipment) {
            s.weapon.action.hpDamage += loss;
            if (shieldBefore > 0 && !s.enemy.shield) s.weapon.action.broke = true;
        }
        if (equipment) W.count(s, source === "反震" ? "equipmentDamage" : "weaponDamage", loss);
        this.log(s, `${source} 伤害${loss}${blocked ? ` / 抵盾${blocked}` : ""}`);
        if (!s.enemy.hp) this.finish(s, true);
    }
    private static addWound(s: RogueState): void {
        if (s.phase !== "fighting" || !this.has(s, "wound")) return;
        const before = s.wounds; s.wounds = Math.min(6, s.wounds + 1);
        if (s.wounds > before) this.count(s, "woundAdded", 1, "events");
    }
    private static extraAttack(s: RogueState, n: number, kind: "flying" | "counter"): void {
        if (s.phase !== "fighting") return;
        if (kind === "flying" && this.has(s, "swordSiphon") && s.siphonUses < 2) {
            s.siphonUses++;
            const gain = Math.min(1, s.player.maxMp - s.player.mp);
            s.player.mp += gain;
            if (gain) this.count(s, "siphon", gain, "events");
        }
        if (this.has(s, "dye")) this.addWound(s);
        this.count(s, kind, 1, "events"); this.damage(s, n, kind === "flying" ? "飞剑" : "格挡反击");
    }
    private static flyingAttack(s: RogueState, count: number, ratio = 0.3): void {
        for (let i = 0; i < count && s.phase === "fighting"; i++) this.extraAttack(s, G.attack(s) * ratio, "flying");
    }
    private static addFlying(s: RogueState): void {
        if (s.phase !== "fighting") return;
        const before = s.flying; s.flying = Math.min(this.has(s, "swordUnity") ? 5 : 3, s.flying + 1);
        if (s.flying > before) { this.count(s, "summon", 1, "events"); this.log(s, `飞剑 ${s.flying}`); }
    }
    private static risky(s: RogueState): boolean { return this.has(s, "risk") && s.player.hp <= s.player.maxHp * 0.4; }
    private static addMomentum(s: RogueState, n: number): void {
        const gain = Math.min(n, 3 - s.momentum);
        s.momentum += gain;
        if (gain) { this.count(s, "momentum", gain, "events"); this.log(s, `积势 ${s.momentum}/3`); }
    }
    static shield(s: RogueState, amount: number): void {
        const n = Math.max(0, Math.min(Math.round(amount * (this.risky(s) ? 0.75 : 1)), G.shieldCap(s) - s.player.shield));
        s.player.shield += n; this.count(s, "shield", n); this.log(s, `护盾+${n}`);
    }
    private static intents(s: RogueState): RogueEnemyIntent[] { return E.intents(s); }
    private static enemyTurn(s: RogueState): void {
        if (!this.has(s, "swordUnity")) this.flyingAttack(s, s.flying);
        if (s.phase !== "fighting") return;
        s.foe.acting = true; s.foe.vulnerable = false;
        G.enemyStart(s);
        s.enemy.shield = 0;
        const wasCharged = s.enemy.charged;
        if (!s.setup.singleAction) s.enemy.charged = false;
        for (let i = 0; i < s.intentions.length && s.phase === "fighting"; i++) {
            const action = s.intentions[i], ratio = 1 - s.suppression[i] / 100;
            s.enemy.mp -= action.mpCost || 0;
            if (s.foe.id && action.kind !== "wait") this.count(s, "enemyActions", 1, "events");
            if (action.kind === "attack") {
                const percent = E.percent(s, action);
                if (s.foe.id && percent > action.percent) {
                    this.count(s, action.condition === "echo" ? "enemyEcho" : "enemyBonus", 1, "events");
                }
                const n = W.armorDamage(s.enemy.attack * percent / 100 * ratio, G.armor(s), !!s.setup.armorMitigation);
                const blocked = Math.min(n, s.player.shield), loss = Math.min(s.player.hp, n - blocked);
                s.player.shield -= blocked; s.player.hp -= loss; this.count(s, "taken", loss);
                this.log(s, `${i + 1} ${action.label} 承伤${loss} / 格挡${blocked}`);
                if (!s.player.hp) { this.finish(s, false); break; }
                if (action.shatter && s.player.shield) {
                    const removed = Math.min(s.player.shield, Math.floor(n * 0.5));
                    s.player.shield -= removed;
                    this.count(s, "enemyShatter", removed, "events"); this.log(s, `震盾额外削盾${removed}，不伤生命`);
                }
                G.hit(s, loss, this.equipmentHooks(s));
                if (s.phase !== "fighting") break;
                if (blocked > 0) {
                    let counter = this.has(s, "riposte") ? 0.5 : 0;
                    if (s.counterAttacks < 2) {
                        if (s.wave) counter += 0.8;
                        if (this.has(s, "turnTables") && s.lostAP > 0) {
                            counter += 0.5 + 0.6 * s.lostAP; this.count(s, "turnTables", 1, "events");
                        }
                    }
                    s.counterAttacks++;
                    if (counter) this.extraAttack(s, G.attack(s) * counter, "counter");
                }
            } else if (action.kind === "guard") {
                s.enemy.shield = Math.min(s.enemy.defense * 6, s.enemy.shield + Math.round(s.enemy.defense * action.percent / 100 * ratio));
            } else if (action.kind === "heal") {
                if (action.maxHpHeal) {
                    const gain = Math.min(s.enemy.maxHp - s.enemy.hp, Math.floor(s.enemy.maxHp * action.percent / 100 * ratio));
                    if (gain > 0 && s.foe.heals > 0) {
                        s.enemy.hp += gain; s.foe.heals--; this.count(s, "enemyHeal", gain, "events");
                        if (s.foe.id === "alchemist" && gain >= Math.ceil(s.enemy.maxHp * 0.04) && s.foe.heat < 2) {
                            s.foe.heat++; this.count(s, "enemyHeat", 1, "events");
                        }
                        this.log(s, `疗伤${gain}；余${s.foe.heals}次，炉温${s.foe.heat}`);
                    } else {
                        s.enemy.mp += (action.mpCost || 0) - 3;
                        s.enemy.shield = Math.min(s.enemy.defense * 6, s.enemy.shield + Math.round(s.enemy.defense * ratio));
                        this.log(s, "疗伤无效，改为100%防御护盾");
                    }
                } else s.enemy.hp = Math.min(s.enemy.maxHp, s.enemy.hp + Math.round(s.enemy.attack * action.percent / 100 * ratio));
            } else if (action.kind === "charge") s.enemy.charged = true;
            else if (action.kind === "blood") {
                const loss = Math.min(s.enemy.hp - 1, Math.max(1, Math.floor(s.enemy.maxHp * 0.03)));
                s.enemy.hp -= loss; s.foe.vulnerable = true;
                this.count(s, "enemyBlood", loss, "events"); this.log(s, `血炼自损${loss}，受伤+20%`);
            } else if (action.kind === "expose") {
                s.foe.vulnerable = true; this.count(s, "enemyWindow", 1, "events"); this.log(s, "收势暴露：受伤+20%");
            } else if (action.kind === "formation") { s.foe.formation = true; this.log(s, `布阵：下一玩家回合${s.setup.singleAction ? 1 : 3}次本体命中可拆阵`); }
            if (s.setup.singleAction && action.kind === "attack") {
                s.enemy.charged = false;
                if (action.condition === "formation") s.foe.formation = false;
            }
            if (s.phase === "fighting" && action.kind !== "wait" && s.wounds) {
                const before = s.enemy.hp;
                this.count(s, "woundTick", 1, "events"); this.damage(s, s.wounds * G.attack(s) * 0.05, "剑伤发作");
                if (s.phase === "fighting" && s.enemy.hp < before && this.has(s, "woundGuard")) {
                    this.count(s, "woundGuard", 1, "events"); this.shield(s, G.shieldPower(s) * 0.2);
                }
            }
        }
        if (s.phase !== "fighting") return;
        G.enemyEnd(s, this.equipmentHooks(s));
        if (!s.setup.singleAction && wasCharged && s.round % 2 === 0) s.enemy.charged = false;
        if (!s.setup.singleAction && s.foe.id && s.foe.formation && (s.foe.id === "arrayMaster" ? s.round % 2 === 0 : s.round % 3 === 2))
            s.foe.formation = false;
        if (!s.setup.singleAction || s.round % 3 === 0) s.wounds = Math.max(0, s.wounds - 1);
        s.player.shield = s.setup.singleAction ?
            Math.min(Math.floor(s.player.shield * (this.has(s, "retention") ? 1 : .5)),
                Math.round(G.shieldPower(s) * (this.has(s, "retention") ? 3 : 1.5))) :
            this.has(s, "retention") ? Math.min(Math.floor(s.player.shield / 2), Math.round(G.shieldPower(s) * 1.5)) : 0;
        if (s.pendingSword) {
            const damage = s.pendingSword; s.pendingSword = 0;
            this.count(s, "delayed", 1, "events"); this.damage(s, damage, "悬剑落下");
            if (s.phase !== "fighting") return;
        }
        s.round++; this.resetTurn(s);
        G.playerTurn(s, this.equipmentHooks(s));
        if (E.playerTurn(s)) { this.count(s, "enemyPhase", 1, "events"); this.log(s, "下一轮进入第二阶段；已执行意图不变"); }
        s.intentions = this.intents(s);
    }
    private static pay(s: RogueState, move: RogueMove): void {
        const cost = C.cost(move, s), paid = Math.min(cost, s.player.mp), missing = cost - paid;
        if (missing && (!this.has(s, "bloodMana") || s.player.hp <= missing * 2)) throw new Error("法力不足或血祭会致死");
        s.player.mp -= paid; s.player.hp -= missing * 2;
        this.count(s, "mpSpent", paid); this.count(s, "bloodSpent", missing * 2);
        G.paid(s, paid, this.equipmentHooks(s));
    }
    private static attack(s: RogueState, move: RogueMove, ratio: number, flat = 0): void {
        this.addWound(s);
        const read = s.foe.read === move ? 0.7 : 1;
        if (read < 1) this.count(s, "enemyRead", 1, "events");
        this.damage(s, (G.attack(s) * ratio + flat) * (move !== "basic" && this.risky(s) ? 1.35 : 1) *
            (move !== "basic" && this.has(s, "stillness") ? 0.75 : 1) * read, C.moves[move], true);
    }
    private static apply(s: RogueState, a: RogueAction): void {
        if (["complete", "defeat", "retreated"].includes(s.phase)) throw new Error("本局已结束");
        if (!a || !Object.prototype.hasOwnProperty.call(C.moves, a.move)) throw new Error("行动无效");
        const move = a.move;
        if (move === "choose") {
            if (s.phase !== "reward") throw new Error("当前没有可领取奖励");
            const item = C.items[a.choice], replaced = this.choose(s,a.choice);
            s.rewards.push({ battle: s.battle, offers: s.offers.slice(),
                roles: this.clone(s.offerRoles), choice: a.choice, replaced });
            s.offers = []; s.offerRoles = {}; s.phase = "between";
            this.log(s, `获得 ${item.name}${replaced ? `，替换${C.items[replaced].name}` : ""}`); return;
        }
        if (move === "next") {
            if (s.phase !== "between") throw new Error("须先领奖或本局已结束");
            this.beginFight(s); return;
        }
        if (move === "retreat") {
            if (!["between", "reward"].includes(s.phase)) throw new Error("只能在战间撤离");
            s.phase = "retreated"; s.offers = []; s.offerRoles = {}; return;
        }
        if (move === "heal" || move === "mana") {
            if (s.potionUsed) throw new Error("本回合已用药");
            const key = move === "heal" ? "hp" : "mp", max = move === "heal" ? "maxHp" : "maxMp";
            if (!s.potions[move] || s.player[key] >= s.player[max]) throw new Error("无库存或已满");
            s.potions[move]--; s.potionUsed = true;
            const n = Math.min(s.player[max] - s.player[key], Math.max(1, Math.round(s.player[max] * 0.3 * G.potionMultiplier(s))));
            s.player[key] += n; s.totals[move === "heal" ? "healUsed" : "manaUsed"]++;
            if (s.phase === "fighting") s.fight[move === "heal" ? "healUsed" : "manaUsed"]++;
            this.log(s, `${C.moves[move]} +${n}`);
            if (s.setup.singleAction && s.phase === "fighting") {
                s.ap--; this.count(s, "actions"); this.count(s, move, 1, "skills");
                s.lastActive = null; E.idle(s); this.enemyTurn(s);
            }
            return;
        }
        if (s.phase !== "fighting" || s.ap < 1) throw new Error("当前不能出招");
        if (move === "end") {
            G.earlyEnd(s, this.equipmentHooks(s));
            s.lostAP = s.ap;
            if (this.has(s, "meditation")) {
                s.player.mp = Math.min(s.player.maxMp, s.player.mp + s.ap * 2);
                this.addMomentum(s, s.ap); this.count(s, "meditation", 1, "events");
            }
            s.ap = 0;
            if (s.setup.singleAction) { this.count(s, "actions"); this.count(s, "end", 1, "skills"); s.lastActive = null; E.idle(s); }
            this.count(s, "earlyEnd", 1, "events"); this.enemyTurn(s); return;
        }
        if (move === "guide" && !this.has(s, "rupture") && a.enemyAction !== undefined &&
            (!Number.isInteger(a.enemyAction) || a.enemyAction < 1 || a.enemyAction > s.intentions.length)) throw new Error("敌行动序号无效");
        if (move === "fall" && s.fallUsed) throw new Error("落青冥每回合只能一次");
        W.beginAction(s, move, this.weaponHooks(s));
        this.pay(s, move); s.ap--; this.count(s, "actions"); this.count(s, move, 1, "skills");
        const active = ["edge", "wind", "guide", "fall"].includes(move), first = active && !s.firstActive;
        const tempo = active && this.has(s, "tempo") && s.lastActive && s.lastActive !== move ? 0.35 : 0;
        if (tempo) this.count(s, "tempo", 1, "events");
        s.lastActive = active ? move : null;
        if (active) s.firstActive = true;
        if (active) E.cast(s, move);
        else if (s.setup.singleAction) E.idle(s);
        if (move === "basic") {
            const momentum = s.momentum; s.momentum = 0;
            this.attack(s, move, 1 + momentum * 0.3);
            if (s.phase === "fighting") {
                const gain = Math.min(s.player.maxMp - s.player.mp,
                    ((s.foe.id ? s.setup.combatTrial?.basicMana ?? C.guzongTempo.basicMana : 0) + (this.has(s, "breathing") ? 4 : 0)));
                s.player.mp += gain;
                if (gain && s.foe.id) { this.count(s, "basicMana", gain, "events"); this.log(s, `普攻回灵${gain}`); }
            }
        } else if (move === "guard") this.shield(s, G.shieldPower(s) * (s.setup.combatTrial?.guard ?? 1.5));
        else if (move === "edge") {
            let ratio = this.has(s, "flyingEdge") ? 0.7 : 1.1;
            if (this.has(s, "heavyEdge")) {
                ratio = 1 + s.momentum * 0.9;
                if (s.momentum) this.count(s, "heavy", 1, "events");
                s.momentum = 0;
            }
            this.attack(s, move, ratio * (s.setup.combatTrial ? s.setup.combatTrial.edge / 1.1 : 1) + tempo);
        }
        else if (move === "wind") {
            s.wave ||= this.has(s, "breakingWave");
            const ratio = this.has(s, "shieldWind") ? 1.75 : this.has(s, "breakingWave") ? 1.875 : 2.5;
            this.shield(s, G.shieldPower(s) * (ratio * (s.setup.combatTrial ? s.setup.combatTrial.wind / 2.5 : 1) + tempo));
        } else if (move === "guide") {
            const body = this.has(s, "endlessWound") ? .375 : this.has(s, "pinGuide") ? .5 : .75;
            this.attack(s, move, body * (s.setup.combatTrial ? s.setup.combatTrial.guide / .75 : 1) + tempo,
                s.setup.combatTrial ? s.player.maxMp * s.setup.combatTrial.guideMp * body / .75 : 0);
            if (s.phase === "fighting") {
                if (this.has(s, "rupture")) {
                    const wounds = s.wounds;
                    s.wounds = this.has(s, "endlessWound") ? wounds - Math.ceil(wounds / 2) : 0;
                    if (s.wounds) this.count(s, "endless", 1, "events");
                    this.count(s, "rupture", 1, "events"); this.damage(s, wounds * G.attack(s) * 0.25, "割脉引爆");
                } else {
                    const at = (a.enemyAction ?? 1) - 1;
                    s.suppression[at] = Math.max(s.suppression[at], this.has(s, "pinGuide") ? 60 : 35);
                    if (this.has(s, "pinGuide")) { this.addWound(s); this.addWound(s); }
                    this.count(s, "suppress", 1, "events");
                }
            }
        } else if (move === "fall") {
            s.fallUsed = true; const flying = this.has(s, "salvo") ? s.flying : 0;
            if (flying) { s.flying = 0; this.count(s, "salvo", 1, "events"); }
            const ratio = this.has(s, "delayedFall") ? 0.7 : 1.7;
            let converted = 0;
            if (this.has(s, "shieldFall")) {
                converted = s.player.shield * 1.25; s.player.shield = 0;
                this.count(s, "shatter", 1, "events");
            }
            this.attack(s, move, ratio * (s.setup.combatTrial ? s.setup.combatTrial.fall / 1.7 : 1) + tempo, converted);
            if (s.phase === "fighting" && this.has(s, "delayedFall"))
                s.pendingSword = Math.round(G.attack(s) * 2.2 * (this.has(s, "stillness") ? 1.5 : 1));
            this.flyingAttack(s, flying, 0.6);
        }
        if (s.phase !== "fighting") return;
        if (first && this.has(s, "swordcraft")) this.addFlying(s);
        if (move === "edge" && this.has(s, "flyingEdge")) this.addFlying(s);
        if (move === "wind" && this.has(s, "shieldWind")) this.addFlying(s);
        if ((move === "guard" || move === "wind") && this.has(s, "storedEdge")) this.addMomentum(s, 1);
        if (move === "edge" && this.has(s, "swordUnity") && s.flying) {
            this.count(s, "unity", 1, "events"); this.flyingAttack(s, s.flying);
        }
        if (s.phase === "fighting" && active && this.has(s, "cycle") && !s.forms.includes(move)) {
            s.forms.push(move);
            if (s.forms.length === 3) {
                s.forms = []; this.count(s, "cycle", 1, "events");
                this.damage(s, G.attack(s) * 0.9, "三式归一");
                if (s.phase === "fighting") this.shield(s, G.shieldPower(s) * 0.75);
            }
        }
        G.action(s, move, this.equipmentHooks(s));
        W.endAction(s, this.weaponHooks(s));
        if (s.phase === "fighting" && !s.ap) this.enemyTurn(s);
    }
    static resolve(source: RogueState, action: RogueAction): RogueResult {
        const s = this.clone(source);
        try { this.apply(s, action); s.revision++; this.validateState(s); return { ok: true, state: s }; }
        catch (e) { return { ok: false, state: source, reason: (e as Error).message }; }
    }
    static validateState(s: RogueState): void {
        const int = (n: number, lo: number, hi: number) => {
            if (!Number.isSafeInteger(n) || n < lo || n > hi) throw new Error("状态边界异常");
        };
        int(s.ap, 0, this.actionLimit(s)); int(s.flying, 0, this.has(s, "swordUnity") ? 5 : 3); int(s.wounds, 0, 6);
        int(s.momentum, 0, 3); int(s.pendingSword, 0, (G.enabled(s) || s.setup.combatTrial ? s.player.attack + (s.accessory?.roll.passive === "dawn" ? s.accessory.roll.benefit : 0) : s.setup.player.attack) * 4);
        int(s.siphonUses, 0, 2);
        int(s.foe.hits, 0, 3); int(s.foe.heals, 0, 2); int(s.foe.heat, 0, 2);
        if (s.foe.casts.length > 3 || s.foe.casts.some(k => !["edge", "wind", "guide", "fall"].includes(k)))
            throw new Error("敌读招记录异常");
        if (s.enemyPlan.length !== s.setup.battles ||
            s.enemyPlan.some(k => !Object.prototype.hasOwnProperty.call(E.enemies, k))) throw new Error("敌阵异常");
        if (s.forms.length > 2 || new Set(s.forms).size !== s.forms.length ||
            s.forms.some(k => !["edge", "wind", "guide", "fall"].includes(k))) throw new Error("招式记录异常");
        if (this.build(s).some(k => !this.supported(s, k))) throw new Error("构筑前置缺失");
        for (const actor of [s.player, s.enemy]) {
            int(actor.hp, 0, actor.maxHp); int(actor.mp, 0, actor.maxMp);
            int(actor.shield, 0, actor === s.player ? G.shieldCap(s) : actor.defense * 6);
        }
        if (s.weapon) {
            int(s.weapon.durability, 0, s.weapon.roll.maxDurability);
            int(s.weapon.kills, 0, s.setup.battles);
            int(s.weapon.attacks, 0, Number.MAX_SAFE_INTEGER);
            int(s.weapon.charge, 0, Number.MAX_SAFE_INTEGER);
            if (s.weapon.action !== null) throw new Error("武器行动未结算");
        }
        for (const e of [s.armor, s.accessory]) if (e) {
            int(e.durability, 0, e.roll.maxDurability); int(e.calmUses, 0, 3);
            int(e.pendingHeal, 0, e.roll.benefit); int(e.phaseTaken, 0, Number.MAX_SAFE_INTEGER);
            if (e.forms.length > 3 || new Set(e.forms).size !== e.forms.length) throw new Error("装备招式计数异常");
        }
        int(s.potions.heal, 0, s.setup.healPotions); int(s.potions.mana, 0, s.setup.manaPotions);
        if (new Set(s.acquired).size !== s.acquired.length || new Set(s.offers).size !== s.offers.length) throw new Error("重复奖励");
        if (s.phase === "reward" && (!s.offers.length || s.offers.some(k => !this.eligible(s, k)))) throw new Error("奖励不可用");
        if (Object.keys(s.offerRoles).some(k => !s.offers.includes(k as RogueItem)) ||
            s.phase === "reward" && s.offers.some(k => !Object.prototype.hasOwnProperty.call(C.offerRoles, s.offerRoles[k])))
            throw new Error("奖励标记异常");
        if (s.phase === "fighting" && (s.player.hp < 1 || s.enemy.hp < 1 || s.intentions.length !== this.actionLimit(s) || s.ap < 1))
            throw new Error("战斗终止异常");
    }
}
