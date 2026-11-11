const {chromium}=require("playwright"),sharp=require("sharp"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18138",out=path.resolve(__dirname,"../bin/stage4-resources-browser");
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
const ready=p=>p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened&&window.__skillBattlePreview.view.isOpened);
async function point(p,key){return p.evaluate(key=>{
    const v=window.__skillBattlePreview,n=v.ui.topView?.getElement(key,false)||v.panel.buttons[key];
    if(!n?.visible||!n.mouseEnabled)throw Error(`Unavailable ${key}`);
    const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
    return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
},key);}
async function click(p,key,movement=true){const a=await point(p,key);
    if(p.touchMode)await p.touchscreen.tap(a.x,a.y);else await p.mouse.click(a.x,a.y);
    await p.waitForTimeout(100);await ready(p);
    if(movement)await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
}
async function blank(p){const a=await p.evaluate(()=>{const r=document.querySelector("canvas").getBoundingClientRect();
    return{x:r.left+r.width*.55,y:r.top+r.height*.88};});
    if(p.touchMode)await p.touchscreen.tap(a.x,a.y);else await p.mouse.click(a.x,a.y);await p.waitForTimeout(100);
}
async function shot(p,name){
    const image=await p.screenshot({path:path.join(out,`${name}.png`)}),stats=await sharp(image).stats();
    assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>12),"Canvas is nonblank");
    const issues=await p.evaluate(()=>{
        const panel=window.__skillBattlePreview.panel,issues=[];
        for(const [key,n]of Object.entries({...panel.labels,...panel.nodes,...panel.expeditionNodes})){
            if(!(n instanceof Laya.GTextField)||!n.visible||!n.text)continue;
            let visible=true;for(let a=n.parent;a;a=a.parent)if(!a.visible)visible=false;if(!visible)continue;
            n.textIns.typeset(true);if(n.textIns.textWidth>n.width+3||n.textIns.textHeight>n.height+3)
                issues.push([key,n.text,n.width,n.height,n.textIns.textWidth,n.textIns.textHeight]);
        }return issues;
    });assert.deepEqual(issues,[],"Text fits");
}
async function choose(p){while((await state(p)).flow.pending){await click(p,"warehouse0");await click(p,"newRun");}}
async function openMap(p){if(!await p.evaluate(()=>!!window.__skillBattlePreview.panel.expeditionNodes?.expeditionRoot?.visible))
    await click(p,"invToggle");}
