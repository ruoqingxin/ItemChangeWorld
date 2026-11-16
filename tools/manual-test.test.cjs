const assert = require("node:assert/strict");
const path = require("node:path");
const base = path.resolve(__dirname, "../bin/manual-test/script/module/manualTest");
const { ManualTestRules: R } = require(path.join(base, "utils/ManualTestRules.js"));
const { ManualTestConfig: C } = require(path.join(base, "utils/ManualTestConfig.js"));
const { ManualTestManager: Manager } = require(path.join(base, "manager/ManualTestManager.js"));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function start(star = 0, rank = 0, style = "dummy") {
    const setup = C.defaults(); Object.assign(setup, { star, rank, style });
    setup.player.hp = 100000; setup.player.mp = 100000; setup.enemy.hp = 1000000;
    return R.start(setup);
}
function act(s, move, options = {}) {
    const r = R.resolve(s, { move, keep: false, ...options });
    assert.equal(r.ok, true, `${move}/${options.branch || ""}: ${r.reason}`);
    return r.state;
}
function put(s, kinds, age = 0, where = "sky") {
    const members = [...kinds].map(k => ({
        id: s.nextId++, kind: ({ e: "edge", g: "guard", i: "guide" })[k],
        age, returnedRound: 0,
    }));
    const g = { id: members[0].id, members, responded: false };
    s[where].push(g); return g;
}
test("31 valid progression states; cumulative branches and 30 growth nodes", () => {
    assert.equal(C.growth.flat().length, 30);
    for (let level = 0; level <= 30; level++) {
        const s = level ? start(Math.ceil(level / 6), (level - 1) % 6 + 1) : start();
        assert.equal(C.level(s.setup), level);
        assert.equal(R.capacity(s), level >= 30 ? 6 : level >= 18 ? 5 : level >= 6 ? 4 : 3);
        for (let j = 1; j <= 30; j++) assert.equal(C.has(s.setup, Math.ceil(j / 6), (j - 1) % 6 + 1), level >= j);
    }
    for (const [star, rank] of [[0, 1], [1, 0], [6, 1], [1, 7], [-1, 0]]) {
        assert.throws(() => R.start({ ...C.defaults(), star, rank }));
    }
});
test("one action costs one point; enemy follows third action; no extra transition charge", () => {
    let s = start(); s = act(s, "edge"); assert.equal(s.ap, 2); assert.equal(s.round, 1);
    s = act(s, "wind"); assert.equal(s.ap, 1);
    s = act(s, "guide"); assert.equal(s.ap, 3); assert.equal(s.round, 2);
    assert.deepEqual(s.sky.map(g => g.members[0].age), [1, 1, 1]);
    assert.equal(s.player.mp, 100000 - 16);
    assert.equal(s.logs.filter(l => /敌行动/.test(l)).length, 3);
});
test("three maturity ticks stop passive income; no recursive replay or overflow", () => {
    let s = start(); put(s, "e"); put(s, "g"); put(s, "i");
    for (let i = 0; i < 3; i++) s = act(s, "end");
    assert.deepEqual(s.sky.map(g => g.members[0].age), [3, 3, 3]);
    const damage = s.totals.damage;
    s = act(s, "end"); assert.equal(s.totals.damage, damage);
    s = act(s, "edge"); assert.equal(s.sky.length, 3);
    assert.equal(s.nextId, 5, "only the manual action generated one shadow");
});
test("preview is pure; invalid branches, targets, low mana and full-hp medicine reject atomically", () => {
    let s = start(); const before = R.clone(s);
    assert.equal(R.resolve(s, { move: "edge", keep: false }).ok, true); assert.deepEqual(s, before);
    for (const a of [{ move: "edge", branch: "copy" }, { move: "wind", branch: "ambush", target: 123 }, { move: "heal" }]) {
        const result = R.resolve(s, { keep: false, ...a }); assert.equal(result.ok, false); assert.deepEqual(result.state, before);
    }
    s.player.mp = 0; assert.equal(R.resolve(s, { move: "edge", keep: false }).ok, false);
});
test("medicine shares one per-turn chance, costs no AP; stale double confirm rejected", () => {
    const m = new Manager(); assert.equal(m.start(), true);
    m.data.state.player.hp -= 100; m.data.state.player.mp -= 100;
    let r = m.commit({ move: "heal", keep: false }, 0); assert.equal(r.ok, true); assert.equal(m.state.ap, 3);
    assert.equal(m.commit({ move: "mana", keep: false }, 1).ok, false);
    r = m.commit({ move: "edge", keep: false }, 1); assert.equal(r.ok, true);
    const state = R.clone(m.state); assert.equal(m.commit({ move: "edge", keep: false }, 1).ok, false);
    assert.deepEqual(m.state, state);
});
test("root protected overflow; reorder retains identity and age; old root can become mature", () => {
    let s = start(1, 6);
    const root = put(s, "e", 6); put(s, "g"); put(s, "i"); put(s, "e");
    s = act(s, "edge");
    assert.equal(s.sky[0].id, root.id); assert.equal(s.sky[0].members[0].age, 6);
    s = act(s, "guide", { branch: "pluck", target: s.sky[3].id });
    s = act(s, "wind", { branch: "reorder", target: s.sky[1].id });
    const old = s.sky.find(g => g.id === root.id); assert.equal(old.members[0].age, 6); assert.ok(R.mature(s, old, old.members[0]));
});
test("formation compresses before overflow and copies no ages; can assemble third shadow on cast", () => {
    let s = start(2, 6); put(s, "e", 3); put(s, "e", 1); const id = s.sky[0].id;
    s = act(s, "edge", { form: id });
    assert.equal(s.sky.length, 1); assert.equal(R.used(s.sky), 2);
    assert.deepEqual(s.sky[0].members.map(x => x.age), [3, 1, 0]);
    assert.equal(R.array(s.sky[0]), "万锋");
});
test("six slots hold eight distinct shadows; cache counts slots not member count", () => {
    const s = start(5, 6); put(s, "eee"); put(s, "ggi"); s.sky[1].members[2].kind = "guard";
    put(s, "e"); put(s, "i");
    assert.equal(R.used(s.sky), 6); assert.equal(s.sky.flatMap(g => g.members).length, 8);
    R.validateState(s);
});
test("second response prepares reduction for third enemy action, not second", () => {
    let s = start(3, 6, "assault"); put(s, "g"); put(s, "g"); put(s, "i"); s.player.defense = 0;
    s = act(s, "end");
    assert.ok(s.logs.some(l => /敌行动3.*截招/.test(l)));
    assert.ok(!s.logs.some(l => /敌行动2.*截招/.test(l)));
    assert.equal(s.logs.filter(l => /应剑$/.test(l)).length, 2);
    assert.equal(s.totals.taken, 64 + 64 + 105);
});
test("mature groups do not auto respond; paid ambush can use mature group", () => {
    let s = start(3, 6, "assault"); put(s, "g", 6); put(s, "e", 3); put(s, "i", 3);
    const before = act(s, "end"); assert.equal(before.logs.filter(l => /应剑$/.test(l)).length, 0);
    s = act(s, "wind", { branch: "ambush", target: s.sky[0].id }); s = act(s, "end");
    assert.ok(s.logs.some(l => /玄壁|守影.*应剑/.test(l)));
});
test("delayed batch counts one response and honors chosen action", () => {
    let s = start(3, 6, "assault"); put(s, "e"); put(s, "g"); put(s, "i");
    s = act(s, "fall", { branch: "delay", enemyAction: 2 });
    assert.ok(s.delayed); s = act(s, "end"); assert.equal(s.delayed, null);
    const action2 = s.logs.findIndex(l => /敌行动2/.test(l)), fall = s.logs.findIndex(l => /落剑 伤害/.test(l));
    assert.ok(fall > action2);
    assert.equal(s.sky.length, 0);
});
test("absorb from formation transfers one identity and remaining members fall", () => {
    let s = start(4, 6); const g = put(s, "egi", 3), id = g.members[0].id;
    s = act(s, "fall", { absorb: id });
    assert.equal(s.body.length, 1); assert.equal(s.body[0].id, id); assert.equal(s.sky.length, 0);
    assert.equal(s.energy, 2, "absorption and actual fall share the two-yuan active cap");
    R.validateState(s);
});
test("absorption pays entry effect and yuan, not a cache copy; release spends pool once", () => {
    let s = start(5, 6); const g = put(s, "e", 3);
    s = act(s, "fall", { absorb: g.members[0].id });
    assert.equal(s.body.length, 1); assert.equal(s.energy, 1); assert.equal(s.cache.length, 0);
    assert.equal(s.totals.damage, 60);
    s.body.push(...putBody(s, "gi")); s.energy = 9;
    const before = s.totals.damage; s = act(s, "guide", { branch: "release" });
    assert.equal(s.energy, 0); assert.equal(s.body.length, 3); assert.equal(s.totals.damage - before, 555);
});
function putBody(s, kinds) {
    const members = [...kinds].map(k => ({
        id: s.nextId++, kind: ({ e: "edge", g: "guard", i: "guide" })[k], age: 3, returnedRound: 0,
    })); return members;
}
test("full sky does not auto-return/overflow; cached identity survives; one progress per round", () => {
    let s = start(5, 6); for (let i = 0; i < 6; i++) put(s, "e", 3);
    const cached = put(s, "g", 3, "cache");
    s = act(s, "end"); assert.ok(s.cache.some(g => g.id === cached.id)); assert.equal(R.used(s.sky), 6);
    s = act(s, "guide", { branch: "pluck", target: s.sky[1].id });
    const replacement = s.sky[1].id;
    s = act(s, "wind", { branch: "recall", target: cached.id, other: replacement });
    const returned = s.sky.find(g => g.id === cached.id); assert.equal(returned.members[0].returnedRound, s.round); assert.equal(returned.members[0].age, 1);
    s = act(s, "guide", { branch: "pluck", target: cached.id });
    // A new round was begun by the third AP, so repeat within a separately controlled round.
    s.ap = 3;
    if (s.cache.some(g => g.id === cached.id)) {
        const orbit = s.orbit;
        s = act(s, "wind", { branch: "recall", target: cached.id, other: s.sky[1]?.id });
        assert.ok(s.orbit <= orbit + 1);
    }
    R.validateState(s);
});
test("finisher is optional, once per battle; no clones, yuan or return progress generated", () => {
    let s = start(5, 6); for (let i = 0; i < 6; i++) put(s, "e", 3);
    s.energy = 6; s.orbit = C.orbitNeed; const ids = s.sky.map(g => g.id), next = s.nextId;
    s = act(s, "fall", { branch: "finish" });
    assert.deepEqual(s.sky.map(g => g.id), ids); assert.equal(s.energy, 6); assert.equal(s.nextId, next);
    assert.equal(s.finisherUsed, true); assert.equal(s.sky[0].members[0].returnedRound, 0);
    assert.equal(R.resolve(s, { move: "fall", branch: "finish", keep: false }).ok, false);
});
test("same-round re-return cannot duplicate progress; reverse replay is not a second fall", () => {
    let s = start(5, 6); const g = put(s, "e", 3, "cache");
    s = act(s, "wind", { branch: "recall", target: g.id });
    assert.equal(s.sky.find(x => x.id === g.id).members[0].returnedRound, s.round);
    s = act(s, "guide", { branch: "pluck", target: g.id });
    assert.equal(s.cache.find(x => x.id === g.id).members[0].returnedRound, s.round);
    s.ap = 3; s.energy = C.reverseEnergy;
    s = act(s, "guide", { branch: "reverse", target: g.id });
    assert.equal(s.sky.find(x => x.id === g.id).members[0].returnedRound, s.round);
    assert.equal(s.sky.filter(x => x.id === g.id).length, 1);
    assert.equal(s.orbit, 1, "same-round return cannot farm finisher charge");
});
test("batch maturity and qi-luo are snapshot values, not affected by falling head", () => {
    let s = start(2, 4); put(s, "e", 6); put(s, "e", 3);
    const before = s.totals.damage;
    s = act(s, "fall");
    // Mature root liberation doubles only the root; batch adjacency applies once.
    assert.equal(s.totals.damage - before, 330 + 132);
});
test("point-break requires an immature guide member; it wins priority over ambush", () => {
    let s = start(3, 6, "assault"); const g = put(s, "egi", 3); g.members[0].age = 0;
    // The head is a six-age root, so move it out of root position before checking maturity.
    s.sky.unshift({ id: s.nextId, responded: false, members: putBody(s, "e") });
    assert.equal(R.resolve(s, { move: "guide", branch: "pinpoint", target: g.id, keep: false }).ok, false);
    g.members[2].age = 0;
    s = act(s, "guide", { branch: "pinpoint", target: g.id });
    s = act(s, "wind", { branch: "ambush", target: s.sky[0].id }); s = act(s, "end");
    const responseLog = s.logs.find(l => /应剑$/.test(l));
    assert.ok(responseLog.includes("三才"));
});
test("shield cap/expiry and xuan-bi retention; body guard appears after expiry", () => {
    let s = start(4, 6); put(s, "ggg");
    s.player.shield = R.h(s) * 3; s.body = putBody(s, "g");
    s = act(s, "end");
    assert.equal(s.player.shield, R.h(s) + Math.round(R.h(s) * 0.5 * (1 + s.energy * 0.05)));
    s = start(0, 0); s.player.shield = 180; s = act(s, "end"); assert.equal(s.player.shield, 0);
});
test("cache eviction is disappearance, not recursive damage; return rejection rolls back", () => {
    let s = start(5, 6);
    for (let i = 0; i < 6; i++) put(s, "e", 3, "cache");
    const oldest = s.cache[0].id, g = put(s, "e", 3);
    s = act(s, "guide", { branch: "pluck", target: g.id });
    assert.equal(s.cache.length, 6); assert.ok(!s.cache.some(x => x.id === oldest));
    for (let i = 0; i < 6; i++) put(s, "g");
    const result = R.resolve(s, { move: "wind", branch: "recall", target: s.cache[0].id,
        other: s.sky[0].id, keep: false });
    assert.equal(result.ok, false); assert.deepEqual(result.state, s);
});
test("enemy mana settings change its visible plan without hidden failed casts", () => {
    const setup = C.defaults(); setup.style = "defensive"; setup.enemy.mp = 0;
    let s = R.start(setup);
    assert.equal(s.intentions[0].kind, "wait"); assert.equal(s.intentions[2].kind, "wait");
    s = act(s, "end"); assert.equal(s.enemy.mp, 0);
});
test("burst charge survives the probing round; next-round heavy amount is visible", () => {
    let s = start(0, 0, "burst");
    s = act(s, "end");
    assert.equal(s.enemy.charged, true); assert.equal(s.intentions[2].percent, 330);
    const before = s.totals.taken; s = act(s, "end");
    assert.equal(s.totals.taken - before, 100 + 120 + 330);
    assert.equal(s.enemy.charged, false);
});
test("delayed absorption preserves the identities of remaining array members", () => {
    let s = start(4, 6), g = put(s, "egi", 3), id = g.members[0].id;
    s = act(s, "fall", { branch: "delay", enemyAction: 2, absorb: id });
    assert.equal(s.body[0].id, id); assert.equal(s.delayed.ids.length, 2);
    s = act(s, "end");
    assert.equal(s.sky.length, 0); assert.equal(s.body[0].id, id); assert.equal(s.delayed, null);
});
test("one identity cannot be kept as root and absorbed by the same declaration", () => {
    const s = start(4, 6), g = put(s, "e", 3); put(s, "g", 3);
    const r = R.resolve(s, { move: "fall", keep: true, absorb: g.id });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
});
test("first reorder echoes immediately once; later reorder cannot duplicate its reward", () => {
    let s = start(1, 3); const root = put(s, "g"), edge = put(s, "e");
    s = act(s, "wind", { branch: "reorder", target: edge.id });
    assert.equal(s.totals.damage, 15); assert.equal(s.firstReorder, true);
    s = act(s, "wind", { branch: "reorder", target: root.id });
    assert.equal(s.logs.filter(l => l.includes("移剑余响")).length, 1);
});
test("mature pluck renews the harvested type; young pluck does not", () => {
    let s = start(1, 5); const ripe = put(s, "e", 3), young = put(s, "e", 1);
    s = act(s, "guide", { branch: "pluck", target: ripe.id });
    assert.equal(s.sky.at(-1).members[0].kind, "edge");
    assert.equal(s.sky.at(-1).members[0].age, 0);
    const next = s.nextId; s = act(s, "guide", { branch: "pluck", target: young.id });
    assert.equal(s.nextId, next);
});
test("copy inherits up to two ages without copying identity; keep ages root only once", () => {
    let s = start(2, 3); const root = put(s, "e", 1); put(s, "g", 3);
    s = act(s, "edge", { branch: "copy", kind: "guard" });
    assert.equal(s.sky.at(-1).members[0].age, 2);
    assert.equal(s.sky.at(-1).members[0].kind, "guard");
    s = act(s, "fall", { keep: true });
    assert.equal(s.sky[0].id, root.id); assert.equal(s.sky[0].members[0].age, 2);
    put(s, "g");
    s = act(s, "fall", { keep: true });
    assert.ok(s.logs.filter(l => l.includes("留锋养势")).length === 1);
    R.validateState(s);
});
test("two-age body entry has immediate distinct effects; one-age entry rejects atomically", () => {
    for (const [kind, type] of [["e", "edge"], ["g", "guard"], ["i", "guide"]]) {
        let s = start(4, 1); const g = put(s, kind, 2);
        s = act(s, "fall", { absorb: g.id });
        assert.equal(s.body[0].kind, type); assert.equal(s.ap, 2);
        if (type === "edge") assert.equal(s.totals.damage, 60);
        if (type === "guard") assert.equal(s.player.shield, R.h(s));
        if (type === "guide") assert.equal(s.marks, 2);
    }
    const s = start(4, 1), young = put(s, "e", 1);
    const r = R.resolve(s, { move: "fall", absorb: young.id, keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
});
test("body release requires three yuan and cannot become a free repeated base strike", () => {
    let s = start(4, 5); s.body = putBody(s, "e"); s.energy = 2;
    let r = R.resolve(s, { move: "guide", branch: "release", keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
    s.energy = 3; s = act(s, "guide", { branch: "release" });
    assert.equal(s.totals.damage, 185); assert.equal(s.energy, 0);
    r = R.resolve(s, { move: "guide", branch: "release", keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
});
test("reverse spends four shared yuan, is once per turn, and failures are atomic", () => {
    let s = start(5, 6); const g = put(s, "eee", 0, "cache"); s.energy = 3;
    let r = R.resolve(s, { move: "guide", branch: "reverse", target: g.id, keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
    s.energy = 9; s = act(s, "guide", { branch: "reverse", target: g.id });
    assert.equal(s.energy, 6); assert.equal(s.reverseUsed, true); assert.equal(s.orbit, 3);
    s = act(s, "guide", { branch: "pluck", target: g.id });
    const before = R.clone(s);
    r = R.resolve(s, { move: "guide", branch: "reverse", target: g.id, keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, before);
    s = act(s, "end"); assert.equal(s.reverseUsed, false);
});
test("point-break reserved for action three survives earlier automatic responses", () => {
    let s = start(3, 6, "burst"); const guide = put(s, "i", 1);
    s.round = 2; s.enemy.charged = true; s.intentions = R.intents(s); s.player.defense = 0;
    s = act(s, "guide", { branch: "pinpoint", target: guide.id, enemyAction: 3 });
    s = act(s, "end");
    const index = s.logs.findIndex(l => l.includes("引影 #1 应剑"));
    const action3 = s.logs.findIndex(l => /敌行动3/.test(l));
    assert.ok(index > action3);
    assert.ok(s.logs.some(l => /点破：敌第3行动削弱30%/.test(l)));
    assert.equal(s.totals.taken, 100 + 120 + 231);
});
test("mature ambush waits for the selected action; invalid appointment rolls back", () => {
    let s = start(3, 6, "assault"); const g = put(s, "e", 6);
    let r = R.resolve(s, { move: "wind", branch: "ambush", target: g.id, enemyAction: 4, keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
    s = act(s, "wind", { branch: "ambush", target: g.id, enemyAction: 3 });
    s = act(s, "end");
    assert.ok(s.logs.findIndex(l => l.includes("锋影 #1 应剑")) >
        s.logs.findIndex(l => /敌行动3/.test(l)));
});
test("one array response advances cut by two, without duplicating echo or response yuan", () => {
    let s = start(4, 6, "assault"); put(s, "eee", 0); s.player.defense = 0;
    s = act(s, "end");
    assert.equal(s.logs.filter(l => /应剑$/.test(l)).length, 1);
    assert.ok(s.logs.some(l => /敌行动2.*截招/.test(l)));
    assert.equal(s.totals.taken, 80 + 60 + 140);
    assert.equal(s.energy, 1);
});
test("finisher uses normal accumulated charge and cache without full sky", () => {
    let s = start(5, 6); const g = put(s, "eee", 0, "cache");
    s.orbit = C.orbitNeed; const before = R.clone(s.cache);
    assert.equal(R.finisherReady(s), true);
    s = act(s, "fall", { branch: "finish" });
    assert.equal(s.totals.damage, 662); assert.deepEqual(s.cache, before);
    assert.equal(s.sky.length, 0); assert.equal(s.orbit, 0); assert.equal(s.energy, 0);
    assert.equal(s.finisherUsed, true); assert.equal(g.members[0].returnedRound, 0);
});
test("finisher rejects insufficient charge or participants without spending AP or mana", () => {
    let s = start(5, 6); put(s, "eee", 0, "cache"); s.orbit = 11;
    let r = R.resolve(s, { move: "fall", branch: "finish", keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
    s.orbit = 12; s.cache = [];
    r = R.resolve(s, { move: "fall", branch: "finish", keep: false });
    assert.equal(r.ok, false); assert.deepEqual(r.state, s);
});
test("natural two-return loop unlocks finisher without injected shadow, age or charge", () => {
    let s = start(5, 6);
    for (let i = 0; i < 6; i++) s = act(s, "edge");
    assert.equal(s.round, 3); assert.equal(s.orbit, 0);
    for (let i = 0; i < 2; i++) {
        s = act(s, "basic"); s = act(s, "basic"); s = act(s, "fall");
    }
    assert.equal(s.round, 5); assert.equal(s.orbit, C.orbitNeed);
    assert.ok(s.sky.every(g => g.members.every(x => x.returnedRound === 5)));
    assert.equal(R.finisherReady(s), true);
    s = act(s, "fall", { branch: "finish" });
    assert.equal(s.finisherUsed, true); R.validateState(s);
});
test("automatic triad echo shares paid-action budget with first reorder and urge", () => {
    let s = start(3, 6); put(s, "egi"); const edge = put(s, "e");
    s = act(s, "wind", { branch: "reorder", target: edge.id });
    assert.equal(s.logs.filter(l => l.includes("移剑余响")).length, 1);
    assert.equal(s.logs.filter(l => l.includes("三才随式余响")).length, 0);
    s = act(s, "edge", { branch: "urge" });
    assert.equal(s.logs.filter(l => l.includes("三才随式余响")).length, 0);
});
test("killing hits cannot resurrect or overspend resources in later derived operations", () => {
    let s = start(5, 6); const g = put(s, "eee", 0, "cache"); s.energy = 4; s.enemy.hp = 1;
    s = act(s, "guide", { branch: "reverse", target: g.id });
    assert.equal(s.outcome, "victory"); assert.equal(s.energy, 0); assert.equal(s.orbit, 0);
    s = start(5, 6, "assault"); put(s, "e", 0); s.enemy.hp = 40;
    s = act(s, "end");
    assert.equal(s.outcome, "victory"); assert.equal(s.energy, 0);
    s = start(4, 6); put(s, "e", 0); s.body = putBody(s, "e"); s.enemy.hp = 120;
    s = act(s, "edge", { branch: "copy" });
    assert.equal(s.outcome, "victory"); assert.equal(s.sky.length, 0); assert.equal(s.body.length, 0);
});
test("changing draft never hot-changes active setup; invalid drafts retain previous fight", () => {
    const m = new Manager(); m.start(); const before = R.clone(m.state);
    m.draft.star = 5; m.draft.rank = 6; m.draft.player.attack = 999;
    assert.deepEqual(m.state, before);
    m.draft.player.hp = NaN; assert.equal(m.start(), false); assert.deepEqual(m.state, before);
});
test("first-star urge advances age once, providing an early multi-round harvest loop", () => {
    let s = start(1, 1); const root = put(s, "e");
    s = act(s, "edge", { branch: "urge" });
    assert.equal(s.sky[0].members[0].age, 1);
    s = act(s, "edge", { branch: "urge" });
    assert.equal(s.sky[0].members[0].age, 1);
    s = act(s, "end");
    assert.equal(s.sky.find(g => g.id === root.id).members[0].age, 2);
    s = act(s, "edge", { branch: "urge" });
    assert.equal(s.logs.filter(l => l.includes("催锋养剑")).length, 2);
    assert.ok(s.logs.some(l => l.includes(`#${root.id}挤落`)), "no root protection before rank six");
});
test("mature root harvest doubles only the actual root, not young roots or side shadows", () => {
    let s = start(1, 6); put(s, "e", 6); put(s, "e", 3);
    s = act(s, "fall"); assert.equal(s.totals.damage, 300 + 120);
    assert.equal(s.logs.filter(l => l.includes("本命解放")).length, 1);
    s = start(1, 6); put(s, "e", 5); s = act(s, "fall");
    assert.equal(s.totals.damage, 110);
    s = start(1, 6); put(s, "g", 6); s = act(s, "fall");
    assert.equal(s.player.shield, 3 * R.h(s));
    s = start(1, 6); put(s, "i", 6); s = act(s, "fall");
    assert.equal(s.totals.damage, 240); assert.ok(s.logs.some(l => l.includes("剑痕 2层")));
});
test("mature harvest renews every type without copying the original identity or age", () => {
    for (const [kind, type] of [["e", "edge"], ["g", "guard"], ["i", "guide"]]) {
        let s = start(1, 5); const g = put(s, kind, 3);
        s = act(s, "guide", { branch: "pluck", target: g.id });
        assert.equal(s.sky.length, 1); assert.notEqual(s.sky[0].id, g.id);
        assert.equal(s.sky[0].members[0].kind, type); assert.equal(s.sky[0].members[0].age, 0);
    }
});
test("formation pays immediate resonance and each pure array changes its own active", () => {
    let s = start(2, 6); const first = put(s, "e"); put(s, "e");
    s = act(s, "edge", { form: first.id });
    assert.equal(s.logs.filter(l => l.includes("阵鸣")).length, 3);
    assert.ok(s.totals.damage > 100);
    s.enemy.shield = 1000; const before = s.totals.damage;
    s = act(s, "edge"); assert.equal(s.totals.damage - before, 50);
    s = start(2, 6); put(s, "ggg"); s = act(s, "wind");
    assert.equal(s.player.shield, Math.round(1.5 * R.h(s)));
    s = start(2, 6); put(s, "iii"); s = act(s, "guide");
    assert.equal(s.marks, 3); assert.equal(R.markCap(s), 8);
});
test("triad follows the new shadow type automatically with no extra target choice", () => {
    let s = start(2, 6); put(s, "egi");
    s = act(s, "edge");
    assert.equal(s.totals.damage, 115);
    assert.equal(s.logs.filter(l => l.includes("三才随式余响")).length, 1);
    s = act(s, "wind");
    assert.equal(s.logs.filter(l => l.includes("三才随式余响")).length, 2);
});
test("guide reads charge and cancels next-round charged heavy; wrong edge does not", () => {
    let s = start(3, 6, "burst"); put(s, "i");
    s = act(s, "end");
    assert.equal(s.enemy.charged, false); assert.equal(s.intentions[2].percent, 220);
    assert.ok(s.logs.some(l => l.includes("截断本次蓄力")));
    s = start(3, 6, "burst"); put(s, "e");
    s = act(s, "end");
    assert.equal(s.enemy.charged, true); assert.equal(s.intentions[2].percent, 330);
});
test("automatic responses do not farm wait actions; guide halves shield and healing", () => {
    let s = start(3, 6); put(s, "egi"); s = act(s, "end");
    assert.equal(s.logs.filter(l => /应剑$/.test(l)).length, 0);
    s = start(3, 6, "defensive"); s.player.defense = 0; s.enemy.hp -= 1000;
    put(s, "i"); put(s, "i"); s = act(s, "end");
    assert.equal(s.enemy.shield, 20);
    assert.equal(s.logs.filter(l => l.includes("架盾／调息削弱50%")).length, 2);
    assert.ok(s.logs.some(l => l.includes("敌恢复30")));
});
test("body types change sustainable basic, wind defense and guide cultivation", () => {
    let s = start(4, 1); s.body = putBody(s, "e");
    s = act(s, "basic");
    assert.equal(s.totals.damage, 135); assert.equal(s.player.mp, 100000);
    s = start(4, 1); s.body = putBody(s, "g");
    s = act(s, "wind"); assert.equal(s.player.shield, R.h(s) + Math.round(0.35 * R.h(s)));
    s = start(4, 1); s.body = putBody(s, "i"); put(s, "e");
    s = act(s, "guide"); assert.equal(s.sky[0].members[0].age, 1);
    s = act(s, "guide"); assert.equal(s.sky[0].members[0].age, 1);
});
test("fifth-star rank four shares one return progress and bounded yuan pool", () => {
    let s = start(5, 4); const group = put(s, "eee", 3, "cache");
    s = act(s, "wind", { branch: "recall", target: group.id });
    assert.equal(s.orbit, 3); assert.equal(s.energy, 1);
    assert.ok(s.sky[0].members.every(x => x.returnedRound === s.round && !("cycles" in x)));
    s = act(s, "guide", { branch: "pluck", target: group.id });
    assert.equal(s.energy, 2);
    s.ap = 3;
    s = act(s, "wind", { branch: "recall", target: group.id });
    assert.equal(s.orbit, 3); assert.equal(s.energy, 2);
    s = act(s, "end");
    s = act(s, "guide", { branch: "pluck", target: group.id });
    s = act(s, "wind", { branch: "recall", target: group.id });
    assert.equal(s.orbit, 6); assert.ok(s.energy <= 4);
});
test("formation kill stops later effects and future return timestamps are rejected", () => {
    let s = start(2, 6); const g = put(s, "e"); put(s, "e"); s.enemy.hp = 105;
    s = act(s, "edge", { form: g.id });
    assert.equal(s.outcome, "victory"); assert.equal(s.sky.length, 0); assert.equal(s.energy, 0);
    s = start(5, 6); put(s, "e").members[0].returnedRound = 2;
    assert.throws(() => R.validateState(s), /回升轮次/);
});
test("mature array members cannot grant free response roles through younger members", () => {
    let s = start(3, 6, "burst"); put(s, "e", 6); const g = put(s, "egi", 3);
    g.members[0].age = 0;
    s = act(s, "end");
    assert.equal(s.enemy.charged, true);
    assert.ok(!s.logs.some(l => l.includes("引影断法")));
    assert.ok(!s.logs.some(l => l.includes("守影卸力")));
});
test("paid pinpoint remains valid when guide body matures its target during the cast", () => {
    let s = start(4, 6, "burst"); put(s, "i", 5); s.body = putBody(s, "i");
    s = act(s, "guide", { branch: "pinpoint", target: s.sky[0].id, enemyAction: 1 });
    assert.equal(s.sky[0].members[0].age, 6);
    s = act(s, "end");
    assert.equal(s.enemy.charged, false);
    assert.ok(s.logs.some(l => l.includes("截断本次蓄力")));
});
test("victory/defeat clear combat-only resources and block new actions", () => {
    let s = start(5, 6); s.enemy.hp = 1; put(s, "e"); s = act(s, "edge");
    assert.equal(s.outcome, "victory"); assert.equal(s.sky.length, 0);
    assert.equal(R.resolve(s, { move: "basic", keep: false }).ok, false);
    s = start(0, 0, "assault"); s.player.hp = 1; s = act(s, "end"); assert.equal(s.outcome, "defeat");
});
test("long fights across 31 growth states × 4 enemy styles retain identities and finite logs", () => {
    let seed = 173, steps = 0;
    const rand = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    for (let level = 0; level <= 30; level++) for (const style of Object.keys(C.styles)) {
        let s = level ? start(Math.ceil(level / 6), (level - 1) % 6 + 1, style) : start(0, 0, style);
        for (let j = 0; j < 120 && s.outcome === "active"; j++) {
            const move = ["basic", "guard", "edge", "wind", "guide", "fall", "end"][rand(7)];
            const branches = C.branches(s.setup, move), branch = branches[rand(branches.length)].key;
            const targetRows = ["recall", "reverse"].includes(branch) ? s.cache : s.sky;
            const a = { move, branch, keep: false, target: targetRows[0]?.id, other: s.sky[1]?.id, enemyAction: 1 + rand(3) };
            const r = R.resolve(s, a);
            if (r.ok) s = r.state; else assert.deepEqual(r.state, s);
            R.validateState(s); assert.ok(s.logs.length <= 600); steps++;
        }
    }
    console.log(`  ${steps} multi-turn resolution attempts`);
});
console.log(`Manual test: ${passed} groups passed.`);
