// Read-only audit of compiled modules and runtime config; all saves stay in memory.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const build = path.join(root, "bin/skill-battle-tests");
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
const load = name => require(path.join(build, "script", name));
const { Tables } = load("config/schema.js");
const ByteBuf = load("config/bright/serialization/ByteBuf.js").default;
const { ExpeditionConfigUtils } = load("module/expedition/utils/ExpeditionConfigUtils.js");
const { ExpeditionBuildUtils } = load("module/expedition/utils/ExpeditionBuildUtils.js");
const { ExpeditionManager } = load("module/expedition/manager/ExpeditionManager.js");
const { SkillBattleManager } = load("module/skillBattle/manager/SkillBattleManager.js");

function unpack(file) {
    const buffer = fs.readFileSync(file);
    let offset = 0;
    const uint32 = () => {
        assert.ok(offset + 4 <= buffer.length, "Truncated config package");
        const value = buffer.readUInt32LE(offset);
        offset += 4;
        return value;
    };
    const count = uint32(), entries = new Map();
    assert.notEqual(count, 6666, "Compressed config requires the engine loader");
    for (let index = 0; index < count; index++) {
        const nameLength = uint32();
        const name = buffer.toString("utf8", offset, offset + nameLength);
        offset += nameLength;
        const length = uint32();
        assert.ok(offset + length <= buffer.length);
        assert.ok(!entries.has(name));
        entries.set(name, buffer.subarray(offset, offset + length));
        offset += length;
    }
    assert.equal(offset, buffer.length);
    return entries;
}

const clientPack = unpack(path.join(root, "assets/config/configbin.bin"));
const tables = new Tables(name => new ByteBuf(new Uint8Array(clientPack.get(name))));
const config = ExpeditionConfigUtils.read(tables, true, true);
config.requireBuildSelection = true;
function create(startingSkill = 1) {
    const storage = {
        value: null,
        read() { return this.value; },
        write(value) { this.value = value; },
    };
    const battle = new SkillBattleManager();
    const expedition = new ExpeditionManager(config, battle, storage);
    assert.equal(expedition.error, "");
    expedition.startNew(42);
    assert.ok(expedition.build.startCandidates.includes(startingSkill));
    expedition.chooseStartingSkill(startingSkill);
    return { expedition, battle, storage };
}

function withClock(now, fn) {
    const original = Date.now;
    Date.now = () => now;
    try { return fn(); } finally { Date.now = original; }
}

function fight(context, nodeId) {
    const { expedition, battle } = context;
    for (const id of [1, 2, 3])
        if (!expedition.build.activeSkills.some(skill => skill.skillId === id)) expedition.borrowActive(id);
    expedition.enterMapNode(nodeId);
    for (let turn = 0; battle.state.phase === "player_input" && turn < 100; turn++) {
        const state = battle.state;
        const options = [1, 3].map(skillId => battle.previewAction({ type: "skill", skillId }));
        const lethal = options.findIndex(result => result.ok && result.state.phase === "victory");
        const intent = expedition.setup.enemy.intents[state.enemyIntentIndex];
        const skillId = lethal >= 0 ? [1, 3][lethal] : state.swordQi >= 2 ? 3 : intent.damage > 0 ? 2 : 1;
        const action = { type: "skill", skillId };
        const preview = battle.previewAction(action);
        assert.ok(preview.ok, preview.reason);
        const result = battle.confirmAction(action, preview.preview.token);
        assert.ok(result.ok, result.reason);
    }
    assert.equal(battle.state.phase, "victory");
    if (expedition.run.pendingUpgradeChoices.length)
        expedition.chooseUpgrade(expedition.run.pendingUpgradeChoices[0]);
    expedition.returnToMap();
}

const probes = [];
function probe(id, requirement, fn) {
    try {
        probes.push({ id, requirement, ...fn() });
    } catch (error) {
        probes.push({ id, requirement, conforms: null, probeError: error.message });
    }
}

