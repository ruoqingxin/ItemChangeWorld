import { InventoryData } from "../data/InventoryData";
import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { InventoryRules as Rules } from "../utils/InventoryRules";
import type { GameStorage } from "../../common/types/GameStorage";
import type { NewBattleAction, NewBattleResult, NewBattleState, NewBattleToken } from "../../skillBattle/types/BattleTypes";
import type { NewBuildCommand, NewBuildProfile, NewBuildSave, NewBuildToken } from "../../build/types/BuildTypes";
import type { InventoryCommand, InventoryConfig, InventorySave } from "../types/InventoryTypes";

/** One write owns inventory, construction, battle, deadline and terminal settlement. */
export class InventoryManager {
    static readonly key = "nowchange.stage3-inventory.v1";
    private readonly data = new InventoryData();
    get error(): string { return this.data.error; }
    constructor(readonly manager: SkillBattleManager, private readonly storage: GameStorage,
        private readonly clock: () => number = () => Date.now(), private readonly currentConfig?: InventoryConfig) {
        try {
            this.data.savedText = storage.getItem(InventoryManager.key);
            if (this.data.savedText !== null) {
                const candidate = JSON.parse(this.data.savedText);
                InventoryManager.validate(candidate);
                if (currentConfig && !Rules.same(currentConfig,candidate.config)) throw new Error("配置已改变，原档保留，禁止静默迁移");
                this.data.save = candidate; this.restoreManager();
            }
        } catch (error) { this.data.error = `储物演练档无法读取，原档已保留：${(error as Error).message}`; }
        manager.beforeNewCommit = (state,action) => {
            this.commit({ type: "build", command: { type: "action", action } },this.token,state);
        };
    }
    get archive(): InventorySave | null { return Core.clone(this.data.save); }
    get inventory() { return this.archive?.state || null; }
    get snapshot(): NewBuildSave | null {
        const s = this.data.save;
        return !s?.state.flow ? null : Core.clone({ version: 1, startedAt: s.state.enteredAt!,
            deadlineAt: s.state.deadlineAt!, seed: s.seed, runId: s.runId, config: s.config.build,
            profile: s.profile, commands: [], state: s.state.flow });
    }
    get flow() { return this.snapshot?.state || null; }
    get records() { return this.flow?.battles || []; }
    get record() { const records = this.records; return records[records.length - 1] || null; }
    get state() { return this.record?.state || null; }
    get token(): NewBuildToken { return { runId: this.data.save?.runId || "", revision: this.data.save?.state.revision ?? -1 }; }
    get remainingMs(): number { return this.data.save?.state.deadlineAt ? Math.max(0,this.data.save.state.deadlineAt - this.clock()) : 0; }
    get outcome(): "active" | "victory" | "defeat" | "timeout" | "empty" {
        const s = this.data.save?.state;
        if (!s) return "empty";
        if (s.result === "timeout") return "timeout";
        if (s.result === "defeat" || s.result === "abandon") return "defeat";
        return s.flow?.phase === "battle" ? "active" : "victory";
    }
    get screen(): "start" | "battle" | "settlement" {
        return this.flow?.phase === "battle" ? "battle" : this.inventory?.phase === "ended" ? "settlement" : "start";
    }
    prepare(config: InventoryConfig, profile: NewBuildProfile, seed: number): void {
        this.readable();
        if (this.data.save && this.data.save.state.phase !== "ended") throw new Error("已有演练，请先完成或明确放弃");
        if (this.currentConfig && !Rules.same(config,this.currentConfig)) throw new Error("新演练配置不匹配");
        const createdAt = this.clock(), runId = `inventory_${createdAt}_${seed}`;
        const state = Rules.start(config,profile,seed,runId);
        this.persist({ version: 1, runId, createdAt, seed, config: Core.clone(config),
            profile: Core.clone(profile), commands: [], state });
        this.manager.reset();
    }
    previewMove(command: InventoryCommand, token: NewBuildToken = this.token): ReturnType<typeof Rules.apply> {
        this.readable(); this.checkToken(token); this.expire();
        if (!this.data.save) throw new Error("未建立演练");
        return Rules.apply(this.data.save.config,this.data.save.profile,this.data.save.state,command,this.clock(),this.data.save.seed);
    }
    inventoryCommand(command: InventoryCommand, token: NewBuildToken = this.token) {
        if (command.type === "timeout" || command.type === "build") throw new Error("请通过专用截止或构筑入口提交");
        return this.commit(command,token);
    }
    dispatch(command: Exclude<NewBuildCommand,{ type: "action" }>, token: NewBuildToken = this.token) {
        if (["action","timeout"].includes(command.type)) throw new Error("请通过专用战斗或截止入口提交");
        if (["finish","extract","abandon"].includes(command.type))
            return this.commit({ type: command.type === "finish" ? "extract" : command.type as "extract" | "abandon" },token);
        return this.commit({ type: "build", command },token);
    }
    preview(action: NewBattleAction): NewBattleResult {
        this.requireBattle(); return this.manager.previewNewAction(action);
    }
    confirm(action: NewBattleAction, token: NewBattleToken): NewBattleResult {
        this.requireBattle(); return this.manager.confirmNewAction(action,token);
    }
    private requireBattle(): void {
        this.readable(); this.expire();
        if (this.data.save?.state.flow?.phase !== "battle" || this.data.save.state.phase !== "active") throw new Error("当前没有战斗或演练已超时");
    }
    private readable(): void { if (this.data.error) throw new Error(this.data.error); }
    private checkToken(token: NewBuildToken): void {
        if (!this.data.save || token.runId !== this.data.save.runId || token.revision !== this.data.save.state.revision)
            throw new Error("页面修订已过期，请重新选择");
    }
    private commit(command: InventoryCommand, token: NewBuildToken, expected?: NewBattleState) {
        this.readable();
        if (this.data.writing) throw new Error("储物事务正在提交");
        this.checkToken(token); this.expire();
        const next = this.archive!, at = this.clock();
        const result = Rules.apply(next.config,next.profile,next.state,command,at,next.seed);
        if (expected && (!result.battle?.ok || !Rules.same(result.battle.state,expected))) throw new Error("物品与战斗提交结果不一致");
        next.commands.push({ at, command: Core.clone(command) }); next.state = result.state;
        this.persist(next);
        if (!expected) this.restoreManager();
        return result;
    }
    expire(): boolean {
        this.readable();
        if (!this.data.save || this.data.save.state.phase !== "active" || this.clock() < this.data.save.state.deadlineAt!) return false;
        const next = this.archive!, at = this.clock(), command: InventoryCommand = { type: "timeout" };
        next.state = Rules.apply(next.config,next.profile,next.state,command,at,next.seed).state;
        next.commands.push({ at, command }); this.persist(next,false);
        return true;
    }
    resetConfirmed(): void {
        if (this.data.writing) throw new Error("储物事务正在提交");
        if (this.storage.getItem(InventoryManager.key) !== this.data.savedText) throw new Error("存档已由其他页面更新");
        this.storage.removeItem(InventoryManager.key);
        this.data.save = null; this.data.savedText = null; this.data.error = ""; this.manager.reset();
    }
    private restoreManager(): void {
        const r = this.record;
        if (r && this.inventory?.phase === "active") this.manager.restoreNewRules(r.setup,r.state);
        else this.manager.reset();
    }
    private persist(next: InventorySave, deadline = true): void {
        if (this.data.writing) throw new Error("储物事务正在提交");
        this.data.writing = true;
        try {
            InventoryManager.validate(next);
            if (this.storage.getItem(InventoryManager.key) !== this.data.savedText) throw new Error("存档已在其他页面改变，请刷新");
            const text = JSON.stringify(next);
            if (deadline && next.state.phase === "active" && this.clock() >= next.state.deadlineAt!)
                throw new Error("提交达到截止，操作未保存");
            // Terminal user actions are also subject to the original deadline.
            const last = next.commands[next.commands.length - 1];
            if (deadline && next.state.deadlineAt !== null && last?.command.type !== "timeout" &&
                this.clock() >= next.state.deadlineAt) throw new Error("提交达到截止，操作未保存");
            this.storage.setItem(InventoryManager.key,text);
            this.data.savedText = text; this.data.save = Core.clone(next);
        } finally { this.data.writing = false; }
    }
    static validate(save: InventorySave): void {
        const time = (n: number) => Number.isSafeInteger(n) && n >= 0;
        if (!save || save.version !== 1 || !time(save.createdAt) ||
            save.runId !== `inventory_${save.createdAt}_${save.seed}` || !Array.isArray(save.commands) || save.commands.length > 8192)
            throw new Error("储物演练存档版本或标识无效");
        let state = Rules.start(save.config,save.profile,save.seed,save.runId), lastAt = save.createdAt;
        for (const entry of save.commands) {
            if (!entry || !time(entry.at) || entry.at < lastAt) throw new Error("物品操作时间逆序");
            state = Rules.apply(save.config,save.profile,state,entry.command,entry.at,save.seed).state;
            lastAt = entry.at;
        }
        if (!Rules.same(state,save.state)) throw new Error("物品、战斗、归属或结算快照与完整重放不一致");
    }
}
