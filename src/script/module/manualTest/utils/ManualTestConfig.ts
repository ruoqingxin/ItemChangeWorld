import type { ManualTestSetup, EnemyStyle, ManualMove, ShadowKind } from "../types/ManualTestTypes";

// Sandbox tuning only. Never read by production battle, inventory or generated tables.
export class ManualTestConfig {
    static readonly moves: Record<ManualMove, string> = {
        basic: "普攻", guard: "防御", edge: "青锋斩", wind: "回风式", guide: "引星刺",
        fall: "落青冥", end: "结束回合", heal: "回春丹", mana: "回灵丹",
        next: "下一战", retreat: "撤离演练", route: "选择剑路", upgrade: "选择强化",
    };
    static readonly styles: Record<EnemyStyle | "mixed", string> = {
        mixed: "混合敌阵", dummy: "木桩", assault: "进攻", defensive: "防守", burst: "蓄力爆发",
    };
    static readonly kinds = { edge: "锋", guard: "守", guide: "引" };
    static readonly paths: Record<ShadowKind, string> = {
        edge: "养锋破敌", guard: "御剑反击", guide: "截脉制敌",
    };
    static readonly pathDescriptions: Record<ShadowKind, string> = {
        edge: "每回合首次青锋，催熟一道未预约的新锋影",
        guard: "格挡时消耗一道未预约守影反击，温养更强",
        guide: "引星直接压制指定敌行动；破招后可追击破绽",
    };
    static readonly openingStrike = 0.75;
    static readonly counterStrike = 0.5;
    static readonly warmCounter = 0.35;
    static readonly bodyEntry = { edge: 1.6, guard: 1, guide: 0.8 };
    static readonly specialNames: Record<string, string> = {
        cultivate: "催养", counter: "反击", break: "破招", opening: "破绽追击",
        absorb: "纳剑", delay: "应剑", finish: "终式",
    };
    static readonly upgrades: Record<string, { path: ShadowKind; name: string; description: string; }> = {
        quickEdge: { path: "edge", name: "初锋即成", description: "每回合首次青锋新留的锋影直接温养" },
        cleave: { path: "edge", name: "破障剑气", description: "温养锋影收剑时穿透50%敌盾" },
        afterEdge: { path: "edge", name: "剑落余锋", description: "每回合首次收剑含温养锋影，追加40%A伤害" },
        retainShield: { path: "guard", name: "护体不散", description: "下回合开始最多继承H护体" },
        riposte: { path: "guard", name: "御守反锋", description: "守影收剑实际新增护体，同时转为等量伤害" },
        shelter: { path: "guard", name: "借势卸力", description: "收守影使下一次敌攻击削弱20%，取最高值" },
        cutFlow: { path: "guide", name: "新引断流", description: "新引影也可截断蓄力；对架盾、调息至少削弱50%" },
        followCut: { path: "guide", name: "截脉生锋", description: "每回合首次收剑含引影，收剑后空位留一道新锋影" },
        pressure: { path: "guide", name: "制敌先机", description: "引影削弱额外提高15个百分点，上限65%" },
    };
    static readonly starThemes = ["四招与收放", "本命起手", "三影成阵", "择机应剑", "一剑入体", "万剑归冥"];
    static readonly growth = [
        ["青锋初锐", "温养有成", "回风护身", "收锋", "引星穿隙", "本命起手"],
        ["新影可用", "守心", "锋破坚甲", "守影留护", "引星压制", "三影剑阵"],
        ["乘隙破势", "引剑伤脉", "迎击回风", "温养回灵", "落剑震敌", "择机应剑"],
        ["趁势追锋", "温守如壁", "补引破绽", "三才回灵", "危中回风", "身剑合一"],
        ["满庭锋锐", "落影续生", "回风温守", "收剑回灵", "初引即成", "万剑归冥"],
    ];
    static readonly descriptions = [
        ["青锋伤害+15%A", "温养锋/守影收剑+20%A/H", "回风护体+20%H", "锋影收剑+15%A",
            "引星伤害+15%A", "可自选每战起手剑影类型；仍只有一道新影"],
        ["新锋/守影收剑+10%A/H", "守影收剑+20%H", "青锋对敌盾穿透25%", "回合开始若仍有守影，最多继承H护体",
            "引影削弱+10个百分点", "三同类/锋守引各一自动成阵；同类强化对应招式，三才强化收剑"],
        ["青锋对蓄力敌额外+25%A", "引影收剑+30%A", "本轮有≥200%重击时回风+25%H",
            "每次收剑每道温养影返1法力，最多2", "每次实际收剑额外40%A", "落青冥可预约敌第1/2/3行动前收剑，锁定影"],
        ["已准备削弱时青锋+20%A", "温养守影收剑+20%H", "施放前没有引影时引星+25%A",
            "每次收剑按不同类型返法力，最多3", "施放前护体低于H时回风+30%H", "落青冥可将一道温养影纳为身剑，每战只能一次"],
        ["满三影时青锋+25%A", "每回合首次收剑有温养影，收后续留首道温养影同类新影",
            "回风留守影时若场上已有温养影，新守影直接温养", "每回合首次收剑返2法力",
            "每回合首次引星留温养引影", "第3回合起每战一次双重收剑，不需额外积攒能量"],
    ];
    static defaults(): ManualTestSetup {
        return { star: 0, rank: 0, style: "mixed", battles: 12, seed: 17, healPotions: 3, manaPotions: 3,
            openingKind: "auto", player: { hp: 1200, mp: 300, attack: 100, defense: 40 },
            enemy: { hp: 450, mp: 300, attack: 45, defense: 20 } };
    }
    static level(s: ManualTestSetup): number { return s.star === 0 ? 0 : (s.star - 1) * 6 + s.rank; }
    static has(s: ManualTestSetup, star: number, rank: number): boolean { return this.level(s) >= (star - 1) * 6 + rank; }
    static branches(s: ManualTestSetup, move: ManualMove): { key: string; name: string; }[] {
        const rows = [{ key: "normal", name: "即时收剑" }];
        if (move !== "fall") return [{ key: "normal", name: "基础" }];
        if (this.has(s, 3, 6)) rows.push({ key: "delay", name: "择机应剑" });
        if (this.has(s, 4, 6)) rows.push({ key: "absorb", name: "纳入身剑" });
        if (this.has(s, 5, 6)) rows.push({ key: "finish", name: "万剑归冥" });
        return rows;
    }
    static cost(move: ManualMove): number { return ({ edge: 5, wind: 5, guide: 6, fall: 8 } as any)[move] || 0; }
}
