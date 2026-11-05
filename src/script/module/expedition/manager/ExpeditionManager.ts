import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { SkillBattleFormulaUtils as Rules } from "../../skillBattle/utils/SkillBattleFormulaUtils";
import type { ISkillBattleCarry, ISkillBattleState } from "../../skillBattle/types/SkillBattleTypes";
import { ExpeditionData, ExpeditionLocalStorage } from "../data/ExpeditionData";
import type { IExpeditionConfig, IExpeditionSave, IExpeditionState, IExpeditionStorage } from "../types/ExpeditionTypes";
import { ExpeditionSaveUtils } from "../utils/ExpeditionSaveUtils";

/** Owns the run and profile in one transactional local snapshot. */
export class ExpeditionManager {
    private readonly data = new ExpeditionData();
    private readonly config: IExpeditionConfig;
    private readonly signature: string;

    constructor(config: IExpeditionConfig, private readonly battle = SkillBattleManager.ins(),
        private readonly storage: IExpeditionStorage = new ExpeditionLocalStorage()) {
        this.config = ExpeditionData.clone(config);
        this.signature = JSON.stringify(this.config);
        try {
            const raw = storage.read();
            if (raw === null) {
                this.commit(this.createTestProfile());
                this.battle.reset();
            }
            else {
                const save = JSON.parse(raw) as IExpeditionSave;
                ExpeditionSaveUtils.validate(save, this.config, this.signature);
                this.data.snapshot = save;
                if (save.run) this.battle.restore(this.setup, save.run.battle);
                else this.battle.reset();
            }
        } catch (error) {
            this.data.error = `无法读取存档，原存档未覆盖：${(error as Error).message}`;
        }
        this.battle.beforeCommit = state => this.commitBattle(state);
    }

    get error(): string { return this.data.error; }
    get snapshot(): IExpeditionSave | null { return this.data.snapshot ? ExpeditionData.clone(this.data.snapshot) : null; }
    get run(): IExpeditionState | null { return this.snapshot?.run || null; }
    get setup() { return ExpeditionData.clone(this.config.encounters[this.data.snapshot?.run?.encounterIndex || 0]); }
    get configuration(): IExpeditionConfig { return ExpeditionData.clone(this.config); }
    get active(): boolean { const run = this.data.snapshot?.run; return !!run && !run.settled; }

    startNew(seed = (Math.random() * 0x100000000) >>> 0): ISkillBattleState {
        const save = this.requireSave();
        if (this.active) throw new Error("当前秘境尚未结束");
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("随机种子无效");
        const profile = save.profile, setup = this.config.encounters[0];
        const runId = `${profile.profileId}_run_${profile.nextRunIndex++}`;
        const carry: ISkillBattleCarry = {
            playerHp: setup.playerMaxHp, playerMaxHp: setup.playerMaxHp, weaponId: profile.weaponId,
            weaponDurability: profile.weaponDurability, pouchSlots: profile.pouchSlots, upgradeIds: [],
        };
        const state = Rules.startBattle(setup, `${runId}_battle_1`, carry);
        save.run = { runId, seed, rngState: seed, encounterIndex: 0, phase: "battle",
            loot: [], upgradeIds: [], pendingUpgradeChoices: [], settled: false, battle: state,
            allowedUpgradeIds: this.config.upgrades.filter(row => !row.requiredCollectionId ||
                profile.collectionIds.includes(row.requiredCollectionId)).map(row => row.id) };
        profile.pouchSlots = [null, null, null, null, null];
        this.commit(save);
        this.battle.restore(setup, state);
        return this.battle.state!;
    }

