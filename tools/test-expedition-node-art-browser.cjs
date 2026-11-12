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
    const clock = await p.evaluate(() => {
        const label = window.__skillBattlePreview.panel.labels.expClock;
        const a = label.localToGlobal(new Laya.Point(0, 0));
        const b = label.localToGlobal(new Laya.Point(label.width, label.height));
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        label.visible = false;
        return {
            left: Math.ceil(canvas.left + a.x * canvas.width / Laya.stage.width),
            top: Math.ceil(canvas.top + a.y * canvas.height / Laya.stage.height),
            width: Math.floor((b.x - a.x) * canvas.width / Laya.stage.width),
            height: Math.floor((b.y - a.y) * canvas.height / Laya.stage.height),
            color: label.color,
        };
    });
    let background;
    try {
        await p.waitForTimeout(70);
        background = await sharp(await p.screenshot()).extract({
            left: clock.left, top: clock.top, width: clock.width, height: clock.height,
        }).stats();
    } finally {
        await p.evaluate(() => { window.__skillBattlePreview.panel.labels.expClock.visible = true; });
    }
    const luminance = rgb => rgb.map(value => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const ink = luminance(clock.color.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16)));
    const surface = luminance(background.channels.slice(0, 3).map(channel => channel.mean));
    const contrast = (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
    assert.ok(contrast >= 4.5, `Header text contrast is readable: ${contrast.toFixed(2)}:1`);
    console.log(`PASS lighting ${name}: ground luminance ${oldLight.toFixed(1)} -> ${newLight.toFixed(1)}, header text contrast ${contrast.toFixed(2)}:1.`);
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
                trial.data.save.state.revealed = [...trial.inventory.map.present];
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
                    if (!base.src.endsWith("/map-transit-stone.png") || base.grayed || icon.grayed) issues.push(["base", id]);
                    if (base.width !== 104 || icon.width !== size || icon.height !== size || n.width !== 116)
                        issues.push(["size", id]);
                    const art=icon.src.match(/node-(.+)\.png$/)[1];
                    const feet={"enemy-normal":114,"enemy-elite":115,"enemy-boss":103,
                        start:123,extract:113,recovery:105,search:105,supply:119,borrow:118,insight:119};
                    if (icon.x + icon.width / 2 !== 58 ||
                        Math.abs(icon.y+(feet[art]||128)*size/128-96)>0.001) issues.push(["alignment", id]);
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
                if (!marker.visible || marker.mouseEnabled || marker.zOrder < 1 || !ring?.visible ||
                    ring.width!==76 || ring.height!==18 ||
                    !avatar?.visible || avatar.mouseEnabled ||
                    !avatar.texture || !avatar.src.endsWith("/map-player-traveler.png")) issues.push("player avatar");
                const current = trial.inventory.map.nodes.find(n => n.id === trial.inventory.node);
                const currentButton = panel.buttons[`expNode${current.id}`];
                if (marker.x+58 !== 112+current.x*242 ||
                    marker.y+58 !== currentButton.y+52) issues.push("player location");
                const strokes = panel.expeditionNodes.expLines.graphics.cmds.filter(c => c.cmdID === Laya.DrawTextureCmd.ID);
                const lines = strokes.map(c => ({ fromX:c.matrix.tx,fromY:c.matrix.ty,
                    toX:c.matrix.tx+c.matrix.a*c.width/1.6,toY:c.matrix.ty+c.matrix.b*c.width/1.6 }));
                if (!lines.length || lines.some(c => Math.hypot(c.toX - c.fromX, c.toY - c.fromY) > 12.01))
                    issues.push("dashed lines");
                if (strokes.some(c => c.texture !== panel.expeditionNodes.mapRouteTexture.texture || ![6,7].includes(c.height)))
                    issues.push("handpainted route texture");
                for (const [a, b] of trial.inventory.map.edges) {
                    const route = panel.mapRoutes.get(`${a}:${b}`);
                    const start = panel.buttons[`expNode${a}`], end = panel.buttons[`expNode${b}`];
                    if (!route || route.length !== 2 ||
                        route[0].x !== start.x+58 || route[0].y !== start.y+52 ||
                        route[1].x !== end.x+58 || route[1].y !== end.y+52)
                        issues.push(["missing route", a, b]);
                }
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
                    trial.data.save.state.map.cleared.push(enemy.id);
                    trial.data.save.state.map.sources.push({ node: enemy.id, entries: [{}], revealed: 0 });
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
                for (const box of trial.data.save.state.map.sources) box.entries = [];
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
                trial.data.save.state.map.cleared = original.cleared;
                trial.data.save.state.map.sources = original.sources;
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
                trial.data.save.state.revealed = window.__artOriginalRevealed;
                delete window.__artOriginalRevealed;
                panel.refresh();
            });
            assert.deepEqual(errors, []);
            assert.deepEqual(missing, []);
            await context.close();
            console.log(`PASS node art ${name}: ${layout.total} nodes, 104/144/192 enemy tiers, bases only on empty nodes, player avatar/foot locator, original defeated icons, search actions and route clearance.`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
