import type { BattleWeapon } from "../../skillBattle/types/BattleTypes";
import type { BuildCommand, BuildConfig, BuildState } from "../../build/types/BuildTypes";
import type { EQuality } from "../../../config/schema";
import type { EquipmentInstance } from "../../skillBattle/types/CombatTypes";

export type InventorySpace = "warehouse" | "battle" | "safe" | "bag" | "weapon" | "armor" | "accessory" | "container" |
    "source" | "consumed" | "lost";
export interface InventoryLocation { space: InventorySpace; x?: number; y?: number; rotated?: boolean; node?: number; }
export interface InventoryTemplate {
    id: number; name: string; kind: "hp" | "mp" | "mixed" | "shield" | "repair" | "stamina" | "book" | "material" | "weapon" | "armor" | "accessory" | "container";
    width: number; height: number; rotate: boolean; battle: boolean; safe: boolean; stack: number;
    bagWidth: number; bagHeight: number; icon: string; quality: EQuality;
    weight: number; weightLimit: number; staminaRestore: number;
    weaponDurability: number; repairAmount: number; recyclePrice: number;
    equipmentBase: string | null;
}
export interface InventoryItem { uid: string; templateId: number; location: InventoryLocation; durability: number | null; equipment?: EquipmentInstance; }
export interface InventoryWarehousePlacement { uid: string; page: number; x: number; y: number; rotated: boolean; }
export type InventoryWarehouseTarget = Omit<InventoryWarehousePlacement,"uid">;
export interface InventoryConfig {
    build: BuildConfig; templates: InventoryTemplate[];
    nodeLimit: number;
    weight: { base: number; sourcePages: number };
    staminaMax: number;
    spaces: { battleWidth: number; battleHeight: number; safeWidth: number; safeHeight: number };
    fixtures: Array<{ id: number; templateId: number; count: number; node: number; durability: number }>;
}
export interface InventoryState {
    runId: string; revision: number; phase: "preparation" | "active" | "ended";
    enteredAt: number | null; deadlineAt: number | null; flow: BuildState | null;
    items: InventoryItem[]; hp: number; mp: number; node: number; revealed: number[];
    result: "extract" | "defeat" | "abandon" | "timeout" | null;
    returned: string[]; lost: string[]; consumed: string[];
    warehouseLayout?: InventoryWarehousePlacement[];
    sourceLayouts?: Array<{ node: number; slots: InventoryWarehousePlacement[] }>;
    interactionSource?: number | null;
    stamina?: number;
    bagColumns?: 7;
    wish: number;
}
export interface InventoryMove { uid: string; from: InventoryLocation; to: InventoryLocation; }
export type InventoryAction =
    | { type: "enter" }
    | { type: "move"; move: InventoryMove; warehouseTo?: InventoryWarehouseTarget }
    | { type: "moveBatch"; moves: InventoryMove[] }
    | { type: "arrangeWarehouse"; uid: string; from: InventoryLocation; to: InventoryWarehouseTarget }
    | { type: "sortStorage"; page: number }
    | { type: "equipEquipment"; slot: "weapon" | "armor" | "accessory"; uid: string | null; from?: InventoryLocation;
        oldTo?: InventoryLocation; warehouseTo?: InventoryWarehouseTarget }
    | { type: "repair"; uid: string; from: InventoryLocation; targetUid: string }
    | { type: "repairAll" }
    | { type: "sell"; uid: string; from: InventoryLocation }
    | { type: "equipContainer"; uid: string | null; from?: InventoryLocation; oldTo?: InventoryLocation; contents: InventoryMove[];
        warehouseTo?: InventoryWarehouseTarget }
    | { type: "use"; uid: string; from: InventoryLocation }
    | { type: "extract" | "abandon" | "timeout" }
    | { type: "build"; command: BuildCommand };
export type InventoryCommand = InventoryAction | { type: "reflowBag"; action: InventoryAction };
export type InventoryWeapon = BattleWeapon;
