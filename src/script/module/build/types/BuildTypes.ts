import type { BattleAction, BattleSetup } from "../../skillBattle/types/BattleTypes";
import type { BattleRecord } from "../../skillBattle/types/BattleTrialTypes";
export interface BuildConfig {version:string;combatSignature:string;setup:BattleSetup;encounters:Array<{id:string;enemy:BattleSetup["enemy"];enemyId:number}>;}
export interface BuildPending {kind:"skill";source:string;candidates:number[];}
export interface BuildState {
    skills:string[];knownSkills:string[];rng:number;runId:string;revision:number;phase:"ready"|"battle"|"ended";
    endReason:"complete"|"defeat"|"timeout"|"abandon"|null;paidChoices:number;pending:BuildPending|null;sources:string[];battles:BattleRecord[];
}
export type BuildCommand =
    | {type:"choose";source:string;id:number;slot?:number}
    | {type:"loadout";skills:string[]}
    | {type:"battle"}
    | {type:"action";action:BattleAction}
    | {type:"extract"|"abandon"|"timeout"};
export interface BuildSave {version:1;startedAt:number;deadlineAt:number;seed:number;runId:string;config:BuildConfig;state:BuildState;}
export interface BuildToken {runId:string;revision:number;}
