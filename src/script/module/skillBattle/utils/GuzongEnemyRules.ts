import type { Tables } from "../../../config/schema";
import { byBehaviorCode } from "../../../config/ConfigRows";
import type { RogueEnemyId, RogueEnemyIntent, RogueFoeState, RogueMove, RogueSetup, RogueState } from "../types/QingmingTypes";
import { QingmingConfig as C } from "./QingmingConfig";

const ENEMY_CODES: readonly RogueEnemyId[] = ["patrol","stone","thunder","apothecary","bloodBlade","echo","shade",
    "gatekeeper","alchemist","swordsman","breaker","arrayMaster","tortoise","swordmaster","swordSpirit"];

interface EnemyDefinition {
    id: number; name: string; tier: "普通" | "精英" | "首领"; hint: string; opening: number;
}
export class GuzongEnemyRules {
    static enemies: Record<RogueEnemyId, EnemyDefinition> = {} as Record<RogueEnemyId, EnemyDefinition>;
    static load(tables: Tables): void {
        const enemies = {} as Record<RogueEnemyId, EnemyDefinition>;
        for (const row of byBehaviorCode(tables.enemy.getDataList(), ENEMY_CODES, "敌人表")) {
            if (!row.name || !row.hint || !["普通","精英","首领"].includes(row.tier) ||
                !Number.isSafeInteger(row.opening) || row.opening < 0 || row.opening > 600)
                throw new Error(`敌人配置无效：${row.code}`);
            enemies[row.code] = {id: row.id, name: row.name, tier: row.tier as EnemyDefinition["tier"],
                hint: row.hint, opening: row.opening};
        }
        for (const [tier, count] of [["普通",7],["精英",5],["首领",3]] as const) {
            if (Object.values(enemies).filter(e => e.tier === tier).length !== count)
                throw new Error(`敌人级别数量无效：${tier}`);
        }
        this.enemies = enemies;
    }
    static fresh(id: RogueEnemyId | null): RogueFoeState {
        return { id, phase2: false, broken: false, vulnerable: false, acting: false, casts: [], lastCast: null, read: null,
            hits: 0, heals: 2, heat: 0, formation: false };
    }
    static lineup(d: RogueSetup): RogueEnemyId[] {
        if (d.enemyId) return [d.enemyId];
        let rng = d.seed;
        const pick = (rows: RogueEnemyId[]) => { rng = rng * 48271 % 2147483647; return rows[rng % rows.length]; };
        const all = Object.keys(this.enemies) as RogueEnemyId[];
        const normals = all.filter(k => this.enemies[k].tier === "普通");
        const elites = all.filter(k => this.enemies[k].tier === "精英");
        const boss = pick(all.filter(k => this.enemies[k].tier === "首领"));
        const plan: RogueEnemyId[] = [], used = new Set<RogueEnemyId>();
        for (let n = 1; n <= d.battles; n++) {
            let pool: RogueEnemyId[];
            if (n === d.battles && d.battles > 1) { plan.push(boss); continue; }
            if (n % 3 === 0) {
                pool = n === 3 ? ["gatekeeper", "alchemist"] : n === 6 ? ["swordsman", "breaker"] : elites;
                const unused = pool.filter(k => !used.has(k)); if (unused.length) pool = unused;
            } else {
                pool = n <= 2 ? ["patrol", "stone", "apothecary"] : n <= 5 ?
                    ["patrol", "stone", "thunder", "apothecary", "bloodBlade"] : normals;
                pool = pool.filter(k => k !== plan[plan.length - 1]);
            }
            const id = pick(pool); plan.push(id); if (this.enemies[id].tier === "精英") used.add(id);
        }
        return plan;
    }
    static playerTurn(s: RogueState): boolean {
        const f = s.foe;
        if (!f.id) return false;
        const changed = !f.phase2 && this.enemies[f.id].tier === "首领" && s.enemy.hp <= s.enemy.maxHp / 2;
        if (changed) f.phase2 = true;
        f.read = ["swordsman", "swordmaster"].includes(f.id) ? f.lastCast : null;
        f.lastCast = null; f.casts = []; f.hits = 0; f.broken = false; f.acting = false;
        return changed;
    }
    static cast(s: RogueState, move: RogueMove): void {
        if (!s.foe.id) return;
        if (s.foe.read && s.foe.read !== move) s.foe.read = null;
        s.foe.casts.push(move); s.foe.lastCast = move;
    }
    static percent(s: RogueState, action: RogueEnemyIntent): number {
        const f = s.foe, bonus = action.bonus || 0;
        switch (action.condition) {
            case "broken": return action.percent * (f.broken ? 0.5 : 1);
            case "unbroken": return action.percent + (f.broken ? 0 : bonus);
            case "echo": return action.percent + (new Set(f.casts).size < f.casts.length ? bonus : 0);
            case "unguarded": return action.percent + (s.player.shield ? 0 : bonus);
            case "formation": return action.percent + (f.formation && f.hits < 3 ? bonus : 0);
            case "heat": return action.percent + f.heat * bonus;
            default: return action.percent;
        }
    }
    static range(action: RogueEnemyIntent): [number, number] {
        if (action.condition === "broken") return [action.percent * 0.5, action.percent];
        if (action.condition) return [action.percent, action.percent + (action.bonus || 0) * (action.condition === "heat" ? 2 : 1)];
        return [action.percent, action.percent];
    }
    static intents(s: RogueState): RogueEnemyIntent[] {
        const attack = (percent: number, label = "斩击", condition?: RogueEnemyIntent["condition"], bonus = 0): RogueEnemyIntent =>
            ({ kind: "attack", percent, label, condition: condition || null, bonus,
                mpCost: percent + bonus * (condition === "heat" ? 2 : 1) > 100 ? 4 : 0 });
        const guard = (percent: number): RogueEnemyIntent => ({ kind: "guard", percent, label: "架盾", mpCost: 3 });
        const heal = (): RogueEnemyIntent => s.foe.heals ? { kind: "heal", percent: 6, label: "疗伤", mpCost: 5, maxHpHeal: true } : guard(100);
        const expose = (): RogueEnemyIntent => ({ kind: "expose", percent: 20, label: "收势暴露", mpCost: 0 });
        const formation = (): RogueEnemyIntent => ({ kind: "formation", percent: 0, label: "布剑阵", mpCost: 4 });
        const odd = s.round % 2 === 1, phase = (s.round - 1) % 3, second = s.foe.phase2;
        let rows: RogueEnemyIntent[];
        switch (s.foe.id) {
            case "patrol": rows = odd ? [attack(80), attack(80), guard(150)] : [attack(60), attack(60), attack(180, "重斩")]; break;
            case "stone": rows = [attack(80, "拳击", "broken"), guard(200), attack(60, "推掌")]; break;
            case "thunder": rows = odd ? [attack(60, "雷击"), guard(100), { kind: "charge", percent: 0, label: "蓄雷", mpCost: 4 }] :
                [attack(60, "雷击"), attack(60, "雷击"), attack(s.enemy.charged ? 240 : 100, "落雷")]; break;
            case "apothecary": rows = [attack(80, "药杵"), odd ? heal() : guard(150), attack(80, "药杵")]; break;
            case "bloodBlade": rows = odd ? [{ kind: "blood", percent: 3, label: "血炼", mpCost: 0 }, attack(120), attack(160, "重斩")] :
                [attack(80), guard(100), attack(80)]; break;
            case "echo": rows = [attack(80, "符击"), attack(80, "符击"), attack(80, "回声符", "echo", 60)]; break;
            case "shade": rows = [attack(80, "突袭", "unguarded", 60), attack(60, "追击"), guard(150)]; break;
            case "gatekeeper": rows = odd ? [attack(120, "盾击"), attack(80), guard(250)] :
                [attack(200, "破城斩", "unbroken", 80), attack(60), guard(150)]; break;
            case "alchemist": rows = odd ? [attack(80, "炉火"), heal(), attack(100, "炉火")] :
                [attack(80, "炉火"), guard(150), attack(180, "炉爆", "heat", 40)]; break;
            case "swordsman": rows = odd ? [attack(100), guard(150), attack(100)] : [attack(180, "重斩"), attack(60), guard(150)]; break;
            case "breaker": {
                const hammer = { ...attack(160, "震盾锤"), shatter: true };
                rows = odd ? [hammer, attack(60), guard(150)] : [attack(60), guard(150), hammer]; break;
            }
            case "arrayMaster": rows = odd ? [attack(80, "剑气"), guard(100), formation()] :
                [attack(80, "剑气"), attack(80, "剑气"), attack(100, "判剑", "formation", 160)]; break;
            case "tortoise": rows = phase === 0 ? [guard(400), attack(80, "拳击"), guard(150)] : phase === 1 ?
                [attack(100, "拳击"), attack(100, "拳击"), attack(240, "破城锤", "unbroken", 60)] :
                [attack(100, "拳击"), second ? attack(100, "拳击") : guard(200), expose()]; break;
            case "swordmaster": rows = phase === 0 ? [attack(80), attack(80), guard(150)] : phase === 1 ?
                (second ? [attack(180, "重斩"), attack(100), attack(100)] : [attack(100), attack(100), attack(180, "重斩")]) :
                [guard(200), attack(120), expose()]; break;
            case "swordSpirit": rows = phase === 0 ? [attack(80, "剑气"), guard(200), formation()] : phase === 1 ?
                [attack(second ? 110 : 80, "剑雨"), attack(second ? 110 : 80, "剑雨"), attack(220, "天剑", "formation", 80)] :
                [guard(150), attack(120, "剑气"), expose()]; break;
            default: throw new Error("古宗敌人无效");
        }
        let mp = s.enemy.mp;
        return rows.map(action => {
            if (mp >= action.mpCost) { mp -= action.mpCost; return action; }
            if (action.kind === "heal" && mp >= 3) { mp -= 3; return guard(100); }
            return action.kind === "attack" ? attack(100, "普攻") : { kind: "wait", percent: 0, label: "法力不足", mpCost: 0 };
        });
    }
    static title(s: RogueState): string { return this.enemies[s.foe.id].name; }
    static summary(s: RogueState): string {
        const f = s.foe;
        if (!f.id) return "";
        const states = [f.phase2 ? "第二阶段" : "", f.broken ? "已破盾" : "", f.vulnerable ? "受伤+20%" : "",
            f.read ? `识破${C.moves[f.read]}` : "", f.formation ? `拆阵${f.hits}/3` : "",
            ["apothecary", "alchemist"].includes(f.id) ? `疗伤余${f.heals}` : "", f.id === "alchemist" ? `炉温${f.heat}/2` : ""];
        return states.filter(Boolean).join(" · ") || this.enemies[f.id].hint;
    }
}
