// Deterministic probes against the production rules and exported configuration.
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

function runBalance({ Rules, Stats, ExpeditionManager, Manager, config }) {
    const copy = value => JSON.parse(JSON.stringify(value));
    const strategies = ["slash_only", "guard_then_thrust", "respond_to_intent"];
    const modes = ["none", "fire_on_slash", "fire_on_thrust", "earth_on_slash",
        "earth_on_thrust", "medicine_at_12_missing", "all_safe"];
    const action = (setup, state, strategy, mode) => {
        const intent = Rules.currentIntent(setup, state);
        const cost = Rules.qiCost(setup, state, 3);
        let skillId = strategy === "slash_only" ? 1 : strategy === "guard_then_thrust"
            ? state.swordQi >= cost ? 3 : 2
            : state.swordQi >= 2 && intent.interruptible ? 4 : state.swordQi >= cost
                ? 3 : intent.damage > 0 ? 2 : 1;
        const items = state.pouchSlots.filter(Boolean);
        const find = type => items.find(item => setup.items.find(row => row.itemId === item.itemId).useType === type);
        const pill = find("heal");
        if (["medicine_at_12_missing", "all_safe"].includes(mode) && pill &&
            state.player.maxHp - state.player.hp >= 12 && intent.damage <= 7)
            return { type: "use_item", itemUid: pill.itemUid };
        let stone;
        const basic = { type: "skill", skillId };
        if (mode === "all_safe") {
            if (skillId === 3 && Rules.previewAction(setup, state, basic).state.phase !== "victory")
                stone = find("fire_stone") || find("earth_stone");
        } else if ((mode.endsWith("_slash") && skillId === 1) || (mode.endsWith("_thrust") && skillId === 3))
            stone = find(mode.startsWith("fire") ? "fire_stone" : "earth_stone");
        return stone && state.weaponDurability >= setup.items.find(row => row.itemId === stone.itemId).durabilityCost
            ? { ...basic, stoneItemUid: stone.itemUid } : basic;
    };
    const battle = (setup, strategy, mode = "none", upgrades = []) => {
        const initial = new Manager().start(setup);
        initial.upgradeIds = upgrades.slice();
        if (mode === "none") initial.pouchSlots.fill(null);
        const record = { initial, actions: [] };
        let state = copy(initial);
        for (let turn = 0; state.phase === "player_input" && turn < 200; turn++) {
            const input = action(setup, state, strategy, mode);
            const result = Rules.resolveAction(setup, state, input);
            assert.ok(result.ok, result.reason);
            record.actions.push(input);
            state = result.state;
        }
        assert.notEqual(state.phase, "player_input", "Policy failed to terminate");
        const { logs, state: replayed, ...stats } = Stats.battle(record, setup);
        assert.deepEqual(replayed, state);
        return { enemy: setup.enemy.name, encounterId: setup.encounterId, strategy, mode, upgrades, ...stats,
            actions: record.actions };
    };
    const baseline = config.encounters.flatMap(setup => strategies.map(strategy => battle(setup, strategy)));
    const upgrades = config.upgrades.flatMap(upgrade => config.encounters.flatMap(setup =>
        strategies.map(strategy => ({ upgrade: upgrade.name, ...battle(setup, strategy, "none", [upgrade.id]) }))));
    const supplies = config.encounters.flatMap(setup => strategies.flatMap(strategy =>
        modes.slice(1).map(mode => battle(setup, strategy, mode))));
    // Fire Seed gets an extra probe with a fire stone instead of being judged only without supplies.
    const fireSeed = config.encounters.flatMap(setup => strategies.map(strategy =>
        battle(setup, strategy, "fire_on_thrust", [6])));
    const variants = [
        ["rabbit_hp_24", 1, setup => { setup.enemy.maxHp = 24; }],
        ["guard_hp_32", 2, setup => { setup.enemy.maxHp = 32; }],
        ["guard_sweep_10", 2, setup => { setup.enemy.intents[0].damage = 10; }],
    ].flatMap(([variant, index, change]) => strategies.map(strategy => {
        const setup = copy(config.encounters[index]); change(setup);
        return { variant, ...battle(setup, strategy) };
    }));
    const routes = [];
    const seeds = Array.from({ length: 32 }, (_, i) => Math.imul(i, 2654435761) >>> 0);
    for (const unlocked of [false, true]) for (const strategy of strategies)
        for (const mode of ["none", "all_safe"]) for (const seed of seeds) {
            const storage = { value: null, read() { return this.value; }, write(value) { this.value = value; } };
            const manager = new Manager(), expedition = new ExpeditionManager(config, manager, storage);
            const save = expedition.snapshot;
            if (unlocked) save.profile.collectionIds = [1];
            if (mode === "none") save.profile.pouchSlots.fill(null);
            storage.value = JSON.stringify(save);
            const e = new ExpeditionManager(config, manager, storage);
            e.startNew(seed);
            let turns = 0;
            while (!e.run.settled && turns < 600) {
                if (e.run.phase === "battle") {
                    const input = action(e.setup, manager.state, strategy, mode);
                    const preview = manager.previewAction(input);
                    const result = manager.confirmAction(input, preview.preview.token);
                    assert.ok(result.ok, result.reason); turns++;
                } else if (e.run.phase === "reward") {
                    // Fixed, declared preference; no search for the best possible route.
                    const preference = [3, 1, 5, 4, 2, 6];
                    e.chooseUpgrade(preference.find(id => e.run.pendingUpgradeChoices.includes(id)));
                } else e.continueNext();
            }
            assert.ok(e.run.settled);
            const report = e.run.report;
            routes.push({ unlocked, strategy, mode, seed, turns, outcome: report.outcome,
                exitEncounter: report.exitEncounter, hp: manager.state.player.hp,
                loot: report.broughtLoot.map(item => item.itemId),
                remainingSupplies: report.remainingPouch.filter(Boolean).length,
                durability: manager.state.weaponDurability, choices: report.choices,
                battles: report.battles.map(record => {
                    const setup = config.encounters.find(row => row.encounterId === record.initial.encounterId);
                    const { logs, state, ...stats } = Stats.battle(record, setup);
                    return stats;
                }) });
        }
    return { configuration: config, methodology: {
        strategies, modes, seeds, preference: [3, 1, 5, 4, 2, 6], actionLimit: 200,
        note: "Fixed policies, not optimal search or player-fun evidence. All routes continue until terminal.",
    }, baseline, upgrades, supplies, fireSeed, variants, routes };
}

