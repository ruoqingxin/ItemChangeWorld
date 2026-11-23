export enum WeaponAttribute { Hp = 1, Mp = 2, Armor = 3, Attack = 4 }
export type WeaponPassiveCode = "leech" | "bloodthirst" | "mana" | "echo" | "break" | "veteran" | "thunder" | "execute";
export interface WeaponTrialSetup {
    base: number; quality: number; passive?: WeaponPassiveCode; broken?: boolean;
}
export interface WeaponRoll {
    base: number; quality: number;
    main: { attribute: WeaponAttribute; band: number; value: number };
    secondary: { attribute: WeaponAttribute; band: number; value: number };
    passive: WeaponPassiveCode; benefit: number; threshold: number; maxDurability: number;
}
export interface WeaponTrialState {
    roll: WeaponRoll; durability: number; kills: number; attacks: number; charge: number;
    applied: { hp: number; mp: number; attack: number; defense: number };
    action: { hpDamage: number; mpBefore: number; attack: boolean; broke: boolean } | null;
}
