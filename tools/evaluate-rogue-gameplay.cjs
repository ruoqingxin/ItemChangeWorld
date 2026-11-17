const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const live = path.resolve(__dirname, "../bin/manual-test/script/module/manualTest");
const base = path.resolve(process.env.ROGUE_RULES_BASE || live);
const { RogueTestRules: R } = require(path.join(base, "utils/RogueTestRules.js"));
const { RogueTestConfig: C } = require(path.join(base, "utils/RogueTestConfig.js"));
const { RogueTestConfig: CurrentConfig } = require(path.join(live, "utils/RogueTestConfig.js"));
const output = path.resolve(process.env.ROGUE_OUTPUT || path.join(__dirname, "../bin/manual-tempo-20261117/final"));
const families = { flying: ["swordUnity", "flyingEdge", "swordcraft", "salvo", "wound", "dye", "breathing"],
    wound: ["wound", "rupture", "endlessWound", "dye", "swordcraft", "riposte", "breathing"],
    guard: ["turnTables", "riposte", "breakingWave", "retention", "wound", "dye", "breathing"],
    charge: ["storedEdge", "heavyEdge", "meditation", "retention", "breathing", "tempo", "riposte"],
    delay: ["delayedFall", "stillness", "tempo", "breathing", "riposte", "wound", "woundGuard"],
    rotation: ["cycle", "tempo", "breathing", "pinGuide", "wound", "shieldWind", "storedEdge"],
    shatter: ["shieldFall", "storedEdge", "tempo", "retention", "breathing", "heavyEdge", "woundGuard", "wound"] };
