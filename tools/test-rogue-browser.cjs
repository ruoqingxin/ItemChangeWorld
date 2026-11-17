const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { chromium } = require("playwright");
const { run, output, C } = require("./evaluate-rogue-gameplay.cjs");
const { url, ready, state, click, fill } = require("./manual-run-browser-helpers.cjs");
const folder = path.join(output, "browser");
async function capture(p, name) {
    fs.mkdirSync(folder, { recursive: true });
    await p.waitForTimeout(80);
    const file = path.join(folder, name + ".png"); await p.screenshot({ path: file });
    const stats = await sharp(file).stats(); assert.ok(stats.channels.some(c => c.stdev > 10), "nonblank canvas");
    const issues = await p.evaluate(() => {
        const panel = window.__manualTestPreview.panel, boxes = [], issues = [];
        for (const [key, b] of Object.entries(panel.buttons)) {
            if (!b.visible || !b.mouseEnabled) continue;
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
    assert.deepEqual(issues, [], name + " click regions");
}
async function perform(p, a) {
    const before = await state(p);
    if (a.move === "choose") await click(p, "reward_" + a.choice);
    else if (a.move === "guide" && before.mutations.guide !== "rupture") await click(p, "intent_" + (a.enemyAction || 1));
    else await click(p, ({ next: "nextBattle", end: "endTurn", heal: "heal", mana: "mana", retreat: "retreat" })[a.move] || "move_" + a.move);
    assert.deepEqual(await state(p), before, "native selection/preview must be pure");
    await click(p, "confirm");
}
async function main() {
    fs.mkdirSync(folder, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" }), results = [];
    try {
        for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }],
            ["wide", { width: 1920, height: 1080 }], ["mobile", { width: 844, height: 390 }]]) {
            const p = await browser.newPage({ viewport }), errors = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) errors.push(r.status() + " " + r.url()); });
            await p.goto(url + "/?manualTest=1"); await ready(p);
            assert.equal(await p.evaluate(() => window.__manualTestPreview.panel.constructor.name), "RogueTestPanel");
            await p.evaluate(() => {
                localStorage.setItem("nowchange.stage4-expedition.v1", "preserve-expedition");
                localStorage.setItem("other-app", "preserve-other");
                window.__storageBefore = { ...localStorage };
            });
            const storageBefore = await p.evaluate(() => ({ ...localStorage }));
            await capture(p, name + "-setup");
            await click(p, "style_mixed");
            const specs = {
                flying: { seed: 10, core: "swordUnity", event: "unity" },
                wound: { seed: 2, core: "endlessWound", event: "endless" },
                guard: { seed: 14, core: "turnTables", event: "turnTables" },
                charge: { seed: 23, item: "heavyEdge", event: "heavy" },
                delay: { seed: 7, core: "stillness", event: "delayed" },
                rotation: { seed: 21, core: "cycle", event: "cycle" },
                shatter: { seed: 12, item: "shieldFall", event: "shatter" },
            };
            for (const [policy, spec] of Object.entries(specs)) {
                const { seed, event: coreEvent } = spec;
                const replay = run(policy, { seed, style: "mixed", enemyId: null }, true);
                assert.equal(replay.phase, "complete", policy + " selected replay completes");
                if (spec.core) assert.equal(replay.core, spec.core);
                if (spec.item) assert.ok(replay.acquired.includes(spec.item));
                assert.ok(replay.totals.events[coreEvent] > 0, "mechanic actually activated");
                await fill(p, "seed", seed); await click(p, "restart");
                const revision = (await state(p)).revision;
                let index = 0, rewardCaptured = false, coreCaptured = false, mechanicCaptured = false;
                for (const step of replay.commands) {
                    await perform(p, step.action); index++;
                    const expected = JSON.parse(JSON.stringify(step.state)); expected.revision += revision;
                    assert.deepEqual(await state(p), expected, `${name}/${policy} step${index} ${JSON.stringify(step.action)}`);
                    if (!rewardCaptured && step.state.phase === "reward") {
                        const labels = await p.evaluate(() => Object.fromEntries(Object.entries(window.__manualTestPreview.panel.labels)
                            .map(([k, v]) => [k, v.text])));
                        for (const key of step.state.offers)
                            assert.ok(labels["reward_" + key + "Text"].includes(C.offerRoles[step.state.offerRoles[key]]));
                        await capture(p, name + "-" + policy + "-reward"); rewardCaptured = true;
                    }
                    if (!coreCaptured && (spec.core ? step.state.core === spec.core : step.state.acquired.includes(spec.item)) &&
                        step.state.phase === "fighting") {
                        await capture(p, name + "-" + policy + "-core"); coreCaptured = true;
                    }
                    const liveMechanic = policy === "charge" ? step.state.momentum > 0 :
                        policy === "delay" ? step.state.pendingSword > 0 :
                        policy === "rotation" ? step.state.forms.length > 0 : false;
                    if (!mechanicCaptured && liveMechanic && step.state.phase === "fighting") {
                        await capture(p, name + "-" + policy + "-mechanic"); mechanicCaptured = true;
                    }
                }
                await click(p, "tab_build"); await capture(p, name + "-" + policy + "-complete");
                results.push({ viewport: name, policy, seed, battles: replay.reports.length, confirms: index,
                    coreActivations: replay.totals.events[coreEvent], build: replay.build });
                console.log(`${name}/${policy}: ${replay.reports.length} battles, ${index} native confirms`);
            }
            for (const pressure of ["relaxed", "hard"]) {
                const before = await state(p);
                await click(p, "pressure_" + pressure);
                assert.deepEqual(await state(p), before, "pressure selection only changes the draft");
                await fill(p, "seed", 17); await click(p, "restart");
                const revision = (await state(p)).revision;
                const replay = run("flex", { seed: 17, pressure, style: "mixed", enemyId: null }, true);
                assert.ok(["complete", "defeat"].includes(replay.phase));
                for (const step of replay.commands) {
                    await perform(p, step.action);
                    const expected = JSON.parse(JSON.stringify(step.state)); expected.revision += revision;
                    assert.deepEqual(await state(p), expected, name + "/" + pressure);
                }
                await capture(p, name + "-" + pressure + "-outcome");
                results.push({ viewport: name, policy: "flex-" + pressure, seed: 17, battles: replay.reports.length,
                    confirms: replay.commands.length, phase: replay.phase, build: replay.build });
            }
            const last = await state(p); await click(p, "legacyMode");
            assert.equal(await p.evaluate(() => window.__manualTestPreview.panel.constructor.name), "ManualTestPanel");
            await capture(p, name + "-legacy"); await click(p, "rogueMode");
            assert.deepEqual(await state(p), last, "mode toggle preserves memory-only rogue state");
            await fill(p, "seed", 0); await click(p, "restart"); assert.deepEqual(await state(p), last, "invalid setup atomic");
            assert.ok(await p.evaluate(() => window.__manualTestPreview.panel.labels.preview.text.includes("seed")));
            await p.evaluate(() => { window.__manualTestPreview.view.close(); window.__manualTestPreview.view.open(); });
            await ready(p); assert.deepEqual(await state(p), last);
            assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), storageBefore);
            await p.reload(); await ready(p); assert.equal(await state(p), null, "no saved run");
            assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), storageBefore);
            assert.deepEqual(errors, [], name + " browser errors"); await p.close();
        }
    } finally { await browser.close(); }
    const summary = { runs: results.length, fights: results.reduce((n, r) => n + r.battles, 0),
        confirms: results.reduce((n, r) => n + r.confirms, 0), results };
    fs.writeFileSync(path.join(folder, "replay-results.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
