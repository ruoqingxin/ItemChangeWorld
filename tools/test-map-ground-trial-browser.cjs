const { chromium } = require("playwright");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");

const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18138";
const out = path.resolve(__dirname, "../tmp/map-final-ground");
const source = "ui/texture/expedition/ancient-sect-ground-final.png";
const saveKey = "nowchange.stage4-expedition.v1";
const ready = p => p.waitForFunction(() => window.__skillBattlePreview?.panel?.opened &&
    window.__skillBattlePreview.view.isOpened);

async function click(p, name, touch) {
    const point = await p.evaluate(name => {
        const v = window.__skillBattlePreview, n = v.panel.buttons[name];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable ${name}`);
        const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x:r.left + a.x * r.width / Laya.stage.width,
            y:r.top + a.y * r.height / Laya.stage.height };
    }, name);
    if (touch) await p.touchscreen.tap(point.x, point.y);
    else await p.mouse.click(point.x, point.y);
    await p.waitForTimeout(120);
    await ready(p);
    await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
}

async function inspect(p, name) {
    const state = await p.evaluate(source => {
        const {panel, trial} = window.__skillBattlePreview;
        const ground = panel.elements.screenBackground, texture = panel.elements.mapGroundTexture;
        const commands = ground.graphics.cmds, fills = commands.filter(c => c.cmdID === Laya.FillTextureCmd.ID);
        const fill = fills[0], origin = ground.localToGlobal(new Laya.Point(fill.x, fill.y));
        const page = panel.root.parent, anchor = page.globalToLocal(panel.root.localToGlobal(new Laya.Point()));
        const phase = (value,period) => -((-value % period + period) % period);
        const issues = [];
        if (texture.src !== source || texture.visible || !texture.texture) issues.push("ground reference");
        if (fills.length !== 1 || commands.length !== 2 || fill.type !== "repeat") issues.push("bounded repeat");
        if (fill.texture !== texture.texture || fill.texture.width !== 1376 || fill.texture.height !== 768)
            issues.push("texture period");
        if (origin.x !== 0 || origin.y !== 0 || fill.width !== Laya.stage.width || fill.height !== Laya.stage.height)
            issues.push("full viewport coverage");
        if (Math.abs(fill.offset.x - phase(anchor.x - panel.scroller.scrollingPosX,1376)) > 0.01 ||
            Math.abs(fill.offset.y - phase(anchor.y,768)) > 0.01) issues.push("scroll phase");
        if (ground.scaleX !== 1 || ground.scaleY !== 1) issues.push("stretched ground");
        if (ground.filters?.length) issues.push("obsolete color filter");
        return { issues, saved:localStorage.getItem("nowchange.stage4-expedition.v1"),
            node:trial.inventory.node, scroll:panel.scroller.scrollingPosX,
            bounds:[panel.scroller.contentWidth, panel.scroller.viewWidth],
            layout:trial.inventory.map.present.map(id => {
                const n = panel.buttons[`expNode${id}`];
                return [id, n.x, n.y, n.width, n.height];
            }) };
    }, source);
    assert.deepEqual(state.issues, [], name);
    await p.waitForTimeout(100);
    const image = await p.screenshot({path:path.join(out, `${name}.png`)});
    assert.ok((await sharp(image).stats()).channels.slice(0, 3).every(c => c.stdev > 12), "Rendered canvas");
    return state;
}

async function pan(p, touch) {
    const r = await p.evaluate(() => {
        const canvas = document.querySelector("canvas").getBoundingClientRect();
        return {x:canvas.left, y:canvas.top, width:canvas.width, height:canvas.height};
    });
    const start = {x:r.x + r.width * 0.8, y:r.y + r.height * 0.58};
    const end = {x:r.x + r.width * 0.3, y:start.y};
    if (touch) {
        const session = await p.context().newCDPSession(p);
        await session.send("Input.dispatchTouchEvent", {type:"touchStart", touchPoints:[{...start, id:1}]});
        for (let i = 1; i <= 16; i++) {
            await session.send("Input.dispatchTouchEvent", {type:"touchMove",
                touchPoints:[{x:start.x+(end.x-start.x)*i/16, y:start.y, id:1}]});
            await p.waitForTimeout(16);
        }
        await session.send("Input.dispatchTouchEvent", {type:"touchEnd", touchPoints:[]});
        await session.detach();
    } else {
        await p.mouse.move(start.x, start.y); await p.mouse.down();
        await p.mouse.move(end.x, end.y, {steps:20}); await p.mouse.up();
    }
    await p.waitForTimeout(800);
    await p.waitForFunction(() => !window.__skillBattlePreview.panel.scroller._tweening);
}

(async () => {
    await fs.mkdir(out, {recursive:true});
    const browser = await chromium.launch({headless:true, channel:"chromium"});
    try {
        for (const [name, width, height, touch] of [
            ["desktop",1280,720,false], ["wide",1560,720,false], ["mobile",844,390,true],
        ]) {
            const context = await browser.newContext({viewport:{width,height}, hasTouch:touch, isMobile:touch});
            const p = await context.newPage(), errors = [], missing = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if(r.status() >= 400) missing.push(r.url()); });
            await p.addInitScript(() => {crypto.getRandomValues = a => {a.fill(1); return a;};});
            await p.goto(url); await ready(p);
            await click(p, "invPrimary", touch); await click(p, "invPrimary", touch);
            while (await p.evaluate(() => !!window.__skillBattlePreview.trial.inventory.flow.pending)) {
                await click(p, "warehouse0", touch); await click(p, "newRun", touch);
            }
            await p.waitForFunction(() => window.__skillBattlePreview.panel.pageRole === "map");
            await p.waitForFunction(source =>
                window.__skillBattlePreview.panel.elements.mapGroundTexture.src === source &&
                window.__skillBattlePreview.panel.elements.mapGroundTexture.texture?.width === 1376, source);
            await click(p, "expNode2", touch);
            const original = await inspect(p, `${name}-after`);
            // Expose a longer display-only fixture without unlocking or saving any real progress.
            await p.evaluate(() => {
                const {panel, trial} = window.__skillBattlePreview;
                window.__groundOriginalRevealed = [...trial.inventory.revealed];
                trial.data.save.state.revealed = [...trial.inventory.map.present];
                panel.refresh();
            });
            const expanded = await inspect(p, `${name}-extended-fixture`);
            for (let i = 0; i < 4; i++) await pan(p, touch);
            const moved = await inspect(p, `${name}-panned`);
            assert.ok(moved.scroll > original.scroll + 1376, "Real dragging crosses a complete ground period");
            assert.equal(moved.node, original.node, "Dragging never moves the player");
            assert.equal(moved.saved, original.saved, "Dragging never writes a save");
            assert.deepEqual(moved.layout, expanded.layout, "Dragging preserves node positions");
            await click(p, "expStorage", touch); await click(p, "invToggle", touch);
            const returned = await inspect(p, `${name}-returned`);
            assert.ok(Math.abs(returned.scroll - moved.scroll) < 1, "Inventory return preserves ground phase");
            assert.equal(returned.saved, original.saved);
            await p.evaluate(() => {
                const {panel, trial} = window.__skillBattlePreview;
                trial.data.save.state.revealed = window.__groundOriginalRevealed;
                delete window.__groundOriginalRevealed;
                panel.refresh();
            });
            assert.equal(await p.evaluate(key => localStorage.getItem(key), saveKey), original.saved);
            assert.deepEqual(errors, []); assert.deepEqual(missing, []);
            await context.close();
            console.log(`PASS final ground ${name}: 1376x768, unfiltered color, real pan across tile boundaries, unchanged node layout, no display-only save.`);
        }
    } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode = 1;});
