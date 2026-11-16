const { chromium } = require("playwright"), sharp = require("sharp");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18148";
const output = path.resolve(__dirname, "../tmp/config-export/search-sites/browser");
async function click(page, key, touch) {
    const pos = await page.evaluate(key => {
        const n = window.__skillBattlePreview.panel.buttons[key];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${key}`);
        const at = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        return { x: canvas.left + at.x * canvas.width / Laya.stage.width, y: canvas.top + at.y * canvas.height / Laya.stage.height };
    }, key);
    if (touch) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
    await page.waitForTimeout(90);
    await page.waitForFunction(() => window.__skillBattlePreview.panel.opened && !window.__skillBattlePreview.panel.movement);
}
async function screenshot(page, name) {
    const bytes = await page.screenshot({ path: path.join(output, name + ".png") });
    const stats = await sharp(bytes).stats();
    assert.ok(stats.channels.slice(0, 3).every(c => c.stdev > 15), "Canvas contains rendered artwork");
    const overflow = await page.evaluate(() => {
        const { panel } = window.__skillBattlePreview;
        return Object.entries(panel.labels).filter(([, n]) => {
            for (let p = n; p; p = p.parent) if (!p.visible) return false;
            if (!n.text) return false; n.textIns.typeset(true);
            return n.textIns.textWidth > n.width + 3 || n.textIns.textHeight > n.height + 3;
        }).map(([key]) => key);
    });
    assert.deepEqual(overflow, [], "Visible text fits its bounds");
}
(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || "msedge" });
    try {
        for (const [name, width, height, touch] of [["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true]]) {
            const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch });
            const page = await context.newPage(), errors = [], missing = [];
            page.on("pageerror", e => errors.push(e.message));
            page.on("response", r => { if (r.status() >= 400) missing.push([r.status(), r.url()]); });
            await page.addInitScript(() => { crypto.getRandomValues = a => { a.fill(218); return a; }; });
            await page.goto(url);
            await page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened);
            await click(page, "invPrimary", touch); await click(page, "invPrimary", touch);
            while (await page.evaluate(() => !!window.__skillBattlePreview.trial.flow?.pending)) {
                await click(page, "warehouse0", touch); await click(page, "newRun", touch);
            }
            await page.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            await screenshot(page, name + "-birth");
            await click(page, "expEnemyBlocking", touch);
            const route = await page.evaluate(() => {
                const state = window.__skillBattlePreview.trial.inventory, queue = [[state.node]], seen = new Set([state.node]);
                for (const p of queue) {
                    if (state.map.nodes.find(n => n.id === p.at(-1)).pool === "alchemy") return p;
                    for (const [a, b] of state.map.edges) {
                        const next = a === p.at(-1) ? b : b === p.at(-1) ? a : null;
                        if (next !== null && !seen.has(next)) { seen.add(next); queue.push([...p, next]); }
                    }
                }
            });
            for (const id of route.slice(1)) await click(page, `expNode${id}`, touch);
            await page.waitForFunction(() => window.__skillBattlePreview.panel.expeditionNodes.expContextIcon.texture?.width === 256);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.panel.labels.expContextTitle.text), "炼丹房");
            await screenshot(page, name + "-alchemy-arrival");
            await click(page, "expUse", touch);
            await page.waitForFunction(() => window.__skillBattlePreview.trial.searching);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.inventory.map.sources
                .find(b => b.node === window.__skillBattlePreview.trial.inventory.node).entries.length), 3);
            // The remaining screenshots inspect every generated category without replaying unrelated combat.
            await page.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview; trial.pauseSearch(); panel.navigate("map");
            });
            await page.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            const samples = await page.evaluate(() => {
                const { trial } = window.__skillBattlePreview;
                return [...new Map(trial.inventory.map.nodes.filter(n => n.kind === "search").map(n => [n.pool, n])).values()];
            });
            assert.equal(samples.length, 9);
            for (const sample of samples) {
                await page.evaluate(id => {
                    const { panel, trial } = window.__skillBattlePreview, state = trial.data.save.state;
                    state.node = id; state.revealed = [...state.map.present]; panel.selectedNode = id; panel.centerMap = true; panel.refresh();
                }, sample.id);
                await page.waitForFunction(id => {
                    const { panel } = window.__skillBattlePreview;
                    return panel.buttons[`expNode${id}`].getChildAt(2).texture?.width === 256 &&
                        panel.expeditionNodes.expContextIcon.texture?.width === 256;
                }, sample.id);
                const art = await page.evaluate(id => {
                    const { panel } = window.__skillBattlePreview, n = panel.buttons[`expNode${id}`], icon = n.getChildAt(2);
                    return { src: icon.src, context: panel.expeditionNodes.expContextIcon.src, title: panel.labels.expContextTitle.text,
                        bounds: [icon.x, icon.y, icon.width, icon.height], done: n.getChildByName("expDone").visible };
                }, sample.id);
                assert.equal(art.src, `ui/image/expeditionNodes/node-${sample.icon}.png`);
                assert.equal(art.context, `ui/image/expeditionNodes/clean/node-${sample.icon}.png`);
                assert.equal(art.title, sample.name);
                assert.ok(art.bounds[2] <= 116 && art.bounds[3] <= 116, "Search artwork retains node hit-area size");
                await screenshot(page, `${name}-${sample.pool}`);
            }
            assert.deepEqual(errors, []); assert.deepEqual(missing, []);
            console.log(`PASS ${name}: actual alchemy travel/search; nine generated category icons, labels, context and text bounds`);
            await context.close();
        }
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
