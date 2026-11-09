import type { IExpeditionSave, IExpeditionStorage } from "../types/ExpeditionTypes";

export class ExpeditionData {
    snapshot: IExpeditionSave | null = null;
    error = "";
    static clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
}

export class ExpeditionLocalStorage implements IExpeditionStorage {
    static readonly key = "nowchange.skill-expedition.current.v2";

    constructor() {
        // Remove only this game's retired snapshots on the current origin.
        const storage = window.localStorage;
        for (let index = storage.length - 1; index >= 0; index--) {
            const key = storage.key(index);
            if (key?.startsWith("nowchange.skill-expedition.") && key !== ExpeditionLocalStorage.key)
                storage.removeItem(key);
        }
    }

    read(): string | null { return window.localStorage.getItem(ExpeditionLocalStorage.key); }
    write(value: string): void { window.localStorage.setItem(ExpeditionLocalStorage.key, value); }
}