const policies = ["flying", "wound", "guard", "charge", "delay", "rotation", "shatter", "flex", "random", "basic"];
function reward(s, policy) {
    if (policy === "random" || policy === "basic") return s.offers[0];
    const ranked = s.offers.map(k => {
        const prefs = families[policy], i = prefs?.indexOf(k);
        let score = prefs ? i >= 0 ? 100 - i * 8 : 1 : 10;
        if (!prefs) {
            if (k === "wound" || k === "swordcraft" || k === "riposte") score += 16;
            if (k === "breathing") score += s.player.mp < s.player.maxMp * 0.6 ? 20 : 8;
            if (k === "rupture" && R.has(s, "wound")) score += 18;
            if (k === "dye") score += 20;
            if (k === "swordUnity") score += R.has(s, "flyingEdge") ? 25 : 10;
            if (k === "endlessWound") score += 22;
            if (k === "turnTables") score += R.has(s, "riposte") || R.has(s, "breakingWave") ? 24 : 8;
            if (["tempo", "shieldWind", "pinGuide", "woundGuard"].includes(k)) score += 12;
            if (k === "cycle") score += s.player.mp > 30 ? 18 : -5;
            if (k === "heavyEdge") score += R.has(s, "storedEdge") ? 18 : 6;
            if (k === "stillness") score += 18;
            if (C.items[k].type === "core" && s.core) score -= 12;
        }
        return { k, score };
    }).sort((a, b) => b.score - a.score);
    return ranked[0].k;
}
function candidates(s, policy) {
    if (policy === "basic") return [{ move: "basic" }];
    return ["basic", "guard", "edge", "wind", "fall", "end"].map(move => ({ move })).concat(
        (R.has(s, "rupture") ? [1] : [1, 2, 3]).map(enemyAction => ({ move: "guide", enemyAction })));
}
function choose(s, policy = "flex") {
    const source = R.clone(s); source.logs = []; source.reports = []; source.rewards = [];
    const score = n => {
        const future = n.phase === "fighting" ? Math.min(3, n.enemy.hp / Math.max(1, n.player.attack)) : 0;
        return (source.enemy.hp - n.enemy.hp) + (n.player.hp - source.player.hp) * 1.5 -
            (source.player.mp - n.player.mp) * 2 + n.flying * 12 * future + n.wounds * 6 * future +
            n.momentum * 18 * future + n.forms.length * 16 * future +
            (n.phase === "fighting" ? Math.min(n.player.shield, 60) * 0.1 + n.pendingSword * 0.45 : 0) +
            (["reward", "between", "complete"].includes(n.phase) ? 150 : 0) - (n.phase === "defeat" ? 100000 : 0);
    };
    let beam = [{ state: source, first: null, value: 0 }], finished = [];
    for (let depth = 0; depth < Math.min(3, s.ap); depth++) {
        const next = [];
        for (const b of beam) for (const action of candidates(b.state, policy)) {
            const result = R.resolve(b.state, action); if (!result.ok) continue;
            const row = { state: result.state, first: b.first || action, value: score(result.state) };
            if (row.state.round > source.round || row.state.phase !== "fighting") finished.push(row);
            else next.push(row);
        }
        next.sort((a, b) => b.value - a.value); beam = next.slice(0, 5);
    }
    const final = finished.length ? finished : beam;
    return final.sort((a, b) => b.value - a.value)[0]?.first || { move: "basic" };
}
function run(policy = "flex", options = {}, trace = false) {
    const defaults = CurrentConfig.defaults();
    const d = { ...defaults, ...options, player: { ...defaults.player, ...options.player },
        enemy: { ...defaults.enemy, ...options.enemy } };
    let s = R.start(d), commands = [], steps = 0, stalled = false;
    while (["fighting", "reward", "between"].includes(s.phase) && steps++ < 1200) {
        if (s.round > 60) { stalled = true; break; }
        let action;
        if (!s.potionUsed && s.potions.heal && s.player.hp <= s.player.maxHp * 0.65) action = { move: "heal" };
        else if (!s.potionUsed && s.potions.mana && s.player.mp <= s.player.maxMp * 0.6) action = { move: "mana" };
        else if (s.phase === "reward") action = { move: "choose", choice: reward(s, policy) };
        else if (s.phase === "between") action = { move: "next" };
        else action = choose(s, policy);
        const before = s, result = R.resolve(s, action); assert.ok(result.ok, result.reason); s = result.state;
        R.validateState(s);
        if (action.move === "next") {
            assert.equal(s.player.hp, before.player.hp); assert.equal(s.player.mp, before.player.mp);
            assert.deepEqual(s.potions, before.potions); assert.equal(s.flying, 0); assert.equal(s.wounds, 0);
        }
        if (trace) commands.push({ action, state: R.clone(s) });
    }
    stalled ||= steps >= 1200;
    return { policy, setup: d, phase: stalled ? "stalled" : s.phase, won: s.reports.filter(r => r.won).length,
        hp: s.player.hp, mp: s.player.mp, potions: s.potions, build: R.build(s), acquired: s.acquired,
        core: s.core, rewards: s.rewards, totals: s.totals, reports: s.reports, commands };
}
const average = rows => rows.length ? Math.round(rows.reduce((a, b) => a + b, 0) / rows.length * 10) / 10 : null;
function summarize(rows) {
    return { runs: rows.length, complete: rows.filter(r => r.phase === "complete").length,
        defeat: rows.filter(r => r.phase === "defeat").length, stalled: rows.filter(r => r.phase === "stalled").length,
        fights: rows.reduce((n, r) => n + r.reports.length, 0), averageWon: average(rows.map(r => r.won)),
        averageHp: average(rows.map(r => r.hp)), averageMp: average(rows.map(r => r.mp)),
        normalActions: average(rows.flatMap(r => r.reports.filter(f => f.tier === "普通").map(f => f.actions))),
        bossActions: average(rows.flatMap(r => r.reports.filter(f => f.tier === "首领").map(f => f.actions))),
        eliteActions: average(rows.flatMap(r => r.reports.filter(f => f.tier === "精英").map(f => f.actions))),
        heavyUsers: rows.filter(r => (r.totals.events.heavy || 0) > 0).length,
        heavyOwners: rows.filter(r => r.acquired.includes("heavyEdge")).length,
        coreOwners: rows.filter(r => r.core).length,
        uniqueBuilds: new Set(rows.map(r => r.build.slice().sort().join(","))).size,
        cores: Object.fromEntries(["none", ...Object.keys(C.items).filter(k => C.items[k].type === "core")].map(k =>
            [k, rows.filter(r => (r.core || "none") === k).length])),
        events: Object.fromEntries(Object.keys(C.events).map(k =>
            [k, rows.reduce((n, r) => n + (r.totals.events[k] || 0), 0)])),
        skills: Object.fromEntries(["basic", "guard", "edge", "wind", "guide", "fall"].map(k =>
            [k, rows.reduce((n, r) => n + (r.totals.skills[k] || 0), 0)])) };
}
function main() {
    fs.mkdirSync(output, { recursive: true });
    const count = Number(process.env.ROGUE_SEEDS || 24), mainRows = [], extra = [];
    for (const policy of policies) {
        for (let seed = 1; seed <= count; seed++) mainRows.push(run(policy, { seed }));
        console.log(policy + ": " + JSON.stringify(summarize(mainRows.filter(r => r.policy === policy))));
    }
    for (const style of ["assault", "defensive", "burst"]) for (const policy of ["flying", "wound", "guard"])
        for (const seed of [1, 17, 53]) extra.push(run(policy, { style, seed }));
    for (const policy of ["flying", "wound", "guard", "flex"]) for (const seed of [1, 17, 53])
        extra.push(run(policy, { seed, healPotions: 0, manaPotions: 0, enemy: { hp: 600, attack: 70 } }));
    for (const battles of [1, 15]) for (const policy of ["flying", "wound", "guard"]) extra.push(run(policy, { battles, seed: 17 }));
    for (const pressure of ["relaxed", "standard", "hard"])
        for (const policy of ["charge", "rotation", "flex", "random"])
            for (const seed of [1, 17, 53]) extra.push(run(policy, { pressure, seed }));
    const all = [...mainRows, ...extra];
    const summary = { overall: summarize(all), main: summarize(mainRows), extra: summarize(extra),
        rulesBase: base,
        byPolicy: Object.fromEntries(policies.map(k =>
            [k, summarize(mainRows.filter(r => r.policy === k))])),
        obtained: Object.fromEntries(Object.keys(C.items).map(k => [k, all.filter(r => r.acquired.includes(k)).length])),
        limitations: "Bounded 3-action beam, preferences only among actual seeded offers; not optimal play or human fun validation. Basic still receives passives." };
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(all, null, 2));
    fs.writeFileSync(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}
module.exports = { R, C, choose, reward, run, summarize, output };
if (require.main === module) main();
