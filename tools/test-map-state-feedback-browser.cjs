const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const output = path.resolve(__dirname, "../tmp/map-feedback");
const key = "nowchange.stage4-expedition.v1";
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function point(p, name) {
    return p.evaluate(name => {
        const preview = window.__skillBattlePreview;
        const node = preview.ui.topView.getElement(name, false) || preview.panel.buttons[name];
        if (!node?.visible || !node.mouseEnabled) throw Error(`Unavailable ${name}`);
        const at = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        return { x: canvas.left + at.x * canvas.width / Laya.stage.width,
            y: canvas.top + at.y * canvas.height / Laya.stage.height };
    }, name);
}
async function click(p, name, touch) {
    const at = await point(p, name);
    if (touch) await p.touchscreen.tap(at.x, at.y);
    else await p.mouse.click(at.x, at.y);
    await p.waitForTimeout(100);
    await ready(p);
    await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
}
async function screenshot(p, name) {
    await p.waitForTimeout(120);
    const issues = await p.evaluate(() => {
        const issues = [], scan = node => {
            if (!node.visible) return;
            if (node instanceof Laya.GTextField && node.text) {
                node.textIns.typeset(true);
                if (node.textIns.textWidth > node.width + 3 || node.textIns.textHeight > node.height + 3)
                    issues.push(node.name || node.text);
            }
            for (let i = 0; i < node.numChildren; i++) scan(node.getChildAt(i));
        };
        scan(window.__skillBattlePreview.view.view);
        return issues;
    });
    assert.deepEqual(issues, [], "State labels and badges fit their unchanged bounds");
    const image = await p.screenshot({ path: path.join(output, `${name}.png`) });
    assert.ok((await sharp(image).stats()).channels.slice(0, 3).every(c => c.stdev > 15), "Nonblank canvas");
}
async function fixture(p, kind) {
    return p.evaluate(kind => {
        const { panel, trial } = window.__skillBattlePreview;
        trial.data.save.state = structuredClone(window.__feedbackOriginal);
        const s = trial.data.save.state, c = trial.archive.config;
        const nodeKind = kind.startsWith("enemy-") ? kind.slice(6) :
            kind.startsWith("source-") ? "search" : kind.startsWith("recovery-") ? "recovery" :
            kind === "used" ? "borrow" : "extract";
        const n = s.map.nodes.find(n => n.kind === nodeKind);
        if (!n) throw Error(`No fixture node: ${nodeKind}`);
        s.node = n.id; s.revealed = [...s.map.present];
        if (kind.startsWith("enemy-")) {
            const cost = n.kind === "boss" ? c.rules.bossCost : n.kind === "elite" ? c.rules.eliteCost : c.rules.normalCost;
            s.stamina = cost - 1;
        } else if (kind.startsWith("source-")) {
            const entry = structuredClone(s.items[0]);
            entry.uid = "feedback-known-item"; entry.location = { space: "source", node: n.id, x: 0, y: 0 };
            const complete = ["source-complete", "source-empty"].includes(kind);
            s.map.sources = [{ node: n.id, entries: [entry], opened: kind !== "source-new",
                revealed: complete ? 1 : 0, progressMs: 0 }];
            if (kind === "source-complete") s.items.push(entry);
        } else if (kind === "used") s.map.used.push(n.id);
        else if (kind === "recovery-full") {
            s.hp = c.build.setup.player.maxHp; s.mp = c.build.setup.player.maxMp;
        } else if (kind === "recovery-ready") {
            s.hp = c.build.setup.player.maxHp / 2; s.mp = c.build.setup.player.maxMp / 2;
        }
        const before = JSON.stringify(s);
        panel.notice = ""; panel.selectedNode = n.id; panel.centerMap = true; panel.refresh();
        const button = panel.buttons[`expNode${n.id}`], badge = button.getChildByName("expDone");
        const passive = node => !node.mouseEnabled &&
            Array.from({ length: node.numChildren }, (_, i) => node.getChildAt(i)).every(passive);
        const text = node => {
            let result = node instanceof Laya.GTextField ? node.text : "";
            for (let i = 0; i < node.numChildren; i++) result += text(node.getChildAt(i));
            return result;
        };
        return {
            status: panel.labels.expContextStatus.text, action: panel.buttons.expUse.getChildAt(1).text,
            enabled: panel.buttons.expUse.mouseEnabled, skin: panel.buttons.expUse.getChildAt(0).src,
            done: badge.visible, check: text(badge), passive: passive(badge),
            gray: button.getChildAt(2).grayed, opaque: button.alpha === 1 && button.getChildAt(2).alpha === 1,
            hints: s.map.present.some(id => panel.buttons[`expNode${id}`].visible &&
                panel.buttons[`expNode${id}`].getChildByName("expReachHint").visible),
            unchanged: before === JSON.stringify(trial.data.save.state),
        };
    }, kind);
}

