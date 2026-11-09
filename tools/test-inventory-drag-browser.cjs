const {chromium}=require("playwright");
const sharp=require("sharp"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18120";
const output=path.resolve(__dirname,"../bin/inventory-drag-browser");
const saved=p=>p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1"));
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
async function ready(p){
    await p.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened);
    await p.waitForTimeout(100);
}
async function point(p,key,anchor={x:0.5,y:0.5}){
    return p.evaluate(({key,anchor})=>{
        const b=window.__skillBattlePreview.panel.buttons[key];
        if(!b?.visible||!b.mouseEnabled)throw Error(`Unavailable ${key}`);
        const v=b.localToGlobal(new Laya.Point(b.width*anchor.x,b.height*anchor.y)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+v.x*r.width/1280,y:r.top+v.y*r.height/720};
    },{key,anchor});
}
async function stagePoint(p,x,y){
    return p.evaluate(({x,y})=>{
        const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.left+x*r.width/1280,y:r.top+y*r.height/720};
    },{x,y});
}
async function click(p,key){
    const v=await point(p,key);
    if(p.mobile)await p.touchscreen.tap(v.x,v.y);else await p.mouse.click(v.x,v.y);
    await p.waitForTimeout(90);
}
async function itemKey(p,id,space="warehouse",index=0){
    if(["warehouse","ground"].includes(space))await click(p,"invAll");
    const uid=await p.evaluate(({id,space,index})=>{
        return window.__skillBattlePreview.trial.inventory.items.filter(i=>i.templateId===id&&i.location.space===space)[index]?.uid;
    },{id,space,index});
    assert.ok(uid,`Missing item ${id} in ${space}`);
    return keyForUid(p,uid,["warehouse","ground"].includes(space));
}
async function keyForUid(p,uid,source=false){
    if(source)await click(p,"invAll");
    for(let page=0;page<20;page++){
        const result=await p.evaluate(({uid,source})=>{
        const panel=window.__skillBattlePreview.panel,s=window.__skillBattlePreview.trial.inventory;
        const item=s.items.find(i=>i.uid===uid),space=item.location.space;
        const n=source?`invList${panel.visibleItems.findIndex(i=>i.uid===uid)}`:
            space==="weapon"?"invWeapon":space==="container"?"invContainer":`invItem${panel.gridItems.findIndex(i=>i.uid===uid)}`;
        return{key:n,uid};
        },{uid,source});
        if(!result.key.endsWith("-1"))return result;
        if(!source)break;
        await click(p,"invNext");
    }
    throw Error(`Item not visible: ${uid}`);
}
async function grid(p,space,x,y,w=1,h=1){
    const g=await p.evaluate(space=>{
        const cell=window.__skillBattlePreview.panel.nodes[`invCell_${space}_0`];
        return{x:cell.x,y:cell.y,size:cell.width+2};
    },space);
    return stagePoint(p,g.x+(x+w/2)*g.size,g.y+(y+h/2)*g.size);
}
async function start(p,key,anchor){
    const from=await point(p,key,anchor);p.last=from;
    if(p.mobile)await p.cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...from,id:11}]});
    else{await p.mouse.move(from.x,from.y);await p.mouse.down();}
}
async function move(p,to,steps=p.mobile?8:12){
    const from=p.last;
    if(p.mobile){
        for(let n=1;n<=steps;n++)await p.cdp.send("Input.dispatchTouchEvent",{type:"touchMove",
            touchPoints:[{x:from.x+(to.x-from.x)*n/steps,y:from.y+(to.y-from.y)*n/steps,id:11}]});
    }else await p.mouse.move(to.x,to.y,{steps});
    p.last=to;await p.waitForTimeout(50);
}
async function release(p){
    if(p.mobile)await p.cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    else await p.mouse.up();
    await p.waitForTimeout(90);
    assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.held),false);
}
async function rotate(p){
    if(p.mobile){
        const v=await point(p,"invRotate");
        await p.cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...p.last,id:11},{...v,id:12}]});
        await p.cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[{...v,id:12}]});
    }else await p.keyboard.press("r");
    await p.waitForTimeout(70);
}
async function cancel(p){
    if(p.mobile){
        await p.cdp.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
        await p.waitForTimeout(90);
        assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.held),false);
    }else{await p.keyboard.press("Escape");await release(p);}
}
async function drag(p,key,to){await start(p,key);await move(p,to);await release(p);}
async function capture(p,name){
    const file=path.join(output,name+".png");
    await p.screenshot({path:file});
    const stats=await sharp(file).stats();assert.ok(stats.channels.some(c=>c.stdev>12),"Blank canvas");
    const result=await p.evaluate(()=>{
        const panel=window.__skillBattlePreview.panel,visible=n=>{for(let v=n;v;v=v.parent)if(!v.visible)return false;return true;};
        const errors=[],rects=[];
        for(const [key,n]of Object.entries(panel.nodes)){
            if(/^inv(EquipCell_|SourceCell|Cell_)/.test(key)&&visible(n)&&(n.width!==54||n.height!==54))
                errors.push(`nonuniform cell ${key}: ${n.width}x${n.height}`);
        }
        for(const [key,w,h]of[["invWeapon",110,166],["invContainer",110,110]]){
            const n=panel.nodes[key];
            if(visible(n)&&(n.width!==w||n.height!==h))errors.push(`equipment footprint ${key}`);
        }
        for(const [key,b]of Object.entries(panel.buttons)){
            if(!visible(b))continue;
            const a=b.localToGlobal(new Laya.Point(0,0));
            if(a.x<0||a.y<0||a.x+b.width>1280.1||a.y+b.height>720.1)errors.push(`bounds ${key}`);
            if(!/^inv(Item|Cell_)/.test(key))rects.push({key,x:a.x,y:a.y,w:b.width,h:b.height});
        }
        for(let i=0;i<rects.length;i++)for(const b of rects.slice(i+1)){
            const a=rects[i];if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y))
                errors.push(`overlap ${a.key}/${b.key}`);
        }
        const walk=n=>{
            if(!visible(n))return;
            if(n instanceof Laya.GTextField&&n.text&&(n.textIns.textWidth>n.width+2||n.textIns.textHeight>n.height+2))errors.push(`text ${n.name}`);
            for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i));
        };walk(panel.root);
        for(const [key,n]of Object.entries(panel.nodes)){
            if(!visible(n)||!/^inv(List\d+|Item\d+|Weapon|Container|Held)$/.test(key))continue;
            const caption=n.getChildAt(3);
            if(caption instanceof Laya.GTextField){
                if(/[×x]/.test(caption.text))errors.push(`footprint caption ${key}`);
                if(!key.startsWith("invList")&&(caption.visible||caption.text))
                    errors.push(`grid/drag caption ${key}`);
            }
            const outline=n.getChildByName(n.name+"Selection");
            if(outline?.visible){
                const commands=outline.graphics.cmds;
                if(commands.length!==1||commands[0].cmdID!==Laya.DrawRoundRectCmd.ID||
                    [commands[0].lt,commands[0].rt,commands[0].lb,commands[0].rb].some(r=>r!==6))
                    errors.push(`rounded highlight ${key}`);
            }
            const image=n.getChildAt(0);
            if(!image.visible)continue;
            if(image.src!=="ui/atlas/module/inventory/quality-1.png")errors.push(`quality frame ${key}: ${image.src}`);
            if(image.texture?._sizeGrid?.join(",")!=="8,8,8,8,0")errors.push(`nine-slice ${key}`);
            if(!image.graphics.cmds.some(c=>c.cmdID==="Draw9GridTextureCmd"))errors.push(`nine-slice draw ${key}`);
            if(image.width!==n.width||image.height!==n.height)errors.push(`quality footprint ${key}`);
            if(image.color!=="#ffffff")errors.push(`quality tint changed ${key}`);
        }
        return{errors,held:panel.held?{valid:panel.held.valid,rotated:panel.held.rotated,error:panel.held.error}:null};
    });
    assert.deepEqual(result.errors,[],`${name} layout`);return result.held;
}
async function autoRotationCases(p,tag){
    const before=await saved(p),book=await itemKey(p,4);
    const held=()=>p.evaluate(()=>{
        const h=window.__skillBattlePreview.panel.held;
        return h?{rotated:h.rotated,valid:h.valid,target:h.target}:null;
    });
    const waitRotation=rotated=>p.waitForFunction(rotated=>window.__skillBattlePreview.panel.held?.rotated===rotated,
        rotated,{timeout:1800});
    const safe=await grid(p,"safe",0,0,2,1);
    await start(p,book.key);await move(p,safe);
    const hoverOrigin=await p.evaluate(()=>window.__skillBattlePreview.panel.held.hover.point);
    await move(p,await grid(p,"safe",0.02,0,2,1),1);
    assert.deepEqual(await p.evaluate(()=>window.__skillBattlePreview.panel.held.hover.point),hoverOrigin,"Small jitter preserves the dwell");
    await p.waitForTimeout(60);assert.equal((await held()).rotated,false,"No immediate automatic rotation");
    await move(p,await grid(p,"safe",0.2,0,2,1),1);
    await p.waitForTimeout(160);assert.equal((await held()).rotated,false,"Moving restarts the dwell");
    await waitRotation(true);
    assert.equal((await held()).valid,true);assert.equal(await saved(p),before,"Hover never commits");
    assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.invHeld.getChildAt(2).rotation),90);
    await p.waitForTimeout(550);assert.equal((await held()).rotated,true,"A stationary item must not oscillate");
    await capture(p,tag+"-auto-book-horizontal");await release(p);
    assert.deepEqual((await state(p)).items.find(i=>i.uid===book.uid).location,{space:"safe",x:0,y:0,rotated:true});
    await drag(p,(await itemKey(p,4,"safe")).key,await stagePoint(p,1000,400));
    await start(p,(await itemKey(p,4)).key);await move(p,await grid(p,"bag",0,0,1,2));
    await p.waitForTimeout(550);assert.equal((await held()).rotated,false,"A fitting orientation must stay unchanged");
    await cancel(p);
    const ore=await itemKey(p,7);await drag(p,ore.key,await grid(p,"bag",0,0,2,2));
    await start(p,(await itemKey(p,4)).key);await move(p,await grid(p,"bag",0,0,1,2));
    await p.waitForTimeout(550);assert.equal((await held()).rotated,false);assert.equal((await held()).valid,false);
    await cancel(p);
    await start(p,(await itemKey(p,4)).key);await move(p,await grid(p,"bag",0.5,1.9));
    await waitRotation(true);
    assert.equal((await held()).valid,true,"Rotation can resolve a collision without moving the pointer");
    await cancel(p);
    await start(p,(await itemKey(p,7,"bag")).key);await move(p,await grid(p,"bag",5,4,2,2));
    await p.waitForTimeout(550);assert.equal((await held()).rotated,false,"A square cannot gain room through rotation");
    await cancel(p);
    await drag(p,(await itemKey(p,7,"bag")).key,await stagePoint(p,1000,400));
    await start(p,(await itemKey(p,4)).key);await move(p,await grid(p,"battle",0,0,2,1));
    await p.waitForTimeout(550);assert.equal((await held()).rotated,false,"Rotation cannot bypass category rules");
    await cancel(p);
    await start(p,(await itemKey(p,4)).key);await move(p,safe);
    await move(p,await stagePoint(p,700,610));await p.waitForTimeout(550);
    assert.equal((await held()).rotated,false,"Leaving the grid cancels the timer");await cancel(p);
    await start(p,(await itemKey(p,4)).key);await move(p,safe);await rotate(p);await rotate(p);
    await p.waitForTimeout(550);assert.equal((await held()).rotated,false,"Manual rotation suppresses automatic reversal");
    await cancel(p);
    const beforeEarly=await saved(p);
    await start(p,(await itemKey(p,4)).key);await move(p,safe);await release(p);
    await p.waitForTimeout(500);assert.equal(await saved(p),beforeEarly,"Releasing before dwell returns an invalid item");
    await start(p,(await itemKey(p,4)).key);await move(p,safe);await cancel(p);
    await p.waitForTimeout(500);assert.equal(await held(),null,"Cancel clears pending rotation");
    const sword=await itemKey(p,9);
    await start(p,sword.key,{x:0.2,y:0.8});await move(p,await stagePoint(p,700,610));await rotate(p);
    await move(p,await grid(p,"bag",3.9,1.9));await waitRotation(false);
    const vertical=await held();
    assert.equal(vertical.rotated,false);assert.equal(vertical.valid,true);assert.equal(vertical.target.space,"bag");
    assert.equal(vertical.target.x,4);assert.ok(vertical.target.y===0);
    assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.invHeld.getChildAt(2).rotation),0);
    await capture(p,tag+"-auto-sword-vertical");await release(p);
    await drag(p,(await itemKey(p,9,"bag")).key,await stagePoint(p,1000,400));
    console.log(`PASS ${tag}: 400ms stationary auto-rotation in both directions, movement reset, no oscillation, collision/category/valid exclusion, manual override, release/cancel cleanup and off-center grip.`);
}
async function overflowCase(p,tag){
    await p.reload();await ready(p);await click(p,"invPrimary");
    await drag(p,(await itemKey(p,11)).key,await point(p,"invContainer"));
    const area=await p.evaluate(()=>{
        const v=window.__skillBattlePreview,s=v.trial,config=s.archive.config;
        const items=s.inventory.items.filter(i=>i.location.space==="warehouse"&&
            config.templates.find(t=>t.id===i.templateId).kind!=="container").sort((a,b)=>{
                const ta=config.templates.find(t=>t.id===a.templateId),tb=config.templates.find(t=>t.id===b.templateId);
                return tb.width*tb.height-ta.width*ta.height;
            });
        let area=0;
        for(const item of items){
            const t=config.templates.find(t=>t.id===item.templateId);
            let placed=false;
            for(let y=0;y<=6-t.height&&!placed;y++)for(let x=0;x<=8-t.width&&!placed;x++){
                const to={space:"bag",x,y,rotated:false},move={type:"move",move:{uid:item.uid,from:item.location,to}};
                try{s.previewMove(move);s.inventoryCommand(move);placed=true;area+=t.width*t.height;}catch{}
            }
        }
        v.panel.refresh();return area;
    });
    assert.ok(area>30,`Real fixture must exceed small bag: ${area}`);
    const before=await saved(p),snapshot=await state(p),small=await itemKey(p,10);
    await start(p,small.key);await move(p,await point(p,"invContainer"));
    assert.equal(await saved(p),before,"Automatic packing while held must not write");
    assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),true);
    await cancel(p);assert.equal(await saved(p),before);
    await p.evaluate(()=>{
        window.__swapSet=Storage.prototype.setItem;
        Storage.prototype.setItem=function(k,v){if(k==="nowchange.stage3-inventory.v1")throw Error("swap quota");return window.__swapSet.call(this,k,v);};
    });
    await drag(p,(await itemKey(p,10)).key,await point(p,"invContainer"));
    assert.equal(await saved(p),before);assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/swap quota/);
    await p.evaluate(()=>{Storage.prototype.setItem=window.__swapSet;});
    await drag(p,(await itemKey(p,10)).key,await point(p,"invContainer"));
    const after=await state(p),cargo=snapshot.items.filter(i=>i.location.space==="bag");
    const returned=cargo.filter(i=>after.items.find(j=>j.uid===i.uid).location.space==="warehouse");
    assert.ok(returned.length>0);assert.equal(after.revision,snapshot.revision+1);
    assert.deepEqual(after.items.map(i=>[i.uid,i.templateId,i.durability]),snapshot.items.map(i=>[i.uid,i.templateId,i.durability]));
    assert.equal(after.items.find(i=>i.location.space==="container").templateId,10);
    assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.draft),null);
    assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/退回仓库/);
    await capture(p,tag+"-downsize-overflow-returned");
    // Returned instances remain usable through the real source grid, not just a ledger entry.
    const pick=returned[0],key=await keyForUid(p,pick.uid,true),oldCount=after.items.filter(i=>i.location.space==="bag").length;
    await start(p,key.key);await move(p,await stagePoint(p,700,610));await cancel(p);
    assert.equal((await state(p)).items.filter(i=>i.location.space==="bag").length,oldCount);
    const text=await saved(p);await p.reload();await ready(p);assert.equal(await saved(p),text);
    assert.deepEqual(await state(p),after);
    console.log(`PASS ${tag}: ${area}-cell downsize directly commits once, overflow returns intact, cancel/quota rollback, returned-item drag and reload.`);
}
async function main(){
    await fs.mkdir(output,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:844,height:390}]){
            if(process.argv.includes("--mobile")&&viewport.width>=900)continue;
            const mobile=viewport.width<900,tag=mobile?"mobile":viewport.width>1280?"wide":"desktop";
            const ctx=await browser.newContext({viewport,hasTouch:mobile}),p=await ctx.newPage(),errors=[],missing=[];
            p.mobile=mobile;p.cdp=await ctx.newCDPSession(p);
            p.on("pageerror",e=>errors.push(e.message));p.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
            await p.goto(url);await ready(p);await click(p,"invPrimary");
            await p.evaluate(()=>localStorage.setItem("another-app","preserve"));
            await capture(p,tag+"-source-grid");
            const bag=await itemKey(p,10);
            await drag(p,bag.key,await point(p,"invContainer"));
            assert.equal((await state(p)).items.find(i=>i.uid===bag.uid).location.space,"container");
            await autoRotationCases(p,tag);
            const book=await itemKey(p,4),before=await saved(p);
            await start(p,book.key);await move(p,await grid(p,"safe",0,0,1,2));
            assert.equal(await saved(p),before,"Holding must not save");
            let preview=await capture(p,tag+"-book-invalid");assert.equal(preview.valid,false);
            await rotate(p);await move(p,await grid(p,"safe",0,0,2,1));
            if(!mobile){
                await p.mouse.down({button:"right"});await p.mouse.up({button:"right"});
                assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.rotated),false);
                await p.mouse.down({button:"right"});await p.mouse.up({button:"right"});
            }
            preview=await capture(p,tag+"-book-rotated");assert.equal(preview.valid,true);assert.equal(preview.rotated,true);
            assert.deepEqual(await p.evaluate(()=>{
                const panel=window.__skillBattlePreview.panel,n=panel.nodes.invHeld;
                return{rotation:n.getChildAt(2).rotation,width:n.width,height:n.height,target:panel.held.target};
            }),{rotation:90,width:110,height:54,target:{space:"safe",x:0,y:0,rotated:true}});
            assert.equal(await saved(p),before,"Rotation must not save");await release(p);
            assert.deepEqual((await state(p)).items.find(i=>i.uid===book.uid).location,{space:"safe",x:0,y:0,rotated:true});
            const ore=await itemKey(p,7);await drag(p,ore.key,await grid(p,"bag",0,0,2,2));
            assert.equal((await state(p)).items.find(i=>i.uid===ore.uid).location.space,"bag");
            const beforeAnchor=await saved(p);
            await start(p,(await itemKey(p,7,"bag")).key,{x:0.2,y:0.8});await move(p,await grid(p,"bag",3,3,2,2));
            const anchor=await p.evaluate(()=>{const h=window.__skillBattlePreview.panel.held;return[h.grabX,h.grabY];});
            await rotate(p);await rotate(p);
            const restored=await p.evaluate(()=>{const h=window.__skillBattlePreview.panel.held;return[h.grabX,h.grabY];});
            anchor.forEach((v,i)=>assert.ok(Math.abs(v-restored[i])<1e-8,"Rotation must preserve the off-center grip"));
            await cancel(p);assert.equal(await saved(p),beforeAnchor);
            const herb=await itemKey(p,6),occupied=await saved(p);
            await start(p,herb.key);await move(p,await grid(p,"bag",0,0,1,2));
            preview=await capture(p,tag+"-collision");assert.equal(preview.valid,false);
            await release(p);assert.equal(await saved(p),occupied,"Collision must snap back");
            await drag(p,(await itemKey(p,6)).key,await grid(p,"bag",2,0,1,2));
            const installed=await saved(p);await p.reload();await ready(p);assert.equal(await saved(p),installed);
            const herbInBag=await itemKey(p,6,"bag");
            await start(p,herbInBag.key);await move(p,await grid(p,"bag",3,0,1,2));
            await cancel(p);
            assert.equal(await saved(p),installed,"Cancelled gesture must never commit");
            await start(p,(await itemKey(p,6,"bag")).key);await move(p,await stagePoint(p,700,610));
            assert.deepEqual(await p.evaluate(()=>{
                const panel=window.__skillBattlePreview.panel;
                return{target:panel.held.target,width:panel.nodes.invHeld.width,height:panel.nodes.invHeld.height};
            }),{target:null,width:54,height:110},"Outside-grid dragging retains the same enlarged footprint");
            await release(p);assert.equal(await saved(p),installed,"Drop outside must return");
            const sword=await itemKey(p,9);await drag(p,sword.key,await point(p,"invWeapon"));
            assert.equal((await state(p)).items.find(i=>i.uid===sword.uid).durability,30);
            await capture(p,tag+"-equipped-six-and-four-cells");
            await drag(p,"invWeapon",await grid(p,"bag",4,0,2,3));
            assert.equal((await state(p)).items.find(i=>i.uid===sword.uid).location.space,"bag");
            await start(p,(await itemKey(p,9,"bag")).key);await move(p,await grid(p,"bag",0,3,2,3));
            await rotate(p);await move(p,await grid(p,"bag",0,3,3,2));
            assert.equal((await capture(p,tag+"-weapon-rotated")).valid,true);await release(p);
            assert.deepEqual((await state(p)).items.find(i=>i.uid===sword.uid).location,{space:"bag",x:0,y:3,rotated:true});
            const large=await itemKey(p,11);
            const beforeExchange=await saved(p);
            await start(p,large.key);await move(p,await point(p,"invContainer"));
            assert.equal(await saved(p),beforeExchange,"Holding an exchange must not save");
            await cancel(p);assert.equal(await saved(p),beforeExchange);
            await drag(p,(await itemKey(p,11)).key,await point(p,"invContainer"));
            assert.equal((await state(p)).items.find(i=>i.location.space==="container").templateId,11,"Exchange commits on release");
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.draft),null);
            await start(p,(await itemKey(p,6,"bag")).key);await move(p,await grid(p,"bag",0,5,2,1));
            await p.waitForFunction(()=>window.__skillBattlePreview.panel.held?.rotated===true);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),true);
            await release(p);
            await start(p,(await itemKey(p,6,"bag")).key);await move(p,await grid(p,"bag",2,0,1,2));
            await rotate(p);await release(p);
            await drag(p,(await itemKey(p,7,"bag")).key,await grid(p,"bag",6,4,2,2));
            await capture(p,tag+"-exchange-repack");
            assert.equal((await state(p)).items.find(i=>i.location.space==="container").templateId,11);
            assert.equal((await state(p)).items.find(i=>i.templateId===7&&i.location.space==="bag").location.x,6);
            const beforeDownsize=(await state(p)).revision;
            await drag(p,(await itemKey(p,10)).key,await point(p,"invContainer"));
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.draftError),"");
            await capture(p,tag+"-downsize-auto-repacked");
            assert.equal((await state(p)).items.find(i=>i.location.space==="container").templateId,10);
            assert.equal((await state(p)).revision,beforeDownsize+1,"The entire automatic downsize is one write");
            assert.equal((await state(p)).items.filter(i=>i.location.space==="bag").length,3);
            await drag(p,(await itemKey(p,9,"bag")).key,await point(p,"invWeapon"));
            const spare=await itemKey(p,9),weaponBefore=await state(p),equipped=weaponBefore.items.find(i=>i.location.space==="weapon");
            await drag(p,spare.key,await point(p,"invWeapon"));
            assert.equal((await state(p)).items.find(i=>i.uid===spare.uid).location.space,"weapon");
            assert.equal((await state(p)).items.find(i=>i.uid===equipped.uid).location.space,"warehouse");
            assert.equal((await state(p)).revision,weaponBefore.revision+1);
            assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.draft),null);
            const potion=await itemKey(p,1),preFail=await saved(p);
            await p.evaluate(()=>{
                window.__originalSet=Storage.prototype.setItem;
                Storage.prototype.setItem=function(k,v){if(k==="nowchange.stage3-inventory.v1")throw Error("drag quota");return window.__originalSet.call(this,k,v);};
            });
            await drag(p,potion.key,await grid(p,"battle",0,0));
            assert.equal(await saved(p),preFail);assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/drag quota/);
            assert.equal((await state(p)).items.find(i=>i.uid===potion.uid).location.space,"warehouse");
            await p.evaluate(()=>{Storage.prototype.setItem=window.__originalSet;});
            await drag(p,(await itemKey(p,1)).key,await grid(p,"battle",0,0));
            await capture(p,tag+"-packed");
            await click(p,"invPrimary");await click(p,"warehouse0");await click(p,"newRun");await click(p,"invToggle");await click(p,"invReveal");
            const drop=await itemKey(p,6,"bag");
            const returnLocation=(await state(p)).items.find(i=>i.uid===drop.uid).location;
            await drag(p,drop.key,await stagePoint(p,1000,400));
            assert.equal((await state(p)).items.find(i=>i.uid===drop.uid).location.space,"ground");
            await drag(p,(await itemKey(p,6,"ground")).key,await grid(p,"bag",returnLocation.x,returnLocation.y,1,2));
            assert.equal((await state(p)).items.find(i=>i.uid===drop.uid).location.space,"bag");
            const deadlineStart=await saved(p);
            await start(p,(await itemKey(p,6,"bag")).key);await move(p,await grid(p,"bag",4,4,2,1));
            assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.held?.hover),true,"Dwell pending before deadline");
            await p.evaluate(notify=>{
                const trial=window.__skillBattlePreview.trial;
                trial.clock=()=>trial.inventory.deadlineAt;
                if(notify)window.dispatchEvent(new Event("focus"));
            },tag!=="desktop");
            await p.waitForTimeout(600);
            assert.equal(await p.evaluate(()=>!!window.__skillBattlePreview.panel.held),false,"Expiry cancels a stationary hover before release");
            await release(p);
            assert.equal((await state(p)).result,"timeout");
            assert.equal(await p.evaluate(()=>localStorage.getItem("another-app")),"preserve");
            assert.notEqual(await saved(p),deadlineStart);
            await capture(p,tag+"-timeout-cancelled");
            assert.deepEqual(errors,[],`${tag} page errors`);assert.deepEqual(missing,[],`${tag} asset failures`);
            await overflowCase(p,tag);
            assert.deepEqual(errors,[],`${tag} overflow page errors`);assert.deepEqual(missing,[],`${tag} overflow assets`);
            await ctx.close();console.log(`PASS ${tag}: native drag, live footprint, rotation, release, collision/outside return, cancel, reload, equipment, atomic exchange, quota failure, ground round-trip and deadline.`);
        }
    }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
