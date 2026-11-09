const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18094";
const key = "nowchange.stage1-battle.v1";

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
            localStorage.setItem("nowchange.skill-expedition.current.v2", "existing-v2");
            localStorage.setItem("another-app", "keep");
        });
        await page.reload();
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        const storage = await page.evaluate(key => ({
            old: localStorage.getItem("nowchange.skill-expedition.v1"),
            oldNewRules: localStorage.getItem("nowchange.skill-expedition.new-rules.v4"),
            other: localStorage.getItem("another-app"),
            v2: localStorage.getItem("nowchange.skill-expedition.current.v2"),
            save: JSON.parse(localStorage.getItem(key)),
        }), key);
        assert.equal(storage.old, "retired");
        assert.equal(storage.oldNewRules, "retired");
        assert.equal(storage.v2, "existing-v2");
        assert.equal(storage.other, "keep");
        assert.equal(storage.save, null, "the new entry must not initialize a save until a trial starts");
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
        await page.evaluate(() => window.__skillBattlePreview.panel.startRun());
        await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "battle");
        const runId = await page.evaluate(() => window.__skillBattlePreview.trial.state.battleId);
        await page.reload();
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.state.battleId), runId);

        // The shared clock must continue while the player is on the start page.
        await page.evaluate(() => window.__skillBattlePreview.panel.buttons.loot.event(Laya.Event.CLICK));
        await page.waitForFunction(() => window.__skillBattlePreview.panel?.screen === "start");
        await page.evaluate(() => { const actual = Date.now; Date.now = () => actual() + 1200001; });
        await page.waitForFunction(() => window.__skillBattlePreview?.panel?.screen === "settlement");
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.outcome), "timeout");
        await page.addInitScript(() => { const actual = Date.now; Date.now = () => actual() + 1200001; });
        await page.reload();
        await page.waitForFunction(() => !!window.__skillBattlePreview?.panel);
        assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.outcome), "timeout");
        assert.deepEqual(errors, []);
        assert.deepEqual(failed, []);
        console.log("UI framework browser: untouched v2/other keys, trial reload, idempotent init, cache recreation, landscape root, fullscreen stacking and start-page expiry passed.");
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
