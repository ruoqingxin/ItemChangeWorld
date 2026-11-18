import type { BattleAction, BattleSetup, BattleState } from "./BattleTypes";
export interface BattleRecord {
    setup: BattleSetup; initial: BattleState; state: BattleState;
    actions: Array<{at: number; action: BattleAction}>;
}
