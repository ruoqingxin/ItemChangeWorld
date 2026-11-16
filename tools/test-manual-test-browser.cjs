const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const url = process.env.MANUAL_TEST_URL || "http://127.0.0.1:18126";
const output = path.resolve(__dirname, "../bin/manual-test-browser");
async function ready(p) {
    await p.waitForFunction(() => window.__manualTestPreview?.view.isOpened && window.__manualTestPreview.panel?.opened);
}
async function click(p, key) {
    const pt = await p.evaluate(key => {
        const b = window.__manualTestPreview.panel.buttons[key];
        if (!b?.visible || !b.mouseEnabled) throw new Error("Inactive button " + key);
        const point = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
        const box = document.querySelector("canvas").getBoundingClientRect();
        return { x: box.left + point.x * box.width / Laya.stage.width, y: box.top + point.y * box.height / Laya.stage.height };
    }, key);
    await p.mouse.click(pt.x, pt.y);
    await p.waitForTimeout(60);
}
async function act(p, key) { await click(p, "move_" + key); await click(p, "confirm"); }
async function choose(p, menu, title) {
    await click(p, menu);
    const key = await p.evaluate(title => {
        const panel = window.__manualTestPreview.panel;
        return Object.keys(panel.buttons).find(key => key.startsWith("option_") && panel.labels[key + "Text"].text === title);
    }, title);
    assert.ok(key, "menu option " + title); await click(p, key);
}
async function fill(p, key, value) {
    const pt = await p.evaluate(key => {
        const b = window.__manualTestPreview.panel.inputs[key];
        const pos = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + pos.x * r.width / Laya.stage.width, y: r.top + pos.y * r.height / Laya.stage.height };
    }, key);
    await p.mouse.click(pt.x, pt.y); await p.keyboard.press("Control+A"); await p.keyboard.type(String(value));
    await p.keyboard.press("Tab"); await p.waitForTimeout(80);
}
const state = p => p.evaluate(() => window.__manualTestPreview.session.state);
async function capture(p, name) {
    await p.waitForTimeout(150);
    const file = path.join(output, name + ".png"); await p.screenshot({ path: file });
    const stats = await sharp(file).stats(); assert.ok(stats.channels.some(x => x.stdev > 10), "nonblank canvas");
    const issues = await p.evaluate(() => {
        const panel = window.__manualTestPreview.panel, rects = [], issues = [];
        for (const [key, node] of Object.entries(panel.buttons)) {
            if (!node.visible || !node.mouseEnabled || key.startsWith("option_")) continue;
            const p = node.localToGlobal(new Laya.Point());
            if (p.x < -1 || p.y < -1 || p.x + node.width > Laya.stage.width + 1 ||
                p.y + node.height > Laya.stage.height + 1) issues.push("outside " + key);
            rects.push({ key, x: p.x, y: p.y, w: node.width, h: node.height });
        }
        for (let i = 0; i < rects.length; i++) for (const b of rects.slice(i + 1)) {
            const a = rects[i];
            if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
                Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) issues.push(a.key + "/" + b.key);
        }
        return issues;
    });
    assert.deepEqual(issues, [], name + " hit areas");
}
async function main() {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, viewport] of [["desktop", { width: 1280, height: 720 }],
            ["wide", { width: 1920, height: 1080 }], ["mobile", { width: 844, height: 390 }]]) {
            const p = await browser.newPage({ viewport }), errors = [], failures = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
            p.on("response", r => { if (r.status() >= 400) failures.push(r.url()); });
            await p.goto(url + "/?manualTest=1"); await ready(p);
            await p.evaluate(() => {
                localStorage.setItem("nowchange.stage4-expedition.v1", "preserve-expedition");
                localStorage.setItem("other-app", "preserve-other");
                window.__storageBefore = { ...localStorage };
            });
            await capture(p, name + "-setup");
            await click(p, "restart");
            assert.equal((await state(p)).setup.star, 0);
            const before = await state(p); await click(p, "move_edge");
            assert.deepEqual(await state(p), before, "select/preview does not mutate");
            await capture(p, name + "-preview");
            await click(p, "cancel"); assert.deepEqual(await state(p), before, "cancel is pure");
            await click(p, "move_edge");
            await click(p, "confirm"); assert.equal((await state(p)).ap, 2);
            await act(p, "wind"); await act(p, "guide");
            let s = await state(p); assert.equal(s.round, 2); assert.equal(s.sky.length, 3);
            await capture(p, name + "-battle");
            // Canonical star/rank transitions and cumulative growth.
            await click(p, "starUp"); await click(p, "rankUp");
            assert.equal((await state(p)).setup.star, 0, "draft changes do not hot-change combat");
            await click(p, "restart"); s = await state(p);
            assert.equal(s.setup.star, 1); assert.equal(s.setup.rank, 2); assert.equal(s.sky.length, 0);
            await click(p, "tab_growth"); await capture(p, name + "-growth");
            // Real menu selection, all five star layers, and enemy strategy.
            await click(p, "enemyStyle"); await click(p, "option_1");
            for (let i = 0; i < 4; i++) await click(p, "starUp");
            for (let i = 0; i < 4; i++) await click(p, "rankUp");
            await fill(p, "player_hp", 10000);
            await click(p, "restart"); s = await state(p);
            assert.equal(s.setup.star, 5); assert.equal(s.setup.rank, 6); assert.equal(s.setup.style, "assault");
            assert.equal(s.player.hp, 10000, "real editable attribute field applied");
            await act(p, "wind"); await act(p, "edge"); await act(p, "guide");
            await click(p, "move_wind"); await click(p, "branch"); await click(p, "option_4");
            await click(p, "target"); await click(p, "option_0");
            await choose(p, "delayAt", "第3行动前");
            await click(p, "tab_log"); await capture(p, name + "-advanced");
            await click(p, "confirm");
            assert.ok((await state(p)).ambush !== null);
            assert.equal((await state(p)).ambushAt, 3);
            const scheduledId = (await state(p)).ambush;
            const beforeLogs = (await state(p)).logs.length;
            await click(p, "endTurn"); await click(p, "confirm");
            const enemyLogs = (await state(p)).logs.slice(beforeLogs);
            assert.ok(enemyLogs.findIndex(l => l.includes(`#${scheduledId} 应剑`)) >
                enemyLogs.findIndex(l => l.includes("敌行动3")), "ambush waits for chosen action");
            // Select point-break and its timing through real native menus.
            await click(p, "restart");
            await act(p, "guide"); await act(p, "edge"); await act(p, "wind");
            await click(p, "move_guide"); await choose(p, "branch", "点破");
            await click(p, "target"); await click(p, "option_0");
            await choose(p, "delayAt", "第3行动前"); await click(p, "confirm");
            assert.equal((await state(p)).pinpointAt, 3);
            await click(p, "endTurn"); await click(p, "confirm");
            assert.ok((await state(p)).logs.some(l => l.includes("点破：敌第3行动削弱30%")));
            await capture(p, name + "-timed-response");
            // Natural four-round setup, then actual optional-menu formation, absorption and recall.
            await click(p, "enemyStyle"); await click(p, "option_0"); await click(p, "restart");
            await act(p, "edge"); await act(p, "edge");
            await click(p, "move_edge");
            await choose(p, "optional", "以#1为首成阵"); await click(p, "confirm");
            assert.equal((await state(p)).sky[0].members.length, 3);
            for (let i = 0; i < 2; i++) { await click(p, "endTurn"); await click(p, "confirm"); }
            await click(p, "move_fall");
            await choose(p, "optional", "纳入 锋影#1"); await click(p, "confirm");
            assert.equal((await state(p)).body[0].id, 1);
            assert.equal((await state(p)).cache.length, 2);
            await click(p, "move_wind"); await choose(p, "branch", "招影");
            await click(p, "target"); await click(p, "option_0");
            await click(p, "confirm");
            assert.equal((await state(p)).sky.length, 1);
            await capture(p, name + "-body-return");
            await p.evaluate(() => {
                const v = window.__manualTestPreview.view; v.close();
                window.__manualTestPreview.ui = Laya.GRoot.inst;
            });
            // Closing/reopening preserves only the in-memory sandbox.
            await p.evaluate(() => {
                window.__manualTestPreview.view.open();
            });
            await ready(p);
            assert.deepEqual(await p.evaluate(() => ({ ...localStorage })), await p.evaluate(() => window.__storageBefore),
                "no production or foreign storage writes");
            await p.reload(); await ready(p); assert.equal(await state(p), null, "no automatic sandbox persistence");
            assert.deepEqual(errors, [], name + " errors"); assert.deepEqual(failures, [], name + " resource failures");
            await p.close();
        }
        // Launch via the actual production preparation view, and return to that same live run.
        const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        await p.goto(url);
        await p.waitForFunction(() => window.__skillBattlePreview?.view?.isOpened && window.__skillBattlePreview.panel?.opened);
        const pt = await p.evaluate(() => {
            const v = window.__skillBattlePreview.view, b = v.view.getChildByName("manualTestEntry");
            const pos = b.localToGlobal(new Laya.Point(b.width / 2, b.height / 2));
            const rect = document.querySelector("canvas").getBoundingClientRect();
            return { x: pos.x * rect.width / Laya.stage.width, y: pos.y * rect.height / Laya.stage.height };
        });
        await p.mouse.click(pt.x, pt.y);
        await p.waitForFunction(() => window.__skillBattlePreview.ui.topView?.path.includes("manualTest") &&
            window.__skillBattlePreview.ui.topView.isOpened);
        await p.evaluate(() => { const v = window.__skillBattlePreview.ui.topView; window.__manualTestPreview = { view: v, panel: v.panel }; });
        await capture(p, "production-entry");
        await click(p, "back");
        await p.waitForFunction(() => window.__skillBattlePreview.panel.opened && window.__skillBattlePreview.view.view.visible);
        await p.close();
        console.log("Manual test browser: 3 viewports, real input, menu branches, production entry/return, storage isolation and screenshots passed.");
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
