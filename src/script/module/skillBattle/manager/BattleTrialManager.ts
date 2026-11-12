import { BattleTrialData } from "../data/BattleTrialData";
import { SkillBattleManager } from "./SkillBattleManager";
import { BattleRules } from "../utils/BattleRules";
import type { NewBattleAction, NewBattleCarry, NewBattleResult, NewBattleSetup,
    NewBattleState, NewBattleToken } from "../types/BattleTypes";

import type { GameStorage } from "../../common/types/GameStorage";
import type { NewTrialRecord, NewTrialSave } from "../types/BattleTrialTypes";

/** The trial owns one isolated key. Writes happen before either authoritative model is advanced. */
export class BattleTrialManager {
    static readonly key = "nowchange.stage1-battle.v1";
    private readonly data = new BattleTrialData();
    get error(): string { return this.data.error; }
    constructor(readonly manager: SkillBattleManager, private readonly storage: GameStorage,
        private readonly clock: () => number = () => Date.now()) {
        try {
            this.data.savedText = storage.getItem(BattleTrialManager.key);
            if (this.data.savedText !== null) {
                const loaded: NewTrialSave = JSON.parse(this.data.savedText);
                BattleTrialManager.validate(loaded);
                this.data.save = loaded;
                this.restoreManager();
            }
        } catch (error) { this.data.error = `试炼档无法读取，原档已保留：${(error as Error).message}`; }
        manager.beforeNewCommit = (state, action) => this.commitAction(state, action);
    }
    get snapshot(): NewTrialSave | null { return BattleRules.clone(this.data.save); }
    get records(): NewTrialRecord[] { return this.snapshot?.battles || []; }
    get record(): NewTrialRecord | null {
        return this.data.save ? BattleRules.clone(this.data.save.battles[this.data.save.battles.length - 1]) : null;
    }
    get state(): NewBattleState | null { return this.record?.state || null; }
    get outcome(): "active" | "victory" | "defeat" | "timeout" | "empty" {
        if (!this.data.save) return "empty";
        return this.data.save.timedOutAt !== null ? "timeout" :
            this.data.save.battles[this.data.save.battles.length - 1].state.phase === "player_input" ? "active" :
                this.data.save.battles[this.data.save.battles.length - 1].state.phase as "victory" | "defeat";
    }
    get remainingMs(): number { return this.data.save ? Math.max(0, this.data.save.deadlineAt - this.clock()) : 0; }
    get screen(): "start" | "battle" | "settlement" {
        return this.data.error || !this.data.save ? "start" : this.outcome === "active" ? "battle" : "settlement";
    }

    start(setup: NewBattleSetup, emptyPouch = false): void {
        this.requireReadable();
        if (this.outcome === "active") throw new Error("当前试炼未结束，请先确认放弃");
        const now = this.clock(), battleId = `trial_${now}_1`;
        const initial = BattleRules.start(setup, battleId);
        const hp = setup.potions.find(row => row.resource === "hp"), mp = setup.potions.find(row => row.resource === "mp");
        if (!emptyPouch) {
            if (!hp || !mp) throw new Error("试炼药品配置缺失");
            initial.pouch = [hp, hp, mp, mp, null].map((row, i) => row
                ? { itemUid: `${battleId}_p${i}`, itemId: row.itemId } : null);
        }
        const next: NewTrialSave = { version: 1, startedAt: now, deadlineAt: now + 20 * 60 * 1000,
            timedOutAt: null, battles: [{ setup: BattleRules.clone(setup), initial,
                actions: [], state: BattleRules.clone(initial) }] };
        this.persist(next);
        this.restoreManager();
    }

    continueBattle(): void {
        this.requireReadable();
        if (this.outcome !== "victory" || !this.data.save) throw new Error("只有胜利后才能继续试炼");
        if (this.clock() >= this.data.save.deadlineAt) throw new Error("本次试炼时间已耗尽，请重新开始");
        const next = this.snapshot!, previous = next.battles[next.battles.length - 1];
        const s = previous.state, carry: NewBattleCarry = { hp: s.player.hp, mp: s.player.mp,
            weapon: s.weapon, pouch: s.pouch };
        const initial = BattleRules.start(previous.setup, `trial_${next.startedAt}_${next.battles.length + 1}`, carry);
        next.battles.push({ setup: BattleRules.clone(previous.setup), initial,
            actions: [], state: BattleRules.clone(initial) });
        this.persist(next);
        this.restoreManager();
    }

    preview(action: NewBattleAction): NewBattleResult {
        this.requireActive();
        return this.manager.previewNewAction(action);
    }

    confirm(action: NewBattleAction, token: NewBattleToken): NewBattleResult {
        this.requireActive();
        return this.manager.confirmNewAction(action, token);
    }

    expire(): boolean {
        this.requireReadable();
        if (this.outcome !== "active" || !this.data.save || this.clock() < this.data.save.deadlineAt) return false;
        const next = this.snapshot!;
        next.timedOutAt = this.clock();
        this.persist(next, false);
        return true;
    }

