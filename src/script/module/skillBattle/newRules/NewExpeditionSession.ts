import { SkillBattleManager } from "../manager/SkillBattleManager";
import { NewBattleCore as Core } from "./NewBattleCore";
import { NewInventoryRules as Inventory } from "./NewInventoryRules";
import { NewExpeditionRules as Rules } from "./NewExpeditionRules";
import type { NewTrialStorage } from "./NewBattleSession";
import type { NewBattleAction, NewBattleState, NewBattleToken } from "./NewBattleTypes";
import type { NewBuildCommand, NewBuildProfile, NewBuildSave, NewBuildToken } from "./NewBuildTypes";
import type { InventoryCommand, InventoryConfig } from "./NewInventoryTypes";
import type { ExpeditionCommand, ExpeditionConfig, ExpeditionSave } from "./NewExpeditionTypes";

/** One saved transaction includes graph, source progress, instances, combat and settlement. */
export class NewExpeditionSession {
    static readonly key = "nowchange.stage4-expedition.v1";
    private save: ExpeditionSave | null = null;
    private savedText: string | null = null;
    private writing = false;
    private searchAt: number | null = null;
    private searchNode: number | null = null;
    error = "";
    constructor(readonly manager: SkillBattleManager, private readonly storage: NewTrialStorage,
        private readonly clock: () => number = () => Date.now(), private readonly currentConfig?: ExpeditionConfig,
        private readonly monotonic: () => number = () => performance.now()) {
        try {
            this.savedText = storage.getItem(NewExpeditionSession.key);
            if (this.savedText !== null) {
                const candidate = JSON.parse(this.savedText);
                NewExpeditionSession.validate(candidate);
                if (currentConfig && !Inventory.same(currentConfig,candidate.config)) throw new Error("配置已改变，请明确重建本阶段档");
                this.save = candidate; this.restoreManager();
            }
        } catch (e) { this.error = `地图档无法读取，原文保留：${(e as Error).message}`; }
        manager.beforeNewCommit = (expected,action) => {
            this.commit({ type:"build",command:{ type:"action",action } },this.token,expected);
        };
    }
    get archive() { return Core.clone(this.save); }
    get inventory() { return this.archive?.state || null; }
    get snapshot(): NewBuildSave | null {
        const s = this.save;
        return !s?.state.flow ? null : Core.clone({version:1,startedAt:s.state.enteredAt!,deadlineAt:s.state.deadlineAt!,
            seed:s.seed,runId:s.runId,config:s.config.build,profile:s.profile,commands:[],state:s.state.flow});
    }
    get flow() { return this.snapshot?.state || null; }
    get records() { return this.flow?.battles || []; }
    get record() { const a = this.records; return a[a.length-1] || null; }
    get state() { return this.record?.state || null; }
    get token(): NewBuildToken { return {runId:this.save?.runId || "",revision:this.save?.state.revision ?? -1}; }
    get remainingMs() { return this.save?.state.deadlineAt ? Math.max(0,this.save.state.deadlineAt-this.clock()) : 0; }
    get outcome(): "active" | "victory" | "defeat" | "timeout" | "empty" {
        const s = this.save?.state;
        return !s ? "empty" : s.result === "timeout" ? "timeout" :
            s.result === "defeat" || s.result === "abandon" ? "defeat" : s.flow?.phase === "battle" ? "active" : "victory";
    }
    get screen(): "start" | "battle" | "settlement" {
        return this.flow?.phase === "battle" ? "battle" : this.inventory?.phase === "ended" ? "settlement" : "start";
    }
    get searching() { return this.searchAt !== null; }
    prepare(config: InventoryConfig, profile: NewBuildProfile, seed: number): void {
        this.readable();
        if (this.save && this.save.state.phase !== "ended") throw new Error("已有进行中的探索");
        if (this.currentConfig && !Inventory.same(config,this.currentConfig)) throw new Error("配置不匹配");
        const createdAt = this.clock(), runId = `expedition_${createdAt}_${seed}`, c = config as ExpeditionConfig;
        const state = Rules.start(c,profile,seed,runId);
        this.persist({version:1,runId,createdAt,seed,config:Core.clone(c),profile:Core.clone(profile),commands:[],state});
        this.pauseSearch(false); this.manager.reset();
    }
    previewMove(command: InventoryCommand, token = this.token) {
        this.readable(); this.checkToken(token); this.expire();
        const s = this.save!;
        return Rules.apply(s.config,s.profile,s.state,command,this.clock(),s.seed);
    }
    inventoryCommand(command: InventoryCommand, token = this.token) {
        if (command.type === "build" || command.type === "timeout") throw new Error("请使用专用入口");
        return this.commit(command,token);
    }
    dispatch(command: Exclude<NewBuildCommand,{type:"action"}>, token = this.token) {
        if (["extract","abandon"].includes(command.type)) return this.commit({type:command.type as "extract"|"abandon"},token);
        return this.commit({type:"build",command},token);
    }
    mapCommand(command: ExpeditionCommand, token = this.token) {
        if (["travel","extract","abandon"].includes(command.type)) {
            this.checkToken(token); this.pauseSearch(); token = this.token;
        }
        return this.commit(command,token);
    }
    startSearch(): void {
        this.readable(); this.expire();
        const s = this.save;
        if (!s || s.state.phase !== "active" || s.state.flow?.phase !== "ready" || s.state.flow.pending)
            throw new Error("当前不能搜索");
        const box = Rules.source(s.state);
        if (!box || box.revealed === box.entries.length) throw new Error("此处已搜索完毕");
        this.searchAt = this.monotonic(); this.searchNode = s.state.node;
    }
    advanceSearch(foreground = true): boolean {
        if (!this.searching) return false;
        if (!foreground) { this.pauseSearch(false); return false; }
        const now = this.monotonic(), elapsed = Math.floor(now-this.searchAt!);
        // Long suspension gaps never become free search progress.
        if (elapsed < 0 || elapsed > 1000 || this.save?.state.node !== this.searchNode) {
            this.pauseSearch(false); return false;
        }
        if (elapsed < this.save!.config.rules.checkpointMs) return false;
        try {
            const deltaMs = this.save!.config.rules.checkpointMs;
            this.commit({type:"search",deltaMs},this.token);
            this.searchAt! += deltaMs;
            const box = Rules.source(this.save!.state)!;
            if (box.revealed === box.entries.length) this.pauseSearch(false);
            return true;
        } catch (e) { this.pauseSearch(false); throw e; }
    }
    pauseSearch(flush = true): void {
        const at = this.searchAt; this.searchAt = null; this.searchNode = null;
        if (!flush || at === null || this.save?.state.phase !== "active") return;
        let elapsed = Math.floor(this.monotonic()-at);
        if (elapsed <= 0 || elapsed > 1000) return;
        while (elapsed > 0) {
            const box = Rules.source(this.save!.state);
            if (!box || box.revealed === box.entries.length) break;
            const deltaMs = Math.min(elapsed,this.save!.config.rules.checkpointMs);
            this.commit({type:"search",deltaMs},this.token); elapsed -= deltaMs;
        }
    }
    preview(action: NewBattleAction) { this.requireBattle(); return this.manager.previewNewAction(action); }
    confirm(action: NewBattleAction, token: NewBattleToken) { this.requireBattle(); return this.manager.confirmNewAction(action,token); }
    private requireBattle() {
        this.readable(); this.expire();
        if (this.save?.state.phase !== "active" || this.save.state.flow?.phase !== "battle") throw new Error("当前没有可操作战斗");
    }
    private readable() { if (this.error) throw new Error(this.error); }
    private checkToken(token: NewBuildToken) {
        if (!this.save || token.runId !== this.save.runId || token.revision !== this.save.state.revision)
            throw new Error("页面修订已过期");
    }
    private commit(command: ExpeditionCommand, token: NewBuildToken, expected?: NewBattleState) {
        this.readable(); this.checkToken(token); this.expire();
        if (this.writing) throw new Error("地图事务正在提交");
        const next = this.archive!, at = this.clock();
        const result = Rules.apply(next.config,next.profile,next.state,command,at,next.seed);
        if (expected && (!result.battle?.ok || !Inventory.same(result.battle.state,expected))) throw new Error("战斗与地图事务结果不一致");
        next.commands.push({at,command:Core.clone(command)}); next.state = result.state;
        this.persist(next);
        if (!expected) this.restoreManager();
        return result;
    }
    expire(): boolean {
        this.readable();
        if (!this.save || this.save.state.phase !== "active") return false;
        const at = this.clock();
        if (at >= this.save.state.deadlineAt!) {
            this.pauseSearch(false);
            const next = this.archive!, command: ExpeditionCommand = {type:"timeout"};
            next.state = Rules.apply(next.config,next.profile,next.state,command,at,next.seed).state;
            next.commands.push({at,command}); this.persist(next,false); return true;
        }
        if ([600000,300000].some(v => at >= this.save!.state.deadlineAt!-v && !this.save!.state.map.warnings.includes(v))) {
            const next = this.archive!, command: ExpeditionCommand = {type:"warnings"};
            next.state = Rules.apply(next.config,next.profile,next.state,command,at,next.seed).state;
            next.commands.push({at,command}); this.persist(next);
        }
        return false;
    }
    resetConfirmed(): void {
        if (this.writing || this.storage.getItem(NewExpeditionSession.key) !== this.savedText) throw new Error("存档正在写入或已被其他页面改变");
        this.storage.removeItem(NewExpeditionSession.key);
        this.save = null; this.savedText = null; this.error = ""; this.pauseSearch(false); this.manager.reset();
    }
    private restoreManager() {
        const r = this.record;
        if (r && this.inventory?.phase === "active") this.manager.restoreNewRules(r.setup,r.state);
        else this.manager.reset();
    }
    private persist(next: ExpeditionSave, deadline = true) {
        if (this.writing) throw new Error("地图事务正在提交");
        this.writing = true;
        try {
            NewExpeditionSession.validate(next);
            if (this.storage.getItem(NewExpeditionSession.key) !== this.savedText) throw new Error("存档已被其他页面改变，请刷新");
            const text = JSON.stringify(next);
            if (deadline && next.state.deadlineAt !== null && this.clock() >= next.state.deadlineAt)
                throw new Error("提交达到截止，操作未保存");
            this.storage.setItem(NewExpeditionSession.key,text);
            this.savedText = text; this.save = Core.clone(next);
        } finally { this.writing = false; }
    }
    static validate(save: ExpeditionSave): void {
        if (!save || save.version !== 1 || !Number.isSafeInteger(save.createdAt) || save.createdAt < 0 ||
            save.runId !== `expedition_${save.createdAt}_${save.seed}` || !Array.isArray(save.commands) || save.commands.length > 8192)
            throw new Error("地图档版本或标识无效");
        let state = Rules.start(save.config,save.profile,save.seed,save.runId), last = save.createdAt;
        for (const entry of save.commands) {
            if (!entry || !Number.isSafeInteger(entry.at) || entry.at < last) throw new Error("操作时间逆序");
            state = Rules.apply(save.config,save.profile,state,entry.command,entry.at,save.seed).state; last = entry.at;
        }
        if (!Inventory.same(state,save.state)) throw new Error("地图、战斗、物品或搜索与完整重放不一致");
    }
}
