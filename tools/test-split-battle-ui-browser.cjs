const { chromium } = require("playwright");
const sharp = require("sharp");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18125";
const out = path.resolve(__dirname, "../tmp/split-ui-browser");
const state = p => p.evaluate(() => window.__skillBattlePreview.trial.inventory);
const ready = p => p.waitForFunction(() => {
    const v = window.__skillBattlePreview;
    return v?.view?.isOpened && v.panel?.opened;
});
async function click(p, key) {
    await ready(p);
    const point = await p.evaluate(key => {
        const preview = window.__skillBattlePreview;
        const n = preview.ui.topView?.getElement(key, false) || preview.panel.buttons[key];
        if (!n?.visible || !n.mouseEnabled) throw Error(`Unavailable button: ${key}`);
        for (let parent = n.parent; parent; parent = parent.parent)
            if (!parent.visible) throw Error(`Hidden parent for ${key}: ${parent.name}`);
        const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
        const r = document.querySelector("canvas").getBoundingClientRect();
        return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
    }, key);
    if (p.touchMode) await p.touchscreen.tap(point.x, point.y);
    else await p.mouse.click(point.x, point.y);
    await p.waitForTimeout(160);
    await ready(p);
}
async function pageIs(p, name) {
    await p.waitForFunction(name => window.__skillBattlePreview.view.path.endsWith(`/${name}.lh`) &&
        window.__skillBattlePreview.panel?.opened, name);
}
async function popupIs(p, name) {
    await p.waitForFunction(name => window.__skillBattlePreview.ui.topView?.path.endsWith(`/${name}.lh`) &&
        window.__skillBattlePreview.ui.topView.isOpened, name);
}
async function tapDesign(p,x,y) {
    const point=await p.evaluate(({x,y})=>{
        const a=window.__skillBattlePreview.ui.uiRoot.localToGlobal(new Laya.Point(x,y));
        const r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    },{x,y});
    if(p.touchMode)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
    await p.waitForTimeout(120);
}
async function capture(p, name) {
    const pixels = await p.screenshot({ path: path.join(out, name + ".png") });
    const stats = await sharp(pixels).stats();
    assert.ok(stats.channels.slice(0, 3).some(c => c.stdev > 12), "Nonblank rendered canvas");
    const issues = await p.evaluate(() => {
        const v = window.__skillBattlePreview, issues = [];
        const check = n => {
            if (!n.visible) return;
            if (n instanceof Laya.GTextField && n.text) {
                n.textIns.typeset(true);
                if (!n.textIns.visible || n.textIns.textWidth > n.width + 3 || n.textIns.textHeight > n.height + 3)
                    issues.push([n.name, n.text, n.width, n.height, n.textIns.textWidth, n.textIns.textHeight]);
            }
            for (let i = 0; i < n.numChildren; i++) check(n.getChildAt(i));
        };
        check(v.view.view);
        if (v.ui.topView !== v.view) check(v.ui.topView.view);
        const adapter = v.view.view.getChildByName("adapter");
        if (!adapter || adapter.width !== 1280 || adapter.height !== 720) issues.push("Invalid page adapter");
        for(let i=0;i<v.ui.uiRoot.numChildren;i++){
            const node=v.ui.uiRoot.getChildAt(i);
            if(node.visible&&node.name.startsWith("SkillBattle")&&node!==v.view.view&&node!==v.ui.topView.view)
                issues.push(["Closed page became visible again",node.name]);
        }
        return issues;
    });
    assert.deepEqual(issues, [], "Visible text fits and adapter remains 1280x720");
}
async function choose(p) {
    while ((await state(p)).flow.pending) {
        await pageIs(p, "SkillBattleBuildView");
        await click(p, "warehouse0"); await click(p, "newRun");
    }
    await pageIs(p, "SkillBattleMapView");
}
async function drag(p, from, to) {
    const points = await p.evaluate(({ from, to }) => {
        const panel = window.__skillBattlePreview.panel, r = document.querySelector("canvas").getBoundingClientRect();
        return [panel.buttons[from] || panel.nodes[from], panel.buttons[to] || panel.nodes[to]].map(n => {
            const a = n.localToGlobal(new Laya.Point(n.width / 2, n.height / 2));
            return { x: r.left + a.x * r.width / Laya.stage.width, y: r.top + a.y * r.height / Laya.stage.height };
        });
    }, { from, to });
    if (p.touchMode) {
        const cdp = await p.context().newCDPSession(p);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...points[0], id: 1 }] });
        await p.waitForTimeout(150);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...points[1], id: 1 }] });
        await p.waitForTimeout(150);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await cdp.detach();
    } else {
        await p.mouse.move(points[0].x, points[0].y); await p.mouse.down(); await p.waitForTimeout(150);
        await p.mouse.move(points[1].x, points[1].y, { steps: 15 }); await p.mouse.up();
    }
    await p.waitForTimeout(200);
}
(async () => {
    await fs.mkdir(out, { recursive: true });
    const browser = await chromium.launch({ headless: true, channel: "chromium" });
    try {
        for (const [name, width, height, touch] of [["desktop",1280,720,false],["wide",1920,1080,false],["mobile",844,390,true]]) {
            const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
            const p = await context.newPage(); p.touchMode = touch;
            const errors = [], failed = [];
            p.on("pageerror", e => errors.push(e.message));
            p.on("response", r => { if (r.status() >= 400) failed.push(r.url()); });
            await p.addInitScript(() => {
                localStorage.setItem("other-app", "keep");
                crypto.getRandomValues = a => { a.fill(1); return a; };
            });
            await p.goto(url); await ready(p); await pageIs(p, "SkillBattleStartView");
            await click(p, "invPrimary"); await capture(p, `${name}-preparation`);
            const beforeDrag = await state(p);
            // Saved warehouse positions and nested parent transforms must not change drag coordinates.
            await drag(p, "invItem0", "invSourceCell0");
            assert.notDeepEqual((await state(p)).items, beforeDrag.items, "A real drag commits through nested regions");
            await capture(p, `${name}-preparation-drag`);
            await drag(p, "invList0", "invCell_battle_0");
            assert.deepEqual((await state(p)).items, beforeDrag.items, "Dragging back restores the original spaces");
            await click(p, "invPrimary"); await pageIs(p, "SkillBattleBuildView");
            await capture(p, `${name}-initial-choice`);
            await choose(p); await capture(p, `${name}-map`);
            await click(p, "expNode2");
            await p.waitForFunction(() => !window.__skillBattlePreview.panel.movement);
            assert.equal((await state(p)).node, 2); assert.equal((await state(p)).flow.phase, "ready");
            await click(p, "expUse"); await pageIs(p, "SkillBattleBattleView");
            await capture(p, `${name}-battle`);
            await click(p, "battleReport"); await popupIs(p, "SkillBattleReportView");
            await capture(p, `${name}-report`);
            const beforePopup = await state(p);
            await tapDesign(p,640,360); await popupIs(p,"SkillBattleReportView");
            await click(p,"skill1");
            assert.deepEqual(await state(p),beforePopup,"A report prevents input reaching the battle");
            await click(p, "reportClose"); await pageIs(p, "SkillBattleBattleView");
            assert.deepEqual(await state(p), beforePopup, "Closing report commits nothing");
            await click(p,"battleReport");await popupIs(p,"SkillBattleReportView");
            await tapDesign(p,32,32);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.modalOpen),false,"Report mask dismisses the popup");
            await click(p, "build"); await popupIs(p, "SkillBattleBuildInfoView");
            await capture(p, `${name}-build-info`); await click(p, "reportClose");
            for (let i=0; i<20 && (await state(p)).flow.phase === "battle"; i++) {
                await click(p, "skill1"); await click(p, "confirm");
                await p.waitForFunction(() => !window.__skillBattlePreview.panel.busy);
            }
            assert.equal((await state(p)).phase, "active");
            await choose(p); await click(p, "expBuild"); await pageIs(p, "SkillBattleBuildView");
            await capture(p, `${name}-build`); await click(p, "invToggle"); await pageIs(p, "SkillBattleMapView");
            await click(p, "expStorage"); await pageIs(p, "SkillBattleInventoryView");
            await capture(p, `${name}-inventory`);
            await click(p, "invToggle"); await pageIs(p, "SkillBattleMapView");
            const beforeCancel = await state(p);
            await click(p, "expAbandon"); await popupIs(p, "SkillBattleConfirmView");
            await tapDesign(p,32,32); await popupIs(p,"SkillBattleConfirmView");
            await capture(p, `${name}-confirmation`); await click(p, "dialogCancel");
            assert.deepEqual(await state(p), beforeCancel, "Cancel leaves the saved run unchanged");
            await click(p, "expAbandon"); await popupIs(p, "SkillBattleConfirmView");
            await p.evaluate(()=>{
                window.__restoreSetItem=Storage.prototype.setItem;
                Storage.prototype.setItem=function(key,value){
                    if(key==="nowchange.stage4-expedition.v1")throw Error("Simulated quota failure");
                    return window.__restoreSetItem.call(this,key,value);
                };
            });
            await click(p,"dialogConfirm");await popupIs(p,"SkillBattleConfirmView");
            assert.deepEqual(await state(p),beforeCancel,"Failed confirmation preserves the saved run");
            assert.ok(await p.evaluate(()=>window.__skillBattlePreview.ui.topView.getElement("dialogError").text));
            await p.evaluate(()=>{Storage.prototype.setItem=window.__restoreSetItem;delete window.__restoreSetItem;});
            await click(p, "dialogConfirm"); await pageIs(p, "SkillBattleSettlementView");
            assert.equal((await state(p)).result, "abandon"); await capture(p, `${name}-settlement`);
            assert.equal(await p.evaluate(() => localStorage.getItem("other-app")), "keep");
            if(name==="desktop"){
                await click(p,"invPrimary");await pageIs(p,"SkillBattleStartView");
                assert.equal((await state(p)).phase,"preparation");
                await click(p,"invPrimary");
                assert.equal((await state(p)).phase,"active",JSON.stringify(await p.evaluate(()=>{
                    const {panel,view}=window.__skillBattlePreview;
                    return{page:view.path,notice:panel.notice,modal:panel.modalOpen,opened:panel.opened};
                })));
                await choose(p);
                await click(p,"expAbandon");await popupIs(p,"SkillBattleConfirmView");
                await p.evaluate(()=>{const original=Date.now.bind(Date);Date.now=()=>original()+1200000;});
                await pageIs(p,"SkillBattleSettlementView");
                assert.equal((await state(p)).result,"timeout");
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.ui.topView===window.__skillBattlePreview.view),true,
                    "Expiry closes an open confirmation, not just the underlying page");
                await capture(p,"desktop-popup-expiry");
            }
            assert.deepEqual(errors, [], "No page errors"); assert.deepEqual(failed, [], "No failed resources");
            await context.close(); console.log(`PASS independent pages and popups: ${name}`);
        }
        const context=await browser.newContext(),p=await context.newPage();
        await p.addInitScript(()=>{
            localStorage.setItem("nowchange.stage4-expedition.v1","broken");
            localStorage.setItem("other-app","keep");
        });
        await p.goto(url);await ready(p);
        assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage4-expedition.v1")),"broken");
        await click(p,"invAbandon");await popupIs(p,"SkillBattleConfirmView");await click(p,"dialogCancel");
        assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage4-expedition.v1")),"broken");
        await click(p,"invAbandon");await popupIs(p,"SkillBattleConfirmView");await click(p,"dialogConfirm");
        assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage4-expedition.v1")),null);
        assert.equal(await p.evaluate(()=>localStorage.getItem("other-app")),"keep");
        await context.close();console.log("PASS corrupt save: retained until explicit independent confirmation");
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
