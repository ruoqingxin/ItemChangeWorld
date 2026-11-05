module.exports = ({ assert, test, setups, tables, Config, Rules, Manager, Presenter, copy, freeze, withTables, build }) => {
    const path = require("node:path");
    const { ExpeditionManager } = require(path.join(build, "script/module/expedition/manager/ExpeditionManager.js"));
    const { ExpeditionConfigUtils } = require(path.join(build, "script/module/expedition/utils/ExpeditionConfigUtils.js"));
    const config = ExpeditionConfigUtils.read(tables);
    const skill = (skillId, stoneItemUid) => ({ type: "skill", skillId, ...(stoneItemUid ? { stoneItemUid } : {}) });
    const upgraded = (ids, encounter = 3) => {
        const state = new Manager().start(setups[encounter - 1]);
        state.upgradeIds = ids.slice();
        return state;
    };
    const resolve = (state, id, uid, setup = setups[state.encounterId - 1]) => {
        const action = skill(id, uid), before = copy(state);
        const result = Rules.resolveAction(setup, freeze(copy(state)), action);
        assert.ok(result.ok, result.reason);
        assert.deepEqual(result, Rules.previewAction(setup, state, action));
        assert.deepEqual(state, before);
        return result;
    };
    const storage = () => ({ value: null, fail: false, writes: 0,
        read() { return this.value; },
        write(value) { if (this.fail) throw new Error("disk full"); this.value = value; this.writes++; },
    });
    const create = (store = storage(), cfg = config) => {
        const battle = new Manager(), expedition = new ExpeditionManager(cfg, battle, store);
        assert.equal(expedition.error, "");
        return { store, battle, expedition, cfg };
    };
    const reload = c => create(c.store, c.cfg);
    const play = (c, id, uid) => {
        const action = skill(id, uid), p = c.battle.previewAction(action);
        assert.ok(p.ok, p.reason);
        const result = c.battle.confirmAction(action, p.preview.token);
        assert.ok(result.ok, result.reason);
        assert.deepEqual(c.expedition.run.battle, c.battle.state);
        return result;
    };
    const choose = c => {
        const choices = c.expedition.run.pendingUpgradeChoices;
        if (choices.length) c.expedition.chooseUpgrade(choices.includes(5) ? 5 : choices[0]);
    };
    const win = c => {
        for (let count = 0; c.battle.state.phase === "player_input" && count < 100; count++) {
            const s = c.battle.state, setup = c.expedition.setup, intent = setup.enemy.intents[s.enemyIntentIndex];
            const candidates = [1, 3, 4].map(id => c.battle.previewAction(skill(id)));
            const lethal = candidates.find(r => r.ok && r.state.phase === "victory");
            const id = lethal ? [1, 3, 4][candidates.indexOf(lethal)]
                : s.swordQi >= 2 ? (intent.interruptible ? 4 : 3) : intent.damage > 0 ? 2 : 1;
            play(c, id);
        }
        assert.equal(c.battle.state.phase, "victory");
    };
    const firstReward = (c = create()) => { c.expedition.startNew(42); win(c); return c; };
    const unchangedOnFailure = (c, fn) => {
        const save = c.expedition.snapshot, battle = c.battle.state, raw = c.store.value, logs = c.battle.logs;
        c.store.fail = true;
        try { fn(); } finally { c.store.fail = false; }
        assert.deepEqual(c.expedition.snapshot, save);
        assert.deepEqual(c.battle.state, battle);
        assert.deepEqual(c.battle.logs, logs);
        assert.equal(c.store.value, raw);
    };

    test("D: exported upgrades, reward groups and loot values exactly match the route", () => {
        assert.deepEqual(config.upgrades.map(r => [r.id, r.value, r.requiredCollectionId]),
            [[1, 3, 0], [2, 4, 0], [3, 1, 1], [4, 6, 1], [5, 11, 0], [6, 1, 0]]);
        assert.deepEqual(config.rewards, [[2701], [2702], [2703, 2704]]);
        assert.deepEqual(config.loot.map(r => r.currencyValue), [15, 25, 40, 0]);
        assert.equal(config.loot[0].name, config.loot[1].name);
    });
    test("D: invalid upgrade kinds and duplicate effects are rejected", () => {
        for (const effect of ["teleport", "counter"]) {
            const changed = withTables({ skill_upgrade: { getDataList: () =>
                tables.skill_upgrade.getDataList().map(row => ({ ...row, effect_kind: effect })) } });
            assert.throws(() => Config.readUpgrades(changed));
        }
    });
    test("D: invalid reward counts, overflow and missing loot references fail before play", () => {
        for (const change of [{ count: 0 }, { count: 7 }, { item_id: 9999 }, { count: 2 }]) {
            const changed = withTables({ skill_reward_entry: { getDataList: () =>
                tables.skill_reward_entry.getDataList().map(row => ({ ...row, ...change })) } });
            assert.throws(() => ExpeditionConfigUtils.read(changed));
        }
    });
    test("D: counter only follows actual guard absorption, grants no extra qi and can win", () => {
        const s = upgraded([1]); s.enemy.hp = 3;
        const result = resolve(s, 2);
        assert.equal(result.preview.counterDamage, 3);
        assert.equal(result.preview.counterHpLoss, 3);
        assert.equal(result.state.phase, "victory");
        assert.equal(result.events.filter(e => e.type === "qi_changed").length, 1);
        assert.equal(result.events.filter(e => e.type === "damage" && e.source === "player").length, 1);
        assert.equal(result.events.filter(e => e.type === "battle_ended").length, 1);
    });
    test("D: counter cannot occur after lethal incoming damage or resurrect the player", () => {
        const s = upgraded([1]); s.player.hp = 6; s.enemy.hp = 3; s.enemyIntentIndex = 2;
        const result = resolve(s, 2);
        assert.equal(result.state.phase, "defeat");
        assert.equal(result.state.enemy.hp, 3);
        assert.equal(result.preview.counterDamage, 0);
    });
    test("D: charge, zero damage, earth shielding and medicine never trigger guard counter", () => {
        const s = upgraded([1], 2); s.enemyIntentIndex = 1;
        assert.equal(resolve(s, 2).preview.counterDamage, 0);
        const zero = copy(setups[1]); zero.enemy.intents[1] = { ...zero.enemy.intents[0], damage: 0 };
        assert.equal(resolve(s, 2, undefined, zero).preview.counterDamage, 0);
        s.enemyIntentIndex = 0;
        assert.equal(resolve(s, 1, s.pouchSlots[1].itemUid).preview.counterDamage, 0);
        s.player.hp = 20;
        const pill = Rules.resolveAction(setups[1], s, { type: "use_item", itemUid: s.pouchSlots[2].itemUid });
        assert.equal(pill.preview.counterDamage, 0);
    });
    test("D: counter uses shield-aware damage without recursively invoking skills", () => {
        const s = upgraded([1]); s.enemy.block = 5;
        const hit = Rules.damage(s, "player", "enemy", 3);
        assert.equal(hit.blockAbsorbed, 3);
        assert.equal(hit.hpLoss, 0);
        assert.equal(s.enemy.block, 2);
        assert.equal(s.swordQi, 0);
    });
    test("D: full-qi slash checks qi before gain, not after", () => {
        const s = upgraded([2]);
        s.swordQi = 2; assert.equal(resolve(s, 1).preview.baseDamage, 6);
        s.swordQi = 3; assert.equal(resolve(s, 1).preview.baseDamage, 10);
        assert.equal(resolve(s, 3).preview.baseDamage, 14);
    });
    test("D: reduced thrust cost affects validation, preview and execution at one qi", () => {
        const s = upgraded([3]); s.swordQi = 1;
        const r = resolve(s, 3);
        assert.equal(r.preview.qiCost, 1);
        assert.equal(r.state.swordQi, 0);
        s.swordQi = 0;
        assert.equal(Rules.resolveAction(setups[2], s, skill(3)).ok, false);
    });
    test("D: interrupt bonus is six, does not stack and is consumed by the next slash", () => {
        let s = upgraded([4]); s.swordQi = 2; s.enemyIntentIndex = 2;
        s = resolve(s, 4).state;
        assert.equal(s.nextSlashBonus, 6);
        s.swordQi = 2; s.enemyIntentIndex = 2;
        s = resolve(s, 4).state;
        assert.equal(s.nextSlashBonus, 6);
        const r = resolve(s, 1);
        assert.equal(r.preview.baseDamage, 12);
        assert.equal(r.state.nextSlashBonus, 0);
        assert.equal(resolve(r.state, 1).preview.baseDamage, 6);
    });
    test("D: ordinary attacks and charge are not successful interrupts", () => {
        const s = upgraded([4], 2); s.swordQi = 2;
        assert.equal(resolve(s, 4).state.nextSlashBonus, 0);
        s.enemyIntentIndex = 1;
        assert.equal(resolve(s, 4).state.nextSlashBonus, 0);
    });
    test("D: slash bonuses combine without amplifying enchant damage", () => {
        const s = upgraded([2, 4]); s.swordQi = 3; s.nextSlashBonus = 6;
        const r = resolve(s, 1, s.pouchSlots[0].itemUid);
        assert.equal(r.preview.baseDamage, 16);
        assert.equal(r.preview.enchantDamage, 6);
        assert.equal(r.state.nextSlashBonus, 0);
    });
    test("D: thick earth changes only guard shield to eleven", () => {
        const s = upgraded([5]); s.enemyIntentIndex = 2;
        const r = resolve(s, 2);
        assert.equal(r.preview.blockGained, 11);
        assert.equal(r.preview.playerHpLoss, 3);
        assert.equal(resolve(s, 1, s.pouchSlots[1].itemUid).preview.blockGained, 4);
    });
    test("D: fire seed adds exactly one burn and respects the twenty-stack cap", () => {
        const s = upgraded([6]);
        const r = resolve(s, 1, s.pouchSlots[0].itemUid);
        assert.equal(r.preview.burnApplied, 3);
        assert.equal(r.preview.burnDamage, 3);
        assert.equal(r.state.enemyBurn, 2);
        s.enemyBurn = 19;
        assert.equal(resolve(s, 1, s.pouchSlots[0].itemUid).preview.burnApplied, 1);
    });
    test("D: new battle clears temporary bonus, shields, burn and qi but retains upgrades", () => {
        const s = upgraded([1, 4]); s.nextSlashBonus = 6;
        const next = Rules.startBattle(setups[2], "next", { playerHp: 29, playerMaxHp: 50,
            weaponId: 1, weaponDurability: 35, pouchSlots: s.pouchSlots, upgradeIds: s.upgradeIds });
        assert.deepEqual(next.upgradeIds, [1, 4]);
        assert.equal(next.nextSlashBonus + next.enemyBurn + next.swordQi + next.player.block + next.enemy.block, 0);
        assert.equal(next.player.hp, 29);
        assert.equal(next.weaponDurability, 35);
    });
    test("D: first profile is initialized once and starting/reloading never duplicates supplies", () => {
        const staleBattle = new Manager(); staleBattle.start(setups[2]);
        new ExpeditionManager(config, staleBattle, storage());
        assert.equal(staleBattle.state, null);
        let c = create();
        const pouch = c.expedition.snapshot.profile.pouchSlots;
        assert.equal(pouch.filter(Boolean).length, 3);
        assert.deepEqual(reload(c).expedition.snapshot.profile.pouchSlots, pouch);
        c.expedition.startNew(42);
        assert.deepEqual(c.battle.state.pouchSlots, pouch);
        assert.deepEqual(c.expedition.run.allowedUpgradeIds, [1, 2, 5, 6]);
        const before = c.expedition.snapshot;
        assert.throws(() => c.expedition.startNew());
        c = reload(c);
        assert.deepEqual(c.expedition.snapshot, before);
        assert.deepEqual(c.battle.state.pouchSlots, pouch);
    });
    test("D: spent supplies and durability survive reload during animation", () => {
        const c = create(); c.expedition.startNew(42);
        const p = new Presenter(c.battle, c.expedition); p.open(setups[0]);
        p.select(1); p.selectPouch(0);
        const r = p.confirm();
        assert.ok(r.ok && p.busy);
        const loaded = reload(c);
        assert.deepEqual(loaded.battle.state, c.battle.state);
        assert.equal(loaded.battle.state.pouchSlots[0], null);
        assert.equal(loaded.battle.state.weaponDurability, 45);
        p.finishPlayback();
        assert.deepEqual(p.display, loaded.battle.state);
    });
    test("D: victory saves loot and actual candidates before any result animation finishes", () => {
        const c = create(); c.expedition.startNew(42);
        for (const id of [1, 1]) play(c, id);
        const p = new Presenter(c.battle, c.expedition); p.open(setups[0]); p.select(3);
        assert.ok(p.confirm().ok && p.busy);
        assert.equal(c.expedition.run.phase, "reward");
        assert.equal(c.expedition.run.loot.length, 1);
        assert.equal(c.expedition.run.pendingUpgradeChoices.length, 3);
        assert.deepEqual(reload(c).expedition.snapshot, c.expedition.snapshot);
        assert.equal(c.expedition.snapshot.profile.currency, 0);
    });
    test("D: same seed gives reproducible choices; reload and reopen do not reroll", () => {
        const a = firstReward(), b = firstReward();
        assert.deepEqual(a.expedition.run.pendingUpgradeChoices, b.expedition.run.pendingUpgradeChoices);
        const before = a.expedition.snapshot;
        const writes = a.store.writes;
        for (let i = 0; i < 5; i++) assert.deepEqual(reload(a).expedition.snapshot, before);
        assert.equal(a.store.writes, writes);
        assert.notEqual(a.expedition.run.rngState, a.expedition.run.seed);
    });
    test("D: candidates are unique, exclude prior selections, and each reward can be chosen once", () => {
        const c = firstReward(), first = c.expedition.run.pendingUpgradeChoices;
        assert.equal(new Set(first).size, 3);
        c.expedition.chooseUpgrade(first[0]);
        const before = c.expedition.snapshot;
        assert.throws(() => c.expedition.chooseUpgrade(first[1]));
        assert.deepEqual(c.expedition.snapshot, before);
        c.expedition.continueNext(); win(c);
        assert.ok(!c.expedition.run.pendingUpgradeChoices.includes(first[0]));
        assert.equal(c.expedition.run.pendingUpgradeChoices.length, 3);
    });
    test("D: pools smaller than three show all remaining choices, including exhaustion", () => {
        for (const length of [0, 1, 2]) {
            const cfg = copy(config);
            cfg.upgrades = cfg.upgrades.filter(r => r.requiredCollectionId === 0).slice(0, length);
            cfg.encounters.forEach(s => { s.upgrades = copy(cfg.upgrades); });
            const c = firstReward(create(storage(), cfg));
            assert.equal(c.expedition.run.pendingUpgradeChoices.length, length);
            choose(c); c.expedition.continueNext(); win(c);
            assert.equal(c.expedition.run.pendingUpgradeChoices.length, Math.max(0, length - 1));
            choose(c); c.expedition.extract();
        }
    });
    test("D: collection filtering is supported without implementing collection consumption", () => {
        const c = create(), save = c.expedition.snapshot;
        save.profile.collectionIds = [1];
        c.store.value = JSON.stringify(save);
        const loaded = reload(c); loaded.expedition.startNew(42);
        assert.deepEqual(loaded.expedition.run.allowedUpgradeIds, [1, 2, 3, 4, 5, 6]);
    });
    test("D: battle and unchosen reward cannot extract or skip the upgrade selection", () => {
        const c = create(); c.expedition.startNew(42);
        assert.throws(() => c.expedition.extract());
        assert.throws(() => c.expedition.continueNext());
        win(c);
        assert.throws(() => c.expedition.extract());
        assert.throws(() => c.expedition.continueNext());
        assert.throws(() => c.expedition.chooseUpgrade(999));
    });
    test("D: first-battle extraction transfers loot once and keeps only remaining supplies", () => {
        const c = create(); c.expedition.startNew(42);
        const initial = c.battle.state; play(c, 1, initial.pouchSlots[0].itemUid); win(c);
        choose(c);
        const loot = c.expedition.run.loot, pouch = c.battle.state.pouchSlots;
        assert.equal(c.expedition.extract(), true);
        assert.equal(c.expedition.extract(), false);
        const save = c.expedition.snapshot;
        assert.deepEqual(save.profile.warehouse, loot);
        assert.deepEqual(save.profile.pouchSlots, pouch);
        assert.equal(save.profile.weaponDurability, 45);
        assert.equal(save.profile.currency, 0);
        assert.equal(save.profile.settledRunIds.length, 1);
        assert.deepEqual(save.run.upgradeIds, []);
        assert.deepEqual(reload(c).expedition.snapshot, save);
    });
    test("D: opening the same bag twice cannot duplicate currency, and same-name amounts differ", () => {
        const c = firstReward(); choose(c); c.expedition.continueNext(); win(c); choose(c);
        const uid = c.expedition.run.loot[0].itemUid;
        assert.throws(() => c.expedition.openLoot(uid));
        c.expedition.extract();
        const loot = c.expedition.snapshot.profile.warehouse;
        assert.equal(c.expedition.openLoot(loot[0].itemUid), 15);
        assert.throws(() => c.expedition.openLoot(loot[0].itemUid));
        assert.equal(c.expedition.openLoot(loot[1].itemUid), 25);
        assert.equal(reload(c).expedition.snapshot.profile.currency, 40);
    });
    test("D: continuing commits the next battle and cannot return to the prior extraction screen", () => {
        const c = firstReward(); choose(c);
        const old = c.battle.state;
        const next = c.expedition.continueNext();
        assert.equal(next.player.hp, old.player.hp);
        assert.deepEqual(next.pouchSlots, old.pouchSlots);
        assert.equal(next.swordQi, 0);
        assert.deepEqual(next.upgradeIds, c.expedition.run.upgradeIds);
        assert.throws(() => c.expedition.extract());
        assert.throws(() => c.expedition.continueNext());
        assert.equal(reload(c).expedition.run.phase, "battle");
        assert.equal(c.battle.confirmAction(skill(1), { battleId: old.battleId, revision: old.revision }).ok, false);
    });
    test("D: full three-battle route extracts automatically with four independent loot items", () => {
        const c = firstReward(); choose(c); c.expedition.continueNext(); win(c);
        choose(c); c.expedition.continueNext(); win(c);
        const s = c.expedition.snapshot;
        assert.equal(s.run.phase, "extracted");
        assert.equal(s.run.settled, true);
        assert.deepEqual(s.run.pendingUpgradeChoices, []);
        assert.deepEqual(s.run.upgradeIds, []);
        assert.deepEqual(s.profile.warehouse.map(r => r.itemId), [2701, 2702, 2703, 2704]);
        assert.equal(new Set(s.profile.warehouse.map(r => r.itemUid)).size, 4);
        assert.equal(c.expedition.extract(), false);
        assert.deepEqual(reload(c).expedition.snapshot, s);
        for (const item of s.profile.warehouse.slice(0, 3)) c.expedition.openLoot(item.itemUid);
        assert.equal(c.expedition.snapshot.profile.currency, 80);
        assert.throws(() => c.expedition.openLoot(s.profile.warehouse[3].itemUid), /阶段 E/);
        assert.equal(c.expedition.snapshot.profile.warehouse.length, 1);
        assert.deepEqual(c.expedition.snapshot.profile.collectionIds, []);
    });
    test("D: second-battle defeat loses earlier loot and all pouch supplies, not sword wear", () => {
        const c = create(); c.expedition.startNew(42);
        const initial = c.battle.state;
        play(c, 1, initial.pouchSlots[0].itemUid); win(c);
        c.expedition.chooseUpgrade(c.expedition.run.pendingUpgradeChoices.find(id => id !== 1));
        c.expedition.continueNext();
        while (c.battle.state.phase === "player_input") play(c, 2);
        const save = c.expedition.snapshot;
        assert.equal(save.run.phase, "failed");
        assert.equal(save.run.loot.length, 0);
        assert.equal(save.profile.warehouse.length, 0);
        assert.equal(save.profile.weaponId, 1);
        assert.equal(save.profile.weaponDurability, 45);
        assert.deepEqual(save.profile.pouchSlots, [null, null, null, null, null]);
        assert.equal(save.profile.settledRunIds.length, 1);
        assert.equal(c.expedition.extract(), false);
        assert.deepEqual(reload(c).expedition.snapshot, save);
        const next = c.expedition.startNew(43);
        assert.equal(next.player.hp, 50);
        assert.equal(next.weaponDurability, 45);
        assert.equal(next.pouchSlots.filter(Boolean).length, 0);
        assert.deepEqual(next.upgradeIds, []);
    });
    test("D: failure preserves previously banked currency, inventory and collection flags", () => {
        let c = firstReward(); choose(c); c.expedition.extract();
        const saved = c.expedition.snapshot;
        saved.profile.warehouse.push({ itemUid: "previously-banked-scroll", itemId: 2704 });
        saved.profile.collectionIds = [1];
        c.store.value = JSON.stringify(saved);
        c = reload(c);
        c.expedition.openLoot(c.expedition.snapshot.profile.warehouse[0].itemUid);
        c.expedition.startNew(43);
        win(c);
        c.expedition.chooseUpgrade(c.expedition.run.pendingUpgradeChoices.find(id => id !== 1));
        c.expedition.continueNext();
        while (c.battle.state.phase === "player_input") play(c, 2);
        assert.equal(c.expedition.snapshot.profile.currency, 15);
        assert.deepEqual(c.expedition.snapshot.profile.warehouse, [{ itemUid: "previously-banked-scroll", itemId: 2704 }]);
        assert.deepEqual(c.expedition.snapshot.profile.collectionIds, [1]);
        assert.equal(c.expedition.run.phase, "failed");
    });
    test("D: successive runs and explicit profile resets never reuse battle or supply UIDs", () => {
        const c = firstReward(); const battleId = c.battle.state.battleId;
        const pouch = c.battle.state.pouchSlots;
        choose(c); c.expedition.extract(); c.expedition.startNew(42);
        assert.notEqual(c.battle.state.battleId, battleId);
        assert.deepEqual(c.battle.state.pouchSlots, pouch);
        c.expedition.resetTestProfile(); c.expedition.startNew(42);
        assert.notEqual(c.battle.state.battleId, battleId);
        assert.notEqual(c.battle.state.pouchSlots[0].itemUid, pouch[0].itemUid);
    });
    test("D: failed action save rolls back damage, costs, logs, loot and RNG atomically", () => {
        const c = create(); c.expedition.startNew(42);
        const action = skill(1, c.battle.state.pouchSlots[0].itemUid);
        const token = c.battle.previewAction(action).preview.token;
        unchangedOnFailure(c, () => assert.equal(c.battle.confirmAction(action, token).ok, false));
        assert.ok(c.battle.confirmAction(action, token).ok);
        play(c, 1);
        const finishing = skill(1), lastToken = c.battle.previewAction(finishing).preview.token;
        unchangedOnFailure(c, () => assert.equal(c.battle.confirmAction(finishing, lastToken).ok, false));
        assert.ok(c.battle.confirmAction(finishing, lastToken).ok);
        assert.equal(c.expedition.run.loot.length, 1);
    });
    test("D: failed new-run, upgrade, continuation, extraction and bag writes leave state unchanged", () => {
        const c = create();
        unchangedOnFailure(c, () => assert.throws(() => c.expedition.startNew(42)));
        c.expedition.startNew(42); win(c);
        unchangedOnFailure(c, () => assert.throws(() => choose(c)));
        choose(c);
        unchangedOnFailure(c, () => assert.throws(() => c.expedition.continueNext()));
        unchangedOnFailure(c, () => assert.throws(() => c.expedition.extract()));
        c.expedition.extract();
        const uid = c.expedition.snapshot.profile.warehouse[0].itemUid;
        unchangedOnFailure(c, () => assert.throws(() => c.expedition.openLoot(uid)));
    });
    test("D: final victory and failure settlement are part of the same atomic action save", () => {
        const c = firstReward(); choose(c); c.expedition.continueNext(); win(c);
        choose(c); c.expedition.continueNext();
        while (c.battle.state.phase === "player_input") {
            const s = c.battle.state, intent = c.expedition.setup.enemy.intents[s.enemyIntentIndex];
            const id = s.swordQi >= 2 ? intent.interruptible ? 4 : 3 : intent.damage ? 2 : 1;
            const action = skill(id), result = c.battle.previewAction(action);
            if (result.state.phase === "victory") {
                unchangedOnFailure(c, () => assert.equal(c.battle.confirmAction(action, result.preview.token).ok, false));
                assert.equal(c.expedition.snapshot.profile.warehouse.length, 0);
                play(c, id); break;
            }
            play(c, id);
        }
        assert.equal(c.expedition.snapshot.profile.warehouse.length, 4);
        const fail = firstReward();
        fail.expedition.chooseUpgrade(fail.expedition.run.pendingUpgradeChoices.find(id => id !== 1));
        fail.expedition.continueNext();
        while (fail.battle.previewAction(skill(2)).state.phase !== "defeat") play(fail, 2);
        const token = fail.battle.previewAction(skill(2)).preview.token;
        unchangedOnFailure(fail, () => assert.equal(fail.battle.confirmAction(skill(2), token).ok, false));
        assert.equal(fail.expedition.run.settled, false);
        play(fail, 2);
        assert.equal(fail.expedition.run.settled, true);
    });
    test("D: malformed, incompatible and inconsistent saves remain untouched and block play", () => {
        const c = firstReward(), original = c.expedition.snapshot;
        const variants = ["{broken", ...[
            s => { s.version = 99; }, s => { s.configSignature = "changed"; },
            s => { s.run.rngState = -1; }, s => { s.run.phase = "battle"; },
            s => { s.run.pendingUpgradeChoices = [1, 1]; },
            s => { s.run.battle.player.hp = 100; },
            s => { s.run.loot[0].itemUid = s.run.battle.pouchSlots[0].itemUid; },
            s => { s.profile.currency = -1; }, s => { s.run.settled = true; },
            s => { s.run.battle.phase = "resolving"; },
        ].map(change => { const value = copy(original); change(value); return JSON.stringify(value); })];
        for (const raw of variants) {
            const store = storage(); store.value = raw;
            const e = new ExpeditionManager(config, new Manager(), store);
            assert.ok(e.error);
            assert.equal(store.value, raw);
            assert.equal(store.writes, 0);
            assert.throws(() => e.startNew());
            e.resetTestProfile();
            assert.equal(e.error, "");
            assert.equal(e.snapshot.run, null);
        }
    });
    test("D: unavailable storage blocks initialization without pretending progress was saved", () => {
        const store = storage(); store.fail = true;
        const e = new ExpeditionManager(config, new Manager(), store);
        assert.ok(e.error);
        assert.equal(e.snapshot, null);
        assert.throws(() => e.startNew());
        assert.throws(() => e.resetTestProfile());
        store.fail = false; e.resetTestProfile();
        assert.equal(e.error, "");
    });
    test("D: returned run/profile/config objects cannot mutate owned state", () => {
        const c = firstReward(), before = c.expedition.snapshot;
        c.expedition.run.pendingUpgradeChoices.length = 0;
        c.expedition.snapshot.profile.currency = 999;
        c.expedition.configuration.upgrades[0].value = 999;
        c.expedition.setup.enemy.maxHp = 999;
        assert.deepEqual(c.expedition.snapshot, before);
    });
};
