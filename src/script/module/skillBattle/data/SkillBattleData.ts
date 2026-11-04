import type { ISkillBattleSetup, ISkillBattleState } from "../types/SkillBattleTypes";

export class SkillBattleData {
    setup: ISkillBattleSetup | null = null;
    state: ISkillBattleState | null = null;
    logs: string[] = [];

    reset(): void {
        this.setup = null;
        this.state = null;
        this.logs = [];
    }
}