async function win(p){
    for(let i=0;i<30&&(await state(p)).flow.phase==="battle";i++){
        const need=await p.evaluate(()=>{const s=window.__skillBattlePreview.trial.state;
            return s.player.hp<=2500&&!s.potionUsed?s.pouch.findIndex(i=>i?.itemId===1):-1;});
        if(need>=0){await click(p,`pouch${need}`);await click(p,"confirm");await p.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);}
        await click(p,"skill1");await click(p,"confirm");await p.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
    }
    await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen!=="battle");
    assert.equal((await state(p)).phase,"active");await choose(p);await openMap(p);
}
async function drag(p,from,to){
    const a=await point(p,from),b=await point(p,to);
    await dragPoints(p,a,b);
}
async function dragPoints(p,a,b){
    if(p.touchMode){
        const c=await p.context().newCDPSession(p);
        await c.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});await p.waitForTimeout(180);
        for(let i=1;i<=12;i++)await c.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
            x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});
        await p.waitForTimeout(120);await c.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await c.detach();
    }else{
        await p.mouse.move(a.x,a.y);await p.mouse.down();await p.waitForTimeout(180);
        await p.mouse.move(b.x,b.y,{steps:15});await p.waitForTimeout(120);await p.mouse.up();
    }await p.waitForTimeout(200);
}
async function pan(p,left=true){
    const points=await p.evaluate(left=>{const r=document.querySelector("canvas").getBoundingClientRect();
        return(left?[[900,245],[350,245]]:[[350,245],[1100,245]]).map(([x,y])=>({
            x:r.left+x*r.width/Laya.stage.width,y:r.top+y*r.height/Laya.stage.height}));},left);
    if(p.touchMode){
        const c=await p.context().newCDPSession(p);
        await c.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...points[0],id:1}]});
        for(let i=1;i<=15;i++){await c.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
            x:points[0].x+(points[1].x-points[0].x)*i/15,y:points[0].y,id:1}]});await p.waitForTimeout(20);}
        await c.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await c.detach();
    }else{
        await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();
        await p.mouse.move(points[1].x,points[1].y,{steps:20});await p.mouse.up();
    }await p.waitForTimeout(700);
}
async function mapCheck(p){
    await p.waitForFunction(()=>{const {panel,trial}=window.__skillBattlePreview;
        return trial.inventory.map.nodes.filter(n=>panel.buttons[`expNode${n.id}`].visible)
            .every(n=>panel.buttons[`expNode${n.id}`].getChildAt(2).texture?.width===128);});
    const d=await p.evaluate(()=>{
        const {panel,trial}=window.__skillBattlePreview,s=trial.inventory,nodes=s.map.nodes,issues=[];
        const shown=nodes.filter(n=>panel.buttons[`expNode${n.id}`].visible),width=panel.scroller.contentWidth,view=panel.scroller.viewWidth;
        const end=112+Math.max(...nodes.map(n=>n.x))*242+80,expected=Math.min(end,view+(s.revealed.length-1)*484);
        if(Math.abs(width-expected)>1)issues.push(["width",width,expected]);
        for(const n of shown){
            const b=panel.buttons[`expNode${n.id}`],image=b.getChildAt(2);
            if(b.alpha!==1||image.alpha!==1||image.color!=="#ffffff")issues.push(["tint",n.id]);
            if(b.y<0||b.y+b.height>panel.expeditionNodes.expViewport.height)issues.push(["clipped",n.id]);
        }
        const lines=panel.expeditionNodes.expLines.graphics.cmds.filter(c=>c.cmdID===Laya.DrawLineCmd.ID);
        if(!lines.length)issues.push("No lines");
        if(lines.some(l=>Math.hypot(l.toX-l.fromX,l.toY-l.fromY)>12.01))issues.push("Non-dashed line");
        for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
            const a=nodes[i],b=nodes[j];if(Math.abs((a.x-b.x)*242)<116&&Math.abs((a.y-b.y)*128)<116)
                issues.push(["overlap",a.id,b.id]);
        }
        return{issues,width,view,shown:shown.length,total:nodes.length};
    });assert.deepEqual(d.issues,[]);return d;
}
(async()=>{
    await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{for(const [name,width,height,touch]of [["desktop",1280,720,false],["wide",1560,720,false],["mobile",844,390,true]]){
        const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await context.newPage(),errors=[];
        p.touchMode=touch;p.on("pageerror",e=>errors.push(e.message));await p.addInitScript(()=>{
            crypto.getRandomValues=a=>{a.fill(1);return a;};localStorage.setItem("other-app","keep");
        });
        await p.goto(url);await ready(p);await click(p,"invPrimary");await shot(p,`${name}-preparation`);
        // Bring the actual small potion by real drag; no permanent inventory or synthetic source.
        const small=await p.evaluate(()=>{const v=window.__skillBattlePreview;return v.panel.visibleItems.findIndex(i=>i.templateId===36);});
        await drag(p,`invList${small}`,"invCell_bag_1");assert.equal((await state(p)).items.find(i=>i.templateId===36).location.space,"bag");
        await click(p,"invPrimary");await choose(p);await openMap(p);
        let d=await mapCheck(p);assert.ok(Math.abs(d.width-d.view)<1);assert.ok(d.shown<d.total);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.labels.expStamina.text),"1000 / 1000");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.labels.expWeight.text),"10 / 20");
        await shot(p,`${name}-birth`);
        await click(p,"expNode2",false);assert.equal((await state(p)).node,2);assert.equal((await state(p)).stamina,980);
        assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.movement),true);
        await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);d=await mapCheck(p);
        assert.ok(Math.abs(d.width-d.view-484)<1);await shot(p,`${name}-expanded`);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.expeditionNodes.expContextBackground.visible),true);
        const before=await state(p);await blank(p);assert.deepEqual(await state(p),before);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.expeditionNodes.expContextBackground.visible),false);
        await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.expeditionNodes.expContextBackground.visible),false);
        const panBefore=await state(p);await pan(p);
        const scroll=await p.evaluate(()=>window.__skillBattlePreview.panel.scroller.scrollingPosX);
        assert.ok(scroll>0&&scroll<=485);assert.deepEqual(await state(p),panBefore);
        await pan(p,false);
        await click(p,"expNode2");assert.equal((await state(p)).stamina,980,"Same-node selection is not movement");
        await click(p,"expNode1");await click(p,"expNode2");assert.equal((await state(p)).stamina,940);
        d=await mapCheck(p);assert.ok(Math.abs(d.width-d.view-484)<1);
        const enemy=(await state(p)).map.nodes.find(n=>n.enemy&&n.mainOrder>=0);
        await click(p,`expNode${enemy.id}`);assert.equal((await state(p)).flow.phase,"ready");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode2.mouseEnabled),false);
        const blocked=await state(p);await p.evaluate(()=>window.__skillBattlePreview.panel.command("expNode2"));assert.deepEqual(await state(p),blocked);
        await shot(p,`${name}-enemy-locked`);
        await p.reload();await ready(p);await openMap(p);assert.equal((await state(p)).node,enemy.id);
        if(name==="desktop"){
            const beforeResize=await state(p);await p.setViewportSize({width:1560,height:720});await p.waitForTimeout(300);
            await mapCheck(p);assert.deepEqual(await state(p),beforeResize);await shot(p,"desktop-resized");
            await p.setViewportSize({width:1280,height:720});await p.waitForTimeout(300);await mapCheck(p);
        }
        await click(p,`expNode${enemy.id}`);await click(p,"expStorage");
        const smallKey=await p.evaluate(()=>`invItem${window.__skillBattlePreview.panel.gridItems.findIndex(i=>i.templateId===36)}`);
        await click(p,smallKey);await click(p,"invUse");await click(p,"invConfirm");
        assert.equal((await state(p)).stamina,1000);assert.equal((await state(p)).items.find(i=>i.templateId===36).location.space,"consumed");
        await click(p,"invToggle");await click(p,`expNode${enemy.id}`);await click(p,"expUse");
        assert.equal((await state(p)).stamina,990);await shot(p,`${name}-battle`);await win(p);
        assert.equal((await state(p)).map.sources.length,1);await click(p,`expNode${enemy.id}`);
        const prior=(await state(p)).stamina;await click(p,"expUse");assert.equal((await state(p)).stamina,prior-5);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),true);await shot(p,`${name}-searching`);
        await p.waitForFunction(()=>window.__skillBattlePreview.trial.inventory.map.sources[0].revealed>=1);
        if(await p.evaluate(()=>window.__skillBattlePreview.trial.searching))await click(p,"invReveal");
        const paused=await state(p);for(let page=1;page<=7;page++)await click(p,`expLootPage${page}`);
        assert.deepEqual(await state(p),paused);await shot(p,`${name}-source-page7`);await click(p,"expLootPage1");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.invSourceCell55.visible),true);
        const first=0;
        assert.ok(await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.length>0));
        {
            const uid=await p.evaluate(i=>window.__skillBattlePreview.panel.visibleItems[i].uid,first);
            const original=await p.evaluate(uid=>{const s=window.__skillBattlePreview.trial.inventory;
                return s.sourceLayouts.find(x=>x.node===s.node).slots.find(x=>x.uid===uid);},uid);
            await drag(p,`invList${first}`,"invCell_bag_5");assert.equal((await state(p)).items.find(i=>i.uid===uid).location.space,"bag");
            const bagKey=await p.evaluate(uid=>`invItem${window.__skillBattlePreview.panel.gridItems.findIndex(i=>i.uid===uid)}`,uid);
            // Return to the same actual footprint, not an implicit drop list.
            const a=await point(p,bagKey),b=await p.evaluate(({uid,slot})=>{
                const v=window.__skillBattlePreview,s=v.trial.inventory,item=s.items.find(i=>i.uid===uid);
                const t=v.trial.archive.config.templates.find(t=>t.id===item.templateId);
                const w=item.location.rotated?t.height:t.width,h=item.location.rotated?t.width:t.height;
                const n=v.panel.nodes.invSourceCell0,r=document.querySelector("canvas").getBoundingClientRect();
                const q=n.localToGlobal(new Laya.Point(slot.x*56+(w*56-2)/2,slot.y*56+(h*56-2)/2));
                return{x:r.left+q.x*r.width/Laya.stage.width,y:r.top+q.y*r.height/Laya.stage.height};
            },{uid,slot:original});
            await dragPoints(p,a,b);
            assert.equal((await state(p)).items.find(i=>i.uid===uid).location.space,"source");
        }
        assert.equal((await state(p)).items.some(i=>i.location.space==="ground"),false);
        await shot(p,`${name}-source-revealed`);const saved=await state(p);await p.reload();await ready(p);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
        assert.deepEqual((await state(p)).map.sources,saved.map.sources);assert.deepEqual((await state(p)).sourceLayouts,saved.sourceLayouts);
        await openMap(p);await click(p,`expNode${enemy.id}`);const stamina=(await state(p)).stamina;await click(p,"expUse");
        assert.equal((await state(p)).stamina,stamina);assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
        await click(p,"invToggle");
        // Layout-only fixture opens every generated node, then restores the exact saved run before any command.
        const original=await state(p);
        await p.evaluate(()=>{const {trial,panel}=window.__skillBattlePreview;
            window.__layoutOriginal=trial.archive;trial.save.state.revealed=[...trial.inventory.map.present];
            panel.refresh();panel.scroller.posX=panel.scroller.contentWidth-panel.scroller.viewWidth;});
        await mapCheck(p);await p.waitForTimeout(200);
        const finalFrame=await p.evaluate(()=>{
            const {trial,panel}=window.__skillBattlePreview,last=trial.inventory.map.nodes.find(n=>n.x===27);
            const n=panel.buttons[`expNode${last.id}`],a=n.localToGlobal(new Laya.Point(n.width,n.height));
            return{right:a.x,stage:Laya.stage.width,dynamic:trial.inventory.map.nodes.filter(n=>n.id>32)
                .every(n=>panel.buttons[`expNode${n.id}`].visible&&panel.buttons[`expNode${n.id}`].getChildAt(2).texture?.width===128)};
        });
        assert.ok(finalFrame.dynamic);assert.ok(finalFrame.right<=finalFrame.stage+1);
        await shot(p,`${name}-last-node-layout`);
        await p.evaluate(()=>{const {trial,panel}=window.__skillBattlePreview;
            trial.save=window.__layoutOriginal;delete window.__layoutOriginal;panel.centerMap=true;panel.refresh();});
        assert.deepEqual(await state(p),original);
        await click(p,"expAbandon");await click(p,"dialogCancel");assert.equal((await state(p)).phase,"active");
        await click(p,"expAbandon");await click(p,"dialogConfirm");assert.equal((await state(p)).result,"abandon");
        await shot(p,`${name}-settlement`);assert.equal(await p.evaluate(()=>localStorage.getItem("other-app")),"keep");assert.deepEqual(errors,[]);
        await context.close();console.log(`PASS stage4 ${name}: progressive map, enemy lock, potion, seven-page source, search fee, drag and reload`);
    }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
