const {chromium}=require("playwright");
const sharp=require("sharp"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path");
const ide=process.argv.includes("--ide");
const url=process.env.SKILL_BATTLE_URL||(ide?(process.env.SKILL_BATTLE_IDE_URL||"http://127.0.0.1:18092"):"http://127.0.0.1:18120");
const output=path.resolve(__dirname,"../bin/inventory-drag-browser");
const saved=p=>p.evaluate(()=>localStorage.getItem("nowchange.stage3-inventory.v1"));
const state=p=>p.evaluate(()=>window.__skillBattlePreview.trial.inventory);
async function ready(p){
    if(ide)await p.waitForFunction(()=>{
        const find=n=>{
            if(n.skillBattleController?.nodes?.inventoryRoot)return n.skillBattleController;
            for(let i=0;i<n.numChildren;i++){const panel=find(n.getChildAt(i));if(panel)return panel;}
        };
        if(!window.Laya?.stage||!find(Laya.stage)?.opened)return false;
        window.__skillBattlePreview={get panel(){return find(Laya.stage);},
            get trial(){return this.panel.inventorySession;}};
        return true;
    });
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
async function sourcePoint(p,x,y,w=1,h=1){
    const g=await p.evaluate(()=>window.__skillBattlePreview.panel.sourceGeometry());
    return stagePoint(p,g.x+(x+w/2)*g.size,g.y+(y+h/2)*g.size);
}
async function sourceSlot(p,uid){
    return p.evaluate(uid=>{
        const {panel,trial}=window.__skillBattlePreview;
        const pages=panel.packWarehouse(trial.inventory.items,trial.archive.config,trial.inventory);
        return pages.flat().filter(s=>s.item.uid===uid).map(({x,y,rotated})=>({x,y,rotated}))[0];
    },uid);
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
        const source=panel.sourceGeometry(),last=panel.nodes.invSourceCell55;
        if(source.cols!==8||source.rows!==7)errors.push("source page must be 7 rows by 8 columns");
        for(const key of ["invPrev","invNext","invPage","invReveal"]){
            const n=panel.nodes[key];
            if(visible(n)&&n.y<last.y+last.height)errors.push(`source footer overlaps row seven: ${key}`);
        }
        if(panel.nodes.invNotice.y<panel.nodes.invRightPanel.y+panel.nodes.invRightPanel.height)
            errors.push("notice overlaps source footer");
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
                if(caption.visible||caption.text)errors.push(`item image caption ${key}`);
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
async function sourcePageCases(p,tag){
    const before=await saved(p);
    const checks=await p.evaluate(()=>{
        const {panel,trial}=window.__skillBattlePreview,config=trial.archive.config;
        const one=config.templates.find(t=>t.width===1&&t.height===1),errors=[];
        const items=(n,template=one)=>Array.from({length:n},(_,i)=>({
            uid:`source-page-${i}`,templateId:template.id,location:{space:"warehouse"},durability:null,
        }));
        const packed=n=>panel.packSource(items(n),config);
        for(const [count,lengths]of [[0,[0]],[56,[56]],[57,[56,1]],[113,[56,56,1]]]){
            const pages=packed(count);
            if(JSON.stringify(pages.map(p=>p.length))!==JSON.stringify(lengths))errors.push(`pagination ${count}`);
            if(new Set(pages.flat().map(p=>p.item.uid)).size!==count)errors.push(`lost/duplicate ${count}`);
        }
        const full=packed(56)[0];
        if(full[7].x!==7||full[7].y!==0||full[8].x!==0||full[8].y!==1||
            full[55].x!==7||full[55].y!==6)errors.push("wrong row-major page coordinates");
        const mixed=config.templates.flatMap(t=>items(12,t).map(i=>({...i,uid:`${t.id}-${i.uid}`})));
        const pages=panel.packSource(mixed,config);
        if(pages.flat().length!==mixed.length)errors.push("mixed footprint count");
        for(const page of pages){
            const occupied=new Set();
            for(const {item,x,y}of page){
                const t=config.templates.find(t=>t.id===item.templateId);
                if(x<0||y<0||x+t.width>8||y+t.height>7)errors.push("mixed footprint bounds");
                for(let dy=0;dy<t.height;dy++)for(let dx=0;dx<t.width;dx++){
                    const cell=(y+dy)*8+x+dx;
                    if(occupied.has(cell))errors.push("mixed footprint collision");
                    occupied.add(cell);
                }
            }
        }
        try{
            panel.packSource(items(1),{...config,templates:config.templates.map(t=>t.id===one.id?{...t,width:9}:t)});
            errors.push("oversized source item must fail without looping");
        }catch(error){if(!error.message.includes("超出来源页尺寸"))errors.push(error.message);}
        const g=panel.sourceGeometry(),h={uid:trial.inventory.items[0].uid,rotated:false,grabX:0.5,grabY:0.5};
        const hit=(x,y)=>panel.hitDrag(new Laya.Point(x,y),h);
        if(hit(g.x+7.5*g.size,g.y+6.5*g.size)?.space!=="warehouse")errors.push("seventh row/eighth column is not a drop target");
        if(hit(g.x+8*g.size,g.y+g.size)!==null)errors.push("right edge is a drop target");
        if(hit(g.x+g.size,g.y+7*g.size)!==null)errors.push("footer is a drop target");
        // Presentation-only fixture: exercise native page buttons without writing an archive.
        window.__sourcePageOriginal=trial.save;
        trial.save=structuredClone(trial.save);
        trial.save.state.items=items(57);
        panel.inventoryPage=0;panel.refresh();
        return{errors};
    });
    assert.deepEqual(checks.errors,[]);
    try{
        await capture(p,tag+"-warehouse-full-56");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.length),56);
        await click(p,"invNext");
        assert.deepEqual(await p.evaluate(()=>{
            const v=window.__skillBattlePreview,panel=v.panel;
            return{page:panel.inventoryPage,items:panel.visibleItems.map(i=>i.uid)};
        }),{page:1,items:["source-page-56"]});
        await capture(p,tag+"-warehouse-next-page");
        await click(p,"invPrev");
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage),0);
        assert.equal(await saved(p),before,"Paging must not save or alter inventory");
    }finally{
        await p.evaluate(()=>{
            const v=window.__skillBattlePreview;v.trial.save=window.__sourcePageOriginal;
            delete window.__sourcePageOriginal;v.panel.inventoryPage=0;v.panel.refresh();
        });
    }
    const potion=await itemKey(p,1);
    await drag(p,potion.key,await grid(p,"battle",0,0));
    await start(p,(await itemKey(p,1,"battle")).key);
    const g=await p.evaluate(()=>window.__skillBattlePreview.panel.sourceGeometry());
    await move(p,await stagePoint(p,g.x+7.5*g.size,g.y+6.5*g.size));
    assert.equal((await capture(p,tag+"-warehouse-last-cell-drop")).valid,true);
    await release(p);
    assert.equal((await state(p)).items.find(i=>i.uid===potion.uid).location.space,"warehouse");
    assert.deepEqual((await state(p)).warehouseLayout.find(s=>s.uid===potion.uid),
        {uid:potion.uid,page:0,x:7,y:6,rotated:false});
    console.log(`PASS ${tag}: 7 rows x 8 columns/56 cells, full-page/overflow/native paging, mixed footprints, last-cell drop and right/bottom boundaries.`);
    await p.evaluate(text=>localStorage.setItem("nowchange.stage3-inventory.v1",text),before);
    await p.reload();await ready(p);
}
async function warehouseArrangeCases(p,tag){
    const original=await saved(p);
    const source=async(x,y,w=1,h=1)=>{
        const g=await p.evaluate(()=>window.__skillBattlePreview.panel.sourceGeometry());
        return stagePoint(p,g.x+(x+w/2)*g.size,g.y+(y+h/2)*g.size);
    };
    const slot=uid=>p.evaluate(uid=>window.__skillBattlePreview.trial.inventory.warehouseLayout?.find(s=>s.uid===uid),uid);
    try{
        await drag(p,(await itemKey(p,11)).key,await point(p,"invContainer"));
        for(const [id,x,y,w,h]of [[7,0,0,2,2],[7,2,0,2,2],[9,4,0,2,3],[9,4,3,2,3],[6,6,0,1,2]])
            await drag(p,(await itemKey(p,id)).key,await grid(p,"bag",x,y,w,h));
        const bag=await itemKey(p,10),before=await saved(p);
        await start(p,bag.key);await move(p,await source(1,5,2,2));
        const held=await capture(p,tag+"-warehouse-arrange-lower-preview");
        assert.equal(held.valid,true,"2x2 body must fit into the lower two warehouse rows");
        assert.equal(await saved(p),before,"Same-warehouse preview must not save");
        assert.equal(await p.evaluate(()=>Array.from({length:48},(_,i)=>
            window.__skillBattlePreview.panel.nodes[`invDragCell${i}`]).filter(n=>n.visible).length),4);
        await release(p);
        assert.deepEqual(await slot(bag.uid),{uid:bag.uid,page:0,x:1,y:5,rotated:false});
        const committed=await saved(p);
        const otherSlots=(await state(p)).warehouseLayout.filter(s=>s.uid!==bag.uid);
        await capture(p,tag+"-warehouse-arranged-lower");
        await click(p,"invEquipment");await click(p,"invAll");
        assert.deepEqual(await slot(bag.uid),{uid:bag.uid,page:0,x:1,y:5,rotated:false});
        assert.equal(await saved(p),committed,"Filtering does not rewrite positions");
        await p.reload();await ready(p);
        assert.equal(await saved(p),committed,"Warehouse arrangement survives reload");
        const display=await p.evaluate(uid=>{
            const panel=window.__skillBattlePreview.panel,index=panel.visibleItems.findIndex(i=>i.uid===uid);
            const n=panel.nodes[`invList${index}`],g=panel.sourceGeometry();
            return{x:(n.x-g.x)/g.size,y:(n.y-g.y)/g.size,width:n.width,height:n.height};
        },bag.uid);
        assert.deepEqual(display,{x:1,y:5,width:110,height:110});
        await capture(p,tag+"-warehouse-arranged-reloaded");
        await start(p,(await keyForUid(p,bag.uid,true)).key);await move(p,await source(0,0,2,2));
        assert.equal((await capture(p,tag+"-warehouse-arrange-collision")).valid,false);
        await release(p);assert.equal(await saved(p),committed,"Overlapping warehouse drop returns");
        await start(p,(await keyForUid(p,bag.uid,true)).key);await move(p,await source(7,6));
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),false);
        await release(p);assert.equal(await saved(p),committed,"Warehouse edge drop returns");
        await start(p,(await keyForUid(p,bag.uid,true)).key);await move(p,await source(4,5,2,2));
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),true);
        await cancel(p);assert.equal(await saved(p),committed,"Cancelling warehouse arrangement returns");
        await p.evaluate(()=>{
            window.__warehouseSet=Storage.prototype.setItem;
            Storage.prototype.setItem=function(k,v){if(k==="nowchange.stage3-inventory.v1")throw Error("warehouse quota");
                return window.__warehouseSet.call(this,k,v);};
        });
        try{
            await drag(p,(await keyForUid(p,bag.uid,true)).key,await source(4,5,2,2));
            assert.equal(await saved(p),committed,"Failed save keeps warehouse positions unchanged");
            assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/warehouse quota/);
        }finally{await p.evaluate(()=>{Storage.prototype.setItem=window.__warehouseSet;delete window.__warehouseSet;});}
        assert.deepEqual((await state(p)).warehouseLayout.filter(s=>s.uid!==bag.uid),otherSlots,"Other items never shuffle");
        const book=await itemKey(p,4);
        await start(p,book.key);await move(p,await source(4,6,2,1));await rotate(p);
        await move(p,await source(4,6,2,1));
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),true);
        await release(p);
        assert.deepEqual(await slot(book.uid),{uid:book.uid,page:0,x:4,y:6,rotated:true});
        const autoBook=await itemKey(p,5),beforeAuto=await saved(p);
        await start(p,autoBook.key);await move(p,await source(6,6,2,1));
        await p.waitForFunction(()=>window.__skillBattlePreview.panel.held?.rotated===true,null,{timeout:1800});
        assert.equal((await capture(p,tag+"-warehouse-auto-rotate")).valid,true);
        assert.equal(await saved(p),beforeAuto,"Warehouse hover rotation does not commit");
        await release(p);
        assert.deepEqual(await slot(autoBook.uid),{uid:autoBook.uid,page:0,x:6,y:6,rotated:true});
        const rotated=await saved(p);await p.reload();await ready(p);
        assert.equal(await saved(p),rotated);
        await start(p,(await keyForUid(p,book.uid,true)).key);
        await move(p,await stagePoint(p,700,610));
        assert.deepEqual(await p.evaluate(()=>{
            const panel=window.__skillBattlePreview.panel;
            return{rotated:panel.held.rotated,w:panel.nodes.invHeld.width,h:panel.nodes.invHeld.height,
                rotation:panel.nodes.invHeld.getChildAt(2).rotation};
        }),{rotated:true,w:110,h:54,rotation:90},"Re-grabbing uses the saved warehouse orientation");
        await cancel(p);
        console.log(`PASS ${tag}: same-warehouse 2x2 downward drag, 4-cell feedback, fixed other positions, filter/reload, collision/edge/cancel/quota rollback and rotation.`);
    }finally{
        // Restore only this isolated browser fixture, never the user's running origin.
        await p.evaluate(text=>localStorage.setItem("nowchange.stage3-inventory.v1",text),original);
        await p.reload();await ready(p);
    }
}
async function warehouseTransferCases(p,tag){
    const original=await saved(p);
    const footprint=()=>p.evaluate(()=>Array.from({length:48},(_,i)=>
        window.__skillBattlePreview.panel.nodes[`invDragCell${i}`]).filter(n=>n.visible).length);
    try{
        await drag(p,(await itemKey(p,11)).key,await point(p,"invContainer"));
        // Clear lower warehouse rows through normal moves before testing exact return placement.
        for(const [id,x,y,w,h]of[[7,0,0,2,2],[7,2,0,2,2],[9,4,0,2,3],[9,4,3,2,3],[6,6,0,1,2]])
            await drag(p,(await itemKey(p,id)).key,await grid(p,"bag",x,y,w,h));
        const spare=await itemKey(p,10),before=await saved(p);
        await start(p,spare.key);await move(p,await grid(p,"bag",0,3,2,2));
        assert.equal((await capture(p,tag+"-spare-to-bag-preview")).valid,true);
        assert.equal(await footprint(),4);assert.equal(await saved(p),before);
        await release(p);
        assert.deepEqual((await state(p)).items.find(i=>i.uid===spare.uid).location,{space:"bag",x:0,y:3,rotated:false});
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.gridGeometry("bag").cols),8,"Stored body adds no capacity");
        const carried=await saved(p),otherSlots=await p.evaluate(()=>{
            const {panel,trial}=window.__skillBattlePreview;
            return panel.packWarehouse(trial.inventory.items,trial.archive.config,trial.inventory).flatMap((slots,page)=>
                slots.map(({item,x,y,rotated})=>({uid:item.uid,page,x,y,rotated})));
        });
        await click(p,"invEquipment");
        await start(p,(await keyForUid(p,spare.uid)).key);await move(p,await sourcePoint(p,0,0,2,2));
        assert.equal((await capture(p,tag+"-bag-to-warehouse-collision")).valid,false);
        assert.equal(await footprint(),4);await release(p);assert.equal(await saved(p),carried);
        await click(p,"invAll");
        await start(p,(await keyForUid(p,spare.uid)).key);await move(p,await sourcePoint(p,7,6));
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),false);
        await release(p);assert.equal(await saved(p),carried);
        await start(p,(await keyForUid(p,spare.uid)).key);await move(p,await sourcePoint(p,1,5,2,2));
        assert.equal((await capture(p,tag+"-bag-to-warehouse-preview")).valid,true);
        assert.equal(await footprint(),4);await cancel(p);assert.equal(await saved(p),carried);
        await p.evaluate(()=>{
            window.__transferSet=Storage.prototype.setItem;
            Storage.prototype.setItem=function(k,v){if(k==="nowchange.stage3-inventory.v1")throw Error("transfer quota");
                return window.__transferSet.call(this,k,v);};
        });
        try{
            await drag(p,(await keyForUid(p,spare.uid)).key,await sourcePoint(p,1,5,2,2));
            assert.equal(await saved(p),carried);assert.match(await p.evaluate(()=>window.__skillBattlePreview.panel.notice),/transfer quota/);
        }finally{await p.evaluate(()=>{Storage.prototype.setItem=window.__transferSet;delete window.__transferSet;});}
        await drag(p,(await keyForUid(p,spare.uid)).key,await sourcePoint(p,1,5,2,2));
        let s=await state(p);
        assert.deepEqual(s.warehouseLayout.find(s=>s.uid===spare.uid),{uid:spare.uid,page:0,x:1,y:5,rotated:false});
        assert.deepEqual(s.warehouseLayout.filter(s=>s.uid!==spare.uid),otherSlots);
        const committed=await saved(p);await p.reload();await ready(p);assert.equal(await saved(p),committed);
        await capture(p,tag+"-bag-to-warehouse-reloaded");
        const herb=await itemKey(p,6,"bag"),beforeRotate=await saved(p);
        await start(p,herb.key);await move(p,await sourcePoint(p,6,6,2,1));
        await p.waitForFunction(()=>window.__skillBattlePreview.panel.held?.rotated===true,null,{timeout:1800});
        assert.equal((await capture(p,tag+"-bag-to-warehouse-auto-rotate")).valid,true);
        assert.equal(await footprint(),2);assert.equal(await saved(p),beforeRotate);await release(p);
        assert.deepEqual((await state(p)).warehouseLayout.find(s=>s.uid===herb.uid),{uid:herb.uid,page:0,x:6,y:6,rotated:true});
        await drag(p,(await keyForUid(p,spare.uid,true)).key,await grid(p,"bag",0,3,2,2));
        await drag(p,(await keyForUid(p,spare.uid)).key,await point(p,"invContainer"));
        s=await state(p);assert.equal(s.items.find(i=>i.uid===spare.uid).location.space,"container");
        assert.equal(s.items.filter(i=>i.uid===spare.uid).length,1);
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.gridGeometry("bag").cols),6);
        await start(p,"invContainer");await move(p,await sourcePoint(p,1,5,2,2));
        assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.held.valid),true);
        assert.equal(await footprint(),4);await release(p);
        s=await state(p);assert.ok(s.items.every(i=>!["bag","container"].includes(i.location.space)));
        assert.deepEqual(s.warehouseLayout.find(s=>s.uid===spare.uid),{uid:spare.uid,page:0,x:1,y:5,rotated:false});
        await capture(p,tag+"-container-unloaded-exact-slot");
        console.log(`PASS ${tag}: spare container bidirectional native drag, identical 4-cell feedback, exact warehouse placement/reload, collision/edge/cancel/quota rollback, equip from bag and atomic unload.`);
    }finally{
        await p.evaluate(text=>localStorage.setItem("nowchange.stage3-inventory.v1",text),original);
        await p.reload();await ready(p);
    }
}
async function autoRotationCases(p,tag){
    const book=await itemKey(p,4);
    const bookSlot=await sourceSlot(p,book.uid);
    // This rotation fixture returns to known slots; commit the initial warehouse layout first.
    await p.evaluate(({uid,to})=>{
        const {panel,trial}=window.__skillBattlePreview,item=trial.inventory.items.find(i=>i.uid===uid);
        trial.inventoryCommand({type:"arrangeWarehouse",uid,from:item.location,to:{page:0,...to}});
        panel.refresh();
    },{uid:book.uid,to:bookSlot});
    const before=await saved(p);
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
    await start(p,(await itemKey(p,4,"safe")).key);
    await move(p,await stagePoint(p,700,610));await rotate(p);
    await move(p,await sourcePoint(p,bookSlot.x,bookSlot.y,1,2));await release(p);
    await start(p,(await itemKey(p,4)).key);await move(p,await grid(p,"bag",0,0,1,2));
    await p.waitForTimeout(550);assert.equal((await held()).rotated,false,"A fitting orientation must stay unchanged");
    await cancel(p);
    const ore=await itemKey(p,7),oreSlot=await sourceSlot(p,ore.uid);
    await drag(p,ore.key,await grid(p,"bag",0,0,2,2));
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
    await drag(p,(await itemKey(p,7,"bag")).key,await sourcePoint(p,oreSlot.x,oreSlot.y,2,2));
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
    const sword=await itemKey(p,9),swordSlot=await sourceSlot(p,sword.uid);
    await start(p,sword.key,{x:0.2,y:0.8});await move(p,await stagePoint(p,700,610));await rotate(p);
    await move(p,await grid(p,"bag",3.9,1.9));await waitRotation(false);
    const vertical=await held();
    assert.equal(vertical.rotated,false);assert.equal(vertical.valid,true);assert.equal(vertical.target.space,"bag");
    assert.equal(vertical.target.x,4);assert.ok(vertical.target.y===0);
    assert.equal(await p.evaluate(()=>window.__skillBattlePreview.panel.nodes.invHeld.getChildAt(2).rotation),0);
    await capture(p,tag+"-auto-sword-vertical");await release(p);
    await drag(p,(await itemKey(p,9,"bag")).key,await sourcePoint(p,swordSlot.x,swordSlot.y,2,3));
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
            const mobile=viewport.width<900,tag=(ide?"ide-":"")+(mobile?"mobile":viewport.width>1280?"wide":"desktop");
            const ctx=await browser.newContext({viewport,hasTouch:mobile}),p=await ctx.newPage(),errors=[],missing=[];
            p.mobile=mobile;p.cdp=await ctx.newCDPSession(p);
            p.on("pageerror",e=>errors.push(e.message));p.on("response",r=>{if(r.status()>=400)missing.push(r.url());});
            await p.goto(url);await ready(p);await click(p,"invPrimary");
            await p.evaluate(()=>localStorage.setItem("another-app","preserve"));
            await capture(p,tag+"-source-grid");
            if(process.argv.includes("--transfer-only")){
                await warehouseTransferCases(p,tag);
                assert.deepEqual(errors,[],`${tag} page errors`);assert.deepEqual(missing,[],`${tag} asset failures`);
                await ctx.close();continue;
            }
            await sourcePageCases(p,tag);
            await warehouseArrangeCases(p,tag);
            await warehouseTransferCases(p,tag);
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
