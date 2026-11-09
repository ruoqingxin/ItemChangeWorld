import { SkillBattleManager } from "../../skillBattle/manager/SkillBattleManager";
import { SkillBattleFormulaUtils as Rules } from "../../skillBattle/utils/SkillBattleFormulaUtils";
import type { ISkillBattleAction, ISkillBattleCarry, ISkillBattleState } from "../../skillBattle/types/SkillBattleTypes";
import { ExpeditionData, ExpeditionLocalStorage } from "../data/ExpeditionData";
import type { IExpeditionConfig, IExpeditionSave, IExpeditionState, IExpeditionStorage } from "../types/ExpeditionTypes";
import { ExpeditionSaveUtils } from "../utils/ExpeditionSaveUtils";
import { ExpeditionStatsUtils } from "../utils/ExpeditionStatsUtils";
import { ExpeditionBuildUtils } from "../utils/ExpeditionBuildUtils";
import { ExpeditionMapUtils } from "../utils/ExpeditionMapUtils";
import type { IExpeditionMapNode, IExpeditionMapState } from "../types/ExpeditionMapTypes";

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
            if (this.config.map) {
                ExpeditionMapUtils.validateConfig(this.config.map);
                for (const node of this.config.map.nodes.filter(node =>
                    ["battle", "elite", "boss"].includes(node.type))) {
                    if (!this.config.encounters[node.encounterIndex ?? -1])
                        throw new Error(`地图战斗节点 ${node.id} 缺少遭遇配置`);
                }
            }
            if (this.config.build) {
                for (const encounter of this.config.encounters) {
                    for (const skill of this.config.build.skills) {
                        if (!encounter.skills.some(row => row.id === skill.id))
                            throw new Error(`构筑技能 ${skill.id} 在遭遇 ${encounter.encounterId} 中缺少战斗定义`);
                    }
                }
            }
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
                this.expireMap();
            }
        } catch (error) {
            this.data.error = `无法读取存档，原存档未覆盖：${(error as Error).message}`;
        }
        this.battle.beforeCommit = (state, action) => this.commitBattle(state, action);
    }

    get error(): string { return this.data.error; }
    get snapshot(): IExpeditionSave | null { return this.data.snapshot ? ExpeditionData.clone(this.data.snapshot) : null; }
    get run(): IExpeditionState | null { return this.snapshot?.run || null; }
    get setup() {
        const setup = ExpeditionData.clone(this.config.encounters[this.data.snapshot?.run?.encounterIndex || 0]);
        const build = this.data.snapshot?.run?.build;
        if (!build || !build.activeSkills.length) return setup;
        const activeIds = new Set(build.activeSkills.map(skill => skill.skillId));
        const selected = setup.skills.filter(skill => activeIds.has(skill.id));
        if (selected.length !== activeIds.size) throw new Error("已装配技能缺少战斗定义");
        setup.skills = selected;
        return setup;
    }
    get configuration(): IExpeditionConfig { return ExpeditionData.clone(this.config); }
    get active(): boolean { const run = this.data.snapshot?.run; return !!run && !run.settled; }
    get build() { return this.run?.build ? ExpeditionData.clone(this.run.build) : null; }
    get map(): IExpeditionMapState | null { return this.run?.map ? ExpeditionData.clone(this.run.map) : null; }
    get mapConfig() { return this.config.map ? ExpeditionData.clone(this.config.map) : null; }
    get usesMap(): boolean { return !!this.config.map; }

    startNew(seed = (Math.random() * 0x100000000) >>> 0): ISkillBattleState {
        const save = this.requireSave();
        if (this.active) throw new Error("当前秘境尚未结束");
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("随机种子无效");
        const profile = save.profile, setup = this.config.encounters[0];
        if (save.run) save.history = save.history.concat(save.run.report).slice(-20);
        const runId = `${profile.profileId}_run_${profile.nextRunIndex++}`;
        let rngState = seed;
        const random = () => {
            rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
            return rngState / 0x100000000;
        };
        const build = this.config.build ? ExpeditionBuildUtils.create(this.config.build, random) : undefined;
        const map = this.config.map ? ExpeditionMapUtils.createState(this.config.map) : undefined;
        const carry: ISkillBattleCarry = {
            playerHp: setup.playerMaxHp, playerMaxHp: setup.playerMaxHp, weaponId: profile.weaponId,
            weaponDurability: profile.weaponDurability, pouchSlots: profile.pouchSlots, upgradeIds: [],
        };
        const state = Rules.startBattle(setup, `${runId}_battle_1`, carry);
        const report = ExpeditionStatsUtils.create({ runId, seed, battle: state });
        if (map) report.battles = [];
        save.run = { runId, seed, rngState, encounterIndex: 0, phase: map ? "map" : "battle",
            loot: [], upgradeIds: [], pendingUpgradeChoices: [], settled: false, battle: state,
            report,
            allowedUpgradeIds: this.config.upgrades.filter(row => !row.requiredCollectionId ||
                profile.collectionIds.includes(row.requiredCollectionId)).map(row => row.id), build, map };
        profile.pouchSlots = [null, null, null, null, null];
        this.commit(save);
        this.battle.restore(setup, state);
        return this.battle.state!;
    }

    chooseStartingSkill(skillId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run || !run.build || !["map", "battle"].includes(run.phase) || run.battle.revision !== 0)
            throw new Error("当前不是起始借法阶段");
        run.build = ExpeditionBuildUtils.chooseStartingSkill(run.build, skillId, this.config.build!);
        this.commit(save);
        this.battle.restore(this.setup, run.battle);
    }

    borrowActive(skillId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        run.build = ExpeditionBuildUtils.borrowActive(run.build, skillId, this.config.build!);
        this.commit(save);
        this.battle.restore(this.setup, run.battle);
    }

    activeCandidates(): number[] {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        if (run.build.pendingActiveCandidateIds.length) return run.build.pendingActiveCandidateIds.slice();
        const candidates = ExpeditionBuildUtils.activeCandidates(run.build, this.config.build!, () => {
            run.rngState = (Math.imul(run.rngState, 1664525) + 1013904223) >>> 0;
            return run.rngState / 0x100000000;
        });
        run.build = { ...run.build, pendingActiveCandidateIds: candidates };
        this.commit(save);
        return candidates.slice();
    }

    claimActiveCandidate(skillId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled || !run.build.pendingActiveCandidateIds.includes(skillId))
            throw new Error("该主动不在当前借法候选中");
        run.build = {
            ...ExpeditionBuildUtils.borrowActive(run.build, skillId, this.config.build!),
            pendingActiveCandidateIds: [],
        };
        this.commit(save);
        this.battle.restore(this.setup, run.battle);
    }

    replaceActive(oldSkillId: number, newSkillId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        if (!run.build.pendingActiveCandidateIds.includes(newSkillId))
            throw new Error("该主动不在当前借法候选中");
        run.build = ExpeditionBuildUtils.replaceActive(run.build, oldSkillId, newSkillId, this.config.build!);
        run.build.pendingActiveCandidateIds = [];
        this.commit(save);
        this.battle.restore(this.setup, run.battle);
    }

    skipActiveChoice(): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        run.build = ExpeditionBuildUtils.skipActiveChoice(run.build);
        this.commit(save);
    }

    strengthenActive(skillId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        run.build = ExpeditionBuildUtils.strengthen(run.build, skillId, this.config.build!);
        this.commit(save);
        this.battle.restore(this.setup, run.battle);
    }

    awardDaoyun(amount: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        run.build = ExpeditionBuildUtils.awardDaoyun(run.build, amount, this.config.build!);
        this.commit(save);
    }

    passiveCandidates(): number[] {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        if (run.build.pendingPassiveCandidateIds.length) return run.build.pendingPassiveCandidateIds.slice();
        const next = ExpeditionBuildUtils.passiveCandidates(run.build, this.config.build!, () => {
            run.rngState = (Math.imul(run.rngState, 1664525) + 1013904223) >>> 0;
            return run.rngState / 0x100000000;
        });
        run.build = { ...run.build, pendingPassiveCandidateIds: next };
        this.commit(save);
        return next.slice();
    }

    claimPassive(passiveId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run?.build || run.settled) throw new Error("当前没有可用构筑");
        run.build = ExpeditionBuildUtils.claimPassive(run.build, passiveId, this.config.build!);
        this.commit(save);
    }

    chooseUpgrade(upgradeId: number): void {
        const save = this.requireSave(), run = save.run;
        if (!run || run.phase !== "reward" || run.settled ||
            !run.pendingUpgradeChoices.includes(upgradeId) || run.upgradeIds.includes(upgradeId))
            throw new Error("该强化不可领取或已领取");
        run.upgradeIds.push(upgradeId);
        const choice = run.report.choices[run.report.choices.length - 1];
        choice.selectedId = upgradeId;
        run.pendingUpgradeChoices = [];
        run.phase = "decision";
        this.commit(save);
    }

    continueNext(): ISkillBattleState {
        const save = this.requireSave(), run = save.run;
        if (run?.map) {
            this.returnToMap();
            return this.battle.state!;
        }
        if (!run || run.phase !== "decision" || run.settled || run.encounterIndex >= 2)
            throw new Error("选择强化后才能进入下一战");
        const previous = run.battle;
        const setup = this.config.encounters[++run.encounterIndex];
        const state = Rules.startBattle(setup, `${run.runId}_battle_${run.encounterIndex + 1}`, {
            playerHp: previous.player.hp, playerMaxHp: previous.player.maxHp, weaponId: previous.weaponId,
            weaponDurability: previous.weaponDurability, pouchSlots: previous.pouchSlots, upgradeIds: run.upgradeIds,
        });
        run.battle = state;
        run.report.battles.push({ initial: Rules.cloneState(state), actions: [] });
        run.phase = "battle";
        this.commit(save);
        this.battle.restore(setup, state);
        return this.battle.state!;
    }

    mapNode(nodeId: string): IExpeditionMapNode | null {
        if (!this.config.map) return null;
        return ExpeditionData.clone(ExpeditionMapUtils.node(this.config.map, nodeId));
    }

    mapCanEnter(nodeId: string): boolean {
        const run = this.run;
        if (!run?.map || !this.config.map || run.phase !== "map" || run.settled) return false;
        return ExpeditionMapUtils.canMove(this.config.map, run.map, nodeId);
    }

    mapReachableNodes(): string[] {
        const run = this.run;
        if (!run?.map || !this.config.map || run.phase !== "map" || run.settled) return [];
        return this.config.map.nodes.filter(node =>
            node.id !== run.map!.currentNodeId &&
            ExpeditionMapUtils.canMove(this.config.map!, run.map!, node.id)).map(node => node.id);
    }

    mapRemainingMs(now = Date.now()): number {
        const map = this.run?.map;
        return map ? Math.max(0, map.deadlineAt - now) : 0;
    }

    /** Moves to a node and resolves non-combat interactions in one atomic save. */
    enterMapNode(nodeId: string): "battle" | "extract" | "event" | "move" {
        const save = this.requireSave(), run = save.run, map = run?.map, config = this.config.map;
        if (!run || !map || !config || run.settled) throw new Error("当前没有可用地图");
        if (run.phase !== "map") throw new Error("当前不在战外地图阶段");
        if (run.build?.pendingActiveCandidateIds.length || run.build?.pendingPassiveCandidateIds.length)
            throw new Error("请先处理当前借法或参悟候选");
        const target = ExpeditionMapUtils.node(config, nodeId);
        ExpeditionMapUtils.requireRevealed(config, map, nodeId);
        ExpeditionMapUtils.advance(map, nodeId);
        ExpeditionMapUtils.reveal(map, config, target.stage + 1);
        const resolved = map.resolvedIds.includes(nodeId);
        if (["battle", "elite", "boss"].includes(target.type) && !resolved) {
            this.startMapBattle(save, target, map);
            return "battle";
        }
        if (target.type === "extract") {
            this.commit(save);
            return "extract";
        }
        if (resolved) {
            this.commit(save);
            return "move";
        }
        map.resolvedIds.push(nodeId);
        if (target.type === "borrow" && run.build && this.config.build) {
            const candidates = ExpeditionBuildUtils.activeCandidates(run.build, this.config.build, () => {
                run.rngState = (Math.imul(run.rngState, 1664525) + 1013904223) >>> 0;
                return run.rngState / 0x100000000;
            });
            run.build = { ...run.build, pendingActiveCandidateIds: candidates };
        } else if (target.type === "enlightenment" && run.build && this.config.build) {
            const available = this.config.build.passives.filter(passive =>
                !run.build!.passiveIds.includes(passive.id) &&
                (run.build!.schools.includes(passive.school) || passive.school === "universal"));
            if (available.length) {
                run.build = { ...run.build, pendingPassiveChoices: run.build.pendingPassiveChoices + 1 };
                const candidates = ExpeditionBuildUtils.passiveCandidates(run.build, this.config.build, () => {
                    run.rngState = (Math.imul(run.rngState, 1664525) + 1013904223) >>> 0;
                    return run.rngState / 0x100000000;
                });
                run.build = { ...run.build, pendingPassiveCandidateIds: candidates };
            }
        } else if (target.type === "search" && run.loot.length < 6) {
            run.rngState = (Math.imul(run.rngState, 1664525) + 1013904223) >>> 0;
            const loot = this.config.loot[Math.floor(run.rngState / 0x100000000 * this.config.loot.length)];
            if (loot) run.loot.push({ itemUid: `${run.runId}_search_${nodeId}`, itemId: loot.itemId });
        } else if (target.type === "recovery") {
            const maximum = run.battle.player.maxHp;
            if (run.battle.player.hp >= maximum) throw new Error("生命已满，无需使用恢复点");
            const hpBefore = run.battle.player.hp;
            run.battle.player.hp = Math.min(maximum, run.battle.player.hp +
                Math.ceil(maximum * config.recoveryRate));
            run.report.recoveries.push({ nodeId, battleIndex: run.report.battles.length - 1,
                hpBefore, hpAfter: run.battle.player.hp });
        }
        this.commit(save);
        this.battle.restore(this.setup, run.battle);
        return "event";
    }

    returnToMap(): IExpeditionMapState {
        const save = this.requireSave(), run = save.run;
        if (!run?.map || run.settled) throw new Error("当前没有进行中的地图");
        if (run.phase !== "decision") throw new Error("处理完战后奖励后才能返回地图");
        run.phase = "map";
        run.map.battleNodeId = null;
        this.commit(save);
        return ExpeditionData.clone(run.map);
    }

    extractMap(nodeId: string): boolean {
        const save = this.requireSave(), run = save.run, config = this.config.map;
        if (!run?.map || !config || run.settled) throw new Error("当前没有可撤离的地图");
        const target = ExpeditionMapUtils.node(config, nodeId);
        if (target.type !== "extract" || run.map.currentNodeId !== nodeId)
            throw new Error("只有到达撤离点后才能离境");
        this.settle(save, true);
        this.commit(save);
        return true;
    }

    expireMap(now = Date.now()): boolean {
        const save = this.requireSave(false), run = save.run;
        if (!run?.map || run.settled || now < run.map.deadlineAt) return false;
        this.settle(save, false);
        run.report.endReason = "timeout";
        this.commit(save);
        return true;
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
        if (config.useType !== "currency") throw new Error("残卷需要收藏，不能作为灵石袋打开");
        const currency = save.profile.currency + config.currencyValue;
        if (!Number.isSafeInteger(currency)) throw new Error("灵石数量超过上限");
        save.profile.warehouse.splice(index, 1);
        save.profile.currency = currency;
        this.commit(save);
        return config.currencyValue;
    }

    collectLoot(itemUid: string): number {
        const save = this.requireSave();
        if (this.active) throw new Error("只能在据点收藏残卷");
        const index = save.profile.warehouse.findIndex(item => item.itemUid === itemUid);
        if (index < 0) throw new Error("物品已使用或不存在");
        const loot = this.config.loot.find(row => row.itemId === save.profile.warehouse[index].itemId)!;
        if (loot.useType !== "collection") throw new Error("该物品不可收藏");
        if (save.profile.collectionIds.includes(loot.collectionId)) throw new Error("已经收藏，重复残卷保留在仓库");
        save.profile.warehouse.splice(index, 1);
        save.profile.collectionIds.push(loot.collectionId);
        const reports = save.history.concat(save.run ? [save.run.report] : []);
        const source = reports.find(report => report.broughtLoot.some(item => item.itemUid === itemUid));
        if (source) source.collectionUnlockIds.push(loot.collectionId);
        this.commit(save);
        return loot.collectionId;
    }

    resetTestProfile(): void {
        const save = this.createTestProfile();
        ExpeditionSaveUtils.validate(save, this.config, this.signature);
        this.storage.write(JSON.stringify(save));
        this.data.snapshot = save;
        this.data.error = "";
        this.battle.reset();
    }

    private commitBattle(state: ISkillBattleState, action: ISkillBattleAction): void {
        const save = this.requireSave(), run = save.run;
        if (!run || run.settled || run.phase !== "battle" || run.battle.battleId !== state.battleId ||
            run.battle.revision + 1 !== state.revision) throw new Error("战斗与秘境存档不同步，请重新载入");
        if (this.config.requireBuildSelection && run.build && !run.build.activeSkills.length) throw new Error("请先完成起始借法选择");
        run.battle = Rules.cloneState(state);
        run.report.battles[run.report.battles.length - 1].actions.push({ ...action });
        if (state.phase === "defeat") this.settle(save, false);
        else if (state.phase === "victory") {
            const reward = this.config.rewards[run.encounterIndex] || [];
            reward.forEach((itemId, index) => {
                if (run.loot.length >= 6) return;
                run.loot.push({
                    itemUid: `${run.runId}_loot_${run.map ? `map_${run.map.battleCount}` : run.encounterIndex}_${index}`,
                    itemId,
                });
            });
            if (run.map) {
                const nodeId = run.map.battleNodeId;
                const node = nodeId && this.config.map
                    ? ExpeditionMapUtils.node(this.config.map, nodeId) : null;
                if (node && !run.map.resolvedIds.includes(node.id)) run.map.resolvedIds.push(node.id);
                if (node) ExpeditionMapUtils.reveal(run.map, this.config.map!, node.stage + 1);
                run.pendingUpgradeChoices = this.createChoices(run);
                run.report.choices.push({ encounterIndex: run.encounterIndex,
                    battleIndex: run.map.battleCount - 1,
                    ids: run.pendingUpgradeChoices.slice(), selectedId: null });
                run.phase = run.pendingUpgradeChoices.length ? "reward" : "decision";
            } else if (run.encounterIndex === 2) this.settle(save, true);
            else {
                run.pendingUpgradeChoices = this.createChoices(run);
                run.report.choices.push({ encounterIndex: run.encounterIndex,
                    ids: run.pendingUpgradeChoices.slice(), selectedId: null });
                run.phase = run.pendingUpgradeChoices.length ? "reward" : "decision";
            }
        }
        this.commit(save);
    }

    private startMapBattle(save: IExpeditionSave, node: IExpeditionMapNode, map: IExpeditionMapState): void {
        const run = save.run!, setup = this.config.encounters[node.encounterIndex ?? 0];
        const previous = run.battle;
        map.battleNodeId = node.id;
        map.battleCount++;
        run.encounterIndex = node.encounterIndex ?? 0;
        const state = Rules.startBattle(setup, `${run.runId}_map_battle_${map.battleCount}`, {
            playerHp: previous.player.hp, playerMaxHp: previous.player.maxHp,
            weaponId: previous.weaponId, weaponDurability: previous.weaponDurability,
            pouchSlots: previous.pouchSlots, upgradeIds: run.upgradeIds,
        });
        run.battle = state;
        run.report.battles.push({ initial: Rules.cloneState(state), actions: [] });
        run.phase = "battle";
        this.commit(save);
        this.battle.restore(this.setup, state);
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
        run.report.outcome = success ? "extracted" : "failed";
        run.report.endReason = success ? "extracted" : "defeat";
        run.report.exitEncounter = run.map ? run.map.battleCount : run.encounterIndex + 1;
        run.report.broughtLoot = success ? run.loot.map(item => ({ ...item })) : [];
        run.report.remainingPouch = success ? run.battle.pouchSlots.map(item => item ? { ...item } : null)
            : [null, null, null, null, null];
        profile.weaponDurability = run.battle.weaponDurability;
        profile.pouchSlots = success ? run.battle.pouchSlots.map(item => item ? { ...item } : null)
            : [null, null, null, null, null];
        run.loot = [];
        run.upgradeIds = [];
        run.pendingUpgradeChoices = [];
        if (run.build) {
            run.build = {
                ...run.build,
                schools: run.build.schools,
                startCandidates: [],
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
        return { version: 2, configSignature: this.signature, run: null, history: [], profile: {
            profileId, nextRunIndex: 1, currency: 0, collectionIds: [], warehouse: [], weaponId: setup.weaponId,
            weaponDurability: setup.weaponDurability, pouchSlots, settledRunIds: [],
        } };
    }

    private requireSave(checkDeadline = true): IExpeditionSave {
        if (this.data.error || !this.data.snapshot) throw new Error(this.data.error || "没有可用存档");
        if (checkDeadline && this.expireMap()) throw new Error("秘境时间已耗尽，本局已失败");
        return ExpeditionData.clone(this.data.snapshot);
    }

    private commit(save: IExpeditionSave): void {
        ExpeditionSaveUtils.validate(save, this.config, this.signature);
        // Storage must succeed before replacing either authoritative in-memory state.
        this.storage.write(JSON.stringify(save));
        this.data.snapshot = ExpeditionData.clone(save);
    }
}

