import type { IExpeditionSave, IExpeditionStorage } from "../types/ExpeditionTypes";

export class ExpeditionData {
    snapshot: IExpeditionSave | null = null;
    error = "";
    static clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
}

export class ExpeditionLocalStorage implements IExpeditionStorage {
    static readonly key = "nowchange.skill-expedition.v1";
    static readonly newRulesKey = "nowchange.skill-expedition.new-rules.v4";

    constructor(private readonly namespace: "legacy" | "new-rules" = "legacy") {}

    private get storageKey(): string {
        return this.namespace === "new-rules" ? ExpeditionLocalStorage.newRulesKey : ExpeditionLocalStorage.key;
    }

    read(): string | null { return window.localStorage.getItem(this.storageKey); }
    write(value: string): void { window.localStorage.setItem(this.storageKey, value); }
}
