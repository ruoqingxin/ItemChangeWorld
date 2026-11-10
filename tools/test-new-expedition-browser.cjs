const {chromium}=require("playwright"),sharp=require("sharp"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18124",out=path.resolve(__dirname,"../bin/stage4-browser");
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
async function ready(p){await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened&&window.__skillBattlePreview.view.isOpened);}
async function click(p,key,settle=true) {
    const pt=await p.evaluate(key=>{
        const preview=window.__skillBattlePreview;
        const b=preview.ui.topView?.getElement(key,false)||preview.panel.buttons[key];
        if(!b?.visible||!b.mouseEnabled)throw Error(`Unavailable ${key}`);
        const a=b.localToGlobal(new Laya.Point(b.width/2,b.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    },key);
    if(p.touchMode)await p.touchscreen.tap(pt.x,pt.y);else await p.mouse.click(pt.x,pt.y);
    await p.waitForTimeout(100);
    await ready(p);
    if(settle)await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
}
async function screenshot(p,name){
    const image=await p.screenshot({path:path.join(out,`${name}.png`)});
    const stats=await sharp(image).stats();assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>12),"Nonblank canvas");
    const bad=await p.evaluate(()=>{
        const {panel}=window.__skillBattlePreview,issues=[];
        for(const [key,n]of Object.entries({...panel.labels,...panel.nodes,...panel.expeditionNodes})){
            if(!n.visible||!(n instanceof Laya.GTextField)||!n.text)continue;
            let visible=true;for(let a=n.parent;a;a=a.parent)if(!a.visible)visible=false;
            if(!visible)continue;
            if(!n.textIns.visible)issues.push([key,"Visible field has hidden text"]);
            n.textIns.typeset(true);
            if(n.textIns.textWidth>n.width+3||n.textIns.textHeight>n.height+3)issues.push([key,n.text,n.width,n.height,n.textIns.textWidth,n.textIns.textHeight]);
        }
        return issues;
    });assert.deepEqual(bad,[],"Text fits its surface");
}
async function checkMapArt(p) {
    await p.waitForFunction(()=>{
        const {panel,trial}=window.__skillBattlePreview;
        return trial.inventory.map.visible.every(id=>panel.buttons[`expNode${id}`].getChildAt(2).texture?.width===128);
    });
    const details=await p.evaluate(()=>{
        const {panel,trial}=window.__skillBattlePreview,s=trial.inventory;
        const kinds={start:"start",transit:"transit",normal:"enemy-normal",elite:"enemy-elite",boss:"enemy-boss",
            borrow:"borrow",insight:"insight",extract:"extract",recovery:"recovery"};
        const issues=[],sources=[];
        for(const id of s.map.visible) {
            const node=trial.archive.config.nodes.find(n=>n.id===id),b=panel.buttons[`expNode${id}`],image=b.getChildAt(2);
            const expected=node.enemy&&s.map.cleared.includes(id)?"battle-loot":
                node.kind==="search"?(node.pool.startsWith("supply")?"supply":"search"):kinds[node.kind];
            if(image.src!==`ui/image/expeditionNodes/node-${expected}.png`)issues.push([id,image.src,expected]);
            if(image.width!==104||image.height!==104)issues.push([id,"unexpected image dimensions"]);
            if(b.y<0||b.y+b.height>panel.expeditionNodes.expViewport.height)issues.push([id,"clipped node"]);
            sources.push(image.src);
        }
        const lines=panel.expeditionNodes.expLines.graphics.cmds.filter(c=>c.cmdID===Laya.DrawLineCmd.ID);
        if(!lines.length)issues.push("missing dashed routes");
        for(const [a,b]of s.map.edges)if(s.map.visible.includes(a)&&s.map.visible.includes(b)) {
            const route=panel.mapRoutes.get(`${a}:${b}`)||[],visible=route.slice(1,-1);
            const length=visible.reduce((sum,v,i)=>sum+(i?Math.hypot(v.x-visible[i-1].x,v.y-visible[i-1].y):0),0);
            if(length<21)issues.push(["missing or too short visible edge",a,b]);
        }
        for(const line of lines)if(Math.hypot(line.toX-line.fromX,line.toY-line.fromY)>12.01)
            issues.push("solid or oversized route segment");
        const aligned=new Map();
        for(const line of lines) {
            const horizontal=Math.abs(line.toY-line.fromY)<0.001,vertical=Math.abs(line.toX-line.fromX)<0.001;
            if(!horizontal&&!vertical)continue;
            const key=`${horizontal?"h":"v"}:${(horizontal?line.fromY:line.fromX).toFixed(3)}`;
            if(!aligned.has(key))aligned.set(key,[]);
            aligned.get(key).push(horizontal?[Math.min(line.fromX,line.toX),Math.max(line.fromX,line.toX)]:
                [Math.min(line.fromY,line.toY),Math.max(line.fromY,line.toY)]);
        }
        for(const [key,intervals]of aligned) {
            intervals.sort((a,b)=>a[0]-b[0]);
            let start=-Infinity,end=-Infinity;
            for(const [a,b]of intervals) {
                if(a>end+0.001){start=a;end=b;}else end=Math.max(end,b);
                if(end-start>12.01)issues.push(["overlapping dashes form a solid route",key,end-start]);
            }
        }
        return{issues,sources};
    });
    assert.deepEqual(details.issues,[],"New icons and short dashed routes are rendered");
    return details.sources;
}
async function checkDashPixels(p) {
    const pair=await p.evaluate(()=>{
        const {panel}=window.__skillBattlePreview,node=panel.expeditionNodes.expLines;
        const commands=node.graphics.cmds.filter(c=>c.cmdID===Laya.DrawLineCmd.ID);
        const viewport=panel.expeditionNodes.expViewport,r=document.querySelector("canvas").getBoundingClientRect();
        const convert=(x,y)=>{
            const point=node.localToGlobal(new Laya.Point(x,y));
            return{x:r.left+point.x*r.width/Laya.stage.width,y:r.top+point.y*r.height/Laya.stage.height};
        };
        for(let i=0;i<commands.length-1;i++) {
            const a=commands[i],b=commands[i+1];
            if(a.fromY!==a.toY||a.toY!==b.fromY||b.fromY!==b.toY)continue;
            const gap=b.fromX-a.toX;
            if(Math.abs(gap)<8||Math.abs(gap)>10||Math.abs(a.toX-a.fromX)<10)continue;
            if(a.fromX<panel.scroller.scrollingPosX+16||b.toX>panel.scroller.scrollingPosX+viewport.width-16)continue;
            return{dash:convert((a.fromX+a.toX)/2,a.fromY),gap:convert((a.toX+b.fromX)/2,a.toY)};
        }
        throw Error("Missing visible dash/gap pixel pair");
    });
    const {data,info}=await sharp(await p.screenshot()).removeAlpha().raw().toBuffer({resolveWithObject:true});
    const sample=point=>{
        const x=Math.max(0,Math.min(info.width-1,Math.round(point.x)));
        const y=Math.max(0,Math.min(info.height-1,Math.round(point.y)));
        return [...data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)];
    };
    const dash=sample(pair.dash),gap=sample(pair.gap);
    assert.ok(dash.reduce((a,b)=>a+b,0)>gap.reduce((a,b)=>a+b,0)+80,
        `A painted dash and a real unpainted gap must differ: ${dash} / ${gap}`);
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
async function visit(p,id) {
    await click(p,`expNode${id}`);
    if(await p.evaluate(()=>{const n=window.__skillBattlePreview.panel.buttons.expUse;return n.visible&&n.mouseEnabled;}))
        await click(p,"expUse");
}
async function pan(p,from,to) {
    const points=await p.evaluate(({from,to})=>{
        const r=document.querySelector("canvas").getBoundingClientRect();
        return[from,to].map(([x,y])=>({x:r.left+x*r.width/Laya.stage.width,y:r.top+y*r.height/Laya.stage.height}));
    },{from,to});
    if(p.touchMode){
        const cdp=await p.context().newCDPSession(p);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...points[0],id:1}]});
        for(let i=1;i<=12;i++){
            const x=points[0].x+(points[1].x-points[0].x)*i/12,y=points[0].y+(points[1].y-points[0].y)*i/12;
            await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x,y,id:1}]});
            await p.waitForTimeout(20);
        }
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();
    }else{
        await p.mouse.move(points[0].x,points[0].y);await p.mouse.down();
        await p.mouse.move(points[1].x,points[1].y,{steps:20});await p.mouse.up();
    }
    await p.waitForTimeout(700);
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
            await checkMapArt(p);await checkDashPixels(p);
            await screenshot(p,`${name}-map`);
            console.log(name,"exits",(await state(p)).map.present.filter(n=>n>=30));
            assert.deepEqual((await state(p)).map.visible.filter(n=>n<=16),[1,2,3,4,5]);
            const blocked=await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode4.mouseEnabled);
            assert.equal(blocked,false);
            assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.buttons.expNext),false);
            const beforeEnemy=await state(p);
            await click(p,"expNode2",false);
            assert.equal((await state(p)).node,2,"Node click commits arrival, independently of combat");
            assert.equal((await state(p)).flow.phase,"ready");
            assert.equal((await state(p)).hp,beforeEnemy.hp);
            assert.deepEqual((await state(p)).items,beforeEnemy.items);
            assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.movement),true);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.visible),false);
            const duringMove=await state(p);
            await p.evaluate(()=>window.__skillBattlePreview.panel.command("expUse"));
            assert.deepEqual(await state(p),duringMove,"An action during movement cannot start combat");
            await screenshot(p,`${name}-moving`);
            await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.expeditionNodes.expContextBackground.visible),true);
            await screenshot(p,`${name}-enemy-action`);
            await p.reload();await ready(p);
            assert.equal((await state(p)).node,2,"Reload restores arrival without starting combat");
            assert.equal((await state(p)).flow.phase,"ready");
            await click(p,"expNode1");assert.equal((await state(p)).node,1,"An unengaged enemy permits retreat");
            await click(p,"expNode2");assert.equal((await state(p)).flow.phase,"ready");
            await click(p,"expUse");await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="battle");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.loot.visible),false);
            await screenshot(p,`${name}-battle`);
            await win(p);
            await openMap(p);assert.equal((await state(p)).map.sources.length,1);
            await checkMapArt(p);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode2.getChildAt(2).src),
                "ui/image/expeditionNodes/node-battle-loot.png","Victory changes enemy marker to the shared loot icon");
            const beforePan=await state(p);
            await pan(p,[900,130],[300,130]);
            const scroll=await p.evaluate(()=>{
                const {panel}=window.__skillBattlePreview;
                return{x:panel.scroller.posX,width:panel.scroller.contentWidth,view:panel.scroller.viewWidth};
            });
            assert.ok(scroll.x<1,"The initial fixed screen cannot be dragged into locked screens");
            assert.ok(Math.abs(scroll.width-scroll.view)<1,"The first screen stays fixed until actual progress");
            assert.deepEqual((await state(p)).map,beforePan.map,"Panning reveals no nodes or rewards");
            await screenshot(p,`${name}-map-scrolled`);
            await pan(p,[300,130],[1100,130]);
            await pan(p,[596,302],[196,302]);
            assert.equal((await state(p)).node,beforePan.node,"Dragging an enemy node does not enter battle");
            assert.equal((await state(p)).flow.phase,"ready");
            await pan(p,[300,130],[1100,130]);
            await click(p,"expNode2");
            assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.nodes.inventoryRoot?.visible),false);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.getChildAt(1).text),"搜索");
            await screenshot(p,`${name}-search-action`);
            await click(p,"expUse");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.inventoryRoot.visible),true);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),true,"First search opening starts automatically");
            assert.equal((await state(p)).map.sources[0].opened,true);
            await screenshot(p,`${name}-first-auto-search`);
            await click(p,"invReveal");
            assert.equal(await p.evaluate(()=>["invAll","invMedicine","invMaterials","invEquipment"].some(k=>window.__skillBattlePreview.panel.nodes[k].visible)),false);
            const beforePages=await state(p);
            for(let i=1;i<=7;i++){
                await click(p,`expLootPage${i}`);
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage),i-1);
            }
            assert.deepEqual(await state(p),beforePages,"Empty pages do not create items or change the save");
            await screenshot(p,`${name}-loot-page7`);
            await click(p,"expLootPage1");
            const hidden=(await state(p)).items.length;
            await screenshot(p,`${name}-unknown`);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.expUnknown.visible),true);
            await click(p,"invReveal");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.expSearchSpinner.visible),true);
            const spinner=await p.evaluate(()=>{
                const {panel}=window.__skillBattlePreview,n=panel.nodes.expSearchSpinner,origin=panel.nodes.invSourceCell0;
                return{x:n.x,y:n.y,cellX:origin.x,cellY:origin.y,colors:n.graphics.cmds.map(c=>c.lineColor)};
            });
            assert.ok(spinner.x>=spinner.cellX&&spinner.y>=spinner.cellY,"Search animation is inside the source grid");
            await p.waitForTimeout(140);
            assert.notDeepEqual(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.expSearchSpinner.graphics.cmds.map(c=>c.lineColor)),spinner.colors,"Search ring visibly rotates");
            await screenshot(p,`${name}-searching`);
            await p.waitForFunction(()=>window.__skillBattlePreview.trial.inventory.map.sources[0].revealed>=1);
            if(await p.evaluate(()=>window.__skillBattlePreview.trial.searching))await click(p,"invReveal");
            assert.ok((await state(p)).items.length>hidden);
            const visibleUids=await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.map(i=>i.uid));
            await click(p,"expLootPage7");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.length),0);
            await click(p,"expLootPage1");
            assert.deepEqual(await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.map(i=>i.uid)),visibleUids);
            const before=await state(p);
            await p.reload();await ready(p);assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
            assert.deepEqual((await state(p)).map.sources,before.map.sources);
            // Restore opens map; visit the source and drag a potion/material into available bag space.
            await openMap(p);await visit(p,2);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false,"Reopening retains manual pause");
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
            await click(p,"invToggle");await visit(p,3);await win(p);await openMap(p);
            await visit(p,4);await choose(p);await openMap(p);
            if((await state(p)).map.present.includes(30)) {
                await visit(p,30);assert.equal((await state(p)).phase,"active");
                await click(p,"dialogCancel");assert.equal((await state(p)).phase,"active");
                await click(p,"expUse");
                await click(p,"dialogConfirm");assert.equal((await state(p)).result,"extract");
                await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="settlement");
                await screenshot(p,`${name}-extracted`);
            } else {
                await click(p,"expAbandon");assert.equal((await state(p)).phase,"active");
                await click(p,"dialogConfirm");assert.equal((await state(p)).result,"abandon");
            }
            assert.equal(await p.evaluate(()=>localStorage.getItem("other-app")),"keep");
            if(name==="desktop"){
                await click(p,"invPrimary");
                await p.waitForFunction(()=>window.__skillBattlePreview.panel.screen==="start");
                await click(p,"invPrimary");await choose(p);await openMap(p);
                await visit(p,2);await win(p);await openMap(p);
                await visit(p,3);await win(p);await openMap(p);await visit(p,4);
                assert.equal((await state(p)).flow.pending.kind,"active");
                await choose(p);await openMap(p);
                const usedBeforeReturn=(await state(p)).map.used;
                await pan(p,[300,130],[1100,130]);
                await visit(p,1);
                const cameraBefore=await p.evaluate(()=>window.__skillBattlePreview.panel.scroller.scrollingPosX);
                await click(p,"expNode4",false);
                const cameraDuring=await p.evaluate(()=>{
                    const {panel}=window.__skillBattlePreview;
                    return{x:panel.scroller.scrollingPosX,target:panel.movement?.cameraTo,
                        markerX:panel.expeditionNodes.expPlayer.x};
                });
                assert.ok(cameraDuring.x>cameraBefore&&cameraDuring.x<cameraDuring.target,"Camera follows continuously, not an instant jump");
                await screenshot(p,"desktop-camera-follow");
                await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
                const cameraAfter=await p.evaluate(()=>window.__skillBattlePreview.panel.scroller.scrollingPosX);
                assert.ok(Math.abs(cameraAfter-cameraDuring.target)<1);
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.getChildAt(1).text),"已使用");
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.mouseEnabled),false);
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expNode4.getChildAt(2).grayed),false,
                    "A used reward is not a fully searched exploration source");
                assert.equal((await state(p)).node,4,"Used reward node remains a travel destination");
                assert.deepEqual((await state(p)).map.used,usedBeforeReturn);
                assert.equal((await state(p)).flow.pending,null,"Revisiting does not grant another reward");
                await click(p,"expNode17");assert.equal((await state(p)).node,17);
                assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.nodes.inventoryRoot?.visible),false);
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),false);
                await screenshot(p,"desktop-resource-action");
                const sourceCamera=await p.evaluate(()=>window.__skillBattlePreview.panel.scroller.scrollingPosX);
                await click(p,"expUse");
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.searching),true);
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
                await click(p,"invToggle");
                assert.ok(Math.abs(await p.evaluate(()=>window.__skillBattlePreview.panel.scroller.scrollingPosX)-sourceCamera)<1,
                    "Inventory return retains the manually framed map");
                await visit(p,5);
                await win(p,false);assert.equal((await state(p)).flow.pending.kind,"passive");
                await screenshot(p,"desktop-mandatory-passive");
                assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.nodes.inventoryRoot?.visible),false);
                await choose(p);await openMap(p);assert.equal((await state(p)).flow.paidChoices,1);
                await screenshot(p,"desktop-third-victory");
                const recoveryParent=await p.evaluate(()=>{
                    const {panel,trial}=window.__skillBattlePreview;
                    window.__stage4LayoutRestore=trial.archive;
                    window.__stage4SelectedRestore=panel.selectedNode;
                    trial.save.state.map.visible=[...trial.save.state.map.present];
                    const edge=trial.save.state.map.edges.find(e=>e.includes(28)),parent=edge.find(id=>id!==28);
                    trial.save.state.node=parent;
                    if(!trial.save.state.revealed.includes(parent))trial.save.state.revealed.push(parent);
                    panel.centerMap=true;panel.refresh();
                    return parent;
                });
                const overlap=await p.evaluate(()=>{
                    const {panel,trial}=window.__skillBattlePreview,issues=[];
                    const nodes=trial.inventory.map.visible.map(id=>panel.buttons[`expNode${id}`]);
                    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
                        const a=nodes[i],b=nodes[j];
                        if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)
                            issues.push([a.name,b.name]);
                    }
                    return issues;
                });
                assert.deepEqual(overlap,[],"Expanded branch nodes have separate hit areas");
                const crossedCaptions=await p.evaluate(()=>{
                    const {panel,trial}=window.__skillBattlePreview,issues=[];
                    const points=new Map(trial.inventory.map.visible.map(id=>{
                        const b=panel.buttons[`expNode${id}`],icon=b.getChildAt(2);
                        return[id,{x:b.x+icon.x+icon.width/2,y:b.y+icon.y+icon.height/2}];
                    }));
                    for(const edge of trial.inventory.map.edges){
                        if(!edge.every(id=>points.has(id)))continue;
                        panel.renderMapConnections(points,[edge]);
                        if(!panel.expeditionNodes.expLines.graphics.cmds.length)issues.push(["missing connection",...edge]);
                    }
                    panel.renderMapConnections(points,trial.inventory.map.edges);
                    const lines=panel.expeditionNodes.expLines.graphics.cmds.filter(c=>c.cmdID===Laya.DrawLineCmd.ID);
                    if(!lines.length)throw Error("Missing map connections");
                    for(const line of lines)for(const id of trial.inventory.map.visible){
                        const b=panel.buttons[`expNode${id}`],caption=b.getChildAt(1);
                        caption.textIns.typeset(true);
                        const half=caption.textIns.textWidth/2+1,center=b.x+caption.x+caption.width/2;
                        let low=0,high=1;
                        for(const [start,delta,min,max]of[
                            [line.fromX,line.toX-line.fromX,center-half,center+half],
                            [line.fromY,line.toY-line.fromY,b.y+caption.y-2,b.y+caption.y+caption.height+2]]){
                            if(delta===0){if(start<min||start>max){high=-1;break;}}
                            else{
                                const a=(min-start)/delta,c=(max-start)/delta;
                                low=Math.max(low,Math.min(a,c));high=Math.min(high,Math.max(a,c));
                            }
                        }
                        if(low<=high)issues.push([id,line.fromX,line.fromY,line.toX,line.toY]);
                    }
                    return issues;
                });
                assert.deepEqual(crossedCaptions,[],"Map connections do not cross node captions");
                const allKinds=await checkMapArt(p);
                assert.equal(new Set(allKinds).size,12,"Full revealed fixture loads all twelve new node icon categories");
                await screenshot(p,"desktop-expanded-map-fixture");
                await p.evaluate(()=>{
                    const {panel,trial}=window.__skillBattlePreview;
                    trial.save.state.node=28;trial.save.state.revealed.push(28);
                    panel.selectedNode=28;panel.centerMap=true;panel.refresh();
                });
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.getChildAt(1).text),"休息");
                assert.equal((await state(p)).map.used.includes(28),false,"Arrival does not consume recovery");
                await screenshot(p,"desktop-recovery-action-fixture");
                await p.evaluate(()=>{
                    const {panel,trial}=window.__skillBattlePreview;
                    trial.save=window.__stage4LayoutRestore;delete window.__stage4LayoutRestore;
                    panel.selectedNode=window.__stage4SelectedRestore;delete window.__stage4SelectedRestore;
                    panel.centerMap=true;panel.refresh();
                });
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
