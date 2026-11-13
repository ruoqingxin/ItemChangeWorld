import type { InventoryCommand, InventoryConfig, InventoryItem, InventoryState } from "../../inventory/types/InventoryTypes";
import type { NewBuildProfile } from "../../build/types/BuildTypes";

export interface ExpeditionNode {
    id: number; key: string; kind: string; name: string; enemy: string; pool: string;
    mainOrder: number; x: number; y: number;
    encounterKey?: string;
}
export interface ExpeditionPool {
    id: string; min: number; max: number; minWeight: number; durability: [number,number];
    categories: number[]; qualities: number[];
}
export interface ExpeditionConfig extends InventoryConfig {
    mapVersion: string; nodes: ExpeditionNode[]; edges: Array<[number,number]>;
    placements: Array<{ group: string; a: number; b: number; weight: number }>;
    pools: ExpeditionPool[]; variants: Array<{ family: string; templateId: number; weight: number }>;
    rules: { limitMs: number; searchMs: number; checkpointMs: number; recoveryPercent: number;
        supply: number[]; books: number[]; weaponId: number; containerId: number; hpId: number; mpId: number; repairId: number;
        staminaMax: number; moveCost: number; normalCost: number; eliteCost: number; bossCost: number; searchCost: number;
        moveHpPercent: number; searchHpPercent: number; transitMin: number; transitMax: number; searchMin: number; searchMax: number;
        normalMin?: number; normalMax?: number; eliteMin?: number; eliteMax?: number;
        insightMin?: number; insightMax?: number; borrowMin?: number; borrowMax?: number };
}
export interface ExpeditionSource {
    node: number; entries: InventoryItem[]; opened: boolean; revealed: number; progressMs: number;
}
export interface ExpeditionState extends InventoryState {
    map: { version: string; generatorVersion?: 2 | 3 | 4; nodes: ExpeditionNode[]; edges: Array<[number,number]>; present: number[]; visible: number[];
        cleared: number[]; used: number[]; sources: ExpeditionSource[]; warnings: number[]; warning: number | null;
        debugEnemyBlocking?: boolean };
}
export type ExpeditionCommand = InventoryCommand |
    { type: "debugEnemyBlocking"; enabled: boolean } |
    { type: "travel"; node: number } | { type: "borrow" | "insight" | "recover" } |
    { type: "search"; deltaMs: number } | { type: "warnings" | "openSource" | "interactSource" | "fight" };
export interface ExpeditionSave {
    version: 4; runId: string; createdAt: number; seed: number; config: ExpeditionConfig; profile: NewBuildProfile;
    commands: Array<{ at: number; command: ExpeditionCommand }>; state: ExpeditionState;
}
