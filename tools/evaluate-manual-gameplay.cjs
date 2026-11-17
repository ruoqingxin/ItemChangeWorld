const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = path.resolve(process.env.MANUAL_RULES_BASE || path.join(__dirname, "../bin/manual-test/script/module/manualTest"));
const { ManualTestRules: R } = require(path.join(base, "utils/ManualTestRules.js"));
const { ManualTestConfig: C } = require(path.join(base, "utils/ManualTestConfig.js"));
const output = path.resolve(process.env.MANUAL_GAMEPLAY_OUTPUT || path.join(__dirname, "../bin/manual-fun-20261117"));
const levels = Array.from({ length: 31 }, (_, i) => i ?
    { star: Math.ceil(i / 6), rank: (i - 1) % 6 + 1 } : { star: 0, rank: 0 });

function candidates(s, policy) {
    if (policy === "basic") return [{ move: "basic" }];
    const rows = [{ move: "basic" }, { move: "guard" }];
    const free = s.shadows.filter(x => !s.delayed?.ids.includes(x.id));
    for (const move of ["edge", "wind", "guide"]) {
        for (const enemyAction of move === "guide" && s.path === "guide" ? [1, 2, 3] : [1]) {
            if (s.shadows.length < 3) rows.push({ move, enemyAction });
            else for (const shadow of free) rows.push({ move, replacementId: shadow.id, enemyAction });
        }
    }
    for (let mask = 1; mask < 1 << free.length; mask++) {
        const shadowIds = free.filter((_, i) => mask & 1 << i).map(x => x.id);
        // Timing for guide shadows matters even before the delayed-harvest star.
        for (const enemyAction of free.some(x => shadowIds.includes(x.id) && x.kind === "guide") ? [1, 2, 3] : [1])
            rows.push({ move: "fall", shadowIds, enemyAction });
        if (R.has(s, 3, 6) && s.ap === 1 && !s.delayed)
            for (const enemyAction of [1, 2, 3]) rows.push({ move: "fall", branch: "delay", shadowIds, enemyAction });
    }
    if (R.has(s, 4, 6) && !s.body) for (const x of free.filter(x => x.warm))
        for (const enemyAction of x.kind === "guide" ? [1, 2, 3] : [1])
            rows.push({ move: "fall", branch: "absorb", shadowIds: [x.id], enemyAction });
    if (R.finisherReady(s) && free.length) rows.push({ move: "fall", branch: "finish", shadowIds: free.map(x => x.id), enemyAction: 3 });
    return rows;
}
function potential(s) {
    if (s.phase !== "fighting") return 0;
    const pressure = s.intentions.reduce((n, i) => n + (i.kind === "attack" ? s.enemy.attack * i.percent / 100 : 0), 0);
    return s.shadows.reduce((n, x) => n + (x.kind === "edge" ? x.warm ? 60 : 35 :
        x.kind === "guard" ? Math.min(35, pressure / 3) : s.enemy.style === "burst" ? 35 : 15), 0) +
        (s.body && s.enemy.hp > s.player.attack * 3 ? 50 : 0) +
        (s.enemy.exposed ? s.player.attack * C.openingStrike : 0);
}
function choose(s, policy = "adaptive") {
    // Bounded, three-action beam; carries real resources through the entire run.
    const source = R.clone(s); source.logs = []; source.reports = [];
    const score = n => {
        const spent = source.player.mp - n.player.mp;
        return (source.enemy.hp - n.enemy.hp) + (n.player.hp - source.player.hp) * 1.25 - spent * 1.2 +
            potential(n) - (n.phase === "defeat" ? 100000 : 0) + (n.outcome === "victory" ? 150 : 0);
    };
    let beam = [{ state: source, first: null, value: 0 }], finished = [];
    for (let depth = 0; depth < Math.min(3, s.ap); depth++) {
        const next = [];
        for (const b of beam) for (const a of candidates(b.state, policy)) {
            const r = R.resolve(b.state, a); if (!r.ok) continue;
            const row = { state: r.state, first: b.first || a, value: score(r.state) };
            if (r.state.round > source.round || r.state.phase !== "fighting") finished.push(row);
            else next.push(row);
        }
        next.sort((a, b) => b.value - a.value);
        beam = next.slice(0, 4);
    }
    const all = [...finished, ...beam].sort((a, b) => b.value - a.value);
    return all[0]?.first || { move: "basic" };
}
function run(growth, route = "edge", options = {}) {
    const { policy = "adaptive", trace: recordTrace = false, ...tuning } = options;
    const setup = { ...C.defaults(), ...growth, ...tuning };
    setup.player = { ...C.defaults().player, ...options.player };
    setup.enemy = { ...C.defaults().enemy, ...options.enemy };
    let s = R.start(setup), trace = [], turns = 0;
    while (["fighting", "reward", "between"].includes(s.phase) && turns++ < 1600) {
        let a;
        if (!s.potionUsed && s.player.hp <= s.player.maxHp * 0.65 && s.potions.heal) a = { move: "heal" };
        else if (!s.potionUsed && s.player.mp <= s.player.maxMp * 0.6 && s.potions.mana) a = { move: "mana" };
        else if (s.phase === "reward") a = { move: s.path === "none" ? "route" : "upgrade",
            choice: s.path === "none" ? route : s.offers[0] };
        else if (s.phase === "between") a = { move: "next" };
        else a = choose(s, policy);
        const before = s, r = R.resolve(s, a);
        assert.ok(r.ok, `${JSON.stringify(a)}: ${r.reason}`); s = r.state; R.validateState(s);
        if (a.move === "next") {
            assert.equal(s.player.hp, before.player.hp); assert.equal(s.player.mp, before.player.mp);
            assert.deepEqual(s.potions, before.potions); assert.equal(s.shadows.length, 1);
        }
        if (recordTrace) trace.push({ action: a, state: R.clone(s) });
    }
    assert.ok(turns < 1600, "run must terminate without infinite defense loop");
    return { setup, route, policy, phase: s.phase, won: s.reports.filter(x => x.won).length,
        hp: s.player.hp, mp: s.player.mp, potions: s.potions, upgrades: s.upgrades,
        totals: s.totals, reports: s.reports, trace };
}
function main() {
    fs.mkdirSync(output, { recursive: true });
    const results = [];
    for (const growth of levels) {
        for (const route of ["edge", "guard", "guide"]) for (const seed of [1, 17, 53]) {
            const r = run(growth, route, { seed }); results.push(r);
        }
        results.push(run(growth, "edge", { policy: "basic" }));
        console.log(`${growth.star}/${growth.rank}: 9 seeded runs + basic baseline`);
    }
    // Additional encounter styles, longer/shorter runs and no-supply pressure.
    for (const star of [0, 1, 2, 3, 4, 5]) for (const route of ["edge", "guard", "guide"])
        for (const style of ["assault", "defensive", "burst"]) {
            results.push(run({ star, rank: star ? 6 : 0 }, route, { style }));
        }
    for (const battles of [1, 10, 15]) for (const star of [0, 3, 5])
        results.push(run({ star, rank: star ? 6 : 0 }, "edge", { battles }));
    for (const star of [0, 3, 5]) results.push(run({ star, rank: star ? 6 : 0 }, "edge",
        { battles: 15, healPotions: 0, manaPotions: 0, enemy: { hp: 500, attack: 60 } }));
    const summary = {
        runs: results.length, completed: results.filter(x => x.phase === "complete").length,
        defeated: results.filter(x => x.phase === "defeat").length,
        fights: results.reduce((n, x) => n + x.reports.length, 0),
        byStar: Array.from({ length: 6 }, (_, star) => {
            const rows = results.filter(x => x.setup.star === star && x.setup.style === "mixed" &&
                x.setup.battles === 12 && x.policy === "adaptive");
            return { star, runs: rows.length, completed: rows.filter(x => x.phase === "complete").length,
                averageHp: Math.round(rows.reduce((n, x) => n + x.hp, 0) / rows.length),
                averageMp: Math.round(rows.reduce((n, x) => n + x.mp, 0) / rows.length),
                ordinaryActions: average(rows.flatMap(x => x.reports.filter(r => r.tier === "普通").map(r => r.actions))),
                bossActions: average(rows.flatMap(x => x.reports.filter(r => r.tier === "首领").map(r => r.actions))) };
        }),
        limitations: "Deterministic three-action beam, not optimal play or human fun validation; tuning only.",
    };
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}
function average(rows) { return rows.length ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length * 10) / 10 : null; }
module.exports = { R, C, choose, run, output, levels };
if (require.main === module) main();
