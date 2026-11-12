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
        if (v.view.getElement("expTitle", false) || v.view.getElement("mapTitleFrame", false))
            throw Error("Map title and title frame must be absent");
        for (const name of ["mapHeaderPanel","mapTimerFrame","mapKillsFrame","expHpValue","expMpValue",
            "expPlayerName","expStamina","expWeight","expClock",...Array.from({length:3},(_,i)=>`expKillCount${i}`)])
            if (!v.view.getElement(name, false)?.visible) throw Error(`Missing map status: ${name}`);
        for(const name of ["expResources","expSpirit","expDurability","expWins","expStatus"])
            if(v.view.getElement(name,false))throw Error(`Obsolete map status: ${name}`);
        for(const name of ["mapHeaderPanel","mapTimerFrame","mapKillsFrame","mapPlayerPanel","mapHpSlot","mapMpSlot","mapStaminaSlot","mapWeightSlot",
            "expStorageSkin","expBuildSkin","expAbandonSkin"]) {
            const image=v.view.getElement(name);
            if(!image.graphics.cmds.some(c=>c.cmdID===Laya.Draw9GridTextureCmd.ID))
                throw Error(`Missing nine-slice draw: ${name}`);
        }
        if(v.view.getElement("mapHeaderPanel").width!==v.view.getElement("mapHeaderArea").width ||
            v.view.getElement("mapKillsFrame").width!==v.view.getElement("mapKillsArea").width)
            throw Error("Header and kill-slot backgrounds must follow native viewport resizing");
        if(v.panel.labels.expStamina.text!=="-- / --"||v.panel.labels.expWeight.text!=="-- / --")
            throw Error("Unconnected resources must not show fabricated numbers");
        for(const key of ["Stamina","Weight"]) {
            if(!v.view.getElement(`map${key}Track`).visible ||
                v.view.getElement(`map${key}Fill`).visible)
                throw Error(`Unconnected ${key} still needs a visible empty progress track`);
        }
        for(const key of ["expStorage","expBuild"]) {
            const button=v.panel.buttons[key],icon=button.getChildAt(2),label=button.getChildAt(1);
            if(button.width!==112||button.height!==104||icon.width!==46||label.fontSize!==22||!label.bold)
                throw Error(`Map tool must retain its readable icon and label: ${key}`);
            if(!button.getChildAt(0).filters?.length||!icon.filters?.length)
                throw Error(`Map tool must retain its contrasting surface and icon: ${key}`);
        }
        const inventory=v.trial.inventory,setup=v.trial.archive.config.build.setup.player;
        const format=value=>(value/100).toFixed(2).replace(/\.?0+$/,"");
        if(v.panel.labels.expHpValue.text!==`${format(inventory.hp)} / ${format(setup.maxHp)}` ||
            v.panel.labels.expMpValue.text!==`${format(inventory.mp)} / ${format(setup.maxMp)}`)
            throw Error("Player bars must show current/max real data");
        for(const [i,kind] of ["normal","elite","boss"].entries())
            if(v.panel.labels[`expKillCount${i}`].text!==String(inventory.map.cleared.filter(id=>
                v.trial.archive.config.nodes.find(n=>n.id===id).kind===kind).length))
                throw Error(`Wrong cleared category count: ${kind}`);
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
        for(const id of v.trial.inventory.map.present) {
            const button=v.panel.buttons[`expNode${id}`],icon=button.getChildAt(2);
            if(!button.visible)continue;
            if(button.getChildAt(1).visible)throw Error(`Visible node caption ${id}`);
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
            shown:v.trial.inventory.map.present.filter(id=>v.panel.buttons[`expNode${id}`].visible),
            present:[...v.trial.inventory.map.present],
            routes:[...v.panel.mapRoutes.keys()],
            expectedRoutes:v.trial.inventory.map.edges.flatMap(([a,b])=>[`${a}:${b}`,`${b}:${a}`]),
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
    const x = Math.round(18 * result.cssScale), y = Math.round(208 * result.cssScale);
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
            const a = n.localToGlobal(new Laya.Point(x, 208));
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
    await p.waitForFunction(() => !window.__skillBattlePreview.panel.scroller._tweening);
}