    resetConfirmed(): void {
        if (this.storage.getItem(BattleTrialManager.key) !== this.data.savedText) throw new Error("试炼档已在其他页面改变，请刷新");
        this.storage.removeItem(BattleTrialManager.key);
        this.data.save = null; this.data.savedText = null; this.data.error = "";
        this.manager.reset();
    }

    private requireReadable(): void { if (this.data.error) throw new Error(this.data.error); }
    private requireActive(): void {
        this.requireReadable();
        this.expire();
        if (this.outcome !== "active") throw new Error(this.outcome === "timeout" ? "试炼已超时" : "当前没有进行中的试炼");
    }
    private restoreManager(): void {
        const record = this.record;
        if (record) this.manager.restoreNewRules(record.setup, record.state);
    }
    private commitAction(state: NewBattleState, action: NewBattleAction): void {
        this.requireActive();
        const next = this.snapshot!, record = next.battles[next.battles.length - 1];
        record.actions.push({ at: this.clock(), action: BattleRules.clone(action) });
        record.state = BattleRules.clone(state);
        this.persist(next);
    }
    private persist(next: NewTrialSave, enforceDeadline = true): void {
        if (this.data.writing) throw new Error("试炼存档正在提交");
        this.data.writing = true;
        try {
            BattleTrialManager.validate(next);
            if (enforceDeadline && this.clock() >= next.deadlineAt) throw new Error("提交到达截止，行动未保存");
            if (this.storage.getItem(BattleTrialManager.key) !== this.data.savedText)
                throw new Error("试炼档已在其他页面改变，请刷新");
            const text = JSON.stringify(next);
            this.storage.setItem(BattleTrialManager.key, text);
            this.data.savedText = text;
            this.data.save = BattleRules.clone(next);
        } finally { this.data.writing = false; }
    }

    static validate(save: NewTrialSave): void {
        const time = (n: number) => Number.isSafeInteger(n) && n >= 0;
        if (!save || save.version !== 1 || !time(save.startedAt) || !time(save.deadlineAt) ||
            save.deadlineAt - save.startedAt !== 20 * 60 * 1000 ||
            (save.timedOutAt !== null && (!time(save.timedOutAt) || save.timedOutAt < save.deadlineAt)) ||
            !Array.isArray(save.battles) || !save.battles.length || save.battles.length > 64)
            throw new Error("试炼档版本、截止或场次无效");
        let lastAt = save.startedAt;
        for (let i = 0; i < save.battles.length; i++) {
            const record = save.battles[i], previous = save.battles[i - 1];
            if (!record || !Array.isArray(record.actions) || record.actions.length > 4096)
                throw new Error("试炼行动记录无效");
            BattleRules.validateSetup(record.setup);
            BattleRules.validateState(record.setup, record.initial);
            const initial = record.initial;
            if (initial.battleId !== `trial_${save.startedAt}_${i + 1}` || initial.revision !== 0 ||
                initial.round !== 1 || initial.phase !== "player_input" || initial.potionUsed)
                throw new Error("试炼初始快照无效");
            const carry = previous ? { hp: previous.state.player.hp, mp: previous.state.player.mp,
                weapon: previous.state.weapon, pouch: previous.state.pouch } :
                { hp: record.setup.player.maxHp, mp: record.setup.player.maxMp,
                    weapon: record.setup.weapon, pouch: initial.pouch };
            const expectedInitial = BattleRules.start(record.setup, initial.battleId, carry);
            if (JSON.stringify(expectedInitial) !== JSON.stringify(initial) ||
                (previous && (previous.state.phase !== "victory" ||
                    JSON.stringify(previous.setup) !== JSON.stringify(record.setup))))
                throw new Error("跨战资源或构筑快照不连续");
            if (!previous) {
                const counts: { [key: string]: number } = {};
                initial.pouch.forEach(row => {
                    if (row) counts[row.itemId] = (counts[row.itemId] || 0) + 1;
                });
                const hp = record.setup.potions.find(row => row.resource === "hp");
                const mp = record.setup.potions.find(row => row.resource === "mp");
                if (Object.keys(counts).length && (!hp || !mp || counts[hp.itemId] !== 2 ||
                    counts[mp.itemId] !== 2 || Object.keys(counts).length !== 2))
                    throw new Error("初始试炼药品不符合夹具");
            }
            let state = BattleRules.clone(initial);
            for (const entry of record.actions) {
                if (!entry || !time(entry.at) || entry.at < lastAt || entry.at >= save.deadlineAt)
                    throw new Error("行动时间越界");
                lastAt = entry.at;
                const result = BattleRules.resolve(record.setup, state, entry.action);
                if (result.ok === false) throw new Error(`行动无法重放：${result.reason}`);
                state = result.state;
            }
            if (JSON.stringify(state) !== JSON.stringify(record.state)) throw new Error("战斗快照与重放不一致");
        }
        if (save.timedOutAt !== null && save.battles[save.battles.length - 1].state.phase !== "player_input")
            throw new Error("已完成战斗不能再超时");
    }
}
