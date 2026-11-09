import { NewBattleCore as Core } from "./NewBattleCore";
import type { NewBuildCommand, NewBuildConfig, NewBuildEligibility, NewBuildProfile, NewBuildState } from "./NewBuildTypes";
import type { NewBattleResult, NewBattleSetup } from "./NewBattleTypes";

/** Deterministic construction/reward reducer. Randomness belongs to the saved run, never the view. */
export class NewBuildRules {
    static validateConfig(config: NewBuildConfig, profile: NewBuildProfile): void {
        Core.validateSetup(config.setup);
        const integer = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min && n <= 100000000;
        for (const [rows, content] of [[config.skills, config.setup.skills], [config.passives, config.setup.passives]] as const) {
            if (!Array.isArray(rows) || rows.length !== content.length || new Set(rows.map(r => r.id)).size !== rows.length ||
                rows.some(r => !content.some(c => c.id === r.id) || !integer(r.realm, 1) ||
                    typeof r.defaultEligible !== "boolean" || !["sword", "earth", "common"].includes(r.school)))
                throw new Error("双道内容资格表无效");
            if (rows.some(r => (content.find(c => c.id === r.id)!.school || "sword") !== r.school))
                throw new Error("内容所属大道不一致");
        }
        if (!profile || !integer(profile.realm, 1) || typeof profile.fixture !== "boolean" ||
            !Array.isArray(profile.learnedSkills) || !Array.isArray(profile.learnedPassives) ||
            new Set(profile.learnedSkills).size !== profile.learnedSkills.length ||
            new Set(profile.learnedPassives).size !== profile.learnedPassives.length ||
            profile.learnedSkills.some(id => !config.skills.some(r => r.id === id)) ||
            profile.learnedPassives.some(id => !config.passives.some(r => r.id === id)) ||
            (!profile.fixture && (profile.learnedSkills.length || profile.learnedPassives.length)))
            throw new Error("本阶段资格必须来自默认或显式隔离夹具");
        if (!config.rules || !Object.values(config.rules).every(n => integer(n)) ||
            config.rules.commonMixPercent > 100 || config.rules.firstCost < 1 || config.rules.laterCost < 1 ||
            !config.encounters.length || config.encounters.length > 64 ||
            new Set(config.encounters.map(r => r.id)).size !== config.encounters.length)
            throw new Error("构筑奖励或流程夹具无效");
        config.encounters.forEach(row => {
            if (!row.id || typeof row.elite !== "boolean" || typeof row.borrow !== "boolean") throw new Error("流程来源无效");
            Core.validateSetup({ ...config.setup, enemy: row.enemy });
        });
    }

