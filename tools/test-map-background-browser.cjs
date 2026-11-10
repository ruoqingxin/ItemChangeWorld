const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18128";
const out = path.resolve(__dirname, "../tmp/map-background");
const key = "nowchange.stage4-expedition.v1";
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function click(p, name) {
    const point = await p.evaluate(name => {
        const v = window.__skillBattlePreview, n = v.ui.topView.getElement(name, false) || v.panel.buttons[name];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${name}`);
        const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
    }, name);
    if (p.touchMode) await p.touchscreen.tap(point.x, point.y);
    else await p.mouse.click(point.x, point.y);
    await p.waitForTimeout(120); await ready(p);
}

async function inspect(p, name) {
    await p.waitForFunction(() => window.__skillBattlePreview.view.getElement("mapGroundTexture", false)?.texture?.width === 768);
    await p.waitForTimeout(100);
    const result = await p.evaluate(() => {
        const v = window.__skillBattlePreview, g = v.view.getElement("screenBackground");
        const commands = g.graphics.cmds, fill = commands.filter(c => c.cmdID === Laya.FillTextureCmd.ID);
        const c = fill[0], start = g.localToGlobal(new Laya.Point(c.x, c.y));
        const anchor = v.panel.root.localToGlobal(new Laya.Point());
        const phase = value => -((-value % 768 + 768) % 768);
        const textIssues = [];
        const scan = n => {
            if (!n.visible) return;
            if (n instanceof Laya.GTextField && n.text) {
                n.textIns.typeset(true);
                if (n.textIns.textWidth > n.width + 3 || n.textIns.textHeight > n.height + 3) textIssues.push(n.name);
            }
            for (let i = 0; i < n.numChildren; i++) scan(n.getChildAt(i));
        };
        scan(v.view.view);
        const opacityIssues=[],colorIssues=[];
        for(const id of v.trial.inventory.map.visible) {
            const button=v.panel.buttons[`expNode${id}`],icon=button.getChildAt(2);
            if(button.alpha!==1||icon.alpha!==1)opacityIssues.push([id,button.alpha,icon.alpha]);
            const source=v.trial.inventory.map.sources.find(box=>box.node===id);
            const explored=!!source&&source.revealed===source.entries.length;
            if(icon.color!=="#ffffff"||icon.grayed!==explored)colorIssues.push([id,icon.color,icon.grayed,explored]);
        }
        const viewport=v.panel.expeditionNodes.expViewport;
        const corner=viewport.localToGlobal(new Laya.Point());
        const r = document.querySelector("canvas").getBoundingClientRect();
        return {
            fillCount: fill.length, commandCount: commands.length, children: g.numChildren,
            texture: [c.texture.width, c.texture.height], type: c.type,
            bounds: [start.x, start.y, c.width, c.height], scale: [g.scaleX, g.scaleY],
            stage: [Laya.stage.width, Laya.stage.height], phase: [c.offset.x, c.offset.y],
            expected: [phase(anchor.x - v.panel.scroller.scrollingPosX), phase(anchor.y)],
            scroll: v.panel.scroller.scrollingPosX, content: v.panel.scroller.contentWidth, view: v.panel.scroller.viewWidth,
            textIssues, opacityIssues, colorIssues, viewport:[corner.x,corner.y,viewport.width,viewport.height],
            cssScale: r.width / Laya.stage.width,
        };
    });
    assert.equal(result.fillCount, 1, "One repeating texture regardless of map length");
    assert.equal(result.commandCount, 2, "Bounded fallback and repeated draw commands");
    assert.equal(result.children, 1, "No ever-growing tile sprite pool");
    assert.deepEqual(result.texture, [768, 768]);
    assert.equal(result.type, "repeat");
    assert.deepEqual(result.scale, [1, 1], "Do not stretch the ground");
    assert.deepEqual(result.bounds, [0, 0, ...result.stage], "No exposed margins after scrolling or resizing");
    assert.deepEqual(result.phase, result.expected, "Ground follows actual native scroll position");
    assert.deepEqual(result.textIssues, []);
    assert.deepEqual(result.opacityIssues, [], "Reachable, blocked and depleted nodes never fade through the ground");
    assert.deepEqual(result.colorIssues, [], "Only fully searched sources are gray; reachability and used rewards never tint icons");
    assert.deepEqual(result.viewport,[0,0,...result.stage],"Map input spans the whole page behind overlay UI");
    const image = await p.screenshot({ path: path.join(out, `${name}.png`) });
    assert.ok((await sharp(image).stats()).channels.slice(0, 3).some(c => c.stdev > 12));
    // The empty upper map band exposes the same ground pixel one native tile apart.
    const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const x = Math.round(18 * result.cssScale), y = Math.round(116 * result.cssScale);
    const period = Math.round(768 * result.cssScale);
    if (info.width > info.height && x + period < info.width) {
        let difference = 0;
        for (let i = 0; i < 3; i++)
            difference += Math.abs(data[(y * info.width + x) * 3 + i] - data[(y * info.width + x + period) * 3 + i]);
        assert.ok(difference < 18, `Repeated pixels must actually render: ${difference}`);
    }
    return result;
}

async function pan(p, reverse = false) {
    const points = await p.evaluate(reverse => {
        const v = window.__skillBattlePreview, n = v.panel.expeditionNodes.expViewport;
        const r = document.querySelector("canvas").getBoundingClientRect();
        const xs = reverse ? [n.width*0.15, n.width*0.85] : [n.width*0.85, n.width*0.15];
        return xs.map(x => {
            const a = n.localToGlobal(new Laya.Point(x, 116));
            return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
        });
    }, reverse);
    if (p.touchMode) {
        const session = await p.context().newCDPSession(p);
        await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...points[0], id: 1 }] });
        for (let i = 1; i <= 16; i++) {
            const x = points[0].x + (points[1].x - points[0].x) * i / 16, y = points[0].y;
            await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] });
            await p.waitForTimeout(16);
        }
        await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await session.detach();
    } else {
        await p.mouse.move(points[0].x, points[0].y); await p.mouse.down();
        await p.mouse.move(points[1].x, points[1].y, { steps: 20 }); await p.mouse.up();
    }
    await p.waitForTimeout(700);
}

(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [["desktop",1280,720,false],["wide",1560,720,false],["mobile",844,390,true]]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const p = await context.newPage(), errors = [], failed = [];
            p.touchMode = touch;
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) failed.push(r.url()); });
            await p.addInitScript(() => {
                crypto.getRandomValues = a => { a.fill(1); return a; };
                localStorage.setItem("other-app", "keep");
            });
            await p.goto(url); await ready(p);
            await click(p, "invPrimary"); await click(p, "invPrimary");
            while (await p.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(p, "warehouse0"); await click(p, "newRun");
            }
            await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            const saved = await p.evaluate(key => localStorage.getItem(key), key);
            const initial = await inspect(p, `${name}-initial`);
            assert.ok(Math.abs(initial.content-initial.view)<1,"Exactly one screen is open at the start");
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode4.mouseEnabled),false,
                "Opaque future nodes remain blocked");
            await pan(p);
            const moved = await inspect(p, `${name}-panned`);
            if (initial.content > initial.view + 20)
                assert.ok(moved.scroll > initial.scroll + 20, "Real mouse/touch panning moves ground");
            else assert.ok(moved.scroll <= Math.max(0, Math.ceil(initial.content - initial.view)) + 0.01,
                "A fitting map only permits the native fractional-viewport rounding range");
            assert.equal(moved.content, initial.content, "Ground never expands revealed map bounds");
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), saved, "Panning never writes a save");
            await click(p, "expStorage"); await click(p, "invToggle");
            const returned = await inspect(p, `${name}-returned`);
            assert.equal(returned.scroll, moved.scroll, "Inventory return retains framing and ground phase");
            await p.evaluate(() => { const v = window.__skillBattlePreview; v.close(); v.reopen(); });
            await ready(p);
            assert.equal((await inspect(p, `${name}-reopened`)).scroll, moved.scroll);
            if (!touch) {
                for (const [w, h] of [[2560,1080],[1024,768],[390,844],[width,height]]) {
                    await p.setViewportSize({ width: w, height: h });
                    await inspect(p, `${name}-${w}x${h}`);
                }
                assert.equal(await p.evaluate(key => localStorage.getItem(key), key), saved, "Resize never writes a save");
            }
            await pan(p, true);
            await click(p, "expNode2");
            await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.trial.inventory.node), 2, "Background does not intercept node input");
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.trial.inventory.flow.phase), "ready", "Travel does not trigger combat");
            await inspect(p, `${name}-node-action`);
            await p.reload(); await ready(p);
            assert.ok(Math.abs((await inspect(p,`${name}-restored-arrival`)).content-initial.content)<1,
                "Reload derives the same unlocked screens from saved arrival history");
            const beforeFixture = await p.evaluate(key => localStorage.getItem(key), key);
            await p.evaluate(() => {
                const v = window.__skillBattlePreview;
                window.__groundStateRestore = JSON.parse(JSON.stringify(v.trial.save.state));
                v.trial.save.state.map.visible = [...v.trial.save.state.map.present];
                v.trial.save.state.map.used = [...new Set([...v.trial.save.state.map.used,4])];
                v.panel.refresh();
            });
            assert.ok(Math.abs((await inspect(p,`${name}-revealed-only-fixture`)).content-initial.content)<1,
                "Revealing future nodes does not extend screen bounds");
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode4.getChildAt(2).grayed),false,
                "Using a borrow point does not gray it");
            const screenProgress=await p.evaluate(() => {
                const {trial,panel}=window.__skillBattlePreview;
                const node=trial.save.state.map.present.find(id=> {
                    const b=panel.buttons[`expNode${id}`],x=b.x+b.width/2,w=panel.scroller.viewWidth;
                    return x>=w/2&&x<w*1.5;
                });
                trial.save.state.revealed.push(node);
                trial.save.state.node=node;panel.refresh();
                const forward=panel.scroller.contentWidth;
                trial.save.state.node=1;panel.refresh();
                return{forward,back:panel.scroller.contentWidth,view:panel.scroller.viewWidth};
            });
            assert.ok(Math.abs(screenProgress.forward-screenProgress.view*2)<1,"Arrival in the front half opens the next whole screen");
            assert.equal(screenProgress.back,screenProgress.forward,"Retreat never closes unlocked screens");
            await p.evaluate(() => {
                const {trial,panel}=window.__skillBattlePreview;
                trial.save.state.revealed=[...trial.save.state.map.present];
                trial.save.state.node=2;
                trial.save.state.map.sources.push({node:17,entries:[{}],revealed:0,opened:true,progressMs:0});
                panel.refresh();
            });
            await inspect(p,`${name}-unfinished-search-fixture`);
            await p.evaluate(() => {
                const {trial,panel}=window.__skillBattlePreview;
                trial.save.state.map.sources.find(box=>box.node===17).revealed=1;
                const ground=JSON.parse(JSON.stringify(trial.save.state.items[0]));
                ground.uid="visual-ground-fixture";ground.location={space:"ground",node:17};
                trial.save.state.items.push(ground);panel.refresh();
            });
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode17.getChildAt(2).grayed),true,
                "Completed search grays the source even while revealed loot remains");
            await pan(p); await pan(p);
            const long = await inspect(p, `${name}-long-map-fixture`);
            assert.ok(long.scroll > 768, "Cross at least one entire texture period");
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), beforeFixture, "Visual fixture/pan does not save");
            await p.evaluate(() => {
                const v = window.__skillBattlePreview;
                v.trial.save.state = window.__groundStateRestore;
                delete window.__groundStateRestore;
                v.panel.refresh();
            });
            assert.equal(await p.evaluate(() => localStorage.getItem("other-app")), "keep");
            assert.deepEqual(errors, []); assert.deepEqual(failed, []);
            await context.close();
            console.log(`PASS map ground ${name}: native-size repeat pixels, real pan, bounded rendering, inventory/cache return, resize and node input`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
