import type { WeaponRoll, WeaponTrialSetup } from "./WeaponTrialTypes";

export type EquipmentSlot = "armor" | "accessory";
export type EquipmentPassive = "iron" | "reguard" | "reflect" | "fortify" | "revive" | "danger" | "ward" | "nourish" |
    "pulse" | "frugal" | "return" | "medicine" | "harmony" | "calm" | "dawn" | "steady";
export interface EquipmentSetup extends Omit<WeaponTrialSetup, "passive"> { passive?: EquipmentPassive; }
export interface EquipmentRoll extends Omit<WeaponRoll, "passive"> { passive: EquipmentPassive; }
export interface EquipmentState {
    roll: EquipmentRoll; durability: number;
    applied: { hp: number; mp: number; attack: number; defense: number };
    used: boolean; pendingHeal: number; guarded: boolean; refunded: boolean;
    forms: string[]; harmony: boolean; calmUses: number; phaseTaken: number; reflected: boolean;
}
export interface CombatTrialProfile {
    edge: number; guide: number; guideMp: number; fall: number; guard: number; wind: number;
    shieldAttack: number; shieldArmor: number; shieldCap: number; basicMana: number;
    costs: { edge: number; wind: number; guide: number; fall: number };
    enemyHp: { 普通: number; 精英: number; 首领: number };
}
