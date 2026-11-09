const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18094";
const key = "nowchange.skill-expedition.current.v2";

async function main() {
    let browser;
    try { browser = await chromium.launch({ headless: true, channel: "chromium" }); }
    catch (error) {
        if (process.platform !== "win32") throw error;
        browser = await chromium.launch({ headless: true, channel: "msedge" });
    }
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        const errors = [], failed = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("response", response => { if (response.status() >= 400) failed.push(response.url()); });
        await page.goto(url);
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        await page.evaluate(() => {
            localStorage.setItem("nowchange.skill-expedition.v1", "retired");
            localStorage.setItem("nowchange.skill-expedition.new-rules.v4", "retired");
            localStorage.setItem("another-app", "keep");
        });
        await page.reload();
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        const storage = await page.evaluate(key => ({
            old: localStorage.getItem("nowchange.skill-expedition.v1"),
            oldNewRules: localStorage.getItem("nowchange.skill-expedition.new-rules.v4"),
            other: localStorage.getItem("another-app"),
            save: JSON.parse(localStorage.getItem(key)),
        }), key);
        assert.equal(storage.old, null);
        assert.equal(storage.oldNewRules, null);
        assert.equal(storage.other, "keep");
        assert.equal(storage.save.version, 2);
        const uiState = await page.evaluate(() => {
            const view = window.__skillBattlePreview.view;
            // Repeated LobbyManager initialization must not duplicate GRoot children.
            const manager = window.__skillBattlePreview.ui;
            const count = Laya.GRoot.inst.numChildren;
            manager.init();
            manager.init();
            return { before: count, after: Laya.GRoot.inst.numChildren,
                width: manager.uiRoot.width, height: manager.uiRoot.height,
                top: manager.topView === view, mapper: view.mapperType };
        });
        assert.equal(uiState.before, uiState.after);
        assert.equal(uiState.width, 1280);
        assert.equal(uiState.height, 720);
        assert.equal(uiState.top, true);
        assert.equal(uiState.mapper, 4);
        const closing = await page.evaluate(() => {
            const preview = window.__skillBattlePreview, view = preview.view;
            let complete;
            view.windowAnimatorOut = callback => { complete = callback; };
            preview.close();
            preview.ui.clearAllInstant();
            const retained = view.isClosing && !view.view.destroyed && preview.ui.topView === view;
            preview.reopen();
            complete();
            view.windowAnimatorOut = null;
            return { retained, reopened: view.isOpened && !view.isClosing && view.view.visible };
        });
        assert.deepEqual(closing, { retained: true, reopened: true });
        const animation = await page.evaluate(() => {
            const view = window.__skillBattlePreview.view, elements = view.uiElement;
            const previous = elements.elementAnimOutList, callbacks = [];
            elements.elementAnimOutList = [0, 1].map(() => ({
                play: done => callbacks.push(done), resetNode() {}, clearAllTweens() {},
            }));
            let count = 0;
            view.playElementAnimOut(() => count++);
            callbacks[0]();
            const beforeAll = count;
            callbacks[1]();
            callbacks[0]();
            elements.elementAnimOutList = previous;
            return { beforeAll, count };
        });
        assert.deepEqual(animation, { beforeAll: 0, count: 1 });
        await page.evaluate(() => {
            const preview = window.__skillBattlePreview;
            preview.close();
            preview.ui.clearAllInstant();
            preview.reopen();
        });
        await page.waitForFunction(() => window.__skillBattlePreview.view.isOpened);
        await page.evaluate(() => window.__skillBattlePreview.expedition.startNew(42));
        const runId = await page.evaluate(() => window.__skillBattlePreview.expedition.run.runId);
        await page.reload();
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.expedition.run.runId), runId);

        // A run waiting for the starting choice must expire without visiting the map.
        await page.evaluate(key => {
            const save = JSON.parse(localStorage.getItem(key));
            save.run.map.startedAt = Date.now() - 1200000;
            save.run.map.deadlineAt = Date.now() + 650;
            localStorage.setItem(key, JSON.stringify(save));
        }, key);
        await page.reload();
        await page.waitForFunction(() => window.__skillBattlePreview?.panel?.screen === "settlement");
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.expedition.run.report.endReason), "timeout");
        await page.reload();
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.expedition.run.phase), "failed");

        // Repeat with an active battle. Combat input must not extend the absolute timer.
        await page.evaluate(() => {
            const expedition = window.__skillBattlePreview.expedition;
            expedition.startNew(42);
            expedition.chooseStartingSkill(1);
            expedition.enterMapNode("b1");
            window.__skillBattlePreview.reopen();
        });
        await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "battle");
        await page.evaluate(key => {
            const save = JSON.parse(localStorage.getItem(key));
            save.run.map.startedAt = Date.now() - 1200000;
            save.run.map.deadlineAt = Date.now() + 650;
            localStorage.setItem(key, JSON.stringify(save));
        }, key);
        await page.reload();
        await page.waitForFunction(() => window.__skillBattlePreview?.panel?.screen === "settlement");
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.expedition.run.report.endReason), "timeout");
        assert.deepEqual(errors, []);
        assert.deepEqual(failed, []);
        console.log("UI framework browser: save purge/isolation, reload, idempotent init, cache recreation, landscape root, fullscreen stacking and all-page expiry passed.");
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
