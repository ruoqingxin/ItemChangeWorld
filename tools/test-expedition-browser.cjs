const {chromium}=require("playwright"),sharp=require("sharp"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18095",out=path.resolve(__dirname,"../bin/expedition-browser");
async function click(p,key,manual=false){
    const a=await p.evaluate(({key,manual})=>{
        const v=manual?window.__manualTestPreview:window.__skillBattlePreview;
        const n=manual?v.view.getElement(key,false)||v.panel.buttons[key]:
            v.ui.topView?.getElement(key,false)||v.panel.buttons[key];
        if(!n?.visible||!n.mouseEnabled)throw Error("控件不可用："+key);
        const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    },{key,manual});
    if(p.touchMode)await p.touchscreen.tap(a.x,a.y);else await p.mouse.click(a.x,a.y);
    await p.waitForTimeout(150);
}
async function shot(p,name){
    const bytes=await p.screenshot({path:path.join(out,name+".png")}),stats=await sharp(bytes).stats();
    assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>12),"画布应有有效内容");
}
async function drag(p,from,to){
    const points=await p.evaluate(({from,to})=>{
        const v=window.__skillBattlePreview,r=document.querySelector("canvas").getBoundingClientRect();
        return[from,to].map(key=>{
            const n=v.panel.buttons[key]||v.panel.nodes[key],q=n.localToGlobal(new Laya.Point(n.width/2,n.height/2));
            return{x:r.left+q.x*r.width/Laya.stage.width,y:r.top+q.y*r.height/Laya.stage.height};
        });
    },{from,to});
    const [a,b]=points;
    if(p.touchMode){
        const c=await p.context().newCDPSession(p);
        await c.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});
        for(let i=1;i<=12;i++)await c.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
            x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12,id:1}]});
        await c.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await c.detach();
    }else{
        await p.mouse.move(a.x,a.y);await p.mouse.down();await p.waitForTimeout(180);
        await p.mouse.move(b.x,b.y,{steps:15});await p.mouse.up();
    }
    await p.waitForTimeout(200);
}
(async()=>{
    await fs.mkdir(out,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{for(const [name,width,height,touch]of [["desktop",1280,720,false],["wide",1560,720,false],["mobile",844,390,true]]){
        const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch}),p=await context.newPage(),errors=[];
        p.touchMode=touch;p.on("pageerror",e=>errors.push(e.message));
        await p.goto(url);await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened);
        await click(p,"invPrimary");
        const small=await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.findIndex(i=>i.templateId===36));
        assert.ok(small>=0);
        await drag(p,`invList${small}`,"invCell_bag_1");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.templateId===36).location.space),"bag");
        await shot(p,name+"-drag");
        await click(p,"invPrimary");await p.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="map");
        const initial=await p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
        await click(p,"expNode2");await p.waitForFunction(()=>!window.__skillBattlePreview.panel.movement);
        const moved=await p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
        assert.equal(moved.node,2);assert.equal(moved.stamina,initial.stamina-20);
        await shot(p,name+"-map");
        await click(p,"expAbandon");await click(p,"dialogCancel");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.trial.inventory.phase),"active");
        await click(p,"expAbandon");await click(p,"dialogConfirm");
        await p.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="settlement");
        await shot(p,name+"-settlement");
        await p.goto(url+"?manualTest=1");await p.waitForFunction(()=>window.__manualTestPreview?.panel?.opened);
        await click(p,"enemyPick",true);
        await p.waitForFunction(()=>window.__manualTestPreview.panel.popup?.isOpened);
        const rows=await p.evaluate(()=>window.__manualTestPreview.panel.popup.rows);
        assert.equal(rows.length,16);
        const pickerPoint=await p.evaluate(()=>{
            const n=window.__manualTestPreview.panel.popup.getElement("btn_enemy2"),r=document.querySelector("canvas").getBoundingClientRect();
            const a=n.localToGlobal(new Laya.Point(n.width/2,n.height/2));
            return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
        });
        await shot(p,name+"-enemy-picker");
        if(touch)await p.touchscreen.tap(pickerPoint.x,pickerPoint.y);else await p.mouse.click(pickerPoint.x,pickerPoint.y);
        await p.waitForTimeout(150);
        assert.equal(await p.evaluate(()=>window.__manualTestPreview.session.draft.enemyId),rows[2]);
        await click(p,"restart",true);await click(p,"move_edge",true);await click(p,"confirm",true);
        assert.equal(await p.evaluate(()=>window.__manualTestPreview.session.state.ap),2);
        await click(p,"tab_pool",true);await shot(p,name+"-manual");
        const bounds=await p.evaluate(()=>{
            const v=window.__manualTestPreview,issues=[];
            for(const [key,n]of Object.entries(v.panel.buttons)){
                if(!n.visible)continue;
                const a=n.localToGlobal(new Laya.Point()),b=n.localToGlobal(new Laya.Point(n.width,n.height));
                if(a.x<-.1||a.y<-.1||b.x>Laya.stage.width+.1||b.y>Laya.stage.height+.1)issues.push(key);
            }return issues;
        });
        assert.deepEqual(bounds,[]);assert.deepEqual(errors,[]);
        await context.close();console.log("通过 "+name+"：拖拽、移动、取消/确认、结算、独立敌人选择与演练");
    }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
