export type EnemyStyle = "dummy" | "assault" | "defensive" | "burst";
export type RunPhase = "fighting" | "reward" | "between" | "complete" | "defeat" | "retreated";
export interface TestAttributes { hp: number; mp: number; attack: number; defense: number; }
export interface EnemyIntent {
    kind: "attack" | "guard" | "heal" | "charge" | "wait";
    percent: number; label: string; mpCost?: number;
}

export type RogueMove = "basic" | "guard" | "edge" | "wind" | "guide" | "fall" |
    "end" | "heal" | "mana" | "choose" | "next" | "retreat";
export type RogueItem = "swordcraft" | "flyingEdge" | "salvo" | "swordUnity" |
    "wound" | "rupture" | "dye" | "endlessWound" |
    "riposte" | "breakingWave" | "retention" | "turnTables" | "breathing" | "bloodMana" | "risk" |
    "storedEdge" | "heavyEdge" | "delayedFall" | "shieldWind" | "pinGuide" | "shieldFall" |
    "tempo" | "swordSiphon" | "woundGuard" | "cycle" | "stillness" | "meditation";
export type RoguePressure = "relaxed" | "standard" | "hard";
export type RogueOfferRole = "extend" | "explore" | "random" | "core";
export type RogueEnemyId = "patrol" | "stone" | "thunder" | "apothecary" | "bloodBlade" | "echo" | "shade" |
    "gatekeeper" | "alchemist" | "swordsman" | "breaker" | "arrayMaster" | "tortoise" | "swordmaster" | "swordSpirit";
export type RogueEnemyStyle = EnemyStyle | "guzong";
export interface RogueEnemyIntent extends Omit<EnemyIntent, "kind"> {
    kind: EnemyIntent["kind"] | "blood" | "expose" | "formation";
    condition?: "broken" | "unbroken" | "echo" | "unguarded" | "formation" | "heat";
    bonus?: number; shatter?: boolean; maxHpHeal?: boolean;
}
export interface RogueFoeState {
    id: RogueEnemyId | null; phase2: boolean; broken: boolean; vulnerable: boolean; acting: boolean;
    casts: RogueMove[]; lastCast: RogueMove | null; read: RogueMove | null; hits: number;
    heals: number; heat: number; formation: boolean;
}
export interface RogueSetup {
    player: TestAttributes; enemy: TestAttributes; seed: number; battles: number;
    style: RogueEnemyStyle | "mixed"; pressure: RoguePressure; healPotions: number; manaPotions: number;
    enemyId?: RogueEnemyId | null;
}
export interface RogueLoadout {
    acquired: RogueItem[]; passives: RogueItem[]; mutations: Partial<Record<RogueMove, RogueItem>>;
    core: RogueItem | null; offers: RogueItem[]; offerRoles: Partial<Record<RogueItem, RogueOfferRole>>; rng: number;
}
export interface RogueAction { move: RogueMove; choice?: RogueItem; enemyAction?: number; }
export interface RogueCounters {
    damage: number; taken: number; shield: number; mpSpent: number; bloodSpent: number;
    actions: number; healUsed: number; manaUsed: number;
    skills: Record<string, number>; events: Record<string, number>;
}
export interface RogueReport extends RogueCounters {
    battle: number; tier: string; style: RogueEnemyStyle; enemyId: RogueEnemyId | null; rounds: number; won: boolean;
    startHp: number; startMp: number; endHp: number; endMp: number;
    build: RogueItem[]; core: RogueItem | null;
}
export interface RogueState {
    setup: RogueSetup; revision: number; phase: RunPhase; battle: number; round: number; ap: number;
    player: TestAttributes & { maxHp: number; maxMp: number; shield: number; };
    enemy: TestAttributes & { maxHp: number; maxMp: number; shield: number; charged: boolean;
        style: RogueEnemyStyle; tier: "普通" | "精英" | "首领"; };
    enemyPlan: RogueEnemyId[]; foe: RogueFoeState;
    acquired: RogueItem[]; passives: RogueItem[]; mutations: Partial<Record<RogueMove, RogueItem>>;
    core: RogueItem | null; offers: RogueItem[]; offerRoles: Partial<Record<RogueItem, RogueOfferRole>>; rng: number;
    rewards: { battle: number; offers: RogueItem[]; roles: Partial<Record<RogueItem, RogueOfferRole>>;
        choice: RogueItem; replaced: RogueItem | null; }[];
    flying: number; wounds: number; firstActive: boolean; fallUsed: boolean;
    momentum: number; pendingSword: number; lastActive: RogueMove | null; forms: RogueMove[]; siphonUses: number;
    wave: boolean; counterAttacks: number; lostAP: number; suppression: number[]; intentions: RogueEnemyIntent[];
    potions: { heal: number; mana: number; }; potionUsed: boolean;
    fightStart: { hp: number; mp: number; }; fight: RogueCounters; totals: RogueCounters;
    reports: RogueReport[]; logs: string[];
}
export interface RogueResult { ok: boolean; state: RogueState; reason?: string; }
