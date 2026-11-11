const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18126";
const out = path.resolve(__dirname, "../tmp/viewport-browser");
const saveKey = "nowchange.stage4-expedition.v1";
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened);

async function click(p, name) {
    const point = await p.evaluate(name => {
        const v = window.__skillBattlePreview;
        const node = v.ui.topView.getElement(name, false) || v.panel.buttons[name];
        if (!node?.visible || !node.mouseEnabled) throw Error(`Unavailable ${name}`);
        const a = node.localToGlobal(new Laya.Point(node.width / 2, node.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
    }, name);
    await p.mouse.click(point.x, point.y);
    await p.waitForTimeout(120);
    await ready(p);
}

async function inspect(p, name, popup = false) {
    await p.waitForTimeout(150);
    const layout = await p.evaluate(popup => {
        const v = window.__skillBattlePreview, view = v.view.view;
        const adapter = view.getChildByName("adapter");
        const image = v.view.getElement("screenBackground", false);
        const repeat = image.graphics.cmds.find(c => c.cmdID === Laya.FillTextureCmd.ID);
        const stage = Laya.stage;
        const bounds = n => {
            const a = n.localToGlobal(new Laya.Point(0, 0));
            const b = n.localToGlobal(new Laya.Point(n.width, n.height));
            return [a.x, a.y, b.x, b.y];
        };
        const shownText = [];
        const scan = node => {
            if (!node.visible) return;
            if (node instanceof Laya.GTextField && node.text) {
                node.textIns.typeset(true);
                if (!node.textIns.visible || node.textIns.textWidth > node.width + 3 ||
                    node.textIns.textHeight > node.height + 3) shownText.push(node.name);
            }
            for (let i = 0; i < node.numChildren; i++) scan(node.getChildAt(i));
        };
        scan(view);
        if (popup) scan(v.ui.topView.view);
        const modalAdapter = popup && v.ui.topView.view.getChildByName("adapter");
        const dialog = popup && v.ui.topView.getElement("dialogArea", false);
        const regions = {};
        for (const name of ["inventoryRoot", "carryArea", "bagArea", "sourceArea", "headerArea", "actionsArea",
            "expeditionRoot", "mapHeaderArea", "expViewport", "nodeActionArea", "mapActionsArea",
            "expClock", "expUse", "expAbandon"]) {
            const node = v.view.getElement(name, false);
            if (node) regions[name] = bounds(node);
        }
        const tint = v.view.getElement("result", false);
        const rect = tint.graphics.cmds.find(c => c.cmdID === Laya.DrawRectCmd.ID);
        const tintStart = tint.localToGlobal(new Laya.Point(rect.x, rect.y));
        const shadeBands = tint.graphics.cmds.filter(c => c.cmdID === Laya.DrawRectCmd.ID).slice(1).map(c => {
            const a = tint.localToGlobal(new Laya.Point(c.x, c.y));
            return [a.x, a.y, c.width, c.height];
        });
        const background = repeat ? (() => {
            const a = image.localToGlobal(new Laya.Point(repeat.x, repeat.y));
            return [a.x, a.y, a.x + repeat.width, a.y + repeat.height];
        })() : bounds(image);
        return {
            stage: [stage.width, stage.height], root: [v.ui.uiRoot.width, v.ui.uiRoot.height],
            page: [view.width, view.height], offset: [adapter.x, adapter.y],
            adapter: [adapter.width, adapter.height, adapter.scaleX, adapter.scaleY],
            relations: adapter.relations.map(r => ({ target: r.target === view, data: r.data })),
            regions,
            background, backgroundScale: [image.scaleX, image.scaleY],
            imageReady: !!(repeat?.texture || image.texture)?.width, masks: v.ui.isAdapterMaskActive,
            tint: [tintStart.x, tintStart.y, rect.width, rect.height],
            shadeBands, actionVisible: v.view.getElement("expUse", false)?.visible || false,
            modal: modalAdapter && [modalAdapter.x, modalAdapter.y, modalAdapter.width, modalAdapter.height],
            dialog: dialog && bounds(dialog),
            mask: [v.ui._mask.width, v.ui._mask.height],
            shownText, mode: stage.scaleMode,
        };
    }, popup);
    const [w, h] = layout.stage;
    assert.equal(layout.mode, "fixedauto");
    assert.deepEqual(layout.root, [w, h]);
    assert.deepEqual(layout.page, [w, h]);
    assert.deepEqual(layout.adapter, [w, h, 1, 1]);
    assert.deepEqual(layout.offset, [0, 0]);
    assert.deepEqual(layout.relations, [{ target: true, data: [1, 0, 2, 0] }],
        "Authored Width/Height relations survive enabling and resizing");
    const r = layout.regions, dy = (h - 720) / 2;
    if (r.inventoryRoot) {
        assert.deepEqual(r.inventoryRoot, [0, 0, w, h]);
        assert.deepEqual(r.carryArea, [16, 72 + dy, 310, 596 + dy]);
        assert.deepEqual(r.bagArea, [318 + (w-1280)/2, 76 + dy, 778 + (w-1280)/2, 596 + dy]);
        assert.deepEqual(r.sourceArea, [w-496, 72 + dy, w-16, 596 + dy]);
        assert.deepEqual(r.headerArea, [16, 8, w-16, 64]);
        assert.deepEqual(r.actionsArea, [24, h-80, w-40, h-26]);
    }
    if (r.expeditionRoot) {
        assert.deepEqual(r.expeditionRoot, [0, 0, w, h]);
        assert.deepEqual(r.expViewport, [0, 0, w, h]);
        assert.deepEqual(r.nodeActionArea, [w-280, 192 + dy, w-32, 474 + dy]);
        assert.deepEqual(r.mapActionsArea, [32, h-172, w-32, h-32]);
        assert.deepEqual(r.expClock, [w-200, 32, w-34, 68]);
        assert.deepEqual(r.expAbandon, [w-204, h-92, w-32, h-32]);
        if (layout.actionVisible) assert.deepEqual(r.expUse, [w-260, 390 + dy, w-52, 466 + dy],
            "The rendered node action follows its native right/middle region");
        if (layout.shadeBands.length) assert.deepEqual(layout.shadeBands, [[0, 0, w, 108], [0, h-178, w, 178]],
            "Map shading follows the actual header/footer rather than fixed design coordinates");
    }
    assert.equal(layout.masks, false);
    assert.deepEqual(layout.tint, [0, 0, w, h], "Backdrop shading covers the whole viewport without bright side strips");
    assert.deepEqual(layout.mask, [w, h], "Popup mask covers the whole viewport");
    assert.equal(layout.imageReady, true);
    assert.equal(layout.backgroundScale[0], layout.backgroundScale[1], "Uniform background scale");
    const [left, top, right, bottom] = layout.background;
    assert.ok(left <= 0.01 && top <= 0.01 && right >= w - 0.01 && bottom >= h - 0.01, "Background covers viewport");
    assert.ok(Math.abs((left + right) / 2 - w / 2) < 0.01 &&
        Math.abs((top + bottom) / 2 - h / 2) < 0.01, "Background stays centered");
    assert.deepEqual(layout.shownText, []);
    if (popup) {
        assert.deepEqual(layout.modal, [0, 0, w, h]);
        assert.deepEqual(layout.dialog, [(w-640)/2, (h-360)/2, (w+640)/2, (h+360)/2]);
    }
    const pixels = await p.screenshot({ path: path.join(out, `${name}.png`) });
    const metadata = await sharp(pixels).metadata();
    assert.ok((await sharp(pixels).stats()).channels.slice(0, 3).some(c => c.stdev > 12), "Nonblank canvas");
    if (!popup && w > 1281) {
        const strip = Math.max(2, Math.floor(metadata.width * (w - 1280) / w / 4));
        for (const x of [0, metadata.width - strip]) {
            const stats = await sharp(pixels).extract({ left: x, top: 0, width: strip, height: metadata.height }).stats();
            assert.ok(stats.channels.slice(0, 3).some(c => c.stdev > 0.1), "Background pixels extend into both former side margins");
        }
    }
    return layout;
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        const p = await browser.newPage({ viewport: { width: 1560, height: 720 } });
        const errors = [], failed = [];
        p.on("pageerror", e => errors.push(e.message));
        p.on("response", r => { if (r.status() >= 400) failed.push(r.url()); });
        await p.addInitScript(() => {
            localStorage.setItem("other-app", "keep");
            crypto.getRandomValues = a => { a.fill(1); return a; };
        });
        await p.goto(url); await ready(p);
        await click(p, "invPrimary");
        const preparation = await p.evaluate(key => localStorage.getItem(key), saveKey);
        const results = [];
        for (const [w, h] of [[1560,720],[1280,720],[2560,1080],[1024,768],[844,390],[390,844],[1560,720]]) {
            await p.setViewportSize({ width: w, height: h });
            results.push(await inspect(p, `preparation-${w}x${h}`));
            assert.equal(await p.evaluate(key => localStorage.getItem(key), saveKey), preparation, "Resize must not write a save");
        }
        assert.deepEqual(results[0], results.at(-1), "No layout drift after repeated resizing and orientation changes");
        const heldPoint = await p.evaluate(() => {
            const n = window.__skillBattlePreview.panel.nodes.invItem0;
            const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
            const r = document.querySelector("canvas").getBoundingClientRect();
            return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
        });
        await p.mouse.move(heldPoint.x, heldPoint.y); await p.mouse.down();
        await p.mouse.move(heldPoint.x + 24, heldPoint.y + 24, { steps: 4 });
        await p.waitForFunction(() => !!window.__skillBattlePreview.panel.held);
        await p.setViewportSize({ width: 1280, height: 720 });
        await p.waitForFunction(() => !window.__skillBattlePreview.panel.held);
        await p.mouse.up();
        assert.equal(await p.evaluate(key => localStorage.getItem(key), saveKey), preparation,
            "Resizing cancels an in-progress drag without committing an item");
        await p.setViewportSize({ width: 1560, height: 720 });
        await inspect(p, "preparation-after-drag-cancel");
        await click(p, "invPrimary");
        while (await p.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
            await click(p, "warehouse0"); await click(p, "newRun");
        }
        await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
        const mapSave = await p.evaluate(key => localStorage.getItem(key), saveKey);
        for (const [w, h] of [[1560,720],[2560,1080],[1024,768],[844,390],[390,844],[1560,720]]) {
            await p.setViewportSize({ width: w, height: h });
            const before = await inspect(p, `map-${w}x${h}`);
            await p.evaluate(() => window.__skillBattlePreview.panel.refresh());
            const after = await inspect(p, `map-refresh-${w}x${h}`);
            assert.deepEqual(after, before, "Rendering again must retain native region anchors");
            assert.equal(await p.evaluate(key => localStorage.getItem(key), saveKey), mapSave, "Map resize must not write a save");
        }
        await click(p, "expAbandon");
        await inspect(p, "confirmation-1560x720", true);
        await p.setViewportSize({ width: 1024, height: 768 });
        await inspect(p, "confirmation-1024x768", true);
        await click(p, "dialogCancel");
        await p.setViewportSize({ width: 1560, height: 720 });
        await inspect(p, "map-restored-1560x720");
        assert.equal(await p.evaluate(key => localStorage.getItem(key), saveKey), mapSave);
        await click(p, "expNode2");
        await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
        const arrived = await p.evaluate(key => localStorage.getItem(key), saveKey);
        for (const [w, h] of [[1024,768],[844,390],[1560,720]]) {
            await p.setViewportSize({ width: w, height: h });
            assert.equal((await inspect(p, `node-action-${w}x${h}`)).actionVisible, true);
            await p.evaluate(() => window.__skillBattlePreview.panel.refresh());
            await inspect(p, `node-action-refresh-${w}x${h}`);
            assert.equal(await p.evaluate(key => localStorage.getItem(key), saveKey), arrived,
                "Node action reflow is purely presentational");
        }
        assert.equal(await p.evaluate(() => localStorage.getItem("other-app")), "keep");
        assert.deepEqual(errors, []);
        assert.deepEqual(failed, []);
        console.log("Viewport browser: native Width/Height adapter, anchored regions, fluid map, uniform background, resize/orientation/refresh round trips, centered modal/full mask and untouched saves passed.");
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
