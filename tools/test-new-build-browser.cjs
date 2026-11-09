const {chromium}=require("playwright");
const sharp=require("sharp");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const path=require("node:path");
const url=(process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18120").replace(/\/$/,"")+"/?stage=2";
const key="nowchange.stage2-build.v1";
const screenshots=path.join(__dirname,"../bin/stage2-browser");
async function ready(page,screen="start"){
    await page.waitForFunction(s=>window.__skillBattlePreview?.view?.isOpened&&
        window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.screen===s,screen);
    await page.waitForTimeout(80);
}
async function click(page,name,twice=false){
    const point=await page.evaluate(name=>{
        const b=window.__skillBattlePreview.panel.buttons[name];
        if(!b?.visible||!b.mouseEnabled)throw Error(`Disabled/hidden: ${name}`);
        const p=b.localToGlobal(new Laya.Point(b.width/2,b.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
    },name);
    const tap=()=>page.touchMode?page.touchscreen.tap(point.x,point.y):page.mouse.click(point.x,point.y);
    await tap();
    if(twice)await tap();
    await page.waitForTimeout(60);
}
const flow=page=>page.evaluate(()=>window.__skillBattlePreview.trial.flow);
const state=page=>page.evaluate(()=>window.__skillBattlePreview.trial.state);
async function capture(page,name){
    const file=path.join(screenshots,`${name}.png`);
    await page.screenshot({path:file});
    const stats=await sharp(file).stats();
    assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>8&&c.max>170),`${name} canvas blank`);
    const layout=await page.evaluate(()=>{
        const panel=window.__skillBattlePreview.panel;
        const rects=Object.entries(panel.buttons).filter(([,b])=>b.visible).map(([name,b])=>({name,x:b.x,y:b.y,w:b.width,h:b.height}));
        const overlap=rects.flatMap((a,i)=>rects.slice(i+1).filter(b=>
            Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)).map(b=>`${a.name}/${b.name}`));
        const bounds=rects.filter(r=>r.x<0||r.y<0||r.x+r.w>1280||r.y+r.h>720).map(r=>r.name);
        const clipped=Object.entries(panel.labels).filter(([,l])=>l.visible&&l.text&&
            (l.textIns.textWidth>l.width+2||l.textIns.textHeight>l.height+2)).map(([name,l])=>
                ({name,w:l.width,h:l.height,tw:l.textIns.textWidth,th:l.textIns.textHeight}));
        return{overlap,bounds,clipped};
    });
    assert.deepEqual(layout.overlap,[],`${name} overlapping controls`);
    assert.deepEqual(layout.bounds,[],`${name} controls out of bounds`);
    assert.deepEqual(layout.clipped,[],`${name} clipped text`);
}
async function newPage(browser,viewport={width:1280,height:720}){
    const page=await browser.newPage({viewport,hasTouch:viewport.width<900});
    page.touchMode=viewport.width<900;
    page.errors=[];page.failed=[];
    page.on("pageerror",e=>page.errors.push(e.message));
    page.on("console",m=>{if(m.type()==="error")page.errors.push(m.text());});
    page.on("response",r=>{if(r.status()>=400)page.failed.push(r.url());});
    await page.goto(url);await ready(page);return page;
}
async function action(page,name){
    await click(page,name);await click(page,"confirm");
    await page.waitForFunction(()=>window.__skillBattlePreview.panel?.opened&&!window.__skillBattlePreview.panel.busy);
}
async function win(page){
    for(let i=0;i<20&&(await flow(page)).phase==="battle";i++){
        const s=await state(page);
        if(s.player.hp<=s.player.maxHp-2000&&!s.potionUsed){
            const index=s.pouch.findIndex(r=>r?.itemId===1);
            if(index>=0)await action(page,`pouch${index}`);
        }
        await action(page,"skill1");
    }
    await ready(page);
    assert.notEqual((await flow(page)).endReason,"defeat");
}
async function choose(page,index=0){
    await click(page,`warehouse${index}`);await click(page,"newRun");
}
async function main(){
    await fs.mkdir(screenshots,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        const p=await newPage(browser);
        await p.evaluate(()=>{
            localStorage.setItem("nowchange.stage1-battle.v1","preserved-trial");
            localStorage.setItem("nowchange.skill-expedition.current.v2","preserved-v2");
            localStorage.setItem("other-app","preserved-other");
        });
        await capture(p,"desktop-entry");
        await click(p,"newRun");
        let s=await flow(p);
        assert.equal(s.pending.kind,"start");assert.equal(s.pending.candidates.length,3);
        assert.equal(s.build.actives.length,0);
        assert.ok(s.pending.candidates.every(id=>[1,2,6,7].includes(id)));
        await capture(p,"desktop-starting-choice");
        const before=s;
        await p.reload();await ready(p);assert.deepEqual(await flow(p),before);
        await click(p,"warehouse0");await capture(p,"desktop-starting-preview");
        await click(p,"reportClose");assert.deepEqual(await flow(p),before);
        await choose(p);
        assert.equal((await flow(p)).build.actives.length,1);
        await capture(p,"desktop-build-before-battle");
        await click(p,"newRun");await ready(p,"battle");
        const original=await state(p);
        await click(p,"skill2");await capture(p,"desktop-defense-preview");
        assert.deepEqual(await state(p),original);
        await click(p,"cancel");assert.deepEqual(await state(p),original);
        await click(p,"skill1");await click(p,"confirm",true);
        await p.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
        assert.equal((await state(p)).mainActions,1);
        await p.reload();await ready(p,"battle");
        assert.equal((await state(p)).mainActions,1);
        await click(p,"build");await capture(p,"desktop-readonly-build");await click(p,"reportClose");
        await win(p);
        s=await flow(p);assert.equal(s.pending.kind,"active");assert.equal(s.daoyun,10);
        await capture(p,"desktop-borrow");
        const pending=structuredClone(s.pending);
        await p.reload();await ready(p);assert.deepEqual((await flow(p)).pending,pending);
        await click(p,"summary");await capture(p,"desktop-forgo-confirm");
        await click(p,"newRun");assert.equal((await flow(p)).points,2);
        const first=await p.evaluate(()=>window.__skillBattlePreview.trial.records[0]);
        await click(p,"warehouse0");assert.equal((await flow(p)).points,2);
        await capture(p,"desktop-upgrade-preview");
        await click(p,"reportClose");assert.equal((await flow(p)).points,2);
        await click(p,"warehouse0");await click(p,"newRun");assert.equal((await flow(p)).points,1);
        assert.equal((await flow(p)).build.actives[0].level,1);
        await capture(p,"desktop-strengthened");
        await click(p,"newRun");await ready(p,"battle");
        assert.equal((await state(p)).player.hp,first.state.player.hp);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.record.setup.build.actives[0].level),1);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.records[0].setup.build.actives[0].level),0);
        await win(p);assert.equal((await flow(p)).battles.length,2);
        await click(p,"actions");assert.equal((await flow(p)).pending.kind,"passive");
        await capture(p,"desktop-passive-choice");await choose(p);
        assert.equal((await flow(p)).build.passiveIds.length,1);assert.equal((await flow(p)).daoyun,20);
        await p.reload();await ready(p);assert.equal((await flow(p)).sources.filter(s=>s==="meditation").length,1);
        await click(p,"report");await capture(p,"desktop-history");await click(p,"reportClose");
        const cached=await flow(p);
        await p.evaluate(()=>{
            const preview=window.__skillBattlePreview;
            preview.close();preview.ui.clearAllInstant();preview.reopen();
        });
        await ready(p);assert.deepEqual(await flow(p),cached);
        assert.deepEqual(await p.evaluate(()=>[
            localStorage.getItem("nowchange.stage1-battle.v1"),localStorage.getItem("nowchange.skill-expedition.current.v2"),localStorage.getItem("other-app")
        ]),["preserved-trial","preserved-v2","preserved-other"]);
        assert.deepEqual(p.errors,[]);assert.deepEqual(p.failed,[]);await p.close();

        // Explicitly isolated easy-enemy fixture for all replacement slots and long labels.
        const r=await newPage(browser,{width:844,height:390});
        await click(r,"warehouse0");await click(r,"newRun");
        await r.evaluate(()=>{
            const t=window.__skillBattlePreview.trial,cfg=t.snapshot.config;
            t.resetConfirmed();
            for(const e of cfg.encounters){e.enemy.maxHp=100;e.enemy.intents=[{id:1,name:"隔离观察",damage:0,block:0,charging:false}];}
            for(const skill of cfg.setup.skills)skill.name+="测试长名";
            t.currentConfig=cfg;
            const profile={realm:1,fixture:true,learnedSkills:cfg.skills.map(s=>s.id),learnedPassives:cfg.passives.map(s=>s.id)};
            t.start(cfg,profile,17);window.__skillBattlePreview.panel.refresh();
        });
        await choose(r);
        for(let i=0;i<5;i++){
            await click(r,"newRun");await ready(r,"battle");await win(r);
            while((await flow(r)).pending){
                const pending=(await flow(r)).pending;
                if(pending.kind==="passive"){await choose(r);continue;}
                const activeCount=(await flow(r)).build.actives.length;
                await click(r,"warehouse0");
                if(activeCount===3){
                    await capture(r,"mobile-full-slots");
                    assert.equal(await r.evaluate(()=>window.__skillBattlePreview.panel.buttons.newRun.mouseEnabled),false);
                    await click(r,"warehouse4");await capture(r,"mobile-replacement-compare");
                }
                await click(r,"newRun");
            }
            if(i===1){await click(r,"actions");await choose(r);}
        }
        assert.equal((await flow(r)).build.actives.length,3);
        await capture(r,"mobile-build");
        assert.equal(await r.evaluate(()=>{
            const t=window.__skillBattlePreview.trial;
            const restored=new t.constructor(new t.manager.constructor(),localStorage,()=>Date.now(),t.snapshot.config);
            return restored.error;
        }),"");
        assert.deepEqual(r.errors,[]);assert.deepEqual(r.failed,[]);await r.close();

        for(const [name,viewport] of [["wide",{width:1920,height:1080}],["mobile",{width:844,height:390}]]){
            const page=await newPage(browser,viewport);
            await click(page,"newRun");await click(page,"warehouse0");
            await capture(page,`${name}-choice`);await click(page,"newRun");await click(page,"newRun");await ready(page,"battle");
            await click(page,"skill2");await capture(page,`${name}-battle`);
            assert.deepEqual(page.errors,[]);assert.deepEqual(page.failed,[]);await page.close();
        }
        for(const phase of ["starting","battle","reward"]){
            const page=await newPage(browser);await click(page,"newRun");
            if(phase!=="starting"){await choose(page);await click(page,"newRun");await ready(page,"battle");if(phase==="reward")await win(page);}
            await page.addInitScript(()=>{const now=Date.now;Date.now=()=>now()+1200001;});
            await page.reload();await ready(page);
            assert.equal((await flow(page)).endReason,"timeout");
            assert.equal((await flow(page)).pending,null);await capture(page,`timeout-${phase}`);
            const raw=await page.evaluate(k=>localStorage.getItem(k),key);
            await page.reload();await ready(page);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),raw);
            assert.deepEqual(page.errors,[]);await page.close();
        }
        const animation=await newPage(browser);
        await click(animation,"newRun");await choose(animation);await click(animation,"newRun");await ready(animation,"battle");
        await click(animation,"skill1");await click(animation,"confirm");
        const committed=await state(animation);
        await animation.evaluate(()=>{const now=Date.now;Date.now=()=>now()+1200001;});
        await ready(animation);
        assert.equal((await flow(animation)).endReason,"timeout");
        assert.deepEqual(await state(animation),committed);
        assert.deepEqual(animation.errors,[]);await animation.close();
        const corrupt=await newPage(browser);
        await corrupt.evaluate(k=>localStorage.setItem(k,"broken-build"),key);
        await corrupt.reload();await ready(corrupt);
        assert.ok(await corrupt.evaluate(()=>window.__skillBattlePreview.trial.error));
        await click(corrupt,"reset");await capture(corrupt,"corrupt-confirm");
        await click(corrupt,"resetNo");assert.equal(await corrupt.evaluate(k=>localStorage.getItem(k),key),"broken-build");
        await click(corrupt,"reset");await click(corrupt,"resetYes");
        assert.equal(await corrupt.evaluate(k=>localStorage.getItem(k),key),null);
        assert.deepEqual(corrupt.errors,[]);await corrupt.close();
        console.log("Stage2 browser: real entry/choices/combat/forgo/upgrade/carry/passives/replacement/history/reload; desktop/wide/mobile; initial/combat/reward timeout; corrupt reset, text bounds, control overlaps and canvas pixels passed.");
    }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
