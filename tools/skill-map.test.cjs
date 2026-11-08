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
    const create = () => {
        const store = storage(), battle = new (require(path.join(
            build, "script/module/skillBattle/manager/SkillBattleManager.js")).SkillBattleManager)();
        const expedition = new ExpeditionManager(config, battle, store);
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
    test("G: a pre-map save keeps its active run and gains valid map progress", () => {
        const { SkillBattleManager } = require(path.join(
            build, "script/module/skillBattle/manager/SkillBattleManager.js"));
        const linearConfig = ExpeditionConfigUtils.read(tables, true, false), store = storage();
        const legacy = new ExpeditionManager(linearConfig, new SkillBattleManager(), store);
        assert.equal(legacy.error, "");
        legacy.startNew(42);
        legacy.chooseStartingSkill(1);
        for (const id of [3, 2]) legacy.borrowActive(id);
        const old = legacy.snapshot, beforeBuild = old.run.build;
        const battle = new SkillBattleManager();
        const loaded = new ExpeditionManager(config, battle, store);
        assert.equal(loaded.error, "");
        assert.equal(loaded.run.phase, "battle");
        assert.deepEqual(loaded.run.build, beforeBuild);
        assert.equal(loaded.map.templateId, config.map.id);
        assert.equal(loaded.map.currentNodeId, "b1");
        assert.equal(loaded.map.battleCount, 1);
        assert.equal(loaded.run.report.battles[0].initial.battleId, `${old.run.runId}_map_battle_1`);
        assert.equal(loaded.run.battle.battleId, `${old.run.runId}_map_battle_1`);
        win({ expedition: loaded, battle });
        loaded.returnToMap();
        assert.ok(loaded.map.resolvedIds.includes("b1"));
        assert.equal(JSON.parse(store.value).configSignature, JSON.stringify(config));
    });

    test("G: map presentation changes do not invalidate an existing save", () => {
        const c = create();
        start(c);
        const changed = JSON.parse(JSON.stringify(config));
        changed.map.name = "renamed route";
        changed.map.nodes[0].name = "renamed start";
        changed.map.nodes[0].x += 1;
        const battle = new (require(path.join(
            build, "script/module/skillBattle/manager/SkillBattleManager.js")).SkillBattleManager)();
        const loaded = new ExpeditionManager(changed, battle, c.store);
        assert.equal(loaded.error, "");
        assert.equal(loaded.run.phase, "map");
        assert.equal(loaded.map.currentNodeId, "start");
        assert.deepEqual(loaded.snapshot.profile, c.expedition.snapshot.profile);
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
};
