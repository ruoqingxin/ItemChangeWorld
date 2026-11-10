const {chromium}=require("playwright");
const sharp=require("sharp"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18120";
const output=path.resolve(__dirname,"../bin/naxu-catalogue-browser");
async function ready(p){
    await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened);
    await p.waitForTimeout(120);
}
async function point(p,key){
    return p.evaluate(key=>{
        const n=window.__skillBattlePreview.panel.buttons[key];
        if(!n?.visible||!n.mouseEnabled)throw Error(`Unavailable ${key}`);
        const v=n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+v.x*r.width/1280,y:r.top+v.y*r.height/720};
    },key);
}
async function click(p,key){
    const v=await point(p,key);
    if(p.mobile)await p.touchscreen.tap(v.x,v.y);else await p.mouse.click(v.x,v.y);
    await p.waitForTimeout(90);
}
async function find(p,id){
    await click(p,"invEquipment");
    while(await p.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage>0))await click(p,"invPrev");
    for(let page=0;page<8;page++){
        const key=await p.evaluate(id=>{
            const panel=window.__skillBattlePreview.panel,i=panel.visibleItems.findIndex(i=>i.templateId===id);
            return i<0?null:`invList${i}`;
        },id);
        if(key)return key;
        await click(p,"invNext");
    }
    throw Error(`Missing container ${id}`);
}
async function drag(p,key,target){
    const a=await point(p,key),b=await point(p,target);
    if(p.mobile){
        await p.cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});
        for(let n=1;n<=10;n++)await p.cdp.send("Input.dispatchTouchEvent",{type:"touchMove",
            touchPoints:[{x:a.x+(b.x-a.x)*n/10,y:a.y+(b.y-a.y)*n/10,id:1}]});
        await p.cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    }else{
        await p.mouse.move(a.x,a.y);await p.mouse.down();
        await p.mouse.move(b.x,b.y,{steps:12});await p.mouse.up();
    }
    await p.waitForTimeout(150);
}
async function inspect(p,t){
    const result=await p.evaluate(t=>{
        const {trial,panel}=window.__skillBattlePreview,s=trial.inventory,g=panel.gridGeometry("bag");
        const equipped=s.items.find(i=>i.location.space==="container"),n=panel.nodes.invContainer,bg=n.getChildAt(0),icon=n.getChildAt(2);
        const visible=n=>{for(let v=n;v;v=v.parent)if(!v.visible)return false;return true;};
        const issues=[],walk=n=>{
            if(!visible(n))return;
            if(n instanceof Laya.GTextField&&n.text&&(n.textIns.textWidth>n.width+2||n.textIns.textHeight>n.height+2))
                issues.push(`clipped ${n.name}: ${n.text}`);
            for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i));
        };walk(panel.root);
        for(const [key,n]of Object.entries(panel.buttons)){
            if(!visible(n))continue;
            const xy=n.localToGlobal(new Laya.Point(0,0));
            if(xy.x<0||xy.y<0||xy.x+n.width>1280.1||xy.y+n.height>720.1)issues.push(`bounds ${key}`);
        }
        const cells=Object.entries(panel.nodes).filter(([key,n])=>key.startsWith("invCell_bag_")&&visible(n)).length;
        return{id:equipped.templateId,size:[g.cols,g.rows],cells,src:icon.src,quality:bg.src,
            imageLoaded:!!icon.texture?.width,nineSlice:bg.graphics.cmds.some(c=>c.cmdID==="Draw9GridTextureCmd"),
            label:panel.nodes.invContainerName.text,issues,revision:s.revision};
    },t);
    assert.equal(result.id,t.id);assert.deepEqual(result.size,[t.bagWidth,t.bagHeight]);
    assert.equal(result.cells,t.bagWidth*t.bagHeight);assert.equal(result.src,t.icon);
    assert.equal(result.quality,`ui/atlas/module/inventory/quality-${t.quality}.png`);
    assert.ok(result.imageLoaded);assert.ok(result.nineSlice);
    assert.ok(result.label.startsWith(t.name));assert.deepEqual(result.issues,[]);
    return result;
}
async function main(){
    await fs.mkdir(output,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:844,height:390}]){
            const tag=viewport.width<900?"mobile":viewport.width>1280?"wide":"desktop";
            const context=await browser.newContext({viewport,hasTouch:tag==="mobile"}),p=await context.newPage(),errors=[],missing=[];
            p.mobile=tag==="mobile";p.cdp=await context.newCDPSession(p);
            p.on("pageerror",e=>errors.push(e.message));p.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
            await p.goto(url);await ready(p);await click(p,"invPrimary");
            await p.evaluate(()=>localStorage.setItem("other-app","preserved"));
            const catalogue=await p.evaluate(()=>window.__skillBattlePreview.trial.archive.config.templates
                .filter(t=>t.kind==="container").sort((a,b)=>a.quality-b.quality||a.id-b.id));
            assert.equal(catalogue.length,12);
            const original=await p.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.map(i=>i.uid).sort());
            for(const t of catalogue){
                const before=await p.evaluate(()=>window.__skillBattlePreview.trial.inventory.revision);
                await drag(p,await find(p,t.id),"invContainer");
                await p.waitForFunction(icon=>!!Laya.loader.getRes(icon)?.width,t.icon);
                await p.waitForTimeout(150);
                assert.equal((await inspect(p,t)).revision,before+1);
                const file=path.join(output,`${tag}-q${t.quality}-${t.id}.png`);
                await p.screenshot({path:file});
                const pixels=await sharp(file).stats();assert.ok(pixels.channels.some(c=>c.stdev>12));
                const raw=await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1"));
                await p.reload();await ready(p);
                assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),raw);
                await inspect(p,t);
            }
            // A spare body occupies four cells without increasing the legendary bag.
            await drag(p,await find(p,10),"invCell_bag_9");
            assert.deepEqual(await p.evaluate(()=>{
                const {trial,panel}=window.__skillBattlePreview,g=panel.gridGeometry("bag");
                return{size:[g.cols,g.rows],spare:trial.inventory.items.find(i=>i.templateId===10).location.space};
            }),{size:[8,6],spare:"bag"});
            const raw=await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1"));
            // Ordinary containers remain forbidden in the protected space.
            await drag(p,await find(p,12),"invCell_safe_0");
            assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),raw);
            // Simulate a failed save while replacing a full catalogue-backed item.
            const replacement=await find(p,13);
            await p.evaluate(()=>{
                window.__catalogueSet=Storage.prototype.setItem;
                Storage.prototype.setItem=function(k,v){
                    if(k==="nowchange.stage3-inventory.v1")throw Error("catalogue quota");
                    return window.__catalogueSet.call(this,k,v);
                };
            });
            await drag(p,replacement,"invContainer");
            assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),raw);
            assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/catalogue quota/);
            await p.evaluate(()=>{Storage.prototype.setItem=window.__catalogueSet;});
            assert.deepEqual(await p.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.map(i=>i.uid).sort()),original);
            assert.equal(await p.evaluate(()=>localStorage.getItem("other-app")),"preserved");
            assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
            await context.close();
            console.log(`PASS ${tag}: 12 real drag equips, six capacities/frames, loaded icons, layout/pixels, reload, spare body, forbidden drop and atomic quota rollback.`);
        }
    }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
