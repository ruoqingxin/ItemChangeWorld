import type { Tables } from "../../../config/schema";
import { byBehaviorCode } from "../../../config/ConfigRows";
import type { RogueItem, RogueMove, RogueSetup, RogueState } from "../types/QingmingTypes";

const MOVE_CODES = ["basic","guard","edge","wind","guide","fall","end","heal","mana","choose","next","retreat"] as const;
const BUILD_CODES: readonly RogueItem[] = ["swordcraft","flyingEdge","salvo","swordUnity","wound","rupture","dye",
    "endlessWound","riposte","breakingWave","retention","turnTables","breathing","bloodMana","risk","storedEdge",
    "heavyEdge","delayedFall","shieldWind","pinGuide","shieldFall","tempo","swordSiphon","woundGuard","cycle",
    "stillness","meditation"];

export interface RogueItemDefinition {
    name: string; type: "passive" | "mutation" | "core"; family: "flying" | "wound" | "guard" | "neutral";
    description: string; slot?: RogueMove;
}
export class QingmingConfig {
    static moves: Record<RogueMove, string> = {} as Record<RogueMove, string>;
    static skills: Record<string, {name: string; cost: number; description: string}> = {};
    static readonly styles = {guzong: "古宗敌阵"};
    static readonly pressures = {
        relaxed: { name: "轻松", hp: 0, attack: 0 },
        standard: { name: "标准", hp: 0.15, attack: 0.05 },
        hard: { name: "高压", hp: 0.2, attack: 0.08 },
    };
    static readonly guzongTempo = { hp: { 普通: 1.8, 精英: 1.35, 首领: 1 }, basicMana: 3 };
    static readonly offerRoles = { extend: "衔接", explore: "新路", random: "机缘", core: "核心" };

    static readonly links: [RogueItem, RogueItem][] = [
        ["swordcraft", "flyingEdge"], ["swordcraft", "salvo"], ["swordcraft", "swordUnity"],
        ["swordcraft", "dye"], ["swordcraft", "swordSiphon"],
        ["flyingEdge", "salvo"], ["flyingEdge", "swordUnity"], ["flyingEdge", "dye"], ["flyingEdge", "swordSiphon"],
        ["shieldWind", "swordcraft"], ["shieldWind", "salvo"], ["shieldWind", "swordUnity"],
        ["shieldWind", "dye"], ["shieldWind", "swordSiphon"],
        ["wound", "rupture"], ["wound", "pinGuide"], ["wound", "dye"], ["wound", "woundGuard"],
        ["rupture", "endlessWound"], ["wound", "endlessWound"], ["dye", "endlessWound"],
        ["riposte", "dye"], ["breakingWave", "dye"], ["turnTables", "dye"],
        ["riposte", "breakingWave"], ["riposte", "retention"], ["riposte", "turnTables"],
        ["breakingWave", "turnTables"], ["retention", "turnTables"], ["meditation", "turnTables"],
        ["storedEdge", "heavyEdge"], ["meditation", "heavyEdge"], ["storedEdge", "meditation"],
        ["storedEdge", "shieldFall"], ["retention", "shieldFall"], ["woundGuard", "shieldFall"],
        ["woundGuard", "riposte"], ["woundGuard", "breakingWave"],
        ["delayedFall", "stillness"], ["delayedFall", "riposte"], ["delayedFall", "retention"],
        ["tempo", "cycle"], ["breathing", "cycle"], ["swordSiphon", "cycle"],
        ["breathing", "heavyEdge"], ["bloodMana", "risk"], ["breathing", "bloodMana"],
    ];
    static readonly coreAnchors: Partial<Record<RogueItem, RogueItem[]>> = {
        swordUnity: ["swordcraft", "flyingEdge", "shieldWind"], endlessWound: ["rupture"],
        turnTables: ["riposte", "breakingWave", "retention", "meditation"],
        cycle: ["tempo"], stillness: ["delayedFall"],
    };
    static readonly events = { summon: "生飞剑", flying: "飞剑攻击", woundAdded: "附剑伤", woundTick: "剑伤发作",
        rupture: "割脉", counter: "反击", salvo: "齐射", earlyEnd: "提前结束",
        unity: "归宗引动", endless: "劫伤保留", turnTables: "反客反击", suppress: "压制",
        momentum: "积势", heavy: "蓄势斩", delayed: "悬剑落下", shatter: "碎壁",
        tempo: "换式", siphon: "飞剑回灵", woundGuard: "剑伤护身", cycle: "三式归一", meditation: "静息",
        enemyActions: "敌行动", enemyBreak: "实际破盾", enemyRead: "识破减伤", enemyEcho: "复读强化",
        enemyHeal: "敌治疗量", enemyHeat: "炉温增加", enemyBlood: "血炼自损", enemyShatter: "额外削盾",
        enemyArrayBreak: "拆阵", enemyPhase: "第二阶段", enemyWindow: "暴露窗口", enemyBonus: "条件强化", basicMana: "普攻回灵" };
    static items: Record<RogueItem, RogueItemDefinition> = {} as Record<RogueItem, RogueItemDefinition>;
    static load(tables: Tables): void {
        const moves = {} as Record<RogueMove, string>;
        const skills: typeof this.skills = {};
        const items = {} as Record<RogueItem, RogueItemDefinition>;
        for (const row of byBehaviorCode(tables.skill.getDataList(), MOVE_CODES, "技能表")) {
            if (!row.name || !row.description || !Number.isSafeInteger(row.mp_cost) || row.mp_cost < 0)
                throw new Error(`技能配置无效：${row.code}`);
            moves[row.code] = row.name;
            skills[row.code] = {name: row.name, cost: row.mp_cost, description: row.description};
        }
        for (const row of byBehaviorCode(tables.build.getDataList(), BUILD_CODES, "构筑表")) {
            if (!row.name || !row.description || !["passive","mutation","core"].includes(row.type) ||
                !["flying","wound","guard","neutral"].includes(row.family) ||
                (row.type === "mutation" ? !["edge","wind","guide","fall"].includes(row.slot) : !!row.slot))
                throw new Error(`构筑配置无效：${row.code}`);
            items[row.code] = {
                name: row.name, type: row.type as RogueItemDefinition["type"],
                family: row.family as RogueItemDefinition["family"], description: row.description,
                ...(row.slot ? {slot: row.slot as RogueMove} : {}),
            };
        }
        this.moves = moves;
        this.skills = skills;
        this.items = items;
    }
    static cost(move: RogueMove, state?: RogueState): number {
        const base = this.skills[move]?.cost || 0;
        return base + (base && state?.core === "cycle" ? 2 : 0);
    }
    static defaults(): RogueSetup {
        return { player: { hp: 1000, mp: 120, attack: 100, defense: 40 },
            enemy: { hp: 500, mp: 180, attack: 55, defense: 25 },
            seed: 17, battles: 12, pressure: "standard", healPotions: 3, manaPotions: 3, style: "guzong" };
    }
}
