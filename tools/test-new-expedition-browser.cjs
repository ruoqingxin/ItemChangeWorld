const {chromium}=require("playwright"),sharp=require("sharp"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18124",out=path.resolve(__dirname,"../bin/stage4-browser");
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
async function ready(p){await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened);}
async function click(p,key) {
    const pt=await p.evaluate(key=>{
        const b=window.__skillBattlePreview.panel.buttons[key];
        if(!b?.visible||!b.mouseEnabled)throw Error(`Unavailable ${key}`);
        const a=b.localToGlobal(new Laya.Point(b.width/2,b.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    },key);
    if(p.touchMode)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);
    await p.waitForTimeout(100);
}
async function screenshot(p,name){
    const image=await p.screenshot({path:path.join(out,`${name}.png`)});
    const stats=await sharp(image).stats();assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>12),"Nonblank canvas");
    const bad=await p.evaluate(()=>{
        const {panel}=window.__skillBattlePreview,issues=[];
        for(const [key,n]of Object.entries({...panel.labels,...panel.nodes,...panel.expeditionNodes})){
            if(!n.visible||n.parent&&!n.parent.visible||!(n instanceof Laya.GTextField)||!n.text)continue;
            n.textIns.typeset(true);
            if(n.textIns.textWidth>n.width+3||n.textIns.textHeight>n.height+3)issues.push([key,n.text,n.width,n.height,n.textIns.textWidth,n.textIns.textHeight]);
        }
        return issues;
    });assert.deepEqual(bad,[],"Text fits its surface");
}
async function choose(p){
    while((await state(p)).flow.pending){
        await click(p,"warehouse0");await click(p,"newRun");
    }
}
async function win(p,chooseReward=true){
    for(let i=0;i<20;i++){
        const s=await state(p);if(s.flow.phase!=="battle")break;
        if(s.hp<=2500) {
            const slot=await p.evaluate(()=>window.__skillBattlePreview.trial.state.pouch.findIndex(i=>i?.itemId===1));
            if(slot>=0&&!await p.evaluate(()=>window.__skillBattlePreview.trial.state.potionUsed)){
                await click(p,`pouch${slot}`);await click(p,"confirm");
                await p.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
            }
        }
        await click(p,"skill1");await click(p,"confirm");
        await p.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
    }
    await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen!=="battle");
    assert.equal((await state(p)).phase,"active");
    if(chooseReward)await choose(p);
    // The post-battle settlement view projects the same map/storage session.
}
async function openMap(p){
    if(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes?.inventoryRoot?.visible))await click(p,"invToggle");
    else if(!await p.evaluate(()=>window.__skillBattlePreview.panel.expeditionNodes?.expeditionRoot?.visible))await click(p,"invToggle");
}
async function drag(p,fromKey,toKey) {
    const points=await p.evaluate(({fromKey,toKey})=>{
        const panel=window.__skillBattlePreview.panel,r=document.querySelector("canvas").getBoundingClientRect();
        const convert=n=>{const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2));
            return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};};
        return[convert(panel.buttons[fromKey]),convert(panel.buttons[toKey])];
    },{fromKey,toKey});
    if(p.touchMode){
        const cdp=await p.context().newCDPSession(p),a=points[0],b=points[1];
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:a.x,y:a.y,id:1}]});
        await p.waitForTimeout(180);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:b.x,y:b.y,id:1}]});
        await p.waitForTimeout(120);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();
    }else{
        await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();await p.waitForTimeout(150);
        await p.mouse.move(points[1].x,points[1].y,{steps:15});await p.waitForTimeout(120);await p.mouse.up();
    }await p.waitForTimeout(150);
}
(async()=>{
    await fs.mkdir(out,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        for(const [name,width,height,touch]of[["desktop",1280,720,false],["wide",1920,1080,false],["mobile",844,390,true]]){
            const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await context.newPage();
            p.touchMode=touch;const errors=[];p.on("pageerror",e=>errors.push(e.message));
            await p.addInitScript(()=>{
                localStorage.setItem("other-app","keep");
                crypto.getRandomValues=a=>{a.fill(1);return a;};
            });
            await p.goto(url);await ready(p);
            await click(p,"invPrimary");assert.equal((await state(p)).phase,"preparation");
            await screenshot(p,`${name}-preparation`);
            await click(p,"invPrimary");assert.equal((await state(p)).flow.pending.kind,"start");
            await choose(p);await openMap(p);
            await screenshot(p,`${name}-map`);
            console.log(name,"exits",(await state(p)).map.present.filter(n=>n>=30));
            assert.deepEqual((await state(p)).map.visible.filter(n=>n<=16),[1,2,3,4,5]);
            const blocked=await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode4.mouseEnabled);
            assert.equal(blocked,false);
            await click(p,"expNode2");await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="battle");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.loot.visible),false);
            await screenshot(p,`${name}-battle`);
            await win(p);
            await openMap(p);assert.equal((await state(p)).map.sources.length,1);
            await click(p,"expStorage");
            const hidden=(await state(p)).items.length;
            await screenshot(p,`${name}-unknown`);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.expUnknown.visible),true);
            await click(p,"invReveal");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.expSearchSpinner.visible),true);
            await screenshot(p,`${name}-searching`);
            await p.waitForFunction(()=>window.__skillBattlePreview.trial.inventory.map.sources[0].revealed>=1);
            if(await p.evaluate(()=>window.__skillBattlePreview.trial.searching))await click(p,"invReveal");
            assert.ok((await state(p)).items.length>hidden);
            const before=await state(p);
            await p.reload();await ready(p);assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
            assert.deepEqual((await state(p)).map.sources,before.map.sources);
            // Restore opens map; visit the source and drag a potion/material into available bag space.
            await openMap(p);await click(p,"expStorage");
            const first=await p.evaluate(()=>{
                const {trial,panel}=window.__skillBattlePreview;
                return panel.visibleItems.findIndex(i=>{const t=trial.archive.config.templates.find(t=>t.id===i.templateId);
                    return t.width===1&&t.height===1;});
            });
            if(first>=0){
                const uid=await p.evaluate(i=>window.__skillBattlePreview.panel.visibleItems[i].uid,first);
                await drag(p,`invList${first}`,"invCell_bag_1");
                assert.equal((await state(p)).items.find(i=>i.uid===uid).location.space,"bag");
            }
            await screenshot(p,`${name}-revealed`);
            await click(p,"invToggle");await click(p,"expNode3");await win(p);await openMap(p);
            await click(p,"expNode4");
            if((await state(p)).map.present.includes(30)) {
                await click(p,"expNode30");await click(p,"expUse");assert.equal((await state(p)).phase,"active");
                await click(p,"expAbandon");assert.equal((await state(p)).phase,"active");
                await click(p,"expUse");
                await click(p,"expUse");assert.equal((await state(p)).result,"extract");
                await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="settlement");
                await screenshot(p,`${name}-extracted`);
            } else {
                await click(p,"expAbandon");assert.equal((await state(p)).phase,"active");
                await click(p,"expAbandon");assert.equal((await state(p)).result,"abandon");
            }
            assert.equal(await p.evaluate(()=>localStorage.getItem("other-app")),"keep");
            if(name==="desktop"){
                await click(p,"invPrimary");
                await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="start");
                await click(p,"invPrimary");await choose(p);await openMap(p);
                await click(p,"expNode2");await win(p);await openMap(p);
                await click(p,"expNode3");await win(p);await openMap(p);await click(p,"expNode4");
                await click(p,"expUse");assert.equal((await state(p)).flow.pending.kind,"active");
                await choose(p);await openMap(p);await click(p,"expNode17");await click(p,"expStorage");
                await click(p,"invReveal");
                await p.waitForFunction(()=>window.__skillBattlePreview.trial.inventory.map.sources.find(b=>b.node===17).revealed>=1);
                await drag(p,"invList0","invCell_bag_1");
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
                const bagHpKey=await p.evaluate(()=>{
                    const {panel,trial}=window.__skillBattlePreview;
                    return `invItem${panel.gridItems.findIndex(i=>i.templateId===1)}`;
                });
                await click(p,bagHpKey);await click(p,"invUse");await click(p,"invConfirm");
                const nextKey=await p.evaluate(()=>{
                    const {panel}=window.__skillBattlePreview;
                    return `invItem${panel.gridItems.findIndex(i=>i.templateId===1&&i.location.space==="bag")}`;
                });
                await click(p,nextKey);await click(p,"invUse");await click(p,"invConfirm");
                await click(p,"invToggle");await click(p,"expNode4");await click(p,"expNode5");
                await win(p,false);assert.equal((await state(p)).flow.pending.kind,"passive");
                await screenshot(p,"desktop-mandatory-passive");
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.inventoryRoot.visible),false);
                await choose(p);await openMap(p);assert.equal((await state(p)).flow.paidChoices,1);
                await screenshot(p,"desktop-third-victory");
                await p.evaluate(()=>{const now=Date.now.bind(Date);Date.now=()=>now()+1200000;});
                await p.waitForFunction(()=>window.__skillBattlePreview.trial.inventory.phase==="ended");
                assert.equal((await state(p)).result,"timeout");
                await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="settlement").catch(async error=>{
                    console.error("Timeout UI",await p.evaluate(()=>{
                        const {panel,trial}=window.__skillBattlePreview;
                        return{screen:panel.screen,busy:panel.busy,opened:panel.opened,notice:panel.notice,
                            phase:trial.inventory.phase,result:trial.inventory.result};
                    }));
                    throw error;
                });
                await screenshot(p,"desktop-timeout");
                await p.reload();await ready(p);
                assert.equal((await state(p)).result,"timeout");
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.screen),"settlement");
                await click(p,"invPrimary");
                await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="start");
                assert.equal((await state(p)).phase,"preparation");
            }
            assert.deepEqual(errors,[]);await context.close();console.log(`PASS stage4 ${name}: real input, source, restore, drag and settlement`);
        }
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
