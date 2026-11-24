import type { InventoryCommand, InventoryConfig, InventoryItem, InventoryLocation, InventoryState } from "../../inventory/types/InventoryTypes";
import type { MarketGoods } from "../../market/types/MarketTypes";

export function isBattleNode(node: { kind: string }): boolean {
    return node.kind === "normal" || node.kind === "elite" || node.kind === "boss";
}

export const EXPEDITION_LOOT_FAMILIES = [
    "hp","mp","mixed","shield","repair","stamina","herb","ore","beast","relic","book","container","weapon","armor","accessory",
] as const;

export interface ExpeditionNode {
    id: number; key: string; kind: string; name: string; poolId: number;
    mainOrder: number; x: number; y: number;
    encounterKey?: string;
    enemyId?: number;
    icon?: string;
    searchMin?: number; searchMax?: number; searchWeight?: number;
}
export interface ExpeditionPool {
    id: number; code: string; min: number; max: number; minWeight: number; durability: [number,number];
    categories: number[]; qualities: number[];
}
export interface ExpeditionConfig extends InventoryConfig {
    mapVersion: string; nodes: ExpeditionNode[];
    pools: ExpeditionPool[]; variants: Array<{ family: string; templateId: number; weight: number }>;
    rules: { limitMs: number; searchMs: number; recoveryPercent: number;
        staminaMax: number; moveCost: number; normalCost: number; eliteCost: number; bossCost: number; searchCost: number;
        moveHpPercent: number; searchHpPercent: number; transitMin: number; transitMax: number; searchMin: number; searchMax: number;
        normalMin: number; normalMax: number; eliteMin: number; eliteMax: number;
        insightMin: number; insightMax: number; borrowMin: number; borrowMax: number };
}
export interface ExpeditionSource {
    node: number; entries: InventoryItem[]; opened: boolean; revealed: number; progressMs: number;
}
export interface ExpeditionState extends InventoryState {
    map: { version: string; generatorVersion: 4; nodes: ExpeditionNode[]; edges: Array<[number,number]>; present: number[]; visible: number[];
        cleared: number[]; used: number[]; sources: ExpeditionSource[]; warnings: number[]; warning: number | null;
        debugEnemyBlocking?: boolean };
}
export type ExpeditionCommand = InventoryCommand |
    { type: "buyMarketGoods"; offer: MarketGoods; to: InventoryLocation } |
    { type: "sellMarketItem"; uid: string; from: InventoryLocation } |
    { type: "debugEnemyBlocking"; enabled: boolean } |
    { type: "travel"; node: number } | { type: "borrow" | "insight" | "recover" } |
    { type: "search"; deltaMs: number } | { type: "warnings" | "openSource" | "interactSource" | "fight" };
export interface ExpeditionSave {
    version: 4; runId: string; createdAt: number; seed: number; config: ExpeditionConfig;
    commands: Array<{ at: number; command: ExpeditionCommand }>; state: ExpeditionState;
}
