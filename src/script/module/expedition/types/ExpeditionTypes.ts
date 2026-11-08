import type { ISkillBattleAction, ISkillBattleSetup, ISkillBattleState, ISkillItemInstance, ISkillUpgradeConfig } from "../../skillBattle/types/SkillBattleTypes";
import type { IExpeditionBuildConfig, IExpeditionBuildState } from "./ExpeditionBuildTypes";

export interface IExpeditionReport {
    runId: string;
    seed: number;
    partial: boolean;
    battles: Array<{ initial: ISkillBattleState; actions: ISkillBattleAction[] }>;
    choices: Array<{ encounterIndex: number; ids: number[]; selectedId: number | null }>;
    outcome: "extracted" | "failed" | null;
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
    phase: "battle" | "reward" | "decision" | "extracted" | "failed";
    loot: ISkillItemInstance[];
    upgradeIds: number[];
    allowedUpgradeIds: number[];
    pendingUpgradeChoices: number[];
    settled: boolean;
    battle: ISkillBattleState;
    report: IExpeditionReport;
    build?: IExpeditionBuildState;
}

export interface IExpeditionSave {
    version: 1;
    configSignature: string;
    profile: IExpeditionProfile;
    run: IExpeditionState | null;
    history: IExpeditionReport[];
}

export interface IExpeditionStorage {
    read(): string | null;
    write(value: string): void;
}
