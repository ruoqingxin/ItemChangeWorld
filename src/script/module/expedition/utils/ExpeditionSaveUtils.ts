import type { ISkillBattleSetup, ISkillBattleState, ISkillItemInstance } from "../../skillBattle/types/SkillBattleTypes";
import type { IExpeditionConfig, IExpeditionSave, IExpeditionReport } from "../types/ExpeditionTypes";
import { ExpeditionStatsUtils } from "./ExpeditionStatsUtils";

export class ExpeditionSaveUtils {
    static upgradeLegacy(save: IExpeditionSave): void {
        if (!save || save.version !== 1) return;
        if (save.history === undefined) save.history = [];
        if (save.run && save.run.report === undefined) {
            // D never stored past actions or brought loot. Do not invent historical measurements.
            const run = save.run, report = ExpeditionStatsUtils.create(run, true);
            if (run.phase === "reward") report.choices.push({
                encounterIndex: run.encounterIndex, ids: run.pendingUpgradeChoices.slice(), selectedId: null,
            });
            if (run.settled) {
                report.outcome = run.phase as "extracted" | "failed";
                report.exitEncounter = run.encounterIndex + 1;
                report.remainingPouch = save.profile.pouchSlots.map(item => item ? { ...item } : null);
            }
            run.report = report;
        }
    }