    chooseUpgrade(upgradeId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run || run.phase !== "reward" || run.settled ||
            !run.pendingUpgradeChoices.includes(upgradeId) || run.upgradeIds.includes(upgradeId))
            throw new Error("该强化不可领取或已领取");
        run.upgradeIds.push(upgradeId);
        run.pendingUpgradeChoices = [];
        run.phase = "decision";
        this.commit(save);
    }

    continueNext(): ISkillBattleState {
        const save = this.requireSave(), run = save.run;
        if (!run || run.phase !== "decision" || run.settled || run.encounterIndex >= 2)
            throw new Error("选择强化后才能进入下一战");
        const previous = run.battle;
        const setup = this.config.encounters[++run.encounterIndex];
        const state = Rules.startBattle(setup, `${run.runId}_battle_${run.encounterIndex + 1}`, {
            playerHp: previous.player.hp, playerMaxHp: previous.player.maxHp, weaponId: previous.weaponId,
            weaponDurability: previous.weaponDurability, pouchSlots: previous.pouchSlots, upgradeIds: run.upgradeIds,
        });
        run.battle = state;
        run.phase = "battle";
        this.commit(save);
        this.battle.restore(setup, state);
        return this.battle.state!;
    }

    extract(): boolean {
        const save = this.requireSave(), run = save.run;
        if (run?.settled) return false;
        if (!run || run.phase !== "decision") throw new Error("只有选完强化的战后阶段才能撤离");
        this.settle(save, true);
        this.commit(save);
        return true;
    }

    openLoot(itemUid: string): number {
        const save = this.requireSave();
        if (this.active) throw new Error("秘境中不能打开战利品");
        const index = save.profile.warehouse.findIndex(item => item.itemUid === itemUid);
        if (index < 0) throw new Error("物品已使用或不存在");
        const config = this.config.loot.find(row => row.itemId === save.profile.warehouse[index].itemId)!;
        if (config.useType !== "currency") throw new Error("残卷已入库，收藏功能将在阶段 E 开放");
        const currency = save.profile.currency + config.currencyValue;
        if (!Number.isSafeInteger(currency)) throw new Error("灵石数量超过上限");
        save.profile.warehouse.splice(index, 1);
        save.profile.currency = currency;
        this.commit(save);
        return config.currencyValue;
    }

    resetTestProfile(): void {
        const save = this.createTestProfile();
        ExpeditionSaveUtils.validate(save, this.config, this.signature);
        this.storage.write(JSON.stringify(save));
        this.data.snapshot = save;
        this.data.error = "";
        this.battle.reset();
    }

    private commitBattle(state: ISkillBattleState): void {
        const save = this.requireSave(), run = save.run;
        if (!run || run.settled || run.phase !== "battle" || run.battle.battleId !== state.battleId ||
            run.battle.revision + 1 !== state.revision) throw new Error("战斗与秘境存档不同步，请重新载入");
        run.battle = Rules.cloneState(state);
        if (state.phase === "defeat") this.settle(save, false);
        else if (state.phase === "victory") {
            this.config.rewards[run.encounterIndex].forEach((itemId, index) => run.loot.push({
                itemUid: `${run.runId}_loot_${run.encounterIndex}_${index}`, itemId,
            }));
            if (run.encounterIndex === 2) this.settle(save, true);
            else {
                run.pendingUpgradeChoices = this.createChoices(run);
                run.phase = run.pendingUpgradeChoices.length ? "reward" : "decision";
            }
        }
        this.commit(save);
    }

    private createChoices(run: IExpeditionState): number[] {
        const pool = run.allowedUpgradeIds.filter(id => !run.upgradeIds.includes(id));
        const choices: number[] = [];
        while (pool.length && choices.length < 3) {
            run.rngState = (Math.imul(run.rngState, 1664525) + 1013904223) >>> 0;
            const index = Math.floor(run.rngState / 0x100000000 * pool.length);
            choices.push(pool.splice(index, 1)[0]);
        }
        return choices;
    }

    private settle(save: IExpeditionSave, success: boolean): void {
        const run = save.run!, profile = save.profile;
        if (run.settled || profile.settledRunIds.includes(run.runId)) throw new Error("该秘境已经结算");
        if (success) profile.warehouse.push(...run.loot.map(item => ({ ...item })));
        profile.weaponDurability = run.battle.weaponDurability;
        profile.pouchSlots = success ? run.battle.pouchSlots.map(item => item ? { ...item } : null)
            : [null, null, null, null, null];
        run.loot = [];
        run.upgradeIds = [];
        run.pendingUpgradeChoices = [];
        run.phase = success ? "extracted" : "failed";
        run.settled = true;
        profile.settledRunIds.push(run.runId);
    }

    private createTestProfile(): IExpeditionSave {
        const setup = this.config.encounters[0];
        const profileId = `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        const pouchSlots = new Array(5).fill(null);
        setup.items.forEach(item => {
            if (item.initialSlot) pouchSlots[item.initialSlot - 1] = {
                itemUid: `${profileId}_supply_${item.initialSlot}`, itemId: item.itemId,
            };
        });
        return { version: 1, configSignature: this.signature, run: null, profile: {
            profileId, nextRunIndex: 1, currency: 0, collectionIds: [], warehouse: [], weaponId: setup.weaponId,
            weaponDurability: setup.weaponDurability, pouchSlots, settledRunIds: [],
        } };
    }

    private requireSave(): IExpeditionSave {
        if (this.data.error || !this.data.snapshot) throw new Error(this.data.error || "没有可用存档");
        return ExpeditionData.clone(this.data.snapshot);
    }

    private commit(save: IExpeditionSave): void {
        ExpeditionSaveUtils.validate(save, this.config, this.signature);
        // Storage must succeed before replacing either authoritative in-memory state.
        this.storage.write(JSON.stringify(save));
        this.data.snapshot = ExpeditionData.clone(save);
    }
}
