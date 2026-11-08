import type {
    ExpeditionSchool,
    IExpeditionActiveSkill,
    IExpeditionBuildConfig,
    IExpeditionBuildSkill,
    IExpeditionBuildState,
} from "../types/ExpeditionBuildTypes";

export class ExpeditionBuildUtils {
    static create(
        config: IExpeditionBuildConfig,
        random: () => number,
    ): IExpeditionBuildState {
        this.validateConfig(config);
        const schools = this.pickSchools(config.schools, random);
        const pool = this.skillPool(config.skills, schools);
        const count = config.startCandidateCount ?? 3;
        if (pool.length < count) throw new Error("起始借法候选不足三个合法主动");
        return {
            schools,
            startCandidates: this.pickIds(pool, count, random),
            activeSkills: [],
            pendingActiveCandidateIds: [],
            passiveIds: [],
            skillPoints: 0,
            daoyun: 0,
            nextDaoyunThresholdIndex: 0,
            pendingPassiveChoices: 0,
            pendingPassiveCandidateIds: [],
        };
    }

    static chooseStartingSkill(
        state: IExpeditionBuildState,
        skillId: number,
        config: IExpeditionBuildConfig,
    ): IExpeditionBuildState {
        if (!state.startCandidates.includes(skillId)) throw new Error("不是当前起始候选");
        if (state.activeSkills.length >= (config.startSkillSlots ?? 1)) throw new Error("起始主动已选择");
        return { ...state, activeSkills: [{ skillId, level: 0 }] };
    }

    static borrowActive(
        state: IExpeditionBuildState,
        skillId: number,
        config: IExpeditionBuildConfig,
    ): IExpeditionBuildState {
        const candidate = this.findSkill(config, state.schools, skillId);
        if (!candidate) throw new Error("技能不属于本局两道");
        const existing = state.activeSkills.find(skill => skill.skillId === skillId);
        if (existing) throw new Error("该主动已装配");
        const slots = config.activeSkillSlots ?? 3;
        if (state.activeSkills.length < slots) {
            return { ...state, activeSkills: state.activeSkills.concat({ skillId, level: 0 }) };
        }
        throw new Error("主动槽位已满，替换必须通过 replaceActive");
    }

    static activeCandidates(
        state: IExpeditionBuildState,
        config: IExpeditionBuildConfig,
        random: () => number,
    ): number[] {
        if (state.pendingActiveCandidateIds.length) return state.pendingActiveCandidateIds.slice();
        const pool = this.skillPool(config.skills, state.schools)
            .filter(skill => !state.activeSkills.some(active => active.skillId === skill.id));
        return this.pickIds(pool, Math.min(3, pool.length), random);
    }

    static skipActiveChoice(state: IExpeditionBuildState): IExpeditionBuildState {
        if (!state.pendingActiveCandidateIds.length) throw new Error("当前没有待处理的主动候选");
        const allMaxed = state.activeSkills.length === 3 && state.activeSkills.every(skill => skill.level >= 5);
        return {
            ...state,
            pendingActiveCandidateIds: [],
            skillPoints: state.skillPoints + (allMaxed ? 0 : 2),
        };
    }

    static replaceActive(
        state: IExpeditionBuildState,
        oldSkillId: number,
        newSkillId: number,
        config: IExpeditionBuildConfig,
    ): IExpeditionBuildState {
        const replacement = this.findSkill(config, state.schools, newSkillId);
        if (!replacement || state.activeSkills.some(skill => skill.skillId === newSkillId))
            throw new Error("替换技能不属于本局两道或已装配");
        const index = state.activeSkills.findIndex(skill => skill.skillId === oldSkillId);
        if (index < 0) throw new Error("未装配待替换技能");
        const next = state.activeSkills.slice();
        next[index] = { skillId: newSkillId, level: state.activeSkills[index].level };
        return { ...state, activeSkills: next };
    }

    static strengthen(
        state: IExpeditionBuildState,
        skillId: number,
        config: IExpeditionBuildConfig,
    ): IExpeditionBuildState {
        const skill = state.activeSkills.find(value => value.skillId === skillId);
        const max = config.maxSkillLevel ?? 5;
        if (!skill) throw new Error("未装配该主动");
        if (state.skillPoints <= 0) throw new Error("技能点不足");
        if (skill.level >= max) throw new Error("主动已达到最高强化");
        return {
            ...state,
            skillPoints: state.skillPoints - 1,
            activeSkills: state.activeSkills.map(value =>
                value.skillId === skillId ? { ...value, level: value.level + 1 } : value),
        };
    }