async function checkHud(p, name) {
    const saved=await p.evaluate(key=>localStorage.getItem(key),key);
    await p.evaluate(() => {
        const {trial,panel}=window.__skillBattlePreview;
        const original=JSON.parse(JSON.stringify(trial.data.save.state));
        try {
            const state=trial.data.save.state,setup=trial.archive.config.build.setup.player;
            state.hp=Math.floor(setup.maxHp/2);state.mp=Math.floor(setup.maxMp/4);
            state.map.cleared=trial.archive.config.nodes.filter(n=>["normal","elite","boss"].includes(n.kind))
                .map(n=>n.id);
            panel.refresh();
            for(const [bar,ratio] of [["Hp",0.5],["Mp",0.25]]) {
                const fill=panel.expeditionNodes[`map${bar}Fill`],command=fill.graphics.cmds[0];
                if(Math.abs(command.width/fill.width-ratio)>0.001)throw Error(`Incorrect ${bar} progress`);
            }
            for(const [i,kind] of ["normal","elite","boss"].entries())
                if(panel.labels[`expKillCount${i}`].text!==String(trial.archive.config.nodes.filter(n=>n.kind===kind).length))
                    throw Error(`Nonzero ${kind} count must use real cleared nodes`);
            state.map.used.push(state.node);
            panel.refresh();
            if(panel.buttons.expUse.mouseEnabled ||
                !panel.buttons.expUse.getChildAt(0).src.endsWith("button-disabled-64x48.png"))
                throw Error("Unavailable node action must use the disabled state");
        } finally {
            trial.data.save.state=original;panel.refresh();
        }
    });
    if(!p.touchMode) {
        const point=await p.evaluate(() => {
            const n=window.__skillBattlePreview.panel.buttons.expBuild;
            const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2));
            const r=document.querySelector("canvas").getBoundingClientRect();
            return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
        });
        await p.mouse.move(point.x,point.y);await p.waitForTimeout(60);
        assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
            .endsWith("button-hover-64x48.png")),"Real hover selects hover artwork");
        await p.mouse.down();await p.waitForTimeout(60);
        assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
            .endsWith("button-pressed-64x48.png")),"Real press selects pressed artwork");
        await p.mouse.move(point.x+150,point.y-80);await p.mouse.up();
        await p.waitForTimeout(60);
        assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expBuild.getChildAt(0).src
            .endsWith("button-normal-64x48.png")),"Leaving a button clears its pressed state");
    }
    await click(p,"expAbandon");
    assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.modalOpen),true,"Exit opens confirmation");
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),saved,"Opening exit confirmation never abandons");
    await click(p,"dialogCancel");
    await p.waitForFunction(()=>!window.__skillBattlePreview.panel.modalOpen);
    assert.equal(await p.evaluate(key=>localStorage.getItem(key),key),saved,"Cancel exit keeps the run unchanged");
    await inspect(p,`${name}-hud-verified`);
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
            assert.ok(initial.content>initial.view,"The whole map can be browsed from the start");
            assert.deepEqual(initial.shown,initial.present,"Every generated node is displayed from the start");
            assert.deepEqual(initial.routes.sort(),initial.expectedRoutes.sort(),"Every real connecting route is displayed");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode16.mouseEnabled),false,
                "Displaying the final exit must not unlock it");
            await pan(p);
            const moved = await inspect(p, `${name}-panned`);
            if (initial.content > initial.view + 20)
                assert.ok(moved.scroll > initial.scroll + 20, "Real mouse/touch panning moves ground");
            else assert.ok(moved.scroll <= Math.max(0, Math.ceil(initial.content - initial.view)) + 0.01,
                "A fitting map only permits the native fractional-viewport rounding range");
            assert.equal(moved.content, initial.content, "Panning does not change full-map bounds");
            assert.deepEqual(moved.shown,initial.shown,"All nodes remain displayed after panning");
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
            assert.deepEqual((await inspect(p,`${name}-arrival-full-map`)).shown,initial.present,
                "Arrival retains the full map");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode3.mouseEnabled),false,
                "The exposed next step stays blocked by the current enemy");
            await checkHud(p,name);
            await p.reload(); await ready(p);
            const restored=await inspect(p,`${name}-restored-arrival`);
            assert.deepEqual(restored.shown,initial.present,"Reload displays the full map from the existing save");
            assert.ok(Math.abs(restored.content-initial.content)<1,
                "Reload retains full-map browsing bounds");
            const beforeFixture = await p.evaluate(key => localStorage.getItem(key), key);
            await p.evaluate(() => {
                const v = window.__skillBattlePreview;
                window.__groundStateRestore = JSON.parse(JSON.stringify(v.trial.data.save.state));
                v.trial.data.save.state.map.visible = [...v.trial.data.save.state.map.present];
                v.trial.data.save.state.map.used = [...new Set([...v.trial.data.save.state.map.used,4])];
                v.panel.refresh();
            });
            const revealedOnly=await inspect(p,`${name}-revealed-only-fixture`);
            assert.deepEqual(revealedOnly.shown,restored.shown,"Saved discovery does not control full-map presentation");
            assert.ok(Math.abs(revealedOnly.content-initial.content)<1,
                "Changing discovery does not change full-map bounds");
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode4.getChildAt(2).grayed),false,
                "Using a borrow point does not gray it");
            const screenProgress=await p.evaluate(() => {
                const {trial,panel}=window.__skillBattlePreview;
                const node=trial.archive.config.nodes.find(n=> {
                    const x=112+n.x*242,w=panel.scroller.viewWidth;
                    return n.mainOrder>=0&&x>=w/2&&x<w*1.5;
                }).id;
                trial.data.save.state.revealed.push(node);
                trial.data.save.state.node=node;panel.refresh();
                const forward=panel.scroller.contentWidth;
                trial.data.save.state.node=1;panel.refresh();
                return{forward,back:panel.scroller.contentWidth,view:panel.scroller.viewWidth};
            });
            assert.ok(Math.abs(screenProgress.forward-initial.content)<1,"Arrival does not change full-map browsing bounds");
            assert.equal(screenProgress.back,screenProgress.forward,"Retreat retains full-map browsing bounds");
            await p.evaluate(() => {
                const {trial,panel}=window.__skillBattlePreview;
                trial.data.save.state.revealed=[...trial.data.save.state.map.present];
                trial.data.save.state.node=2;
                trial.data.save.state.map.sources.push({node:17,entries:[{}],revealed:0,opened:true,progressMs:0});
                panel.refresh();
            });
            await inspect(p,`${name}-unfinished-search-fixture`);
            await p.evaluate(() => {
                const {trial,panel}=window.__skillBattlePreview;
                trial.data.save.state.map.sources.find(box=>box.node===17).revealed=1;
                const ground=JSON.parse(JSON.stringify(trial.data.save.state.items[0]));
                ground.uid="visual-ground-fixture";ground.location={space:"ground",node:17};
                trial.data.save.state.items.push(ground);panel.refresh();
            });
            assert.equal(await p.evaluate(() => window.__skillBattlePreview.panel.buttons.expNode17.getChildAt(2).grayed),true,
                "Completed search grays the source even while revealed loot remains");
            await pan(p); await pan(p);
            const long = await inspect(p, `${name}-long-map-fixture`);
            assert.ok(long.scroll > 768, "Cross at least one entire texture period");
            assert.equal(await p.evaluate(key => localStorage.getItem(key), key), beforeFixture, "Visual fixture/pan does not save");
            await p.evaluate(() => {
                const v = window.__skillBattlePreview;
                v.trial.data.save.state = window.__groundStateRestore;
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
