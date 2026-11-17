import type { NewBattleAction, NewBattleSetup } from "../../skillBattle/types/BattleTypes";
import type { NewTrialRecord } from "../../skillBattle/types/BattleTrialTypes";
import type { RogueEnemyId, RogueLoadout, TestAttributes } from "../../skillBattle/types/QingmingTypes";

export interface NewBuildEligibility { id: number; school: string; defaultEligible: boolean; realm: number; }
export interface NewBuildConfig {
    qingming?: { version: string; enemy: TestAttributes; battleRewards: number };
    setup: NewBattleSetup;
    skills: NewBuildEligibility[];
    passives: NewBuildEligibility[];
    rules: { commonMixPercent: number; firstCost: number; laterCost: number; normalDaoyun: number;
        eliteDaoyun: number; forgoPoints: number };
    encounters: Array<{ id: string; enemy: NewBattleSetup["enemy"]; elite: boolean; borrow: boolean; daoyun?: number;
        qingmingEnemy?: RogueEnemyId }>;
}
export interface NewBuildProfile { realm: number; learnedSkills: number[]; learnedPassives: number[]; fixture: boolean; }
export interface NewBuildPending { kind: "start" | "active" | "passive" | "qingming"; source: string; candidates: number[]; }
export interface NewBuildState {
    qingming?: RogueLoadout;
    runId: string; revision: number; phase: "starting" | "ready" | "battle" | "ended";
    endReason: "complete" | "defeat" | "timeout" | "abandon" | null;
    build: NewBattleSetup["build"];
    points: number; daoyun: number; paidChoices: number; randomState: number;
    pending: NewBuildPending | null; activeQueue: string[]; sources: string[]; battles: NewTrialRecord[];
}
export type NewBuildCommand =
    | { type: "choose"; source: string; id: number; replaceId?: number }
    | { type: "forgo"; source: string }
    | { type: "upgrade"; skillId: number }
    | { type: "battle" }
    | { type: "action"; action: NewBattleAction }
    | { type: "meditate" }
    | { type: "finish" | "extract" | "abandon" | "timeout" };
export interface NewBuildSave {
    version: 1; startedAt: number; deadlineAt: number; seed: number; runId: string;
    config: NewBuildConfig; profile: NewBuildProfile;
    commands: Array<{ at: number; command: NewBuildCommand }>; state: NewBuildState;
}
export interface NewBuildToken { runId: string; revision: number; }
