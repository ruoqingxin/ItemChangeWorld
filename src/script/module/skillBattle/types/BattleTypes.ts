import type { CombatState, EquipmentInstance, SkillOptions } from "./CombatTypes";
export type BattleAction =
    | { type: "basic" | "guard" }
    | ({ type: "skill"; code: string; target?: number } & SkillOptions)
    | { type: "potion"; itemUid: string };
export interface BattleToken { battleId: string; revision: number; }
export interface BattleItem { itemUid: string; itemId: number; }
export interface BattleEquipment { itemUid: string; itemId: number; name: string; instance: EquipmentInstance; }
export interface BattleWeapon {
    id: number; name: string; attack: number; defense: number; durability: number; maxDurability: number;
}
export interface BattleSetup {
    rulesId: string; skills: string[]; enemyId: number; pressure: number;
    player: { maxHp: number; maxMp: number; baseAttack: number; baseSpirit: number; baseDefense: number; baseSpeed: number };
    weapon: BattleWeapon | null; equipment: BattleEquipment[];
    potions: Array<{itemId:number;name:string;resource:"hp"|"mp"|"mixed"|"shield";amount:number;secondaryAmount:number}>;
    enemy: {id:number;name:string;maxHp:number};
}
export interface BattleCarry {
    hp: number; mp: number; weapon: BattleWeapon | null; equipment: BattleEquipment[]; pouch: Array<BattleItem | null>;
}
export interface BattleState {
    combat: CombatState; version: 2; battleId: string; phase: "player_input" | "victory" | "defeat";
    revision: number; round: number; mainActions: number;
    player: {hp:number;maxHp:number;mp:number;maxMp:number;block:number};
    enemy: {hp:number;maxHp:number;block:number}; weapon: BattleWeapon | null;
    equipment: BattleEquipment[]; pouch: Array<BattleItem | null>; potionUsed: boolean;
}
export type BattleEvent =
    | {type:"action";name:string}
    | {type:"damage";part:"body"|"enemy";target:"player"|"enemy";amount:number;absorbed:number;hpLoss:number}
    | {type:"resource";resource:"hp"|"mp";before:number;after:number}
    | {type:"potion";itemUid:string;itemId:number;slot:number}
    | {type:"durability";before:number;after:number}
    | {type:"ended";result:"victory"|"defeat"};
export interface BattlePreview {
    token:BattleToken;name:string;mpCost:number;durabilityCost:number;body:number;enemyHpLoss:number;playerHpLoss:number;
    shield:number;recovery:number;resource:"hp"|"mp"|"mixed"|"shield"|null;secondaryRecovery:number;potion:boolean;
}
export type BattleResult =
    | {ok:true;state:BattleState;events:BattleEvent[];preview:BattlePreview}
    | {ok:false;state:BattleState;events:BattleEvent[];preview:null;reason:string};
