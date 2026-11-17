const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { C, run, summarize } = require("./evaluate-rogue-gameplay.cjs");
const { focused, E } = require("./evaluate-rogue-enemies.cjs");
const output = path.resolve(process.env.ROGUE_OUTPUT || "bin/manual-tempo-20261117/final");
const policies = ["flying", "wound", "guard", "charge", "delay", "rotation", "shatter", "flex", "random", "basic"];
function tempo(rows) {
    const fights = rows.flatMap(r => r.reports);
    const average = xs => xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null;
    const byTier = Object.fromEntries(["普通", "精英", "首领"].map(tier => {
        const a = fights.filter(f => f.tier === tier), wins = a.filter(f => f.won);
        return [tier, { fights: a.length, wins: wins.length, meanRounds: average(a.map(f => f.rounds)),
            meanActions: average(a.map(f => f.actions)), firstRoundWins: wins.filter(f => f.rounds === 1).length,
            beforeEnemyActs: wins.filter(f => !(f.events.enemyActions > 0)).length,
            secondEnemyTurn: a.filter(f => f.events.enemyActions >= 6).length,
            winRounds: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => [n, wins.filter(f => f.rounds === n).length])),
            overTen: a.filter(f => f.rounds > 10).length }];
    }));
    const late = fights.filter(f => f.battle >= 10), lateActions = late.reduce((n, f) => n + f.actions, 0);
    return { ...summarize(rows), byTier, healUsed: rows.reduce((n, r) => n + r.totals.healUsed, 0),
        manaUsed: rows.reduce((n, r) => n + r.totals.manaUsed, 0),
        lowMana: rows.filter(r => r.mp < 8).length, lateActions,
        lateBasics: late.reduce((n, f) => n + (f.skills.basic || 0), 0),
        lateBasicRate: lateActions ? +(late.reduce((n, f) => n + (f.skills.basic || 0), 0) / lateActions).toFixed(3) : null };
}
function main() {
    fs.mkdirSync(output, { recursive: true });
    const count = Number(process.env.ROGUE_SEEDS || 24), main = [], extra = [], focus = [];
    for (const policy of policies) {
        for (let seed = 1; seed <= count; seed++) main.push(run(policy, { seed, style: "guzong" }));
        const a = tempo(main.filter(r => r.policy === policy));
        console.log(policy, JSON.stringify({ complete: a.complete, defeat: a.defeat, stalled: a.stalled,
            tiers: a.byTier, hp: a.averageHp, mp: a.averageMp, lateBasicRate: a.lateBasicRate }));
    }
    for (const pressure of ["relaxed", "standard", "hard"])
        for (const seed of [1, 17, 53]) for (const policy of ["flex", "random"])
            extra.push(run(policy, { seed, pressure, style: "guzong" }));
    for (const seed of [1, 17, 53]) for (const policy of ["flex", "guard", "rotation"])
        extra.push(run(policy, { seed, battles: 15, style: "guzong" }));
    for (const seed of [1, 17, 53]) for (const policy of ["flex", "random"])
        extra.push(run(policy, { seed, style: "guzong", healPotions: 0, manaPotions: 0 }));
    for (const id of Object.keys(E.enemies)) for (const strategy of ["search", "aggressive", "guarded"])
        focus.push(focused(id, strategy));
    for (const r of [...main, ...extra, ...focus]) assert.ok(["complete", "defeat"].includes(r.phase), r.policy + " stalled");
    const summary = { parameters: C.guzongTempo || null, total: tempo([...main, ...extra, ...focus]),
        main: tempo(main), nonBasic: tempo(main.filter(r => r.policy !== "basic")), extra: tempo(extra), focus: tempo(focus),
        byPolicy: Object.fromEntries(policies.map(k => [k, tempo(main.filter(r => r.policy === k))])),
        pressure: Object.fromEntries(["relaxed", "standard", "hard"].map(k => [k,
            tempo(extra.filter(r => r.setup.battles === 12 && r.setup.healPotions === 3 && r.setup.pressure === k))])),
        limitations: "Same finite3-action beam and seeded reward preferences, not optimal or human play. Focused fights reset supplies. No minimum-turn or lock-HP rule." };
    if (process.env.TEMPO_BEFORE) {
        const old = JSON.parse(fs.readFileSync(path.join(process.env.TEMPO_BEFORE, "tempo-results.json"), "utf8"));
        for (const [key, rows] of Object.entries({ main, extra, focus })) {
            assert.equal(old[key].length, rows.length);
            rows.forEach((r, i) => {
                assert.equal(r.policy, old[key][i].policy); assert.deepEqual(r.setup, old[key][i].setup, key + " paired setup");
            });
        }
        summary.comparison = { pairedMain: main.length, pairedExtra: extra.length, pairedFocus: focus.length,
            before: tempo(old.main), beforeNonBasic: tempo(old.main.filter(r => r.policy !== "basic")),
            differences: "Only guzong ordinary/elite HP factors and basic mana recovery changed; same input, policy and seed. Actual actions may adapt." };
    }
    fs.writeFileSync(path.join(output, "tempo-results.json"), JSON.stringify({ main, extra, focus }, null, 2));
    fs.writeFileSync(path.join(output, "tempo-summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ output, total: summary.total.runs, main: summary.main.complete,
        extra: summary.extra.complete, focus: summary.focus.complete }));
}
module.exports = { main, tempo };
if (require.main === module) main();
