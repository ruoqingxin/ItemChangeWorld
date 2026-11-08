export type ExpeditionSchool = "sword" | "earth" | "universal";

export interface IExpeditionBuildSkill {
    id: number;
    name: string;
    school: ExpeditionSchool;
    maxLevel?: number;
}

export interface IExpeditionBuildPassive {
    id: number;
    name: string;
    school: ExpeditionSchool;
}

export interface IExpeditionBuildConfig {
    schools: ExpeditionSchool[];
    skills: IExpeditionBuildSkill[];
    passives: IExpeditionBuildPassive[];
    startCandidateCount?: number;
    startSkillSlots?: number;
    activeSkillSlots?: number;
    maxSkillLevel?: number;
    daoyunThresholds?: number[];
}

export interface IExpeditionActiveSkill {
    skillId: number;
    level: number;
}

export interface IExpeditionBuildState {
    schools: [ExpeditionSchool, ExpeditionSchool];
    startCandidates: number[];
    activeSkills: IExpeditionActiveSkill[];
    pendingActiveCandidateIds: number[];
    passiveIds: number[];
    skillPoints: number;
    daoyun: number;
    nextDaoyunThresholdIndex: number;
    pendingPassiveChoices: number;
    pendingPassiveCandidateIds: number[];
}

