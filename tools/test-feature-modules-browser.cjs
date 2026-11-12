const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18139";
const out = path.resolve(__dirname, "../tmp/feature-modules-browser");
const ready = page => page.waitForFunction(() =>
    window.__skillBattlePreview?.panel?.opened && window.__skillBattlePreview.view.isOpened);
const state = page => page.evaluate(() => window.__skillBattlePreview.trial.inventory);
async function point(page, key) {
    return page.evaluate(key => {
        const v = window.__skillBattlePreview;
        const n = v.ui.topView.getElement(key, false) || v.panel.buttons[key] || v.panel.nodes[key];
        if (!n?.visible) throw Error(`Unavailable ${key}`);
        const p = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + p.x * r.width / Laya.stage.width,
            y: r.top + p.y * r.height / Laya.stage.height };
    }, key);
}
async function click(page, key, touch) {
    const at = await point(page, key);
    if (touch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(140);
    await ready(page);
    await page.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
}
async function drag(page, from, to, touch) {
    const a = await point(page, from), b = await point(page, to);
    if (touch) {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...a, id: 1 }] });
        await page.waitForTimeout(180);
        for (let i = 1; i <= 16; i++) await cdp.send("Input.dispatchTouchEvent", {
            type: "touchMove", touchPoints: [{ id: 1, x: a.x + (b.x - a.x) * i / 16,
                y: a.y + (b.y - a.y) * i / 16 }],
        });
        await page.waitForTimeout(100);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
    } else {
        await page.mouse.move(a.x, a.y);
        await page.mouse.down();
        await page.waitForTimeout(180);
        await page.mouse.move(b.x, b.y, { steps: 16 });
        await page.waitForTimeout(100);
        await page.mouse.up();
    }
    await page.waitForTimeout(200);
}
async function screenshot(page, name) {
    const image = await page.screenshot({ path: path.join(out, name + ".png") });
    assert.ok((await sharp(image).stats()).channels.slice(0, 3).every(c => c.stdev > 12));
}
async function choose(page, touch) {
    while ((await state(page)).flow.pending) {
        await click(page, "warehouse0", touch);
        await click(page, "newRun", touch);
    }
}
async function reloadUnchanged(page) {
    const text = await page.evaluate(() => localStorage.getItem("nowchange.stage4-expedition.v1"));
    await page.reload();
    await ready(page);
    assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.stage4-expedition.v1")), text,
        "Restoring the reorganized modules must not rewrite the save");
}
(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [], failed = [];
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => { if (response.status() >= 400) failed.push(response.url()); });
            await page.addInitScript(() => {
                crypto.getRandomValues = array => { array.fill(1); return array; };
                localStorage.setItem("other-app", "keep");
            });
            await page.goto(url);
            await ready(page);
            assert.match(await page.evaluate(() => window.__skillBattlePreview.trial.constructor.name), /^_?ExpeditionRunManager$/);
            await click(page, "invPrimary", touch);
            const before = await state(page);
            const carried = await page.evaluate(() => {
                const { panel } = window.__skillBattlePreview;
                const item = panel.gridItems[0];
                return { uid: item.uid, from: item.location, key: "invItem0" };
            });
            assert.equal(carried.from.space, "battle");
            await drag(page, carried.key, "invSourceCell55", touch);
            assert.equal((await state(page)).items.find(item => item.uid === carried.uid).location.space, "warehouse",
                "An actual drag crosses inventory and expedition transaction modules");
            const listKey = await page.evaluate(uid =>
                "invList" + window.__skillBattlePreview.panel.visibleItems.findIndex(item => item.uid === uid), carried.uid);
            await drag(page, listKey, `invCell_battle_${carried.from.y * 5 + carried.from.x}`, touch);
            assert.deepEqual((await state(page)).items, before.items);
            await reloadUnchanged(page);
            await screenshot(page, name + "-preparation");
            await click(page, "invPrimary", touch);
            await choose(page, touch);
            await screenshot(page, name + "-map");
            for (let i = 0; i < 10 && (await state(page)).flow.phase !== "battle"; i++) {
                const s = await state(page), node = s.map.nodes.find(node => node.id === s.node);
                if (node.enemy) await click(page, "expUse", touch);
                else {
                    const target = s.map.nodes.filter(n => n.mainOrder > node.mainOrder)
                        .sort((a, b) => a.mainOrder - b.mainOrder)[0];
                    await click(page, `expNode${target.id}`, touch);
                }
            }
            assert.equal((await state(page)).flow.phase, "battle");
            const revision = (await state(page)).revision;
            await click(page, "skill1", touch);
            await click(page, "confirm", touch);
            await page.waitForFunction(() => window.__skillBattlePreview.panel?.opened &&
                !window.__skillBattlePreview.panel.busy);
            assert.equal((await state(page)).revision, revision + 1);
            await reloadUnchanged(page);
            await screenshot(page, name + "-battle");
            await click(page, "battleReport", touch);
            await click(page, "reportClose", touch);
            await click(page, "build", touch);
            await click(page, "reportClose", touch);
            for (let i = 0; i < 30 && (await state(page)).flow.phase === "battle"; i++) {
                await click(page, "skill1", touch);
                await click(page, "confirm", touch);
                await page.waitForFunction(() => window.__skillBattlePreview.panel?.opened &&
                    !window.__skillBattlePreview.panel.busy);
            }
            assert.equal((await state(page)).phase, "active");
            await choose(page, touch);
            await click(page, "expStorage", touch);
            await screenshot(page, name + "-inventory");
            await click(page, "invToggle", touch);
            await click(page, "expBuild", touch);
            await screenshot(page, name + "-build");
            await click(page, "invToggle", touch);
            const text = await page.evaluate(() => localStorage.getItem("nowchange.stage4-expedition.v1"));
            await click(page, "expAbandon", touch);
            await click(page, "dialogCancel", touch);
            assert.equal(await page.evaluate(() => localStorage.getItem("nowchange.stage4-expedition.v1")), text);
            await click(page, "expAbandon", touch);
            await click(page, "dialogConfirm", touch);
            assert.equal((await state(page)).result, "abandon");
            await screenshot(page, name + "-settlement");
            await reloadUnchanged(page);
            assert.equal(await page.evaluate(() => localStorage.getItem("other-app")), "keep");
            assert.deepEqual(errors, []);
            assert.deepEqual(failed, []);
            await context.close();
            console.log(`PASS feature flow ${name}: drag, build, map, battle, popups, save replay and settlement`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
