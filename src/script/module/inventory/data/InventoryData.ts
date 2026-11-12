import type { InventorySave } from "../types/InventoryTypes";

export class InventoryData {
    save: InventorySave | null = null;
    savedText: string | null = null;
    writing = false;
    error = "";
}
