import type { NewBuildSave } from "../types/BuildTypes";

export class BuildData {
    save: NewBuildSave | null = null;
    savedText: string | null = null;
    writing = false;
    error = "";
}
