export type SkillBattlePhase = "player_input" | "resolving" | "victory" | "defeat";
export type SkillBattleSide = "player" | "enemy";
export type SkillIntentType = "attack" | "charge" | "block";
export type SkillItemUseType = "fire_stone" | "earth_stone" | "heal";
export type SkillUpgradeEffect = "counter" | "full_qi_slash" | "thrust_cost" | "interrupt_slash" | "guard_block" | "fire_burn";

export interface ISkillUpgradeConfig {
    id: number;
    name: string;
    effect: SkillUpgradeEffect;
    value: number;
    requiredCollectionId: number;
}

export interface ISkillItemConfig {
    itemId: number;
    name: string;
    useType: SkillItemUseType;
    initialSlot: number;
    healValue: number;
    burnStacks: number;
    blockValue: number;
    element: number;
    damageRate: number;
    durabilityCost: number;
}

export interface ISkillItemInstance {
    itemUid: string;
    itemId: number;
}

export interface ISkillBattleCarry {
    playerHp: number;
    playerMaxHp: number;
    weaponId: number;
    weaponDurability: number;
    pouchSlots: Array<ISkillItemInstance | null>;
    upgradeIds?: number[];
}

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
    items: ISkillItemConfig[];
    skills: ISkillConfig[];
    upgrades?: ISkillUpgradeConfig[];
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
    weaponId: number;
    enemyBurn: number;
    pouchSlots: Array<ISkillItemInstance | null>;
    upgradeIds: number[];
    nextSlashBonus: number;
}

export type ISkillBattleAction =
    | { type: "skill"; skillId: number; stoneItemUid?: string }
    | { type: "use_item"; itemUid: string };

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
    | { type: "battle_ended"; result: "victory" | "defeat" }
    | SkillSupplyEvent;

export type SkillSupplyEvent =
    | { type: "item_consumed"; itemUid: string; itemId: number; slot: number; name: string }
    | { type: "durability_changed"; before: number; after: number }
    | { type: "enchant_used"; element: number; name: string }
    | { type: "healed"; amount: number }
    | { type: "burn_changed"; before: number; after: number }
    | { type: "burn_damage"; amount: number; hpLoss: number };

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
    enchantDamage: number;
    enchantBlockAbsorbed: number;
    enchantHpLoss: number;
    burnApplied: number;
    burnDamage: number;
    healAmount: number;
    durabilityCost: number;
    consumedItemUid: string | null;
    counterDamage: number;
    counterHpLoss: number;
}

export interface ISkillActionResolution {
    ok: boolean;
    reason?: string;
    state: ISkillBattleState;
    events: SkillBattleEvent[];
    preview: ISkillActionPreview | null;
}
