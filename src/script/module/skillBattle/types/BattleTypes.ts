export type NewBattlePhase = "player_input" | "victory" | "defeat";
export type NewSwordSkill = "dianxing" | "liejia" | "huilan" | "liuhen" | "ningfeng";
export type NewSwordPassive = "chuzhao" | "xifeng" | "difeng" | "bengjia" | "lianmang" | "guanxi";
export type NewSkillKind = NewSwordSkill | "feiyan" | "yanjia" | "hanyue" | "xiandi" | "fanzhen";
export type NewPassiveKind = NewSwordPassive | "houlei" | "lifeng" | "yingxian" | "zhongyue" | "jieshan" |
    "gumai" | "xianji" | "gushou" | "huming" | "yaoyin";
export type NewBattleAction =
    | { type: "basic" | "guard" }
    | { type: "skill"; skillId: number }
    | { type: "potion"; itemUid: string };
export interface NewBattleToken { battleId: string; revision: number; }
export interface NewBattleItem { itemUid: string; itemId: number; }
export interface NewBattleWeapon {
    id: number; name: string; attack: number; defense: number; durability: number; maxDurability: number;
}
export interface NewBattleSkill {
    id: number; name: string; kind: NewSkillKind; school: string; mpCost: number;
    damagePercent: number; shieldPercent: number; shredPercent: number; markPercent: number;
    conditionalPercent?: number; reductionPercent?: number; counterPercent?: number;
}
export interface NewBattlePassive { id: number; name: string; kind: NewPassiveKind; value: number; school?: string; }
export interface NewBattleIntent { id: number; name: string; damage: number; block: number; charging: boolean; }
export interface NewBattleSetup {
    rulesId: string;
    earthRules?: { powerPercent: number; lowHpPercent: number };
    player: { maxHp: number; maxMp: number; baseAttack: number; baseDefense: number };
    weapon: NewBattleWeapon | null;
    skills: NewBattleSkill[];
    passives: NewBattlePassive[];
    potions: Array<{ itemId: number; name: string; resource: "hp" | "mp"; amount: number }>;
    build: { schools: string[]; actives: Array<{ skillId: number; level: number }>; passiveIds: number[] };
    enemy: { id: number; name: string; maxHp: number; intents: NewBattleIntent[] };
}
export interface NewBattleCarry {
    hp: number; mp: number; weapon: NewBattleWeapon | null; pouch: Array<NewBattleItem | null>;
}
export interface NewBattleState {
    version: 1;
    battleId: string;
    phase: NewBattlePhase;
    revision: number;
    round: number;
    mainActions: number;
    player: { hp: number; maxHp: number; mp: number; maxMp: number; block: number };
    enemy: { hp: number; maxHp: number; block: number; intentIndex: number };
    weapon: NewBattleWeapon | null;
    pouch: Array<NewBattleItem | null>;
    potionUsed: boolean;
    earth?: { power: boolean; gumai: boolean; potionSeen: boolean };
    common?: { firstAttack: boolean; firstGuard: boolean; rescueUsed: boolean; potionSeen: boolean };
    sword: {
        momentum: number; keen: boolean; enhancement: number; firstBasicUsed: boolean; xifeng: boolean;
        previousAttack: number | null; mark: { damage: number; ticks: number } | null;
    };
}
export type NewDamagePart = "body" | "keen" | "difeng" | "guanxi" | "mark" | "enemy" |
    "xianji" | "lifeng" | "zhongyue" | "jieshan" | "counter";
export type NewBattleEvent =
    | { type: "action"; name: string }
    | { type: "damage"; part: NewDamagePart; target: "player" | "enemy"; amount: number; absorbed: number; hpLoss: number }
    | { type: "shield"; target: "player" | "enemy"; amount: number; source: string }
    | { type: "shield_cleared"; target: "player" | "enemy"; amount: number }
    | { type: "resource"; resource: "hp" | "mp"; before: number; after: number }
    | { type: "potion"; itemUid: string; itemId: number; slot: number }
    | { type: "durability"; before: number; after: number }
    | { type: "momentum"; before: number; after: number }
    | { type: "keen"; active: boolean; amount: number }
    | { type: "earth_power"; active: boolean }
    | { type: "reduction"; amount: number }
    | { type: "passive"; id: number; name: string }
    | { type: "mark"; damage: number; ticks: number }
    | { type: "intent"; id: number; name: string }
    | { type: "round"; round: number }
    | { type: "ended"; result: "victory" | "defeat" };
export interface NewBattlePreview {
    token: NewBattleToken; name: string; mpCost: number; durabilityCost: number; shred: number;
    body: number; keen: number; difeng: number; guanxi: number; mark: number; markTicks: number;
    enemyHpLoss: number; playerHpLoss: number; shield: number; recovery: number;
    resource: "hp" | "mp" | null; potion: boolean;
    momentumGain: number; keenEnhancement: number;
    earthBonus?: number; commonBonus?: number; counter?: number; reduction?: number; powerUsed?: boolean;
}
export type NewBattleResult =
    | { ok: true; state: NewBattleState; events: NewBattleEvent[]; preview: NewBattlePreview }
    | { ok: false; state: NewBattleState; events: NewBattleEvent[]; preview: null; reason: string };
