const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18128";
const output = path.resolve(__dirname, "../tmp/map-portrait");
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

async function move(p, target) {
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
                player: (() => {
                    const marker = panel.expeditionNodes.expPlayer, avatar = marker.getChildByName("expPlayerAvatar");
                    return { x: marker.x, y: marker.y, avatarX: avatar.x,avatarY: avatar.y,
                        visible: marker.visible && avatar?.visible,
                        passive: !marker.mouseEnabled && !avatar?.mouseEnabled,
                        locator: (() => {
                            const frame=marker.getChildByName("expPlayerFrame");
                            return frame?.visible&&frame.width===90&&frame.height===90&&frame.alpha===1&&
                                !frame.mouseEnabled&&!!frame.texture&&!!avatar.texture&&
                                frame.src.endsWith("/map-avatar-frame.png")&&
                                avatar.src.endsWith("/map-player-portrait.png")&&
                                avatar.width===74&&avatar.height===74&&
                                avatar.x===8&&avatar.y===8&&!marker.getChildByName("expPlayerRing");
                        })() };
                })(),
                controls: ["expStorage", "expBuild"].map(key => {
                    const n = panel.buttons[key], skin = n.getChildAt(0);
                    return { src: skin.src, visible: n.visible, enabled: n.mouseEnabled, alpha: n.alpha,
                        texture: !!skin.texture,
                        nineSlice: skin.graphics.cmds.some(c => c.cmdID === Laya.Draw9GridTextureCmd.ID) };
                }),
                actionVisible: panel.buttons.expUse.visible,
                notice: panel.labels.expNotice.text,
                reachVisible: Object.values(panel.buttons).some(n =>
                    n.visible && n.getChildByName("expReachHint")?.visible),
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
            actionVisible: panel.buttons.expUse.visible,
            expectsAction: trial.inventory.map.nodes.find(n => n.id === trial.inventory.node).kind !== "transit",
            markerOffset: (() => {
                const marker=panel.expeditionNodes.expPlayer,node=panel.buttons[`expNode${trial.inventory.node}`];
                return [marker.x+marker.width/2-node.x-node.width/2,marker.y-node.y];
            })(),
            avatarX:panel.expeditionNodes.expPlayer.getChildByName("expPlayerAvatar").x,
            avatarY: panel.expeditionNodes.expPlayer.getChildByName("expPlayerAvatar").y,
            expectedShown: trial.inventory.map.nodes.filter(n=>112+n.x*242-58<panel.scroller.contentWidth).map(n=>n.id) };
    });
    assert.ok(result.frames.some(f => f.moving), "Sample the animation, not just its settled state");
    assert.ok(result.frames.some(f => !f.moving), "Also sample the arrival refresh");
    assert.ok(new Set(result.frames.filter(f => f.moving).map(f => `${f.player.x},${f.player.y}`)).size > 2,
        "Player avatar follows the movement animation");
    assert.ok(result.frames.every(f=>f.player.avatarX===8&&f.player.avatarY===8),
        "Portrait never uses node-specific lift or horizontal shifts");
    assert.deepEqual([result.avatarX,result.avatarY],[8,8]);
    assert.deepEqual(result.markerOffset,[0,-80],"Arrival centers the portrait at one fixed offset above every node");
    for (const frame of result.frames)
        assert.ok(frame.player.visible && frame.player.passive && frame.player.locator,
            "Portrait and its frame remain visible and noninteractive");
    assert.ok(result.sources.every(src => src && src.endsWith("/map-toolbar-normal.png")),
        `Moving must not clear or dim toolbar skins: ${JSON.stringify([...new Set(result.sources)])}`);
    for (const frame of result.frames) {
        for (const control of frame.controls) {
            assert.ok(control.visible && control.texture && control.nineSlice && control.alpha === 1,
                "Toolbar stays visible, opaque and textured on every sampled frame");
            assert.ok(control.src.endsWith("/map-toolbar-normal.png"), "Toolbar appearance remains steady while moving");
            assert.equal(control.enabled, !frame.moving, "Temporary input lock remains intact");
        }
        if (frame.moving) {
            assert.equal(frame.actionVisible, false, "Node actions remain hidden until arrival");
            assert.equal(frame.reachVisible, false, "Reachable destinations are not advertised during movement");
            assert.equal(frame.notice, "移动中", "Movement has a transient status in the existing notice area");
        }
    }
    assert.equal(result.node, target);
    assert.deepEqual(result.shown, result.expectedShown, "Only the progressively opened width is displayed");
    assert.equal(result.actionVisible, result.expectsAction, "Arrival shows actions only for nonempty nodes");
}

(async () => {
    await fs.mkdir(output,{recursive:true});
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [["desktop", 1280, 720, false], ["wide", 1560, 720, false],
            ["mobile", 844, 390, true],["small-mobile",667,375,true]]) {
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
            for (const target of [2, 1, 2, 1]) await move(p, target);
            await click(p,"expNode2");
            await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
            const image=await p.screenshot({path:path.join(output,`${name}-transit.png`)});
            assert.ok((await sharp(image).stats()).channels.slice(0,3).every(c=>c.stdev>15),"Nonblank portrait map");
            await move(p,3);
            await p.screenshot({path:path.join(output,`${name}-enemy.png`)});
            const placement=await p.evaluate(async () => {
                const {panel,trial}=window.__skillBattlePreview,s=trial.data.save.state;
                const original={node:s.node,revealed:s.revealed,selected:panel.selectedNode,center:panel.centerMap,
                    scroll:panel.scroller.posX};
                const before=JSON.stringify(s),issues=[];
                try {
                    s.revealed=[...s.map.present];
                    for(const id of s.map.present) {
                        s.node=id;panel.selectedNode=null;panel.centerMap=true;panel.refresh();
                        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
                        const marker=panel.expeditionNodes.expPlayer,node=panel.buttons[`expNode${id}`];
                        if(marker.x+45!==node.x+58||marker.y!==node.y-80||
                            marker.width!==90||marker.height!==90)issues.push([id,"fixed portrait anchor"]);
                        const point=marker.localToGlobal(new Laya.Point());
                        const viewport=panel.expeditionNodes.expViewport;
                        const local=viewport.globalToLocal(point);
                        if(local.x<0||local.y<0||local.x+90>viewport.width||local.y+90>viewport.height)
                            issues.push([id,"portrait outside viewport",local.x,local.y,viewport.width,viewport.height]);
                    }
                } finally {
                    s.node=original.node;s.revealed=original.revealed;
                    panel.selectedNode=original.selected;panel.centerMap=original.center;
                    panel.refresh();panel.scroller.posX=original.scroll;
                }
                return {issues,unchanged:JSON.stringify(s)===before};
            });
            assert.deepEqual(placement.issues,[],"Every generated node uses the same fully visible portrait placement");
            assert.ok(placement.unchanged,"Portrait placement checks never mutate game state");
            await p.evaluate(() => {
                const { panel, trial } = window.__skillBattlePreview;
                trial.data.save.state.map.used.push(trial.inventory.node);
                panel.refresh();
                const n = panel.buttons.expUse;
                if (n.mouseEnabled || !n.getChildAt(0).src.endsWith("/map-button-disabled.png"))
                    throw Error("Persistently unavailable actions must still look disabled");
            });
            assert.deepEqual(errors, []);
            await context.close();
            console.log(`PASS map movement UI ${name}: stable skins, input locks and progressive width`);
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