    static awardDaoyun(
        state: IExpeditionBuildState,
        amount: number,
        config: IExpeditionBuildConfig,
    ): IExpeditionBuildState {
        if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("道韵必须为非负整数");
        const thresholds = config.daoyunThresholds ?? [30, 40];
        let daoyun = state.daoyun + amount;
        let index = state.nextDaoyunThresholdIndex;
        let pending = state.pendingPassiveChoices;
        while (true) {
            const threshold = index === 0 ? thresholds[0] : thresholds[1] ?? thresholds[0];
            if (!threshold || daoyun < threshold) break;
            daoyun -= threshold;
            const availablePassives = config.passives.filter(passive =>
                !state.passiveIds.includes(passive.id) &&
                (state.schools.includes(passive.school) || passive.school === "universal")).length;
            if (pending < availablePassives) pending++;
            index++;
        }
        return { ...state, daoyun, nextDaoyunThresholdIndex: index, pendingPassiveChoices: pending };
    }

    static passiveCandidates(
        state: IExpeditionBuildState,
        config: IExpeditionBuildConfig,
        random: () => number,
    ): number[] {
        if (state.pendingPassiveChoices <= 0 || state.pendingPassiveCandidateIds.length)
            throw new Error("当前没有待生成的被动候选");
        const pool = config.passives.filter(passive =>
            !state.passiveIds.includes(passive.id) &&
            (state.schools.includes(passive.school) || passive.school === "universal"));
        const candidates: number[] = [];
        const schoolPool = pool.filter(passive => passive.school !== "universal");
        const universalPool = pool.filter(passive => passive.school === "universal");
        while (schoolPool.length && candidates.length < 3) {
            const index = Math.floor(random() * schoolPool.length);
            candidates.push(schoolPool.splice(index, 1)[0].id);
        }
        if (candidates.length < 3 && universalPool.length) {
            const index = Math.floor(random() * universalPool.length);
            candidates.push(universalPool[index].id);
        }
        return candidates;
    }

    static claimPassive(
        state: IExpeditionBuildState,
        passiveId: number,
        config: IExpeditionBuildConfig,
    ): IExpeditionBuildState {
        if (!state.pendingPassiveChoices || !state.pendingPassiveCandidateIds.includes(passiveId))
            throw new Error("该被动不可领取");
        if (state.passiveIds.includes(passiveId) ||
            !config.passives.some(passive => passive.id === passiveId &&
                (state.schools.includes(passive.school) || passive.school === "universal")))
            throw new Error("被动不属于当前合法池");
        return {
            ...state,
            passiveIds: state.passiveIds.concat(passiveId),
            pendingPassiveChoices: state.pendingPassiveChoices - 1,
            pendingPassiveCandidateIds: [],
        };
    }

    private static validateConfig(config: IExpeditionBuildConfig): void {
        if (!config.schools.includes("sword") || !config.schools.includes("earth"))
            throw new Error("阶段二至少开放剑道与土道");
        if ((config.startCandidateCount ?? 3) < 3) throw new Error("起始候选必须至少三个");
        if ((config.activeSkillSlots ?? 3) !== 3) throw new Error("阶段二主动槽位固定为三个");
        if ((config.maxSkillLevel ?? 5) !== 5) throw new Error("阶段二主动强化固定为五档");
    }

    private static pickSchools(
        schools: ExpeditionSchool[],
        random: () => number,
    ): [ExpeditionSchool, ExpeditionSchool] {
        const pool = schools.filter(value => value !== "universal");
        if (pool.length < 2) throw new Error("合法大道不足两条");
        const first = pool[Math.floor(random() * pool.length)];
        const rest = pool.filter(value => value !== first);
        return [first, rest[Math.floor(random() * rest.length)]];
    }

    private static skillPool(
        skills: IExpeditionBuildSkill[],
        schools: [ExpeditionSchool, ExpeditionSchool],
    ): IExpeditionBuildSkill[] {
        return skills.filter(skill => schools.includes(skill.school));
    }

    private static findSkill(
        config: IExpeditionBuildConfig,
        schools: [ExpeditionSchool, ExpeditionSchool],
        skillId: number,
    ): IExpeditionBuildSkill | undefined {
        return config.skills.find(skill => skill.id === skillId && schools.includes(skill.school));
    }

    private static pickIds(
        pool: IExpeditionBuildSkill[],
        count: number,
        random: () => number,
    ): number[] {
        const rest = pool.slice();
        const ids: number[] = [];
        while (ids.length < count) ids.push(rest.splice(Math.floor(random() * rest.length), 1)[0].id);
        return ids;
    }
}
