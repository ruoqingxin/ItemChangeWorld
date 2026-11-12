import type { NewTrialSave } from "../types/BattleTrialTypes";

export class BattleTrialData {
    save: NewTrialSave | null = null;
    savedText: string | null = null;
    writing = false;
    error = "";
}
