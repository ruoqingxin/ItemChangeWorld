const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18128";
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function point(p, name) {
    return p.evaluate(name => {
        const v = window.__skillBattlePreview, n = v.panel.buttons[name];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${name}`);
        const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
    }, name);
}

async function click(p, name, settle = true) {
    const at = await point(p, name);
    if (p.touchMode) await p.touchscreen.tap(at.x, at.y);
    else await p.mouse.click(at.x, at.y);
    if (settle) { await p.waitForTimeout(120); await ready(p); }
}

async function move(p, target, expectedShown) {
    await p.evaluate(() => {
        const panel = window.__skillBattlePreview.panel;
        const sources = [], frames = [], skins = ["expStorage", "expBuild"].map(key => panel.buttons[key].getChildAt(0));
        const descriptor = Object.getOwnPropertyDescriptor(Laya.GImage.prototype, "src");
        for (const skin of skins) Object.defineProperty(skin, "src", {
            configurable: true,
            get() { return descriptor.get.call(this); },
            set(value) { sources.push(value); descriptor.set.call(this, value); },
        });
        window.__movementCheck = { sources, frames, done: false };
        const started = performance.now();
        const sample = () => {
            const moving = !!panel.movement;
            frames.push({
                moving,
                controls: ["expStorage", "expBuild"].map(key => {
                    const n = panel.buttons[key], skin = n.getChildAt(0);
                    return { src: skin.src, visible: n.visible, enabled: n.mouseEnabled, alpha: n.alpha,
                        texture: !!skin.texture,
                        nineSlice: skin.graphics.cmds.some(c => c.cmdID === Laya.Draw9GridTextureCmd.ID) };
                }),
                actionVisible: panel.buttons.expUse.visible,
            });
            if (performance.now() - started < 1400) requestAnimationFrame(sample);
            else {
                for (const skin of skins) delete skin.src;
                window.__movementCheck.done = true;
            }
        };
        requestAnimationFrame(sample);
    });
    await click(p, `expNode${target}`, false);
    await p.waitForFunction(() => !!window.__skillBattlePreview.panel.movement);
    await p.evaluate(() => {
        const { panel, trial } = window.__skillBattlePreview, node = trial.inventory.node;
        for (const key of ["expStorage", "expBuild", "expUse", "expNode1", "expNode2"]) panel.command(key);
        if (panel.pageRole !== "map" || trial.inventory.node !== node || trial.inventory.flow.phase !== "ready")
            throw Error("Movement must still lock inventory, build, node actions and repeated travel");
    });
    await p.waitForFunction(() => window.__movementCheck.done);
    const result = await p.evaluate(() => {
        const { panel, trial } = window.__skillBattlePreview;
        return { ...window.__movementCheck, node: trial.inventory.node,
            shown: trial.inventory.map.present.filter(id => panel.buttons[`expNode${id}`].visible),
            actionVisible: panel.buttons.expUse.visible };
    });
    assert.ok(result.frames.some(f => f.moving), "Sample the animation, not just its settled state");
    assert.ok(result.frames.some(f => !f.moving), "Also sample the arrival refresh");
    assert.ok(result.sources.every(src => src && src.endsWith("button-normal-64x48.png")),
        `Moving must not clear or dim toolbar skins: ${JSON.stringify([...new Set(result.sources)])}`);
    for (const frame of result.frames) {
        for (const control of frame.controls) {
            assert.ok(control.visible && control.texture && control.nineSlice && control.alpha === 1,
                "Toolbar stays visible, opaque and textured on every sampled frame");
            assert.ok(control.src.endsWith("button-normal-64x48.png"), "Toolbar appearance remains steady while moving");
            assert.equal(control.enabled, !frame.moving, "Temporary input lock remains intact");
        }
        if (frame.moving) assert.equal(frame.actionVisible, false, "Node actions remain hidden until arrival");
    }
    assert.equal(result.node, target);
    assert.deepEqual(result.shown, expectedShown, "Every generated node remains displayed while moving and retreating");
    assert.equal(result.actionVisible, true, "Node actions return on arrival");
}

(async () => {
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [["desktop", 1280, 720, false], ["wide", 1560, 720, false],
            ["mobile", 844, 390, true]]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
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
            const present=await p.evaluate(()=>[...window.__skillBattlePreview.trial.inventory.map.present]);
            for (const target of [2, 1, 2, 1]) await move(p, target, present);
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                trial.save.state.map.used.push(trial.inventory.node);
                panel.refresh();
                const n = panel.buttons.expUse;
                if (n.mouseEnabled || !n.getChildAt(0).src.endsWith("button-disabled-64x48.png"))
                    throw Error("Persistently unavailable actions must still look disabled");
            });
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS map movement UI ${name}: stable skins frame-by-frame, input locks and full-map display preserved`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
