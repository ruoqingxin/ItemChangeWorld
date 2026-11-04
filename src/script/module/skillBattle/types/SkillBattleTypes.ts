export type SkillBattlePhase = "player_input" | "resolving" | "victory" | "defeat";
export type SkillBattleSide = "player" | "enemy";
export type SkillIntentType = "attack" | "charge" | "block";

export interface ISkillConfig {
    id: number;
    name: string;
    icon: string;
    qiCost: number;
    damage: number;
    block: number;
    qiGain: number;
    canEnchant: boolean;
    interrupts: boolean;
}

export interface ISkillIntentConfig {
    id: number;
    name: string;
    icon: string;
    type: SkillIntentType;
    damage: number;
    block: number;
    interruptible: boolean;
}

export interface ISkillBattleSetup {
    encounterId: number;
    order: number;
    playerMaxHp: number;
    qiMax: number;
    startQi: number;
    weaponId: number;
    weaponDurability: number;
    skills: ISkillConfig[];
    enemy: {
        id: number;
        name: string;
        icon: string;
        maxHp: number;
        element: number;
        intents: ISkillIntentConfig[];
    };
}

export interface ISkillCombatant {
    hp: number;
    maxHp: number;
    block: number;
}

export interface ISkillBattleState {
    battleId: string;
    encounterId: number;
    phase: SkillBattlePhase;
    revision: number;
    round: number;
    player: ISkillCombatant;
    enemy: ISkillCombatant;
    swordQi: number;
    swordQiMax: number;
    enemyId: number;
    enemyIntentIndex: number;
    weaponDurability: number;
}

export interface ISkillBattleAction {
    type: "skill";
    skillId: number;
}

/** A confirmation applies only to the exact snapshot that was previewed. */
export interface ISkillBattleInputToken {
    battleId: string;
    revision: number;
}

export type SkillBattleEvent =
    | { type: "skill_used"; skillId: number; name: string }
    | { type: "qi_changed"; before: number; after: number; overflow: number }
    | { type: "damage"; source: SkillBattleSide; target: SkillBattleSide; amount: number; blockAbsorbed: number; hpLoss: number }
    | { type: "block_gained"; target: SkillBattleSide; amount: number }
    | { type: "block_cleared"; target: SkillBattleSide; amount: number }
    | { type: "intent_interrupted"; intentId: number; name: string }
    | { type: "intent_executed"; intentId: number; name: string }
    | { type: "round_started"; round: number; intentId: number; name: string }
    | { type: "battle_ended"; result: "victory" | "defeat" };

export interface ISkillActionPreview {
    token: ISkillBattleInputToken;
    qiCost: number;
    qiAfterAction: number;
    baseDamage: number;
    blockAbsorbed: number;
    enemyHpLoss: number;
    blockGained: number;
    interrupted: boolean;
    enemyDamage: number;
    playerBlockAbsorbed: number;
    playerHpLoss: number;
}

export interface ISkillActionResolution {
    ok: boolean;
    reason?: string;
    state: ISkillBattleState;
    events: SkillBattleEvent[];
    preview: ISkillActionPreview | null;
}