    static validate(save: IExpeditionSave, config: IExpeditionConfig, signature: string): void {
        const check = (ok: boolean) => { if (!ok) throw new Error("存档结构或状态不一致"); };
        const integer = (value: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
            Number.isSafeInteger(value) && value >= min && value <= max;
        const unique = (values: unknown[]) => Array.isArray(values) && new Set(values).size === values.length;
        check(!!save && save.version === 1 && save.configSignature === signature && !!save.profile);
        const p = save.profile, base = config.encounters[0];
        check(typeof p.profileId === "string" && !!p.profileId && integer(p.nextRunIndex, 1) && integer(p.currency));
        check(p.weaponId === base.weaponId && integer(p.weaponDurability, 0, base.weaponDurability));
        check(unique(p.collectionIds) && p.collectionIds.every(id => config.loot.some(row => row.collectionId === id && id > 0)));
        check(unique(p.settledRunIds) && p.settledRunIds.every(id => typeof id === "string" && !!id));
        const uids = new Set<string>();
        const items = (values: ISkillItemInstance[], allowed: number[]) => {
            check(Array.isArray(values));
            for (const item of values) {
                check(!!item && typeof item.itemUid === "string" && !!item.itemUid &&
                    !uids.has(item.itemUid) && allowed.includes(item.itemId));
                uids.add(item.itemUid);
            }
        };
        const pouch = (values: Array<ISkillItemInstance | null>, track = true) => {
            check(Array.isArray(values) && values.length === 5);
            if (track) items(values.filter(item => item !== null) as ISkillItemInstance[], base.items.map(row => row.itemId));
            else {
                const local = new Set<string>();
                for (const item of values) if (item !== null) {
                    check(!!item && typeof item.itemUid === "string" && !!item.itemUid &&
                        !local.has(item.itemUid) && base.items.some(row => row.itemId === item.itemId));
                    local.add(item.itemUid);
                }
            }
        };
        items(p.warehouse, config.loot.map(row => row.itemId));
        pouch(p.pouchSlots);
        check(Array.isArray(save.history) && save.history.length <= 20 &&
            new Set(save.history.map(report => report.runId)).size === save.history.length);
        for (const report of save.history) {
            this.validateReport(report, config);
            check(p.settledRunIds.includes(report.runId) && report.outcome !== null);
        }
        if (save.run === null) return;
        const r = save.run;
        check(!!r && integer(r.encounterIndex, 0, config.encounters.length - 1) &&
            r.runId === `${p.profileId}_run_${p.nextRunIndex - 1}` &&
            integer(r.seed, 0, 0xffffffff) && integer(r.rngState, 0, 0xffffffff));
        check(["battle", "reward", "decision", "extracted", "failed"].includes(r.phase) &&
            typeof r.settled === "boolean" && r.settled === ["extracted", "failed"].includes(r.phase) &&
            r.settled === p.settledRunIds.includes(r.runId));
        const allowed = config.upgrades.filter(row => !row.requiredCollectionId ||
            p.collectionIds.includes(row.requiredCollectionId)).map(row => row.id);
        check(unique(r.allowedUpgradeIds) && r.allowedUpgradeIds.every(id => allowed.includes(id)) &&
            config.upgrades.filter(row => !row.requiredCollectionId).every(row => r.allowedUpgradeIds.includes(row.id)));
        // A completed run keeps its original pool even if later profile unlocks grow.
        if (!r.settled) check(JSON.stringify(r.allowedUpgradeIds) === JSON.stringify(allowed));
        check(unique(r.upgradeIds) && r.upgradeIds.every(id => allowed.includes(id)));
        check(unique(r.pendingUpgradeChoices) && r.pendingUpgradeChoices.length <= 3 &&
            r.pendingUpgradeChoices.every(id => allowed.includes(id) && !r.upgradeIds.includes(id)));
        check(Array.isArray(r.loot) && r.loot.length <= 6);
        items(r.loot, config.loot.map(row => row.itemId));
        const setup = config.encounters[r.encounterIndex], b = r.battle;
        this.validateBattle(b, setup);
        const reportState = this.validateReport(r.report, config);
        check(r.report.runId === r.runId && r.report.seed === r.seed &&
            JSON.stringify(reportState) === JSON.stringify(b) &&
            r.report.outcome === (r.settled ? r.phase : null) &&
            r.report.exitEncounter === (r.settled ? r.encounterIndex + 1 : null) &&
            !save.history.some(report => report.runId === r.runId));
        if (r.phase === "reward") {
            const choice = r.report.choices[r.report.choices.length - 1];
            check(!!choice && choice.encounterIndex === r.encounterIndex && choice.selectedId === null &&
                JSON.stringify(choice.ids) === JSON.stringify(r.pendingUpgradeChoices));
        }
        check(b.battleId === `${r.runId}_battle_${r.encounterIndex + 1}`);
        pouch(b.pouchSlots, !r.settled);
        if (r.settled) {
            check(r.loot.length === 0 && r.upgradeIds.length === 0 && r.pendingUpgradeChoices.length === 0 &&
                p.weaponDurability === b.weaponDurability &&
                b.phase === (r.phase === "failed" ? "defeat" : "victory"));
            check(r.phase === "failed" ? p.pouchSlots.every(item => item === null)
                : JSON.stringify(p.pouchSlots) === JSON.stringify(b.pouchSlots));
        } else {
            check(p.pouchSlots.every(item => item === null));
            check(b.phase === (r.phase === "battle" ? "player_input" : "victory"));
            check(r.phase === "reward" ? r.pendingUpgradeChoices.length === Math.min(3, allowed.length - r.upgradeIds.length) &&
                r.pendingUpgradeChoices.length > 0 : r.pendingUpgradeChoices.length === 0);
            check(r.encounterIndex < 2 || r.phase === "battle");
            check(r.upgradeIds.length === Math.min(allowed.length, r.encounterIndex + (r.phase === "decision" ? 1 : 0)));
            check(b.upgradeIds.length === Math.min(r.encounterIndex, allowed.length) &&
                b.upgradeIds.every(id => r.upgradeIds.includes(id)));
            const won = r.encounterIndex + (r.phase === "battle" ? 0 : 1);
            const expected = config.rewards.slice(0, won).reduce<number[]>((all, values) => all.concat(values), []);
            check(JSON.stringify(r.loot.map(item => item.itemId)) === JSON.stringify(expected));
        }
    }

    private static validateReport(report: IExpeditionReport, config: IExpeditionConfig): ISkillBattleState {
        const check = (ok: boolean) => { if (!ok) throw new Error("行动记录或统计存档无效"); };
        check(!!report && typeof report.runId === "string" && !!report.runId &&
            Number.isSafeInteger(report.seed) && report.seed >= 0 && report.seed <= 0xffffffff &&
            typeof report.partial === "boolean" && Array.isArray(report.battles) &&
            report.battles.length > 0 && report.battles.length <= 3 &&
            [null, "extracted", "failed"].includes(report.outcome));
        let state: ISkillBattleState;
        let previousOrder = 0;
        for (const record of report.battles) {
            check(!!record && !!record.initial && Array.isArray(record.actions));
            const setup = config.encounters.find(row => row.encounterId === record.initial.encounterId);
            check(!!setup && setup.order > previousOrder &&
                record.initial.battleId === `${report.runId}_battle_${setup.order}`);
            this.validateBattle(record.initial, setup);
            if (!report.partial) check(record.initial.revision === 0 && setup.order === previousOrder + 1);
            if (previousOrder) check(state.phase === "victory" &&
                state.player.hp === record.initial.player.hp &&
                state.weaponDurability === record.initial.weaponDurability &&
                JSON.stringify(state.pouchSlots) === JSON.stringify(record.initial.pouchSlots));
            state = ExpeditionStatsUtils.battle(record, setup).state;
            previousOrder = setup.order;
        }
        check(Array.isArray(report.choices) && report.choices.length <= 2 &&
            new Set(report.choices.map(choice => choice.encounterIndex)).size === report.choices.length);
        for (const choice of report.choices) check(!!choice && [0, 1].includes(choice.encounterIndex) &&
            Array.isArray(choice.ids) && choice.ids.length <= 3 && new Set(choice.ids).size === choice.ids.length &&
            choice.ids.every(id => config.upgrades.some(row => row.id === id)) &&
            (choice.selectedId === null || choice.ids.includes(choice.selectedId)));
        check(Array.isArray(report.broughtLoot) && report.broughtLoot.length <= 6 &&
            new Set(report.broughtLoot.map(item => item.itemUid)).size === report.broughtLoot.length &&
            report.broughtLoot.every(item => !!item && typeof item.itemUid === "string" && !!item.itemUid &&
                config.loot.some(row => row.itemId === item.itemId)));
        check(Array.isArray(report.collectionUnlockIds) &&
            new Set(report.collectionUnlockIds).size === report.collectionUnlockIds.length &&
            report.collectionUnlockIds.every(id => config.loot.some(row => row.collectionId === id && id > 0)));
        check(Array.isArray(report.remainingPouch));
        if (report.outcome === null) check(report.exitEncounter === null && report.broughtLoot.length === 0 &&
            report.remainingPouch.length === 0 && report.collectionUnlockIds.length === 0);
        else {
            check(report.exitEncounter === previousOrder && report.remainingPouch.length === 5 &&
                state.phase === (report.outcome === "extracted" ? "victory" : "defeat"));
            if (report.outcome === "failed") check(report.broughtLoot.length === 0 &&
                report.remainingPouch.every(item => item === null) && report.collectionUnlockIds.length === 0);
            else check(JSON.stringify(report.remainingPouch) === JSON.stringify(state.pouchSlots));
        }
        return state;
    }

    private static validateBattle(b: ISkillBattleState, setup: ISkillBattleSetup): void {
        const check = (ok: boolean) => { if (!ok) throw new Error("战斗存档快照无效"); };
        const int = (n: number, max: number, min = 0) => Number.isSafeInteger(n) && n >= min && n <= max;
        check(!!b && !!b.player && !!b.enemy && b.encounterId === setup.encounterId &&
            b.enemyId === setup.enemy.id && b.weaponId === setup.weaponId &&
            b.player.maxHp === setup.playerMaxHp && b.enemy.maxHp === setup.enemy.maxHp);
        check(int(b.player.hp, b.player.maxHp) && int(b.enemy.hp, b.enemy.maxHp) &&
            int(b.player.block, Number.MAX_SAFE_INTEGER) && int(b.enemy.block, Number.MAX_SAFE_INTEGER));
        check(int(b.revision, Number.MAX_SAFE_INTEGER) && int(b.round, Number.MAX_SAFE_INTEGER, 1) &&
            b.round === b.revision + (b.phase === "player_input" ? 1 : 0));
        check(int(b.swordQi, setup.qiMax) && b.swordQiMax === setup.qiMax &&
            int(b.weaponDurability, setup.weaponDurability) && int(b.enemyBurn, 20) &&
            int(b.enemyIntentIndex, setup.enemy.intents.length - 1));
        check(Array.isArray(b.upgradeIds) && new Set(b.upgradeIds).size === b.upgradeIds.length &&
            b.upgradeIds.every(id => setup.upgrades.some(row => row.id === id)));
        check(b.nextSlashBonus === 0 || setup.upgrades.some(row => row.effect === "interrupt_slash" &&
            row.value === b.nextSlashBonus && b.upgradeIds.includes(row.id)));
        check(b.phase === "player_input" ? b.player.hp > 0 && b.enemy.hp > 0
            : b.phase === "victory" ? b.enemy.hp === 0 && b.player.hp > 0
            : b.phase === "defeat" && b.player.hp === 0 && b.enemy.hp > 0);
        if (b.phase !== "player_input") check(b.swordQi === 0 && b.player.block === 0 &&
            b.enemy.block === 0 && b.enemyBurn === 0 && b.nextSlashBonus === 0);
    }
}
