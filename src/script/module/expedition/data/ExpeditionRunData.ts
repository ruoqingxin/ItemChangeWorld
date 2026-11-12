import type { ExpeditionSave } from "../types/ExpeditionRunTypes";

export class ExpeditionRunData {
    save: ExpeditionSave | null = null;
    savedText: string | null = null;
    writing = false;
    error = "";
    searchAt: number | null = null;
    searchNode: number | null = null;
}
