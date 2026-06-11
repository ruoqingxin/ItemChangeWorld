export enum EBattleResult {
    Running = "running",
    Win = "win",
    Lose = "lose",
}


/** status.status_id，与导表配置保持一致 */
export enum EBattleStatusId {
    Power = 1,
    Weak = 2,
    Vulnerable = 3,
    ArmorBreak = 4,
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

export interface IBattleCard {
    uid: number;
    cardId: number;
    name: string;
    icon: string;
    cardType: number;
    costAp: number;
    canEnchant: boolean;
    effects: IEffectSpec[];
    cfg: any;
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

    drawPile: IBattleCard[];
    hand: IBattleCard[];
    discardPile: IBattleCard[];
    exhaustPile: IBattleCard[];

    turnNo: number;
    isPlayerTurn: boolean;
    result: EBattleResult;

    logs: string[];
}