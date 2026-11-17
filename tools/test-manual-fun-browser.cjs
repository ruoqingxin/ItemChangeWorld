const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { url, ready, state, click, act, choose, fill, capture } = require("./manual-run-browser-helpers.cjs");
async function pathChoice(p, route) {
    await click(p, "restart");
    await act(p, "edge"); await act(p, "edge"); await act(p, "fall"); await act(p, "basic");
    assert.equal((await state(p)).phase, "reward");
    await click(p, "reward_" + route); await click(p, "confirm");
    await click(p, "nextBattle"); await click(p, "confirm");
    assert.equal((await state(p)).path, route); assert.equal((await state(p)).battle, 2);
}
async function main() {
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }],
            ["wide", { width: 1920, height: 1080 }], ["mobile", { width: 844, height: 390 }]]) {
            const p = await browser.newPage({ viewport }), errors = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) errors.push(r.url()); });
            await p.goto(url + "/?manualTest=1&manualLegacy=1"); await ready(p);
            await pathChoice(p, "edge");
            await act(p, "edge"); let s = await state(p);
            assert.equal(s.shadows[0].warm, true); assert.equal(s.shadows[1].warm, false);
            assert.equal(s.totals.specials.cultivate, 1); await capture(p, name + "-fun-cultivate");
            await pathChoice(p, "guard"); await act(p, "wind"); await act(p, "edge"); await act(p, "end");
            s = await state(p); assert.equal(s.totals.specials.counter, 1);
            assert.ok(s.logs.some(x => x.includes("格挡反击")));
            await capture(p, name + "-fun-counter");
            await pathChoice(p, "guide"); await click(p, "move_guide");
            const before = await state(p); await choose(p, "delayAt", "第1行动前");
            assert.deepEqual(await state(p), before); await click(p, "confirm");
            assert.equal((await state(p)).suppression[0], 20);
            await act(p, "wind"); await act(p, "end"); s = await state(p);
            assert.equal(s.enemy.exposed, true);
            assert.ok(await p.evaluate(() => window.__manualTestPreview.panel.labels.scheduled.text.includes("破绽待击")));
            await capture(p, name + "-fun-opening-ready");
            await click(p, "move_edge"); await click(p, "replace"); await click(p, "option_0");
            await click(p, "confirm"); s = await state(p);
            assert.equal(s.enemy.exposed, false); assert.equal(s.totals.specials.opening, 1);
            assert.equal(s.ap, 2); await capture(p, name + "-fun-opening-strike");
            // Native body entry and immediate damage, without injected state or commands.
            for (let i = 0; i < 4; i++) await click(p, "starUp");
            for (let i = 0; i < 5; i++) await click(p, "rankUp");
            await fill(p, "enemy_hp", 10000); await choose(p, "enemyStyle", "木桩");
            await choose(p, "opening", "本命起手 · 锋"); await click(p, "restart"); await act(p, "end");
            const damage = (await state(p)).totals.damage;
            await click(p, "move_fall"); await choose(p, "branch", "纳入身剑"); await click(p, "confirm");
            s = await state(p); assert.equal(s.totals.damage - damage, 160);
            assert.equal(s.body, "edge"); assert.equal(s.ap, 2);
            await capture(p, name + "-fun-body-entry");
            assert.deepEqual(errors, []); await p.close(); console.log(name + " tactical paths and body passed");
        }
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
