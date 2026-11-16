const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, ".."), build = path.join(root, "bin/gameplay-tests/script");
global.Laya = { Resource: class {}, Byte: class {
    constructor(bytes) { this.bytes = Buffer.from(bytes); this.pos = 0; }
    readUTFBytes(n) { const s = this.bytes.toString("utf8", this.pos, this.pos + n); this.pos += n; return s; }
} };
const load = file => require(path.join(build, file));
const { Tables } = load("config/schema.js"), ByteBuf = load("config/bright/serialization/ByteBuf.js").default;
const { ExpeditionRunConfigUtils: C } = load("module/expedition/utils/ExpeditionRunConfigUtils.js");
const { ExpeditionRules: R } = load("module/expedition/utils/ExpeditionRules.js");
const { BuildConfigUtils: B } = load("module/build/utils/BuildConfigUtils.js");
const { ExpeditionRunManager: S } = load("module/expedition/manager/ExpeditionRunManager.js");
const { SkillBattleManager: M } = load("module/skillBattle/manager/SkillBattleManager.js");
function unpack(file) {
    const data = fs.readFileSync(file), blocks = {}; let at = 4;
    for (let i = 0; i < data.readUInt32LE(0); i++) {
        const size = data.readUInt32LE(at); at += 4;
        const key = data.toString("utf8", at, at + size); at += size;
        const length = data.readUInt32LE(at); at += 4; blocks[key] = data.subarray(at, at + length); at += length;
    }
    assert.equal(at, data.length); return blocks;
}
const blocks = unpack(path.join(root, "assets/config/configbin.bin"));
const cfg = C.read(new Tables(key => new ByteBuf(new Uint8Array(blocks[key])))), profile = B.profile(cfg.build);
const limits = {
    herb: [1, 3], ore: [1, 3], chestCommon: [1, 3], chestRefined: [0, 2], chestTreasure: [0, 1],
    cave: [0, 1], alchemy: [1, 2], forge: [0, 2], beast: [0, 2]
};
const allowed = {
    herb: ["herb"], ore: ["ore"], alchemy: ["hp", "mp", "herb"],
    forge: ["repair", "ore", "small", "container1", "container2", "container3", "container4", "weapon"],
    beast: ["hp", "mp", "herb", "small"]
};
const sums = Object.fromEntries(Object.keys(limits).map(key => [key, 0]));
const kinds = new Set(), signatures = new Set();
for (let seed = 1; seed <= 1024; seed++) {
    const state = R.apply(cfg, profile, R.start(cfg, profile, seed, "search-test"), { type: "enter" }, 1000, seed).state;
    const searches = state.map.nodes.filter(n => n.kind === "search");
    assert.ok(searches.length >= 8 && searches.length <= 12);
    assert.ok(state.map.nodes.length >= 45 && state.map.nodes.length <= 65);
    for (const [pool, [min, max]] of Object.entries(limits)) {
        const count = searches.filter(n => n.pool === pool).length;
        assert.ok(count >= min && count <= max, `${seed}/${pool}: ${count}`); sums[pool] += count;
    }
    assert.ok(searches.some(n => n.pool === "alchemy" && n.mainOrder >= 3 && n.mainOrder <= 10), "Early supply survives borrow insertion");
    signatures.add(searches.map(n => `${n.pool}:${n.x}:${n.y}`).join(";"));
    for (const node of searches) {
        kinds.add(node.pool);
        const snapshot = structuredClone(state); snapshot.node = node.id;
        R.makeSource(cfg, snapshot, seed);
        const box = R.source(snapshot), pool = cfg.pools.find(p => p.id === node.pool);
        assert.ok(box.entries.length >= pool.min && box.entries.length <= pool.max);
        const duplicate = structuredClone(state); duplicate.node = node.id; R.makeSource(cfg, duplicate, seed);
        assert.deepEqual(R.source(duplicate), box, "Same seed and source preserve results");
        assert.throws(() => R.makeSource(cfg, snapshot, seed), /已生成/);
        for (const item of box.entries) {
            assert.ok(item.uid.includes(node.key)); assert.equal(item.location.node, node.id);
            if (allowed[node.pool]) assert.ok(cfg.variants.some(v => allowed[node.pool].includes(v.family) && v.templateId === item.templateId));
        }
        if (node.pool === "alchemy") {
            assert.equal(box.entries.length, 3);
            assert.equal(cfg.templates.find(t => t.id === box.entries[0].templateId).kind, "hp");
            assert.equal(cfg.templates.find(t => t.id === box.entries[1].templateId).kind, "mp");
        }
    }
}
assert.equal(kinds.size, 9); assert.ok(signatures.size > 1000);
assert.ok(sums.herb > sums.chestTreasure * 3 && sums.ore > sums.cave * 2, "Common materials outnumber rare sites");
console.log("PASS 1024 maps: all 9 types, counts/caps, early alchemy, varied routes and deterministic matching loot", sums);

const data = new Map(), storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
const manager = () => new S(new M(), storage, () => 1100, cfg, () => 0);
const session = manager(); session.prepare(cfg, profile, 1); session.inventoryCommand({ type: "enter" });
while (session.flow.pending) { const p = session.flow.pending; session.dispatch({ type: "choose", source: p.source, id: p.candidates[0] }); }
session.mapCommand({ type: "debugEnemyBlocking", enabled: false });
const start = session.inventory, target = start.map.nodes.find(n => n.pool === "alchemy"), queue = [[start.node]], seen = new Set([start.node]);
let route;
for (const trail of queue) {
    const current = trail.at(-1); if (current === target.id) { route = trail; break; }
    for (const [a, b] of start.map.edges) {
        const next = a === current ? b : b === current ? a : null;
        if (next !== null && !seen.has(next)) { seen.add(next); queue.push([...trail, next]); }
    }
}
for (const id of route.slice(1)) session.mapCommand({ type: "travel", node: id });
const fixedEntries = R.source(session.inventory).entries;
session.openSource(); session.mapCommand({ type: "search", deltaMs: 250 });
const restored = manager(); assert.equal(restored.error, ""); assert.equal(restored.searching, false);
assert.deepEqual(restored.archive, session.archive);
while (R.source(restored.inventory).revealed < fixedEntries.length) restored.mapCommand({ type: "search", deltaMs: 250 });
assert.deepEqual(R.source(restored.inventory).entries, fixedEntries);
assert.equal(restored.inventory.items.filter(i => fixedEntries.some(e => e.uid === i.uid)).length, fixedEntries.length);
assert.deepEqual(manager().archive, restored.archive);
console.log("PASS actual travel/search commands: fixed arrival loot, partial progress, paused reload and no duplicate instances");

assert.ok(fs.readFileSync(path.join(root, "assets/config/configbin.bin")).equals(fs.readFileSync(path.join(root, "../config/configbin.bin"))));
assert.ok(fs.readFileSync(path.join(root, "src/script/config/schema.ts")).equals(fs.readFileSync(path.join(root, "../config/output_client/code/schema.ts"))));
for (const [key, bytes] of Object.entries(blocks)) assert.ok(bytes.equals(fs.readFileSync(path.join(root, "../config/output_client/data", key + ".bin"))));
const baseline = path.join(root, "tmp/config-export/search-sites/before-client.bin");
if (fs.existsSync(baseline)) {
    const before = unpack(baseline);
    assert.deepEqual(Object.keys(blocks).filter(k => !blocks[k].equals(before[k])).sort(),
        ["new_expedition_node", "new_expedition_pool", "new_expedition_rule"]);
}
console.log("PASS 43 exported tables and both clients synchronized; only the 3 intended blocks changed");
