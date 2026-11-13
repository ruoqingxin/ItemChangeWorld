const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18139";
const output = path.resolve(__dirname, "../tmp/map-enemy-blocking");
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function click(p, name) {
    const at = await p.evaluate(name => {
        const n = window.__skillBattlePreview.panel.buttons[name];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${name}`);
        const at = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + at.x * r.width / Laya.stage.width, y: r.top + at.y * r.height / Laya.stage.height };
    }, name);
    if (p.touchMode) await p.touchscreen.tap(at.x, at.y);
    else await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(120); await ready(p);
}

async function toggleState(p) {
    return p.evaluate(() => {
        const { panel, trial } = window.__skillBattlePreview, s = trial.inventory;
        const toggle = panel.buttons.expEnemyBlocking;
        const neighbors = s.map.edges.flatMap(([a, b]) => a === s.node ? [b] : b === s.node ? [a] : []);
        return {
            blocking: s.map.debugEnemyBlocking !== false, selected: toggle.selected,
            neighbors, enabledNeighbors: neighbors.filter(id => panel.buttons[`expNode${id}`].mouseEnabled),
            node: s.node, stamina: s.stamina, hp: s.hp, cleared: s.map.cleared,
            sources: s.map.sources, revision: s.revision, phase: s.flow.phase
        };
    });
}

(async () => {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false],
            ["mobile", 844, 390, true], ["small-mobile", 667, 375, true]
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            try {
                const p = await context.newPage(), errors = [];
                p.touchMode = touch;
                p.on("pageerror", error => errors.push(error.message));
                await p.addInitScript(() => { crypto.getRandomValues = a => { a.fill(1); return a; }; });
                await p.goto(url); await ready(p);
                await click(p, "invPrimary"); await click(p, "invPrimary");
                while (await p.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                    await click(p, "warehouse0"); await click(p, "newRun");
                }
                await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
                assert.equal((await toggleState(p)).selected, true);
                const enemy = await p.evaluate(() => window.__skillBattlePreview.trial.inventory.map.nodes
                    .find(n => n.enemy && n.mainOrder >= 0).id);
                for (let id = 2; id <= enemy; id++) {
                    await click(p, `expNode${id}`);
                    const during = await p.evaluate(() => {
                        const { panel, trial } = window.__skillBattlePreview, before = trial.token.revision;
                        panel.command("expEnemyBlocking");
                        return { moving: !!panel.movement, disabled: !panel.buttons.expEnemyBlocking.mouseEnabled,
                            unchanged: before === trial.token.revision };
                    });
                    assert.ok(during.moving && during.disabled && during.unchanged, "Animation locks the test switch");
                    await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
                }
                const blocked = await toggleState(p);
                assert.equal(blocked.phase, "ready");
                assert.deepEqual(blocked.enabledNeighbors, []);
                await click(p, "expEnemyBlocking");
                const unlocked = await toggleState(p);
                assert.equal(unlocked.blocking, false); assert.equal(unlocked.selected, false);
                assert.deepEqual(unlocked.enabledNeighbors, unlocked.neighbors);
                for (const key of ["node", "stamina", "hp", "cleared", "sources"])
                    assert.deepEqual(unlocked[key], blocked[key], `Toggle never changes ${key}`);
                await p.reload(); await ready(p);
                if (await p.evaluate(() => window.__skillBattlePreview.panel.pageRole !== "map"))
                    await click(p, "invPrimary");
                await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
                const restored = await toggleState(p);
                assert.equal(restored.blocking, false); assert.equal(restored.selected, false);
                assert.equal(restored.node, enemy);
                const placement = await p.evaluate(() => {
                    const { panel } = window.__skillBattlePreview, toggle = panel.buttons.expEnemyBlocking;
                    const bounds = n => {
                        const a = n.localToGlobal(new Laya.Point()), b = n.localToGlobal(new Laya.Point(n.width, n.height));
                        return { x: a.x, y: a.y, right: b.x, bottom: b.y };
                    };
                    const a = bounds(toggle), label = toggle.getChildAt(0);
                    const overlaps = ["expStorage", "expBuild", "expAbandon", "expUse"].filter(key => {
                        const n = panel.buttons[key], b = bounds(n);
                        return n.visible && a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y;
                    });
                    return { overlaps, inside: a.x >= 0 && a.y >= 0 && a.right <= Laya.stage.width &&
                        a.bottom <= Laya.stage.height, labelFits: label.textIns.textWidth <= label.width };
                });
                assert.deepEqual(placement.overlaps, []); assert.ok(placement.inside && placement.labelFits);
                const image = await p.screenshot({ path: path.join(output, `${name}-unblocked.png`) });
                assert.ok((await sharp(image).stats()).channels.slice(0, 3).every(c => c.stdev > 15), "Nonblank map");
                await click(p, "expEnemyBlocking");
                const relocked = await toggleState(p);
                assert.equal(relocked.selected, true); assert.deepEqual(relocked.enabledNeighbors, []);
                await p.screenshot({ path: path.join(output, `${name}-blocked.png`) });
                await click(p, "expEnemyBlocking");
                const back = enemy - 1;
                await click(p, `expNode${back}`);
                await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
                assert.equal((await toggleState(p)).node, back, "Real click leaves an undefeated enemy");
                assert.deepEqual(errors, []);
                console.log(`PASS enemy blocking ${name}: checkbox, movement lock, immediate unblock/relock, reload, real travel and layout`);
            } finally { await context.close(); }
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
