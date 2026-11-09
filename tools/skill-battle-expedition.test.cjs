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

    test("F: phase two build state persists schools, start choices, strengthening and daoyun", () => {
        const buildConfig = {
            schools: ["sword", "earth", "universal"],
            skills: [
                { id: 1, name: "剑一", school: "sword" },
                { id: 2, name: "剑二", school: "sword" },
                { id: 3, name: "土一", school: "earth" },
                { id: 4, name: "土二", school: "earth" },
            ],
            passives: [
                { id: 301, name: "厚垒", school: "earth" },
                { id: 302, name: "砾锋", school: "earth" },
                { id: 303, name: "剑心", school: "sword" },
                { id: 304, name: "通用韧性", school: "universal" },
            ],
        };
        const cfg = { ...config, build: buildConfig };
        const c = create(storage(), cfg);
        c.expedition.startNew(42);
        const first = c.expedition.build;
        assert.ok(first && first.schools.length === 2);
        assert.equal(first.startCandidates.length, 3);
        const selected = first.startCandidates[0];
        c.expedition.chooseStartingSkill(selected);
        assert.ok(c.expedition.setup.skills.length > 0);
        c.expedition.borrowActive(first.startCandidates[1]);
        const skipped = c.expedition.activeCandidates();
        assert.ok(skipped.length);
        c.expedition.skipActiveChoice();
        assert.throws(() => c.expedition.skipActiveChoice());
        c.expedition.strengthenActive(selected);
        const replacement = c.expedition.activeCandidates()[0];
        c.expedition.replaceActive(selected, replacement);
        assert.throws(() => c.expedition.replaceActive(replacement, first.startCandidates[2]));
        c.expedition.awardDaoyun(70);
        assert.equal(c.expedition.build.activeSkills.length, 2);
        assert.equal(c.expedition.build.activeSkills.find(skill => skill.skillId === replacement).level, 1);
        assert.equal(c.expedition.build.daoyun, 0);
        assert.equal(c.expedition.build.pendingPassiveChoices, 2);
        const passiveCandidates = c.expedition.passiveCandidates();
        assert.ok(passiveCandidates.length >= 1 && passiveCandidates.length <= 3);
        c.expedition.claimPassive(passiveCandidates[0]);
        assert.equal(c.expedition.build.passiveIds.length, 1);
        const saved = c.expedition.build;
        const restored = reload(c).expedition.build;
        assert.deepEqual(restored, saved);
    });

    test("F: retained legacy build scaffold starts with one combat skill (not the new trial entry)", () => {
        const formal = ExpeditionConfigUtils.read(tables, true);
        assert.ok(formal.build);
        assert.deepEqual(formal.build.schools, ["sword", "earth", "universal"]);
        assert.ok(formal.build.skills.length >= 4);
        assert.ok(formal.build.skills.some(skill => skill.school === "sword"));
        assert.ok(formal.build.skills.some(skill => skill.school === "earth"));
        assert.ok(formal.build.passives.length >= 3);
        for (const skill of formal.build.skills)
            assert.ok(formal.encounters.every(encounter => encounter.skills.some(row => row.id === skill.id)));
        const c = create(storage(), { ...formal, requireBuildSelection: true });
        c.expedition.startNew(42);
        const candidates = c.expedition.build.startCandidates;
        assert.equal(candidates.length, 3);
        const battleBeforeChoice = c.battle.state;
        c.expedition.chooseStartingSkill(candidates[0]);
        assert.deepEqual(c.expedition.setup.skills.map(skill => skill.id), [candidates[0]]);
        assert.deepEqual(c.battle.state, battleBeforeChoice);
        assert.equal(c.expedition.build.activeSkills[0].level, 0);
    });

    test("F: missing build skill definitions block initialization without touching the save", () => {
        const store = storage();
        store.value = "existing save";
        const cfg = { ...config, build: { schools: ["sword", "earth"],
            skills: [{ id: 99999, name: "missing", school: "sword" }], passives: [] } };
        const expedition = new ExpeditionManager(cfg, new Manager(), store);
        assert.match(expedition.error, /缺少战斗定义/);
        assert.equal(store.value, "existing save");
        assert.equal(store.writes, 0);
    });

    test("F: retired saves are purged while current saves and other applications survive", () => {
        const { ExpeditionLocalStorage } = require(path.join(build, "script/module/expedition/data/ExpeditionData.js"));
        const original = global.window;
        const values = new Map([
            ["nowchange.skill-expedition.v1", "old"],
            ["nowchange.skill-expedition.new-rules.v4", "old"],
            [ExpeditionLocalStorage.key, "current"],
            ["other-application", "keep"],
        ]);
        global.window = { localStorage: {
            get length() { return values.size; },
            key(index) { return [...values.keys()][index]; },
            getItem(key) { return values.has(key) ? values.get(key) : null; },
            setItem(key, value) { values.set(key, value); },
            removeItem(key) { values.delete(key); },
        } };
        try {
            const current = new ExpeditionLocalStorage();
            assert.equal(current.read(), "current");
            assert.equal(values.size, 2);
            assert.equal(values.get("other-application"), "keep");
            current.write("new");
            assert.equal(new ExpeditionLocalStorage().read(), "new");
        } finally {
            if (original === undefined) delete global.window;
            else global.window = original;
        }
    });

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
        assert.equal(loaded.battle.state.weaponDurability, 44);
        p.finishPlayback();
        assert.deepEqual(p.display, loaded.battle.state);
    });
    test("D: reopening the start screen restores setup before displaying an active battle", () => {
        const c = create(); c.expedition.startNew(42);
        const resumed = reload(c);
        const p = new Presenter(resumed.battle, resumed.expedition);
        p.open(resumed.expedition.setup);
        p.finishPlayback();
        assert.equal(p.setup.enemy.id, setups[0].enemy.id);
        assert.deepEqual(p.display, resumed.battle.state);
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
        assert.equal(save.profile.weaponDurability, 42);
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
        assert.throws(() => c.expedition.openLoot(s.profile.warehouse[3].itemUid), /需要收藏/);
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
        assert.equal(save.profile.weaponDurability, 11);
        assert.deepEqual(save.profile.pouchSlots, [null, null, null, null, null]);
        assert.equal(save.profile.settledRunIds.length, 1);
        assert.equal(c.expedition.extract(), false);
        assert.deepEqual(reload(c).expedition.snapshot, save);
        const next = c.expedition.startNew(43);
        assert.equal(next.player.hp, 50);
        assert.equal(next.weaponDurability, 11);
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
    const { ExpeditionStatsUtils: Stats } = require(path.join(build, "script/module/expedition/utils/ExpeditionStatsUtils.js"));
    const stats = c => c.expedition.run.report.battles.map(record =>
        Stats.battle(record, config.encounters.find(setup => setup.encounterId === record.initial.encounterId)));
    const complete = () => {
        const c = firstReward(); choose(c); c.expedition.continueNext(); win(c);
        choose(c); c.expedition.continueNext(); win(c);
        return c;
    };
    test("E: extracted scroll is consumed atomically and only subsequent runs get the expanded pool", () => {
        const c = complete(), scroll = c.expedition.snapshot.profile.warehouse.find(item => item.itemId === 2704);
        const oldPool = c.expedition.run.allowedUpgradeIds, oldChoices = copy(c.expedition.run.report.choices);
        assert.equal(c.expedition.collectLoot(scroll.itemUid), 1);
        assert.deepEqual(c.expedition.snapshot.profile.collectionIds, [1]);
        assert.equal(c.expedition.snapshot.profile.warehouse.length, 3);
        assert.deepEqual(c.expedition.run.allowedUpgradeIds, oldPool);
        assert.deepEqual(c.expedition.run.report.choices, oldChoices);
        assert.deepEqual(c.expedition.run.report.collectionUnlockIds, [1]);
        assert.throws(() => c.expedition.collectLoot(scroll.itemUid), /不存在/);
        const loaded = reload(c);
        assert.deepEqual(loaded.expedition.snapshot, c.expedition.snapshot);
        loaded.expedition.startNew(11); win(loaded);
        assert.deepEqual(loaded.expedition.run.allowedUpgradeIds, [1, 2, 3, 4, 5, 6]);
        assert.ok(loaded.expedition.run.pendingUpgradeChoices.some(id => id === 3 || id === 4));
        assert.deepEqual(loaded.expedition.snapshot.history[0].collectionUnlockIds, [1]);
    });
    test("E: duplicate scrolls stay in warehouse and repeated collection makes no write", () => {
        const c = complete(), save = c.expedition.snapshot;
        save.profile.warehouse.push({ itemUid: "second-scroll", itemId: 2704 });
        c.store.value = JSON.stringify(save);
        const loaded = reload(c), first = save.profile.warehouse.find(item => item.itemId === 2704);
        loaded.expedition.collectLoot(first.itemUid);
        const before = loaded.expedition.snapshot, writes = loaded.store.writes;
        for (let i = 0; i < 3; i++) assert.throws(() => loaded.expedition.collectLoot("second-scroll"), /已经收藏/);
        assert.deepEqual(loaded.expedition.snapshot, before);
        assert.equal(loaded.store.writes, writes);
        assert.ok(reload(loaded).expedition.snapshot.profile.warehouse.some(item => item.itemUid === "second-scroll"));
    });
    test("E: a scroll collected after another run attributes the unlock to its archived source", () => {
        const c = complete(), uid = c.expedition.snapshot.profile.warehouse[3].itemUid;
        c.expedition.startNew(11); win(c); choose(c); c.expedition.extract();
        c.expedition.collectLoot(uid);
        const save = c.expedition.snapshot;
        assert.deepEqual(save.history[0].collectionUnlockIds, [1]);
        assert.deepEqual(save.run.report.collectionUnlockIds, []);
        assert.deepEqual(save.run.allowedUpgradeIds, [1, 2, 5, 6]);
        assert.deepEqual(reload(c).expedition.snapshot, save);
        c.expedition.resetTestProfile();
        assert.deepEqual(c.expedition.snapshot.history, []);
        assert.deepEqual(c.expedition.snapshot.profile.collectionIds, []);
    });
    test("E: both newly unlocked choices can be selected, persisted and carried into battle two", () => {
        for (const id of [3, 4]) {
            const c = complete(), uid = c.expedition.snapshot.profile.warehouse[3].itemUid;
            c.expedition.collectLoot(uid); c.expedition.startNew(11); win(c);
            assert.deepEqual(c.expedition.run.pendingUpgradeChoices, [2, 3, 4]);
            c.expedition.chooseUpgrade(id); c.expedition.continueNext();
            const loaded = reload(c);
            assert.deepEqual(loaded.battle.state.upgradeIds, [id]);
            assert.deepEqual(loaded.expedition.run.report.choices[0], {
                encounterIndex: 0, ids: [2, 3, 4], selectedId: id,
            });
        }
    });
    test("E: active runs, currency bags and missing instances cannot be collected", () => {
        const c = complete(), items = c.expedition.snapshot.profile.warehouse;
        assert.throws(() => c.expedition.collectLoot(items[0].itemUid), /不可收藏/);
        assert.throws(() => c.expedition.collectLoot("missing"), /不存在/);
        c.expedition.startNew(42);
        const before = c.expedition.snapshot;
        assert.throws(() => c.expedition.collectLoot(items[3].itemUid), /据点/);
        assert.deepEqual(c.expedition.snapshot, before);
        assert.deepEqual(c.expedition.run.allowedUpgradeIds, [1, 2, 5, 6]);
    });
    test("E: collection write failure rolls back inventory, flags and report together", () => {
        const c = complete(), uid = c.expedition.snapshot.profile.warehouse[3].itemUid;
        unchangedOnFailure(c, () => assert.throws(() => c.expedition.collectLoot(uid), /disk full/));
        c.expedition.collectLoot(uid);
        assert.deepEqual(c.expedition.run.report.collectionUnlockIds, [1]);
    });
    test("E: previews, invalid/stale confirms and animation replay never add statistics", () => {
        const c = create(); c.expedition.startNew(42);
        const p = new Presenter(c.battle, c.expedition); p.open(setups[0]);
        const before = c.expedition.snapshot;
        for (let i = 0; i < 4; i++) { p.select(1); p.selectPouch(0); p.cancel(); }
        assert.deepEqual(c.expedition.snapshot, before);
        p.select(3); assert.equal(p.confirm(), null);
        p.select(1); p.selectPouch(0);
        const result = p.confirm(), committed = c.expedition.snapshot;
        result.events.forEach(event => p.applyEvent(event));
        p.finishPlayback(); p.finishPlayback(); p.open(setups[0]);
        assert.deepEqual(c.expedition.snapshot, committed);
        assert.equal(c.battle.confirmAction(skill(1), result.preview.token).ok, false);
        const s = stats(c)[0];
        assert.equal(s.rounds, 1); assert.deepEqual(s.skillUses, [1, 0, 0, 0]);
        assert.equal(s.stonesUsed, 1); assert.equal(s.durabilitySpent, 6);
        assert.equal(s.burnDamage, result.preview.burnDamage);
        assert.equal(s.damage, 6 + result.preview.enchantHpLoss + result.preview.burnDamage);
        assert.equal(s.qiGenerated, 1); assert.equal(s.qiSpent, 0);
        assert.deepEqual(stats(reload(c)), stats(c));
    });
    test("E: generated, spent and overflow qi are counted separately, including terminal cleanup", () => {
        const initial = new Manager().start(setups[2]);
        initial.pouchSlots.fill(null);
        const record = { initial, actions: [2, 1, 2, 2, 3, 1].map(skillId => skill(skillId)) };
        const s = Stats.battle(record, setups[2]);
        assert.equal(s.qiGenerated, 5); assert.equal(s.qiSpent, 2); assert.equal(s.qiOverflow, 1);
        assert.equal(s.rounds, 6);
        const terminal = Stats.battle({ initial: new Manager().start(setups[0]),
            actions: [1, 1, 3].map(skillId => skill(skillId)) }, setups[0]);
        assert.equal(terminal.result, "victory"); assert.equal(terminal.qiSpent, 2);
        assert.equal(terminal.qiGenerated, 2);
    });
    test("E: medicine, shield absorption and interrupts are measured from actual events", () => {
        const initial = new Manager().start(setups[1]); initial.player.hp = 30;
        const s = Stats.battle({ initial, actions: [
            { type: "use_item", itemUid: initial.pouchSlots[2].itemUid }, skill(2), skill(2), skill(1),
            skill(2), skill(1), skill(4),
        ] }, setups[1]);
        assert.equal(s.medicineUses, 1); assert.equal(s.healed, 12);
        assert.ok(s.blockAbsorbed > 0); assert.equal(s.interrupts, 1);
        assert.equal(s.startHp + s.healed - s.incomingDamage, s.endHp);
    });
    test("E: run report retains choices, both upgrades, all battles, extracted loot and supplies", () => {
        const c = complete(), report = c.expedition.run.report, measured = stats(c);
        assert.equal(report.battles.length, 3); assert.equal(report.choices.length, 2);
        assert.ok(report.choices.every(row => row.ids.includes(row.selectedId)));
        assert.deepEqual(measured.map(row => row.upgradeIds.length), [0, 1, 2]);
        assert.equal(report.outcome, "extracted"); assert.equal(report.exitEncounter, 3);
        assert.deepEqual(report.broughtLoot, c.expedition.snapshot.profile.warehouse);
        assert.deepEqual(report.remainingPouch, c.expedition.snapshot.profile.pouchSlots);
        assert.ok(measured.every(row => row.result === "victory" && row.damage === row.state.enemy.maxHp));
        c.expedition.startNew(7);
        assert.deepEqual(c.expedition.snapshot.history[0], report);
        assert.deepEqual(reload(c).expedition.snapshot, c.expedition.snapshot);
    });
    test("E: failed report records the exit battle and zero brought loot and supplies", () => {
        const c = firstReward();
        c.expedition.chooseUpgrade(c.expedition.run.pendingUpgradeChoices.find(id => id !== 1));
        c.expedition.continueNext();
        while (c.battle.state.phase === "player_input") play(c, 2);
        const report = c.expedition.run.report;
        assert.equal(report.outcome, "failed"); assert.equal(report.exitEncounter, 2);
        assert.deepEqual(report.broughtLoot, []); assert.deepEqual(report.remainingPouch, [null, null, null, null, null]);
        assert.deepEqual(stats(reload(c)), stats(c));
    });
    test("E: report retention keeps the latest twenty archives without altering profile progress", () => {
        const c = create();
        for (let i = 0; i < 23; i++) {
            c.expedition.startNew(i); win(c); choose(c); c.expedition.extract();
        }
        const s = c.expedition.snapshot;
        assert.equal(s.history.length, 20); assert.equal(s.profile.settledRunIds.length, 23);
        assert.equal(s.profile.warehouse.length, 23);
        assert.equal(s.history[0].seed, 2); assert.equal(s.history[19].seed, 21);
        assert.deepEqual(reload(c).expedition.snapshot, s);
    });
    test("E: old schema is rejected without migrating its contents into the current save", () => {
        const c = firstReward(), old = c.expedition.snapshot;
        old.version = 1;
        delete old.history;
        delete old.run.report;
        c.store.value = JSON.stringify(old);
        const loaded = new ExpeditionManager(config, new Manager(), c.store);
        assert.ok(loaded.error);
        assert.equal(loaded.snapshot, null);
        assert.equal(c.store.value, JSON.stringify(old));
    });
    test("E: corrupted action or report snapshots block loading without overwriting the raw save", () => {
        const c = firstReward(), good = c.expedition.snapshot;
        for (const mutate of [
            s => { s.run.report.battles[0].actions[0].skillId = 999; },
            s => { s.run.report.battles[0].initial.player.hp = 99; },
            s => { s.run.report.battles[0].actions.pop(); },
            s => { s.run.report.choices[0].selectedId = 999; },
            s => { s.run.report.seed = -1; }, s => { s.history = [s.run.report]; },
        ]) {
            const bad = copy(good); mutate(bad);
            const store = storage(); store.value = JSON.stringify(bad);
            const e = new ExpeditionManager(config, new Manager(), store);
            assert.ok(e.error); assert.equal(store.value, JSON.stringify(bad)); assert.equal(store.writes, 0);
        }
    });
};
