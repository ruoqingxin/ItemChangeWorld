const {chromium}=require("playwright"),sharp=require("sharp"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const {choose,reward}=require("./combat-policy.cjs");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18095";
const out=path.resolve(__dirname,"../bin/qingming-formal-browser");
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
const ready=p=>p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened&&window.__skillBattlePreview.view.isOpened);
async function click(p,key){
    const point=await p.evaluate(key=>{
        const v=window.__skillBattlePreview,n=v.ui.topView?.getElement(key,false)||v.panel.buttons[key];
        if(!n?.visible||!n.mouseEnabled)throw Error(`Unavailable ${key}; ${JSON.stringify({
            node:v.trial.inventory?.node,stamina:v.trial.inventory?.stamina,selected:v.panel.selectedNode,
            page:v.panel.pageRole,pending:v.trial.flow?.pending,battles:v.trial.flow?.battles.length})}`);
        const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return {x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    },key);
    if(p.touchMode)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
    await p.waitForTimeout(75);await ready(p);
    await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
}
async function settled(p){await p.waitForFunction(()=>window.__skillBattlePreview.panel?.opened&&!window.__skillBattlePreview.panel.busy);
    await p.waitForTimeout(75);await ready(p);}
async function shot(p,name){
    const image=await p.screenshot({path:path.join(out,name+".png")});
    const stats=await sharp(image).stats();assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>12));
    const issues=await p.evaluate(()=>{
        const panel=window.__skillBattlePreview.panel,issues=[];
        for(const [key,n]of Object.entries({...panel.labels,...panel.nodes,...panel.expeditionNodes,...panel.buttons})){
            let visible=n.visible;for(let a=n.parent;a;a=a.parent)visible=visible&&a.visible;
            if(!visible)continue;
            let t=n instanceof Laya.GTextField?n:null;
            for(let i=0;!t&&i<n.numChildren;i++)if(n.getChildAt(i) instanceof Laya.GTextField)t=n.getChildAt(i);
            if(!t?.text)continue;t.textIns.typeset(true);
            if(t.textIns.textWidth>t.width+3||t.textIns.textHeight>t.height+3)
                issues.push([key,t.text,t.width,t.height,t.textIns.textWidth,t.textIns.textHeight]);
        }return issues;
    });assert.deepEqual(issues,[],"All visible text fits");
}
async function act(p,key){
    await click(p,key);await click(p,"confirm");await settled(p);
}
async function claim(p){
    const s=await state(p);if(!s.flow?.pending)return;
    const q=s.flow.qingming,key=reward({...q,player:{hp:s.hp,mp:s.mp,maxHp:1000,maxMp:120}},"flex");
    await click(p,"warehouse"+q.offers.indexOf(key));await click(p,"newRun");
    await p.waitForFunction(()=>!window.__skillBattlePreview.trial.flow.pending);
}
async function revealNode(p,id){
    const r=await p.evaluate(()=>{const r=document.querySelector("canvas").getBoundingClientRect();
        return {x:r.left,y:r.top,width:r.width,height:r.height};});
    const blank={x:r.x+r.width*.55,y:r.y+r.height*.88};
    if(p.touchMode)await p.touchscreen.tap(blank.x,blank.y);else await p.mouse.click(blank.x,blank.y);
    await p.waitForTimeout(100);
    for(let i=0;i<16;i++){
        const x=await p.evaluate(id=>{
            const v=window.__skillBattlePreview,n=v.panel.buttons[`expNode${id}`];
            return n.localToGlobal(new Laya.Point(n.width/2,n.height/2)).x/Laya.stage.width;
        },id);
        if(x>.06&&x<.94)return;
        const direction=x<.06?1:-1,a={x:r.x+r.width*(direction===1?.3:.75),y:r.y+r.height*.34};
        const b={x:a.x+direction*r.width*.2,y:a.y};
        if(p.touchMode){
            const c=await p.context().newCDPSession(p);
            await c.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});
            for(let j=1;j<=15;j++){
                await c.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
                    x:a.x+(b.x-a.x)*j/15,y:a.y,id:1}]});await p.waitForTimeout(16);
            }
            await p.waitForTimeout(200);
            await c.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await c.detach();
        }else{
            await p.mouse.move(a.x,a.y);await p.mouse.down();
            await p.mouse.move(b.x,b.y,{steps:20});await p.waitForTimeout(200);await p.mouse.up();
        }
        await p.waitForTimeout(800);
        await p.waitForFunction(()=>!window.__skillBattlePreview.panel.scroller._tweening);
        if(p.touchMode)await p.touchscreen.tap(blank.x,blank.y);else await p.mouse.click(blank.x,blank.y);
        await p.waitForTimeout(100);
    }
    throw Error(`Could not bring map node ${id} into the viewport`);
}
async function walk(p,node){
    const s=await state(p),queue=[[s.node]],seen=new Set([s.node]);let route;
    for(const q of queue){
        const last=q.at(-1);if(last===node){route=q;break;}
        for(const [a,b]of s.map.edges){const n=a===last?b:b===last?a:null;
            if(n&&!seen.has(n)){seen.add(n);queue.push([...q,n]);}}
    }
    assert.ok(route);
    for(const id of route.slice(1)){
        if((await state(p)).phase!=="active")return;
        await revealNode(p,id);
        await click(p,`expNode${id}`);
        const latest=await state(p),n=latest.map.nodes.find(n=>n.id===id);
        if(latest.phase==="active"&&latest.node!==id){
            await p.screenshot({path:path.join(out,"failed-travel.png")});
            console.log(await p.evaluate(id=>{
                const v=window.__skillBattlePreview,n=v.panel.buttons[`expNode${id}`];
                return {target:id,current:v.trial.inventory.node,selected:v.panel.selectedNode,notice:v.panel.notice,
                    phase:v.trial.inventory.phase,pending:v.trial.flow.pending,dragged:v.panel.scroller.isDragged,
                    node:v.trial.inventory.map.nodes.find(n=>n.id===id),
                    point:n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),
                    size:[Laya.stage.width,Laya.stage.height]};
            },id));
            assert.equal(latest.node,id,"Native node click committed travel");
        }
        if(n.qingmingEnemy&&!latest.map.cleared.includes(id))return id;
    }
    if(route.length===1){await revealNode(p,node);await click(p,`expNode${node}`);}
    return node;
}
async function fight(p,limit=100){
    for(let i=0;i<limit;i++){
        const s=await state(p);if(s.phase!=="active"||s.flow.phase!=="battle")return;
        const b=await p.evaluate(()=>window.__skillBattlePreview.trial.state),q=b.qingming;
        const heal=!b.potionUsed&&q.player.hp<=650?b.pouch.findIndex(i=>i?.itemId===301):-1;
        const mana=!b.potionUsed&&q.player.mp<=70?b.pouch.findIndex(i=>i?.itemId===302):-1;
        if(heal>=0||mana>=0){await act(p,`pouch${heal>=0?heal:mana}`);continue;}
        const a=choose(q,"flex");
        if(a.move==="guide")await act(p,`qIntent${a.enemyAction||1}`);
        else await act(p,({basic:"skill1",guard:"skill2",edge:"skill3",wind:"skill4",fall:"qFall",end:"qEnd"})[a.move]);
    }
    throw Error("Fight exceeded action budget");
}
(async()=>{
    await fs.mkdir(out,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"}),results=[];
    try{
        for(const [name,width,height,touch]of [["desktop",1280,720,false],["wide",1560,720,false],["mobile",844,390,true]]){
            const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
            const p=await context.newPage(),errors=[];p.touchMode=touch;
            p.on("pageerror",e=>{errors.push(e.message);console.error(e.stack);});
            await p.addInitScript(()=>{crypto.getRandomValues=a=>{a.fill(1);return a;};localStorage.setItem("other-app","keep");});
            await p.goto(url);await p.waitForFunction(()=>window.__skillBattlePreview?.view?.isOpened);
            const portal=await p.evaluate(()=>{
                const n=window.__skillBattlePreview.view.getElement("btn_realm"),r=document.querySelector("canvas").getBoundingClientRect();
                const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2));
                return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
            });
            if(touch)await p.touchscreen.tap(portal.x,portal.y);else await p.mouse.click(portal.x,portal.y);
            await ready(p);await click(p,"invPrimary");await shot(p,name+"-preparation");
            await click(p,"invPrimary");assert.equal((await state(p)).flow.phase,"ready");
            assert.equal((await state(p)).flow.pending,null);
            await shot(p,name+"-map");
            const first=(await state(p)).map.nodes.filter(n=>n.qingmingEnemy&&n.mainOrder>=0).sort((a,b)=>a.mainOrder-b.mainOrder)[0];
            await walk(p,first.id);await click(p,"expUse");
            assert.equal((await state(p)).flow.phase,"battle");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.state.qingming.ap),3);
            await p.waitForTimeout(300);await shot(p,name+"-battle");
            const before=await state(p);await click(p,"qIntent2");assert.deepEqual(await state(p),before);
            await shot(p,name+"-guide-preview");await click(p,"cancel");
            await act(p,"skill4");
            const used=await p.evaluate(()=>window.__skillBattlePreview.trial.state);
            const slot=used.pouch.findIndex(i=>i?.itemId===302);await act(p,`pouch${slot}`);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.state.qingming.ap),2);
            const saved=await state(p);await p.reload();await ready(p);assert.deepEqual(await state(p),saved);
            await shot(p,name+"-restored");
            await fight(p);assert.equal((await state(p)).phase,"active");await shot(p,name+"-reward");
            const pending=(await state(p)).flow.pending;
            const offered=await state(p);await p.reload();await ready(p);assert.deepEqual(await state(p),offered);
            assert.deepEqual((await state(p)).flow.pending,pending);await claim(p);
            await click(p,"expBuild");await shot(p,name+"-build");await click(p,"newRun");
            assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.expeditionNodes?.expeditionRoot?.visible),true);

            const target=2;
            let sideRoute=false;
            while((await state(p)).phase==="active"&&(await state(p)).flow.battles.length<target){
                const s=await state(p),main=s.map.nodes.filter(n=>n.mainOrder>=0).sort((a,b)=>a.mainOrder-b.mainOrder);
                let next=main.find(n=>n.mainOrder>s.map.nodes.find(v=>v.id===s.node).mainOrder);
                if(!next||sideRoute){
                    sideRoute=true;
                    const queue=[s.node],distance=new Map([[s.node,0]]);
                    for(const last of queue)for(const [a,b]of s.map.edges){
                        const n=a===last?b:b===last?a:null;if(n&&!distance.has(n)){distance.set(n,distance.get(last)+1);queue.push(n);}}
                    next=s.map.nodes.filter(n=>n.qingmingEnemy&&!s.map.cleared.includes(n.id)&&n.kind!=="boss")
                        .sort((a,b)=>distance.get(a.id)-distance.get(b.id))[0];
                }
                if(!next)break;
                const arrived=await walk(p,next.id),fresh=await state(p);
                if(fresh.phase!=="active")break;
                const n=fresh.map.nodes.find(n=>n.id===arrived);
                if(n.qingmingEnemy&&!fresh.map.cleared.includes(n.id)){
                    if(fresh.stamina<(n.kind==="boss"?60:n.kind==="elite"?30:10))break;
                    await click(p,"expUse");await fight(p);
                    if((await state(p)).phase==="active")await claim(p);
                }else if(["borrow","insight","recovery"].includes(n.kind)&&!fresh.map.used.includes(n.id)){
                    const enabled=await p.evaluate(()=>window.__skillBattlePreview.panel.buttons.expUse.mouseEnabled);
                    if(enabled){await click(p,"expUse");await claim(p);}
                }
            }
            const final=await state(p);await shot(p,name+"-route-result");
            assert.equal(await p.evaluate(()=>localStorage.getItem("other-app")),"keep");
            assert.deepEqual(errors,[]);
            results.push({name,battles:final.flow.battles.length,cleared:final.map.cleared.length,
                phase:final.phase,hp:final.hp,mp:final.mp,acquired:final.flow.qingming?.acquired||[],
                actions:final.flow.battles.reduce((n,r)=>n+r.actions.length,0)});
            console.log(JSON.stringify(results.at(-1)));await context.close();
        }
        await fs.writeFile(path.join(out,"results.json"),JSON.stringify(results,null,2));
        console.log("Native Qingming formal UI: three viewports passed.");
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
