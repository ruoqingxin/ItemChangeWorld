const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const fs = require("node:fs/promises");
const path = require("node:path");
const url = process.env.SKILL_BATTLE_URL || "http://127.0.0.1:18120";
const key = "nowchange.stage1-battle.v1";
const screenshots = path.join(__dirname, "../bin/stage1-browser");

async function ready(page, screen) {
    await page.waitForFunction(s => {
        const preview = window.__skillBattlePreview;
        return preview?.view?.isOpened && preview.panel?.screen === s && preview.panel.opened;
    }, screen);
    await page.waitForTimeout(100);
}
async function click(page, name, twice = false) {
    const point = await page.evaluate(name => {
        const button = window.__skillBattlePreview.panel.buttons[name];
        if (!button?.visible || !button.mouseEnabled) throw new Error(`Disabled/hidden button: ${name}`);
        const point = button.localToGlobal(new Laya.Point(button.width / 2, button.height / 2));
        const canvas = document.querySelector("canvas"), rect = canvas.getBoundingClientRect();
        return { x: rect.left + point.x * rect.width / Laya.stage.width,
            y: rect.top + point.y * rect.height / Laya.stage.height };
    }, name);
    await page.mouse.click(point.x, point.y);
    if (twice) await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(70);
}
async function settled(page) {
    await page.waitForFunction(() => window.__skillBattlePreview.panel?.opened &&
        !window.__skillBattlePreview.panel.busy);
}
async function state(page) { return page.evaluate(() => window.__skillBattlePreview.trial.state); }
async function capture(page, name) {
    const file = path.join(screenshots, `${name}.png`);
    await page.screenshot({ path: file });
    const { channels } = await sharp(file).stats();
    assert.ok(channels.slice(0,3).some(c => c.stdev > 8 && c.max > 170), `${name} canvas must not be blank`);
    const overlaps = await page.evaluate(() => {
        const root = window.__skillBattlePreview.view.view, rectangles = [];
        for (let i = 0; i < root.numChildren; i++) {
            const node = root.getChildAt(i);
            if (!node.visible || !node.mouseEnabled || !node.numChildren ||
                !(node.getChildAt(0) instanceof Laya.GTextField)) continue;
            rectangles.push({name:node.name,x:node.x,y:node.y,w:node.width,h:node.height});
        }
        return rectangles.flatMap((a,i) => rectangles.slice(i+1).filter(b =>
            Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x) &&
            Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)).map(b => `${a.name}/${b.name}`));
    });
    assert.deepEqual(overlaps, [], `${name}: visible hit areas overlap`);
}
async function newPage(browser, viewport = {width:1280,height:720}) {
    const page = await browser.newPage({ viewport });
    page.errors = []; page.failed = [];
    page.on("pageerror",e=>page.errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")page.errors.push(m.text());});
    page.on("response",r=>{if(r.status()>=400)page.failed.push(r.url());});
    await page.goto(url);
    await ready(page,"start");
    return page;
}
async function main() {
    await fs.mkdir(screenshots,{recursive:true});
    const browser = await chromium.launch({headless:true,channel:"chromium"});
    try {
        const page = await newPage(browser);
        await page.evaluate(() => {
            localStorage.setItem("nowchange.skill-expedition.current.v2","preserve-v2");
            localStorage.setItem("other-app","preserve-other");
        });
        await capture(page,"desktop-start");
        await click(page,"nextPage");
        assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.options.actives[0].level),1);
        await click(page,"previousPage");
        await click(page,"summary");
        await click(page,"warehouse3");
        assert.ok(await page.evaluate(()=>window.__skillBattlePreview.panel.options.passiveIds.includes(4)));
        await click(page,"actions");
        await capture(page,"desktop-fixtures");
        await click(page,"report");
        await click(page,"newRun");
        await ready(page,"battle");
        const initial=await state(page);
        assert.equal(initial.player.mp,3000);
        assert.deepEqual(await page.evaluate(()=>Object.keys(window.__skillBattlePreview.panel.buttons)
            .filter(k=>["skill1","skill2","skill3","skill4","upgrade0"].includes(k))
            .map(k=>window.__skillBattlePreview.panel.buttons[k].visible)),[true,true,true,true,true]);
        await click(page,"skill3");
        await capture(page,"desktop-preview");
        assert.deepEqual(await state(page),initial,"preview is pure");
        await click(page,"cancel");
        assert.deepEqual(await state(page),initial,"cancel is pure");
        await click(page,"skill3");
        await click(page,"confirm",true);
        await settled(page);
        let s=await state(page);
        assert.equal(s.revision,1,"double input only commits once");
        assert.equal(s.player.mp,2800);assert.equal(s.round,2);
        await click(page,"pouch2");
        await click(page,"confirm");
        await settled(page);
        s=await state(page);
        assert.equal(s.player.mp,3000);assert.equal(s.round,2);assert.equal(s.revision,2);
        assert.equal(s.potionUsed,true);assert.equal(s.pouch[2],null);
        await page.reload();await ready(page,"battle");
        assert.deepEqual(await state(page),s);
        await click(page,"build");await capture(page,"desktop-build");await click(page,"reportClose");
        await click(page,"battleReport");await capture(page,"desktop-log");await click(page,"reportClose");
        assert.deepEqual(await state(page),s);
        // Return and reopen actual cached UIBaseViews without resetting the battle.
        await click(page,"loot");await ready(page,"start");
        await click(page,"newRun");await ready(page,"battle");assert.deepEqual(await state(page),s);
        const stack=await page.evaluate(()=>{
            const ui=window.__skillBattlePreview.ui,count=Laya.GRoot.inst.numChildren;
            ui.init();ui.init();return {count,after:Laya.GRoot.inst.numChildren,w:ui.uiRoot.width,h:ui.uiRoot.height};
        });
        assert.equal(stack.count,stack.after);assert.equal(stack.w,1280);assert.equal(stack.h,720);
        for(let i=0;i<8 && await page.evaluate(()=>window.__skillBattlePreview.trial.outcome==="active");i++) {
            await click(page,"skill1");await click(page,"confirm");await settled(page);
        }
        await ready(page,"settlement");
        assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.outcome),"victory");
        await capture(page,"desktop-settlement");
        const won=await state(page);
        await page.reload();await ready(page,"settlement");assert.deepEqual(await state(page),won);
        await click(page,"lootClose");await ready(page,"battle");
        const carry=await state(page);
        assert.equal(carry.player.hp,won.player.hp);assert.equal(carry.player.mp,won.player.mp);
        assert.deepEqual(carry.weapon,won.weapon);assert.deepEqual(carry.pouch,won.pouch);
        assert.equal(carry.sword.momentum,0);
        await click(page,"battleReport");
        await click(page,"olderReport");
        assert.match(await page.evaluate(()=>window.__skillBattlePreview.panel.labels.section.text),/第 1 场/);
        await click(page,"newerReport");
        assert.match(await page.evaluate(()=>window.__skillBattlePreview.panel.labels.section.text),/第 2 场/);
        await click(page,"reportClose");
        const isolation=await page.evaluate(()=>[localStorage.getItem("nowchange.skill-expedition.current.v2"),localStorage.getItem("other-app")]);
        assert.deepEqual(isolation,["preserve-v2","preserve-other"]);
        assert.deepEqual(page.errors,[]);assert.deepEqual(page.failed,[]);
        await page.close();

        for(const [name,viewport] of [["wide",{width:1920,height:1080}],["mobile",{width:844,height:390}]]) {
            const p=await newPage(browser,viewport);
            await click(p,"newRun");await ready(p,"battle");
            await click(p,"upgrade0");
            await capture(p,`${name}-battle`);
            await click(p,"confirm");await settled(p);
            assert.equal((await state(p)).sword.momentum,2);
            await click(p,"skill2");await click(p,"confirm");await settled(p);
            assert.equal((await state(p)).sword.keen,true);
            await click(p,"skill3");await click(p,"confirm");await settled(p);
            assert.equal((await state(p)).sword.momentum,0);
            assert.deepEqual(p.errors,[]);assert.deepEqual(p.failed,[]);
            await p.close();
        }

        // Offline expiry must keep an already committed potion and report timeout only once.
        const expiry=await newPage(browser);
        await click(expiry,"newRun");await ready(expiry,"battle");
        await click(expiry,"skill3");await click(expiry,"confirm");await settled(expiry);
        await click(expiry,"pouch2");await click(expiry,"confirm");await settled(expiry);
        const original=await state(expiry);
        await expiry.evaluate(()=>window.__stage1Now=Date.now()+1200001);
        await expiry.addInitScript(() => {const actual=Date.now;Date.now=()=>actual()+1200001;});
        await expiry.reload();await ready(expiry,"settlement");
        assert.equal(await expiry.evaluate(()=>window.__skillBattlePreview.trial.outcome),"timeout");
        assert.deepEqual(await state(expiry),original);
        await capture(expiry,"desktop-timeout");
        const timeoutText=await expiry.evaluate(k=>localStorage.getItem(k),key);
        await expiry.reload();await ready(expiry,"settlement");
        assert.equal(await expiry.evaluate(k=>localStorage.getItem(k),key),timeoutText);
        assert.deepEqual(expiry.errors,[]);assert.deepEqual(expiry.failed,[]);
        await expiry.close();

        const animated=await newPage(browser);
        await click(animated,"newRun");await ready(animated,"battle");
        await click(animated,"skill1");await click(animated,"confirm");
        const committed=await state(animated);
        assert.equal(committed.phase,"player_input");
        await animated.evaluate(()=>{const actual=Date.now;Date.now=()=>actual()+1200001;});
        await ready(animated,"settlement");
        assert.equal(await animated.evaluate(()=>window.__skillBattlePreview.trial.outcome),"timeout");
        assert.deepEqual(await state(animated),committed,"animation must not undo the saved main action");
        assert.deepEqual(animated.errors,[]);assert.deepEqual(animated.failed,[]);
        await animated.close();

        // Inject ID-only/label changes into an isolated fixture, never into generated config or real saves.
        const remapped=await newPage(browser,{width:844,height:390});
        await click(remapped,"newRun");await ready(remapped,"battle");
        await remapped.evaluate(()=>{
            const trial=window.__skillBattlePreview.trial,cfg=trial.record.setup;
            const remap=id=>id*10+7;
            cfg.skills.forEach(row=>{row.id=remap(row.id);row.name+="试炼长名";});
            cfg.build.actives.forEach(row=>{row.skillId=remap(row.skillId);row.level=5;});
            trial.resetConfirmed();trial.start(cfg);
            window.__skillBattlePreview.panel.refresh();
        });
        await click(remapped,"upgrade0");await capture(remapped,"mobile-remapped-preview");
        await click(remapped,"confirm");await settled(remapped);
        assert.equal(await remapped.evaluate(()=>window.__skillBattlePreview.trial.record.actions[0].action.skillId),57);
        assert.equal((await state(remapped)).sword.momentum,3);
        await click(remapped,"skill3");await click(remapped,"confirm");await settled(remapped);
        assert.equal(await remapped.evaluate(()=>window.__skillBattlePreview.trial.record.actions[1].action.skillId),17);
        assert.deepEqual(remapped.errors,[]);assert.deepEqual(remapped.failed,[]);
        await remapped.close();

        const corrupted=await newPage(browser);
        await corrupted.evaluate(k=>localStorage.setItem(k,"broken-save"),key);
        await corrupted.reload();await ready(corrupted,"start");
        assert.ok(await corrupted.evaluate(()=>window.__skillBattlePreview.trial.error));
        assert.equal(await corrupted.evaluate(k=>localStorage.getItem(k),key),"broken-save");
        await click(corrupted,"reset");await capture(corrupted,"desktop-reset");
        await click(corrupted,"resetNo");
        assert.equal(await corrupted.evaluate(k=>localStorage.getItem(k),key),"broken-save");
        await click(corrupted,"reset");await click(corrupted,"resetYes");await ready(corrupted,"start");
        assert.equal(await corrupted.evaluate(k=>localStorage.getItem(k),key),null);
        assert.deepEqual(corrupted.errors,[]);assert.deepEqual(corrupted.failed,[]);
        await corrupted.close();
        console.log("New battle browser: actual prefab clicks, preview/cancel, double commit, potion/reload, build/log, carry, UIManager, desktop/wide/mobile, offline timeout, corrupt-save reset and canvas checks passed.");
    } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
