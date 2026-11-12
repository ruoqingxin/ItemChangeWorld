import { BuildData } from "../data/BuildData";
import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { BuildRules as Rules } from "../utils/BuildRules";
import type { NewBattleAction, NewBattleResult, NewBattleState, NewBattleToken } from "../../skillBattle/types/BattleTypes";
import type { GameStorage } from "../../common/types/GameStorage";
import type { NewBuildCommand, NewBuildConfig, NewBuildProfile, NewBuildSave, NewBuildToken } from "../types/BuildTypes";

export class BuildManager {
    static readonly key = "nowchange.stage2-build.v1";
    private readonly data = new BuildData();
    get error(): string { return this.data.error; }
    constructor(readonly manager: SkillBattleManager, private readonly storage: GameStorage,
        private readonly clock: () => number = () => Date.now(), private readonly currentConfig?: NewBuildConfig) {
        try {
            this.data.savedText = storage.getItem(BuildManager.key);
            if (this.data.savedText !== null) {
                const save = JSON.parse(this.data.savedText);
                BuildManager.validate(save);
                if (currentConfig && JSON.stringify(currentConfig) !== JSON.stringify(save.config))
                    throw new Error("配置签名已改变，不能静默兼容旧局");
                this.data.save = save; this.restoreManager();
            }
        } catch (error) { this.data.error = `双道试炼档无法读取，原档已保留：${(error as Error).message}`; }
        manager.beforeNewCommit = (state, action) => {
            this.commit({ type: "action", action }, this.token, state);
        };
    }
    get snapshot(): NewBuildSave | null { return Core.clone(this.data.save); }
    get flow() { return this.snapshot?.state || null; }
    get records() { return this.snapshot?.state.battles || []; }
    get record() { const all = this.snapshot?.state.battles; return all?.[all.length - 1] || null; }
    get state() { return this.record?.state || null; }
    get token(): NewBuildToken { return { runId: this.data.save?.runId || "", revision: this.data.save?.state.revision ?? -1 }; }
    get remainingMs(): number { return this.data.save ? Math.max(0, this.data.save.deadlineAt - this.clock()) : 0; }
    get outcome(): "active" | "victory" | "defeat" | "timeout" | "empty" {
        if (!this.data.save) return "empty";
        if (this.data.save.state.endReason === "timeout") return "timeout";
        if (this.data.save.state.endReason === "defeat" || this.data.save.state.endReason === "abandon") return "defeat";
        return this.data.save.state.phase === "battle" ? "active" : "victory";
    }
    get screen(): "start" | "battle" | "settlement" {
        return this.data.error || !this.data.save || this.data.save.state.phase === "starting" ? "start" :
            this.data.save.state.phase === "battle" ? "battle" : "settlement";
    }
    start(config: NewBuildConfig, profile: NewBuildProfile, seed: number): void {
        this.requireReadable();
        if (this.currentConfig && JSON.stringify(config) !== JSON.stringify(this.currentConfig))
            throw new Error("新局配置不匹配");
        if (this.data.save && this.data.save.state.phase !== "ended") throw new Error("请先确认放弃当前试炼");
        const now = this.clock(), runId = `build_${now}_${seed}`;
        const state = Rules.start(config, profile, seed, runId);
        this.persist({ version: 1, startedAt: now, deadlineAt: now + 1200000, seed, runId,
            config: Core.clone(config), profile: Core.clone(profile), commands: [], state });
        this.manager.reset();
    }
    preview(action: NewBattleAction): NewBattleResult {
        this.requireBattle(); return this.manager.previewNewAction(action);
    }
    confirm(action: NewBattleAction, token: NewBattleToken): NewBattleResult {
        this.requireBattle(); return this.manager.confirmNewAction(action, token);
    }
    dispatch(command: Exclude<NewBuildCommand, { type: "action" }>, token: NewBuildToken = this.token) {
        if ((command as NewBuildCommand).type === "action") throw new Error("战斗行动须经预览与确认入口");
        return this.commit(command, token);
    }
    private commit(command: NewBuildCommand, token: NewBuildToken, expectedBattle?: NewBattleState) {
        this.requireReadable();
        if (this.data.writing) throw new Error("构筑正在提交");
        if (!this.data.save || token.runId !== this.data.save.runId || token.revision !== this.data.save.state.revision)
            throw new Error("构筑页面已过期，请重新选择");
        if (command.type === "timeout") throw new Error("超时只能由截止检查提交");
        this.expire();
        if (this.data.save.state.phase === "ended") throw new Error("试炼已结束或超时");
        const next = this.snapshot!, at = this.clock();
        const result = Rules.apply(next.config, next.profile, next.state, command, at);
        if (expectedBattle && (!result.battle?.ok ||
            JSON.stringify(result.battle.state) !== JSON.stringify(expectedBattle)))
            throw new Error("战斗提交结果不一致");
        next.commands.push({ at, command: Core.clone(command) }); next.state = result.state;
        this.persist(next);
        if (command.type !== "action") this.restoreManager();
        return result;
    }
    expire(): boolean {
        this.requireReadable();
        if (!this.data.save || this.data.save.state.phase === "ended" || this.clock() < this.data.save.deadlineAt) return false;
        const next = this.snapshot!, at = this.clock(), command: NewBuildCommand = { type: "timeout" };
        next.state = Rules.apply(next.config, next.profile, next.state, command, at).state;
        next.commands.push({ at, command });
        this.persist(next, false);
        return true;
    }
    resetConfirmed(): void {
        if (this.data.writing) throw new Error("构筑存档正在提交");
        if (this.storage.getItem(BuildManager.key) !== this.data.savedText) throw new Error("档案已在其他页面改变，请刷新");
        this.storage.removeItem(BuildManager.key);
        this.data.save = null; this.data.savedText = null; this.data.error = ""; this.manager.reset();
    }
    private requireReadable(): void { if (this.data.error) throw new Error(this.data.error); }
    private requireBattle(): void {
        this.requireReadable(); this.expire();
        if (this.data.save?.state.phase !== "battle") throw new Error("当前没有进行中的战斗，或试炼已超时");
    }
    private restoreManager(): void {
        const record = this.record;
        if (record) this.manager.restoreNewRules(record.setup, record.state);
    }
    private persist(next: NewBuildSave, deadline = true): void {
        if (this.data.writing) throw new Error("构筑存档正在提交");
        this.data.writing = true;
        try {
            BuildManager.validate(next);
            if (deadline && this.clock() >= next.deadlineAt) throw new Error("提交到达截止，操作未保存");
            if (this.storage.getItem(BuildManager.key) !== this.data.savedText) throw new Error("档案已在其他页面改变，请刷新");
            const text = JSON.stringify(next);
            if (deadline && this.clock() >= next.deadlineAt) throw new Error("提交到达截止，操作未保存");
            this.storage.setItem(BuildManager.key, text);
            this.data.savedText = text; this.data.save = Core.clone(next);
        } finally { this.data.writing = false; }
    }
    static validate(save: NewBuildSave): void {
        const time = (n: number) => Number.isSafeInteger(n) && n >= 0;
        if (!save || save.version !== 1 || !time(save.startedAt) || !time(save.deadlineAt) ||
            save.deadlineAt - save.startedAt !== 1200000 || save.runId !== `build_${save.startedAt}_${save.seed}` ||
            !Array.isArray(save.commands) || save.commands.length > 8192)
            throw new Error("双道试炼版本或截止无效");
        let state = Rules.start(save.config, save.profile, save.seed, save.runId), lastAt = save.startedAt;
        for (const entry of save.commands) {
            if (!entry || !time(entry.at) || entry.at < lastAt ||
                (entry.command?.type === "timeout" ? entry.at < save.deadlineAt : entry.at >= save.deadlineAt))
                throw new Error("构筑操作时间越界");
            lastAt = entry.at;
            state = Rules.apply(save.config, save.profile, state, entry.command, entry.at).state;
        }
        if (JSON.stringify(state) !== JSON.stringify(save.state)) throw new Error("构筑快照与完整重放不一致");
    }
}
