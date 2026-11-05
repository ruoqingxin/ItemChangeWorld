import type { ISkillBattleSetup, ISkillBattleState, ISkillItemInstance, ISkillUpgradeConfig } from "../../skillBattle/types/SkillBattleTypes";

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
}

export interface IExpeditionSave {
    version: 1;
    configSignature: string;
    profile: IExpeditionProfile;
    run: IExpeditionState | null;
}

export interface IExpeditionStorage {
    read(): string | null;
    write(value: string): void;
}
