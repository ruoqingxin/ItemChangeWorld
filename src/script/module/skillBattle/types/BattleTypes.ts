import type { RogueEnemyId, RogueLoadout, RogueMove, RogueState } from "./QingmingTypes";

export interface QingmingBattleSetup {
    enemyId: RogueEnemyId; enemyMp: number; enemyAttack: number; enemyDefense: number; seed: number;
    loadout: RogueLoadout;
}
export type BattleAction =
    | { type: "basic" | "guard" }
    | { type: "qingming"; move: RogueMove; enemyAction?: number }
    | { type: "potion"; itemUid: string };
export interface BattleToken { battleId: string; revision: number; }
export interface BattleItem { itemUid: string; itemId: number; }
export interface BattleWeapon {
    id: number; name: string; attack: number; defense: number; durability: number; maxDurability: number;
}
export interface BattleSetup {
    qingming: QingmingBattleSetup; rulesId: string;
    player: { maxHp: number; maxMp: number; baseAttack: number; baseDefense: number };
    weapon: BattleWeapon | null;
    potions: Array<{ itemId: number; name: string; resource: "hp" | "mp"; amount: number }>;
    enemy: { id: number; name: string; maxHp: number };
}
export interface BattleCarry {
    hp: number; mp: number; weapon: BattleWeapon | null; pouch: Array<BattleItem | null>;
}
export interface BattleState {
    qingming: RogueState; version: 1; battleId: string;
    phase: "player_input" | "victory" | "defeat"; revision: number; round: number; mainActions: number;
    player: { hp: number; maxHp: number; mp: number; maxMp: number; block: number };
    enemy: { hp: number; maxHp: number; block: number };
    weapon: BattleWeapon | null; pouch: Array<BattleItem | null>; potionUsed: boolean;
}
export type BattleEvent =
    | { type: "action"; name: string }
    | { type: "damage"; part: "body" | "enemy"; target: "player" | "enemy"; amount: number; absorbed: number; hpLoss: number }
    | { type: "resource"; resource: "hp" | "mp"; before: number; after: number }
    | { type: "potion"; itemUid: string; itemId: number; slot: number }
    | { type: "durability"; before: number; after: number }
    | { type: "ended"; result: "victory" | "defeat" };
export interface BattlePreview {
    token: BattleToken; name: string; mpCost: number; durabilityCost: number; body: number;
    enemyHpLoss: number; playerHpLoss: number; shield: number; recovery: number;
    resource: "hp" | "mp" | null; potion: boolean;
}
export type BattleResult =
    | { ok: true; state: BattleState; events: BattleEvent[]; preview: BattlePreview }
    | { ok: false; state: BattleState; events: BattleEvent[]; preview: null; reason: string };
