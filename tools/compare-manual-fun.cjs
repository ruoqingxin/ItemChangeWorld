const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { output } = require("./evaluate-manual-gameplay.cjs");
const beforePath = path.resolve(process.env.MANUAL_FUN_BEFORE || path.join(output, "before/results.json"));
const afterPath = path.join(output, "results.json");
const before = JSON.parse(fs.readFileSync(beforePath, "utf8"));
const after = JSON.parse(fs.readFileSync(afterPath, "utf8"));
assert.deepEqual(before.map(x => ({ setup: x.setup, route: x.route, policy: x.policy })),
    after.map(x => ({ setup: x.setup, route: x.route, policy: x.policy })), "identical test inputs and policy");
const main = rows => rows.filter(x => x.policy === "adaptive" && x.setup.style === "mixed" && x.setup.battles === 12);
const average = rows => Math.round(rows.reduce((a, b) => a + b, 0) / rows.length * 10) / 10;
function summarize(rows) {
    const sum = (key, map) => rows.reduce((n, r) => n + (map ? r.totals[map][key] || 0 : r.totals[key]), 0);
    return { runs: rows.length, completed: rows.filter(x => x.phase === "complete").length,
        averageHp: average(rows.map(x => x.hp)), averageTaken: average(rows.map(x => x.totals.taken)),
        averageActions: average(rows.map(x => x.totals.actions)),
        windCasts: sum("wind", "skills"), guideCasts: sum("guide", "skills"),
        bodyEntries: sum("absorb", "specials"), counters: sum("counter", "specials"),
        breaks: sum("break", "specials"), openingStrikes: sum("opening", "specials"),
        runsUsingWind: rows.filter(x => x.totals.skills.wind).length,
        runsUsingGuide: rows.filter(x => x.totals.skills.guide).length,
        runsUsingBody: rows.filter(x => x.totals.specials.absorb).length,
        finishers: sum("finish", "specials") };
}
function bodyTrial(base, absorb) {
    const { ManualTestRules: R } = require(path.join(base, "utils/ManualTestRules.js"));
    const { ManualTestConfig: C } = require(path.join(base, "utils/ManualTestConfig.js"));
    const d = { ...C.defaults(), star: 4, rank: 6, style: "assault", battles: 1 };
    d.player = { ...d.player, hp: 10000 }; d.enemy = { ...d.enemy, hp: 100000, attack: 60 };
    let s = R.start(d);
    const apply = a => { const r = R.resolve(s, a); assert.ok(r.ok, r.reason); s = r.state; };
    apply({ move: "end" }); // Natural warming, not injected shadow state.
    apply({ move: "fall", branch: absorb ? "absorb" : "normal", shadowIds: [s.shadows[0].id] });
    while (s.round <= 6) apply({ move: "basic" });
    return { damage: s.totals.damage, actions: s.totals.actions, hp: s.player.hp, mp: s.player.mp };
}
const oldBase = path.resolve(process.env.MANUAL_FUN_OLD_RULES ||
    path.join(__dirname, "../bin/manual-fun-baseline-20261117/script/module/manualTest"));
const newBase = path.resolve(__dirname, "../bin/manual-test/script/module/manualTest");
const hashes = base => Object.fromEntries(["utils/ManualTestRules.js", "utils/ManualTestConfig.js"].map(file =>
    [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(base, file))).digest("hex")]));
const comparison = {
    scenariosPerVersion: after.length, sameInputs: true, before: summarize(main(before)), after: summarize(main(after)),
    paths: ["edge", "guard", "guide"].map(route => ({
        route, before: summarize(main(before).filter(x => x.route === route)),
        after: summarize(main(after).filter(x => x.route === route)),
    })),
    bodyTrial: {
        setup: "4star6rank, naturally warm opening edge, one body/harvest then basic to end of own round6",
        before: { absorb: bodyTrial(oldBase, true), harvest: bodyTrial(oldBase, false) },
        after: { absorb: bodyTrial(newBase, true), harvest: bodyTrial(newBase, false) },
    },
    engineHashes: { before: hashes(oldBase), after: hashes(newBase) },
    limitations: "Same bounded policy and inputs, not optimal play or proof of subjective fun; enemy rhythm also changed.",
};
fs.writeFileSync(path.join(output, "comparison.json"), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify(comparison, null, 2));
