const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const base = path.resolve(__dirname, "../bin/manual-test/script/module/manualTest");
const { ManualTestRules: R } = require(path.join(base, "utils/ManualTestRules.js"));
const { ManualTestConfig: C } = require(path.join(base, "utils/ManualTestConfig.js"));
const out = path.resolve(process.env.MANUAL_GAMEPLAY_OUTPUT || path.resolve(__dirname, "../bin/manual-gameplay"));
const policies = ["rush", "adaptive", "arrays", "responses", "body", "cycles"];
const stars = Array.from({ length: 31 }, (_, i) => i ?
    { star: Math.ceil(i / 6), rank: (i - 1) % 6 + 1 } : { star: 0, rank: 0 });
const has = (s, star, rank) => R.has(s, star, rank);
const action = (move, extra = {}) => ({ move, keep: false, ...extra });

function candidates(s) {
    const rows = [action("basic"), action("guard"), action("edge"), action("wind"), action("guide")];
    const add = (move, extra) => rows.push(action(move, extra));
    if (has(s, 1, 1)) add("edge", { branch: "urge" });
    if (has(s, 2, 3) && s.sky.length) for (const kind of new Set(s.sky.at(-1).members.map(x => x.kind)))
        add("edge", { branch: "copy", kind });
    for (const g of s.sky) {
        if (has(s, 1, 3)) add("wind", { branch: "reorder", target: g.id });
        if (has(s, 1, 5)) add("guide", { branch: "pluck", target: g.id });
        if (has(s, 3, 1)) for (const enemyAction of [1, 2, 3])
            add("wind", { branch: "ambush", target: g.id, enemyAction });
        if (has(s, 3, 3) && g.members.some(x => x.kind === "guide" && !R.mature(s, g, x)))
            for (const enemyAction of [1, 2, 3]) add("guide", { branch: "pinpoint", target: g.id, enemyAction });
    }
    if (has(s, 1, 3)) add("wind", { branch: "reorder", target: 0 });
    if (has(s, 2, 5)) {
        for (const g of s.sky) {
            if (g.members.length === 3) add("wind", { branch: "split", target: g.id });
            for (const other of s.sky) if (other.id > g.id)
                add("wind", { branch: "swap", target: g.id, other: other.id });
        }
    }
    if (s.sky.length) {
        const falls = [action("fall")];
        if (has(s, 2, 1)) falls.push(action("fall", { keep: true }));
        if (has(s, 3, 5)) for (let i = 1; i <= 3; i++)
            falls.push(action("fall", { branch: "delay", enemyAction: i }));
        rows.push(...falls);
        if (has(s, 4, 1)) for (const g of s.sky) for (const x of g.members)
            if (R.canAbsorb(s, x))
                for (const a of falls) rows.push({ ...a, absorb: x.id });
    }
    if (has(s, 4, 3)) for (const x of s.body) {
        add("edge", { member: x.id });
        if (has(s, 1, 1)) add("edge", { branch: "urge", member: x.id });
    }
    if (has(s, 4, 5) && s.body.length) add("guide", { branch: "release" });
    if (has(s, 5, 3)) for (const g of s.cache) {
        const replacements = R.used(s.sky) + R.slots(g) <= R.capacity(s) ? [undefined] :
            s.sky.slice(1).filter(x => R.capacity(s) - R.used(s.sky) + R.slots(x) >= R.slots(g)).map(x => x.id);
        for (const other of replacements) {
            add("wind", { branch: "recall", target: g.id, other });
            if (has(s, 5, 5)) add("guide", { branch: "reverse", target: g.id, other });
        }
    }
    if (has(s, 5, 6)) add("fall", { branch: "finish" });
    // Forms and echoes are paid-action attachments, not invented extra actions.
    if (has(s, 2, 6)) {
        for (const a of rows.slice()) {
            if (!["edge", "wind", "guide"].includes(a.move) ||
                ["pluck", "release", "reverse", "recall", "swap", "split", "reorder"].includes(a.branch)) continue;
            for (const g of s.sky) if (g.members.length === 1) rows.push({ ...a, form: g.id });
        }
    }
    const triad = s.sky.some(g => R.array(g) === "三才") || R.bodyArray(s) === "三才";
    if (triad) for (const a of rows.slice()) {
        if (!["edge", "wind", "guide"].includes(a.move) ||
            ["urge", "recall", "reverse", "release", "pluck"].includes(a.branch)) continue;
        for (const g of s.sky) for (const x of g.members) rows.push({ ...a, echo: x.id });
    }
    return rows;
}

