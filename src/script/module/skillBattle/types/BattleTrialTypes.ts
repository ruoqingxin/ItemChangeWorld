import type { NewBattleAction, NewBattleSetup, NewBattleState } from "./BattleTypes";

export interface NewTrialRecord {
    setup: NewBattleSetup;
    initial: NewBattleState;
    actions: Array<{ at: number; action: NewBattleAction }>;
    state: NewBattleState;
}

export interface NewTrialSave {
    version: 1;
    startedAt: number;
    deadlineAt: number;
    timedOutAt: number | null;
    battles: NewTrialRecord[];
}
