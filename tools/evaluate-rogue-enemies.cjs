const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { R, C, run, choose, summarize, output } = require("./evaluate-rogue-gameplay.cjs");
const { RogueEnemyRules: E } = require("../bin/manual-test/script/module/manualTest/utils/RogueEnemyRules.js");
const policies = ["flying", "wound", "guard", "charge", "delay", "rotation", "shatter", "flex", "random", "basic"];
const seedCount = Number(process.env.ENEMY_SEEDS || 12);
function focused(id, strategy, trace = false) {
    const d = { ...C.defaults(), style: "guzong", enemyId: id, battles: 1 };
    let s = R.start(d), steps = 0; const commands = [];
    while (s.phase === "fighting" && steps++ < 300) {
        let action;
        if (!s.potionUsed && s.potions.heal && s.player.hp <= s.player.maxHp * 0.65) action = { move: "heal" };
        else if (!s.potionUsed && s.potions.mana && s.player.mp <= s.player.maxMp * 0.6) action = { move: "mana" };
        else if (strategy === "search") action = choose(s, "flex");
        else {
            const sequence = strategy === "guarded" ? ["wind", "fall", "basic"] : ["edge", "guide", "fall"];
            action = { move: sequence[3 - s.ap], enemyAction: 3 };
            if (!R.resolve(s, action).ok) action = { move: "basic" };
        }
        const next = R.resolve(s, action); assert.ok(next.ok, next.reason); s = next.state;
        if (trace) commands.push({ action, state: R.clone(s) });
    }
    return { policy: strategy, setup: d, phase: s.phase === "fighting" ? "stalled" : s.phase,
        hp: s.player.hp, mp: s.player.mp, potions: s.potions, reports: s.reports, totals: s.totals,
        acquired: s.acquired, core: s.core, build: R.build(s), won: s.reports.filter(r => r.won).length, commands };
}
function main() {
    fs.mkdirSync(output, { recursive: true });
    const before = [], after = [], focus = [], extra = [];
    for (const policy of policies) {
        for (let seed = 1; seed <= seedCount; seed++) {
            before.push(run(policy, { seed, style: "mixed" }));
            after.push(run(policy, { seed, style: "guzong" }));
        }
        console.log(policy, JSON.stringify({ before: summarize(before.filter(r => r.policy === policy)),
            after: summarize(after.filter(r => r.policy === policy)) }));
    }
    for (const id of Object.keys(E.enemies)) for (const strategy of ["search", "aggressive", "guarded"])
        focus.push(focused(id, strategy));
    for (const pressure of ["relaxed", "standard", "hard"])
        for (const seed of [1, 17, 53]) for (const policy of ["flex", "random"])
            extra.push(run(policy, { seed, pressure, style: "guzong" }));
    for (const seed of [1, 17, 53]) for (const policy of ["flex", "guard", "rotation"])
        extra.push(run(policy, { seed, battles: 15, style: "guzong" }));
    for (const seed of [1, 17, 53]) for (const policy of ["flex", "random"])
        extra.push(run(policy, { seed, style: "guzong", healPotions: 0, manaPotions: 0 }));
    after.forEach((r, i) => {
        assert.equal(r.policy, before[i].policy);
        const old = { ...before[i].setup, style: "guzong" };
        assert.deepEqual(r.setup, old, "only roster style differs");
    });
    const enemyRows = after.concat(extra).flatMap(r => r.reports);
    const summary = {
        rules: "Current resolver; only enemy roster differs in paired main samples, skills/rewards/pressure unchanged.",
        runs: before.length + after.length + focus.length + extra.length,
        before: summarize(before), after: summarize(after), focused: summarize(focus), extra: summarize(extra),
        byPolicy: Object.fromEntries(policies.map(k => [k, { before: summarize(before.filter(r => r.policy === k)),
            after: summarize(after.filter(r => r.policy === k)) }])),
        focusedByEnemy: Object.fromEntries(Object.keys(E.enemies).map(k => [k, focus.filter(r => r.setup.enemyId === k)
            .map(r => ({ strategy: r.policy, phase: r.phase, hp: r.hp, mp: r.mp, actions: r.totals.actions }))])),
        byEnemy: Object.fromEntries(Object.keys(E.enemies).map(k => {
            const rows = enemyRows.filter(r => r.enemyId === k);
            return [k, { encounters: rows.length, defeats: rows.filter(r => !r.won).length,
                meanActions: rows.length ? +(rows.reduce((n, r) => n + r.actions, 0) / rows.length).toFixed(1) : null }];
        })),
        pressure: Object.fromEntries(["relaxed", "standard", "hard"].map(k => [k,
            summarize(extra.filter(r => r.setup.pressure === k && r.setup.battles === 12 && r.setup.healPotions === 3))])),
        limitations: "Bounded 3-action beam; not optimal multi-round play or human fun validation. Focused base-kit encounters start full with finite3+3 supplies; not evidence for10+ consecutive fights.",
    };
    fs.writeFileSync(path.join(output, "enemy-results.json"), JSON.stringify({ before, after, focus, extra }, null, 2));
    fs.writeFileSync(path.join(output, "enemy-summary.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}
module.exports = { focused, E };
if (require.main === module) main();
