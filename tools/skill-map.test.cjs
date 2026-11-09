module.exports = ({ assert, test, tables, build }) => {
    const path = require("node:path");
    const { ExpeditionManager } = require(path.join(build, "script/module/expedition/manager/ExpeditionManager.js"));
    const { ExpeditionConfigUtils } = require(path.join(build, "script/module/expedition/utils/ExpeditionConfigUtils.js"));
    const { ExpeditionMapUtils } = require(path.join(build, "script/module/expedition/utils/ExpeditionMapUtils.js"));
    const config = ExpeditionConfigUtils.read(tables, true, true);
    const storage = () => ({ value: null, writes: 0,
        read() { return this.value; },
        write(value) { this.value = value; this.writes++; },
    });
    const create = (cfg = config) => {
        const store = storage(), battle = new (require(path.join(
            build, "script/module/skillBattle/manager/SkillBattleManager.js")).SkillBattleManager)();
        const expedition = new ExpeditionManager(cfg, battle, store);
        assert.equal(expedition.error, "");
        return { store, battle, expedition };
    };
    const start = c => {
        c.expedition.startNew(42);
        const candidates = c.expedition.build.startCandidates;
        c.expedition.chooseStartingSkill(1);
        for (const id of [3, 2])
            if (!c.expedition.build.activeSkills.some(skill => skill.skillId === id)) c.expedition.borrowActive(id);
        return candidates;
    };
    const skill = id => ({ type: "skill", skillId: id });
    const win = c => {
        for (let count = 0; c.battle.state?.phase === "player_input" && count < 120; count++) {
            const state = c.battle.state, setup = c.expedition.setup;
            const intent = setup.enemy.intents[state.enemyIntentIndex];
            const previews = [1, 3].map(id => c.battle.previewAction(skill(id)));
            const lethal = previews.find(value => value.ok && value.state.phase === "victory");
            const id = lethal ? [1, 3][previews.indexOf(lethal)]
                : state.swordQi >= 2 ? 3 : intent.damage > 0 ? 2 : 1;
            const preview = c.battle.previewAction(skill(id));
            assert.ok(preview.ok, preview.reason);
            const result = c.battle.confirmAction(skill(id), preview.preview.token);
            assert.ok(result.ok, result.reason);
        }
        assert.equal(c.battle.state.phase, "victory");
        assert.equal(c.expedition.run.phase, "reward");
        const choices = c.expedition.run.pendingUpgradeChoices;
        if (choices.length) c.expedition.chooseUpgrade(choices[0]);
        assert.equal(c.expedition.run.phase, "decision");
    };
    test("G: pre-map saves are rejected instead of migrating old progress", () => {
        const { SkillBattleManager } = require(path.join(
            build, "script/module/skillBattle/manager/SkillBattleManager.js"));
        const linearConfig = ExpeditionConfigUtils.read(tables, true, false), store = storage();
        const legacy = new ExpeditionManager(linearConfig, new SkillBattleManager(), store);
        assert.equal(legacy.error, "");
        legacy.startNew(42);
        legacy.chooseStartingSkill(1);
        for (const id of [3, 2]) legacy.borrowActive(id);
        const old = store.value;
        const battle = new SkillBattleManager();
        const loaded = new ExpeditionManager(config, battle, store);
        assert.ok(loaded.error);
        assert.equal(loaded.run, null);
        assert.equal(store.value, old);
    });

    test("G: changed configuration is not silently made compatible", () => {
        const c = create();
        start(c);
        const changed = JSON.parse(JSON.stringify(config));
        changed.map.name = "renamed route";
        changed.map.nodes[0].name = "renamed start";
        changed.map.nodes[0].x += 1;
        const battle = new (require(path.join(
            build, "script/module/skillBattle/manager/SkillBattleManager.js")).SkillBattleManager)();
        const loaded = new ExpeditionManager(changed, battle, c.store);
        assert.ok(loaded.error);
        assert.equal(loaded.snapshot, null);
    });
    const fightAndReturn = (c, nodeId) => {
        assert.equal(c.expedition.enterMapNode(nodeId), "battle");
        win(c);
        c.expedition.returnToMap();
        assert.equal(c.expedition.run.phase, "map");
        assert.ok(c.expedition.map.resolvedIds.includes(nodeId));
    };

    test("G: first map has the confirmed battle volume, initial reveal and connected graph", () => {
        assert.equal(config.map.nodes.filter(node => ["battle", "elite", "boss"].includes(node.type)).length, 15);
        assert.equal(config.map.nodes.filter(node => node.type === "borrow").length, 3);
        const initial = config.map.nodes.filter(node => node.stage <= config.map.initialRevealStage);
        assert.equal(initial.filter(node => node.main).length, 5);
        const state = ExpeditionMapUtils.createState(config.map, 1000);
        assert.equal(state.currentNodeId, "start");
        assert.ok(ExpeditionMapUtils.canMove(config.map, state, "b1"));
        assert.ok(!ExpeditionMapUtils.canMove(config.map, state, "b2"));
    });

    test("G: map starts in map phase, keeps the starting build and enters a real battle node", () => {
        const c = create();
        start(c);
        assert.equal(c.expedition.run.phase, "map");
        assert.equal(c.expedition.map.currentNodeId, "start");
        assert.deepEqual(c.expedition.mapReachableNodes().sort(), ["b1"]);
        assert.equal(c.expedition.enterMapNode("b1"), "battle");
        assert.equal(c.expedition.run.phase, "battle");
        assert.equal(c.expedition.map.battleCount, 1);
        assert.equal(c.expedition.map.battleNodeId, "b1");
        assert.equal(c.battle.previewAction(skill(4)).ok, false, "unborrowed skills must not enter map battles");
        assert.deepEqual(c.store.value && JSON.parse(c.store.value).run.map, c.expedition.map);
    });

    test("G: victory returns to the route and a resolved battle cannot be farmed again", () => {
        const c = create();
        start(c);
        fightAndReturn(c, "b1");
        assert.equal(c.expedition.run.report.battles.length, 1);
        assert.equal(c.expedition.enterMapNode("b2"), "battle");
        win(c);
        c.expedition.returnToMap();
        const loot = c.expedition.run.loot.slice();
        c.expedition.enterMapNode("b1");
        assert.equal(c.expedition.enterMapNode("b2"), "move");
        assert.deepEqual(c.expedition.run.loot, loot);
        assert.equal(c.expedition.run.report.battles.length, 2);
    });

    test("G: search is persisted once, borrow creates candidates and full recovery is not consumed", () => {
        const c = create();
        start(c);
        fightAndReturn(c, "b1");
        c.expedition.enterMapNode("start");
        assert.equal(c.expedition.enterMapNode("search1"), "event");
        const afterSearch = c.expedition.snapshot;
        assert.equal(c.expedition.run.loot.length, 2);
        assert.equal(c.expedition.enterMapNode("search1"), "move");
        assert.deepEqual(c.expedition.run.loot, JSON.parse(JSON.stringify(afterSearch.run.loot)));
        assert.throws(() => c.expedition.enterMapNode("recovery1"), /不可达/);
    });

    test("G: extraction at a reached exit settles once and preserves carried loot and route progress", () => {
        const c = create();
        start(c);
        fightAndReturn(c, "b1");
        fightAndReturn(c, "b2");
        assert.equal(c.expedition.enterMapNode("borrow1"), "event");
        c.expedition.skipActiveChoice();
        c.expedition.enterMapNode("b2");
        c.expedition.enterMapNode("b1");
        assert.equal(c.expedition.enterMapNode("extract-mid"), "extract");
        assert.equal(c.expedition.map.currentNodeId, "extract-mid");
        assert.equal(c.expedition.extractMap("extract-mid"), true);
        assert.equal(c.expedition.run.phase, "extracted");
        assert.equal(c.expedition.snapshot.profile.warehouse.length, 2);
        assert.equal(c.expedition.run.report.exitEncounter, 2);
        assert.equal(c.expedition.map.currentNodeId, "extract-mid");
        assert.throws(() => c.expedition.extractMap("extract-mid"));
    });

    test("G: map deadline expires into a failed settlement and reload preserves the outcome", () => {
        const c = create();
        start(c);
        assert.equal(c.expedition.expireMap(c.expedition.map.deadlineAt - 1), false);
        assert.equal(c.expedition.expireMap(c.expedition.map.deadlineAt), true);
        assert.equal(c.expedition.run.phase, "failed");
        const loaded = new ExpeditionManager(config, c.battle, c.store);
        assert.equal(loaded.error, "");
        assert.equal(loaded.run.phase, "failed");
        assert.deepEqual(loaded.snapshot, c.expedition.snapshot);
    });

    const atDeadline = (c, callback) => {
        const original = Date.now;
        Date.now = () => c.expedition.map.deadlineAt;
        try { callback(); } finally { Date.now = original; }
    };
    test("G: at the exact deadline battle submit fails before spending or recording an action", () => {
        const c = create();
        start(c);
        c.expedition.enterMapNode("b1");
        const before = c.battle.state;
        const preview = c.battle.previewAction(skill(1));
        assert.ok(preview.ok);
        atDeadline(c, () => {
            const result = c.battle.confirmAction(skill(1), preview.preview.token);
            assert.equal(result.ok, false);
            assert.match(result.reason, /时间/);
        });
        assert.equal(c.expedition.run.phase, "failed");
        assert.equal(c.expedition.run.report.endReason, "timeout");
        assert.equal(c.expedition.run.report.battles[0].actions.length, 0);
        assert.deepEqual(c.battle.state, before);
        const loaded = new ExpeditionManager(config, c.battle, c.store);
        assert.equal(loaded.error, "");
        assert.equal(loaded.run.phase, "failed");
    });
    test("G: starting choice and map movement are blocked at the deadline", () => {
        for (const choose of [true, false]) {
            const c = create();
            c.expedition.startNew(42);
            atDeadline(c, () => assert.throws(() => choose
                ? c.expedition.chooseStartingSkill(c.expedition.build.startCandidates[0])
                : c.expedition.enterMapNode("b1"), /时间/));
            assert.equal(c.expedition.run.phase, "failed");
            assert.equal(c.expedition.map.battleCount, 0);
        }
    });
    test("G: a recovery is replayable, persisted once and carried into the next battle", () => {
        const c = create();
        start(c);
        fightAndReturn(c, "b1");
        fightAndReturn(c, "b2");
        c.expedition.enterMapNode("borrow1");
        c.expedition.skipActiveChoice();
        const before = c.expedition.run.battle.player.hp;
        assert.ok(before < 50);
        c.expedition.enterMapNode("recovery1");
        const recovered = Math.min(50, before + 10);
        assert.equal(c.expedition.run.battle.player.hp, recovered);
        assert.equal(c.expedition.run.report.recoveries.length, 1);
        const loaded = new ExpeditionManager(config, c.battle, c.store);
        assert.equal(loaded.error, "");
        assert.equal(loaded.run.battle.player.hp, recovered);
        loaded.enterMapNode("borrow1");
        loaded.enterMapNode("recovery1");
        assert.equal(loaded.run.battle.player.hp, recovered);
        loaded.enterMapNode("borrow1");
        loaded.enterMapNode("b3");
        assert.equal(loaded.run.battle.player.hp, recovered);
    });
    test("G: extraction at deadline fails but an earlier completed extraction stays successful", () => {
        for (const expired of [true, false]) {
            const c = create();
            start(c);
            fightAndReturn(c, "b1");
            fightAndReturn(c, "b2");
            c.expedition.enterMapNode("borrow1");
            c.expedition.skipActiveChoice();
            c.expedition.enterMapNode("b2");
            c.expedition.enterMapNode("b1");
            c.expedition.enterMapNode("extract-mid");
            if (expired) {
                atDeadline(c, () => assert.throws(() => c.expedition.extractMap("extract-mid"), /时间/));
                assert.equal(c.expedition.run.phase, "failed");
                assert.equal(c.expedition.snapshot.profile.warehouse.length, 0);
            } else {
                c.expedition.extractMap("extract-mid");
                atDeadline(c, () => assert.equal(c.expedition.expireMap(), false));
                assert.equal(c.expedition.run.phase, "extracted");
            }
        }
    });
    test("G: offline timeout settles on loading even when the saved page was a battle", () => {
        const c = create();
        start(c);
        c.expedition.enterMapNode("b1");
        let loaded;
        atDeadline(c, () => { loaded = new ExpeditionManager(config, c.battle, c.store); });
        assert.equal(loaded.error, "");
        assert.equal(loaded.run.phase, "failed");
        assert.equal(loaded.run.report.endReason, "timeout");
    });
    test("G: timeout storage failure never half-settles or duplicates the eventual settlement", () => {
        const c = create();
        start(c);
        c.expedition.enterMapNode("b1");
        const snapshot = c.expedition.snapshot, raw = c.store.value;
        const write = c.store.write;
        c.store.write = () => { throw new Error("disk full"); };
        atDeadline(c, () => assert.throws(() => c.expedition.expireMap(), /disk full/));
        assert.deepEqual(c.expedition.snapshot, snapshot);
        assert.equal(c.store.value, raw);
        c.store.write = write;
        atDeadline(c, () => {
            assert.equal(c.expedition.expireMap(), true);
            assert.equal(c.expedition.expireMap(), false);
        });
        assert.equal(c.expedition.snapshot.profile.settledRunIds.length, 1);
    });
    test("G: full HP refuses recovery without consuming the node", () => {
        const cfg = JSON.parse(JSON.stringify(config));
        for (const setup of cfg.encounters) for (const intent of setup.enemy.intents) intent.damage = 0;
        const c = create(cfg);
        start(c);
        fightAndReturn(c, "b1");
        fightAndReturn(c, "b2");
        c.expedition.enterMapNode("borrow1");
        c.expedition.skipActiveChoice();
        const before = c.expedition.snapshot, raw = c.store.value;
        assert.throws(() => c.expedition.enterMapNode("recovery1"), /生命已满/);
        assert.deepEqual(c.expedition.snapshot, before);
        assert.equal(c.store.value, raw);
        assert.ok(!c.expedition.map.resolvedIds.includes("recovery1"));
    });
};
