const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { chromium } = require("playwright");
const { R, C, run, output } = require("./evaluate-rogue-gameplay.cjs");
const { focused, E } = require("./evaluate-rogue-enemies.cjs");
const { url, ready, state, click, fill } = require("./manual-run-browser-helpers.cjs");
const folder = path.join(output, "enemy-browser"), results = [];
let confirms = 0, screenshots = 0;
async function capture(p, name) {
    await p.waitForTimeout(60);
    const file = path.join(folder, name + ".png"); await p.screenshot({ path: file }); screenshots++;
    const stats = await sharp(file).stats(); assert.ok(stats.channels.some(c => c.stdev > 10), "nonblank canvas");
    const issues = await p.evaluate(() => {
        const panel = window.__manualTestPreview.panel, boxes = [], issues = [];
        for (const [key, b] of Object.entries(panel.buttons)) {
            if (!b.visible || !b.mouseEnabled || panel.popup && !key.startsWith("option_")) continue;
            const pt = b.localToGlobal(new Laya.Point());
            if (pt.x < -1 || pt.y < -1 || pt.x + b.width > Laya.stage.width + 1 || pt.y + b.height > Laya.stage.height + 1)
                issues.push("outside " + key);
            boxes.push({ key, x: pt.x, y: pt.y, w: b.width, h: b.height });
        }
        for (let i = 0; i < boxes.length; i++) for (const b of boxes.slice(i + 1)) {
            const a = boxes[i];
            if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
                Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) issues.push(a.key + "/" + b.key);
        }
        return issues;
    });
    assert.deepEqual(issues, [], name + " clickable regions");
}
async function perform(p, action, expected, revision, label) {
    const before = await state(p);
    if (action.move === "choose") await click(p, "reward_" + action.choice);
    else if (action.move === "guide" && before.mutations.guide !== "rupture")
        await click(p, "intent_" + (action.enemyAction || 1));
    else await click(p, ({ next: "nextBattle", end: "endTurn", heal: "heal", mana: "mana" })[action.move] || "move_" + action.move);
    assert.deepEqual(await state(p), before, label + " selection is pure");
    await click(p, "confirm"); confirms++;
    const target = R.clone(expected); target.revision += revision;
    assert.deepEqual(await state(p), target, label + " committed state");
}
async function configure(p, setup, label) {
    const before = await state(p), oldDraft = await p.evaluate(() => window.__manualTestPreview.session.draft);
    for (const actor of ["player", "enemy"]) for (const key of ["hp", "mp", "attack", "defense"])
        if (oldDraft[actor][key] !== setup[actor][key]) await fill(p, actor + "_" + key, setup[actor][key]);
    for (const key of ["seed", "healPotions", "manaPotions"])
        if (oldDraft[key] !== setup[key]) await fill(p, key, setup[key]);
    await click(p, "pressure_" + setup.pressure);
    await click(p, "battles_" + setup.battles);
    await click(p, "style_guzong");
    if (setup.enemyId) {
        await click(p, "enemyPick");
        await capture(p, label + "-menu");
        const index = Object.keys(E.enemies).indexOf(setup.enemyId) + 1; assert.ok(index > 0);
        await click(p, "option_" + index);
    }
    assert.deepEqual(await state(p), before, label + " setup changes draft only");
    await click(p, "restart");
    const live = await state(p); assert.ok(live); const expected = R.start(setup);
    expected.revision = live.revision; assert.deepEqual(live, expected, label + " applied setup");
    return live.revision;
}
function longFixture(id) {
    const boss = E.enemies[id].tier === "首领";
    const setup = { ...C.defaults(), style: "guzong", enemyId: id, battles: 1,
        player: { ...C.defaults().player, hp: 100000, mp: 10000 },
        enemy: { ...C.defaults().enemy, hp: boss || id === "alchemist" ? 1000 : 10000 } };
    let s = R.start(setup), phaseRound = 0; const commands = [];
    const apply = action => {
        const result = R.resolve(s, action); assert.ok(result.ok, result.reason); s = result.state;
        commands.push({ action, state: R.clone(s) });
    };
    while (s.phase === "fighting" && s.round <= 30) {
        if (s.foe.phase2 && !phaseRound) phaseRound = s.round;
        if (boss ? phaseRound && s.round >= phaseRound + 6 : s.round >= 7) break;
        let sequence;
        if (boss) sequence = phaseRound ? ["guard", "guard", "guard"] : ["basic", "fall", "guard"];
        else if (id === "echo") sequence = ["edge", "edge", "guard"];
        else if (id === "swordsman") sequence = ["edge", "edge", "edge"];
        else if (id === "arrayMaster") sequence = s.round % 2 === 0 ? ["basic", "basic", "basic"] : ["wind", "guard", "basic"];
        else if (id === "alchemist") sequence = s.round === 1 ? ["basic", "guide", "guard"] : ["basic", "guard", "guard"];
        else if (id === "shade") sequence = s.round % 2 ? ["edge", "edge", "edge"] : ["guard", "edge", "edge"];
        else sequence = ["basic", "wind", "guard"];
        for (const move of sequence) apply({ move, ...(move === "guide" ? { enemyAction: 2 } : {}) });
    }
    assert.equal(s.phase, "fighting", id + " long fixture stays alive");
    assert.ok(s.round >= 7); if (boss) assert.ok(phaseRound && s.round >= phaseRound + 6, id + " second-phase two cycles");
    return { setup, commands, phaseRound, state: s };
}
async function main() {
    fs.mkdirSync(folder, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }],
            ["wide", { width: 1920, height: 1080 }], ["mobile", { width: 844, height: 390 }]]) {
            const p = await browser.newPage({ viewport }), errors = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });
            await p.goto(url + "/?manualTest=1"); await ready(p);
            await p.evaluate(() => {
                localStorage.setItem("nowchange.stage4-expedition.v1", "preserve-expedition");
                localStorage.setItem("other-app", "preserve-other");
            });
            const storage = await p.evaluate(() => ({ ...localStorage }));
            for (const id of Object.keys(E.enemies)) {
                const replay = focused(id, "search", true);
                assert.equal(replay.phase, "complete");
                const revision = await configure(p, replay.setup, name + "-" + id);
                await click(p, "tab_enemy"); await capture(p, name + "-" + id + "-start");
                for (const [i, step] of replay.commands.entries())
                    await perform(p, step.action, step.state, revision, `${name}/${id}/${i}`);
                await click(p, "tab_report"); await capture(p, name + "-" + id + "-report");
                results.push({ viewport: name, kind: "focused", id, fights: 1, confirms: replay.commands.length });
            }
            for (const id of Object.keys(E.enemies)) {
                const fixture = longFixture(id), label = name + "-" + id + "-long";
                const revision = await configure(p, fixture.setup, label);
                await click(p, "tab_enemy"); let round = 0;
                for (const [i, step] of fixture.commands.entries()) {
                    await perform(p, step.action, step.state, revision, `${label}/${i}`);
                    if (step.state.round !== round && (step.state.round <= 4 || step.state.round === fixture.phaseRound ||
                        step.state.round === fixture.phaseRound + 1)) {
                        await capture(p, label + "-r" + step.state.round); round = step.state.round;
                    }
                }
                if (id === "echo") assert.ok(fixture.state.totals.events.enemyEcho > 0);
                if (id === "swordsman") assert.ok(fixture.state.totals.events.enemyRead > 0);
                if (id === "arrayMaster") assert.ok(fixture.state.totals.events.enemyArrayBreak > 0);
                if (id === "alchemist") assert.ok(fixture.state.totals.events.enemyHeat > 0);
                if (id === "breaker") assert.ok(fixture.state.totals.events.enemyShatter > 0);
                results.push({ viewport: name, kind: "long-mechanics", id, completed: false,
                    enemyTurns: fixture.state.round - 1, phaseRound: fixture.phaseRound, confirms: fixture.commands.length });
            }
            for (const [seed, battles, pressure] of [[1, 12, "standard"], [2, 15, "hard"], [3, 12, "relaxed"]]) {
                const replay = run("flex", { style: "guzong", enemyId: null, seed, battles, pressure }, true);
                assert.ok(["complete", "defeat"].includes(replay.phase));
                const label = `${name}-${battles}-${pressure}`, revision = await configure(p, replay.setup, label);
                await capture(p, label + "-boss-forecast");
                assert.ok(await p.evaluate(() => window.__manualTestPreview.panel.labels.bossForecast?.text));
                for (const [i, step] of replay.commands.entries())
                    await perform(p, step.action, step.state, revision, label + "/" + i);
                await capture(p, label + "-outcome");
                results.push({ viewport: name, kind: "run", battles, pressure, seed, phase: replay.phase,
                    fights: replay.reports.length, confirms: replay.commands.length });
            }
            const last = await state(p);
            await click(p, "legacyMode"); await click(p, "rogueMode"); assert.deepEqual(await state(p), last);
            await fill(p, "seed", 0); await click(p, "restart"); assert.deepEqual(await state(p), last);
            await p.evaluate(() => { window.__manualTestPreview.view.close(); window.__manualTestPreview.view.open(); });
            await ready(p); assert.deepEqual(await state(p), last);
            assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), storage);
            await p.reload(); await ready(p); assert.equal(await state(p), null);
            assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), storage);
            assert.deepEqual(errors, [], name + " browser errors"); await p.close();
            console.log(name + " enemy native validation passed.");
        }
    } finally { await browser.close(); }
    const summary = { scenarios: results.length, confirms, screenshots,
        fights: results.reduce((n, r) => n + (r.fights || 0), 0),
        completedLongFixtures: 0, limitations: "Long-mechanics fixtures intentionally increase HP/MP, use native settings, and do not count as natural wins.", results };
    fs.writeFileSync(path.join(folder, "replay-results.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}
if (require.main === module) main().catch(e => { console.error(e); process.exitCode = 1; });
module.exports = { longFixture };
