import type { RogueMove, RogueState } from "../types/QingmingTypes";
import type { EquipmentPassive, EquipmentRoll, EquipmentSetup, EquipmentSlot, EquipmentState } from "../types/EquipmentTrialTypes";
import { WeaponAttribute as A } from "../types/WeaponTrialTypes";
import { WeaponTrialRules as W } from "./WeaponTrialRules";

type Range = readonly [number, number];
type Hooks = { damage: (n: number) => void; shield: (n: number) => void; log: (text: string) => void };
const r = (...values: (number | Range)[]): Range[] => values.map(v => typeof v === "number" ? [v, v] : v);

// 防具和饰品仅用于独立测试；正式库存与配置导出不读取此表。
export class EquipmentTrialRules {
    static readonly bases = {
        armor: [
            { name: "青羽轻甲", attribute: A.Armor, durability: 24 },
            { name: "铁鳞甲", attribute: A.Armor, durability: 32 },
            { name: "山岳重甲", attribute: A.Armor, durability: 40 },
            { name: "护心衣", attribute: A.Hp, durability: 24 },
            { name: "玄纹袍", attribute: A.Hp, durability: 20 },
            { name: "凝神法衣", attribute: A.Mp, durability: 20 },
        ],
        accessory: [
            { name: "养元佩", attribute: A.Hp, durability: 16 },
            { name: "蕴灵珠", attribute: A.Mp, durability: 16 },
            { name: "玄铁环", attribute: A.Armor, durability: 22 },
            { name: "砺锋坠", attribute: A.Attack, durability: 22 },
            { name: "凝神簪", attribute: A.Mp, durability: 22 },
            { name: "血纹镯", attribute: A.Hp, durability: 22 },
        ],
    };
    static readonly names: Record<EquipmentPassive, string> = {
        iron: "铁衣", reguard: "回甲", reflect: "反震", fortify: "固守", revive: "续命", danger: "守危", ward: "护体", nourish: "养元",
        pulse: "灵息", frugal: "节用", return: "归灵", medicine: "药引", harmony: "合律", calm: "静虑", dawn: "启明", steady: "定心",
    };
    static readonly pools: Record<EquipmentSlot, EquipmentPassive[]> = {
        armor: ["iron", "reguard", "reflect", "fortify", "revive", "danger", "ward", "nourish"],
        accessory: ["pulse", "frugal", "return", "medicine", "harmony", "calm", "dawn", "steady"],
    };
    static readonly events = { equipmentHeal: "装备回血", equipmentMana: "装备回蓝", equipmentShield: "装备产盾",
        equipmentReflect: "反震次数", equipmentDamage: "装备扣血", equipmentRefund: "节用返蓝", equipmentHarmony: "合律次数" };
    static readonly ranges: Record<EquipmentPassive, { benefit: Range[]; threshold?: Range[] }> = {
        iron: { benefit: r([1,2],[2,3],[3,4],[4,5],[5,6],[6,8]), threshold: r(1,1,1,[1,2],2,2) },
        reguard: { benefit: r([2,3],[3,5],[5,7],[7,10],[10,13],[13,16]) },
        reflect: { benefit: r([2,3],[3,4],[4,6],[6,8],[8,10],[10,12]) },
        fortify: { benefit: r([1,2],[2,3],[3,4],[4,5],[5,6],[6,8]) },
        revive: { benefit: r([10,14],[14,19],[19,25],[25,32],[32,40],[40,48]) },
        danger: { benefit: r([2,3],[3,4],[4,5],[5,7],[7,9],[9,12]) },
        ward: { benefit: r([4,6],[6,8],[8,11],[11,14],[14,18],[18,22]) },
        nourish: { benefit: r([3,5],[5,7],[7,10],[10,13],[13,17],[17,22]) },
        pulse: { benefit: r([1,2],2,[2,3],3,[3,4],[4,5]), threshold: r(4,4,[3,4],3,[2,3],2) },
        frugal: { benefit: r(1,[1,2],2,[2,3],3,[3,4]) },
        return: { benefit: r([1,2],[2,3],[3,4],[4,6],[6,8],[8,10]) },
        medicine: { benefit: r([3,5],[5,7],[7,10],[10,13],[13,16],[16,20]) },
        harmony: { benefit: r(1,[1,2],2,[2,3],3,[3,4]), threshold: r([2,3],[3,4],[4,6],[6,8],[8,10],[10,12]) },
        calm: { benefit: r(1,[1,2],2,[2,3],3,[3,4]) },
        dawn: { benefit: r(1,[1,2],[2,3],[3,4],[4,5],[5,6]), threshold: r(1,1,1,[1,2],2,2) },
        steady: { benefit: r([1,2],2,[2,3],3,[3,4],[4,5]) },
    };
    static roll(slot: EquipmentSlot, d: EquipmentSetup, seed: number): EquipmentRoll {
        if (!d || !Number.isInteger(d.base) || !this.bases[slot][d.base - 1] ||
            !Number.isInteger(d.quality) || d.quality < 1 || d.quality > 6 ||
            d.passive !== undefined && !this.pools[slot].includes(d.passive) ||
            d.broken !== undefined && typeof d.broken !== "boolean") throw new Error("装备演练设置无效");
        let rng = (seed + (slot === "armor" ? 209759 : 314773)) % 2147483646 + 1;
        const random = ([lo, hi]: Range) => { rng = rng * 16807 % 2147483647; return lo + rng % (hi - lo + 1); };
        const stat = (attribute: A, table: typeof W.main) => {
            const band = random(W.windows[d.quality - 1]);
            return { attribute, band, value: random(table[attribute][band - 1]) };
        };
        const base = this.bases[slot][d.base - 1], main = stat(base.attribute, W.main);
        const secondary = stat(random([1,4]), W.secondary), pool = this.pools[slot];
        const passive = d.passive ?? pool[random([0,7])], ranges = this.ranges[passive];
        return { base: d.base, quality: d.quality, main, secondary, passive,
            benefit: random(ranges.benefit[d.quality - 1]),
            threshold: ranges.threshold ? random(ranges.threshold[d.quality - 1]) : 0,
            maxDurability: base.durability + (d.quality - 1) * 4 };
    }
    static create(slot: EquipmentSlot, d: EquipmentSetup, seed: number): EquipmentState {
        const roll = this.roll(slot, d, seed);
        return { roll, durability: d.broken ? 0 : roll.maxDurability, applied: {hp:0,mp:0,attack:0,defense:0},
            used:false,pendingHeal:0,guarded:false,refunded:false,forms:[],harmony:false,calmUses:0,phaseTaken:0,reflected:false };
    }
    static enabled(s: RogueState): boolean { return !!(s.weapon || s.armor || s.accessory); }
    static beginFight(s: RogueState): void {
        // 三件贡献合并后再截断血蓝，避免中间只计算武器时误减当前资源。
        const sum = {hp:0,mp:0,attack:0,defense:0}, keys = {1:"hp",2:"mp",3:"defense",4:"attack"} as const;
        if (s.weapon) Object.assign(sum, s.weapon.applied);
        for (const slot of ["armor", "accessory"] as const) {
            const e = s[slot]; if (!e) continue;
            const gain = {hp:0,mp:0,attack:0,defense:0};
            for (const stat of [e.roll.main, e.roll.secondary]) gain[keys[stat.attribute]] += stat.value;
            for (const key of Object.keys(gain)) { gain[key] = Math.round(gain[key] * (e.durability ? 1 : .5)); sum[key] += gain[key]; }
            e.applied = gain; e.used = false; e.pendingHeal = 0; e.calmUses = 0;
            e.guarded = e.refunded = e.harmony = e.reflected = false; e.forms = []; e.phaseTaken = 0;
        }
        if (!this.enabled(s)) return;
        s.player.attack = s.setup.player.attack + sum.attack;
        s.player.defense = s.setup.player.defense + sum.defense;
        s.player.maxHp = s.setup.player.hp + sum.hp; s.player.maxMp = s.setup.player.mp + sum.mp;
        s.player.hp = Math.min(s.player.hp, s.player.maxHp); s.player.mp = Math.min(s.player.mp, s.player.maxMp);
    }
    static armor(s: RogueState): number {
        const e = s.armor, p = e?.roll;
        return s.player.defense + (!p ? 0 :
            p.passive === "iron" && s.round <= p.threshold || p.passive === "fortify" && e.guarded ||
            p.passive === "danger" && s.player.hp <= s.player.maxHp * .35 ? p.benefit : 0);
    }
    static attack(s: RogueState): number {
        const p = s.accessory?.roll;
        return s.player.attack + (p?.passive === "dawn" && s.round <= p.threshold ? p.benefit : 0);
    }
    static shieldPower(s: RogueState): number {
        const p = s.setup.combatTrial;
        return p ? this.attack(s) * p.shieldAttack + s.player.defense * p.shieldArmor : s.player.defense;
    }
    static shieldCap(s: RogueState): number {
        return s.setup.combatTrial ? Math.round(this.shieldPower(s) * s.setup.combatTrial.shieldCap) :
            (this.enabled(s) ? s.player.defense : s.setup.player.defense) * 6;
    }
    static restore(s: RogueState, key: "hp" | "mp", amount: number, hooks: Hooks): void {
        if (s.player.hp <= 0) return;
        const gain = Math.min(s.player[key === "hp" ? "maxHp" : "maxMp"] - s.player[key], amount);
        s.player[key] += gain; W.count(s, key === "hp" ? "equipmentHeal" : "equipmentMana", gain);
        if (gain) hooks.log(`装备恢复${key === "hp" ? "生命" : "法力"}${gain}`);
    }
    static shield(s: RogueState, n: number, hooks: Hooks): void {
        const before = s.player.shield; hooks.shield(n); W.count(s, "equipmentShield", s.player.shield - before);
    }
    static playerTurn(s: RogueState, hooks: Hooks): void {
        for (const e of [s.armor, s.accessory]) if (e) {
            e.guarded = e.refunded = e.harmony = false;
            if (!s.setup.singleAction) e.forms = [];
            if (e.pendingHeal) { this.restore(s, "hp", e.pendingHeal, hooks); e.pendingHeal = 0; }
        }
        const p = s.accessory?.roll;
        if (p?.passive === "pulse" && s.round % p.threshold === 0 && s.round <= p.threshold * 3)
            this.restore(s, "mp", p.benefit, hooks);
        // 启明消退时收紧护盾上限，不增加或恢复护盾。
        s.player.shield = Math.min(s.player.shield, this.shieldCap(s));
    }
    static paid(s: RogueState, paid: number, hooks: Hooks): void {
        const e = s.accessory;
        if (e?.roll.passive === "frugal" && !e.refunded && paid > 0) {
            e.refunded = true;
            const amount = Math.min(paid, e.roll.benefit);
            this.restore(s, "mp", amount, hooks); W.count(s, "equipmentRefund", amount);
        }
    }
    static action(s: RogueState, move: RogueMove, hooks: Hooks): void {
        if (s.phase !== "fighting" || s.player.hp <= 0 || s.enemy.hp <= 0) return;
        const a = s.armor;
        if (move === "guard" && a) {
            if (!a.guarded && a.roll.passive === "reguard") this.shield(s, a.roll.benefit, hooks);
            a.guarded = true;
        }
        const e = s.accessory;
        if (e?.roll.passive === "harmony" && !e.harmony && ["edge","wind","guide","fall"].includes(move)) {
            if (!e.forms.includes(move)) e.forms.push(move);
            if (e.forms.length === 3) {
                e.harmony = true; W.count(s, "equipmentHarmony");
                this.restore(s, "mp", e.roll.benefit, hooks); this.shield(s, e.roll.threshold, hooks);
                if (s.setup.singleAction) e.forms = [];
            }
        }
    }
    static earlyEnd(s: RogueState, hooks: Hooks): void {
        const e = s.accessory;
        if (e?.roll.passive === "calm" && e.calmUses < 3 && s.ap > 0) {
            e.calmUses++; this.restore(s, "mp", e.roll.benefit, hooks);
        }
    }
    static enemyStart(s: RogueState): void {
        for (const e of [s.armor, s.accessory]) if (e) { e.phaseTaken = 0; e.reflected = false; }
    }
    static hit(s: RogueState, loss: number, hooks: Hooks): void {
        for (const e of [s.armor, s.accessory]) if (e) e.phaseTaken += loss;
        if (s.player.hp <= 0 || s.enemy.hp <= 0 || loss <= 0) return;
        const e = s.armor, p = e?.roll; if (!p) return;
        if (p.passive === "reflect" && !e.reflected) {
            e.reflected = true; W.count(s, "equipmentReflect"); hooks.damage(p.benefit);
        } else if (p.passive === "ward" && !e.used) {
            e.used = true; this.shield(s, p.benefit, hooks);
        } else if (p.passive === "revive" && !e.used && s.player.hp <= s.player.maxHp * .35) {
            e.used = true; e.pendingHeal = p.benefit;
        }
    }
    static enemyEnd(s: RogueState, hooks: Hooks): void {
        const e = s.accessory;
        if (e?.roll.passive === "steady" && s.round === 1 && e.phaseTaken === 0 && !e.used) {
            e.used = true; this.restore(s, "mp", e.roll.benefit, hooks);
        }
    }
    static potionMultiplier(s: RogueState): number {
        return s.accessory?.roll.passive === "medicine" ? 1 + s.accessory.roll.benefit / 100 : 1;
    }
    static finish(s: RogueState, won: boolean, hooks: Hooks): void {
        for (const slot of ["armor", "accessory"] as const) {
            const e = s[slot]; if (!e) continue;
            if (won && e.roll.passive === "nourish") this.restore(s, "hp", e.roll.benefit, hooks);
            if (won && e.roll.passive === "return") this.restore(s, "mp", e.roll.benefit, hooks);
            e.durability = Math.max(0, e.durability - (slot === "armor" ?
                {普通:2,精英:3,首领:5} : {普通:1,精英:2,首领:3})[s.enemy.tier]);
        }
    }
    static describe(slot: EquipmentSlot, p: EquipmentRoll): string {
        const b = p.benefit, t = p.threshold;
        const text: Record<EquipmentPassive, string> = {
            iron:`前${t}敌阶段护甲+${b}`, reguard:`每回合首次防御额外${b}盾`, reflect:`实际受伤后反震${b}，每敌阶段一次`,
            fortify:`防御后本敌阶段护甲+${b}`, revive:`首次受伤至35%以下，下回合回血${b}`,
            danger:`血量≤35%时护甲+${b}`, ward:`首次受伤后获得${b}盾`, nourish:`胜利回血${b}`,
            pulse:`第${t}/${t*2}/${t*3}回合各回${b}蓝`, frugal:`每回合首个耗蓝招式返还最多${b}蓝`,
            return:`胜利回${b}蓝`, medicine:`血蓝药效果+${b}%`, harmony:`累计三种主动回${b}蓝、加${t}盾，触发后清空`,
            calm:`提前结束回合回${b}蓝，每场最多3次`, dawn:`前${t}敌阶段攻击+${b}`, steady:`首敌阶段未扣血回${b}蓝`,
        };
        const label = {1:"生命",2:"法力",3:"护甲",4:"攻击"};
        return `${W.qualities[p.quality-1]}·${this.bases[slot][p.base-1].name}\n` +
            [p.main,p.secondary].map(v=>`${label[v.attribute]}+${v.value}（${v.band}档）`).join(" / ") +
            `\n${this.names[p.passive]}：${text[p.passive]}`;
    }
}
