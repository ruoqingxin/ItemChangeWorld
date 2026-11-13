import { ExpeditionRunData } from "../data/ExpeditionRunData";
import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { InventoryRules as Inventory } from "../../inventory/utils/InventoryRules";
import { ExpeditionRules as Rules } from "../utils/ExpeditionRules";
import type { GameStorage } from "../../common/types/GameStorage";
import type { NewBattleAction, NewBattleState, NewBattleToken } from "../../skillBattle/types/BattleTypes";
import type { NewBuildCommand, NewBuildProfile, NewBuildSave, NewBuildToken } from "../../build/types/BuildTypes";
import type { InventoryCommand, InventoryConfig } from "../../inventory/types/InventoryTypes";
import type { ExpeditionCommand, ExpeditionConfig, ExpeditionSave } from "../types/ExpeditionRunTypes";

/** One saved transaction includes graph, source progress, instances, combat and settlement. */
export class ExpeditionRunManager {
    static readonly key = "nowchange.stage4-expedition.v1";
    private readonly data = new ExpeditionRunData();
    get error(): string { return this.data.error; }
    constructor(readonly manager: SkillBattleManager, private readonly storage: GameStorage,
        private readonly clock: () => number = () => Date.now(), private readonly currentConfig?: ExpeditionConfig,
        private readonly monotonic: () => number = () => performance.now()) {
        try {
            this.data.savedText = storage.getItem(ExpeditionRunManager.key);
            if (this.data.savedText !== null) {
                const candidate = JSON.parse(this.data.savedText);
                ExpeditionRunManager.validate(candidate);
                if (currentConfig && !ExpeditionRunManager.matchesCurrent(currentConfig,candidate))
                    throw new Error("配置已改变，请明确重建本阶段档");
                this.data.save = candidate; this.restoreManager();
            }
        } catch (e) { this.data.error = `地图档无法读取，原文保留：${(e as Error).message}`; }
        manager.beforeNewCommit = (expected,action) => {
            this.commit({ type:"build",command:{ type:"action",action } },this.token,expected);
        };
    }
    get archive() { return Core.clone(this.data.save); }
    get inventory() { return this.archive?.state || null; }
    get snapshot(): NewBuildSave | null {
        const s = this.data.save;
        return !s?.state.flow ? null : Core.clone({version:1,startedAt:s.state.enteredAt!,deadlineAt:s.state.deadlineAt!,
            seed:s.seed,runId:s.runId,config:s.config.build,profile:s.profile,commands:[],state:s.state.flow});
    }
    get flow() { return this.snapshot?.state || null; }
    get records() { return this.flow?.battles || []; }
    get record() { const a = this.records; return a[a.length-1] || null; }
    get state() { return this.record?.state || null; }
    get token(): NewBuildToken { return {runId:this.data.save?.runId || "",revision:this.data.save?.state.revision ?? -1}; }
    get remainingMs() { return this.data.save?.state.deadlineAt ? Math.max(0,this.data.save.state.deadlineAt-this.clock()) : 0; }
    get outcome(): "active" | "victory" | "defeat" | "timeout" | "empty" {
        const s = this.data.save?.state;
        return !s ? "empty" : s.result === "timeout" ? "timeout" :
            s.result === "defeat" || s.result === "abandon" ? "defeat" : s.flow?.phase === "battle" ? "active" : "victory";
    }
    get screen(): "start" | "battle" | "settlement" {
        return this.flow?.phase === "battle" ? "battle" : this.inventory?.phase === "ended" ? "settlement" : "start";
    }
    get searching() { return this.data.searchAt !== null; }
    prepare(config: InventoryConfig, profile: NewBuildProfile, seed: number): void {
        this.readable();
        if (this.data.save && this.data.save.state.phase !== "ended") throw new Error("已有进行中的探索");
        if (this.currentConfig && !Inventory.same(config,this.currentConfig)) throw new Error("配置不匹配");
        const createdAt = this.clock(), runId = `expedition_${createdAt}_${seed}`, c = config as ExpeditionConfig;
        const state = Rules.start(c,profile,seed,runId);
        this.persist({version:4,runId,createdAt,seed,config:Core.clone(c),profile:Core.clone(profile),commands:[],state});
        this.pauseSearch(false); this.manager.reset();
    }
    previewMove(command: InventoryCommand, token = this.token) {
        this.readable(); this.checkToken(token); this.expire();
        const s = this.data.save!;
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
        if (["travel","fight","extract","abandon"].includes(command.type)) {
            this.checkToken(token); this.pauseSearch(); token = this.token;
        }
        return this.commit(command,token);
    }
    openSource(): void {
        this.readable(); this.expire();
        const s=this.data.save;
        if(!s || s.state.phase!=="active" || s.state.flow?.phase!=="ready" || s.state.flow.pending)
            throw new Error("当前不能打开来源");
        const box=Rules.source(s.state);
        if(box && !box.opened)this.startSearch();
        else if(box && s.state.interactionSource!==s.state.node)this.commit({type:"interactSource"},this.token);
    }
    startSearch(): void {
        this.readable(); this.expire();
        const s = this.data.save;
        if (!s || s.state.phase !== "active" || s.state.flow?.phase !== "ready" || s.state.flow.pending)
            throw new Error("当前不能搜索");
        const box = Rules.source(s.state);
        if (!box || box.revealed === box.entries.length) throw new Error("此处已搜索完毕");
        if (!box.opened)this.commit({type:"openSource"},this.token);
        else if(s.state.interactionSource!==s.state.node)this.commit({type:"interactSource"},this.token);
        if(this.data.save!.state.phase!=="active")return;
        if (this.searching)return;
        this.data.searchAt = this.monotonic(); this.data.searchNode = s.state.node;
    }
    advanceSearch(foreground = true): boolean {
        if (!this.searching) return false;
        if (!foreground) { this.pauseSearch(false); return false; }
        const now = this.monotonic(), elapsed = Math.floor(now-this.data.searchAt!);
        // Long suspension gaps never become free search progress.
        if (elapsed < 0 || elapsed > 1000 || this.data.save?.state.node !== this.data.searchNode) {
            this.pauseSearch(false); return false;
        }
        if (elapsed < this.data.save!.config.rules.checkpointMs) return false;
        try {
            const deltaMs = this.data.save!.config.rules.checkpointMs;
            this.commit({type:"search",deltaMs},this.token);
            this.data.searchAt! += deltaMs;
            const box = Rules.source(this.data.save!.state)!;
            if (box.revealed === box.entries.length) this.pauseSearch(false);
            return true;
        } catch (e) { this.pauseSearch(false); throw e; }
    }
    pauseSearch(flush = true): void {
        const at = this.data.searchAt; this.data.searchAt = null; this.data.searchNode = null;
        if (!flush || at === null || this.data.save?.state.phase !== "active") return;
        let elapsed = Math.floor(this.monotonic()-at);
        if (elapsed <= 0 || elapsed > 1000) return;
        while (elapsed > 0) {
            const box = Rules.source(this.data.save!.state);
            if (!box || box.revealed === box.entries.length) break;
            const deltaMs = Math.min(elapsed,this.data.save!.config.rules.checkpointMs);
            this.commit({type:"search",deltaMs},this.token); elapsed -= deltaMs;
        }
    }
    preview(action: NewBattleAction) { this.requireBattle(); return this.manager.previewNewAction(action); }
    confirm(action: NewBattleAction, token: NewBattleToken) { this.requireBattle(); return this.manager.confirmNewAction(action,token); }
    private requireBattle() {
        this.readable(); this.expire();
        if (this.data.save?.state.phase !== "active" || this.data.save.state.flow?.phase !== "battle") throw new Error("当前没有可操作战斗");
    }
    private readable() { if (this.data.error) throw new Error(this.data.error); }
    private checkToken(token: NewBuildToken) {
        if (!this.data.save || token.runId !== this.data.save.runId || token.revision !== this.data.save.state.revision)
            throw new Error("页面修订已过期");
    }
    private commit(command: ExpeditionCommand, token: NewBuildToken, expected?: NewBattleState) {
        this.readable(); this.checkToken(token); this.expire();
        if (this.data.writing) throw new Error("地图事务正在提交");
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
        if (!this.data.save || this.data.save.state.phase !== "active") return false;
        const at = this.clock();
        if (at >= this.data.save.state.deadlineAt!) {
            this.pauseSearch(false);
            const next = this.archive!, command: ExpeditionCommand = {type:"timeout"};
            next.state = Rules.apply(next.config,next.profile,next.state,command,at,next.seed).state;
            next.commands.push({at,command}); this.persist(next,false); return true;
        }
        if ([600000,300000].some(v => at >= this.data.save!.state.deadlineAt!-v && !this.data.save!.state.map.warnings.includes(v))) {
            const next = this.archive!, command: ExpeditionCommand = {type:"warnings"};
            next.state = Rules.apply(next.config,next.profile,next.state,command,at,next.seed).state;
            next.commands.push({at,command}); this.persist(next);
        }
        return false;
    }
    resetConfirmed(): void {
        if (this.data.writing || this.storage.getItem(ExpeditionRunManager.key) !== this.data.savedText) throw new Error("存档正在写入或已被其他页面改变");
        this.storage.removeItem(ExpeditionRunManager.key);
        this.data.save = null; this.data.savedText = null; this.data.error = ""; this.pauseSearch(false); this.manager.reset();
    }
    private restoreManager() {
        const r = this.record;
        if (r && this.inventory?.phase === "active") this.manager.restoreNewRules(r.setup,r.state);
        else this.manager.reset();
    }
    private static matchesCurrent(current: ExpeditionConfig, saved: ExpeditionSave): boolean {
        if (Inventory.same(current,saved.config)) return true;
        if (saved.state.map.generatorVersion===4 || current.rules.normalMin===undefined) return false;
        const original=Core.clone(current);
        for (const key of ["normalMin","normalMax","eliteMin","eliteMax",
            "insightMin","insightMax","borrowMin","borrowMax"] as const) {
            if(saved.config.rules[key]!==undefined)return false;
            delete original.rules[key];
        }
        // Existing maps keep their own budgets and exact replay; only new maps use the expanded table.
        original.rules.searchMin=3; original.rules.searchMax=5; original.groundNodeLimit=44;
        return Inventory.same(original,saved.config);
    }
    private persist(next: ExpeditionSave, deadline = true) {
        if (this.data.writing) throw new Error("地图事务正在提交");
        this.data.writing = true;
        try {
            ExpeditionRunManager.validate(next);
            if (this.storage.getItem(ExpeditionRunManager.key) !== this.data.savedText) throw new Error("存档已被其他页面改变，请刷新");
            const text = JSON.stringify(next);
            if (deadline && next.state.deadlineAt !== null && this.clock() >= next.state.deadlineAt)
                throw new Error("提交达到截止，操作未保存");
            this.storage.setItem(ExpeditionRunManager.key,text);
            this.data.savedText = text; this.data.save = Core.clone(next);
        } finally { this.data.writing = false; }
    }
    static validate(save: ExpeditionSave): void {
        if (!save || save.version !== 4 || !Number.isSafeInteger(save.createdAt) || save.createdAt < 0 ||
            save.runId !== `expedition_${save.createdAt}_${save.seed}` || !Array.isArray(save.commands) || save.commands.length > 8192)
            throw new Error("地图档版本或标识无效");
        const generator = save.state?.map?.generatorVersion;
        if(generator!==undefined && generator!==2 && generator!==3 && generator!==4)
            throw new Error("地图生成版本无效");
        let state = Rules.start(save.config,save.profile,save.seed,save.runId,
            generator ?? 1), last = save.createdAt;
        for (const entry of save.commands) {
            if (!entry || !Number.isSafeInteger(entry.at) || entry.at < last) throw new Error("操作时间逆序");
            state = Rules.apply(save.config,save.profile,state,entry.command,entry.at,save.seed).state; last = entry.at;
        }
        if (!Inventory.same(state,save.state)) throw new Error("地图、战斗、物品或搜索与完整重放不一致");
    }
}