    static start(config: NewBuildConfig, profile: NewBuildProfile, seed: number, runId: string): NewBuildState {
        this.validateConfig(config, profile);
        if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff || !runId) throw new Error("随机种子或局标识无效");
        const state: NewBuildState = { runId, revision: 0, phase: "starting", endReason: null,
            build: { schools: ["sword", "earth"], actives: [], passiveIds: [] }, points: 0, daoyun: 0,
            paidChoices: 0, randomState: seed, pending: null, activeQueue: [], sources: [], battles: [] };
        const pool = this.activePool(config, profile, state);
        if (pool.length < 3) throw new Error("合法新手双道池不足三个不同主动");
        state.pending = { kind: "start", source: "starting", candidates: this.sample(state, pool, 3) };
        return state;
    }

    static activePool(config: NewBuildConfig, profile: NewBuildProfile, state: NewBuildState): number[] {
        return this.eligible(config.skills, profile.learnedSkills, profile, state).filter(id =>
            !state.build.actives.some(a => a.skillId === id));
    }
    static passivePool(config: NewBuildConfig, profile: NewBuildProfile, state: NewBuildState): number[] {
        return this.eligible(config.passives, profile.learnedPassives, profile, state)
            .filter(id => !state.build.passiveIds.includes(id));
    }
    private static eligible(rows: NewBuildEligibility[], learned: number[], profile: NewBuildProfile, state: NewBuildState): number[] {
        return rows.filter(r => r.realm <= profile.realm && (r.defaultEligible || learned.includes(r.id)) &&
            (r.school === "common" || state.build.schools.includes(r.school))).map(r => r.id);
    }
    private static random(state: NewBuildState): number {
        let x = state.randomState;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        state.randomState = x >>> 0;
        return state.randomState;
    }
    private static below(state: NewBuildState, limit: number): number {
        const ceiling = 0x100000000 - (0x100000000 % limit);
        let value: number;
        do { value = this.random(state); } while (value >= ceiling);
        return value % limit;
    }
    private static sample(state: NewBuildState, pool: number[], count: number): number[] {
        const remaining = pool.slice(), result: number[] = [];
        while (remaining.length && result.length < count) result.push(remaining.splice(this.below(state, remaining.length), 1)[0]);
        return result;
    }
    static full(state: NewBuildState): boolean {
        return state.build.actives.length === 3 && state.build.actives.every(r => r.level === 5);
    }
    static cost(config: NewBuildConfig, state: NewBuildState): number {
        return state.paidChoices ? config.rules.laterCost : config.rules.firstCost;
    }
    private static passiveCandidates(config: NewBuildConfig, profile: NewBuildProfile, state: NewBuildState): number[] {
        const all = this.passivePool(config, profile, state);
        const common = all.filter(id => config.passives.find(r => r.id === id)!.school === "common");
        const dao = all.filter(id => !common.includes(id));
        if (!dao.length) return this.sample(state, common, 1);
        const mix = common.length > 0 && this.below(state, 100) < config.rules.commonMixPercent;
        const result = this.sample(state, dao, mix ? 2 : 3);
        if (mix) result.push(...this.sample(state, common, 1));
        return result;
    }
    private static advance(config: NewBuildConfig, profile: NewBuildProfile, state: NewBuildState): void {
        if (state.pending || state.phase !== "ready") return;
        if (this.passivePool(config, profile, state).length && state.daoyun >= this.cost(config, state)) {
            state.daoyun -= this.cost(config, state);
            const source = `daoyun-${++state.paidChoices}`;
            state.sources.push(source);
            state.pending = { kind: "passive", source, candidates: this.passiveCandidates(config, profile, state) };
            return;
        }
        while (state.activeQueue.length) {
            const source = state.activeQueue.shift()!;
            if (state.sources.includes(source)) throw new Error("借法来源重复");
            const pool = this.activePool(config, profile, state);
            if (pool.length) {
                state.pending = { kind: "active", source, candidates: this.sample(state, pool, 3) };
                return;
            }
            state.sources.push(source);
            if (!this.full(state)) state.points += config.rules.forgoPoints;
        }
    }
    private static end(state: NewBuildState, reason: NonNullable<NewBuildState["endReason"]>): void {
        state.phase = "ended"; state.endReason = reason; state.pending = null; state.activeQueue = [];
        state.build = { schools: [], actives: [], passiveIds: [] }; state.points = 0; state.daoyun = 0;
    }

    static apply(config: NewBuildConfig, profile: NewBuildProfile, snapshot: NewBuildState,
        command: NewBuildCommand, at: number): { state: NewBuildState; battle?: NewBattleResult } {
        const state = Core.clone(snapshot);
        if (!command || state.phase === "ended") throw new Error("当前试炼已结束");
        let battle: NewBattleResult | undefined;
        const p = state.pending;
        const requireReady = () => { if (state.phase !== "ready" || state.pending) throw new Error("请先完成当前选择或战斗"); };
        switch (command.type) {
            case "choose":
                if (!p || p.source !== command.source || !p.candidates.includes(command.id)) throw new Error("候选已过期或不合法");
                if (p.kind === "passive") {
                    if (command.replaceId !== undefined) throw new Error("被动不能替换主动");
                    state.build.passiveIds.push(command.id);
                } else {
                    if (p.kind === "start" && command.replaceId !== undefined) throw new Error("起始不能替换");
                    if (command.replaceId !== undefined) {
                        const old = state.build.actives.find(r => r.skillId === command.replaceId);
                        if (!old) throw new Error("替换对象不存在");
                        old.skillId = command.id;
                    } else {
                        if (state.build.actives.length >= 3) throw new Error("主动已满，请选择替换对象");
                        state.build.actives.push({ skillId: command.id, level: 0 });
                    }
                }
                if (p.kind !== "passive") state.sources.push(p.source);
                state.pending = null; state.phase = "ready";
                this.advance(config, profile, state);
                break;
            case "forgo":
                if (!p || p.kind !== "active" || p.source !== command.source) throw new Error("当前奖励不能放弃换点");
                if (!this.full(state)) state.points += config.rules.forgoPoints;
                state.sources.push(p.source); state.pending = null;
                this.advance(config, profile, state);
                break;
            case "upgrade": {
                if (state.phase !== "ready") throw new Error("战外才能强化");
                const skill = state.build.actives.find(r => r.skillId === command.skillId);
                if (!skill || skill.level >= 5 || state.points < 1) throw new Error("没有可用技能点或主动已满强");
                skill.level++; state.points--;
                break;
            }
            case "battle": {
                requireReady();
                const encounter = config.encounters[state.battles.length];
                if (!encounter) throw new Error("本次流程夹具已完成");
                const setup: NewBattleSetup = Core.clone({ ...config.setup, build: state.build, enemy: encounter.enemy });
                const previous = state.battles[state.battles.length - 1]?.state;
                const initial = Core.start(setup, `${state.runId}_${state.battles.length + 1}`, previous ?
                    { hp: previous.player.hp, mp: previous.player.mp, weapon: previous.weapon, pouch: previous.pouch } : undefined);
                if (!previous) {
                    const hp = setup.potions.find(r => r.resource === "hp"), mp = setup.potions.find(r => r.resource === "mp");
                    if (!hp || !mp) throw new Error("流程夹具药品配置缺失");
                    initial.pouch = [hp, hp, mp, mp, null].map((r, i) => r ?
                        { itemUid: `${state.runId}_p${i}`, itemId: r.itemId } : null);
                }
                state.battles.push({ setup, initial, actions: [], state: Core.clone(initial) });
                state.phase = "battle";
                break;
            }
            case "action": {
                if (state.phase !== "battle") throw new Error("当前未在战斗");
                const record = state.battles[state.battles.length - 1];
                battle = Core.resolve(record.setup, record.state, command.action);
                if (battle.ok === false) throw new Error(battle.reason);
                record.actions.push({ at, action: Core.clone(command.action) }); record.state = battle.state;
                if (battle.state.phase === "defeat") this.end(state, "defeat");
                else if (battle.state.phase === "victory") {
                    const encounter = config.encounters[state.battles.length - 1];
                    if (state.sources.includes(encounter.id)) throw new Error("战斗奖励已结算");
                    state.sources.push(encounter.id);
                    if (this.passivePool(config, profile, state).length)
                        state.daoyun += encounter.elite ? config.rules.eliteDaoyun : config.rules.normalDaoyun;
                    if (encounter.borrow) state.activeQueue.push(`borrow:${encounter.id}`);
                    state.phase = "ready"; this.advance(config, profile, state);
                }
                break;
            }
            case "meditate":
                requireReady();
                if (state.battles.length < 2 || state.sources.includes("meditation")) throw new Error("悟道来源未开放或已领取");
                state.sources.push("meditation");
                if (this.passivePool(config, profile, state).length)
                    state.pending = { kind: "passive", source: "meditation", candidates: this.passiveCandidates(config, profile, state) };
                break;
            case "finish":
                requireReady();
                if (state.battles.length !== config.encounters.length) throw new Error("流程夹具尚未完成");
                this.end(state, "complete");
                break;
            case "abandon": this.end(state, "abandon"); break;
            case "timeout": this.end(state, "timeout"); break;
            default: throw new Error("不支持的构筑操作");
        }
        state.revision++;
        return { state, battle };
    }
}
