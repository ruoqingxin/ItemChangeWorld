import type { RogueMove, RogueState } from "../types/QingmingTypes";
import { WeaponAttribute as A } from "../types/WeaponTrialTypes";
import type { WeaponPassiveCode, WeaponRoll, WeaponTrialSetup, WeaponTrialState } from "../types/WeaponTrialTypes";

type Range = readonly [number, number];
type Hooks = { damage: (amount: number) => void; log: (text: string) => void };

// 仅供独立装备演练显式启用，数值对应装备设计草案，不代替正式配置表。
export class WeaponTrialRules {
    static readonly qualities = ["普通白", "优秀绿", "精良蓝", "稀有紫", "史诗金", "传说红"];
    static readonly bases = [
        { name: "青钢剑", attribute: A.Attack, durability: 28 },
        { name: "厚背刀", attribute: A.Attack, durability: 32 },
        { name: "穿云枪", attribute: A.Attack, durability: 32 },
        { name: "破山斧", attribute: A.Attack, durability: 40 },
        { name: "镇岳锤", attribute: A.Armor, durability: 40 },
        { name: "盘龙棍", attribute: A.Armor, durability: 32 },
        { name: "逐风弓", attribute: A.Attack, durability: 24 },
        { name: "藏机弩", attribute: A.Attack, durability: 32 },
        { name: "流云扇", attribute: A.Mp, durability: 20 },
        { name: "青竹杖", attribute: A.Mp, durability: 28 },
        { name: "玄铜铃", attribute: A.Hp, durability: 24 },
        { name: "玄山印", attribute: A.Attack, durability: 36 },
    ];
    static readonly names: Record<WeaponPassiveCode, string> = {
        leech: "饮血", bloodthirst: "嗜血", mana: "回风", echo: "叠锋",
        break: "破阵", veteran: "百战", thunder: "凝雷", execute: "猎弱",
    };
    static readonly events: Record<string, string> = {
        weaponAttacks: "武器攻击行动", weaponKills: "武器击杀", weaponHeal: "武器吸血",
        weaponMana: "武器回蓝", weaponProc: "武器追击", weaponDamage: "武器追击扣血",
        weaponShieldRemoved: "武器额外削盾", weaponExecute: "猎弱加成",
    };
    static readonly windows: Range[] = [[1, 3], [1, 4], [2, 5], [3, 5], [3, 6], [4, 6]];
    static readonly main: Record<A, Range[]> = {
        [A.Hp]: [[20, 30], [31, 50], [51, 75], [76, 105], [106, 140], [141, 180]],
        [A.Mp]: [[6, 8], [9, 11], [12, 14], [15, 17], [18, 20], [21, 24]],
        [A.Armor]: [[2, 3], [4, 5], [6, 7], [8, 9], [10, 11], [12, 14]],
        [A.Attack]: [[3, 4], [5, 6], [7, 8], [9, 10], [11, 12], [13, 14]],
    };
    static readonly secondary: Record<A, Range[]> = {
        [A.Hp]: [[5, 10], [11, 20], [21, 32], [33, 46], [47, 62], [63, 80]],
        [A.Mp]: [[2, 3], [4, 4], [5, 6], [7, 8], [9, 10], [11, 12]],
        [A.Armor]: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
        [A.Attack]: [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]],
    };
    // 每行先列主要收益，再列门槛；破阵的第二项为额外削盾量。
    static readonly passives: Record<WeaponPassiveCode, { benefit: Range[]; threshold: Range[] }> = {
        leech: { benefit: [[2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [8, 10]], threshold: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] },
        bloodthirst: { benefit: [[8, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20]], threshold: [[10, 12], [9, 11], [8, 10], [7, 9], [6, 8], [5, 7]] },
        mana: { benefit: [[1, 1], [1, 2], [2, 2], [2, 3], [3, 3], [3, 4]], threshold: [[4, 5], [4, 4], [3, 4], [3, 3], [2, 3], [2, 2]] },
        echo: { benefit: [[3, 4], [4, 6], [6, 8], [8, 10], [10, 12], [12, 14]], threshold: [[4, 5], [4, 4], [3, 4], [3, 3], [2, 3], [2, 2]] },
        break: { benefit: [[1, 2], [2, 3], [3, 4], [4, 6], [6, 8], [8, 10]], threshold: [[2, 3], [3, 4], [4, 6], [6, 8], [8, 10], [10, 12]] },
        veteran: { benefit: [[2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [8, 10]], threshold: [[4, 5], [3, 4], [3, 3], [2, 3], [2, 2], [1, 2]] },
        thunder: { benefit: [[3, 5], [5, 7], [7, 9], [9, 12], [12, 15], [15, 18]], threshold: [[24, 28], [22, 26], [20, 24], [18, 22], [16, 20], [14, 18]] },
        execute: { benefit: [[6, 8], [8, 10], [10, 12], [12, 14], [14, 17], [17, 20]], threshold: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] },
    };
    static roll(d: WeaponTrialSetup, seed: number): WeaponRoll {
        if (!d || !Number.isInteger(d.base) || !this.bases[d.base - 1] ||
            !Number.isInteger(d.quality) || d.quality < 1 || d.quality > 6 ||
            d.passive !== undefined && !Object.prototype.hasOwnProperty.call(this.names, d.passive) ||
            d.broken !== undefined && typeof d.broken !== "boolean") throw new Error("武器演练设置无效");
        // 装备使用独立随机流，不能改变敌阵或构筑奖励。
        let rng = (seed + 104729) % 2147483646 + 1;
        const random = ([lo, hi]: Range) => { rng = rng * 16807 % 2147483647; return lo + rng % (hi - lo + 1); };
        const stat = (attribute: A, table: Record<A, Range[]>) => {
            const band = random(this.windows[d.quality - 1]);
            return { attribute, band, value: random(table[attribute][band - 1]) };
        };
        const main = stat(this.bases[d.base - 1].attribute, this.main);
        const secondary = stat(random([1, 4]), this.secondary);
        const codes = Object.keys(this.names) as WeaponPassiveCode[];
        const passive = d.passive ?? codes[random([0, codes.length - 1])], ranges = this.passives[passive];
        return { base: d.base, quality: d.quality, main, secondary, passive,
            benefit: random(ranges.benefit[d.quality - 1]), threshold: random(ranges.threshold[d.quality - 1]),
            maxDurability: this.bases[d.base - 1].durability + (d.quality - 1) * 4 };
    }
    static create(d: WeaponTrialSetup, seed: number): WeaponTrialState {
        const roll = this.roll(d, seed);
        return { roll, durability: d.broken ? 0 : roll.maxDurability, kills: 0, attacks: 0, charge: 0,
            applied: { hp: 0, mp: 0, attack: 0, defense: 0 }, action: null };
    }
    static beginFight(s: RogueState): void {
        const w = s.weapon;
        if (!w) return;
        const gains = { hp: 0, mp: 0, attack: 0, defense: 0 };
        const keys = { [A.Hp]: "hp", [A.Mp]: "mp", [A.Armor]: "defense", [A.Attack]: "attack" } as const;
        for (const stat of [w.roll.main, w.roll.secondary]) gains[keys[stat.attribute]] += stat.value;
        for (const key of Object.keys(gains)) gains[key] = Math.round(gains[key] * (w.durability ? 1 : 0.5));
        if (w.roll.passive === "veteran") gains.attack += Math.min(w.roll.benefit, Math.floor(w.kills / w.roll.threshold));
        w.applied = gains; w.attacks = 0; w.charge = 0; w.action = null;
    }
    static count(s: RogueState, key: string, n = 1): void {
        if (!n) return;
        for (const c of [s.fight, s.totals]) c.events[key] = (c.events[key] || 0) + n;
    }
    static beginAction(s: RogueState, move: RogueMove, hooks: Hooks): void {
        const w = s.weapon;
        if (!w) return;
        const attack = ["basic", "edge", "guide", "fall"].includes(move);
        w.action = { hpDamage: 0, mpBefore: s.player.mp, attack, broke: false };
        if (!attack) return;
        w.attacks++; this.count(s, "weaponAttacks");
        if (w.roll.passive === "break" && s.enemy.shield > 0) {
            const removed = Math.min(s.enemy.shield, w.roll.threshold);
            s.enemy.shield -= removed; this.count(s, "weaponShieldRemoved", removed);
            hooks.log(`破阵额外削盾${removed}`);
            if (!s.enemy.shield) {
                w.action.broke = true;
                if (!s.foe.broken) { s.foe.broken = true; this.count(s, "enemyBreak"); }
            }
        }
    }
    static directMultiplier(s: RogueState): number {
        const w = s.weapon;
        if (w?.roll.passive !== "execute" || s.enemy.hp > s.enemy.maxHp * 0.35) return 1;
        this.count(s, "weaponExecute"); return 1 + w.roll.benefit / 100;
    }
    static endAction(s: RogueState, hooks: Hooks): void {
        const w = s.weapon, a = w?.action;
        if (!a) return;
        w.action = null;
        if (s.player.hp <= 0 || s.enemy.hp <= 0 || s.phase !== "fighting") return;
        const p = w.roll;
        if (a.attack && (p.passive === "leech" || p.passive === "bloodthirst" && w.kills >= p.threshold)) {
            const gain = Math.min(s.player.maxHp - s.player.hp, Math.floor(a.hpDamage * p.benefit / 100));
            s.player.hp += gain; this.count(s, "weaponHeal", gain);
            if (gain) hooks.log(`${this.names[p.passive]}回血${gain}`);
        }
        const due = a.attack && p.threshold > 0 && w.attacks % p.threshold === 0;
        if (due && (p.passive === "mana" || p.passive === "echo")) w.attacks = 0;
        if (p.passive === "mana" && due) {
            const gain = Math.min(s.player.maxMp - s.player.mp, p.benefit);
            s.player.mp += gain; this.count(s, "weaponMana", gain);
            if (gain) hooks.log(`回风回蓝${gain}`);
        }
        if (p.passive === "thunder") w.charge += Math.max(0, a.mpBefore - s.player.mp);
        if (p.passive === "echo" && due || p.passive === "break" && a.attack && a.broke ||
            p.passive === "thunder" && w.charge >= p.threshold) {
            if (p.passive === "thunder") w.charge = Math.min(w.charge - p.threshold, p.threshold - 1);
            this.count(s, "weaponProc"); hooks.damage(p.benefit);
        }
    }
    static finish(s: RogueState, won: boolean): void {
        const w = s.weapon;
        if (!w) return;
        if (won) { w.kills++; this.count(s, "weaponKills"); }
        w.durability = Math.max(0, w.durability - ({ 普通: 2, 精英: 3, 首领: 5 })[s.enemy.tier]);
    }
    static armorDamage(raw: number, armor: number, enabled: boolean): number {
        return raw <= 0 ? 0 : enabled ? Math.max(1, Math.round(raw * 100 / (100 + armor))) : Math.max(0, Math.round(raw));
    }
    static describe(roll: WeaponRoll): string {
        const labels = { [A.Hp]: "生命", [A.Mp]: "法力", [A.Armor]: "护甲", [A.Attack]: "攻击" };
        const p = roll, name = this.names[p.passive], n = p.threshold, b = p.benefit;
        const effect: Record<WeaponPassiveCode, string> = {
            leech: `吸血${b}%`, bloodthirst: `击杀${n}个后吸血${b}%`, mana: `每${n}次攻击回${b}蓝`,
            echo: `每${n}次攻击追加${b}伤害`, break: `额外削盾${n}，破盾追加${b}伤害`,
            veteran: `每${n}杀加1攻击，最多${b}`, thunder: `净耗${n}蓝追加${b}伤害`, execute: `敌血≤35%时本体伤害+${b}%`,
        };
        return `${this.qualities[p.quality - 1]}·${this.bases[p.base - 1].name}\n` +
            `${labels[p.main.attribute]}+${p.main.value}（${p.main.band}档） / ${labels[p.secondary.attribute]}+${p.secondary.value}（${p.secondary.band}档）\n` +
            `${name}：${effect[p.passive]}`;
    }
}
