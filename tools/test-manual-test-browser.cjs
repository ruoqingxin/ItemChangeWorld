const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { url, state, ready, click, act, choose, fill, capture } = require("./manual-run-browser-helpers.cjs");
async function main() {
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }],
            ["wide", { width: 1920, height: 1080 }], ["mobile", { width: 844, height: 390 }]]) {
            const p = await browser.newPage({ viewport }), errors = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
            p.on("response", r => { if (r.status() >= 400) errors.push(r.url()); });
            await p.goto(url + "/?manualTest=1&manualLegacy=1"); await ready(p);
            await p.evaluate(() => {
                localStorage.setItem("nowchange.stage4-expedition.v1", "preserve-expedition");
                localStorage.setItem("other-app", "preserve-other"); window.__storageBefore = { ...localStorage };
            });
            await capture(p, name + "-setup"); await click(p, "restart");
            let s = await state(p); assert.equal(s.setup.star, 0); assert.equal(s.shadows.length, 1);
            const before = s; await click(p, "move_edge"); assert.deepEqual(await state(p), before);
            await capture(p, name + "-preview"); await click(p, "cancel"); assert.deepEqual(await state(p), before);
            await act(p, "edge"); await act(p, "wind"); await act(p, "fall");
            assert.equal((await state(p)).round, 2);
            for (let i = 0; i < 5; i++) await click(p, "starUp");
            for (let i = 0; i < 5; i++) await click(p, "rankUp");
            await fill(p, "enemy_hp", 10000); await fill(p, "player_hp", 10000);
            await fill(p, "seed", 53); await fill(p, "healPotions", 5);
            await choose(p, "enemyStyle", "蓄力爆发"); await choose(p, "opening", "本命起手 · 守");
            assert.equal((await state(p)).setup.star, 0, "draft not hot applied");
            await click(p, "restart"); s = await state(p);
            assert.equal(s.setup.star, 5); assert.equal(s.setup.rank, 6);
            assert.equal(s.player.hp, 10000); assert.equal(s.setup.seed, 53);
            assert.equal(s.shadows[0].kind, "guard");
            await click(p, "tab_growth"); await capture(p, name + "-growth");
            await act(p, "guide"); await act(p, "edge");
            await click(p, "move_wind"); await click(p, "replace"); await click(p, "option_0");
            await click(p, "confirm"); assert.equal((await state(p)).shadows.length, 3);
            assert.equal((await state(p)).round, 2);
            await click(p, "move_fall"); await choose(p, "branch", "纳入身剑"); await click(p, "shadow_1");
            await click(p, "confirm"); assert.equal((await state(p)).body, "edge");
            await click(p, "move_fall"); await choose(p, "branch", "择机应剑");
            await choose(p, "delayAt", "第3行动前"); await click(p, "confirm");
            assert.equal((await state(p)).delayed.at, 3);
            await capture(p, name + "-scheduled-body"); await act(p, "end");
            s = await state(p); assert.equal(s.delayed, null);
            assert.ok(s.logs.some(l => l.includes("引影收剑")));
            await click(p, "move_fall"); await choose(p, "branch", "万剑归冥");
            await click(p, "confirm"); assert.equal((await state(p)).finisherUsed, true);
            await click(p, "tab_log"); await capture(p, name + "-finisher");
            // Warm guide is selected alone: no accidental harvest of the opening edge.
            await choose(p, "opening", "起手随剑路"); await click(p, "restart");
            await act(p, "guide"); await click(p, "move_fall"); await click(p, "shadow_0");
            await click(p, "confirm"); await act(p, "end");
            s = await state(p); assert.equal(s.enemy.charged, false);
            assert.equal(s.intentions[2].percent, 220);
            await capture(p, name + "-interrupt");
            // Real reward, no full heal at next encounter, finite supply.
            await fill(p, "enemy_hp", 1); await click(p, "restart"); await act(p, "edge");
            s = await state(p); assert.equal(s.phase, "reward");
            await capture(p, name + "-path-offer");
            await click(p, "reward_guard"); await click(p, "confirm");
            const hp = (await state(p)).player.hp, mp = (await state(p)).player.mp;
            await click(p, "nextBattle"); await click(p, "confirm"); s = await state(p);
            assert.equal(s.battle, 2); assert.equal(s.player.hp, hp); assert.equal(s.player.mp, mp);
            assert.equal(s.shadows[0].kind, "guard");
            await click(p, "mana"); await click(p, "confirm");
            assert.equal((await state(p)).potions.mana, 2);
            await act(p, "edge"); await click(p, "tab_report"); await capture(p, name + "-reports");
            await click(p, "retreat"); await click(p, "confirm"); assert.equal((await state(p)).phase, "retreated");
            await p.evaluate(() => { window.__manualTestPreview.view.close(); window.__manualTestPreview.view.open(); });
            await ready(p); assert.equal((await state(p)).phase, "retreated");
            assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), await p.evaluate(() => window.__storageBefore));
            await p.reload(); await ready(p); assert.equal(await state(p), null);
            assert.deepEqual(errors, [], name + " errors"); await p.close();
            console.log(name + " native controls passed");
        }
        const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        await p.goto(url);
        await p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened);
        const original = await p.evaluate(() => { window.__originalPanel = window.__skillBattlePreview.panel; return true; });
        assert.ok(original);
        const pt = await p.evaluate(() => {
            const b = window.__skillBattlePreview.view.view.getChildByName("manualTestEntry");
            const pos = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
            const r = document.querySelector("canvas").getBoundingClientRect();
            return { x: r.left + pos.x * r.width / Laya.stage.width, y: r.top + pos.y * r.height / Laya.stage.height };
        });
        await p.mouse.click(pt.x, pt.y);
        await p.waitForFunction(() => window.__skillBattlePreview.ui.topView?.path.includes("manualTest"));
        await p.evaluate(() => {
            const v = window.__skillBattlePreview.ui.topView;
            window.__manualTestPreview = { view: v, panel: v.panel, session: v.session };
        });
        await ready(p); await capture(p, "production-entry"); await click(p, "back");
        await p.waitForFunction(() => window.__skillBattlePreview.panel.opened && window.__skillBattlePreview.view.view.visible);
        assert.ok(await p.evaluate(() => window.__skillBattlePreview.panel === window.__originalPanel));
        await p.close(); console.log("Production entry/return and storage isolation passed.");
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
