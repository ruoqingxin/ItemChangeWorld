export type StatKey = "hp" | "mp" | "a" | "s" | "armor" | "speed";
export type CombatStats = Record<StatKey, number>;
export type StatusType = "bleed" | "burn" | "chill" | "mark";
export interface CombatStatus { type: StatusType; power: number; ticks: number; }
export interface EquipmentTrait { code: string; name: string; p: number; n?: number; kills?: number; }
export interface EquipmentInstance {
    code: string; name: string; slot: number; quality: number; main: StatKey; mainBand: number; mainValue: number;
    sub: StatKey; subBand: number; subValue: number; trait: EquipmentTrait;
    durability: number; maxDurability: number; kills: number;
}
export interface CombatSkill {
    id: number; code: string; name: string; mp: number; cd: number; kind: number; uses: number;
    description: string; effect: Record<string, number>;
}
export interface EnemyTemplate extends CombatStats {
    id: number; name: string; tier: number; pattern: string[]; healUses: number; wardUses: number; purifyUses: number;
}
export interface CombatUnit extends CombatStats {
    maxHp: number; maxMp: number; shield: number; statuses: CombatStatus[]; guard: number; sunderUntil: number;
    mine?: { power: number; until: number } | null;
}
export interface CombatPlayer extends CombatUnit {
    bloodShield: number; counter: boolean; fortify: number; ironUntil: number; hidden: number; stored: number;
    rage: number; lastKind: number; turns: number; cds: Record<string, number>; uses: Record<string, number>;
    counters: Record<string, number>; forms: string[]; barrierUsed: boolean; reflectUsed: boolean; frugalUses: number;
}
export interface CombatEnemy extends CombatUnit, EnemyTemplate {
    suppress: number; suppressUntil: number; phase: boolean; heals: number; wards: number; purifies: number;
    charged: boolean; actions: number;
}
export interface CombatBuild { skills: string[]; potions: number[]; }
export interface CombatState {
    build: CombatBuild; items: EquipmentInstance[]; traits: Record<string, EquipmentTrait>; p: CombatPlayer;
    enemies: CombatEnemy[]; round: number; phase: number; won: boolean; lost: boolean; settled: boolean;
    trace: boolean; log: string[]; potions: number[]; initialPotions: number[]; potionUsedAt?: number;
    metrics: {
        damage: number; incoming: number; healing: number; manaSpent: number; manaRecovered: number; shieldAbsorbed: number;
        paidLife: number; playerActions: number; enemyActions: number; kills: number; hpPotions: number; mpPotions: number;
        dualPotions: number; wardPotions: number; dosesUsed: number; physicalDamage: number; magicDamage: number; dotDamage: number;
        actions: Record<string, number>; procs: Record<string, number>; conversions: Record<string, number>;
    };
}
export interface CombatOptions {
    player?: CombatStats; hp?: number; mp?: number; pressure?: number; enemyHp?: number; enemyAttack?: number;
    potions?: number[]; trace?: boolean;
}
export interface HitOptions { dot?: boolean; pierce?: number; shieldBonus?: number; suppress?: number; }
export interface SkillOptions { consumeMark?: boolean; cleanseTypes?: StatusType[]; }
