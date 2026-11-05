import type { IExpeditionSave, IExpeditionStorage } from "../types/ExpeditionTypes";

export class ExpeditionData {
    snapshot: IExpeditionSave | null = null;
    error = "";
    static clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
}

export class ExpeditionLocalStorage implements IExpeditionStorage {
    static readonly key = "nowchange.skill-expedition.v1";
    read(): string | null { return window.localStorage.getItem(ExpeditionLocalStorage.key); }
    write(value: string): void { window.localStorage.setItem(ExpeditionLocalStorage.key, value); }
}
