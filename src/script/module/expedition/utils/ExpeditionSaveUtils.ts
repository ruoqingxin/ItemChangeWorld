import type { ISkillBattleSetup, ISkillBattleState, ISkillItemInstance } from "../../skillBattle/types/SkillBattleTypes";
import type { IExpeditionConfig, IExpeditionSave } from "../types/ExpeditionTypes";

export class ExpeditionSaveUtils {
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