function potential(s, policy) {
    if (s.outcome !== "active") return 0;
    let n = s.marks * (policy === "rush" ? 0 : 12) + s.energy * 15;
    const bodyWeight = policy === "body" ? 260 : 150;
    n += s.body.reduce((v, x) => v + bodyWeight * (x.kind === "edge" ? 1 : 0.65), 0);
    n += s.cache.reduce((v, g) => v + g.members.length * 15, 0);
    for (const g of s.sky) {
        for (const x of g.members) {
            const remaining = Math.max(0, R.ageCap(s, g) - x.age);
            n += Math.min(remaining, 2) * (x.kind === "edge" ? 13 : x.kind === "guide" ? 8 : 9);
            n += x.age * 7 + x.cycles * (policy === "cycles" ? 18 : 6);
            if (policy === "body" && s.body.length < R.bodyCapacity(s)) n += x.age * 14;
        }
        if (g.members.length === 3) n += policy === "arrays" ? 75 : 15;
        if (policy === "responses" && g.members.some(x => !R.mature(s, g, x))) n += 12;
    }
    return n;
}

function choose(s, policy) {
    const source = { ...s, logs: [] };
    const options = candidates(s).map(a => ({ a, r: R.resolve(source, a) })).filter(x => x.r.ok);
    assert.ok(options.length);
    const find = pred => options.find(x => pred(x.a, x.r.state));
    if (["guardArray", "guideArray", "triad"].includes(policy) && has(s, 2, 6)) {
        const array = s.sky.find(g => g.members.length === 3);
        if (array) {
            if (array.members.every(x => R.mature(s, array, x))) {
                const pluck = find(a => a.branch === "pluck" && a.target === array.id);
                if (pluck) return pluck;
            }
            return find(a => a.move === "edge" && a.branch === "urge" && !a.form && !a.member) ||
                find(a => a.move === "basic");
        }
        const sequence = policy === "guardArray" ? ["wind", "wind", "wind"] :
            policy === "guideArray" ? ["guide", "guide", "guide"] : ["edge", "wind", "guide"];
        const tail = s.sky.slice(-2);
        const kinds = tail.map(g => g.members[0].kind);
        const kindsByMove = { edge: "edge", wind: "guard", guide: "guide" };
        let step = 0;
        for (let n = 2; n >= 1; n--) if (kinds.slice(-n).join() === sequence.slice(0, n).map(x => kindsByMove[x]).join()) {
            step = n; break;
        }
        if (step === 2) {
            const formed = find(a => a.move === sequence[2] && a.form === tail[0].id && !a.branch);
            if (formed) return formed;
        }
        return find(a => a.move === sequence[step] && !a.form && !a.branch) ||
            find(a => a.move === "basic");
    }
    if (policy === "rush") return find(a => a.move === "edge" && a.branch === "urge") ||
        find(a => a.move === "edge" && !a.branch) || find(a => a.move === "basic");
    if (policy === "cycles" && has(s, 5, 1)) {
        const finish = find(a => a.branch === "finish");
        if (finish) return finish;
        if (R.used(s.sky) >= R.capacity(s)) {
            if (s.ap === 1) return find(a => a.move === "fall" && !a.branch && !a.absorb && !a.keep) ||
                find(a => a.move === "basic");
            return find(a => a.move === "basic");
        }
        const reverse = find(a => a.branch === "reverse" && !a.other);
        if (reverse) return reverse;
        return find(a => a.move === "edge" && a.branch === "urge" && !a.form && !a.member) ||
            find(a => a.move === "edge" && !a.branch && !a.form && !a.member) ||
            find(a => a.move === "basic");
    }
    let best, bestScore = -Infinity;
    for (const x of options) {
        const t = x.r.state, a = x.a;
        const defenseWeight = policy === "responses" ? 1.8 : policy === "arrays" ? 0.8 : 1.2;
        let score = t.totals.damage - s.totals.damage -
            defenseWeight * (t.totals.taken - s.totals.taken) +
            defenseWeight * 0.65 * (t.player.shield - s.player.shield) +
            potential(t, policy) - potential(s, policy) - (s.player.mp - t.player.mp) * 0.8;
        if (t.outcome === "victory") score += 100000;
        if (t.outcome === "defeat") score -= 100000;
        if (policy === "arrays" && a.form !== undefined) score += 50;
        if (policy === "body" && a.absorb !== undefined && s.body.length < R.bodyCapacity(s)) score += 150;
        if (policy === "responses" && ["pinpoint", "ambush", "delay"].includes(a.branch)) score += 4;
        if (score > bestScore) { best = x; bestScore = score; }
    }
    return best;
}

