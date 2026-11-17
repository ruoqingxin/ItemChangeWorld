import type { RogueItem, RogueMove, RogueSetup, RogueState } from "../types/QingmingTypes";

export interface RogueItemDefinition {
    name: string; type: "passive" | "mutation" | "core"; family: "flying" | "wound" | "guard" | "neutral";
    description: string; slot?: RogueMove;
}
export class QingmingConfig {
    static readonly moves: Record<RogueMove, string> = {
        basic: "普攻", guard: "防御", edge: "青锋斩", wind: "回风式", guide: "引星刺", fall: "落青冥",
        end: "结束回合", heal: "回春丹", mana: "回灵丹", choose: "选择奖励", next: "下一战", retreat: "撤离",
    };
    static readonly styles = { guzong: "古宗敌阵", mixed: "旧混合", dummy: "木桩", assault: "快攻", defensive: "盾疗", burst: "蓄力重击" };
    static readonly pressures = {
        relaxed: { name: "轻松", hp: 0, attack: 0 },
        standard: { name: "标准", hp: 0.15, attack: 0.05 },
        hard: { name: "高压", hp: 0.2, attack: 0.08 },
    };
    static readonly guzongTempo = { hp: { 普通: 1.8, 精英: 1.35, 首领: 1 }, basicMana: 3 };
    static readonly offerRoles = { extend: "衔接", explore: "新路", random: "机缘", core: "核心" };
    // Connections describe actual interactions, not a selected or exclusive class.
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
    static readonly items: Record<RogueItem, RogueItemDefinition> = {
        swordcraft: { name: "御剑诀", type: "passive", family: "flying", description: "每回合首次主动后生成1飞剑。上限3，每己方回合末各攻击30%A。" },
        flyingEdge: { name: "青锋·飞刃", type: "mutation", slot: "edge", family: "flying", description: "青锋伤害从110%A改为70%A，每次额外生成1飞剑。" },
        salvo: { name: "青冥·齐射", type: "mutation", slot: "fall", family: "flying", description: "落青冥保留170%A重击，消耗全部飞剑，每把追加60%A；仍每回合一次。" },
        swordUnity: { name: "万剑归宗", type: "core", family: "flying", description: "飞剑上限5，不再回合末攻击；青锋命中后，现存全部飞剑各攻击30%A。须有飞剑来源。" },
        wound: { name: "剑伤", type: "passive", family: "wound", description: "本体攻击附加1剑伤，最多6层；敌每次实际行动后，每层造成5%A伤害，敌回合末减1层。" },
        rupture: { name: "引星·割脉", type: "mutation", slot: "guide", family: "wound", description: "引星不再压制，改为引爆剑伤：每层追加25%A，清除全部剑伤。须先有剑伤。" },
        dye: { name: "染剑", type: "passive", family: "wound", description: "飞剑和反击也附加1剑伤。须已有剑伤和飞剑或反击来源。" },
        endlessWound: { name: "劫伤不尽", type: "core", family: "wound", description: "割脉只消耗一半剑伤（向上取整），但引星直接伤害减半。须先有割脉。" },
        riposte: { name: "御守反锋", type: "passive", family: "guard", description: "每次实际格挡且仍存活后，反击50%A。每敌行动一次，不递归触发。" },
        breakingWave: { name: "回风·破浪", type: "mutation", slot: "wind", family: "guard", description: "回风护盾降低25%；下一敌回合前两次实际格挡，各追加80%A反击，多次回风不叠次数。" },
        retention: { name: "守势不散", type: "passive", family: "guard", description: "己方回合开始保留一半剩余护盾，上限150%防御；不是重新获得护盾。" },
        turnTables: { name: "反客为主", type: "core", family: "guard", description: "放弃至少1行动提前结束回合，下一敌回合前两次实际格挡反击50%A；每放弃1行动再+60%A。" },
        breathing: { name: "吐纳", type: "passive", family: "neutral", description: "每次普攻额外恢复4法力，不超过上限；不额外获得行动。" },
        bloodMana: { name: "血祭", type: "passive", family: "neutral", description: "法力不足时，每缺1法力消耗2生命补足；生命必须至少剩1。" },
        risk: { name: "险中求胜", type: "passive", family: "neutral", description: "当前生命不高于40%时，主动直接伤害+35%，获得护盾-25%；不强化飞剑、剑伤和反击。" },
        storedEdge: { name: "藏锋", type: "passive", family: "guard", description: "防御或回风后积1势，上限3，跨回合保留；普攻消耗全部势，每势追加30%A。可配蓄势青锋更高效释放。" },
        heavyEdge: { name: "青锋·蓄势", type: "mutation", slot: "edge", family: "guard", description: "青锋改为100%A，消耗全部势，每势追加90%A；满3势为370%A。0势也能用，须有藏锋或静息。" },
        delayedFall: { name: "青冥·悬剑", type: "mutation", slot: "fall", family: "neutral", description: "落青冥改为70%A，另悬一剑：敌回合结束、自己存活后造成220%A。不需额外行动；战末清除。" },
        shieldWind: { name: "回风·归鞘", type: "mutation", slot: "wind", family: "flying", description: "回风护盾改为175%防御，同时生成1飞剑；是独立飞剑来源，可与御剑诀叠加。" },
        pinGuide: { name: "引星·封喉", type: "mutation", slot: "guide", family: "wound", description: "引星改为50%A，指定敌行动数值压制60%，本体附伤外再加2剑伤；不引爆、不截断蓄力。须有剑伤。" },
        shieldFall: { name: "青冥·碎壁", type: "mutation", slot: "fall", family: "guard", description: "落青冥消耗现有全部护盾，本体170%A另加消耗盾量的125%伤害；失去后续防护，不穿敌盾。" },
        tempo: { name: "式随剑转", type: "passive", family: "neutral", description: "连续使用不同主动时，该招直接伤害+35%A，回风改为额外35%防御护盾。跨回合保留；普攻/防御打断。" },
        swordSiphon: { name: "飞剑回灵", type: "passive", family: "flying", description: "每己方回合前2次飞剑攻击各恢复1法力，不超上限；不增加飞剑或行动。须有飞剑来源。" },
        woundGuard: { name: "痛剑护身", type: "passive", family: "wound", description: "剑伤发作实际扣除敌生命后，获得20%防御护盾；抵盾无效，伤害致胜不补盾。须有剑伤。" },
        cycle: { name: "三式归一", type: "core", family: "neutral", description: "累计施展3种不同主动后，追加90%A伤害并获75%防御护盾，清空记录；跨回合保留。代价：所有主动多耗2蓝。" },
        stillness: { name: "后发先至", type: "core", family: "neutral", description: "悬剑延迟伤害提高50%；代价：所有主动直接伤害降低25%。须有悬剑，换掉悬剑前需先替换本核心。" },
        meditation: { name: "静息", type: "passive", family: "neutral", description: "提前结束时，每放弃1行动恢复2法力并积1势，上限3。普攻耗全部势、每势+30%A；可配蓄势青锋。不提供免费行动。" },
    };
    static cost(move: RogueMove, state?: RogueState): number {
        const base = ({ edge: 4, wind: 4, guide: 5, fall: 8 })[move] || 0;
        return base + (base && state?.core === "cycle" ? 2 : 0);
    }
    static defaults(): RogueSetup {
        return { player: { hp: 1000, mp: 120, attack: 100, defense: 40 },
            enemy: { hp: 500, mp: 180, attack: 55, defense: 25 },
            seed: 17, battles: 12, pressure: "standard", healPotions: 3, manaPotions: 3, style: "guzong" };
    }
}
