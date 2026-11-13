const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { chromium } = require("playwright");
const { check } = require("./import-map-unified-art.cjs");
const base = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18140";
const output = path.resolve(__dirname, "../tmp/map-atmosphere");
const saveKey = "nowchange.stage4-expedition.v1";
const ready = page => page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function click(page, name, touch) {
    const at = await page.evaluate(name => {
        const { panel, ui } = window.__skillBattlePreview;
        const node = ui.topView.getElement(name, false) || panel.buttons[name];
        if (!node?.visible || !node.mouseEnabled) throw Error(`Unavailable ${name}`);
        const point = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        return { x: canvas.left + point.x * canvas.width / Laya.stage.width,
            y: canvas.top + point.y * canvas.height / Laya.stage.height };
    }, name);
    if (touch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(100);
    await ready(page);
    await page.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
}

async function inspect(page) {
    await page.waitForFunction(() => {
        const { panel, trial: run } = window.__skillBattlePreview;
        return run.inventory.map.nodes.every(node => {
            const button = panel.buttons[`expNode${node.id}`];
            if (!button?.visible) return true;
            const image = button.getChildAt(node.kind === "transit" ? 0 : 2);
            return !image.visible || image.texture?.width === 256 && image.texture?.height === 256;
        });
    });
    return page.evaluate(() => {
        const { panel, trial: run, view } = window.__skillBattlePreview;
        const nodes = run.inventory.map.nodes, state = JSON.stringify(run.data.save.state);
        const geometry = () => ({
            areas: ["mapHeaderArea", "mapPlayerArea", "mapActionsArea", "nodeActionArea"].map(name => {
                const n = panel.mapAreas[name]; return [name, n.x, n.y, n.width, n.height];
            }),
            nodes: nodes.map(node => {
                const n = panel.buttons[`expNode${node.id}`];
                return [node.id, n.x, n.y, n.width, n.height, n.mouseEnabled];
            }),
        });
        const before = geometry();
        panel.refresh(); panel.refresh();
        if (JSON.stringify(geometry()) !== JSON.stringify(before)) throw Error("Refresh changed authored geometry");
        if (JSON.stringify(run.data.save.state) !== state) throw Error("Appearance wrote game state");
        for (const node of nodes) {
            const button = panel.buttons[`expNode${node.id}`];
            if (!button?.visible) continue;
            const image = button.getChildAt(node.kind === "transit" ? 0 : 2);
            if (!image.src.startsWith(node.kind === "transit" ?
                "ui/atlas/module/expedition/handpainted/map-transit-stone-muted.png" : "ui/image/expeditionNodes/node-"))
                throw Error(`Unexpected map artwork: ${node.id}/${node.kind}`);
            if (image.mouseEnabled || image.alpha !== 1) throw Error("Node artwork must stay passive and opaque");
            if (image.width !== 104 || image.height !== 104 || image.autoSize)
                throw Error(`Node must retain the common prefab image size: ${node.kind}`);
            if (image.x !== 6 || image.y !== (node.kind === "transit" ? 18 : 0))
                throw Error(`Node must retain its prefab image placement: ${node.kind}`);
        }
        for (const [i, kind] of ["normal", "elite", "boss"].entries())
            if (view.getElement(`mapKillIcon${i}`).src !== `ui/image/expeditionNodes/hud/node-enemy-${kind}.png`)
                throw Error("HUD counters must use the dedicated no-atmosphere artwork");
        const context = view.getElement("expContextIcon", false);
        if (context?.visible && !context.src.includes("/expeditionNodes/clean/"))
            throw Error("Action icon must remain clean");
        return before;
    });
}

async function capture(page, name, kind) {
    await page.evaluate(kind => {
        const { panel, trial } = window.__skillBattlePreview;
        const state = trial.data.save.state;
        window.__atmosphereFixture = {
            revealed: state.revealed, scroll: panel.scroller.posX, center: panel.centerMap,
        };
        // Reveal only in memory for screenshots of the late-map subjects, then restore.
        state.revealed = [...state.map.present]; panel.centerMap = false; panel.refresh();
        if (kind === "opening") panel.scroller.posX = 0;
        else {
            const node = trial.inventory.map.nodes.find(node => node.kind === kind);
            const button = panel.buttons[`expNode${node.id}`];
            panel.scroller.posX = Math.max(0, button.x + 58 - panel.expeditionNodes.expViewport.width * 0.52);
        }
        panel.backdrop();
    }, kind);
    try {
        await inspect(page);
        await page.waitForTimeout(180);
        const bytes = await page.screenshot({ path: path.join(output, `${name}-${kind}.png`) });
        assert.ok((await sharp(bytes).stats()).channels.slice(0, 3).every(channel => channel.stdev > 15));
    } finally {
        await page.evaluate(() => {
            const { panel, trial } = window.__skillBattlePreview, fixture = window.__atmosphereFixture;
            trial.data.save.state.revealed = fixture.revealed;
            panel.centerMap = fixture.center; panel.refresh(); panel.scroller.posX = fixture.scroll;
            panel.backdrop(); delete window.__atmosphereFixture;
        });
    }
}

async function main() {
    await check();
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false],
            ["mobile", 844, 390, true], ["small-mobile", 667, 375, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [], missing = [];
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => { if (response.status() >= 400) missing.push(response.url()); });
            await page.addInitScript(() => { crypto.getRandomValues = array => { array.fill(1); return array; }; });
            await page.goto(base); await ready(page);
            await click(page, "invPrimary", touch); await click(page, "invPrimary", touch);
            while (await page.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(page, "warehouse0", touch); await click(page, "newRun", touch);
            }
            await page.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            const saved = await page.evaluate(key => localStorage.getItem(key), saveKey);
            const baseline = await inspect(page);
            await page.evaluate(() => {
                const { panel } = window.__skillBattlePreview;
                const image = panel.buttons.expNode1.getChildAt(2);
                const original = [image.x, image.y, image.width, image.height];
                try {
                    image.pos(10, 3); image.size(96, 96);
                    panel.refresh(); panel.refresh();
                    if (image.x !== 10 || image.y !== 3 || image.width !== 96 || image.height !== 96)
                        throw Error("A data refresh must not overwrite authored node image geometry");
                    for (let id = 33; id <= 44; id++) {
                        const extra = panel.buttons[`expNode${id}`].getChildAt(2);
                        if (extra.x !== 6 || extra.y !== 0 || extra.width !== 104 || extra.height !== 104 || extra.autoSize)
                            throw Error("Dynamic node images must inherit the prefab geometry");
                    }
                } finally {
                    image.pos(original[0], original[1]); image.size(original[2], original[3]);
                    panel.refresh();
                }
            });
            assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), saved);
            for (const kind of ["opening", "boss", "extract", "recovery", "borrow", "search"])
                await capture(page, name, kind);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), saved);
            await page.reload(); await ready(page);
            await page.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            assert.deepEqual(await inspect(page), baseline, "Reload must not move nodes or any fixed UI");
            assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), saved,
                "Artwork and browsing do not write saves");
            await click(page, "expNode2", touch);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.inventory.node), 2);
            await click(page, "expNode3", touch);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.inventory.flow.phase), "ready");
            assert.ok(await page.evaluate(() => window.__skillBattlePreview.panel.buttons.expUse.visible),
                "Real input still moves first and then opens the authored operation panel");
            const changed = await page.evaluate(key => localStorage.getItem(key), saveKey);
            await click(page, "expAbandon", touch);
            assert.ok(await page.evaluate(() => window.__skillBattlePreview.panel.modalOpen));
            await inspect(page);
            await click(page, "dialogCancel", touch);
            await inspect(page);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), changed,
                "Confirmation refreshes and cancel preserve dimensions without saving");
            await page.setViewportSize({ width: width + 80, height });
            await page.waitForTimeout(150);
            await inspect(page);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), changed);
            assert.deepEqual(errors, []); assert.deepEqual(missing, []);
            await context.close();
            console.log(`PASS atmosphere ${name}: 256px artwork, scene screenshots, stable layout, clean HUD/details, real movement and no presentation saves.`);
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