function load() {
    global.Laya = { Resource: class {}, Byte: class {
        constructor(buffer) { this.bytes = Buffer.from(buffer); this.pos = 0; }
        readUTFBytes(length) { const text = this.bytes.toString("utf8", this.pos, this.pos + length); this.pos += length; return text; }
    } };
    const build = path.resolve(__dirname, "../bin/gameplay-tests/script");
    const get = file => require(path.join(build, file));
    const { Tables } = get("config/schema.js");
    const ByteBuf = get("config/bright/serialization/ByteBuf.js").default;
    const pack = fs.readFileSync(path.resolve(__dirname, "../assets/config/configbin.bin"));
    let offset = 0;
    const uint = () => { const value = pack.readUInt32LE(offset); offset += 4; return value; };
    const count = uint(), buffers = new Map();
    assert.notEqual(count, 6666);
    for (let i = 0; i < count; i++) {
        const length = uint(), name = pack.toString("utf8", offset, offset + length);
        offset += length; const size = uint();
        buffers.set(name, pack.subarray(offset, offset + size)); offset += size;
    }
    assert.equal(offset, pack.length);
    const tables = new Tables(name => new ByteBuf(new Uint8Array(buffers.get(name))));
    return {
        Rules: get("module/skillBattle/utils/SkillBattleFormulaUtils.js").SkillBattleFormulaUtils,
        Stats: get("module/expedition/utils/ExpeditionStatsUtils.js").ExpeditionStatsUtils,
        Manager: get("module/skillBattle/manager/SkillBattleManager.js").SkillBattleManager,
        ExpeditionManager: get("module/expedition/manager/ExpeditionManager.js").ExpeditionManager,
        config: get("module/expedition/utils/ExpeditionConfigUtils.js").ExpeditionConfigUtils.read(tables),
    };
}

if (require.main === module) {
    const context = load(), original = JSON.stringify(context.config);
    const result = runBalance(context);
    assert.deepEqual(runBalance(context), result, "Balance probes must be exactly reproducible");
    assert.equal(JSON.stringify(context.config), original, "Probes must not mutate production configuration");
    const output = path.resolve(process.argv[2] || path.join(__dirname, "../bin/skill-battle-balance.json"));
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
    console.table(result.baseline.map(({ enemy, strategy, rounds, result, endHp }) => ({ enemy, strategy, rounds, result, endHp })));
    const groups = new Map();
    for (const row of result.routes) {
        const key = `${row.unlocked ? "unlocked" : "initial"}/${row.strategy}/${row.mode}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    }
    console.table(Array.from(groups, ([group, rows]) => ({ group, runs: rows.length,
        success: rows.filter(row => row.outcome === "extracted").length,
        meanTurns: +(rows.reduce((sum, row) => sum + row.turns, 0) / rows.length).toFixed(2),
        meanHp: +(rows.reduce((sum, row) => sum + row.hp, 0) / rows.length).toFixed(2) })));
    console.log(`Reproduced ${result.baseline.length + result.upgrades.length + result.supplies.length +
        result.fireSeed.length + result.variants.length} independent battles and ${result.routes.length} routes twice.`);
    console.log(`Report data: ${output}`);
}
module.exports = { runBalance };