(async () => {
    await fs.mkdir(output, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [
            ["desktop", 1280, 720, false], ["wide", 1560, 720, false], ["mobile", 844, 390, true],
        ]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const p = await context.newPage(), errors = [], missing = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) missing.push(r.url()); });
            await p.addInitScript(() => { crypto.getRandomValues = a => { a.fill(1); return a; }; });
            await p.goto(url); await ready(p);
            await click(p, "invPrimary", touch); await click(p, "invPrimary", touch);
            while (await p.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(p, "warehouse0", touch); await click(p, "newRun", touch);
            }
            await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            const saved = await p.evaluate(key => localStorage.getItem(key), key);
            const initial = await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                const marker = panel.expeditionNodes.expPlayer, ring = marker.getChildByName("expPlayerRing");
                const hint = panel.buttons.expNode2.getChildByName("expReachHint");
                window.__feedbackLayout = [marker.width, marker.height,
                    ...["mapHeaderArea", "mapPlayerArea", "mapActionsArea"].flatMap(name => {
                        const n = panel.mapAreas[name]; return [n.x, n.y, n.width, n.height];
                    })];
                return { ringAlpha: ring.alpha, currentHasHint: panel.buttons[`expNode${trial.inventory.node}`]
                    .getChildByName("expReachHint").visible, reachable: hint.visible && !!hint.filters?.length,
                    passive: !hint.mouseEnabled && !ring.mouseEnabled };
            });
            assert.ok(initial.reachable && initial.passive && !initial.currentHasHint);
            await p.waitForFunction(alpha => {
                const ring = window.__skillBattlePreview.panel.expeditionNodes.expPlayer.getChildByName("expPlayerRing");
                return Math.abs(ring.alpha - alpha) > 0.04;
            }, initial.ringAlpha);
            await p.emulateMedia({ reducedMotion: "reduce" }); await p.waitForTimeout(120);
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.expeditionNodes.expPlayer
                .getChildByName("expPlayerRing").alpha), 0.95, "Reduced-motion preference disables the pulse");
            await p.emulateMedia({ reducedMotion: "no-preference" });
            if (!touch) {
                const at = await point(p, "expNode2");
                await p.mouse.move(at.x, at.y); await p.waitForTimeout(40);
                assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode2
                    .getChildByName("expReachHint").alpha), 1, "Hover emphasizes only the reachable hint");
                await p.mouse.down(); await p.waitForTimeout(40);
                assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode2
                    .getChildByName("expReachHint").alpha), 0.6, "Press has feedback without resizing the node");
                await p.mouse.move(width / 2, height - 25); await p.mouse.up();
                assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode2
                    .getChildByName("expReachHint").alpha), 0.82);
            }
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), saved,
                "Hover, press cancellation and the idle pulse never save");
            await screenshot(p, `${name}-reachable`);
            await click(p, "expNode2", touch); await click(p, "expNode3", touch);
            await screenshot(p, `${name}-enemy`);
            const arrived = await p.evaluate(key => {
                const { panel, trial } = window.__skillBattlePreview;
                window.__feedbackOriginal = structuredClone(trial.data.save.state);
                return { saved: localStorage.getItem(key), phase: trial.inventory.flow.phase,
                    status: panel.labels.expContextStatus.text };
            }, key);
            assert.equal(arrived.phase, "ready", "Arrival never starts combat");
            assert.match(arrived.status, /阻路.*体力/);
            for (const kind of ["enemy-normal", "enemy-elite", "enemy-boss", "source-new", "source-paused",
                "source-complete", "source-empty", "used", "recovery-full", "recovery-ready", "extract"]) {
                const state = await fixture(p, kind);
                assert.ok(state.unchanged && state.passive && state.opaque, `${kind}: passive display, original node opacity`);
                if (kind.startsWith("enemy-")) {
                    assert.equal(state.enabled, false); assert.ok(state.skin.endsWith("/map-button-disabled.png"));
                    assert.match(state.status, /体力不足/); assert.equal(state.hints, false);
                } else if (kind === "source-new") {
                    assert.equal(state.status, "尚未搜索"); assert.equal(state.action, "搜索");
                } else if (kind === "source-paused") {
                    assert.equal(state.status, "搜索已暂停"); assert.equal(state.action, "查看来源");
                } else if (kind === "source-complete") {
                    assert.equal(state.status, "已搜完 · 有物品"); assert.equal(state.action, "查看物品");
                } else if (kind === "source-empty") assert.equal(state.status, "已搜索完毕");
                else if (kind === "used") {
                    assert.equal(state.enabled, false); assert.equal(state.status, "已使用");
                } else if (kind === "recovery-full") {
                    assert.equal(state.enabled, false); assert.equal(state.status, "生命灵力已满");
                } else if (kind === "recovery-ready") {
                    assert.ok(state.enabled); assert.match(state.status, /生命\+.*灵力\+/);
                } else {
                    assert.equal(state.action, "安全撤离"); assert.ok(state.enabled);
                }
                const complete = ["source-complete", "source-empty"].includes(kind);
                assert.equal(state.done, complete || kind === "used", `${kind}: completion badge uses committed flags`);
                assert.equal(state.gray, complete, `${kind}: only a completed source becomes gray`);
                if (state.done) assert.equal(state.check, "\u2713");
                if (!touch || ["source-complete", "recovery-ready", "enemy-boss"].includes(kind))
                    await screenshot(p, `${name}-${kind}`);
            }
            await click(p, "expUse", touch);
            assert.ok(await p.evaluate(() => window.__skillBattlePreview.panel.modalOpen), "Extraction still requires confirmation");
            await click(p, "dialogCancel", touch);
            await fixture(p, "recovery-ready");
            const failed = await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview, command = trial.mapCommand;
                const before = JSON.stringify(trial.data.save.state);
                try {
                    trial.mapCommand = () => { throw Error("feedback-test: save failed"); };
                    panel.command("expUse");
                    return { notice: panel.notice, unchanged: before === JSON.stringify(trial.data.save.state) };
                } finally { trial.mapCommand = command; }
            });
            assert.equal(failed.notice, "feedback-test: save failed");
            assert.ok(failed.unchanged, "A failed recovery never displays a success or consumes its opportunity");
            const recovered = await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview, command = trial.mapCommand;
                const before = trial.inventory;
                try {
                    // Use the real rules' preview result without persisting this display fixture.
                    trial.mapCommand = value => {
                        const result = trial.previewMove(value);
                        trial.data.save.state = result.state;
                        return result;
                    };
                    panel.command("expUse");
                    const after = trial.inventory;
                    const format = n => (n / 100).toFixed(2).replace(/\.?0+$/, "");
                    return { notice: panel.notice,
                        expected: `生命 +${format(after.hp-before.hp)} · 灵力 +${format(after.mp-before.mp)}`,
                        used: after.map.used.includes(after.node),
                        enabled: panel.buttons.expUse.mouseEnabled,
                        done: panel.buttons[`expNode${after.node}`].getChildByName("expDone").visible };
                } finally { trial.mapCommand = command; }
            });
            assert.equal(recovered.notice, recovered.expected, "Recovery success reports only the actual committed deltas");
            assert.ok(recovered.used && recovered.done && !recovered.enabled);
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), arrived.saved, "Display fixtures and cancelled extraction never save");
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                trial.data.save.state = window.__feedbackOriginal; delete window.__feedbackOriginal;
                panel.notice = ""; panel.selectedNode = trial.inventory.node; panel.centerMap = true; panel.refresh();
                const marker = panel.expeditionNodes.expPlayer;
                const layout = [marker.width, marker.height,
                    ...["mapHeaderArea", "mapPlayerArea", "mapActionsArea"].flatMap(name => {
                        const n = panel.mapAreas[name]; return [n.x, n.y, n.width, n.height];
                    })];
                if (JSON.stringify(layout) !== JSON.stringify(window.__feedbackLayout)) throw Error("Approved layout changed");
                window.__feedbackMap = panel;
            });
            await click(p, "expStorage", touch);
            const pausedAlpha = await p.evaluate(() => window.__feedbackMap.expeditionNodes.expPlayer
                .getChildByName("expPlayerRing").alpha);
            await p.waitForTimeout(180);
            assert.ok(await p.evaluate(alpha => !window.__feedbackMap.opened &&
                window.__feedbackMap.expeditionNodes.expPlayer.getChildByName("expPlayerRing").alpha === alpha,
            pausedAlpha), "Leaving the map stops its display animation");
            await click(p, "invToggle", touch);
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), arrived.saved,
                "Returning to the map does not add an action or replay any feedback");
            assert.deepEqual(errors, []); assert.deepEqual(missing, []);
            await context.close();
            console.log(`PASS map feedback ${name}: reachable/pressed/current/completed states, reduced motion, all enemy costs, paused/complete sources, recovery, extraction confirmation, unchanged layout and no display-only saves.`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
