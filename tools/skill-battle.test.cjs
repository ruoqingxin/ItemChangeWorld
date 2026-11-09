const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// ByteBuf's only engine dependency is UTF-8 decoding; keep the rules headless.
global.Laya = {
    Resource: class {},
    Byte: class {
        constructor(buffer) { this.bytes = Buffer.from(buffer); this.pos = 0; }
        readUTFBytes(length) {
            const value = this.bytes.toString("utf8", this.pos, this.pos + length);
            this.pos += length;
            return value;
        }
    },
};

const build = process.argv[2];
if (!build) throw new Error("Run tools/test-skill-battle.ps1");
const { Tables } = require(path.join(build, "script/config/schema.js"));
const ByteBuf = require(path.join(build, "script/config/bright/serialization/ByteBuf.js")).default;
const { SkillBattleConfigUtils: Config } = require(path.join(build, "script/module/skillBattle/utils/SkillBattleConfigUtils.js"));
const { SkillBattleFormulaUtils: Rules } = require(path.join(build, "script/module/skillBattle/utils/SkillBattleFormulaUtils.js"));
const { SkillBattleManager: Manager } = require(path.join(build, "script/module/skillBattle/manager/SkillBattleManager.js"));
const { SkillBattleDebug: Debug } = require(path.join(build, "script/module/skillBattle/debug/SkillBattleDebug.js"));
const { ConfigUtil } = require(path.join(build, "script/config/ConfigUtil.js"));
const { SkillBattlePresenter: Presenter } = require(path.join(build, "script/module/skillBattle/view/SkillBattlePresenter.js"));

