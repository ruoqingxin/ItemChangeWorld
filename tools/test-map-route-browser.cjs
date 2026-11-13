const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const { chromium } = require("playwright");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const output = path.resolve(__dirname, "../tmp/map-routes");
const saveKey = "nowchange.stage4-expedition.v1";

async function click(page, name, touch) {
    const point = await page.evaluate(name => {
        const { ui, panel } = window.__skillBattlePreview;
        const node = ui.topView.getElement(name, false) || panel.buttons[name];
        if (!node?.visible || !node.mouseEnabled) throw Error("Unavailable " + name);
        const point = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
        const rect = document.querySelector("canvas").getBoundingClientRect();
        return { x: rect.left + point.x * rect.width / Laya.stage.width,
            y: rect.top + point.y * rect.height / Laya.stage.height };
    }, name);
    if (touch) await page.touchscreen.tap(point.x, point.y);
    else await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
        window.__skillBattlePreview.view.isOpened && !window.__skillBattlePreview.panel.movement);
}

async function inspect(page, name, reachable) {
    const before = await page.evaluate(key => localStorage.getItem(key), saveKey);
    const state = await page.evaluate(() => {
        const panel = window.__skillBattlePreview.panel, commands = panel.expeditionNodes.expLines.graphics.cmds;
        const issues = [];
        if (!commands.length || commands.length % 3) issues.push("Three layers per dash");
        let active = 0;
        for (let index = 0; index < commands.length; index += 3) {
            const [halo, rim, core] = commands.slice(index, index + 3);
            const highlighted = rim.height === 22;
            if (highlighted) active++;
            if (halo.height !== (highlighted ? 34 : 14) || core.height !== (highlighted ? 12 : 4) ||
                rim.alpha !== (highlighted ? 1 : 0.95) || core.alpha !== (highlighted ? 1 : 0.45) ||
                halo.alpha !== (highlighted ? 0.45 : 0.8))
                issues.push("Thick glowing reachable route versus thin muted route");
            if ([halo, rim, core].some(command => command.cmdID !== Laya.DrawTextureCmd.ID ||
                command.texture !== panel.expeditionNodes.mapRouteTexture.texture ||
                !Number.isFinite(command.width) || command.width <= 0))
                issues.push("Valid imported textured dashes");
            if (halo.x !== rim.x || rim.x !== core.x || halo.width !== rim.width || rim.width !== core.width)
                issues.push("Layers stay centered on the same route");
        }
        return { issues, active, count: commands.length / 3, src: panel.expeditionNodes.mapRouteTexture.src };
    });
    assert.deepEqual(state.issues, []);
    assert.ok(state.src.endsWith("/map-route-dash.png"));
    assert.equal(state.active > 0, reachable, "Only currently reachable connections are emphasized");
    await page.evaluate(() => {
        const { panel } = window.__skillBattlePreview;
        Laya.timer.clear(panel, panel.searchTick);
        panel.expeditionNodes.expLines.visible = false;
    });
    await page.waitForTimeout(50);
    const hidden = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer();
    await page.evaluate(() => { window.__skillBattlePreview.panel.expeditionNodes.expLines.visible = true; });
    await page.waitForTimeout(50);
    const image = await page.screenshot({ path: path.join(output, name + ".png") });
    await page.evaluate(() => {
        const { panel } = window.__skillBattlePreview;
        Laya.timer.loop(50, panel, panel.searchTick);
    });
    const visible = await sharp(image).removeAlpha().raw().toBuffer();
    let cyan = 0, light = 0, changed = 0;
    for (let at = 0; at < visible.length; at += 3) {
        const [r, g, b] = visible.subarray(at, at + 3);
        const delta = Math.abs(r - hidden[at]) + Math.abs(g - hidden[at + 1]) + Math.abs(b - hidden[at + 2]);
        if (delta < 60) continue;
        changed++;
        if (g > 140 && b > 140 && g - r > 22 && b - r > 22) cyan++;
        if (r > 160 && g > 205 && b > 205) light++;
    }
    assert.ok(changed > 100, `${name}: all routes remain visible against the grass`);
    if (reachable) {
        const junction = name.endsWith("-junction");
        const viewport = page.viewportSize(), area = viewport.width * viewport.height / (1280 * 720);
        assert.ok(cyan > Math.max(1, (junction ? 40 : 2) * area) &&
            light > Math.max(1, (junction ? 20 : 4) * area),
            `${name}: reachable connections have bright cyan edges and light cores (${cyan}/${light})`);
    }
    else
        assert.ok(cyan < 10 && light < 10, `${name}: blocked routes have no misleading bright cyan/white highlight (${cyan}/${light})`);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), before, "Rendering never writes a save");
    return state.count;
}

async function main() {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false],
            ["mobile", 844, 390, true], ["small-mobile", 667, 375, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const page = await context.newPage(), errors = [], missing = new Set();
            page.on("pageerror", error => errors.push(error.message));
            page.on("response", response => { if (response.status() >= 400) missing.add(new URL(response.url()).pathname); });
            await page.addInitScript(() => { crypto.getRandomValues = array => { array.fill(1); return array; }; });
            await page.goto(url);
            await page.waitForFunction(() => window.__skillBattlePreview?.panel?.opened);
            await click(page, "invPrimary", touch);
            await click(page, "invPrimary", touch);
            while (await page.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(page, "warehouse0", touch);
                await click(page, "newRun", touch);
            }
            await page.waitForFunction(() => !!window.__skillBattlePreview.panel.expeditionNodes.mapRouteTexture.texture);
            await inspect(page, name + "-reachable", true);
            await click(page, "expNode2", touch);
            await inspect(page, name + "-junction", true);
            await click(page, "expNode3", touch);
            assert.equal(await page.evaluate(() => window.__skillBattlePreview.trial.inventory.node), 3);
            const count = await inspect(page, name + "-enemy", false);
            const saved = await page.evaluate(key => localStorage.getItem(key), saveKey);
            await page.evaluate(() => {
                const { panel } = window.__skillBattlePreview;
                panel.scroller.posX = Math.min(400, panel.scroller.contentWidth - panel.scroller.viewWidth);
            });
            await inspect(page, name + "-scrolled", false);
            await click(page, "expStorage", touch);
            await click(page, "invToggle", touch);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), saveKey), saved);
            assert.deepEqual(errors, []);
            assert.deepEqual([...missing], [], "All referenced artwork loads");
            console.log(`PASS routes ${name}: ${count} dashes, distinct bright reachable/muted blocked pixels, scrolling, storage return, no display-only saves.`);
            await context.close();
        }
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
