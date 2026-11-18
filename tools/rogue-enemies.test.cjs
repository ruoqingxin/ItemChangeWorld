const assert = require("node:assert/strict");
const path = require("node:path");
const {load}=require("./config-fixture.cjs");
const {QingmingRules:R}=load("module/skillBattle/utils/QingmingRules.js");
const {QingmingConfig:C}=load("module/skillBattle/utils/QingmingConfig.js");
const {GuzongEnemyRules:E}=load("module/skillBattle/utils/GuzongEnemyRules.js");
const {RogueTestManager:Manager}=load("module/manualTest/manager/RogueTestManager.js");
let groups = 0;
function test(name, fn) { fn(); groups++; console.log("PASS " + name); }
function setup(id, options = {}, items = []) {
    const defaults = C.defaults();
    const s = R.start({ ...defaults, style: "guzong", enemyId: id, battles: 1, ...options,
        player: { ...defaults.player, hp: 100000, ...options.player },
        enemy: { ...defaults.enemy, hp: 10000, ...options.enemy } });
    for (const k of items) {
        s.acquired.push(k);
        const item = C.items[k];
        if (item.type === "passive") s.passives.push(k);
        else if (item.type === "core") s.core = k;
        else s.mutations[item.slot] = k;
    }
    return s;
}
function act(s, move, extra = {}) {
    const before = R.clone(s), r = R.resolve(s, { move, ...extra });
    assert.deepEqual(s, before); assert.ok(r.ok, r.reason); R.validateState(r.state); return r.state;
}
function turn(s, actions = ["guard", "guard", "guard"]) {
    const round = s.round;
    for (const move of actions) s = act(s, move);
    if (s.round === round) s = act(s, "end");
    return s;
}
test("catalog has exactly7 normals5 elites3 bosses and frozen independent seeded lineup", () => {
    const keys = Object.keys(E.enemies);
    for (const [tier, count] of [["普通", 7], ["精英", 5], ["首领", 3]])
        assert.equal(keys.filter(k => E.enemies[k].tier === tier).length, count);
    const signatures = new Set(), bosses = new Set();
    for (let seed = 1; seed <= 100; seed++) {
        const s = R.start({ ...C.defaults(), seed }), replay = R.start({ ...C.defaults(), seed });
        assert.deepEqual(s.enemyPlan, replay.enemyPlan); assert.equal(s.rng, seed, "lineup must not consume reward RNG");
        assert.equal(s.enemyPlan.length, 12); bosses.add(s.enemyPlan[11]);
        assert.deepEqual(s.enemyPlan.map(k => E.enemies[k].tier), ["普通", "普通", "精英", "普通", "普通", "精英",
            "普通", "普通", "精英", "普通", "普通", "首领"]);
        assert.notEqual(s.enemyPlan[0], s.enemyPlan[1]);
        for (let i = 1; i < 12; i++) assert.notEqual(s.enemyPlan[i], s.enemyPlan[i - 1]);
        signatures.add(s.enemyPlan.join(","));
    }
    assert.equal(bosses.size, 3); assert.ok(signatures.size > 90);
});
test("focused encounters validate ids and single mode; elite and boss receive their tier once", () => {
    for (const patch of [{ enemyId: "bogus", battles: 1 }, { enemyId: "stone" },
        { enemyId: "stone", battles: 1, style: "mixed" }]) assert.throws(() => R.start({ ...C.defaults(), ...patch }));
    assert.equal(setup("gatekeeper").enemy.maxHp, 21600);
    assert.equal(setup("tortoise").enemy.maxHp, 30000);
    assert.equal(setup("stone").enemy.shield, 25);
    assert.equal(setup("tortoise").enemy.shield, 100);
});
test("all15 species run at least2 full cycles, exactly3 actions and bounded states", () => {
    for (const id of Object.keys(E.enemies)) {
        let s = setup(id, { enemy: { attack: 1 }, player: { mp: 10000 } });
        for (let i = 0; i < 6; i++) {
            assert.equal(s.intentions.length, 3);
            s = turn(s, ["basic", "guard", "guard"]);
            assert.equal(s.round, i + 2);
            assert.equal(s.totals.events.enemyActions, (i + 1) * 3);
            assert.equal(s.ap, 3); assert.equal(s.foe.acting, false);
        }
    }
});
test("stone actual break weakens first hit, expired shield does not; dynamic preview remains pure", () => {
    let s = setup("stone"); const before = R.clone(s);
    const preview = R.resolve(s, { move: "basic" }); assert.deepEqual(s, before);
    s = preview.state; assert.equal(s.foe.broken, true); assert.equal(E.percent(s, s.intentions[0]), 40);
    s = act(s, "end"); assert.equal(s.totals.taken, 55);
    let unbroken = setup("stone"); unbroken = act(unbroken, "end");
    assert.equal(unbroken.totals.taken, 77); assert.equal(unbroken.totals.events.enemyBreak || 0, 0);
});
test("round-end flying can break shield before heavy bonus; enemy-turn procs cannot alter player break flag", () => {
    let s = setup("stone", {}, ["swordcraft"]); s.enemy.shield = 20;
    s = act(s, "wind"); s = act(s, "end");
    assert.equal(s.totals.events.enemyBreak, 1);
    assert.ok(s.totals.events.flying > 0);
    let during = setup("stone", {}, ["wound"]); during.wounds = 6;
    during = act(during, "end");
    assert.equal(during.totals.events.enemyBreak || 0, 0);
});
test("thunder charges across rounds; suppression does not cancel charge, planned numeric strike can be suppressed", () => {
    let s = setup("thunder"); s = act(s, "guide", { enemyAction: 3 }); s = act(s, "end");
    assert.equal(s.enemy.charged, true); assert.equal(s.intentions[2].percent, 240);
    const baseline = act(s, "end"), reduced = act(act(s, "guide", { enemyAction: 3 }), "end");
    assert.ok(baseline.player.hp < reduced.player.hp); assert.equal(reduced.enemy.charged, false);
});
test("limited heal succeeds only2 times, full HP fallback does not consume charge, no infinite recovery", () => {
    let s = setup("apothecary"); s = act(s, "end");
    assert.equal(s.foe.heals, 2); assert.equal(s.enemy.mp, 177);
    for (let i = 0; i < 6; i++) {
        s.enemy.hp = s.enemy.maxHp - 2000; s = act(s, "end");
    }
    assert.equal(s.foe.heals, 0); assert.equal(s.totals.events.enemyHeal, 2160);
});
test("alchemist actual4percent threshold respects suppression, missing HP and rounding", () => {
    for (const hp of [500, 800, 10000]) {
        let s = setup("alchemist", { enemy: { hp } }); s.enemy.hp = Math.floor(s.enemy.maxHp * 0.8);
        const heated = act(s, "end"); assert.equal(heated.foe.heat, 1);
        const cooled = act(act(s, "guide", { enemyAction: 2 }), "end");
        assert.equal(cooled.foe.heat, 0);
        assert.equal(E.percent(heated, heated.intentions[2]), 220);
    }
    let partial = setup("alchemist"); partial.enemy.hp--;
    partial = act(partial, "end"); assert.equal(partial.foe.heat, 0); assert.equal(partial.foe.heals, 1);
});
test("blood self-cost nonlethal, not player damage; vulnerability buffs direct and proc once", () => {
    let s = setup("bloodBlade"); s = act(s, "end");
    assert.equal(s.totals.damage, 0); assert.equal(s.totals.events.enemyBlood, 540); assert.equal(s.foe.vulnerable, true);
    const hp = s.enemy.hp; s = act(s, "basic"); assert.equal(hp - s.enemy.hp, 120);
    const eventCount = s.totals.events.enemyBlood; s = act(s, "end");
    assert.equal(s.foe.vulnerable, false); assert.equal(s.totals.events.enemyBlood, eventCount);
    let dying = setup("bloodBlade"); dying.enemy.hp = 1; dying = act(dying, "end"); assert.equal(dying.enemy.hp, 1);
});
test("echo only repeats active casts, not basic, potion or flying; dynamic third attack caps once", () => {
    let s = setup("echo", {}, ["flyingEdge", "swordUnity"]);
    s = act(s, "edge"); assert.equal(E.percent(s, s.intentions[2]), 80);
    s = act(s, "edge"); assert.equal(E.percent(s, s.intentions[2]), 140);
    s = act(s, "end"); assert.equal(s.totals.events.enemyEcho, 1);
    let plain = setup("echo"); plain = turn(plain, ["basic", "basic", "basic"]);
    assert.equal(plain.totals.events.enemyEcho || 0, 0);
});
test("shade checks positive shield before first damage, not after the same hit breaks it", () => {
    let s = setup("shade"); const noShield = act(s, "end"); s.player.shield = 1;
    assert.equal(E.percent(s, s.intentions[0]), 80);
    const protected = act(s, "end");
    assert.equal(noShield.totals.taken - protected.totals.taken, 34);
});
test("read locks last previous active; another active clears, basic does not, derived attacks unaffected", () => {
    let s = setup("swordsman", {}, ["flyingEdge", "swordUnity"]);
    s = act(s, "edge"); s = act(s, "end"); assert.equal(s.foe.read, "edge");
    let read = act(s, "edge"); assert.equal(read.totals.events.enemyRead, 1);
    assert.equal(read.totals.damage - s.totals.damage, 109 - s.enemy.shield);
    let basic = act(s, "basic"); assert.equal(basic.foe.read, "edge");
    let cleared = act(s, "wind"); assert.equal(cleared.foe.read, null);
    cleared = act(cleared, "edge"); assert.equal(cleared.totals.events.enemyRead || 0, 0);
    let noCast = act(basic, "end"); assert.equal(noCast.foe.read, null);
});
test("shatter removes remaining shield only, never extra HP or second counter; slots alternate", () => {
    let s = setup("breaker", {}, ["riposte"]); s.player.shield = 240; s = act(s, "end");
    assert.equal(s.totals.events.enemyShatter, 53);
    assert.equal(s.totals.events.counter, 2); assert.equal(s.totals.taken, 0);
    assert.equal(s.intentions[2].shatter, true);
    let naked = setup("breaker"); naked = act(naked, "end");
    assert.equal(naked.totals.events.enemyShatter || 0, 0); assert.equal(naked.totals.taken, 146);
});
test("formation requires next turn3 real body hits; three basics work, flying/procs do not count", () => {
    let s = setup("arrayMaster"); s = act(s, "end"); assert.equal(s.foe.formation, true);
    s = act(s, "basic"); s = act(s, "basic"); assert.equal(s.foe.hits, 2);
    assert.equal(E.percent(s, s.intentions[2]), 260);
    const complete = act(s, "basic"); assert.equal(complete.totals.events.enemyArrayBreak, 1);
    assert.equal(complete.foe.formation, false);
    let derived = setup("arrayMaster", {}, ["flyingEdge", "swordUnity"]);
    derived = act(derived, "end"); derived = act(derived, "edge");
    assert.equal(derived.foe.hits, 1); assert.equal(derived.foe.formation, true);
    derived = act(derived, "end"); assert.equal(derived.foe.formation, false);
});
test("boss phases apply only at next intent generation, never rewrite shown actions or lock HP", () => {
    let s = setup("swordmaster"); s = act(s, "end"); assert.equal(s.intentions[2].percent, 180);
    s.enemy.hp = Math.floor(s.enemy.maxHp / 2) + 10;
    const plan = R.clone(s.intentions); s = act(s, "basic");
    assert.deepEqual(s.intentions, plan); assert.equal(s.foe.phase2, false);
    s = act(s, "end"); assert.equal(s.foe.phase2, true);
    s = act(s, "end"); s = act(s, "end");
    assert.equal(s.intentions[0].percent, 180); assert.equal(s.intentions[2].percent, 100);
    let lethal = setup("swordmaster", { player: { attack: 1000000 }, enemy: { hp: 1 } });
    lethal = act(lethal, "basic"); assert.equal(lethal.phase, "complete"); assert.equal(lethal.reports.length, 1);
});
test("boss recovery window buffs all damage once, disappears next enemy turn; second phase keeps window", () => {
    for (const id of ["tortoise", "swordmaster", "swordSpirit"]) {
        let s = setup(id, {}, ["wound", "swordcraft", "flyingEdge", "swordUnity"]);
        s.enemy.hp = Math.floor(s.enemy.maxHp / 2);
        s = act(s, "end"); s = act(s, "end"); s = act(s, "end");
        assert.equal(s.foe.vulnerable, true); assert.equal(s.foe.phase2, true);
        s.enemy.shield = 0;
        const basic = act(s, "basic");
        assert.equal(basic.totals.damage - s.totals.damage, 120);
        const combo = act(s, "edge");
        assert.equal(combo.totals.damage - s.totals.damage, 156);
        const ended = act(s, "end"); assert.equal(ended.foe.vulnerable, false);
    }
});
test("mana planning never overdraws, failed charge/form cannot create future bonus; guards/heals degrade legally", () => {
    for (const id of Object.keys(E.enemies)) {
        for (const mp of [0, 3, 4, 5, 7]) {
            let s = setup(id, { enemy: { mp }, player: { mp: 0 } });
            for (let n = 0; n < 4; n++) {
                s = act(s, "end"); assert.ok(s.enemy.mp >= 0);
            }
            if (id === "alchemist") assert.ok(s.foe.heat <= 1);
        }
    }
    let s = setup("thunder", { enemy: { mp: 0 } }); s = act(s, "end");
    assert.equal(s.enemy.charged, false); assert.equal(s.intentions[2].percent, 100);
});
test("12/15 battle schedule, sealed enemy report, reset, stale commit and potion/reward invariants", () => {
    for (const battles of [12, 15]) {
        let s = R.start({ ...C.defaults(), battles, enemy: { hp: 1, mp: 180, attack: 0, defense: 0 } });
        const plan = s.enemyPlan.slice();
        while (["fighting", "reward", "between"].includes(s.phase)) {
            if (s.phase === "fighting") s = act(s, "basic");
            else if (s.phase === "reward") s = act(s, "choose", { choice: s.offers[0] });
            else {
                const hp = s.player.hp, mp = s.player.mp, potions = R.clone(s.potions), reports = R.clone(s.reports);
                s = act(s, "next"); assert.equal(s.player.hp, hp); assert.equal(s.player.mp, mp);
                assert.deepEqual(s.potions, potions); assert.deepEqual(s.reports, reports);
                assert.equal(s.foe.heat, 0); assert.equal(s.foe.hits, 0); assert.equal(s.foe.formation, false);
            }
        }
        assert.equal(s.phase, "complete"); assert.deepEqual(s.reports.map(r => r.enemyId), plan);
        assert.equal(s.rewards.length, 9);
    }
    const manager = new Manager(); assert.ok(manager.start()); const revision = manager.state.revision;
    manager.draft.enemyId = "bogus"; const before = R.clone(manager.state); assert.equal(manager.start(), false);
    assert.deepEqual(manager.state, before); assert.equal(manager.commit({ move: "basic" }, revision - 1).ok, false);
});
test("seeded mixed actions across all enemies preserve source purity and bounded nonrecursive state", () => {
    let attempts = 0, rng = 137;
    const rand = n => { rng = rng * 16807 % 2147483647; return rng % n; };
    for (const id of Object.keys(E.enemies)) {
        let s = setup(id, { player: { mp: 10000 } }, ["wound", "riposte", "swordcraft", "dye", "breathing", "bloodMana", "tempo"]);
        for (let step = 0; step < 200 && s.phase === "fighting"; step++) {
            const move = ["basic", "guard", "edge", "wind", "guide", "fall", "end", "heal", "mana", "bogus"][rand(10)];
            const before = R.clone(s), result = R.resolve(s, { move, enemyAction: rand(5) }); attempts++;
            assert.deepEqual(s, before);
            if (result.ok) { s = result.state; R.validateState(s); } else assert.equal(result.state, s);
        }
    }
    console.log("Enemy fuzz attempts: " + attempts); assert.ok(attempts >= 2000);
});
test("guzong durability changes only species HP, not attack, pressure or player stats", () => {
    const d = C.defaults();
    assert.equal(R.start(d).enemy.maxHp, 900);
    assert.equal(R.start({ ...d, enemyId: "gatekeeper", battles: 1 }).enemy.maxHp, 1080);
    assert.equal(R.start({ ...d, enemyId: "tortoise", battles: 1 }).enemy.maxHp, 1500);
    assert.throws(() => R.start({ ...d, style: "mixed" }), /敌阵无效/);
    assert.deepEqual(R.start(d).player, { ...d.player, maxHp: d.player.hp, maxMp: d.player.mp, shield: 0 });
    assert.equal(R.start(d).enemy.attack, 55);
});
test("all seven base-kit normals survive opening burst without damage caps or invulnerability", () => {
    for (const id of Object.keys(E.enemies).filter(k => E.enemies[k].tier === "普通")) {
        let s = R.start({ ...C.defaults(), enemyId: id, battles: 1 });
        s = turn(s, ["edge", "edge", "fall"]);
        assert.equal(s.phase, "fighting", id + " must have time for its mechanism");
        assert.equal(s.round, 2); assert.equal(s.totals.events.enemyActions, 3);
        assert.ok(s.enemy.hp > 0 && s.enemy.hp < s.enemy.maxHp);
        const strong = setup(id, { player: { attack: 1000000 } });
        const won = act(strong, "basic"); assert.equal(won.phase, "complete"); assert.equal(won.reports[0].rounds, 1);
        assert.equal(won.reports[0].events.enemyActions || 0, 0);
    }
});
test("guzong basics restore3 plus optional4 from breathing, cap actual gain and do not grant AP", () => {
    let s = setup("patrol"); s.player.mp = 100;
    const before = R.clone(s), preview = R.resolve(s, { move: "basic" });
    assert.deepEqual(s, before); assert.equal(preview.state.player.mp, 103);
    s = act(s, "basic"); assert.equal(s.ap, 2); assert.equal(s.totals.events.basicMana, 3);
    let breathing = setup("patrol", {}, ["breathing"]); breathing.player.mp = 100;
    breathing = act(breathing, "basic"); assert.equal(breathing.player.mp, 107);
    assert.equal(breathing.totals.events.basicMana, 7);
    let capped = setup("patrol"); capped.player.mp--;
    capped = act(capped, "basic"); assert.equal(capped.player.mp, 120); assert.equal(capped.totals.events.basicMana, 1);
    const full = act(setup("patrol"), "basic"); assert.equal(full.totals.events.basicMana || 0, 0);
});
test("basic recovery is not free idling, does not apply to other skills, lethal or failed actions", () => {
    let s = setup("patrol"); s.player.mp = 100;
    assert.equal(act(s, "end").player.mp, 100); assert.equal(act(s, "guard").player.mp, 100);
    assert.equal(act(s, "edge").player.mp, 96);
    s.enemy.hp = 1; const won = act(s, "basic"); assert.equal(won.player.mp, 100);
    assert.equal(won.totals.events.basicMana || 0, 0);
    let invalid = setup("patrol"); invalid.player.mp = 0;
    const refused = R.resolve(invalid, { move: "fall" }); assert.equal(refused.ok, false); assert.equal(refused.state, invalid);
});
test("victory preserves remaining mana without refilling", () => {
    const current = setup("patrol"); current.player.mp = 100; current.enemy.hp = 1;
    const won = act(current, "basic"); assert.equal(won.reports[0].endMp, 100);
    assert.equal(won.player.mp, 100);
});
console.log(`Enemy rules: ${groups} groups passed.`);