// Read the same uncompressed package that ConfigLoader/PackRes loads in Laya.
const pack = fs.readFileSync(path.join(__dirname, "../assets/config/configbin.bin"));
let offset = 0;
const uint32 = () => {
    assert.ok(offset + 4 <= pack.length, "Truncated package header");
    const value = pack.readUInt32LE(offset);
    offset += 4;
    return value;
};
const buffers = new Map();
const count = uint32();
assert.notEqual(count, 6666, "Update this test loader if package compression is enabled");
for (let i = 0; i < count; i++) {
    const nameLength = uint32();
    assert.ok(offset + nameLength <= pack.length);
    const name = pack.toString("utf8", offset, offset + nameLength);
    offset += nameLength;
    const dataLength = uint32();
    assert.ok(offset + dataLength <= pack.length);
    assert.ok(!buffers.has(name), `Duplicate package entry ${name}`);
    buffers.set(name, pack.subarray(offset, offset + dataLength));
    offset += dataLength;
}
assert.equal(offset, pack.length, "Trailing bytes in config package");
const tables = new Tables(name => {
    assert.ok(buffers.has(name), `Missing table ${name}`);
    return new ByteBuf(new Uint8Array(buffers.get(name)));
});
const setups = [1, 2, 3].map(id => Config.readEncounter(tables, id));
const withTables = overrides => Object.create(tables, Object.fromEntries(
    Object.entries(overrides).map(([key, value]) => [key, { value }]),
));
const action = skillId => ({ type: "skill", skillId });
const start = (encounterId = 1) => Rules.startBattle(setups[encounterId - 1], "test");
const runAction = (state, skillId, setup = setups[state.encounterId - 1]) => {
    const result = Rules.resolveAction(setup, state, action(skillId));
    assert.ok(result.ok, result.reason);
    return result;
};
const copy = value => JSON.parse(JSON.stringify(value));
function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}
let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`OK ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        throw error;
    }
}
function rejectWithoutMutation(state, input) {
    const before = copy(state);
    const result = Rules.resolveAction(setups[state.encounterId - 1], state, input);
    assert.equal(result.ok, false);
    assert.ok(result.reason);
    assert.deepEqual(state, before);
    assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
    assert.equal(result.preview, null);
}

test("generated source package contains 35 tables including approved inventory tables", () => {
    assert.equal(buffers.size, 35);
    for (const name of Tables.getTableNames()) {
        assert.ok(Array.isArray(tables[name].getDataList()), name);
    }
    assert.equal(tables.skill.getDataList().length, 4, "unapproved client-only skills must not be regenerated");
    assert.equal(tables.skill_encounter.getDataList().length, 3);
    assert.equal(tables.skill_enemy_intent.getDataList().length, 8);
    assert.equal(tables.skill_enemy_intent_step.getDataList().length, 10);
});
test("new encounters match the approved values, old enemy records remain unchanged", () => {
    assert.deepEqual(setups.map(s => s.enemy.maxHp), [24, 30, 40]);
    assert.deepEqual(setups.map(s => s.enemy.intents.map(i => i.damage)), [
        [6, 6, 8], [7, 0, 14, 7], [8, 0, 14],
    ]);
    assert.deepEqual(setups.map(s => s.enemy.intents.map(i => i.interruptible)), [
        [false, false, false], [false, false, true, false], [false, false, true],
    ]);
    assert.equal(tables.enemy.get(2).hp, 36);
    assert.equal(tables.enemy.get(3).name, "\u67af\u85e4\u7cbe");
    assert.equal(tables.weapon.get(1).max_durability, 50);
    assert.ok(setups.every(s => s.playerMaxHp === 50 && s.qiMax === 3 && s.startQi === 0));
});
test("weapon slots and intent steps are sorted by explicit indices, not Excel row order", () => {
    const shuffled = withTables({
        weapon_skill: { getDataList: () => tables.weapon_skill.getDataList().slice().reverse() },
        skill_enemy_intent_step: { getDataList: () => tables.skill_enemy_intent_step.getDataList().slice().reverse() },
    });
    for (const setup of setups) {
        assert.deepEqual(Config.readEncounter(shuffled, setup.encounterId), setup);
    }
});
test("missing and disabled configuration fails before starting battle", () => {
    assert.throws(() => Config.readEncounter(tables, 999), /Missing or disabled/);
    assert.throws(() => Config.readEncounter(null, 1), /not loaded/);
    const disabled = withTables({ skill: { get: id => ({ ...tables.skill.get(id), enabled: 0 }) } });
    assert.throws(() => Config.readEncounter(disabled, 1), /disabled skill/);
});
test("duplicate or missing intent steps and weapon slots are rejected", () => {
    const steps = tables.skill_enemy_intent_step.getDataList();
    const missing = withTables({ skill_enemy_intent_step: { getDataList: () => steps.filter(r => r.id !== 2) } });
    assert.throws(() => Config.readEncounter(missing, 1), /contiguous/);
    const duplicate = withTables({ weapon_skill: {
        getDataList: () => tables.weapon_skill.getDataList().map(r => ({ ...r, slot_index: 1 })),
    } });
    assert.throws(() => Config.readEncounter(duplicate, 1), /contiguous/);
});
test("unsupported rule modes, intent effects and negative values are rejected", () => {
    const rule = tables.skill_battle_rule.get(1);
    assert.throws(() => Config.readEncounter(withTables({
        skill_battle_rule: { get: () => ({ ...rule, action_count: 2 }) },
    }), 1), /one action/);
    assert.throws(() => Config.readEncounter(withTables({
        skill: { get: id => ({ ...tables.skill.get(id), qi_cost: -1 }) },
    }), 1), /Invalid qi_cost/);
    assert.throws(() => Config.readEncounter(withTables({
        skill_enemy_intent: { get: id => ({ ...tables.skill_enemy_intent.get(id), intent_type: "charge" }) },
    }), 1), /incompatible/);
});
test("start initializes one enemy, zero block, zero qi and the first visible intent", () => {
    const state = start();
    assert.equal(state.round, 1);
    assert.equal(state.phase, "player_input");
    assert.equal(state.enemyIntentIndex, 0);
    assert.equal(Rules.currentIntent(setups[0], state).id, 1);
    assert.equal(state.player.hp, 50);
    assert.equal(state.swordQi, 0);
    assert.equal(state.player.block, 0);
    assert.equal(state.enemy.block, 0);
});
test("slash deals 6, gains 1 qi, and executes exactly one enemy intent", () => {
    const result = runAction(start(), 1);
    assert.equal(result.state.enemy.hp, 18);
    assert.equal(result.state.player.hp, 44);
    assert.equal(result.state.swordQi, 1);
    assert.equal(result.state.round, 2);
    assert.equal(result.events.filter(e => e.type === "intent_executed").length, 1);
});
test("guard gains 8 block and 1 qi, absorbs attack, then clears remainder", () => {
    const result = runAction(start(), 2);
    assert.equal(result.preview.blockGained, 8);
    assert.equal(result.preview.playerBlockAbsorbed, 6);
    assert.equal(result.preview.playerHpLoss, 0);
    assert.equal(result.state.player.hp, 50);
    assert.equal(result.state.player.block, 0);
    assert.equal(result.state.swordQi, 1);
});
test("0 and 1 qi cannot use either spender; failed actions have no side effects", () => {
    for (const qi of [0, 1]) {
        for (const skillId of [3, 4]) {
            const state = start();
            state.swordQi = qi;
            rejectWithoutMutation(state, action(skillId));
        }
    }
});
test("2 qi pays the full 2 qi cost and thrust deals 14", () => {
    const state = start();
    state.swordQi = 2;
    const result = runAction(state, 3);
    assert.equal(result.state.swordQi, 0);
    assert.equal(result.state.enemy.hp, 10);
    assert.equal(result.preview.qiCost, 2);
});
test("slash and guard at 3 qi cap at 3 and report overflow", () => {
    for (const skillId of [1, 2]) {
        const state = start();
        state.swordQi = 3;
        const result = runAction(state, skillId);
        assert.equal(result.state.swordQi, 3);
        assert.ok(result.events.some(e => e.type === "qi_changed" && e.overflow === 1));
    }
});
test("an enemy shield absorbs the attack; slash still generates qi", () => {
    const state = start();
    state.enemy.block = 6;
    const result = runAction(state, 1);
    assert.equal(result.state.enemy.hp, 24);
    assert.equal(result.preview.blockAbsorbed, 6);
    assert.equal(result.preview.enemyHpLoss, 0);
    assert.equal(result.state.enemy.block, 0);
    assert.equal(result.state.swordQi, 1);
});
test("a non-attacking player action expires an old enemy shield", () => {
    const state = start();
    state.enemy.block = 6;
    const result = runAction(state, 2);
    assert.equal(result.state.enemy.block, 0);
    assert.ok(result.events.some(e => e.type === "block_cleared" && e.target === "enemy" && e.amount === 6));
});
test("enemy block is cleared at the end of its action round", () => {
    const state = start(3);
    state.enemyIntentIndex = 1;
    const first = runAction(state, 2);
    assert.equal(first.state.enemy.block, 0);
    assert.equal(first.state.enemyIntentIndex, 2);
    const second = runAction(first.state, 1);
    assert.equal(second.state.enemy.hp, 34);
    assert.equal(second.preview.blockAbsorbed, 0);
    assert.equal(second.state.enemy.block, 0);
});
test("enemy block does not persist into the next round", () => {
    const state = start(3);
    state.enemyIntentIndex = 1;
    state.enemy.block = 20;
    const result = runAction(state, 2);
    assert.equal(result.state.enemy.block, 0);
});
test("break cancels an interruptible heavy attack and advances past it", () => {
    for (const encounterId of [2, 3]) {
        const state = start(encounterId);
        state.enemyIntentIndex = 2;
        state.swordQi = 2;
        const result = runAction(state, 4);
        assert.equal(result.preview.interrupted, true);
        assert.equal(result.state.player.hp, 50);
        assert.equal(result.state.enemy.hp, state.enemy.hp - 8);
        assert.equal(result.events.filter(e => e.type === "intent_executed").length, 0);
        assert.equal(result.state.enemyIntentIndex, encounterId === 2 ? 3 : 0);
    }
});
test("break on a normal attack deals 8 but does not stop the attack", () => {
    const state = start();
    state.swordQi = 2;
    const result = runAction(state, 4);
    assert.equal(result.preview.interrupted, false);
    assert.equal(result.state.enemy.hp, 16);
    assert.equal(result.state.player.hp, 44);
});
test("breaking charge does not skip the following heavy attack", () => {
    const state = start(2);
    state.swordQi = 2;
    state.enemyIntentIndex = 1;
    const first = runAction(state, 4);
    assert.equal(first.preview.interrupted, false);
    assert.equal(first.state.enemyIntentIndex, 2);
    assert.equal(first.state.player.hp, 50);
    const second = runAction(first.state, 2);
    assert.equal(second.preview.enemyDamage, 14);
    assert.equal(second.state.player.hp, 44);
});
test("charge has no damage or hidden attack multiplier", () => {
    let state = start(2);
    state.enemyIntentIndex = 1;
    state = runAction(state, 1).state;
    assert.equal(state.player.hp, 50);
    const heavy = runAction(state, 1);
    assert.equal(heavy.preview.enemyDamage, 14);
    assert.equal(heavy.state.player.hp, 36);
});
test("lethal player damage wins immediately without executing the enemy intent", () => {
    const state = start(2);
    state.enemy.hp = 5;
    state.enemyIntentIndex = 2;
    state.player.hp = 1;
    const result = runAction(state, 1);
    assert.equal(result.state.phase, "victory");
    assert.equal(result.state.enemy.hp, 0);
    assert.equal(result.state.player.hp, 1);
    assert.equal(result.state.round, 1);
    assert.equal(result.preview.enemyHpLoss, 5);
    assert.equal(result.events.filter(e => e.type === "intent_executed").length, 0);
    assert.equal(result.events.filter(e => e.type === "battle_ended").length, 1);
});
test("lethal enemy damage loses immediately and clamps hp to zero", () => {
    const state = start();
    state.player.hp = 2;
    const result = runAction(state, 1);
    assert.equal(result.state.phase, "defeat");
    assert.equal(result.state.player.hp, 0);
    assert.equal(result.preview.playerHpLoss, 2);
    assert.equal(result.state.round, 1);
    assert.equal(result.events[result.events.length - 1].type, "battle_ended");
});
test("a lethal break wins rather than reporting a successful interruption", () => {
    const state = start(3);
    state.enemy.hp = 8;
    state.enemyIntentIndex = 2;
    state.swordQi = 2;
    const result = runAction(state, 4);
    assert.equal(result.state.phase, "victory");
    assert.equal(result.preview.interrupted, false);
    assert.ok(!result.events.some(e => e.type === "intent_interrupted"));
});
test("terminal/resolving phases reject actions without changing state", () => {
    for (const phase of ["victory", "defeat", "resolving"]) {
        const state = start();
        state.phase = phase;
        rejectWithoutMutation(state, action(1));
    }
});
test("unknown, malformed, item and enchant actions are rejected without changes", () => {
    for (const input of [null, action(999), action(1.5), { type: "use_item", itemUid: "pill" },
        { type: "skill", skillId: 1, stoneItemUid: "stone" }]) {
        rejectWithoutMutation(start(), input);
    }
});
test("preview and resolve are identical, pure, deterministic and consume no random numbers", () => {
    const setup = freeze(copy(setups[2]));
    const state = start(3);
    state.swordQi = 2;
    state.enemyIntentIndex = 2;
    freeze(state);
    const oldRandom = Math.random;
    Math.random = () => { throw new Error("Battle rules must not consume randomness"); };
    try {
        const before = copy(state);
        const preview = Rules.previewAction(setup, state, action(4));
        assert.deepEqual(preview, Rules.resolveAction(setup, state, action(4)));
        assert.deepEqual(preview, Rules.previewAction(setup, state, action(4)));
        assert.deepEqual(state, before);
    } finally {
        Math.random = oldRandom;
    }
});
test("every active action spends one durability, while zero durability still allows base skills", () => {
    for (const durability of [0, 4, 5, 50]) {
        for (const skillId of [1, 2, 3, 4]) {
            const state = start();
            state.weaponDurability = durability;
            state.swordQi = 2;
            assert.equal(runAction(state, skillId).state.weaponDurability, Math.max(0, durability - 1));
        }
    }
});
test("preview does not commit, and duplicate confirmations of one preview commit only once", () => {
    const manager = new Manager();
    manager.start(setups[0]);
    const before = manager.state;
    const logs = manager.logs;
    const preview = manager.previewAction(action(1));
    assert.deepEqual(manager.state, before);
    assert.deepEqual(manager.logs, logs);
    const result = manager.confirmAction(action(1), preview.preview.token);
    assert.deepEqual(result, preview);
    const after = manager.state;
    assert.equal(manager.confirmAction(action(1), preview.preview.token).ok, false);
    assert.deepEqual(manager.state, after);
    assert.equal(after.revision, 1);
});
test("stale preview from a previous battle cannot submit into a restarted battle", () => {
    const manager = new Manager();
    manager.start(setups[0]);
    const token = manager.previewAction(action(1)).preview.token;
    manager.reset();
    manager.start(setups[0]);
    const before = manager.state;
    assert.equal(manager.confirmAction(action(1), token).ok, false);
    assert.deepEqual(manager.state, before);
});
test("returned snapshots/results/logs and supplied config cannot mutate manager state", () => {
    const manager = new Manager();
    const setup = copy(setups[0]);
    const state = manager.start(setup);
    state.player.hp = 1;
    setup.skills[0].damage = 999;
    setup.enemy.intents[0].damage = 999;
    const result = manager.previewAction(action(1));
    const accepted = manager.confirmAction(action(1), result.preview.token);
    assert.equal(manager.state.player.hp, 44);
    assert.equal(manager.state.enemy.hp, 18);
    accepted.state.player.hp = 1;
    manager.state.enemy.hp = 1;
    manager.logs.push("not owned");
    assert.equal(manager.state.player.hp, 44);
    assert.equal(manager.state.enemy.hp, 18);
    assert.ok(!manager.logs.includes("not owned"));
});
test("failed manager submissions leave snapshot and history unchanged", () => {
    const manager = new Manager();
    const state = manager.start(setups[0]);
    const beforeLogs = manager.logs;
    assert.equal(manager.confirmAction(action(3), state).ok, false);
    assert.deepEqual(manager.state, state);
    assert.deepEqual(manager.logs, beforeLogs);
    manager.reset();
    assert.throws(() => manager.previewAction(action(1)), /SkillBattleDebug.start/);
});
test("mounted debug entry reads real tables, previews without committing and replays a complete battle", () => {
    global.window = {};
    ConfigUtil.Tables = tables;
    const oldLog = console.log;
    console.log = () => {};
    try {
        Debug.mountToWindow();
        const api = window.SkillBattleDebug;
        assert.equal(typeof api.start, "function");
        api.start(1);
        const before = api.state();
        assert.ok(api.preview(1).ok);
        assert.deepEqual(api.state(), before);
        const result = api.run(1, [1, 1, 3, 1]);
        assert.equal(result.state.phase, "victory");
        assert.equal(result.state.player.hp, 38);
        assert.equal(result.state.revision, 3);
        assert.ok(result.logs.length > 0);
        api.reset();
        assert.equal(api.state(), null);
    } finally {
        console.log = oldLog;
    }
});

function simulate(setup, policy, limit = 100) {
    let state = Rules.startBattle(setup, "simulation");
    const actions = [];
    while (state.phase === "player_input" && actions.length < limit) {
        const skillId = policy(setup, state);
        actions.push(skillId);
        const preview = Rules.previewAction(setup, state, action(skillId));
        const result = runAction(state, skillId, setup);
        assert.deepEqual(result, preview);
        assert.ok(result.state.swordQi >= 0 && result.state.swordQi <= 3);
        assert.equal(result.state.player.block, 0);
        state = result.state;
    }
    assert.notEqual(state.phase, "player_input", "Simulation did not terminate");
    return { state, actions };
}
const strategies = [
    { name: "slash_only", choose: () => 1 },
    { name: "guard_then_thrust", choose: (_setup, state) => state.swordQi < 2 ? 2 : 3 },
    { name: "respond_to_intent", choose: (setup, state) => {
        const intent = Rules.currentIntent(setup, state);
        return state.swordQi < 2 ? (intent.damage > 0 ? 2 : 1) : (intent.interruptible ? 4 : 3);
    } },
];
const expected = [
    [[4, "victory", 30], [6, "victory", 42], [6, "victory", 42]],
    [[5, "victory", 22], [9, "victory", 30], [9, "victory", 44]],
    [[7, "victory", 6], [9, "victory", 22], [9, "victory", 50]],
];
const report = [];
for (let e = 0; e < setups.length; e++) {
    for (let p = 0; p < strategies.length; p++) {
        const setup = setups[e];
        const strategy = strategies[p];
        test(`deterministic full battle: encounter ${e + 1}, ${strategy.name}`, () => {
            const result = simulate(setup, strategy.choose);
            assert.deepEqual([result.actions.length, result.state.phase, result.state.player.hp], expected[e][p]);
            assert.deepEqual(simulate(setup, strategy.choose), result);
            report.push({ encounter: e + 1, strategy: strategy.name, turns: result.actions.length,
                result: result.state.phase, hp: result.state.player.hp, actions: result.actions });
        });
    }
}
console.table(report.map(({ actions, ...row }) => row));
const variants = [
    { name: "rabbit_hp_24", setup: copy(setups[1]), change: setup => { setup.enemy.maxHp = 24; } },
    { name: "guard_hp_32", setup: copy(setups[2]), change: setup => { setup.enemy.maxHp = 32; } },
    { name: "guard_sweep_10", setup: copy(setups[2]), change: setup => { setup.enemy.intents[0].damage = 10; } },
];
const variantReport = [];
test("single-variable balance probes are reproducible and do not change loaded configuration", () => {
    const before = copy(setups);
    for (const variant of variants) {
        variant.change(variant.setup);
        for (const strategy of strategies) {
            const result = simulate(variant.setup, strategy.choose);
            assert.deepEqual(simulate(variant.setup, strategy.choose), result);
            variantReport.push({ variant: variant.name, strategy: strategy.name, turns: result.actions.length,
                result: result.state.phase, hp: result.state.player.hp });
        }
    }
    assert.deepEqual(setups, before);
});
console.table(variantReport);
if (process.argv.includes("--show-battle-log")) {
    const manager = new Manager();
    manager.start(setups[0]);
    for (const id of [1, 1, 3]) {
        const preview = manager.previewAction(action(id));
        assert.ok(preview.ok);
        manager.confirmAction(action(id), preview.preview.token);
    }
    assert.equal(manager.state.phase, "victory");
    console.log("\nSample battle log:\n" + manager.logs.join("\n"));
    console.log(manager.printState());
}
test("UI preview and cancel never mutate the committed battle", () => {
    const m = new Manager(), p = new Presenter(m);
    p.open(setups[0]);
    const before = m.state;
    p.select(1);
    assert.ok(p.selection.ok);
    p.cancel();
    assert.deepEqual(m.state, before);
    p.select(3);
    assert.equal(p.selection.ok, false);
    assert.equal(p.confirm(), null);
    assert.deepEqual(m.state, before);
});
test("UI locks immediately and double confirm cannot advance another turn", () => {
    const m = new Manager(), p = new Presenter(m);
    p.open(setups[0]);
    p.select(1);
    const result = p.confirm();
    assert.ok(result.ok);
    assert.ok(p.busy);
    const committed = m.state;
    assert.equal(p.confirm(), null);
    p.select(2);
    p.cancel();
    assert.deepEqual(m.state, committed);
    result.events.forEach(event => p.applyEvent(event));
    p.finishPlayback();
    assert.deepEqual(p.display, committed);
    assert.equal(p.busy, false);
});
test("skipping every event prefix gives the identical committed snapshot", () => {
    for (let prefix = 0; prefix < 10; prefix++) {
        const m = new Manager(), p = new Presenter(m);
        p.open(setups[0]);
        p.select(1);
        const result = p.confirm();
        result.events.slice(0, prefix).forEach(event => p.applyEvent(event));
        p.finishPlayback();
        assert.deepEqual(p.display, m.state);
        const before = m.state;
        p.open(setups[0]);
        assert.deepEqual(p.display, before);
    }
});
test("stale selected token returns an error without a second action", () => {
    const m = new Manager(), p = new Presenter(m);
    p.open(setups[0]);
    p.select(1);
    m.confirmAction(action(1), m.previewAction(action(1)).preview.token);
    const before = m.state;
    assert.equal(p.confirm().ok, false);
    assert.match(p.message, /过期/);
    assert.deepEqual(m.state, before);
    assert.equal(p.busy, false);
});
test("victory, defeat, reopening and encounter restart are independent", () => {
    for (const id of [1, 3]) {
        const m = new Manager(), p = new Presenter(m);
        p.open(setups[id - 1]);
        for (let turn = 0; turn < 30 && p.display.phase === "player_input"; turn++) {
            p.select(1);
            const result = p.confirm();
            result.events.forEach(event => p.applyEvent(event));
            p.finishPlayback();
        }
        assert.equal(p.display.phase, "victory");
        const end = m.state;
        p.open(setups[id - 1]);
        assert.deepEqual(p.display, end);
        p.open(setups[id - 1], true);
        assert.equal(p.display.player.hp, 50);
        assert.notEqual(p.display.battleId, end.battleId);
    }
});
require("./skill-battle-supplies.test.cjs")({
    assert, test, setups, tables, Config, Rules, Manager, Presenter, copy, freeze, withTables, build,
});
require("./skill-battle-expedition.test.cjs")({
    assert, test, setups, tables, Config, Rules, Manager, Presenter, copy, freeze, withTables, build,
});
require("./skill-map.test.cjs")({
    assert, test, setups, tables, Config, Rules, Manager, Presenter, copy, freeze, withTables, build,
});
console.log(`\n${passed} tests passed; real config, battle rules, supplies, expedition and persistence verified.`);