function run(level, style, policy, scenario, options = {}) {
    const setup = { ...C.defaults(), ...level, style };
    if (scenario === "horizon") { setup.player.hp = 1000000; setup.enemy.hp = 1000000; }
    if (options.playerHp) setup.player.hp = options.playerHp;
    if (options.enemyHp) setup.enemy.hp = options.enemyHp;
    if (options.enemyDefense) setup.enemy.defense = options.enemyDefense;
    if (options.mp) setup.player.mp = setup.enemy.mp = options.mp;
    let s = R.start(setup), attempts = 0;
    const maxRounds = options.rounds || (scenario === "horizon" ? 10 : 12);
    const trace = [], events = {}, peaks = { arrays: 0, body: 0, cycles: 0, energy: 0, cache: 0 };
    const usage = {}, checkpoints = {};
    let spent = 0, medicines = 0, shieldWasted = 0;
    while (s.outcome === "active" && s.round <= maxRounds) {
        assert.ok(++attempts < maxRounds * 5 + 10, "bounded simulation");
        if (options.medicine && !s.potionUsed) {
            const key = s.player.hp <= s.player.maxHp * 0.75 ? "heal" :
                s.player.mp <= s.player.maxMp * 0.7 ? "mana" : null;
            if (key) {
                const r = R.resolve({ ...s, logs: [] }, action(key));
                assert.equal(r.ok, true); s = r.state; medicines++;
                trace.push({ round: s.round, move: key, hp: s.player.hp, damage: s.totals.damage, logs: s.logs });
            }
        }
        const prev = s, selected = choose(s, policy);
        s = selected.r.state;
        R.validateState(s);
        const a = selected.a, name = a.move + (a.branch ? "/" + a.branch : "");
        usage[name] = (usage[name] || 0) + 1;
        spent += prev.player.mp - s.player.mp;
        const log = s.logs.join("\n");
        for (const [key, regex] of Object.entries({
            array: /成阵/, response: /应剑$/m, cut: /截招削弱/m,
            body: /纳入身剑/, release: /引剑出体/, cache: /归冥/,
            return: /回升/, finisher: /万剑归冥：/, pinpoint: /点破/,
        })) if (regex.test(log) && events[key] === undefined) events[key] = prev.round;
        peaks.arrays = Math.max(peaks.arrays, s.sky.filter(g => g.members.length === 3).length);
        peaks.body = Math.max(peaks.body, s.body.length);
        peaks.cycles = Math.max(peaks.cycles, 0, ...s.sky.flatMap(g => g.members.map(x => x.cycles)));
        peaks.energy = Math.max(peaks.energy, s.energy);
        peaks.cache = Math.max(peaks.cache, R.used(s.cache));
        if (s.body.length === 3 && !events.threeBody) events.threeBody = prev.round;
        if (peaks.cycles >= 3 && !events.threeCycles) events.threeCycles = prev.round;
        if (a.move === "wind" && prev.player.shield >= 3 * R.h(prev)) shieldWasted++;
        trace.push({ round: prev.round, ap: prev.ap, action: a, damage: s.totals.damage,
            taken: s.totals.taken, hp: s.player.hp, mp: s.player.mp, marks: s.marks,
            sky: s.sky.map(g => ({ id: g.id, kinds: g.members.map(x => x.kind),
                ages: g.members.map(x => x.age), cycles: g.members.map(x => x.cycles) })),
            body: s.body.map(x => x.kind), energy: s.energy, orbit: s.orbit,
            finisherUsed: s.finisherUsed, logs: s.logs });
        if (s.round > prev.round) checkpoints[prev.round] = { damage: s.totals.damage,
            taken: s.totals.taken, mp: s.player.mp };
    }
    return { ...level, style, policy, scenario, options, outcome: s.outcome,
        rounds: trace.at(-1)?.round || 0, actions: Object.values(usage).reduce((a, b) => a + b, 0),
        damage: s.totals.damage, taken: s.totals.taken, hp: s.player.hp, mp: s.player.mp,
        spent, medicines, shieldWasted, events, peaks, usage, checkpoints, trace };
}

