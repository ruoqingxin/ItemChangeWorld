import type { BattleWeapon } from "../../skillBattle/types/BattleTypes";
import type { BuildCommand, BuildConfig, BuildState } from "../../build/types/BuildTypes";
import type { EQuality } from "../../../config/schema";

export type InventorySpace = "warehouse" | "battle" | "safe" | "bag" | "weapon" | "container" |
    "source" | "consumed" | "lost";
export interface InventoryLocation { space: InventorySpace; x?: number; y?: number; rotated?: boolean; node?: number; }
export interface InventoryTemplate {
    id: number; name: string; kind: "hp" | "mp" | "repair" | "stamina" | "book" | "material" | "weapon" | "container";
    width: number; height: number; rotate: boolean; battle: boolean; safe: boolean; stack: number;
    bagWidth: number; bagHeight: number; icon: string; quality: EQuality;
    weight: number; weightLimit: number; staminaRestore: number;
}
export interface InventoryItem { uid: string; templateId: number; location: InventoryLocation; durability: number | null; }
export interface InventoryWarehousePlacement { uid: string; page: number; x: number; y: number; rotated: boolean; }
export type InventoryWarehouseTarget = Omit<InventoryWarehousePlacement,"uid">;
export interface InventoryConfig {
    build: BuildConfig; templates: InventoryTemplate[];
    nodeLimit: number;
    weight: { base: number; sourcePages: number };
    staminaMax: number;
    spaces: { battleWidth: number; battleHeight: number; safeWidth: number; safeHeight: number; repair: number };
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
}
export interface InventoryMove { uid: string; from: InventoryLocation; to: InventoryLocation; }
export type InventoryCommand =
    | { type: "enter" }
    | { type: "move"; move: InventoryMove; warehouseTo?: InventoryWarehouseTarget }
    | { type: "arrangeWarehouse"; uid: string; from: InventoryLocation; to: InventoryWarehouseTarget }
    | { type: "equipWeapon"; uid: string | null; from?: InventoryLocation; oldTo?: InventoryLocation; warehouseTo?: InventoryWarehouseTarget }
    | { type: "equipContainer"; uid: string | null; from?: InventoryLocation; oldTo?: InventoryLocation; contents: InventoryMove[];
        warehouseTo?: InventoryWarehouseTarget }
    | { type: "use"; uid: string; from: InventoryLocation }
    | { type: "extract" | "abandon" | "timeout" }
    | { type: "build"; command: BuildCommand };
export type InventoryWeapon = BattleWeapon;
