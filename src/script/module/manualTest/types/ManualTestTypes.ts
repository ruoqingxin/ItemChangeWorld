export type ShadowKind = "edge" | "guard" | "guide";
export type EnemyStyle = "dummy" | "assault" | "defensive" | "burst";
export type ManualMove = "basic" | "guard" | "edge" | "wind" | "guide" | "fall" | "end" |
    "heal" | "mana" | "next" | "retreat" | "route" | "upgrade";
export type RunPhase = "fighting" | "reward" | "between" | "complete" | "defeat" | "retreated";
export interface TestAttributes { hp: number; mp: number; attack: number; defense: number; }
export interface ManualTestSetup {
    star: number;
    rank: number;
    player: TestAttributes;
    enemy: TestAttributes;
    style: EnemyStyle | "mixed";
    battles: number;
    seed: number;
    healPotions: number;
    manaPotions: number;
    openingKind: ShadowKind | "auto";
}
export interface SwordShadow { id: number; kind: ShadowKind; warm: boolean; }
export interface EnemyIntent {
    kind: "attack" | "guard" | "heal" | "charge" | "wait";
    percent: number;
    label: string;
    mpCost?: number;
}
export interface ManualTestAction {
    move: ManualMove;
    branch?: "normal" | "delay" | "absorb" | "finish";
    shadowIds?: number[];
    replacementId?: number;
    enemyAction?: number;
    choice?: string;
}
export interface FightCounters {
    damage: number; taken: number; shield: number; mpSpent: number; warmHarvested: number;
    actions: number; healUsed: number; manaUsed: number;
    skills: Record<string, number>;
    specials: Record<string, number>;
}
export interface FightReport extends FightCounters {
    battle: number; tier: string; style: EnemyStyle; rounds: number; won: boolean;
    startHp: number; startMp: number; endHp: number; endMp: number;
    path: string; upgrades: string[];
}
export interface ManualTestState {
    setup: ManualTestSetup;
    revision: number;
    phase: RunPhase;
    battle: number;
    round: number;
    ap: number;
    outcome: "active" | "victory" | "defeat";
    player: TestAttributes & { maxHp: number; maxMp: number; shield: number; };
    enemy: TestAttributes & {
        maxHp: number; maxMp: number; shield: number; charged: boolean; exposed: boolean;
        style: EnemyStyle; tier: "普通" | "精英" | "首领";
    };
    shadows: SwordShadow[];
    body: ShadowKind | null;
    nextId: number;
    path: ShadowKind | "none";
    upgrades: string[];
    offers: string[];
    rng: number;
    potions: { heal: number; mana: number; };
    potionUsed: boolean;
    finisherUsed: boolean;
    firstEdge: boolean;
    firstGuide: boolean;
    firstFall: boolean;
    bodyAttackUsed: boolean;
    suppression: number[];
    interrupts: boolean[];
    delayed: { at: number; ids: number[]; } | null;
    intentions: EnemyIntent[];
    logs: string[];
    totals: FightCounters;
    fight: FightCounters;
    fightStart: { hp: number; mp: number; };
    reports: FightReport[];
}
export interface ManualTestResult { ok: boolean; reason?: string; state: ManualTestState; }
