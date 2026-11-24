const {chromium}=require("playwright"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const sharp=require("sharp");
const {confirmStartup}=require("./lobby-save-test-utils.cjs");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18095";
const out=path.resolve(__dirname,"../tmp/combat-release/warehouse");
async function point(page,key){
    return page.evaluate(key=>{
        const v=window.__skillBattlePreview,n=v.ui.topView?.getElement(key,false)||v.panel?.getNode?.(key)||v.view.getElement(key,false);
        if(!n?.visible)throw Error("控件不可见："+key);
        const p=n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return{x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
    },key);
}
async function click(page,key){
    const p=await point(page,key);
    if(page.touchMode)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
    await page.waitForTimeout(120);
}
async function drag(page,from,to,{cancel=false,expectInvalid=false,rotate=false}={}){
    const a=await point(page,from),b=typeof to==="string"?await point(page,to):to;
    let cdp;
    if(page.touchMode){
        cdp=await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});
        for(let i=1;i<=16;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
            x:a.x+(b.x-a.x)*i/16,y:a.y+(b.y-a.y)*i/16,id:1}]});
    } else {
        await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:16});
    }
    const held=await page.evaluate(()=>{
        const p=window.__skillBattlePreview.panel,h=p.held;
        return {active:!!h,valid:h?.valid,error:h?.error,
            detail:window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh")||false};
    });
    assert.equal(held.active,true);assert.equal(held.detail,false);
    if(rotate){await page.keyboard.press("r");}
    else if(!cancel)assert.equal(held.valid,!expectInvalid,held.error);
    if(cancel)await page.keyboard.press("Escape");
    if(cdp){await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();}
    else await page.mouse.up();
    await page.waitForTimeout(120);
}
async function warehouse(page){
    await page.waitForFunction(()=>window.__skillBattlePreview.view.path.endsWith("/SkillBattleInventoryView.lh")&&
        window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.lists?.source.arrayLen===56);
}
async function pageTabs(page,available){
    assert.deepEqual(await page.evaluate(()=>{
        const p=window.__skillBattlePreview.panel;
        return Array.from({length:7},(_,i)=>{
            const n=p.nodes["expLootPage"+(i+1)];
            return [n.visible,n.mouseEnabled,n.getChildAt(1).visible,n.getChildAt(2).visible];
        });
    }),Array.from({length:7},(_,i)=>[true,i<available,i<available,i>=available]));
}
async function presentation(page){
    assert.deepEqual(await page.evaluate(()=>{
        const p=window.__skillBattlePreview.panel,find=(n,name)=>{
            if(n.name===name)return n;
            for(let i=0;i<n.numChildren;i++){const found=find(n.getChildAt(i),name);if(found)return found;}
        };
        const errors=[];
        if(find(p.root,"sourceFiltersArea"))errors.push("顶部筛选仍存在");
        for(const name of ["invLeftPanel","img_battle_well","invBagPanel"]){
            const n=find(p.root,name);
            if(!n?.src.endsWith("warehouse/graphite/panel.png"))errors.push(name+"未用银灰底图");
        }
        if(find(p.root,"img_backpack_well"))errors.push("背包装备仍使用独立底板");
        for(const name of ["btn_take_all","btn_store_all"])
            if(!p.nodes[name]?.tooltips)errors.push(name+"缺少用途提示");
        const take=p.nodes.btn_take_all,store=p.nodes.btn_store_all;
        if(take.getChildAt(1).rotation!==0||store.getChildAt(1).rotation!==0)
            errors.push("整批移动箭头方向错误");
        if(!take.getChildAt(1).src.endsWith("graphite/arrow-left.png"))errors.push("取物箭头未向左");
        if(!store.getChildAt(1).src.endsWith("graphite/arrow-right.png"))errors.push("回仓箭头未向右");
        for(const [kind,count]of [["weapon",6],["armor",6],["accessory",4],["container",4]]){
            const cells=find(p.root,"box_"+kind+"_cells"),hint=find(p.root,"img_"+kind+"_hint");
            if(cells?.numChildren!==count)errors.push(kind+"装备格不完整");
            if(cells&&cells.parent.getChildIndex(cells)>=hint.parent.getChildIndex(hint))errors.push(kind+"图标未叠在格子上");
        }
        for(const [kind,space]of [["weapon","weapon"],["armor","armor"],["accessory","accessory"],["container","container"]]){
            const hint=find(p.root,"img_"+kind+"_hint");
            if(hint.visible===p.state.items.some(i=>i.location.space===space))errors.push(kind+"空位提示显隐错误");
        }
        const hasBag=p.state.items.some(i=>i.location.space==="container");
        if(p.nodes.img_bag_empty.visible===hasBag||p.nodes.bagItemsArea.visible!==hasBag)
            errors.push("纳虚器内容与空态显隐错误");
        const weight=p.state.items.filter(i=>["weapon","armor","accessory","container","bag"].includes(i.location.space))
            .reduce((sum,i)=>sum+p.config.templates.find(t=>t.id===i.templateId).weight,0);
        if(!p.nodes.txt_bagWeightLimit.text.startsWith("负重："+weight+"/"))errors.push("负重未同步实际物品");
        return errors;
    }),[]);
}
async function layout(page){
    const problems=await page.evaluate(()=>{
        const {view,panel:p}=window.__skillBattlePreview,result=[];
        const bounds=n=>{const a=n.localToGlobal(new Laya.Point()),b=n.localToGlobal(new Laya.Point(n.width,n.height));return {x:a.x,y:a.y,r:b.x,b:b.y}};
        const popup=bounds(p.root);
        if(Math.abs((popup.x+popup.r)/2-Laya.stage.width/2)>0.5||Math.abs((popup.y+popup.b)/2-Laya.stage.height/2)>0.5)
            result.push("弹窗居中");
        const safe=p.nodes.box_safe_content,s=p.lists.safe.rootNode,b=p.lists.battle.rootNode;
        if(Math.abs(s.x-(safe.width-s.width)/2)>0.5||Math.abs(s.y-(safe.height-s.height)/2)>0.5)result.push("归真匣双向居中");
        const lock=p.nodes.img_safe_lock;
        if(lock.visible&&(Math.abs(lock.x-(safe.width-lock.width)/2)>0.5||
            Math.abs(lock.y-(safe.height-lock.height)/2)>0.5))result.push("归真匣锁未居中");
        if(Math.abs(b.x-(p.nodes.box_battle_content.width-b.width)/2)>0.5)result.push("斗法匣水平居中");
        if(Math.abs(b.y-(p.nodes.box_battle_content.height-b.height)/2)>0.5)result.push("斗法匣垂直居中");
        if(p.nodes.invBattleTitle.x+p.nodes.invBattleTitle.width>p.nodes.box_battle_content.x+b.x)
            result.push("斗法匣标题与格子重叠");
        const bagSlot=bounds(p.nodes.invContainer),bagFrame=bounds(p.nodes.bagArea);
        const bagGrid=bounds(p.nodes.bagItemsArea);
        if(bagSlot.r>bagFrame.x||bagSlot.b>bagFrame.b)result.push("纳虚器本体未放在独立装备区域");
        const source=bounds(p.nodes.sourceItemsArea),pages=bounds(p.nodes.sourcePagesArea);
        if(Math.abs(pages.x-source.x)>0.5||Math.abs(pages.r-source.r)>0.5||
            Math.abs(source.y-pages.b-20)>0.5)result.push("仓库分页未贴齐网格上方");
        const take=bounds(p.nodes.btn_take_all),store=bounds(p.nodes.btn_store_all);
        if(take.x<bagFrame.r||store.r>source.x)result.push("转移按钮未放在双侧区域之间");
        for(const name of ["btn_sell","btn_close"]){
            const n=bounds(p.nodes[name]);
            if(n.x<popup.x||n.r>bagFrame.x||n.y<bagSlot.b||n.b>bagFrame.b)
                result.push(name+"未放在左下方");
        }
        for(const [name,list]of Object.entries(p.lists)){
            for(let i=0;i<list.arrayLen;i++){
                const n=list.rootNode.getChildAt(i),cols=name==="source"?8:name==="bag"?7:name==="battle"?5:p.safeSpecs[p.safeIndex].cols;
                if(n.width!==54||n.height!==54||n.x!==i%cols*56||n.y!==Math.floor(i/cols)*56)result.push(name+"排列");
            }
        }
        if(p.lists.bag.arrayLen!==(p.state?p.config.templates.find(t=>
            t.id===p.state.items.find(i=>i.location.space==="container")?.templateId)?.bagWidth*
            p.config.templates.find(t=>t.id===p.state.items.find(i=>i.location.space==="container")?.templateId)?.bagHeight||0:12))
            result.push("背包总容量");
        const bag=bounds(p.nodes.bagItemsArea),area=bounds(p.nodes.bagArea);
        if(bag.r>area.r||bag.x<area.x)result.push("背包越出面板");
        const visible=n=>{for(let v=n;v;v=v.parent)if(!v.visible)return false;return true};
        for(const n of Object.values(p.nodes)){
            if(!n.parent||!visible(n))continue;
            let clipped=false;for(let v=n.parent;v;v=v.parent)if(v===p.nodes.bagItemsArea)clipped=true;
            if(clipped)continue;
            const a=bounds(n);
            if(a.x<0||a.y<0||a.r>Laya.stage.width+0.5||a.b>Laya.stage.height+0.5)result.push(n.name+"屏幕溢出");
            if(n instanceof Laya.GTextField&&n.text){
                n.textIns.typeset(true);
                if(n.textIns.textWidth>n.width+2||n.textIns.textHeight>n.height+2)result.push(n.name+"文字溢出");
            }
        }
        return [...new Set(result)];
    });
    assert.deepEqual(problems,[]);
}
async function shapes(page,name){
    const carried=await page.evaluate(()=>window.__skillBattlePreview.panel.gridItems.findIndex(i=>i.location.space==="battle"));
    await drag(page,"invItem"+carried,"invCell_safe_0");
    const saved=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
    for(const [index,[w,h]]of [[2,1],[2,2],[3,2],[3,3]].entries()){
            if(index)await click(page,"btn_safe_right");
            await layout(page);
            assert.deepEqual(await page.evaluate(()=>{
                const p=window.__skillBattlePreview.panel,list=p.lists.safe.rootNode,last=list.getChildAt(list.numChildren-1);
                const item=p.visibleItems.find(i=>i.templateId===309);
                const pos=p.root.globalToLocal(last.localToGlobal(new Laya.Point(27,27)));
                const hit=p.hitDrag(pos,{uid:item.uid,rotated:false,grabX:0.5,grabY:0.5});
                return [p.lists.safe.arrayLen,p.nodes.img_safe_lock.visible,hit?.space||null,
                    p.nodes.btn_safe_left.mouseEnabled,p.nodes.btn_safe_right.mouseEnabled,
                    p.gridItems.some(i=>i.location.space==="safe")];
            }),[w*h,index>0,index?null:"safe",index>0,index<3,index===0]);
            if(index===1){
                const source=await page.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.findIndex(i=>i.templateId===309));
                await drag(page,"invList"+source,"invCell_safe_0",{expectInvalid:true});
            }
            const bytes=await page.screenshot({path:path.join(out,`${name}-safe-${w}x${h}.png`)});
            const stats=await sharp(bytes).stats();
            assert.ok(stats.channels.slice(0,3).some(c=>c.stdev>12),"归真匣画布应有有效内容");
    }
    for(let i=0;i<3;i++)await click(page,"btn_safe_left");
    assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
    assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.gridItems.some(i=>i.location.space==="safe")),true);
}
async function scrolling(page,name){
    const saved=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
    await page.evaluate(()=>{
        const v=window.__skillBattlePreview;window.__warehouseFixture=structuredClone(v.trial.data.save);
        const s=v.trial.data.save.state;s.bagColumns=7;
        s.items.find(i=>i.location.space==="container").templateId=1211;
        s.items.find(i=>i.location.space==="bag").location={space:"bag",x:5,y:6,rotated:false};v.panel.refresh();
    });
    try{
        await scrollBag(page,1);
        assert.deepEqual(await page.evaluate(()=>{
            const p=window.__skillBattlePreview.panel,n=p.getNode("invCell_bag_47");
            const point=p.root.globalToLocal(n.localToGlobal(new Laya.Point(27,27)));
            const item=p.visibleItems.find(i=>i.templateId===309),hit=p.hitDrag(point,{uid:item.uid,rotated:false,grabX:0.5,grabY:0.5});
            return [p.bagScroller.posY,p.bagScroller.contentHeight,hit.space,hit.x+0,hit.y+0];
        }),[224,390,"bag",5,6]);
        await layout(page);await page.screenshot({path:path.join(out,`${name}-scroll.png`)});
    }finally{
        await page.evaluate(()=>{const v=window.__skillBattlePreview;v.panel.bagScroller.posY=0;
            v.trial.data.save=window.__warehouseFixture;delete window.__warehouseFixture;v.panel.refresh();});
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
}
async function scrollBag(page,percent){
    await page.waitForTimeout(120);
    const points=await page.evaluate(percent=>{
        const p=window.__skillBattlePreview.panel,bar=p.nodes.box_bag_scrollbar,grip=bar._gripButton;
        const canvas=document.querySelector("canvas").getBoundingClientRect();
        const client=point=>({x:canvas.left+point.x*canvas.width/Laya.stage.width,
            y:canvas.top+point.y*canvas.height/Laya.stage.height});
        return {a:client(grip.localToGlobal(new Laya.Point(grip.width/2,grip.height/2))),
            b:client(bar.localToGlobal(new Laya.Point(bar.width/2,
                bar._bar.y+(bar._bar.height-grip.height)*percent+grip.height/2)))};
    },percent);
    if(page.touchMode){
        const cdp=await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...points.a,id:1}]});
        for(let i=1;i<=12;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
            x:points.a.x+(points.b.x-points.a.x)*i/12,y:points.a.y+(points.b.y-points.a.y)*i/12,id:1}]});
        await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();
    }else{
        await page.mouse.move(points.a.x,points.a.y);await page.mouse.down();
        await page.mouse.move(points.b.x,points.b.y,{steps:12});await page.mouse.up();
    }
    await page.waitForTimeout(150);
}
async function bulkTransfer(page){
    const before=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
    await click(page,"btn_take_all");
    const picked=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
    const count=before.state.items.filter(i=>i.location.space==="warehouse").length;
    assert.equal(picked.commands.length,before.commands.length+1);
    assert.equal(picked.state.revision,before.state.revision+1);
    assert.equal(picked.state.items.filter(i=>i.location.space==="bag").length,
        before.state.items.filter(i=>i.location.space==="bag").length+count);
    for(const space of ["safe","battle","weapon","container"])
        assert.deepEqual(picked.state.items.filter(i=>i.location.space===space),before.state.items.filter(i=>i.location.space===space));
    const noSale=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
    await click(page,"btn_sell");
    assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),noSale);
    await click(page,"btn_store_all");
    const stored=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
    assert.equal(stored.commands.length,picked.commands.length+1);
    assert.equal(stored.state.items.filter(i=>i.location.space==="bag").length,0);
    assert.equal(stored.state.items.length,before.state.items.length);
    await page.reload();await confirmStartup(page);await click(page,"btn_warehouse");await warehouse(page);
    assert.deepEqual(await page.evaluate(()=>window.__skillBattlePreview.trial.archive),stored);
}
async function details(page,source,name){
    await click(page,"invList"+source);
    await page.waitForFunction(()=>window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh"));
    const assertVisible=async()=>assert.deepEqual(await page.evaluate(()=>{
        const v=window.__skillBattlePreview.ui.topView,n=v.getElement("box_item_detail"),
            a=n.localToGlobal(new Laya.Point()),b=n.localToGlobal(new Laya.Point(n.width,n.height));
        return [a.x>=11.5,a.y>=11.5,b.x<=Laya.stage.width-11.5,b.y<=Laya.stage.height-11.5,
            !!v.getElement("txt_item_name").text,!!v.getElement("txt_item_detail").text];
    }),[true,true,true,true,true,true]);
    await assertVisible();
    await page.screenshot({path:path.join(out,`${name}-detail.png`)});
    for(const [x,y]of [[0,0],[1,0],[0,1],[1,1]]){
        await page.evaluate(([x,y])=>{
            const v=window.__skillBattlePreview.ui.topView,n=v.request.anchor,parent=n.parent;
            const a=n.localToGlobal(new Laya.Point()),b=n.localToGlobal(new Laya.Point(n.width,n.height));
            window.__anchorPosition={x:n.x,y:n.y};
            const p=parent.globalToLocal(new Laya.Point(x?Laya.stage.width-(b.x-a.x):0,y?Laya.stage.height-(b.y-a.y):0));
            n.pos(p.x,p.y);v.placeNearItem();
        },[x,y]);
        await assertVisible();
        await page.evaluate(()=>{
            const v=window.__skillBattlePreview.ui.topView,n=v.request.anchor,p=window.__anchorPosition;
            n.pos(p.x,p.y);delete window.__anchorPosition;v.placeNearItem();
        });
    }
    await click(page,"btn_close");
    assert.ok(!(await page.evaluate(()=>window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh"))));
    await click(page,"invWeapon");await assertVisible();
    await page.keyboard.press("Escape");
    await click(page,"invList"+source);
    const viewport=page.viewportSize();
    await page.setViewportSize({width:667,height:375});await page.waitForTimeout(180);await assertVisible();
    await page.setViewportSize(viewport);await page.waitForTimeout(180);await assertVisible();
    await click(page,"invSourceTitle");
    assert.ok(!(await page.evaluate(()=>window.__skillBattlePreview.ui.topView?.path.endsWith("/ItemDetailView.lh"))));
}
(async()=>{
    await fs.mkdir(out,{recursive:true});
    const browser=await chromium.launch({headless:true,channel:"chromium"});
    try{
        for(const [name,width,height,touch]of [["desktop",1280,720,false],["mobile",844,390,true],["tablet",1024,768,true],["wide",1560,720,false]]){
            const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
            const page=await context.newPage(),errors=[];page.touchMode=touch;page.on("pageerror",e=>errors.push(e.message));
            await page.goto(url);await confirmStartup(page);await click(page,"btn_warehouse");await warehouse(page);
            await pageTabs(page,1);await presentation(page);
            const lockedSave=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await click(page,"expLootPage2");
            await page.evaluate(()=>window.__skillBattlePreview.panel.nodes.expLootPage2.event(Laya.Event.CLICK));
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage),0);
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),lockedSave);
            await layout(page);await page.screenshot({path:path.join(out,name+".png")});
            const source=await page.evaluate(()=>window.__skillBattlePreview.panel.visibleItems.findIndex(i=>i.templateId===309));
            await details(page,source,name);
            const before=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await drag(page,"invList"+source,"invCell_bag_1",{cancel:true});
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),before);
            await drag(page,"invList"+source,"invCell_bag_1");
            assert.deepEqual(await page.evaluate(()=>{
                const s=window.__skillBattlePreview.trial.inventory,i=s.items.find(i=>i.templateId===309);
                return [s.bagColumns,i.location.space,i.location.x,i.location.y];
            }),[7,"bag",1,0]);
            let index=await page.evaluate(()=>window.__skillBattlePreview.panel.gridItems.findIndex(i=>i.templateId===309));
            const persisted=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await drag(page,"invItem"+index,"invCell_bag_0",{expectInvalid:true});
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),persisted);
            await drag(page,"invItem"+index,"invSourceCell55");
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.templateId===309).location.space),"warehouse");
            await pageTabs(page,1);
            await click(page,"btn_sort");
            const sorted=await page.evaluate(()=>window.__skillBattlePreview.trial.archive);
            assert.equal(sorted.commands.at(-1).command.type,"sortStorage");
            const sortedRaw=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await click(page,"btn_sort");
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),sortedRaw);
            if(name==="desktop"||name==="mobile"){
                await shapes(page,name);await scrolling(page,name);
                const uid=await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.location.space==="container").uid);
                await drag(page,"invContainer","invSourceCell41");
                await presentation(page);
                index=await page.evaluate(uid=>window.__skillBattlePreview.panel.visibleItems.findIndex(i=>i.uid===uid),uid);
                assert.ok(index>=0);await drag(page,"invList"+index,"invContainer");
                assert.equal(await page.evaluate(uid=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.uid===uid).location.space,uid),"container");
                await presentation(page);
            }
            await bulkTransfer(page);
            const saved=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await click(page,"btn_close");await click(page,"btn_warehouse");await warehouse(page);
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
            await page.reload();await confirmStartup(page);await click(page,"btn_warehouse");await warehouse(page);
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
            await layout(page);
            if(name==="desktop"){
                for(const size of [{width:2560,height:1080},{width:667,height:375}]){
                    await page.setViewportSize(size);await page.waitForTimeout(150);await layout(page);
                }
            }
            await click(page,"btn_close");await click(page,"btn_realm");await click(page,"invPrimary");
            await page.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="map");
            await click(page,"expStorage");await warehouse(page);await layout(page);
            await pageTabs(page,7);
            await click(page,"expLootPage7");
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage),6);
            await click(page,"btn_close");assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.pageRole),"map");
            assert.deepEqual(errors,[]);await context.close();
            console.log(`通过 ${name}：归真匣锁定预览、详情四角限位与缩放、当前页整理、负重空态、整批转移、拖拽换包及存档重放。`);
        }
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
