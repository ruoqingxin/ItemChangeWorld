import type { NewBattleWeapon } from "./NewBattleTypes";
import type { NewBuildCommand, NewBuildConfig, NewBuildProfile, NewBuildState } from "./NewBuildTypes";
import type { EQuality } from "../../../config/schema";

export type InventorySpace = "warehouse" | "battle" | "safe" | "bag" | "weapon" | "container" |
    "ground" | "consumed" | "lost";
export interface InventoryLocation { space: InventorySpace; x?: number; y?: number; rotated?: boolean; node?: number; }
export interface InventoryTemplate {
    id: number; name: string; kind: "hp" | "mp" | "repair" | "book" | "material" | "weapon" | "container";
    width: number; height: number; rotate: boolean; battle: boolean; safe: boolean; stack: number;
    potionId: number; bagWidth: number; bagHeight: number; icon: string; quality?: EQuality;
}
export interface InventoryItem { uid: string; templateId: number; location: InventoryLocation; durability: number | null; }
export interface InventoryWarehousePlacement { uid: string; page: number; x: number; y: number; rotated: boolean; }
export type InventoryWarehouseTarget = Omit<InventoryWarehousePlacement,"uid">;
export interface InventoryConfig {
    build: NewBuildConfig; templates: InventoryTemplate[];
    groundNodeLimit?: number;
    spaces: { battleWidth: number; battleHeight: number; safeWidth: number; safeHeight: number; repair: number };
    fixtures: Array<{ id: number; templateId: number; count: number; node: number; durability: number }>;
}
export interface InventoryState {
    runId: string; revision: number; phase: "preparation" | "active" | "ended";
    enteredAt: number | null; deadlineAt: number | null; flow: NewBuildState | null;
    items: InventoryItem[]; hp: number; mp: number; node: number; revealed: number[];
    result: "extract" | "defeat" | "abandon" | "timeout" | null;
    returned: string[]; lost: string[]; consumed: string[];
    warehouseLayout?: InventoryWarehousePlacement[];
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
    | { type: "visit"; node: number }
    | { type: "reveal" }
    | { type: "extract" | "abandon" | "timeout" }
    | { type: "build"; command: NewBuildCommand };
export interface InventorySave {
    version: 1; runId: string; createdAt: number; seed: number; config: InventoryConfig; profile: NewBuildProfile;
    commands: Array<{ at: number; command: InventoryCommand }>; state: InventoryState;
}
export type InventoryWeapon = NewBattleWeapon;
