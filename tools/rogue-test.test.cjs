const assert = require("node:assert/strict");
const path = require("node:path");
const base = path.resolve(__dirname, "../bin/manual-test/script/module/manualTest");
const { RogueTestRules: R } = require(path.join(base, "utils/RogueTestRules.js"));
const { RogueTestConfig: Config } = require(path.join(base, "utils/RogueTestConfig.js"));
// Preserve the existing 27-item/old-template regression independently of the new default roster.
class C extends Config { static defaults() { return { ...super.defaults(), style: "mixed" }; } }
const { RogueTestManager: Manager } = require(path.join(base, "manager/RogueTestManager.js"));
let groups = 0;
function test(name, fn) { fn(); groups++; console.log("PASS " + name); }
function setup(items = [], options = {}) {
    const d = { ...C.defaults(), battles: 1, style: "dummy", ...options };
    d.player = { ...C.defaults().player, ...options.player };
    d.enemy = { ...C.defaults().enemy, hp: 100000, ...options.enemy };
    const s = R.start(d);
    for (const k of items) {
        const item = C.items[k]; s.acquired.push(k);
        if (item.type === "mutation") s.mutations[item.slot] = k;
        else if (item.type === "core") s.core = k;
        else s.passives.push(k);
    }
    return s;
}
function act(s, move, extra = {}) {
    const before = R.clone(s), result = R.resolve(s, { move, ...extra });
    assert.deepEqual(s, before, "source purity"); assert.ok(result.ok, result.reason);
    R.validateState(result.state); return result.state;
}
function reject(s, a) {
    const before = R.clone(s), result = R.resolve(s, a);
    assert.equal(result.ok, false); assert.deepEqual(s, before); assert.equal(result.state, s);
}
test("four base skills, 3AP and no stars or common shadows", () => {
    for (const move of ["edge", "wind", "guide", "fall"]) {
        const s = act(setup(), move); assert.equal(s.ap, 2); assert.equal(s.player.mp, 120 - C.cost(move));
        assert.ok(!("shadows" in s)); assert.ok(!("star" in s.setup));
    }
});
test("setup validates attributes, styles, seeds and finite supplies", () => {
    for (const patch of [{ seed: 0 }, { seed: NaN }, { battles: 0 }, { battles: 1.5 }, { healPotions: -1 }, { style: "bogus" },
        { pressure: "bogus" }, { player: { hp: 0 } }, { enemy: { hp: 10, mp: -1, attack: 1, defense: 1 } }])
        assert.throws(() => R.start({ ...C.defaults(), ...patch }));
});
test("basic attack and guard are free, fall once per own turn", () => {
    let s = setup(); s = act(s, "fall"); reject(s, { move: "fall" });
    s = act(s, "basic"); s = act(s, "guard"); assert.equal(s.round, 2); assert.equal(s.ap, 3);
    s = act(s, "fall"); assert.equal(s.fight.skills.fall, 2);
});
test("direct guide targets one numeric intent and does not interrupt charge", () => {
    let s = setup([], { style: "burst" }); s = act(s, "guide", { enemyAction: 1 });
    assert.deepEqual(s.suppression, [35, 0, 0]); s = act(s, "end"); assert.equal(s.enemy.charged, true);
    assert.equal(s.intentions[2].percent, 330);
    for (const at of [0, 4, 1.5, NaN]) reject(s, { move: "guide", enemyAction: at });
});
test("medicine no AP, shares per-turn limit, cannot use full or empty supply", () => {
    let s = setup(); reject(s, { move: "heal" }); reject(s, { move: "mana" });
    s.player.hp = 100; s.player.mp = 0; s = act(s, "heal");
    assert.equal(s.player.hp, 400); assert.equal(s.ap, 3); assert.equal(s.potions.heal, 2);
    reject(s, { move: "mana" }); s = act(s, "end"); s = act(s, "mana"); assert.equal(s.player.mp, 36);
});
test("swordcraft first active only; flying cap and nonrecursive round-end attacks", () => {
    let s = setup(["swordcraft"]); s = act(s, "edge"); s = act(s, "wind"); s = act(s, "guide");
    assert.equal(s.flying, 1); assert.equal(s.fight.events.flying, 1); assert.equal(s.fight.events.summon, 1);
    for (let i = 0; i < 4; i++) { s = act(s, "wind"); s = act(s, "end"); }
    assert.equal(s.flying, 3);
});
test("flyingEdge changes damage and summons independently; both sources can combine", () => {
    let s = act(setup(["flyingEdge"]), "edge"); assert.equal(s.fight.damage, 70); assert.equal(s.flying, 1);
    s = act(setup(["flyingEdge", "swordcraft"]), "edge"); assert.equal(s.flying, 2);
});
test("salvo consumes real flying once and does not generate free extra attacks", () => {
    let s = setup(["flyingEdge", "salvo"]); s = act(s, "edge"); s = act(s, "edge"); s = act(s, "fall");
    assert.equal(s.flying, 0); assert.equal(s.fight.damage, 430); assert.equal(s.fight.events.flying, 2);
    assert.equal(s.fight.events.salvo, 1);
});
test("swordUnity changes trigger, raises cap to5; does not attack at turn end", () => {
    let s = setup(["flyingEdge", "swordUnity"]);
    s = act(s, "edge"); assert.equal(s.fight.damage, 100);
    s = act(s, "edge"); s = act(s, "edge"); assert.equal(s.flying, 3); assert.equal(s.fight.events.flying, 6);
    const n = s.fight.events.flying; s = act(s, "wind"); s = act(s, "end"); assert.equal(s.fight.events.flying, n);
    s = act(s, "edge"); s = act(s, "edge"); assert.equal(s.flying, 5);
});
test("wounds cap6, tick after real actions not waits, decay once per enemy turn", () => {
    let s = setup(["wound"], { style: "assault" }); s = act(s, "edge"); s = act(s, "basic"); s = act(s, "basic");
    assert.equal(s.wounds, 2); assert.equal(s.fight.events.woundTick, 3); assert.equal(s.fight.damage, 355);
    let dummy = setup(["wound"]); dummy = act(dummy, "basic"); dummy = act(dummy, "end");
    assert.equal(dummy.wounds, 0); assert.equal(dummy.fight.events.woundTick || 0, 0);
});
test("rupture replaces suppression; includes own hit wound and consumes all", () => {
    let s = setup(["wound", "rupture"]); s = act(s, "basic"); s = act(s, "guide");
    assert.equal(s.wounds, 0); assert.equal(s.fight.damage, 225); assert.deepEqual(s.suppression, [0, 0, 0]);
});
test("endlessWound consumes ceil(half), halves direct guide damage", () => {
    let s = setup(["wound", "rupture", "endlessWound"]); s.wounds = 4;
    s = act(s, "guide"); assert.equal(s.wounds, 2); assert.equal(s.fight.damage, 163);
});
test("dye bridges flying and counter to wounds without generating new flying", () => {
    let s = setup(["wound", "dye", "swordcraft"]); s = act(s, "wind"); s = act(s, "end");
    assert.equal(s.wounds, 0); assert.equal(s.fight.events.woundAdded, 1); assert.equal(s.flying, 1);
    let g = setup(["wound", "dye", "riposte"], { style: "assault" });
    g = act(g, "wind"); g = act(g, "end"); assert.ok(g.fight.events.woundTick > 0); assert.ok(g.fight.events.counter > 0);
});
test("riposte only for actual block with surviving player; shield itself not an attack", () => {
    let s = setup(["riposte"], { style: "assault" }); s = act(s, "wind"); assert.equal(s.fight.events.counter || 0, 0);
    s = act(s, "end"); assert.equal(s.fight.events.counter, 3);
    let naked = act(setup(["riposte"], { style: "assault" }), "end"); assert.equal(naked.fight.events.counter || 0, 0);
    let dead = setup(["riposte"], { style: "assault", player: { hp: 1 } }); dead.player.shield = 1;
    dead = act(dead, "end"); assert.equal(dead.phase, "defeat"); assert.equal(dead.totals.events.counter || 0, 0);
});
test("breakingWave reduced shield, only first2 block events, cannot stack by recasting", () => {
    let s = setup(["breakingWave"], { style: "assault" }); s = act(s, "wind"); assert.equal(s.player.shield, 75);
    s = act(s, "wind"); s = act(s, "wind"); assert.equal(s.fight.events.counter, 2); assert.equal(s.fight.damage, 160);
});
test("turnTables rewards deliberately lost AP, not automatic end after3 actions", () => {
    let s = setup(["turnTables"], { style: "assault" }); s = act(s, "wind"); s = act(s, "end");
    assert.equal(s.fight.damage, 340); assert.equal(s.fight.events.counter, 2); assert.equal(s.fight.actions, 1);
    let all = setup(["turnTables"], { style: "assault" }); all = act(all, "wind"); all = act(all, "guard"); all = act(all, "basic");
    assert.equal(all.fight.events.counter || 0, 0);
});
test("retention halves remaining shield with cap; not counted as new shield", () => {
    let s = setup(["retention"]); s = act(s, "wind"); s = act(s, "wind"); s = act(s, "end");
    assert.equal(s.player.shield, 60); assert.equal(s.fight.shield, 200);
});
test("counter kill immediately stops attacks and creates one sealed report", () => {
    let s = setup(["riposte"], { style: "assault", enemy: { hp: 40 } }); s = act(s, "wind"); s = act(s, "end");
    assert.equal(s.phase, "complete"); assert.equal(s.player.hp, s.player.maxHp); assert.equal(s.reports.length, 1);
    assert.equal(s.reports[0].events.counter, 1); reject(s, { move: "end" });
});
test("breathing restores finite mana; blood payment atomic and never lethal", () => {
    let s = setup(["breathing"]); s.player.mp = 0; s = act(s, "basic"); assert.equal(s.player.mp, 4);
    let blood = setup(["bloodMana"]); blood.player.mp = 1; blood = act(blood, "fall");
    assert.equal(blood.player.mp, 0); assert.equal(blood.player.hp, 986); assert.equal(blood.totals.bloodSpent, 14);
    blood = setup(["bloodMana"]); blood.player.mp = 0; blood.player.hp = 16; reject(blood, { move: "fall" });
});
test("risk checks postpayment HP, no damage buff for triggered attacks", () => {
    let s = setup(["risk", "swordcraft"]); s.player.hp = 400;
    s = act(s, "edge"); assert.equal(s.fight.damage, 149);
    s = act(s, "wind"); assert.equal(s.player.shield, 75);
    s = act(s, "end"); assert.equal(s.fight.damage, 179);
});
test("dependency gating prevents dead rewards and never locks whole pool to one family", () => {
    const empty = setup();
    for (const key of ["rupture", "salvo", "swordUnity", "dye", "endlessWound"]) assert.equal(R.eligible(empty, key), false);
    let s = setup(["wound", "swordcraft"]); assert.equal(R.eligible(s, "dye"), true);
    assert.equal(R.eligible(s, "riposte"), true); assert.equal(R.eligible(s, "bloodMana"), true);
});
test("9 stable rewards, 3 distinct useful offers, checkpoint cores when eligible", () => {
    let s = setup([], { battles: 12, enemy: { hp: 1 }, seed: 17 });
    for (let b = 1; b <= 12; b++) {
        s = act(s, "basic");
        if (b <= 9) {
            assert.equal(s.phase, "reward"); assert.equal(s.offers.length, 3);
            assert.equal(new Set(s.offers).size, 3);
            for (const k of s.offers) assert.equal(R.eligible(s, k), true);
            if (b % 3 !== 0) assert.ok(s.offers.every(k => C.items[k].type !== "core"));
            const before = R.clone(s); reject(s, { move: "next" }); assert.deepEqual(s, before);
            const choice = s.offers.includes("swordcraft") ? "swordcraft" : s.offers[0];
            s = act(s, "choose", { choice }); reject(s, { move: "choose", choice });
        }
        if (b < 12) {
            const before = R.clone(s); s = act(s, "next");
            assert.equal(s.player.hp, before.player.hp); assert.equal(s.player.mp, before.player.mp);
            assert.deepEqual(s.potions, before.potions); assert.equal(s.flying, 0); assert.equal(s.wounds, 0);
        }
    }
    assert.equal(s.phase, "complete"); assert.equal(s.rewards.length, 9); assert.equal(s.reports.length, 12);
});
test("core replacement has exactly one active core and retains acquisition history", () => {
    let s = setup(["swordcraft", "swordUnity"]); s.phase = "reward"; s.offers = ["turnTables", "breathing", "wound"];
    s = act(s, "choose", { choice: "turnTables" }); assert.equal(R.has(s, "swordUnity"), false);
    assert.equal(s.core, "turnTables"); assert.equal(s.rewards[0].replaced, "swordUnity");
    assert.ok(s.acquired.includes("swordUnity")); s.flying = 0; R.validateState(s);
});
test("previews do not reroll offers; commit revisions survive restarts; invalid setup preserves run", () => {
    const m = new Manager(); m.draft.enemy.hp = 1; assert.ok(m.start());
    const before = R.clone(m.state), a = { move: "basic" };
    assert.deepEqual(m.preview(a), m.preview(a)); assert.deepEqual(m.state, before);
    assert.ok(m.commit(a, before.revision).ok); const offers = m.state.offers.slice(), rng = m.state.rng;
    assert.equal(m.commit(a, before.revision).ok, false);
    m.preview({ move: "choose", choice: offers[0] }); assert.deepEqual(m.state.offers, offers); assert.equal(m.state.rng, rng);
    const oldRevision = m.state.revision; assert.ok(m.start()); assert.ok(m.state.revision > oldRevision);
    assert.equal(m.commit(a, oldRevision).ok, false);
    const old = m.state; m.draft.seed = 0; assert.equal(m.start(), false); assert.equal(m.state, old);
});
test("same seed and choices reproduce; different seeds vary; reports freeze across medicine", () => {
    const d = { ...C.defaults(), enemy: { ...C.defaults().enemy, hp: 1 } };
    const a = act(R.start(d), "edge"), b = act(R.start(d), "edge");
    assert.deepEqual(a, b); const report = R.clone(a.reports[0]); const healed = act(a, "mana");
    assert.deepEqual(healed.reports[0], report);
    const offers = new Set();
    for (let seed = 1; seed <= 30; seed++) offers.add(act(R.start({ ...d, seed }), "basic").offers.join(","));
    assert.ok(offers.size > 10);
});
test("retreat terminal, no free in-fight retreat or medicine resurrection", () => {
    let s = setup([], { battles: 12, enemy: { hp: 1 } }); reject(s, { move: "retreat" });
    s = act(s, "basic"); s = act(s, "retreat"); reject(s, { move: "next" }); reject(s, { move: "heal" });
});
test("catalog has27 unique definitions and multiple alternatives for every active", () => {
    assert.equal(Object.keys(C.items).length, 27);
    const covered = new Set(["swordcraft", "flyingEdge", "salvo", "swordUnity", "wound", "rupture", "dye",
        "endlessWound", "riposte", "breakingWave", "retention", "turnTables", "breathing", "bloodMana", "risk",
        "storedEdge", "heavyEdge", "delayedFall", "shieldWind", "pinGuide", "shieldFall",
        "tempo", "swordSiphon", "woundGuard", "cycle", "stillness", "meditation"]);
    assert.deepEqual([...covered].sort(), Object.keys(C.items).sort());
    for (const item of Object.values(C.items)) {
        assert.ok(item.name && item.description);
        if (item.type === "mutation") assert.ok(["edge", "wind", "guide", "fall"].includes(item.slot));
    }
    for (const slot of ["edge", "wind", "guide", "fall"])
        assert.ok(Object.values(C.items).filter(i => i.slot === slot).length >= 2);
    const pairs = new Set();
    for (const [a, b] of C.links) {
        assert.ok(C.items[a] && C.items[b] && a !== b);
        const pair = [a, b].sort().join(",");
        assert.ok(!pairs.has(pair)); pairs.add(pair);
    }
});
test("reward slots extend actual build while retaining an unrelated option and seeded random slot", () => {
    const seen = new Set();
    for (let seed = 1; seed <= 60; seed++) {
        const source = setup(["storedEdge"], { seed, battles: 12, enemy: { hp: 1 } });
        const s = act(source, "basic");
        const extend = s.offers.filter(k => s.offerRoles[k] === "extend");
        assert.equal(extend.length, 1); assert.ok(R.related(s, extend[0]).includes("storedEdge"));
        assert.ok(s.offers.some(k => s.offerRoles[k] === "explore" && R.related(s, k).length === 0));
        assert.equal(s.offers.filter(k => s.offerRoles[k] === "random").length, 1);
        seen.add(extend[0]);
        assert.deepEqual(s, act(source, "basic"));
        const selected = act(s, "choose", { choice: extend[0] });
        assert.deepEqual(selected.rewards[0].roles, s.offerRoles); assert.deepEqual(selected.offerRoles, {});
    }
    assert.ok(seen.size >= 3, "extension does not force one fixed recipe");
});
test("checkpoint prefers a supported specific core while ordinary alternatives remain available", () => {
    for (let seed = 1; seed <= 20; seed++) {
        const source = setup(["wound", "rupture"], { seed, battles: 12, enemy: { hp: 1 } });
        source.battle = 3;
        const s = act(source, "basic");
        const guaranteed = s.offers.find(k => s.offerRoles[k] === "core");
        assert.equal(guaranteed, "endlessWound");
        assert.ok(s.offers.some(k => C.items[k].type !== "core"));
    }
});
test("related rewards use active pieces, not replaced acquisition history", () => {
    const s = setup(["storedEdge", "heavyEdge"]);
    s.acquired.push("swordcraft");
    assert.deepEqual(R.related(s, "salvo"), []);
    assert.ok(R.related(s, "meditation").includes("storedEdge"));
    assert.equal(R.eligible(s, "salvo"), false);
});
test("pressure ramps by encounter stage, never by player build, and respects single fight", () => {
    const expected = {
        relaxed: [[500, 55], [500, 55], [500, 55], [1500, 83]],
        standard: [[500, 55], [575, 58], [650, 61], [2175, 95]],
        hard: [[500, 55], [600, 59], [700, 64], [2400, 102]],
    };
    for (const pressure of Object.keys(expected)) {
        let s = setup([], { pressure, battles: 12, enemy: { hp: 500 } });
        for (let battle = 1; battle <= 12; battle++) {
            const checkpoint = [1, 4, 7, 12].indexOf(battle);
            if (checkpoint >= 0) assert.deepEqual([s.enemy.maxHp, s.enemy.attack], expected[pressure][checkpoint]);
            s.enemy.hp = 1; s = act(s, "basic");
            if (s.phase === "reward") s = act(s, "choose", { choice: s.offers[0] });
            if (battle < 12) s = act(s, "next");
        }
        const single = setup([], { pressure, battles: 1, enemy: { hp: 500 } });
        assert.equal(single.enemy.hp, 500); assert.equal(single.enemy.attack, 55);
    }
});
test("full momentum heavy attack has a real370percent payoff and spends no extra action", () => {
    let s = setup(["storedEdge", "heavyEdge"]);
    s.momentum = 3; s = act(s, "edge");
    assert.equal(s.fight.damage, 370); assert.equal(s.momentum, 0);
    assert.equal(s.ap, 2); assert.equal(s.player.mp, 116);
});
test("stored momentum persists across turns; basic and heavy consume real stored charges", () => {
    let s = setup(["storedEdge", "heavyEdge"]);
    s = act(s, "guard"); s = act(s, "wind"); s = act(s, "end");
    assert.equal(s.momentum, 2); s = act(s, "edge");
    assert.equal(s.fight.damage, 280); assert.equal(s.momentum, 0);
    s = act(s, "guard"); s = act(s, "basic"); assert.equal(s.fight.damage, 410);
    assert.equal(s.momentum, 0);
    let capped = setup(["storedEdge"]);
    for (let i = 0; i < 6; i++) capped = act(capped, "guard");
    assert.equal(capped.momentum, 3);
});
test("meditation trades forfeited AP for bounded mana and momentum", () => {
    let s = setup(["meditation"]); s.player.mp = 100;
    s = act(s, "end"); assert.equal(s.player.mp, 106); assert.equal(s.momentum, 3);
    assert.equal(s.round, 2); assert.equal(s.ap, 3); assert.equal(s.fight.actions, 0);
    s = act(s, "basic"); assert.equal(s.fight.damage, 190); assert.equal(s.momentum, 0);
});
test("delayed sword pays now, arrives after whole enemy turn, and never survives death", () => {
    let s = setup(["delayedFall"], { style: "assault" });
    s = act(s, "fall"); assert.equal(s.fight.damage, 70); assert.equal(s.pendingSword, 220);
    s = act(s, "end"); assert.equal(s.fight.damage, 290); assert.equal(s.fight.taken, 165);
    assert.equal(s.pendingSword, 0); assert.equal(s.fight.events.delayed, 1);
    let dead = setup(["delayedFall"], { style: "assault", player: { hp: 1 } });
    dead = act(dead, "fall"); dead = act(dead, "end");
    assert.equal(dead.phase, "defeat"); assert.equal(dead.totals.damage, 70); assert.equal(dead.pendingSword, 0);
});
test("stillness boosts delayed hit but penalizes all direct active damage", () => {
    let s = setup(["delayedFall", "stillness"]); s = act(s, "fall");
    assert.equal(s.fight.damage, 53); assert.equal(s.pendingSword, 330);
    s = act(s, "end"); assert.equal(s.fight.damage, 383);
    s = act(s, "basic"); assert.equal(s.fight.damage, 483);
});
test("shieldWind is independent flying source and uses a different wind mutation", () => {
    let s = setup(["shieldWind", "swordUnity"]);
    s = act(s, "wind"); assert.equal(s.player.shield, 70); assert.equal(s.flying, 1);
    assert.equal(R.has(s, "breakingWave"), false);
    s = act(s, "edge"); assert.equal(s.fight.damage, 140);
});
test("pinGuide adds3 wounds, suppresses chosen action60 and does not detonate", () => {
    let s = setup(["wound", "pinGuide"]); s = act(s, "guide", { enemyAction: 3 });
    assert.equal(s.wounds, 3); assert.equal(s.fight.damage, 50); assert.deepEqual(s.suppression, [0, 0, 60]);
    assert.equal(s.fight.events.rupture || 0, 0); reject(s, { move: "guide", enemyAction: 4 });
});
test("shieldFall consumes defense and includes converted damage even with zero ATK", () => {
    let s = setup(["shieldFall"]); s = act(s, "wind"); s = act(s, "fall");
    assert.equal(s.player.shield, 0); assert.equal(s.fight.damage, 295);
    let zero = setup(["shieldFall", "wound"], { player: { attack: 0 } });
    zero = act(zero, "wind"); zero = act(zero, "fall");
    assert.equal(zero.fight.damage, 125); assert.equal(zero.wounds, 1);
});
test("tempo rewards alternating actives across turns; medicine preserves and basic breaks chain", () => {
    let s = setup(["tempo"]); s = act(s, "edge"); s = act(s, "wind");
    assert.equal(s.player.shield, 114); s = act(s, "end"); s = act(s, "edge");
    assert.equal(s.fight.damage, 255); s = act(s, "mana"); assert.equal(s.lastActive, "edge");
    s = act(s, "basic"); assert.equal(s.lastActive, null);
    s = act(s, "guide"); assert.equal(s.fight.damage, 430);
});
test("cycle requires3 distinct active types across rounds, adds cost, cannot recurse", () => {
    let s = setup(["cycle"]); s = act(s, "edge"); s = act(s, "edge"); s = act(s, "wind");
    assert.deepEqual(s.forms, ["edge", "wind"]); assert.equal(s.player.mp, 102);
    s = act(s, "basic"); assert.deepEqual(s.forms, ["edge", "wind"]);
    s = act(s, "guide"); assert.equal(s.fight.damage, 485);
    assert.deepEqual(s.forms, []); assert.equal(s.fight.events.cycle, 1); assert.equal(s.player.shield, 30);
});
test("siphon limited to2 per turn and woundGuard needs actual HP loss", () => {
    let s = setup(["flyingEdge", "swordUnity", "swordSiphon"]); s.player.mp = 100;
    s = act(s, "edge"); s = act(s, "edge");
    assert.equal(s.player.mp, 94); assert.equal(s.fight.events.siphon, 2);
    let guarded = setup(["wound", "woundGuard"], { style: "assault" });
    guarded = act(guarded, "basic"); guarded = act(guarded, "end");
    assert.equal(guarded.fight.events.woundGuard, 3); assert.equal(guarded.fight.shield, 24);
    let blocked = setup(["wound", "woundGuard"], { style: "defensive", enemy: { defense: 1000 } });
    blocked = act(blocked, "basic"); blocked = act(blocked, "end");
    assert.equal(blocked.fight.events.woundGuard || 0, 0);
});
test("replacement projects whole build, protecting dependent cores and bridge passives", () => {
    let s = setup(["wound", "rupture", "endlessWound"]);
    assert.equal(R.eligible(s, "pinGuide"), false);
    s = setup(["delayedFall", "stillness"]); assert.equal(R.eligible(s, "shieldFall"), false);
    s = setup(["flyingEdge", "swordSiphon", "storedEdge"]);
    assert.equal(R.eligible(s, "heavyEdge"), false);
    s = setup(["flyingEdge", "shieldWind", "swordSiphon", "storedEdge"]);
    assert.equal(R.eligible(s, "heavyEdge"), true);
    s.phase = "reward"; s.offers = ["heavyEdge", "breathing", "wound"];
    s = act(s, "choose", { choice: "heavyEdge" });
    assert.equal(s.rewards[0].replaced, "flyingEdge"); assert.equal(R.has(s, "flyingEdge"), false);
    assert.equal(R.has(s, "heavyEdge"), true); assert.equal(R.has(s, "swordSiphon"), true);
});
test("delayed lethal seals exactly once and all combat-only records reset between fights", () => {
    let s = setup(["delayedFall", "meditation", "cycle", "tempo"], { battles: 12, enemy: { hp: 200 } });
    s = act(s, "fall"); s = act(s, "end"); assert.equal(s.phase, "reward");
    assert.equal(s.reports.length, 1); assert.equal(s.reports[0].events.delayed, 1);
    const report = R.clone(s.reports[0]);
    assert.equal(s.momentum, 0); assert.equal(s.pendingSword, 0);
    assert.equal(s.lastActive, null); assert.deepEqual(s.forms, []);
    s = act(s, "choose", { choice: s.offers[0] }); s = act(s, "next");
    assert.deepEqual(s.reports[0], report); assert.equal(s.pendingSword, 0);
    assert.equal(s.momentum, 0); assert.equal(s.lastActive, null); assert.deepEqual(s.forms, []);
});
test("cycle surcharge and bloodMana share one atomic cost; proc is not another cast", () => {
    let s = setup(["cycle", "bloodMana", "swordcraft"]); s.player.mp = 0; s.player.hp = 12;
    reject(s, { move: "edge" });
    s.player.hp = 13; s = act(s, "edge");
    assert.equal(s.player.hp, 1); assert.equal(s.fight.bloodSpent, 12);
    assert.equal(s.fight.events.summon, 1); assert.deepEqual(s.forms, ["edge"]);
    let proc = setup(["cycle", "swordcraft", "wound"]);
    proc = act(proc, "edge"); proc = act(proc, "wind"); proc = act(proc, "guide");
    assert.equal(proc.fight.events.cycle, 1); assert.equal(proc.fight.events.summon, 1);
    assert.equal(proc.fight.events.woundAdded, 2); assert.equal(proc.fight.actions, 3);
});
test("new multi-round mixed combinations remain bounded without recursive procs", () => {
    const variants = [
        ["storedEdge", "heavyEdge", "shieldFall", "meditation", "cycle", "tempo", "wound", "pinGuide", "woundGuard"],
        ["delayedFall", "stillness", "shieldWind", "swordcraft", "swordSiphon", "wound", "dye", "riposte", "tempo"],
    ];
    for (const items of variants) {
        let s = setup([...items, "bloodMana", "breathing"], { style: "assault", player: { hp: 100000 } });
        for (let round = 0; round < 20; round++) {
            s = act(s, "wind"); s = act(s, "fall"); s = act(s, "edge");
            assert.equal(s.round, round + 2);
            assert.ok(s.logs.length <= 400); assert.equal(s.fight.actions, (round + 1) * 3);
        }
        assert.ok(s.totals.events.tempo > 0);
    }
});
test("100 complete reward paths preserve3 eligible offers and checkpoint core guarantee when possible", () => {
    for (let seed = 1; seed <= 100; seed++) {
        let s = setup([], { battles: 12, seed, enemy: { hp: 1 } });
        for (let battle = 1; battle <= 9; battle++) {
            const corePossible = Object.keys(C.items).some(k => C.items[k].type === "core" && R.eligible(s, k));
            s = act(s, "basic"); assert.equal(s.offers.length, 3);
            if (battle % 3 === 0 && corePossible) assert.ok(s.offers.some(k => C.items[k].type === "core"));
            const choice = s.offers[(seed + battle) % 3]; s = act(s, "choose", { choice }); s = act(s, "next");
        }
    }
});
test("mixed flying wound and counter combinations remain finite across many rounds", () => {
    for (const core of ["swordUnity", "endlessWound", "turnTables"]) {
        let s = setup(["swordcraft", "flyingEdge", "salvo", "wound", "rupture", "dye", "riposte",
            "breakingWave", "retention", "breathing", "bloodMana", core], { style: "assault", player: { hp: 100000 } });
        for (let round = 0; round < 12 && s.phase === "fighting"; round++) {
            s = act(s, "wind"); s = act(s, "edge"); s = act(s, core === "endlessWound" ? "guide" : "end");
        }
        assert.ok(s.totals.events.flying > 0); assert.ok(s.totals.events.woundAdded > 0);
        assert.ok(s.totals.events.counter > 0); assert.ok(s.totals.actions <= 36);
    }
});
test("seeded malformed and legal-command fuzz: atomic failures and bounded states", () => {
    let attempts = 0, rng = 91;
    const rand = n => { rng = rng * 16807 % 2147483647; return rng % n; };
    for (let seed = 1; seed <= 40; seed++) {
        let s = R.start({ ...C.defaults(), seed });
        for (let step = 0; step < 180; step++) {
            const moves = ["basic", "guard", "edge", "wind", "guide", "fall", "end", "heal", "mana", "next", "choose", "bogus"];
            let a = { move: moves[rand(moves.length)], enemyAction: rand(5) };
            if (s.phase === "reward" && rand(2)) a = { move: "choose", choice: s.offers[rand(s.offers.length)] };
            if (s.phase === "between") a = { move: "next" };
            const before = R.clone(s), r = R.resolve(s, a); attempts++; assert.deepEqual(s, before);
            if (r.ok) { s = r.state; R.validateState(s); } else assert.equal(r.state, s);
            if (["complete", "defeat"].includes(s.phase)) break;
        }
    }
    assert.ok(attempts > 2000); console.log("Fuzz attempts: " + attempts);
});
console.log(`Rogue rules: ${groups} groups passed.`);
