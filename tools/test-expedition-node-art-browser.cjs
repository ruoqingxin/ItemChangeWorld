const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const output = process.env.NODE_ART_OUTPUT || path.resolve(__dirname, "../bin/node-art-v2-browser");
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function click(p, key, touch) {
    const at = await p.evaluate(key => {
        const n = window.__skillBattlePreview.panel.buttons[key];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${key}`);
        const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
    }, key);
    if (touch) await p.touchscreen.tap(at.x, at.y);
    else await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(120);
    await ready(p);
    await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
}

async function shot(p, name) {
    await p.waitForTimeout(150);
    const bytes = await p.screenshot({ path: path.join(output, `${name}.png`) });
    const stats = await sharp(bytes).stats();
    assert.ok(stats.channels.slice(0, 3).every(c => c.stdev > 15), "Nonblank rendered canvas");
    const overflow = await p.evaluate(() => {
        const panel = window.__skillBattlePreview.panel, issues = [];
        for (const [key, n] of Object.entries({ ...panel.labels, ...panel.expeditionNodes })) {
            if (!(n instanceof Laya.GTextField) || !n.text) continue;
            let visible = true;
            for (let a = n; a; a = a.parent) if (!a.visible) visible = false;
            if (!visible) continue;
            n.textIns.typeset(true);
            if (n.textIns.textWidth > n.width + 3 || n.textIns.textHeight > n.height + 3) issues.push(key);
        }
        return issues;
    });
    assert.deepEqual(overflow, [], "Visible text fits");
}

async function checkLighting(p, name) {
    await p.waitForTimeout(200);
    await p.evaluate(() => {
        const shade = window.__skillBattlePreview.panel.elements.result;
        const command = shade.graphics.cmds.find(c => c.cmdID === Laya.DrawRectCmd.ID);
        const { x, y, width, height } = command;
        shade.graphics.clear();
        shade.graphics.drawRect(x, y, width, height, "rgba(12,14,14,0.36)");
    });
    await p.waitForTimeout(70);
    const before = await p.screenshot({ path: path.join(output, `${name}-lighting-before.png`) });
    await p.evaluate(() => window.__skillBattlePreview.panel.backdrop());
    await p.waitForTimeout(70);
    const after = await p.screenshot({ path: path.join(output, `${name}-lighting-after.png`) });
    const { width, height } = await sharp(after).metadata();
    const area = { left: Math.floor(width * 0.4), top: Math.floor(height * 0.72),
        width: Math.floor(width * 0.4), height: Math.floor(height * 0.08) };
    const mean = async (image, crop) => {
        const cropped = await sharp(image).extract(crop).png().toBuffer();
        const { channels } = await sharp(cropped).stats();
        return channels[0].mean * 0.2126 + channels[1].mean * 0.7152 + channels[2].mean * 0.0722;
    };
    const oldLight = await mean(before, area), newLight = await mean(after, area);
    assert.ok(newLight > oldLight * 1.25, `Map floor is visibly brighter: ${oldLight.toFixed(1)} -> ${newLight.toFixed(1)}`);
    const header = { left: 0, top: 0, width, height: Math.floor(height * 0.09) };
    assert.ok(await mean(after, header) < newLight * 0.8,
        "Header surfaces retain their dark text contrast");
    console.log(`PASS lighting ${name}: ground luminance ${oldLight.toFixed(1)} -> ${newLight.toFixed(1)}, header contrast retained.`);
}

(async () => {
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const p = await context.newPage(), errors = [], missing = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) missing.push([r.status(), r.url()]); });
            await p.addInitScript(() => { crypto.getRandomValues = a => { a.fill(1); return a; }; });
            await p.goto(url);
            await ready(p);
            await click(p, "invPrimary", touch);
            await click(p, "invPrimary", touch);
            while (await p.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(p, "warehouse0", touch);
                await click(p, "newRun", touch);
            }
            await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            await p.waitForFunction(() => {
                const { panel, trial } = window.__skillBattlePreview;
                return trial.inventory.map.present.filter(id => panel.buttons[`expNode${id}`].visible)
                    .every(id => [0, 2].every(i => panel.buttons[`expNode${id}`].getChildAt(i).texture?.width === 128));
            });
            await checkLighting(p, name);
            await shot(p, `${name}-birth`);
            await click(p, "expNode1", touch);
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.expeditionNodes.expContextBackground.visible),
                true, "Nonempty nodes still open their actions");
            await click(p, "expNode2", touch);
            assert.equal(await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                return trial.inventory.node === 2 && ["expContextBackground", "expContextIcon", "expContextTitle", "expUse"]
                    .every(key => !panel.expeditionNodes[key].visible) &&
                    panel.buttons.expNode2.getChildAt(0).visible && !panel.buttons.expNode2.getChildAt(2).visible;
            }), true, "Arriving at an empty node shows only its base and dismisses the previous action panel");
            await click(p, "expNode2", touch);
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.expeditionNodes.expContextBackground.visible),
                false, "Repeated empty-node clicks do not open a panel");
            await shot(p, `${name}-empty-node`);
            const enemy = await p.evaluate(() => {
                const s = window.__skillBattlePreview.trial.inventory;
                const adjacent = s.map.edges.flatMap(([a, b]) => a === s.node ? [b] : b === s.node ? [a] : []);
                return s.map.nodes.find(n => n.enemy && adjacent.includes(n.id))?.id;
            });
            assert.ok(enemy, "A neighboring enemy is available");
            await click(p, `expNode${enemy}`, touch);
            await p.waitForFunction(() => window.__skillBattlePreview.panel.expeditionNodes.expContextIcon.texture?.width === 128);
            assert.equal(await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                return panel.expeditionNodes.expContextBackground.visible && panel.buttons.expUse.mouseEnabled &&
                    panel.expeditionNodes.expContextIcon.src === panel.buttons[`expNode${trial.inventory.node}`].getChildAt(2).src;
            }), true, "Context uses the replaced artwork");
            await shot(p, `${name}-context`);
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                window.__artOriginalRevealed = [...trial.inventory.revealed];
                trial.save.state.revealed = [...trial.inventory.map.present];
                panel.refresh();
            });
            await p.waitForFunction(() => {
                const { panel, trial } = window.__skillBattlePreview;
                return trial.inventory.map.present.every(id => [0, 2].every(i =>
                    panel.buttons[`expNode${id}`].getChildAt(i).texture?.width === 128));
            });
            const layout = await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview, issues = [];
                for (const id of trial.inventory.map.present) {
                    const n = panel.buttons[`expNode${id}`], base = n.getChildAt(0), icon = n.getChildAt(2);
                    const data = trial.inventory.map.nodes.find(n => n.id === id), empty = data.kind === "transit";
                    const size = ({ normal: 104, elite: 144, boss: 192 })[data.kind] || 104;
                    if (!n.visible || n.alpha !== 1 || base.visible !== empty || icon.visible === empty)
                        issues.push(["hidden", id]);
                    if (!base.src.endsWith("/node-base.png") || base.grayed || icon.grayed) issues.push(["base", id]);
                    if (base.width !== 104 || icon.width !== size || icon.height !== size || n.width !== 116)
                        issues.push(["size", id]);
                    if (icon.x + icon.width / 2 !== 58 || icon.y !== -6-(size-104)*0.75) issues.push(["alignment", id]);
                    if (n.getChildAt(1).visible) issues.push(["node label", id]);
                }
                for (const [i, kind] of ["normal", "elite", "boss"].entries()) {
                    const icon = panel.expeditionNodes[`mapKillIcon${i}`];
                    if (!icon.visible || !icon.texture || !icon.src.endsWith(`node-enemy-${kind}.png`))
                        issues.push(["header", kind]);
                }
                const marker = panel.expeditionNodes.expPlayer;
                const ring = marker.getChildByName("expPlayerRing");
                const avatar = marker.getChildByName("expPlayerAvatar");
                if (!marker.visible || marker.mouseEnabled || marker.zOrder < 1 || ring?.visible ||
                    !avatar?.visible || avatar.mouseEnabled ||
                    !avatar.graphics.cmds.some(c => c.cmdID === Laya.DrawPolyCmd.ID)) issues.push("player avatar");
                const current = trial.inventory.map.nodes.find(n => n.id === trial.inventory.node);
                if (marker.x+58 !== 112+current.x*242 ||
                    marker.y+58 !== panel.mapBandTop+198+current.y*128) issues.push("player location");
                const lines = panel.expeditionNodes.expLines.graphics.cmds.filter(c => c.cmdID === Laya.DrawLineCmd.ID);
                if (!lines.length || lines.some(c => Math.hypot(c.toX - c.fromX, c.toY - c.fromY) > 12.01))
                    issues.push("dashed lines");
                if (lines.length % 2 || lines.some((c, i) => {
                    if (c.lineWidth !== (i % 2 ? 5 : 8)) return true;
                    if (!(i % 2)) return false;
                    const outline = lines[i-1];
                    return c.fromX !== outline.fromX || c.fromY !== outline.fromY ||
                        c.toX !== outline.toX || c.toY !== outline.toY;
                })) issues.push("route contrast outline");
                for (const [a, b] of trial.inventory.map.edges)
                    if (!panel.mapRoutes.get(`${a}:${b}`) || panel.mapRoutes.get(`${a}:${b}`).length < 4)
                        issues.push(["missing route", a, b]);
                for (const data of trial.inventory.map.nodes.filter(n => n.enemy)) {
                    const n = panel.buttons[`expNode${data.id}`], x = n.x + 58, y = n.y + 52;
                    const icon = n.getChildAt(2), halfWidth = Math.max(54, icon.width/2-4);
                    const above = Math.max(54, 30-icon.y);
                    if (lines.some(c => {
                        let low = 0, high = 1;
                        for (const [start, delta, min, max] of [
                            [c.fromX, c.toX - c.fromX, x - halfWidth, x + halfWidth],
                            [c.fromY, c.toY - c.fromY, y - above, y + 54],
                        ]) {
                            if (!delta) { if (start <= min || start >= max) return false; }
                            else {
                                const a = (min - start) / delta, b = (max - start) / delta;
                                low = Math.max(low, Math.min(a, b)); high = Math.min(high, Math.max(a, b));
                            }
                        }
                        return low < high;
                    })) issues.push(["route intersects enlarged enemy", data.id]);
                }
                return { issues, total: trial.inventory.map.present.length,
                    dynamic: trial.inventory.map.present.filter(id => id > 32).length };
            });
            assert.deepEqual(layout.issues, []);
            assert.ok(layout.dynamic > 0, "Also check dynamically created node widgets");
            // Display-only fixtures do not issue commands or persist modified gameplay state.
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                window.__artFixture = { enemies: trial.inventory.map.nodes.filter(n => n.enemy),
                    cleared: [...trial.inventory.map.cleared], sources: [...trial.inventory.map.sources] };
                for (const enemy of window.__artFixture.enemies) {
                    trial.save.state.map.cleared.push(enemy.id);
                    trial.save.state.map.sources.push({ node: enemy.id, entries: [{}], revealed: 0 });
                }
                panel.refresh();
            });
            await p.waitForFunction(() => {
                const { panel } = window.__skillBattlePreview;
                return window.__artFixture.enemies.every(enemy => {
                    const icon = panel.buttons[`expNode${enemy.id}`].getChildAt(2);
                    return icon.src.endsWith(`/node-enemy-${enemy.kind}.png`) && icon.texture?.width === 128 &&
                        icon.width === ({ normal: 104, elite: 144, boss: 192 })[enemy.kind] &&
                        !panel.buttons[`expNode${enemy.id}`].getChildAt(0).visible &&
                        !icon.grayed && icon.filters?.length === 1 && icon.alpha === 1;
                });
            });
            assert.equal(await p.evaluate(() => {
                const { panel } = window.__skillBattlePreview;
                const icon = panel.expeditionNodes.expContextIcon;
                return panel.expeditionNodes.expContextBackground.visible &&
                    icon.src.includes("/node-enemy-") && !icon.grayed && icon.filters?.length === 1 &&
                    panel.buttons.expUse.mouseEnabled && panel.buttons.expUse.getChildAt(1).text === "搜索";
            }), true, "Defeated enemies keep their original icon and their searchable source action");
            await shot(p, `${name}-defeated-enemies`);
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                for (const box of trial.save.state.map.sources) box.entries = [];
                panel.refresh();
            });
            assert.equal(await p.evaluate(() => {
                const { panel } = window.__skillBattlePreview;
                return window.__artFixture.enemies.every(enemy => {
                    const n = panel.buttons[`expNode${enemy.id}`], icon = n.getChildAt(2);
                    return icon.src.endsWith(`/node-enemy-${enemy.kind}.png`) &&
                        icon.width === ({ normal: 104, elite: 144, boss: 192 })[enemy.kind] &&
                        !n.getChildAt(0).visible && icon.grayed && !icon.filters;
                });
            }), true, "Search completion keeps the original enlarged enemies and applies full grayscale");
            await shot(p, `${name}-searched-enemies`);
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview, original = window.__artFixture;
                trial.save.state.map.cleared = original.cleared;
                trial.save.state.map.sources = original.sources;
                delete window.__artFixture;
                panel.selectedNode = null;
                panel.refresh();
                const boss = trial.inventory.map.nodes.find(n => n.kind === "boss");
                const n = panel.buttons[`expNode${boss.id}`];
                panel.scroller.posX = Math.min(panel.scroller.contentWidth - panel.scroller.viewWidth,
                    Math.max(0, n.x - panel.scroller.viewWidth * 0.4));
            });
            await shot(p, `${name}-boss`);
            assert.equal(await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                return trial.inventory.map.nodes.filter(n => n.enemy).every(enemy => {
                    const icon = panel.buttons[`expNode${enemy.id}`].getChildAt(2);
                    return !icon.grayed && !icon.filters &&
                        icon.width === ({ normal: 104, elite: 144, boss: 192 })[enemy.kind];
                });
            }), true, "A normal refresh restores undefeated enemies without stale gray filters");
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                trial.save.state.revealed = window.__artOriginalRevealed;
                delete window.__artOriginalRevealed;
                panel.refresh();
            });
            assert.deepEqual(errors, []);
            assert.deepEqual(missing, []);
            await context.close();
            console.log(`PASS node art ${name}: ${layout.total} nodes, 104/144/192 enemy tiers, bases only on empty nodes, player avatar/no ring, original defeated icons, search actions and route clearance.`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