function responseProbe(formed) {
    let s = R.start({ ...C.defaults(), star: 3, rank: 6, style: "assault" });
    const trace = [];
    for (let i = 0; i < 3; i++) {
        const r = R.resolve(s, action("edge", formed && i === 2 ? { form: 1 } : {}));
        assert.equal(r.ok, true); s = r.state; trace.push(...s.logs.slice(trace.length));
    }
    return { formed, damage: s.totals.damage, taken: s.totals.taken,
        responses: s.logs.filter(x => /应剑$/.test(x)).length,
        cut: s.logs.some(x => /截招削弱/.test(x)), logs: s.logs };
}

function nonAttackProbe() {
    let s = R.start({ ...C.defaults(), star: 3, rank: 6, style: "burst" });
    for (const move of ["guide", "wind", "wind"]) {
        const r = R.resolve(s, action(move)); assert.equal(r.ok, true); s = r.state;
    }
    return { taken: s.totals.taken, enemyShield: s.enemy.shield, logs: s.logs };
}

function main() {
fs.mkdirSync(out, { recursive: true });
const all = [];
for (const scenario of ["default", "horizon"]) {
    const styles = scenario === "default" ? ["dummy", "assault", "defensive", "burst"] :
        ["dummy", "assault", "burst"];
    for (const level of stars) for (const style of styles) for (const policy of policies)
        all.push(run(level, style, policy, scenario));
    console.log(`Completed ${scenario}: ${all.length} cumulative battles`);
}
const extra = [];
for (const level of stars.filter(x => !x.star || x.rank === 6)) {
    for (const style of ["assault", "burst"])
        for (const medicine of [false, true])
            extra.push(run(level, style, "adaptive", "default", { medicine, rounds: 24 }));
}
for (const policy of ["body", "cycles", "arrays"])
    extra.push(run({ star: 5, rank: 6 }, "assault", policy, "extended",
        { playerHp: 1000000, enemyHp: 1000000, mp: 10000, rounds: 24 }));
for (const level of stars.filter(x => x.rank === 6)) {
    for (const enemyHp of [1500, 3000])
        for (const style of ["assault", "burst"])
            for (const policy of policies)
                extra.push(run(level, style, policy, "encounter", { enemyHp }));
    if (level.star >= 2) for (const style of ["assault", "defensive", "burst"])
        for (const policy of ["guardArray", "guideArray", "triad"])
            extra.push(run(level, style, policy, "horizon"));
}
for (const policy of ["arrays", "guardArray", "guideArray", "triad"])
    extra.push(run({ star: 3, rank: 6 }, "defensive", policy, "armor",
        { playerHp: 1000000, enemyHp: 1000000, enemyDefense: 200, rounds: 10 }));
const probes = { responseLoose: responseProbe(false), responseArray: responseProbe(true), nonAttack: nonAttackProbe() };
const compact = r => { const { trace, ...rest } = r; return rest; };
fs.writeFileSync(path.join(out, "results.json"), JSON.stringify({ policies, all: all.map(compact), extra: extra.map(compact), probes }, null, 2));
const representatives = all.filter(x => (!x.star || x.rank === 6) && x.style === "assault");
fs.writeFileSync(path.join(out, "traces.json"), JSON.stringify([...representatives, ...extra], null, 2));
console.table(representatives.map(compact).map(x => ({ level: `${x.star}/${x.rank}`, test: x.scenario,
    policy: x.policy, outcome: x.outcome, round: x.rounds, damage: x.damage, taken: x.taken,
    mp: x.mp, arrays: x.peaks.arrays, body: x.peaks.body, cycle: x.peaks.cycles,
    firstBody: x.events.body, finisher: x.events.finisher })));
console.log("Response comparison:", JSON.stringify(probes, null, 2));
console.log(`Saved ${all.length + extra.length} gameplay simulations to ${out}`);
}
if (require.main === module) main();
module.exports = { run, choose, candidates };
