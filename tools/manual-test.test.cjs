const assert = require("node:assert/strict");
const path = require("node:path");
const base = path.resolve(__dirname, "../bin/manual-test/script/module/manualTest");
const { ManualTestRules: R } = require(path.join(base, "utils/ManualTestRules.js"));
const { ManualTestConfig: C } = require(path.join(base, "utils/ManualTestConfig.js"));
const { ManualTestManager: Manager } = require(path.join(base, "manager/ManualTestManager.js"));
let passed = 0;
function test(name, fn) { fn(); passed++; console.log("PASS " + name); }
function start(level = 0, style = "dummy", extra = {}) {
    const d = C.defaults();
    Object.assign(d, level ? { star: Math.ceil(level / 6), rank: (level - 1) % 6 + 1 } : {}, { style }, extra);
    d.enemy.hp = 100000; return R.start(d);
}
function act(s, move, extra = {}) {
    const r = R.resolve(s, { move, ...extra }); assert.ok(r.ok, `${move}: ${r.reason}`); return r.state;
}
function reject(s, a) {
    const before = JSON.stringify(s), r = R.resolve(s, a);
    assert.equal(r.ok, false); assert.equal(JSON.stringify(s), before); assert.deepEqual(r.state, s);
}
function put(s, kinds, warm = false) {
    s.shadows = [...kinds].map(k => ({ id: s.nextId++, kind: { e: "edge", g: "guard", i: "guide" }[k], warm }));
    return s.shadows.map(x => x.id);
}
function win(s) { s.enemy.hp = 1; return act(s, "basic"); }
function reward(s, path = "edge") {
    return s.phase !== "reward" ? s : act(s, s.path === "none" ? "route" : "upgrade",
        { choice: s.path === "none" ? path : s.offers[0] });
}
test("31 states and all 30 cumulative gates", () => {
    assert.equal(C.growth.flat().length, 30); assert.equal(C.descriptions.flat().length, 30);
    for (let i = 0; i <= 30; i++) {
        const s = start(i); assert.equal(C.level(s.setup), i);
        for (let j = 1; j <= 30; j++) assert.equal(R.has(s, Math.ceil(j / 6), (j - 1) % 6 + 1), i >= j);
    }
    for (const [star, rank] of [[0, 1], [1, 0], [6, 1], [1, 7]])
        assert.throws(() => R.start({ ...C.defaults(), star, rank }));
});
test("invalid setup atomic; integer bounds and seed/supply validation", () => {
    for (const change of [{ battles: 0 }, { battles: 21 }, { seed: 0 }, { seed: 1.5 }, { manaPotions: -1 },
        { healPotions: 100 }, { openingKind: "bad" }, { style: "bad" }]) assert.throws(() => R.start({ ...C.defaults(), ...change }));
    const m = new Manager(); assert.ok(m.start()); const before = R.clone(m.state);
    m.draft.player.hp = NaN; assert.equal(m.start(), false); assert.deepEqual(m.state, before);
});
test("four skills immediately available and exactly three AP", () => {
    let s = start(); s = act(s, "edge"); assert.equal(s.ap, 2);
    s = act(s, "wind"); assert.equal(s.ap, 1); s = act(s, "fall");
    assert.equal(s.ap, 3); assert.equal(s.round, 2); assert.equal(s.fight.actions, 3);
    assert.equal(s.fight.mpSpent, 18); assert.equal(s.logs.filter(l => /敌行动/.test(l)).length, 3);
    assert.ok(R.resolve(start(), { move: "guide" }).ok);
});
test("warm only on next own turn; no age meter or free damage", () => {
    let s = start(); assert.equal(s.shadows[0].warm, false);
    s = act(s, "edge"); assert.ok(s.shadows.every(x => !x.warm));
    const damage = s.totals.damage; s = act(s, "end");
    assert.ok(s.shadows.every(x => x.warm)); assert.equal(s.totals.damage, damage);
    s = act(s, "end"); assert.equal(s.totals.damage, damage);
});
test("full board explicit replacement; replacement never harvests", () => {
    const s = start(); const ids = put(s, "eee", true);
    reject(s, { move: "edge" });
    const n = act(s, "edge", { replacementId: ids[1] });
    assert.equal(n.totals.damage, 90); assert.equal(n.shadows.length, 3);
    assert.ok(!n.shadows.some(x => x.id === ids[1])); assert.equal(n.totals.warmHarvested, 0);
});
test("selective harvest, duplicate/empty/missing IDs atomic", () => {
    const s = start(), ids = put(s, "egi");
    for (const shadowIds of [[], [ids[0], ids[0]], [999]]) reject(s, { move: "fall", shadowIds });
    const n = act(s, "fall", { shadowIds: [ids[0]] });
    assert.equal(n.shadows.length, 2); assert.equal(n.totals.damage, 70); assert.equal(n.ap, 2);
});
test("new shadows useful immediately; warming upgrades actual harvest", () => {
    let s = start(); put(s, "e"); assert.equal(act(s, "fall").totals.damage, 70);
    s.shadows[0].warm = true; assert.equal(act(s, "fall").totals.damage, 120);
    put(s, "g"); assert.equal(act(s, "fall").player.shield, 42);
});
test("medicine finite, no AP, shared limit, no overdraft", () => {
    let s = start(0, "dummy", { healPotions: 1, manaPotions: 1 }); s.player.hp = 600; s.player.mp = 100;
    s = act(s, "heal"); assert.equal(s.ap, 3); assert.equal(s.player.hp, 960); assert.equal(s.potions.heal, 0);
    reject(s, { move: "mana" }); s = act(s, "end"); s = act(s, "mana"); assert.equal(s.player.mp, 190);
    s = act(s, "end"); reject(s, { move: "heal" });
    reject(start(), { move: "heal" });
});
test("first star active and passive effects", () => {
    assert.equal(act(start(1), "edge").totals.damage, 105);
    const s = start(2); put(s, "e", true); assert.equal(act(s, "fall").totals.damage, 140);
    assert.equal(act(start(3), "wind").player.shield, 72);
    const t = start(4); put(t, "e"); assert.equal(act(t, "fall").totals.damage, 85);
    assert.equal(act(start(5), "guide").totals.damage, 65);
    assert.equal(start(6, "dummy", { openingKind: "guard" }).shadows[0].kind, "guard");
    assert.equal(start(5, "dummy", { openingKind: "guard" }).shadows[0].kind, "edge");
});
test("second star new-shadow/guard improvements and armor penetration", () => {
    let s = start(7); put(s, "e"); assert.equal(act(s, "fall").totals.damage, 95);
    s = start(8); put(s, "g"); assert.equal(act(s, "fall").player.shield, 60);
    s = start(9); s.enemy.shield = 100;
    assert.equal(act(s, "edge").totals.damage, 26);
});
test("guard retention and guide suppression growth", () => {
    let s = start(10); put(s, "g"); s = act(s, "guard"); s = act(s, "guard"); s = act(s, "end");
    assert.equal(s.player.shield, R.h(s));
    s = start(11); put(s, "i"); assert.equal(act(s, "fall", { enemyAction: 3 }).suppression[2], 30);
});
test("automatic arrays recognize three-same and triad, never arbitrary pair", () => {
    const s = start(12);
    for (const [kinds, name] of [["eee", "万锋"], ["ggg", "玄壁"], ["iii", "星罗"], ["egi", "三才"], ["eeg", ""]]) {
        put(s, kinds); assert.equal(R.array(s), name);
    }
    const low = start(11); put(low, "eee"); assert.equal(R.array(low), "");
});
test("all four arrays have actual effects", () => {
    let s = start(12); let ids = put(s, "eee"); s.enemy.shield = 100;
    assert.equal(act(s, "edge", { replacementId: ids[0] }).totals.damage, 52);
    s = start(12); ids = put(s, "ggg");
    assert.equal(act(s, "wind", { replacementId: ids[0] }).player.shield, 102);
    s = start(12); put(s, "iii"); assert.equal(act(s, "fall").suppression[0], 40);
    s = start(12); put(s, "egi"); assert.equal(act(s, "fall").totals.damage, 157);
});
test("third star active improvements and warm refund", () => {
    let s = start(13); s.enemy.charged = true; assert.equal(act(s, "edge").totals.damage, 130);
    s = start(14); put(s, "i"); assert.equal(act(s, "fall").totals.damage, 60);
    s = start(15); s.intentions[2] = { kind: "attack", percent: 330, label: "重击" };
    assert.equal(act(s, "wind").player.shield, 87);
    s = start(16); put(s, "eee", true); assert.equal(act(s, "fall").player.mp, 294);
    s = start(17); put(s, "i"); assert.equal(act(s, "fall").totals.damage, 100);
});
test("delayed harvest locked identities and correct enemy action", () => {
    let s = start(18, "assault"); const ids = put(s, "eig", true);
    s = act(s, "fall", { branch: "delay", shadowIds: [ids[1]], enemyAction: 3 });
    reject(s, { move: "fall", shadowIds: [ids[1]] });
    reject(s, { move: "edge", replacementId: ids[1] });
    reject(s, { move: "fall", branch: "delay", shadowIds: [ids[0]] });
    s = act(s, "end");
    const enemy3 = s.logs.findIndex(l => l.includes("敌行动3"));
    assert.ok(s.logs.findIndex(l => l.includes("引影收剑")) > enemy3);
    assert.ok(s.logs.some(l => l.includes("削弱45%"))); assert.equal(s.delayed, null);
    reject(start(17), { move: "fall", branch: "delay" });
});
test("warm guide interruption affects next turn's advertised heavy attack", () => {
    let s = start(0, "burst"); put(s, "i", true); s = act(s, "fall"); s = act(s, "end");
    assert.equal(s.enemy.charged, false); assert.equal(s.intentions[2].percent, 220);
    s = start(0, "burst"); put(s, "i"); s = act(s, "fall"); s = act(s, "end");
    assert.equal(s.enemy.charged, true); assert.equal(s.intentions[2].percent, 330);
});
test("suppression max not multiplication, timing and cap", () => {
    let s = start(30, "assault"); s.path = "guide"; s.upgrades = ["pressure"];
    put(s, "iii", true); s = act(s, "fall", { enemyAction: 3 });
    assert.equal(s.suppression[2], 65); assert.equal(s.suppression[0], 0);
    s = act(s, "end"); assert.equal(s.suppression[2], 0);
});
test("fourth star active improvements and diversity refund", () => {
    let s = start(19); s.suppression[0] = 20; assert.equal(act(s, "edge").totals.damage, 125);
    s = start(20); put(s, "g", true); assert.equal(act(s, "fall").player.shield, 108);
    s = start(21); assert.equal(act(s, "guide").totals.damage, 90);
    s = start(22); put(s, "egi", true); assert.equal(act(s, "fall").player.mp, 297);
    s = start(23); assert.equal(act(s, "wind").player.shield, 90);
});
test("one warmed body per battle; no extra meter; rejects low gates", () => {
    let s = start(24), ids = put(s, "eg", true);
    s = act(s, "fall", { branch: "absorb", shadowIds: [ids[0]] });
    assert.equal(s.body, "edge"); assert.equal(s.shadows.length, 1); assert.equal(s.player.mp, 292);
    reject(s, { move: "fall", branch: "absorb", shadowIds: [ids[1]] });
    const t = start(24); put(t, "e"); reject(t, { move: "fall", branch: "absorb" });
    reject(start(23), { move: "fall", branch: "absorb" });
});
test("three body identities alter base moves across multiple rounds", () => {
    let s = start(24); let ids = put(s, "e", true);
    s = act(s, "fall", { branch: "absorb", shadowIds: ids });
    s = act(s, "basic"); assert.equal(s.totals.damage, 295);
    s = act(s, "basic"); assert.equal(s.totals.damage, 395);
    s = act(s, "basic"); assert.equal(s.totals.damage, 530);
    s = start(24); ids = put(s, "g", true); s = act(s, "fall", { branch: "absorb", shadowIds: ids });
    s = act(s, "wind"); assert.equal(s.player.shield, 153);
    s = act(s, "end"); assert.equal(s.player.shield, 75);
    s = start(24); ids = put(s, "i", true); s = act(s, "fall", { branch: "absorb", shadowIds: ids });
    assert.equal(act(s, "guide").shadows[0].warm, true);
});
test("fifth star active/passive improvements", () => {
    let s = start(25), ids = put(s, "eee");
    assert.equal(act(s, "edge", { replacementId: ids[0] }).totals.damage, 130);
    s = start(26); put(s, "e", true); s = act(s, "fall"); assert.equal(s.shadows[0].kind, "edge");
    assert.equal(s.shadows[0].warm, false); s = act(s, "fall"); assert.equal(s.shadows.length, 0);
    s = start(27); put(s, "e", true); assert.equal(act(s, "wind").shadows[1].warm, true);
    s = start(28); put(s, "e"); assert.equal(act(s, "fall").player.mp, 295);
    s = start(29); s = act(s, "guide"); assert.equal(s.shadows[1].warm, true);
    s = act(s, "guide"); assert.equal(s.shadows[2].warm, false);
});
test("finisher round gate, double snapshot, once per fight, no recursion", () => {
    let s = start(30); put(s, "e", true); reject(s, { move: "fall", branch: "finish" });
    s = act(s, "end"); s = act(s, "end");
    const reserved = act(s, "fall", { branch: "delay" });
    assert.equal(R.finisherReady(reserved), false);
    s = act(s, "fall", { branch: "finish" }); assert.equal(s.finisherUsed, true);
    assert.equal(s.totals.damage, 390); assert.equal(s.shadows.length, 1);
    reject(s, { move: "fall", branch: "finish" });
    reject(start(29), { move: "fall", branch: "finish" });
});
test("path selection, reward checkpoints, upgrades and HP/MP persist for 12 battles", () => {
    let s = start(30); s.player.hp = 800; s.player.mp = 180;
    for (let battle = 1; battle <= 12; battle++) {
        assert.equal(s.battle, battle); assert.equal(s.shadows.length, 1); assert.equal(s.shadows[0].warm, false);
        const oldRev = s.revision, hp = s.player.hp, mp = s.player.mp, bag = R.clone(s.potions);
        s = win(s); assert.equal(s.reports.length, battle); assert.equal(s.shadows.length, 0);
        assert.equal(s.body, null); assert.equal(s.player.shield, 0);
        if (battle < 12) {
            if ([1, 3, 6].includes(battle)) {
                assert.equal(s.phase, "reward"); reject(s, { move: "next" });
                assert.equal(s.offers.length, battle === 1 ? 3 : 2);
                s = reward(s, "guard");
            }
            s = act(s, "next"); assert.ok(s.revision > oldRev);
            assert.equal(s.player.hp, hp); assert.equal(s.player.mp, mp); assert.deepEqual(s.potions, bag);
            assert.equal(s.shadows[0].kind, "guard");
        }
    }
    assert.equal(s.phase, "complete"); assert.equal(s.upgrades.length, 2);
    assert.equal(new Set(s.upgrades).size, 2); reject(s, { move: "next" });
});
test("seeded offers stable, variable, no reroll or duplicate rewards", () => {
    function offers(seed) {
        let s = start(0, "dummy", { seed });
        for (let i = 0; i < 3; i++) { s = win(s); if (i < 2) s = act(reward(s), "next"); }
        return s;
    }
    const a = offers(17), b = offers(17); assert.deepEqual(a, b);
    const variations = new Set(Array.from({ length: 8 }, (_, i) => offers(i + 1).offers.join(",")));
    assert.ok(variations.size > 1);
    reject(a, { move: "route", choice: "guard" });
    const n = act(a, "upgrade", { choice: a.offers[0] });
    reject(n, { move: "upgrade", choice: a.offers[0] });
});
test("all nine upgrades modify actual results", () => {
    let s = start(); s.path = "edge"; s.upgrades = ["quickEdge"];
    assert.equal(act(s, "edge").shadows[1].warm, true);
    s = start(); s.path = "edge"; s.upgrades = ["cleave"]; put(s, "e", true); s.enemy.shield = 200;
    assert.equal(act(s, "fall").totals.damage, 60);
    s = start(); s.path = "edge"; s.upgrades = ["afterEdge"]; put(s, "e", true);
    assert.equal(act(s, "fall").totals.damage, 160);
    s = start(); s.path = "guard"; s.upgrades = ["retainShield"]; s.player.shield = 180;
    assert.equal(act(s, "end").player.shield, 60);
    s = start(); s.path = "guard"; s.upgrades = ["riposte"]; put(s, "g");
    assert.equal(act(s, "fall").totals.damage, 42);
    s.player.shield = 180; assert.equal(act(s, "fall").totals.damage, 0);
    s = start(0, "assault"); s.path = "guard"; s.upgrades = ["shelter"]; put(s, "g");
    assert.equal(act(s, "fall").suppression[0], 20);
    s = start(0, "burst"); s.path = "guide"; s.upgrades = ["cutFlow"]; put(s, "i");
    s = act(s, "fall"); assert.equal(act(s, "end").enemy.charged, false);
    s = start(); s.path = "guide"; s.upgrades = ["followCut"]; put(s, "i");
    assert.equal(act(s, "fall").shadows[0].kind, "edge");
    s = start(); s.path = "guide"; s.upgrades = ["pressure"]; put(s, "i");
    assert.equal(act(s, "fall").suppression[0], 35);
});
test("victory during any subeffect cleans up and seals exactly one report", () => {
    for (const kind of ["e", "g", "i"]) {
        const s = start(30); put(s, kind, true); s.enemy.hp = 1;
        if (kind === "g") { s.path = "guard"; s.upgrades = ["riposte", "shelter"]; }
        const n = act(s, "fall"); assert.equal(n.reports.length, 1); R.validateState(n);
    }
});
test("preview/rng/report purity, stale commits including restart/rewards/next", () => {
    const m = new Manager(); m.start(); const before = R.clone(m.state), rev = before.revision;
    assert.deepEqual(m.preview({ move: "edge" }), m.preview({ move: "edge" })); assert.deepEqual(m.state, before);
    assert.ok(m.commit({ move: "edge" }, rev).ok); assert.equal(m.commit({ move: "basic" }, rev).ok, false);
    const old = m.state.revision; m.start(); assert.equal(m.commit({ move: "edge" }, old).ok, false);
    m.data.state.enemy.hp = 1; const r = m.state.revision;
    m.preview({ move: "basic" }); assert.equal(m.state.reports.length, 0);
    m.commit({ move: "basic" }, r); const rewardRev = m.state.revision;
    m.commit({ move: "route", choice: "edge" }, rewardRev);
    assert.equal(m.commit({ move: "route", choice: "guard" }, rewardRev).ok, false);
    const nextRev = m.state.revision; m.commit({ move: "next" }, nextRev);
    assert.equal(m.commit({ move: "next" }, nextRev).ok, false);
});
test("single mode, defeat and retreat are terminal; no revival or free next", () => {
    let s = win(start(0, "dummy", { battles: 1 })); assert.equal(s.phase, "complete");
    assert.equal(s.offers.length, 0);
    s = start(0, "assault"); s.player.hp = 1; s = act(s, "end");
    assert.equal(s.phase, "defeat"); reject(s, { move: "next" }); reject(s, { move: "heal" });
    s = act(win(start()), "retreat"); assert.equal(s.phase, "retreated"); reject(s, { move: "next" });
    reject(start(), { move: "retreat" });
});
test("reports capture turns/actions/resources and freeze after combat", () => {
    let s = start(); s = act(s, "edge"); s = act(s, "end"); s = win(s);
    assert.equal(s.reports[0].rounds, 2); assert.equal(s.reports[0].actions, 3);
    assert.equal(s.reports[0].mpSpent, 5); assert.equal(s.reports[0].endMp, 295);
    const report = R.clone(s.reports[0]); s.player.hp = 500; s = act(s, "heal");
    assert.deepEqual(s.reports[0], report); assert.equal(s.totals.healUsed, 1);
});
test("edge path cultivates one old free edge, once per own turn", () => {
    let s = start(); s.path = "edge";
    s = act(s, "edge"); assert.equal(s.shadows[0].warm, true);
    assert.equal(s.shadows[1].warm, false); assert.equal(s.totals.specials.cultivate, 1);
    s = act(s, "edge"); assert.equal(s.shadows[1].warm, false);
    const low = start(); assert.equal(act(low, "edge").shadows[0].warm, false);
});
test("cultivation never modifies reserved shadows or mutates rejected replacement", () => {
    let s = start(18); s.path = "edge"; const ids = put(s, "eee");
    reject(s, { move: "edge" }); assert.ok(s.shadows.every(x => !x.warm));
    s = act(s, "fall", { branch: "delay", shadowIds: [ids[0]], enemyAction: 3 });
    s = act(s, "edge", { replacementId: ids[2] });
    assert.equal(s.shadows.find(x => x.id === ids[0]).warm, false);
    assert.equal(s.shadows.find(x => x.id === ids[1]).warm, true);
});
test("guard counter spends one guard per actual block, respects reservation", () => {
    let s = start(0, "assault"); s.path = "guard"; put(s, "gg");
    s.player.shield = 60; s = act(s, "end");
    assert.equal(s.totals.specials.counter, 2); assert.equal(s.shadows.length, 0);
    assert.equal(s.totals.damage, 160); // 36+50, then remaining 24+50.
    s = start(18, "assault"); s.path = "guard"; const ids = put(s, "g");
    s.player.shield = 180; s = act(s, "fall", { branch: "delay", shadowIds: ids, enemyAction: 3 });
    s = act(s, "end"); assert.equal(s.totals.specials.counter || 0, 0);
});
test("warm counter stronger; no shield/no living player means no counter", () => {
    let s = start(0, "assault"); s.path = "guard"; put(s, "g", true); s.player.shield = 36;
    s = act(s, "end"); assert.equal(s.totals.damage, 121); assert.equal(s.totals.specials.counter, 1);
    s = start(0, "assault"); s.path = "guard"; put(s, "g");
    s = act(s, "end"); assert.equal(s.totals.damage, 0); assert.equal(s.shadows.length, 1);
    s = start(0, "assault"); s.path = "guard"; put(s, "g"); s.player.shield = 1; s.player.hp = 1;
    s = act(s, "end"); assert.equal(s.phase, "defeat"); assert.equal(s.totals.specials.counter || 0, 0);
});
test("counter lethal stops remaining enemy actions and seals once", () => {
    let s = start(0, "assault"); s.path = "guard"; put(s, "gg");
    s.player.shield = 180; s.enemy.hp = 1; s = act(s, "end");
    assert.equal(s.outcome, "victory"); assert.equal(s.reports.length, 1);
    assert.equal(s.logs.filter(l => /敌行动/.test(l)).length, 1); assert.equal(s.player.hp, 1200);
    R.validateState(s);
});
test("guide path directly targets one intent, still pays one action and finite mana", () => {
    let s = start(0, "assault"); s.path = "guide";
    s = act(s, "guide", { enemyAction: 3 });
    assert.deepEqual(s.suppression, [0, 0, 20]); assert.equal(s.ap, 2); assert.equal(s.player.mp, 294);
    assert.equal(s.shadows.length, 2); assert.equal(s.totals.damage, 50);
    reject(s, { move: "guide", enemyAction: 4 });
    assert.deepEqual(act(start(), "guide").suppression, [0, 0, 0]);
});
test("key-intent break offers one next-turn manual strike, no free action", () => {
    let s = start(0, "assault"); s.path = "guide";
    s = act(s, "guide", { enemyAction: 3 }); s = act(s, "end");
    assert.equal(s.enemy.exposed, true); assert.equal(s.totals.specials.break, 1);
    const damage = s.totals.damage; s = act(s, "edge");
    assert.equal(s.totals.damage - damage, 165); assert.equal(s.ap, 2);
    assert.equal(s.enemy.exposed, false); assert.equal(s.totals.specials.opening, 1);
    const second = s.totals.damage; s = act(s, "basic"); assert.equal(s.totals.damage - second, 100);
});
test("opening ignores shield, is not consumed by harvest and expires without stockpiling", () => {
    let s = start(); s.enemy.exposed = true; s.enemy.shield = 100;
    const n = act(s, "basic"); assert.equal(n.totals.damage, 75);
    s = start(); s.enemy.exposed = true; put(s, "e");
    s = act(s, "fall"); assert.equal(s.enemy.exposed, true);
    s = act(s, "end"); assert.equal(s.enemy.exposed, false);
});
test("break only for effective key intents; ordinary attacks/waits/full heal do not pay", () => {
    let s = start(0, "assault"); s.path = "guide";
    s = act(s, "guide", { enemyAction: 1 }); s = act(s, "end"); assert.equal(s.enemy.exposed, false);
    s = start(0, "dummy"); s.path = "guide"; s = act(s, "guide"); s = act(s, "end");
    assert.equal(s.enemy.exposed, false);
    s = start(0, "defensive"); s.path = "guide"; s.suppression[2] = 30;
    s = act(s, "end"); assert.equal(s.enemy.exposed, false);
    s = start(0, "defensive"); s.enemy.defense = 0; s.suppression[0] = 30;
    s = act(s, "end"); assert.equal(s.enemy.exposed, false);
});
test("charge needs true interruption; preview and opening bonus never recurse", () => {
    let s = start(0, "burst"); s.path = "guide";
    s = act(s, "guide"); s = act(s, "end"); assert.equal(s.enemy.exposed, false);
    s = start(0, "burst"); s.path = "guide"; s.upgrades = ["cutFlow"];
    s = act(s, "guide"); const before = R.clone(s), p = R.resolve(s, { move: "end" });
    assert.deepEqual(s, before); assert.equal(p.state.enemy.exposed, true);
    s = p.state; s.enemy.hp = 1; s = act(s, "basic");
    assert.equal(s.reports.length, 1); assert.equal(s.enemy.exposed, false);
});
test("body entry has immediate typed payoff without extra AP, shadow, refund or harvest", () => {
    for (const [kind, damage, shield] of [["e", 160, 0], ["g", 0, 60], ["i", 80, 0]]) {
        let s = start(24); put(s, kind, true);
        s = act(s, "fall", { branch: "absorb", enemyAction: 3 });
        assert.equal(s.totals.damage, damage); assert.equal(s.player.shield, shield);
        assert.equal(s.shadows.length, 0); assert.equal(s.ap, 2); assert.equal(s.player.mp, 292);
        assert.equal(s.totals.warmHarvested, 0); assert.equal(s.totals.specials.absorb, 1);
        if (kind === "i") assert.equal(s.suppression[2], 45);
    }
});
test("enemy styles change rhythm across turns without hidden random rerolls", () => {
    for (const style of ["assault", "defensive"]) {
        const s = start(0, style), before = R.clone(s.intentions), n = act(s, "end");
        assert.notDeepEqual(n.intentions, before); assert.deepEqual(n.intentions, R.intents(n));
        assert.equal(act(n, "end").intentions[0].label, before[0].label);
    }
});
test("seeded command fuzz across 31 states and four styles validates every result", () => {
    let rng = 27, attempts = 0;
    const random = n => { rng = rng * 16807 % 2147483647; return rng % n; };
    for (let level = 0; level <= 30; level++) for (const style of ["dummy", "assault", "defensive", "burst"]) {
        let s = start(level, style);
        for (let i = 0; i < 120; i++) {
            const before = R.clone(s), source = s, moves = ["edge", "wind", "guide", "fall", "end", "basic", "heal", "mana"];
            const r = R.resolve(s, { move: moves[random(moves.length)],
                replacementId: s.shadows[random(Math.max(1, s.shadows.length))]?.id, enemyAction: 1 + random(3) });
            if (r.ok) s = r.state; else assert.deepEqual(r.state, before);
            R.validateState(s); assert.deepEqual(source, before); attempts++;
            if (s.phase !== "fighting") break;
        }
    }
    console.log("Fuzz attempts: " + attempts);
});
console.log(`Manual run rules: ${passed} groups passed.`);
