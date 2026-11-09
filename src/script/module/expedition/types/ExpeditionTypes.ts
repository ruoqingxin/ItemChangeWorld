import type { ISkillBattleAction, ISkillBattleSetup, ISkillBattleState, ISkillItemInstance, ISkillUpgradeConfig } from "../../skillBattle/types/SkillBattleTypes";
import type { IExpeditionBuildConfig, IExpeditionBuildState } from "./ExpeditionBuildTypes";
import type { IExpeditionMapConfig, IExpeditionMapState } from "./ExpeditionMapTypes";

export interface IExpeditionReport {
    runId: string;
    seed: number;
    battles: Array<{ initial: ISkillBattleState; actions: ISkillBattleAction[] }>;
    choices: Array<{ encounterIndex: number; battleIndex?: number; ids: number[]; selectedId: number | null }>;
    outcome: "extracted" | "failed" | null;
    endReason: "extracted" | "defeat" | "timeout" | null;
    recoveries: Array<{ nodeId: string; battleIndex: number; hpBefore: number; hpAfter: number }>;
    exitEncounter: number | null;
    broughtLoot: ISkillItemInstance[];
    remainingPouch: Array<ISkillItemInstance | null>;
    collectionUnlockIds: number[];
}

export interface IExpeditionLootConfig {
    itemId: number;
    name: string;
    useType: "currency" | "collection";
    currencyValue: number;
    collectionId: number;
}

export interface IExpeditionConfig {
    encounters: ISkillBattleSetup[];
    upgrades: ISkillUpgradeConfig[];
    loot: IExpeditionLootConfig[];
    rewards: number[][];
    build?: IExpeditionBuildConfig;
    map?: IExpeditionMapConfig;
    requireBuildSelection?: boolean;
}

export interface IExpeditionProfile {
    profileId: string;
    nextRunIndex: number;
    currency: number;
    collectionIds: number[];
    warehouse: ISkillItemInstance[];
    weaponId: number;
    weaponDurability: number;
    pouchSlots: Array<ISkillItemInstance | null>;
    settledRunIds: string[];
}

export interface IExpeditionState {
    runId: string;
    seed: number;
    rngState: number;
    encounterIndex: number;
    phase: "map" | "battle" | "reward" | "decision" | "extracted" | "failed";
    loot: ISkillItemInstance[];
    upgradeIds: number[];
    allowedUpgradeIds: number[];
    pendingUpgradeChoices: number[];
    settled: boolean;
    battle: ISkillBattleState;
    report: IExpeditionReport;
    build?: IExpeditionBuildState;
    map?: IExpeditionMapState;
}

export interface IExpeditionSave {
    version: 2;
    configSignature: string;
    profile: IExpeditionProfile;
    run: IExpeditionState | null;
    history: IExpeditionReport[];
}

export interface IExpeditionStorage {
    read(): string | null;
    write(value: string): void;
}