probe("B01", "Runtime battle carries HP and MP", () => {
    const { battle, expedition } = create();
    return { conforms: "mp" in battle.state.player || "mp" in battle.state,
        observation: { player: battle.state.player, skills: expedition.setup.skills.map(row => row.name) } };
});
probe("B02", "Common basic attack and guard exist independently of borrowed slots", () => {
    const { battle, expedition } = create(3);
    expedition.enterMapNode("b1");
    const basic = battle.previewAction({ type: "basic" });
    const guard = battle.previewAction({ type: "guard" });
    const borrowed = battle.previewAction({ type: "skill", skillId: 3 });
    return { conforms: basic.ok && guard.ok,
        observation: { basic: basic.reason, guard: guard.reason, onlyBorrowedSkill: borrowed.reason } };
});
probe("C01", "A purchased active upgrade changes the battle effect", () => {
    const { battle, expedition } = create();
    const before = battle.previewAction({ type: "skill", skillId: 1 }).preview.baseDamage;
    expedition.activeCandidates();
    expedition.skipActiveChoice();
    expedition.strengthenActive(1);
    const after = battle.previewAction({ type: "skill", skillId: 1 }).preview.baseDamage;
    return { conforms: after !== before,
        observation: { level: expedition.build.activeSkills[0].level, beforeDamage: before, afterDamage: after } };
});
probe("C02", "Claimed ChuZhao passive affects the first basic momentum gain", () => {
    const { battle, expedition } = create();
    const before = battle.previewAction({ type: "skill", skillId: 1 }).state.swordQi;
    expedition.awardDaoyun(30);
    assert.ok(expedition.passiveCandidates().includes(9101));
    expedition.claimPassive(9101);
    const after = battle.previewAction({ type: "skill", skillId: 1 }).state.swordQi;
    return { conforms: after > before,
        observation: { passiveIds: expedition.build.passiveIds, beforeMomentum: before, afterMomentum: after } };
});
probe("C03", "A normal victory automatically awards 10 daoyun", () => {
    const context = create();
    fight(context, "b1");
    return { conforms: context.expedition.build.daoyun === 10,
        observation: { afterNormalVictory: context.expedition.build.daoyun } };
});
probe("C04", "All passives collected stops daoyun accumulation", () => {
    const { expedition } = create();
    const state = { ...expedition.build, passiveIds: config.build.passives.map(row => row.id) };
    const after = ExpeditionBuildUtils.awardDaoyun(state, 10, config.build);
    return { conforms: after.daoyun === state.daoyun,
        observation: { before: state.daoyun, after: after.daoyun } };
});
probe("M01", "A battle commit at the deadline fails the run", () => {
    const { expedition, battle } = create();
    expedition.enterMapNode("b1");
    const action = { type: "skill", skillId: 1 };
    const preview = battle.previewAction(action);
    const result = withClock(expedition.map.deadlineAt, () => battle.confirmAction(action, preview.preview.token));
    return { conforms: !result.ok && expedition.run.phase === "failed",
        observation: { accepted: result.ok, phase: expedition.run.phase, revision: battle.state.revision } };
});
probe("M02", "Explicit timeout can settle an in-progress battle", () => {
    const { expedition } = create();
    expedition.enterMapNode("b1");
    let error = "";
    try { expedition.expireMap(expedition.map.deadlineAt); } catch (failure) { error = failure.message; }
    return { conforms: expedition.run.phase === "failed",
        observation: { error, phase: expedition.run.phase } };
});
probe("M03", "Extraction committed at the deadline cannot succeed", () => {
    const context = create(), { expedition } = context;
    fight(context, "b1");
    fight(context, "b2");
    expedition.enterMapNode("borrow1");
    if (expedition.build.pendingActiveCandidateIds.length) expedition.skipActiveChoice();
    for (const nodeId of ["b2", "b1", "extract-mid"]) expedition.enterMapNode(nodeId);
    const result = withClock(expedition.map.deadlineAt, () => expedition.extractMap("extract-mid"));
    return { conforms: !result && expedition.run.phase === "failed",
        observation: { accepted: result, phase: expedition.run.phase } };
});
probe("M04", "A used recovery point commits HP restoration", () => {
    const context = create(), { expedition } = context;
    fight(context, "b1");
    fight(context, "b2");
    expedition.enterMapNode("borrow1");
    if (expedition.build.pendingActiveCandidateIds.length) expedition.skipActiveChoice();
    const beforeHp = expedition.run.battle.player.hp;
    assert.ok(beforeHp < expedition.run.battle.player.maxHp, "Recovery fixture must be injured");
    let error = "";
    try { expedition.enterMapNode("recovery1"); } catch (failure) { error = failure.message; }
    return { conforms: expedition.run.battle.player.hp > beforeHp,
        observation: { beforeHp, afterHp: expedition.run.battle.player.hp, error } };
});
probe("M05", "Search reveals items sequentially with resumable progress", () => {
    const context = create(), { expedition } = context;
    fight(context, "b1");
    expedition.enterMapNode("start");
    const beforeCount = expedition.run.loot.length;
    expedition.enterMapNode("search1");
    return { conforms: !expedition.map.resolvedIds.includes("search1") && expedition.run.loot.length === beforeCount,
        observation: { beforeCount, afterCount: expedition.run.loot.length,
            resolvedImmediately: expedition.map.resolvedIds.includes("search1"),
            runKeys: Object.keys(expedition.run) } };
});
probe("I01", "Failure removes all equipped weapons", () => {
    const { expedition } = create();
    expedition.expireMap(expedition.map.deadlineAt);
    return { conforms: expedition.snapshot.profile.weaponId === 0 || expedition.snapshot.profile.weaponId === null,
        observation: { phase: expedition.run.phase, retainedWeaponId: expedition.snapshot.profile.weaponId } };
});
probe("D01", "Config-project and client packages contain identical table data", () => {
    const sourcePack = unpack(path.resolve(root, "../config/configbin.bin"));
    const different = [...new Set([...sourcePack.keys(), ...clientPack.keys()])].filter(name =>
        !sourcePack.has(name) || !clientPack.has(name) || !sourcePack.get(name).equals(clientPack.get(name)));
    return { conforms: different.length === 0, observation: { differentTables: different } };
});

console.log(JSON.stringify({
    date: "2026-11-09",
    node: process.version,
    scope: "Compiled runtime and exported config only; memory-only saves; not a full acceptance suite",
    runtime: {
        tables: Tables.getTableNames(),
        skillTable: tables.skill.getDataList(),
        skills: config.encounters[0].skills.map(row => ({ id: row.id, name: row.name, qiCost: row.qiCost })),
        passives: config.build.passives,
    },
    probes,
    totals: {
        conforms: probes.filter(row => row.conforms === true).length,
        gaps: probes.filter(row => row.conforms === false).length,
        probeErrors: probes.filter(row => row.conforms === null).length,
    },
}, null, 2));
if (probes.some(row => row.conforms === null)) process.exitCode = 1;
