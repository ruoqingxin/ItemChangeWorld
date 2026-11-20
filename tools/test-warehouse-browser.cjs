const {chromium}=require("playwright"),assert=require("node:assert/strict");
const fs=require("node:fs/promises"),path=require("node:path");
const {confirmStartup}=require("./lobby-save-test-utils.cjs");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18095";
const out=path.resolve(__dirname,"../output/design/warehouse");
async function point(page,key){
    return page.evaluate(key=>{
        const v=window.__skillBattlePreview,n=v.panel?.getNode?.(key)||v.view.getElement(key,false);
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
        return {active:!!h,valid:h?.valid,error:h?.error,detail:p.nodes.box_inventory_detail.visible};
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
        for(const name of ["invLeftPanel","img_battle_well","invBagPanel","img_backpack_well"]){
            const n=find(p.root,name);
            if(!n?.src.endsWith("popup-panel-plain.png"))errors.push(name+"未用无线底图");
        }
        for(const [kind,count]of [["weapon",6],["armor",6],["accessory",4],["container",4]]){
            const cells=find(p.root,"box_"+kind+"_cells"),hint=find(p.root,"img_"+kind+"_hint");
            if(cells?.numChildren!==count)errors.push(kind+"装备格不完整");
            if(cells&&cells.parent.getChildIndex(cells)>=hint.parent.getChildIndex(hint))errors.push(kind+"图标未叠在格子上");
        }
        for(const [kind,space]of [["weapon","weapon"],["container","container"]]){
            const hint=find(p.root,"img_"+kind+"_hint");
            if(hint.visible===p.state.items.some(i=>i.location.space===space))errors.push(kind+"空位提示显隐错误");
        }
        if(!find(p.root,"img_armor_hint")?.visible||!find(p.root,"img_accessory_hint")?.visible)errors.push("缺少装备空位提示");
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
        if(view.uiElement.elementMapper.elements.length>60)result.push("页面绑定未精简");
        const safe=p.nodes.box_safe_content,s=p.lists.safe.rootNode,b=p.lists.battle.rootNode;
        if(Math.abs(s.x-(safe.width-s.width)/2)>0.5||Math.abs(s.y-(safe.height-s.height)/2)>0.5)result.push("归真匣双向居中");
        if(Math.abs(b.x-(p.nodes.battleItemsArea.width-b.width)/2)>0.5)result.push("斗法匣水平居中");
        for(const [name,list]of Object.entries(p.lists)){
            for(let i=0;i<list.arrayLen;i++){
                const n=list.rootNode.getChildAt(i),cols=name==="source"?8:name==="bag"?7:name==="battle"?5:p.config.spaces.safeWidth;
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
    const saved=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
    await page.evaluate(()=>{window.__warehouseFixture=structuredClone(window.__skillBattlePreview.trial.data.save);});
    try{
        for(const [w,h]of [[2,1],[2,2],[3,2],[3,3]]){
            await page.evaluate(([w,h])=>{
                const v=window.__skillBattlePreview;v.trial.data.save=structuredClone(window.__warehouseFixture);
                Object.assign(v.trial.data.save.config.spaces,{safeWidth:w,safeHeight:h});v.panel.refresh();
            },[w,h]);
            await layout(page);
            assert.deepEqual(await page.evaluate(()=>{
                const p=window.__skillBattlePreview.panel,list=p.lists.safe.rootNode,last=list.getChildAt(list.numChildren-1);
                const item=p.visibleItems.find(i=>i.templateId===309);
                const pos=p.root.globalToLocal(last.localToGlobal(new Laya.Point(27,27)));
                const hit=p.hitDrag(pos,{uid:item.uid,rotated:false,grabX:0.5,grabY:0.5});
                return [p.lists.safe.arrayLen,hit.space,hit.x+0,hit.y+0];
            }),[w*h,"safe",w-1,h-1]);
            await page.screenshot({path:path.join(out,`${name}-safe-${w}x${h}.png`)});
        }
    }finally{
        await page.evaluate(()=>{const v=window.__skillBattlePreview;v.trial.data.save=window.__warehouseFixture;delete window.__warehouseFixture;v.panel.refresh();});
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
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
        for(let i=0;i<3;i++)await click(page,"btn_bag_down");
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
            await click(page,"invList"+source);
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.nodes.box_inventory_detail.visible),true);
            await click(page,"btn_detail_close");
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
            const saved=await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1"));
            await click(page,"btn_lobby_back");await click(page,"btn_warehouse");await warehouse(page);
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
            await page.reload();await confirmStartup(page);await click(page,"btn_warehouse");await warehouse(page);
            assert.equal(await page.evaluate(()=>localStorage.getItem("nowchange.expedition.v1")),saved);
            await layout(page);
            if(name==="desktop"){
                for(const size of [{width:2560,height:1080},{width:667,height:375}]){
                    await page.setViewportSize(size);await page.waitForTimeout(150);await layout(page);
                }
            }
            await click(page,"btn_lobby_back");await click(page,"btn_realm");await click(page,"invPrimary");
            await page.waitForFunction(()=>window.__skillBattlePreview.panel.pageRole==="map");
            await click(page,"expStorage");await warehouse(page);await layout(page);
            await pageTabs(page,7);
            await click(page,"expLootPage7");
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.inventoryPage),6);
            await click(page,"btn_lobby_back");assert.equal(await page.evaluate(()=>window.__skillBattlePreview.panel.pageRole),"map");
            assert.deepEqual(errors,[]);await context.close();
            console.log(`通过 ${name}：七页锁定、无线底图、空位图标、七列容量、双向居中、拖拽换包及原档重放。`);
        }
    }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
