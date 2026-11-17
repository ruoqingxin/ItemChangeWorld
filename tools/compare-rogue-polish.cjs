const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { output, summarize, C } = require("./evaluate-rogue-gameplay.cjs");
const beforeDir = path.resolve(process.env.ROGUE_BEFORE || path.join(__dirname, "../bin/manual-rogue-polish-20261117/before"));
const before = require(path.join(beforeDir, "results.json"));
const after = require(path.join(output, "results.json"));
const oldSummary = require(path.join(beforeDir, "summary.json"));
const newSummary = require(path.join(output, "summary.json"));
assert.notEqual(oldSummary.rulesBase, newSummary.rulesBase, "comparison requires a frozen old resolver");
assert.ok(fs.existsSync(path.join(oldSummary.rulesBase, "utils/RogueTestRules.js")), "old resolver still available");
assert.equal(before.length, after.length);
before.forEach((row, i) => {
    assert.equal(row.policy, after[i].policy);
    assert.deepEqual(row.setup, after[i].setup, "same setup and policies at row " + i);
});
const mainCount = newSummary.main.runs;
const oldMain = before.slice(0, mainCount), newMain = after.slice(0, mainCount);
const policies = [...new Set(newMain.map(r => r.policy))];
const byPolicy = Object.fromEntries(policies.map(policy => [policy, {
    before: summarize(oldMain.filter(r => r.policy === policy)),
    after: summarize(newMain.filter(r => r.policy === policy)),
}]));
const defaults = C.defaults();
const pressureSample = r => r.setup.style === defaults.style && r.setup.battles === defaults.battles &&
    r.setup.healPotions === defaults.healPotions && r.setup.manaPotions === defaults.manaPotions &&
    Object.keys(defaults.enemy).every(k => r.setup.enemy[k] === defaults.enemy[k]);
const controls = pressure => ({
    before: summarize(before.slice(mainCount).filter(r => pressureSample(r) && r.setup.pressure === pressure)),
    after: summarize(after.slice(mainCount).filter(r => pressureSample(r) && r.setup.pressure === pressure)),
});
const comparison = {
    runsPerVersion: before.length, setupsMatched: true,
    overall: { before: summarize(before), after: summarize(after) },
    main: { before: summarize(oldMain), after: summarize(newMain) },
    byPolicy,
    pressureSamples: Object.fromEntries(["relaxed", "standard", "hard"].map(p => [p, controls(p)])),
    limitations: "Standard/hard compare the combined reward, heavy-edge and pressure changes. Relaxed samples keep enemy parameters unchanged. Searches are bounded; this is not human fun validation.",
};
fs.writeFileSync(path.join(output, "comparison.json"), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify({
    runsPerVersion: comparison.runsPerVersion, setupsMatched: true,
    before: comparison.overall.before, after: comparison.overall.after,
    relaxed: comparison.pressureSamples.relaxed,
}, null, 2));
