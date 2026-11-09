const {chromium}=require("playwright"),sharp=require("sharp"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18120";
const output=path.join(__dirname,"../bin/stage3-browser");
async function ready(p,screen="start"){
    await p.waitForFunction(s=>window.__skillBattlePreview?.view?.isOpened&&
        window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.screen===s,screen);
    await p.waitForTimeout(80);
}
async function click(p,key){
    const point=await p.evaluate(key=>{
        const b=window.__skillBattlePreview.panel.buttons[key];
        if(!b?.visible||!b.mouseEnabled)throw Error(`Unavailable: ${key}`);
        const a=b.localToGlobal(new Laya.Point(b.width/2,b.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+a.x*r.width/Laya.stage.width,y:r.top+a.y*r.height/Laya.stage.height};
    },key);
    if(p.touchMode)await p.touchscreen.tap(point.x,point.y);else await p.mouse.click(point.x,point.y);
    await p.waitForTimeout(70);
}
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
async function capture(p,name){
    await p.screenshot({path:path.join(output,name+".png")});
    const stats=await sharp(path.join(output,name+".png")).stats();
    assert.ok(stats.channels.some(c=>c.stdev>12),`${name} blank canvas`);
    const layout=await p.evaluate(()=>{
        const panel=window.__skillBattlePreview.panel,visible=n=>{
            for(let v=n;v;v=v.parent)if(!v.visible)return false;return true;
        };
        const controls=Object.entries(panel.buttons).filter(([,b])=>visible(b));
        const bounds=controls.filter(([,b])=>{
            const p=b.localToGlobal(new Laya.Point(0,0));return p.x<0||p.y<0||p.x+b.width>1280.1||p.y+b.height>720.1;
        }).map(([name])=>name);
        const fixed=controls.filter(([name])=>!/^inv(Item|Cell_)/.test(name)).map(([name,b])=>{
            const p=b.localToGlobal(new Laya.Point(0,0));return{name,x:p.x,y:p.y,w:b.width,h:b.height};
        });
        const overlap=fixed.flatMap((a,i)=>fixed.slice(i+1).filter(b=>
            Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y))
            .map(b=>`${a.name}/${b.name}`));
        const clipped=[];
        const walk=n=>{
            if(!visible(n))return;
            if(n instanceof Laya.GTextField&&n.text&&
                (n.textIns.textWidth>n.width+2||n.textIns.textHeight>n.height+2))
                clipped.push({name:n.name,text:n.text,w:n.width,h:n.height,tw:n.textIns.textWidth,th:n.textIns.textHeight});
            for(let i=0;i<n.numChildren;i++)walk(n.getChildAt(i));
        };walk(panel.root);
        let icon=null;
        if(panel.nodes?.inventoryRoot&&visible(panel.nodes.inventoryRoot)){
            const row=panel.buttons.invList0;
            if(visible(row)){
                const image=row.getChildAt(2),texture=Laya.loader.getRes(image.src);
                if(!texture?.width||!texture?.height)throw Error(`Image not loaded: ${image.src}`);
                const p=image.localToGlobal(new Laya.Point(0,0)),canvas=document.querySelector("canvas").getBoundingClientRect();
                icon={left:Math.round(canvas.left+p.x*canvas.width/1280),top:Math.round(canvas.top+p.y*canvas.height/720),
                    width:Math.max(1,Math.floor(image.width*canvas.width/1280)),height:Math.max(1,Math.floor(image.height*canvas.height/720))};
            }
        }
        return{bounds,clipped,overlap,icon};
    });
    assert.deepEqual(layout.bounds,[],`${name} bounds`);
    assert.deepEqual(layout.clipped,[],`${name} text clipping: ${JSON.stringify(layout.clipped)}`);
    assert.deepEqual(layout.overlap,[],`${name} overlapping controls`);
    if(layout.icon){
        const icon=await sharp(path.join(output,name+".png")).extract(layout.icon).stats();
        assert.ok(icon.channels.some(c=>c.stdev>10&&c.max>120),`${name} missing item pixels`);
    }
}
async function select(p,templateId,options={}){
    const {space="warehouse",index=0}=options;
    const uid=await p.evaluate(({templateId,space,index})=>window.__skillBattlePreview.trial.inventory.items
        .filter(i=>i.templateId===templateId&&i.location.space===space)[index]?.uid,{templateId,space,index});
    assert.ok(uid,`Missing template ${templateId} ${space}`);
    if(["warehouse","ground"].includes(space)){
        await click(p,"invAll");
        for(let n=0;n<10;n++){
            const page=await p.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage);
            if(!page)break;
            await click(p,"invPrev");
        }
        for(let n=0;n<10;n++){
            const key=await p.evaluate(uid=>{
                const panel=window.__skillBattlePreview.panel,i=panel.visibleItems.findIndex(i=>i.uid===uid);
                return i>=0?`invList${i}`:null;
            },uid);
            if(key){await click(p,key);return uid;}await click(p,"invNext");
        }
    }else if(space==="weapon"||space==="container")await click(p,space==="weapon"?"invWeapon":"invContainer");
    else{
        const key=await p.evaluate(uid=>{
            const i=window.__skillBattlePreview.panel.gridItems.findIndex(i=>i.uid===uid);return`invItem${i}`;
        },uid);await click(p,key);return uid;
    }
    throw Error("Cannot find item on pages");
}
async function move(p,id,target,options={}){
    const uid=await select(p,id,options);await click(p,target);await click(p,"invConfirm");return uid;
}
async function action(p,key){
    await click(p,key);await click(p,"confirm");
    await p.waitForFunction(()=>window.__skillBattlePreview.panel?.opened&&!window.__skillBattlePreview.panel.busy);
}
async function main(){
    await fs.mkdir(output,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:844,height:390}]){
            const context=await browser.newContext({viewport,hasTouch:viewport.width<900}),p=await context.newPage();
            p.touchMode=viewport.width<900;const errors=[],missing=[];
            p.on("pageerror",e=>errors.push(e.message));p.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
            p.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
            await p.goto(url);await ready(p);
            const tag=viewport.width<900?"mobile":viewport.width>1280?"wide":"desktop";
            await capture(p,tag+"-entry");
            if(process.argv.includes("--smoke")){
                await click(p,"invPrimary");await capture(p,tag+"-preparation");
                console.log(tag,await p.evaluate(()=>({errors:document.body.dataset.error,notice:window.__skillBattlePreview.panel.notice})));
                assert.deepEqual(errors,[]);continue;
            }
            await p.evaluate(()=>{
                localStorage.setItem("other-app","keep");
                localStorage.setItem("nowchange.stage1-battle.v1","keep1");
                localStorage.setItem("nowchange.stage2-build.v1","keep2");
            });
            await click(p,"invPrimary");
            assert.equal((await state(p)).phase,"preparation");
            assert.equal((await state(p)).deadlineAt,null);
            await capture(p,tag+"-preparation");
            const original=await state(p);
            await select(p,4);await click(p,"invCell_safe_0");
            assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.draftError),/尺寸/);
            assert.deepEqual(await state(p),original);
            await click(p,"invRotate");await capture(p,tag+"-rotation-preview");
            assert.deepEqual(await state(p),original);await click(p,"invCancel");
            assert.deepEqual(await state(p),original);
            const book=await select(p,4);await click(p,"invRotate");await click(p,"invCell_safe_0");await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.uid===book).location.rotated,true);
            await select(p,10);await click(p,"invContainer");await capture(p,tag+"-container-preview");await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.templateId===10).location.space,"container");
            await select(p,9);await click(p,"invWeapon");await click(p,"invConfirm");
            await move(p,1,"invCell_battle_0");await move(p,1,"invCell_battle_1");
            await move(p,2,"invCell_battle_2");await move(p,3,"invCell_battle_3");
            await move(p,7,"invCell_bag_0");
            await capture(p,tag+"-loaded");
            const beforeExchange=await state(p);
            await select(p,11);await click(p,"invContainer");await click(p,"invConfirm");
            await move(p,7,"invCell_bag_38",{space:"bag"});
            const beforeDownsize=await state(p);
            await select(p,10);await click(p,"invContainer");
            assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.draftError),/尺寸/);
            assert.deepEqual(await state(p),beforeDownsize);
            await capture(p,tag+"-downsize-rejected");
            await select(p,7,{space:"bag"});await click(p,"invCell_bag_0");
            await capture(p,tag+"-repack-preview");assert.deepEqual(await state(p),beforeDownsize);
            await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.location.space==="container").templateId,10);
            assert.equal((await state(p)).items.find(i=>i.templateId===7&&i.location.space==="bag").location.x,0);
            await select(p,9);await click(p,"invWeapon");await click(p,"invCell_bag_4");await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.location.space==="weapon").durability,7);
            await select(p,9,{space:"bag"});await click(p,"invWeapon");await click(p,"invCell_bag_5");await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.location.space==="weapon").durability,30);
            assert.equal((await state(p)).items.length,beforeExchange.items.length);
            if(tag==="desktop"){
                await p.evaluate(()=>{
                    const v=window.__skillBattlePreview,t=v.trial.save.config.templates.find(t=>t.id===4);
                    window.__originalBookName=t.name;
                    t.name="剑道主动典籍用于验证横屏储物长名称排版与完整详情显示".repeat(2);v.panel.refresh();
                });
                await select(p,4,{space:"safe"});await capture(p,"desktop-long-name");
                await p.evaluate(()=>{
                    const v=window.__skillBattlePreview;v.trial.save.config.templates.find(t=>t.id===4).name=window.__originalBookName;
                    v.panel.refresh();
                });await click(p,"invCancel");
                await select(p,2);await click(p,"invCell_battle_4");
                const beforeFail=await state(p);
                await p.evaluate(()=>{
                    window.__setItem=Storage.prototype.setItem;
                    Storage.prototype.setItem=function(k,v){if(k==="nowchange.stage3-inventory.v1")throw Error("quota test");return window.__setItem.call(this,k,v);};
                });
                await click(p,"invConfirm");assert.deepEqual(await state(p),beforeFail);
                assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/quota test/);
                await p.evaluate(()=>{Storage.prototype.setItem=window.__setItem;});await click(p,"invCancel");
            }
            const saved=await state(p);await p.reload();await ready(p);assert.deepEqual(await state(p),saved);
            await click(p,"invPrimary");assert.equal((await state(p)).phase,"active");
            await capture(p,tag+"-starting-choice");
            await click(p,"warehouse0");await click(p,"newRun");await click(p,"invToggle");
            if(tag==="desktop"){
                const clock=await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.invClock.text);
                await p.waitForTimeout(1100);
                assert.notEqual(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.invClock.text),clock);
            }
            const hidden=await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.length);assert.equal(hidden,0);
            await click(p,"invReveal");await capture(p,tag+"-ground");
            const before=await state(p);await select(p,6,{space:"ground"});await click(p,"invCell_battle_4");
            assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.draftError),/只收/);
            assert.deepEqual(await state(p),before);await click(p,"invCancel");
            const herb=await move(p,6,"invCell_bag_2",{space:"ground"});
            await select(p,6,{space:"bag"});await click(p,"invDrop");await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.uid===herb).location.space,"ground");
            await move(p,6,"invCell_bag_2",{space:"ground"});
            await click(p,"invPrimary");await ready(p,"battle");
            assert.equal((await p.evaluate(()=>window.__skillBattlePreview.trial.state)).pouch.filter(Boolean).length,3);
            await action(p,"skill1");
            const preDrug=await state(p);await action(p,"pouch0");
            assert.equal((await state(p)).consumed.length,preDrug.consumed.length+1);
            await capture(p,tag+"-actual-potion");
            await p.reload();await ready(p,"battle");
            assert.equal((await p.evaluate(()=>window.__skillBattlePreview.trial.state)).potionUsed,true);
            for(let i=0;i<10&&(await state(p)).flow.phase==="battle";i++)await action(p,"skill1");
            await ready(p);assert.equal((await state(p)).phase,"active");
            await capture(p,tag+"-post-battle");
            await click(p,"invToggle");await click(p,"warehouse0");await click(p,"newRun");await click(p,"invToggle");
            await select(p,3,{space:"battle"});await click(p,"invUse");await click(p,"invConfirm");
            assert.equal((await state(p)).items.find(i=>i.location.space==="weapon").durability,46);
            await click(p,"invExtract");const preExtract=await state(p);
            await capture(p,tag+"-extract-preview");await click(p,"invCancel");assert.deepEqual(await state(p),preExtract);
            await click(p,"invExtract");await click(p,"invConfirm");await ready(p);
            assert.equal((await state(p)).result,"extract");assert.ok((await state(p)).returned.includes(book));
            await capture(p,tag+"-settlement");const settled=await state(p);
            await p.reload();await ready(p);assert.deepEqual(await state(p),settled);
            await click(p,"invMaterials");await capture(p,tag+"-loss-ledger");
            await click(p,"invPrimary");await move(p,8,"invCell_safe_0");
            await select(p,9);await click(p,"invWeapon");await click(p,"invConfirm");
            await click(p,"invPrimary");await click(p,"warehouse0");await click(p,"newRun");await click(p,"invToggle");
            await click(p,"invAbandon");const beforeAbandon=await state(p);await click(p,"invCancel");
            assert.deepEqual(await state(p),beforeAbandon);
            await click(p,"invAbandon");await click(p,"invConfirm");await ready(p);
            assert.equal((await state(p)).result,"abandon");assert.equal((await state(p)).returned.length,1);
            await click(p,"invMedicine");await capture(p,tag+"-protected-ledger");
            await click(p,"invMaterials");await capture(p,tag+"-failed-loss-ledger");
            if(tag==="desktop"){
                await click(p,"invPrimary");await click(p,"invPrimary");
                await p.evaluate(()=>{
                    const v=window.__skillBattlePreview;v.trial.clock=()=>v.trial.inventory.deadlineAt;
                    window.dispatchEvent(new Event("focus"));
                });await ready(p);
                await p.waitForFunction(()=>window.__skillBattlePreview.trial.inventory.result==="timeout");
                await capture(p,"desktop-timeout");
                await p.evaluate(()=>localStorage.setItem("nowchange.stage3-inventory.v1","corrupt-stage3"));
                await p.reload();await ready(p);
                assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),"corrupt-stage3");
                await click(p,"invAbandon");await capture(p,"desktop-corrupt-reset-confirm");
                await click(p,"resetNo");
                assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),"corrupt-stage3");
                await click(p,"invAbandon");await click(p,"resetYes");
                assert.equal(await p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1")),null);
            }
            assert.deepEqual(await p.evaluate(()=>["other-app","nowchange.stage1-battle.v1","nowchange.stage2-build.v1"].map(k=>localStorage.getItem(k))),["keep","keep1","keep2"]);
            assert.deepEqual(errors,[],`${tag} console errors`);assert.deepEqual(missing,[],`${tag} missing assets`);
            await context.close();console.log(`PASS ${tag}: real clicks/touch, rotation, transaction previews, equip, loot, medicine, repair, settlement and reload`);
        }
    }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
