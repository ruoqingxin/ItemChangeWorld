import type { ManualTestSetup, EnemyStyle, ManualMove } from "../types/ManualTestTypes";

// Isolated, editable prototype values. These do not replace the Excel/Luban runtime tables.
export class ManualTestConfig {
    static readonly reverseEnergy = 4;
    static readonly releaseEnergy = 3;
    static readonly orbitNeed = 12;
    static readonly moves: Record<ManualMove, string> = {
        basic: "普攻", guard: "防御", edge: "青锋斩", wind: "回风式", guide: "引星刺",
        fall: "落青冥", end: "结束回合", heal: "回春丹", mana: "回灵丹",
    };
    static readonly styles: Record<EnemyStyle, string> = {
        dummy: "木桩", assault: "进攻", defensive: "防守", burst: "蓄力爆发",
    };
    static readonly kinds = { edge: "锋", guard: "守", guide: "引" };
    static readonly growth = [
        ["催锋", "剑首", "调序", "蓄势", "引落", "本命剑影"],
        ["留锋", "连影", "摹影", "齐落", "易位／拆阵", "剑阵"],
        ["伏剑", "截锋", "点破", "淬影", "悬落", "剑意自应"],
        ["纳剑", "剑骨", "出鞘", "温养", "引剑出体", "人剑合一"],
        ["归冥", "余韵", "招影", "轮转", "逆引", "周天不息"],
    ];
    static readonly descriptions = [
        ["催动施放前的剑首余响", "剑首悬停、余响增强50%", "回风换首；每回合首次换首立即余响",
            "成熟影主动坠落倍率加30个百分点", "落指定剑组；收取成熟影时额外留引影", "四悬；队首保护、势上限六"],
        ["落剑可保留本命；每回合首次留锋加一势", "同类相邻散影或同类阵增幅20%／40%", "摹写队尾类型及至多两势，替代催锋",
            "连续同类坠落效果合计增强10%", "交换两组或拆阵；与调序共享首次余响", "三影占两悬，最多两天阵"],
        ["预约敌第1／2／3行动前伏剑，允许成熟影", "未成熟锋组可在敌攻击后反击", "预约敌第1／2／3行动点破，削弱20%",
            "每影首次应剑后加一势", "在敌第1／2／3行动前落剑", "五悬；剑阵回应计两次截招进度，达到两次后削弱下一行动25%"],
        ["两势即可纳剑；入体立即开锋、护身或凝痕", "同类身剑使天影悬停、余响增强20%", "青锋可协同一身剑，锋／守协同45%",
            "坠落或纳剑回元，每回合共两次，上限六", "至少三元，耗尽剑元发动身剑合击", "三身剑位；元上限九；身阵与应剑回元"],
        ["即落、悬落入冥；回合开始回升一组", "回升即刻余响", "回风主动招回归影",
            "落下后回升加一转，上限三", "四剑元逆引重演并回升，每回合一次", "六悬、半势五转；回升积归冥势，十二势终式共鸣天影与归影"],
    ];
    static defaults(): ManualTestSetup {
        return { star: 0, rank: 0, style: "dummy",
            player: { hp: 1200, mp: 300, attack: 100, defense: 40 },
            enemy: { hp: 6000, mp: 300, attack: 100, defense: 20 } };
    }
    static level(setup: ManualTestSetup): number {
        return setup.star === 0 ? 0 : (setup.star - 1) * 6 + setup.rank;
    }
    static has(setup: ManualTestSetup, star: number, rank: number): boolean {
        return this.level(setup) >= (star - 1) * 6 + rank;
    }
    static branches(setup: ManualTestSetup, move: ManualMove): { key: string; name: string; }[] {
        const rows = [{ key: "normal", name: "基础" }];
        const add = (s: number, r: number, key: string, name: string) => {
            if (this.has(setup, s, r)) rows.push({ key, name });
        };
        if (move === "edge") { add(1, 1, "urge", "催锋"); add(2, 3, "copy", "摹影"); }
        if (move === "wind") {
            add(1, 3, "reorder", "调序"); add(2, 5, "swap", "易位"); add(2, 5, "split", "拆阵");
            add(3, 1, "ambush", "伏剑"); add(5, 3, "recall", "招影");
        }
        if (move === "guide") {
            add(1, 5, "pluck", "引落"); add(3, 3, "pinpoint", "点破");
            add(4, 5, "release", "出体"); add(5, 5, "reverse", "逆引");
        }
        if (move === "fall") { add(3, 5, "delay", "悬落"); add(5, 6, "finish", "万剑归冥"); }
        return rows;
    }
    static cost(move: ManualMove): number { return ({ edge: 5, wind: 5, guide: 6, fall: 8 } as any)[move] || 0; }
}
