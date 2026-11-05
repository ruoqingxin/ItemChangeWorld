module.exports = ({ assert, test, setups, tables, Config, Rules, Manager, Presenter, copy, freeze, withTables, build }) => {
    const { ExpeditionManager } = require(require("node:path").join(build, "script/module/expedition/manager/ExpeditionManager.js"));
    const { ExpeditionConfigUtils } = require(require("node:path").join(build, "script/module/expedition/utils/ExpeditionConfigUtils.js"));
    const createExpedition = manager => new ExpeditionManager(ExpeditionConfigUtils.read(tables), manager,
        { read: () => null, write: () => {} });
    const choose = expedition => expedition.chooseUpgrade(expedition.run.pendingUpgradeChoices.find(id => id !== 1));
    const skill = (id, stoneItemUid) => ({ type: "skill", skillId: id, ...(stoneItemUid ? { stoneItemUid } : {}) });
    const heal = itemUid => ({ type: "use_item", itemUid });
    const setup = setups[0];
    const start = (id = 1) => new Manager().start(setups[id - 1]);
    const resolve = (state, action) => Rules.resolveAction(setups[state.encounterId - 1], state, action);
    const play = (manager, action) => {
        const p = manager.previewAction(action);
        assert.ok(p.ok, p.reason);
        const r = manager.confirmAction(action, p.preview.token);
        assert.ok(r.ok, r.reason);
        return r;
    };
    const reject = (state, action) => {
        const before = copy(state);
        const result = resolve(state, action);
        assert.equal(result.ok, false);
        assert.equal(result.preview, null);
        assert.deepEqual(result.events, []);
        assert.deepEqual(result.state, before);
        assert.deepEqual(state, before);
        return result;
    };
    const config = (overrides, callback) => {
        const modified = withTables({ skill_item_use: { getDataList: () =>
            tables.skill_item_use.getDataList().map(row => ({ ...row, ...overrides(row) })) } });
        callback(modified);
    };

    test("C: real item configs seed exactly three unique instances in five slots", () => {
        const state = start();
        assert.equal(state.pouchSlots.length, 5);
        assert.deepEqual(state.pouchSlots.map(item => item?.itemId || null), [2142, 2152, 2601, null, null]);
        assert.equal(new Set(state.pouchSlots.filter(Boolean).map(item => item.itemUid)).size, 3);
        assert.deepEqual(setup.items.map(item => [item.useType, item.healValue, item.burnStacks, item.blockValue]),
            [["fire_stone", 0, 2, 0], ["earth_stone", 0, 0, 4], ["heal", 12, 0, 0]]);
        assert.ok(setup.items.slice(0, 2).every(item => item.damageRate === 100 && item.durabilityCost === 5));
        assert.equal(Rules.startBattle(setup, "no-supply").pouchSlots.filter(Boolean).length, 0);
    });
    test("C: invalid effects, slot collisions and absent stone configs fail on loading", () => {
        for (const override of [
            row => ({ initial_slot: 1 }), row => ({ use_type: "teleport" }),
            row => ({ heal_value: -1 }), row => ({ initial_slot: 6 }),
            row => row.use_type === "heal" ? { burn_stacks: 1 } : {},
            row => row.use_type === "fire_stone" ? { use_type: "earth_stone" } : {},
        ]) config(override, modified => assert.throws(() => Config.readEncounter(modified, 1)));
        assert.throws(() => Config.readEncounter(withTables({ element_stone: { getDataList: () => [] } }), 1));
    });
    test("C: selecting, swapping, toggling and cancelling stones never spends resources", () => {
        const m = new Manager(), p = new Presenter(m);
        p.open(setup);
        const before = m.state;
        p.select(1); p.selectPouch(0);
        assert.equal(p.selection.preview.enchantDamage, 6);
        p.selectPouch(1);
        assert.equal(p.selection.preview.blockGained, 4);
        p.selectPouch(1);
        assert.equal(p.selection.preview.durabilityCost, 0);
        p.selectPouch(0); p.cancel();
        assert.deepEqual(m.state, before);
        assert.equal(p.selectedAction, null);
    });
    test("C: missing items, unsupported targets, full HP and qi costs reject atomically", () => {
        const state = start();
        for (const action of [skill(1, "missing"), skill(2, state.pouchSlots[0].itemUid),
            skill(1, state.pouchSlots[2].itemUid), skill(3, state.pouchSlots[0].itemUid),
            heal(state.pouchSlots[0].itemUid), heal(state.pouchSlots[2].itemUid),
            { type: "skill", skillId: 1, stoneItemUid: "" },
            { type: "use_item", itemUid: state.pouchSlots[2].itemUid, stoneItemUid: state.pouchSlots[0].itemUid }])
            reject(state, action);
    });
    test("C: durability 0 and 4 refuse enchantment; 5 pays exactly and base skills still work", () => {
        for (const durability of [0, 4, 5]) {
            const state = start();
            state.weaponDurability = durability;
            const action = skill(1, state.pouchSlots[0].itemUid);
            if (durability < 5) reject(state, action);
            else {
                const result = resolve(state, action);
                assert.ok(result.ok);
                assert.equal(result.state.weaponDurability, 0);
                assert.equal(result.state.pouchSlots[0], null);
                assert.ok(resolve(result.state, skill(1)).ok);
            }
        }
        const spender = start();
        spender.swordQi = 2; spender.weaponDurability = 4;
        reject(spender, skill(3, spender.pouchSlots[0].itemUid));
    });
    test("C: all five-element multipliers match the approved control cycle", () => {
        for (const [source, target] of [[1, 2], [2, 5], [5, 3], [3, 4], [4, 1]]) {
            assert.equal(Rules.elementMultiplier(source, target), 1.2);
            assert.equal(Rules.elementMultiplier(target, source), 0.8);
            assert.equal(Rules.elementMultiplier(source, source), 0.9);
            assert.equal(Rules.elementMultiplier(0, target), 1);
            assert.equal(Rules.elementMultiplier(source, 0), 1);
        }
        assert.equal(Rules.elementMultiplier(4, 5), 1);
    });
    test("C: fire thrust on fire and earth enemies rounds enchant damage down separately", () => {
        for (const [id, expected] of [[2, 12], [3, 14]]) {
            const state = start(id); state.swordQi = 2;
            const result = resolve(state, skill(3, state.pouchSlots[0].itemUid));
            assert.ok(result.ok);
            assert.equal(result.preview.baseDamage, 14);
            assert.equal(result.preview.enchantDamage, expected);
            assert.equal(result.state.weaponDurability, 45);
        }
    });
    test("C: base and enchant hits consume one shared shield in order", () => {
        const state = start(3); state.enemy.block = 10;
        const result = resolve(state, skill(1, state.pouchSlots[0].itemUid));
        assert.equal(result.preview.blockAbsorbed, 6);
        assert.equal(result.preview.enchantBlockAbsorbed, 4);
        assert.equal(result.preview.enchantHpLoss, 2);
        assert.equal(result.preview.burnDamage, 2);
        assert.equal(result.state.enemy.hp, 36);
    });
    test("C: direct lethal hits spend selected items but do not hit or burn a corpse", () => {
        for (const slot of [0, 1]) {
            const state = start(); state.enemy.hp = 1;
            const result = resolve(state, skill(1, state.pouchSlots[slot].itemUid));
            assert.equal(result.state.phase, "victory");
            assert.equal(result.state.weaponDurability, 45);
            assert.equal(result.state.pouchSlots[slot], null);
            assert.equal(result.preview.enchantDamage, 0);
            assert.equal(result.preview.burnApplied, 0);
            assert.equal(result.events.filter(e => e.type === "damage").length, 1);
            assert.equal(result.state.player.block, 0);
            if (slot === 1) assert.ok(result.events.some(e => e.type === "block_gained" && e.amount === 4));
        }
    });
    test("C: lethal enchant damage ends before burn or enemy intent", () => {
        const state = start(); state.enemy.hp = 10;
        const result = resolve(state, skill(1, state.pouchSlots[0].itemUid));
        assert.equal(result.state.phase, "victory");
        assert.equal(result.preview.enchantHpLoss, 4);
        assert.equal(result.preview.burnApplied, 0);
        assert.ok(!result.events.some(e => e.type === "intent_executed"));
        assert.equal(result.state.player.hp, 50);
    });
    test("C: earth grants four block, absorbs incoming damage and then expires", () => {
        const state = start();
        const result = resolve(state, skill(1, state.pouchSlots[1].itemUid));
        assert.equal(result.preview.blockGained, 4);
        assert.equal(result.preview.playerBlockAbsorbed, 4);
        assert.equal(result.state.player.hp, 48);
        assert.equal(result.state.player.block, 0);
        assert.equal(result.preview.enchantDamage, 4);
        assert.equal(result.state.enemy.hp, 14);
    });
    test("C: new fire burn triggers immediately, then decays and stacks up to twenty", () => {
        const state = start(3);
        const result = resolve(state, skill(1, state.pouchSlots[0].itemUid));
        assert.equal(result.preview.burnApplied, 2);
        assert.equal(result.preview.burnDamage, 2);
        assert.equal(result.state.enemyBurn, 1);
        const next = resolve(result.state, skill(2));
        assert.equal(next.preview.burnDamage, 1);
        assert.equal(next.state.enemyBurn, 0);
        state.enemyBurn = 19;
        const capped = resolve(state, skill(1, state.pouchSlots[0].itemUid));
        assert.equal(capped.preview.burnApplied, 1);
        assert.equal(capped.preview.burnDamage, 20);
        assert.equal(capped.state.enemyBurn, 19);
    });
    test("C: burn damage bypasses shields without consuming them", () => {
        const state = start(3);
        state.enemyBurn = 3;
        const shield = state.enemy.block = 6;
        const result = resolve(state, skill(2));
        assert.equal(result.preview.burnDamage, 3);
        assert.equal(result.state.enemy.hp, 37);
        assert.ok(result.events.some(e => e.type === "block_cleared" && e.target === "enemy" && e.amount === shield));
        assert.ok(!result.events.some(e => e.type === "damage" && e.source === "player"));
    });
    test("C: burn still resolves on an interrupted turn, then intent advances", () => {
        const state = start(3); state.enemyIntentIndex = 2; state.swordQi = 2; state.enemyBurn = 2;
        const result = resolve(state, skill(4));
        assert.equal(result.preview.burnDamage, 2);
        assert.equal(result.preview.interrupted, true);
        assert.equal(result.state.player.hp, 50);
        assert.equal(result.state.enemyIntentIndex, 0);
        assert.ok(result.events.findIndex(e => e.type === "burn_damage") < result.events.findIndex(e => e.type === "intent_interrupted"));
    });
    test("C: burn lethal damage prevents enemy retaliation and clears terminal state", () => {
        const state = start(3); state.enemy.hp = 1; state.enemyBurn = 2; state.player.hp = 1;
        const result = resolve(state, skill(2));
        assert.equal(result.state.phase, "victory");
        assert.equal(result.state.player.hp, 1);
        assert.equal(result.state.enemyBurn, 0);
        assert.equal(result.state.player.block, 0);
        assert.equal(result.state.swordQi, 0);
        assert.ok(!result.events.some(e => e.type === "intent_executed"));
    });
    test("C: healing restores at most twelve, occupies the action and earns no qi", () => {
        for (const [hp, healed] of [[20, 12], [49, 1]]) {
            const state = start(); state.player.hp = hp; state.swordQi = 2;
            const result = resolve(state, heal(state.pouchSlots[2].itemUid));
            assert.ok(result.ok);
            assert.equal(result.preview.healAmount, healed);
            assert.equal(result.state.player.hp, hp + healed - 6);
            assert.equal(result.state.swordQi, 2);
            assert.equal(result.state.round, 2);
            assert.equal(result.state.pouchSlots[2], null);
            assert.equal(result.state.enemy.hp, 24);
            assert.equal(result.state.weaponDurability, 50);
            assert.ok(!result.events.some(e => e.type === "skill_used"));
        }
    });
    test("C: healing expires an old enemy shield and cannot prevent lethal retaliation", () => {
        const state = start(3); state.player.hp = 1; state.enemyIntentIndex = 2; state.enemy.block = 6;
        const result = resolve(state, heal(state.pouchSlots[2].itemUid));
        assert.equal(result.state.phase, "defeat");
        assert.equal(result.state.player.hp, 0);
        assert.equal(result.state.enemy.block, 0);
        assert.equal(result.state.pouchSlots[2], null);
    });
    test("C: repeated confirms and consumed item IDs never consume a second instance", () => {
        const manager = new Manager(); const initial = manager.start(setup);
        const action = skill(1, initial.pouchSlots[0].itemUid);
        const preview = manager.previewAction(action);
        assert.ok(manager.confirmAction(action, preview.preview.token).ok);
        const after = manager.state;
        assert.equal(manager.confirmAction(action, preview.preview.token).ok, false);
        assert.equal(manager.previewAction(action).ok, false);
        assert.deepEqual(manager.state, after);
    });
    test("C: same-name items retain separate UIDs and only the selected instance is spent", () => {
        const manager = new Manager(), original = manager.start(setup);
        original.pouchSlots[3] = { ...original.pouchSlots[0], itemUid: "second-fire" };
        const carry = { playerHp: 50, playerMaxHp: 50, weaponId: 1, weaponDurability: 50, pouchSlots: original.pouchSlots };
        const state = manager.start(setup, carry);
        play(manager, skill(1, state.pouchSlots[0].itemUid));
        assert.equal(manager.state.pouchSlots[3].itemUid, "second-fire");
        play(manager, skill(1, "second-fire"));
        assert.equal(manager.state.pouchSlots[3], null);
        assert.equal(manager.state.weaponDurability, 40);
    });
    test("C: modified returned pouch snapshots cannot mutate manager-owned instances", () => {
        const manager = new Manager(), initial = manager.start(setup);
        initial.pouchSlots[0].itemId = 9999;
        const preview = manager.previewAction(skill(1));
        preview.state.pouchSlots[1].itemUid = "changed";
        assert.equal(manager.state.pouchSlots[0].itemId, 2142);
        assert.notEqual(manager.state.pouchSlots[1].itemUid, "changed");
    });
    test("C: carry validation rejects duplicate UIDs, invalid HP/durability and incompatible weapons atomically", () => {
        const manager = new Manager(); const before = manager.start(setup);
        const carry = { playerHp: 50, playerMaxHp: 50, weaponId: 1, weaponDurability: 50, pouchSlots: before.pouchSlots };
        for (const changes of [
            { playerHp: 0 }, { playerHp: 51 }, { weaponId: 2 }, { weaponDurability: -1 },
            { weaponDurability: 51 }, { pouchSlots: [] },
            { pouchSlots: new Array(5) },
            { pouchSlots: [false, null, null, null, null] },
            { pouchSlots: [before.pouchSlots[0], before.pouchSlots[0], null, null, null] },
            { pouchSlots: [{ itemId: 9999, itemUid: "invalid" }, null, null, null, null] },
        ]) {
            assert.throws(() => manager.start(setup, { ...carry, ...changes }));
            assert.deepEqual(manager.state, before);
        }
    });
    test("C: supply previews are pure and deterministic, including fire, earth and healing", () => {
        const state = start(3); state.player.hp = 20; state.enemyBurn = 3;
        const oldRandom = Math.random;
        Math.random = () => { throw new Error("No randomness allowed"); };
        try {
            for (const action of [skill(1, state.pouchSlots[0].itemUid), skill(1, state.pouchSlots[1].itemUid), heal(state.pouchSlots[2].itemUid)]) {
                const before = copy(state);
                assert.deepEqual(Rules.previewAction(freeze(copy(setups[2])), freeze(copy(state)), action),
                    resolve(state, action));
                assert.deepEqual(state, before);
            }
        } finally { Math.random = oldRandom; }
    });
    test("C: skipping or closing at every supply-event boundary restores the same result", () => {
        for (const index of [0, 1, 2]) {
            for (let prefix = 0; prefix <= 16; prefix++) {
                const manager = new Manager();
                const initial = manager.start(setup);
                if (index === 2) play(manager, skill(1));
                const p = new Presenter(manager); p.open(setup);
                if (index < 2) p.select(1);
                p.selectPouch(index);
                const result = p.confirm();
                assert.ok(result.ok);
                result.events.slice(0, prefix).forEach(event => p.applyEvent(event));
                p.finishPlayback();
                assert.deepEqual(p.display, manager.state);
                p.open(setup);
                assert.deepEqual(p.display, manager.state);
                assert.notEqual(manager.state.pouchSlots[index]?.itemUid, initial.pouchSlots[index].itemUid);
            }
        }
    });
    test("C: healing selection cannot accidentally submit after an incompatible stone click", () => {
        const manager = new Manager(); manager.start(setup); play(manager, skill(1));
        const p = new Presenter(manager); p.open(setup);
        p.selectPouch(2); assert.ok(p.selection.ok);
        p.selectPouch(0); assert.equal(p.selection, null); assert.equal(p.confirm(), null);
        p.select(1); p.selectPouch(0); p.select(2);
        assert.equal(p.selectedAction.stoneItemUid, undefined);
    });
    test("C: the same supply batch reaches battle three without regeneration or refunds", () => {
        const manager = new Manager(), expedition = createExpedition(manager);
        const initial = expedition.startNew(42);
        play(manager, skill(1, initial.pouchSlots[0].itemUid));
        play(manager, skill(1));
        play(manager, skill(1));
        const first = manager.state;
        assert.equal(first.phase, "victory");
        choose(expedition);
        const second = expedition.continueNext();
        assert.equal(second.player.hp, first.player.hp);
        assert.equal(second.weaponDurability, 45);
        assert.deepEqual(second.pouchSlots, first.pouchSlots);
        assert.equal(second.enemyBurn, 0);
        assert.equal(second.swordQi, 0);
        assert.equal(second.player.block, 0);
        assert.throws(() => expedition.continueNext());
        const token = manager.previewAction(skill(1)).preview.token;
        play(manager, heal(second.pouchSlots[2].itemUid));
        play(manager, skill(1));
        play(manager, skill(1, second.pouchSlots[1].itemUid));
        play(manager, skill(3));
        const beforeThird = manager.state;
        assert.equal(beforeThird.phase, "victory");
        choose(expedition);
        const third = expedition.continueNext();
        assert.equal(third.player.hp, beforeThird.player.hp);
        assert.equal(third.weaponDurability, 40);
        assert.deepEqual(third.pouchSlots, [null, null, null, null, null]);
        assert.equal(manager.confirmAction(skill(1), token).ok, false);
    });
    test("C: continuation refuses unfinished, failed, repeated and out-of-order battles", () => {
        const manager = new Manager(), expedition = createExpedition(manager);
        expedition.startNew(42);
        assert.throws(() => expedition.continueNext());
        for (let i = 0; i < 4; i++) play(manager, skill(1));
        assert.throws(() => expedition.continueNext());
        choose(expedition);
        expedition.continueNext();
        while (manager.state.phase === "player_input") play(manager, skill(2));
        const result = manager.state;
        assert.equal(result.phase, "defeat");
        assert.throws(() => expedition.continueNext());
        assert.deepEqual(manager.state, result);
        const fresh = expedition.startNew(43);
        assert.equal(fresh.player.hp, 50);
        assert.equal(fresh.weaponDurability, 50);
        assert.equal(fresh.pouchSlots.filter(Boolean).length, 0);
        assert.notEqual(fresh.battleId, result.battleId);
    });
};
