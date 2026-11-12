import type { ISkillBattleSetup, ISkillBattleState } from "../types/SkillBattleTypes";
import type { NewBattleSetup, NewBattleState } from "../types/BattleTypes";

export class SkillBattleData {
    setup: ISkillBattleSetup | null = null;
    state: ISkillBattleState | null = null;
    logs: string[] = [];
    newSetup: NewBattleSetup | null = null;
    newState: NewBattleState | null = null;

    reset(): void {
        this.setup = null;
        this.state = null;
        this.logs = [];
        this.newSetup = null;
        this.newState = null;
    }
}
