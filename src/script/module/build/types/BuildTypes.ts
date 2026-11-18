import type { BattleAction, BattleSetup } from "../../skillBattle/types/BattleTypes";
import type { BattleRecord } from "../../skillBattle/types/BattleTrialTypes";
import type { RogueEnemyId, RogueLoadout, TestAttributes } from "../../skillBattle/types/QingmingTypes";

export interface BuildConfig {
    qingming: { version: string; enemy: TestAttributes; battleRewards: number };
    setup: BattleSetup;
    encounters: Array<{ id: string; enemy: BattleSetup["enemy"]; qingmingEnemy: RogueEnemyId }>;
}
export interface BuildPending { kind: "qingming"; source: string; candidates: number[]; }
export interface BuildState {
    qingming?: RogueLoadout;
    runId: string; revision: number; phase: "ready" | "battle" | "ended";
    endReason: "complete" | "defeat" | "timeout" | "abandon" | null;
    paidChoices: number; pending: BuildPending | null; sources: string[]; battles: BattleRecord[];
}
export type BuildCommand =
    | { type: "choose"; source: string; id: number }
    | { type: "battle" }
    | { type: "action"; action: BattleAction }
    | { type: "extract" | "abandon" | "timeout" };
export interface BuildSave {
    version: 1; startedAt: number; deadlineAt: number; seed: number; runId: string;
    config: BuildConfig; state: BuildState;
}
export interface BuildToken { runId: string; revision: number; }
