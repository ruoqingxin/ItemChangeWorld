export enum EBattleResult {
    Running = "running",
    Win = "win",
    Lose = "lose",
}


/** status.status_id，与 status 配置表一致 */
export enum EBattleStatusId {
    /** 力量 */
    Power = 1,
    /** 虚弱 */
    Weak = 2,
    /** 中毒 */
    Poison = 3,
    /** 灼烧 */
    Burn = 4,
    /** 易伤 */
    Vulnerable = 5,
    /** 破甲 */
    ArmorBreak = 6,
    /** 冻结 */
    Freeze = 7,
}

export enum EBattleSide {
    Player = "player",
    Enemy = "enemy",
}

export interface IEffectSpec {
    /**
     * effect_define.effect_id
     */
    effectId: number;

    /**
     * 效果数值。
     * 例如：
     * 造成 6 点伤害 => 6
     * 获得 5 护盾 => 5
     * 施加 2 层中毒 => 2
     */
    value: number;

    /**
     * EEffectTarget
     */
    target: number;

    /**
     * 附加参数。
     * 当前主要用于 ApplyStatus：
     * effect_id,value,target,status_id
     */
    param?: number;
}

/** 临战法囊单格运行时数据 */
export interface IBattleItemSlotRuntime {
    /** 法囊格子下标，0-4 */
    slotIndex: number;

    /** 物品实例唯一 ID */
    itemUid?: string;

    /** 物品配置 ID */
    itemId?: number;

    /** 主类型 EMainType */
    mainType?: number;

    /** 子类型 ESubType */
    subType?: number;
}

/** 卡牌注灵状态 */
export interface IBattleCardEnchantState {
    /** 消耗来源法囊格 */
    sourceSlotIndex: number;

    /** 已消耗的物品实例 UID */
    consumedItemUid: string;

    /** 已消耗的物品配置 ID */
    itemId: number;

    /** 属性石配置 ID */
    stoneId: number;

    /** 注灵五行 EElement */
    element: number;

    /** 注灵伤害倍率 */
    damageRate: number;

    /** 注灵消耗的武器耐久 */
    durabilityCost: number;

    /** 注灵附加效果 */
    minorEffectGroup: IEffectSpec[];

    /** 是否已正式注灵 */
    applied: boolean;
}

export interface IBattleCard {
    uid: number;
    cardId: number;
    name: string;
    icon: string;
    cardType: number;
    costAp: number;
    /** 是否可注灵（配置 can_enchant） */
    canEnchant: boolean;
    effects: IEffectSpec[];
    cfg: any;

    /** 原始卡牌名，注灵后用于恢复 */
    baseName: string;

    /** 来源牌组 EDeckType */
    sourceDeckType: number;

    /** 来源武器实例 UID */
    sourceWeaponUid?: string;

    /** 注灵状态 */
    enchantState?: IBattleCardEnchantState;
}

export interface IBattleStatus {
    statusId: number;
    name: string;
    stack: number;
    cfg: any;
}

export interface IBattleUnit {
    uid: string;
    side: EBattleSide;
    cfgId: number;
    name: string;

    maxHp: number;
    hp: number;
    def: number;
    block: number;

    statuses: Map<number, IBattleStatus>;
    cfg: any;
}

export interface IBattlePlayer extends IBattleUnit {
    ap: number;

    maxMp: number;
    mp: number;

    weaponId: number;
    weaponDurability: number;
    maxWeaponDurability: number;
    weaponCfg: any;
}

export interface IBattleIntent {
    intentGroupId: number;
    intentId: number;
    name: string;
    intentType: number;
    effects: IEffectSpec[];
    cfg: any;
}

export interface IBattleEnemy extends IBattleUnit {
    order: number;
    level: number;
    intentGroupId: number;
    intents: IBattleIntent[];
    intentCursor: number;
}

export interface IBattleState {
    scenarioId: number;
    scenarioCfg: any;
    ruleCfg: any;

    player: IBattlePlayer;
    enemies: IBattleEnemy[];

    /** 临战法囊，固定 5 格 */
    battlePouch: IBattleItemSlotRuntime[];

    drawPile: IBattleCard[];
    hand: IBattleCard[];
    discardPile: IBattleCard[];
    exhaustPile: IBattleCard[];

    turnNo: number;
    isPlayerTurn: boolean;
    result: EBattleResult;

    logs: string[];
}

/** 注灵校验结果 */
export interface IEnchantCheckResult {
    ok: boolean;
    reason?: string;
}

/** 伤害预览结果 */
export interface IDamagePreview {
    /** 卡牌基础伤害（配置值） */
    baseDamage: number;

    /** 基础攻击最终伤害（含状态/防御） */
    baseFinalDamage: number;

    /** 注灵基础伤害（未选目标） */
    enchantBaseDamage: number;

    /** 注灵真实伤害（含五行克制） */
    enchantFinalDamage: number;

    /** 注灵五行 */
    enchantElement: number;

    /** 五行克制说明，如「火克金」 */
    counterText: string;

    /** 护盾吸收总量 */
    blockAbsorb: number;

    /** 预计生命损失 */
    hpLoss: number;

    /** 是否已注灵 */
    hasEnchant: boolean;
}
