export type ShadowKind = "edge" | "guard" | "guide";
export type EnemyStyle = "dummy" | "assault" | "defensive" | "burst";
export type ManualMove = "basic" | "guard" | "edge" | "wind" | "guide" | "fall" | "end" | "heal" | "mana";
export interface TestAttributes { hp: number; mp: number; attack: number; defense: number; }
export interface ManualTestSetup {
    star: number;
    rank: number;
    player: TestAttributes;
    enemy: TestAttributes;
    style: EnemyStyle;
}
export interface SwordShadow {
    id: number;
    kind: ShadowKind;
    age: number;
    returnedRound: number;
}
export interface SwordGroup { id: number; members: SwordShadow[]; responded: boolean; }
export interface EnemyIntent {
    kind: "attack" | "guard" | "heal" | "charge" | "wait";
    percent: number;
    label: string;
    mpCost?: number;
}
export interface FallPlan { keep: boolean; absorb?: number; }
export interface ManualTestAction extends FallPlan {
    move: ManualMove;
    branch?: string;
    target?: number;
    other?: number;
    member?: number;
    form?: number;
    kind?: ShadowKind;
    slot?: number;
    enemyAction?: number;
}
export interface ManualTestState {
    setup: ManualTestSetup;
    round: number;
    ap: number;
    revision: number;
    outcome: "active" | "victory" | "defeat";
    player: TestAttributes & { maxHp: number; maxMp: number; shield: number; };
    enemy: TestAttributes & { maxHp: number; maxMp: number; shield: number; charged: boolean; };
    sky: SwordGroup[];
    body: SwordShadow[];
    cache: SwordGroup[];
    nextId: number;
    marks: number;
    energy: number;
    activeEnergy: number;
    responseEnergy: boolean;
    firstRoot: boolean;
    firstReorder: boolean;
    firstKeep: boolean;
    bodyAttacked: number[];
    bodySynced: number[];
    guideBodyUsed: boolean;
    potionUsed: boolean;
    finisherUsed: boolean;
    orbit: number;
    reverseUsed: boolean;
    delayed: (FallPlan & { at: number; ids: number[]; retain: number; }) | null;
    ambush: number | null;
    ambushAt: number;
    pinpoint: number | null;
    pinpointAt: number;
    responseCount: number;
    cutAt: number;
    intentions: EnemyIntent[];
    logs: string[];
    totals: { damage: number; taken: number; shield: number; };
}
export interface ManualTestResult { ok: boolean; reason?: string; state: ManualTestState; }
