const {chromium}=require("playwright"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),path=require("node:path"),sharp=require("sharp");
const {confirmStartup}=require("./lobby-save-test-utils.cjs");
const url=process.env.SKILL_BATTLE_URL||"http://127.0.0.1:18123";
const output=path.resolve(__dirname,"../tmp/combat-release/browser");
async function point(page,key){
    return page.evaluate(key=>{
        const v=window.__skillBattlePreview,n=v.ui.topView?.getElement(key,false)||v.panel?.buttons?.[key]||v.panel?.nodes?.[key]||v.view.getElement(key,false);
        if(!n?.visible)throw Error("控件不可见："+key);
        const p=n.localToGlobal(new Laya.Point(n.width/2,n.height/2)),r=document.querySelector("canvas").getBoundingClientRect();
        return {x:r.left+p.x*r.width/Laya.stage.width,y:r.top+p.y*r.height/Laya.stage.height};
    },key);
}
async function click(page,key){
    await page.waitForFunction(()=>window.__skillBattlePreview?.view?.isOpened);
    const p=await point(page,key);
    if(page.touchMode)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
    await page.waitForTimeout(180);
}
async function itemNode(page,uid){
    return page.evaluate(uid=>{
        const p=window.__skillBattlePreview.panel;
        const source=p.visibleItems.findIndex(i=>i.uid===uid);
        if(source>=0)return "invList"+source;
        const grid=p.gridItems.findIndex(i=>i.uid===uid);if(grid>=0)return "invItem"+grid;
        throw Error("当前页没有测试物品："+uid);
    },uid);
}
async function drag(page,from,to){
    const a=await point(page,from),b=await point(page,to);
    let cdp;
    if(page.touchMode){
        cdp=await page.context().newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{...a,id:1}]});
        for(let i=1;i<=16;i++)await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{
            x:a.x+(b.x-a.x)*i/16,y:a.y+(b.y-a.y)*i/16,id:1}]});
    }else{
        await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:16});
    }
    const held=await page.evaluate(()=>{const h=window.__skillBattlePreview.panel.held;return {valid:h?.valid,error:h?.error};});
    assert.equal(held.valid,true,held.error);
    if(cdp){await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});await cdp.detach();}
    else await page.mouse.up();
    await page.waitForTimeout(220);
}
async function equipmentFixture(page,width){
    // 独立界面夹具只验证拖拽，结束后恢复原档，不作为正式赠送或掉落。
    await page.evaluate(()=>{
        const v=window.__skillBattlePreview,m=v.trial,c=structuredClone(m.archive.config);
        window.__equipmentFixture={save:m.archive,currentConfig:m.currentConfig,raw:localStorage.getItem("nowchange.expedition.v1")};
        c.fixtures.find(f=>f.templateId===101).durability=1;
        c.fixtures.push({id:90,templateId:1501,count:1,node:0,durability:24},{id:91,templateId:1701,count:1,node:0,durability:16});
        m.resetConfirmed();m.currentConfig=c;m.prepare(c,733);
        for(const slot of ["armor","accessory"])
            m.inventoryCommand({type:"equipEquipment",slot,uid:null,oldTo:{space:"warehouse"}});
        v.panel.refresh();
    });
    const gear=await page.evaluate(()=>[1501,1701].map(id=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.templateId===id).uid));
    await drag(page,await itemNode(page,gear[0]),"invArmor");
    await drag(page,await itemNode(page,gear[1]),"invAccessory");
    assert.deepEqual(await page.evaluate(()=>["armor","accessory"].map(k=>window.__skillBattlePreview.trial.inventory.items.some(i=>i.location.space===k))),[true,true]);
    await page.waitForFunction(()=>["invArmor","invAccessory"].every(key=>
        window.__skillBattlePreview.panel.nodes[key].getChildAt(2).texture?.bitmap));
    const before=await page.evaluate(()=>JSON.stringify(window.__skillBattlePreview.trial.archive));
    await click(page,"btn_repair_all");
    assert.equal(await page.evaluate(()=>JSON.stringify(window.__skillBattlePreview.trial.archive)),before);
    assert((await page.evaluate(()=>window.__skillBattlePreview.panel.notice)).includes("愿力不足"));
    const tool=await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.templateId===307).uid);
    await drag(page,await itemNode(page,tool),"invWeapon");
    assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.location.space==="weapon").durability),13);
    const sold=await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.find(i=>i.templateId===311).uid);
    await click(page,await itemNode(page,sold));await click(page,"btn_sell");
    assert(await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.wish)>0);
    await click(page,"btn_repair_all");
    assert(await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.items.filter(i=>["weapon","armor","accessory"].includes(i.location.space)).every(i=>i.durability===i.equipment.maxDurability)));
    await click(page,"invArmor");
    await page.screenshot({path:path.join(output,`equipment-three-slots-${width}.png`)});
    await click(page,"btn_close");
    await page.evaluate(()=>{
        const v=window.__skillBattlePreview,m=v.trial,f=window.__equipmentFixture;
        m.currentConfig=f.currentConfig;m.data.save=f.save;m.data.savedText=f.raw;localStorage.setItem("nowchange.expedition.v1",f.raw);m.restoreManager();
        v.panel.refresh();delete window.__equipmentFixture;
    });
}
async function main(){
    await fs.mkdir(output,{recursive:true});
    const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath()});
    try{
        for(const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:960,height:540}]){
            const touch=viewport.width===960;
            const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch}),page=await context.newPage(),errors=[];
            page.touchMode=touch;
            page.on("pageerror",e=>errors.push(e.message));
            page.on("response",r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
            page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
            await page.goto(url);
            await confirmStartup(page);
            await page.waitForTimeout(200);
            await click(page,"btn_warehouse");
            await page.waitForFunction(()=>window.__skillBattlePreview?.panel?.opened&&window.__skillBattlePreview.panel.nodes?.invArmor);
            assert.deepEqual(await page.evaluate(()=>{
                const p=window.__skillBattlePreview.panel;
                return ["invWeapon","invArmor","invAccessory","invContainer","btn_repair_all"].map(k=>!!p.nodes[k]?.visible);
            }),[true,true,true,true,true]);
            await click(page,"invWeapon");
            await page.waitForFunction(()=>window.__skillBattlePreview.ui.topView.path.endsWith("/ItemDetailView.lh"));
            const detail=await page.evaluate(()=>window.__skillBattlePreview.ui.topView.getElement("txt_item_detail").text);
            assert(detail.includes("主属性"));assert(detail.includes("副属性"));
            await page.screenshot({path:path.join(output,`equipment-${viewport.width}.png`)});
            await click(page,"btn_close");
            await equipmentFixture(page,viewport.width);
            await click(page,"btn_close");
            await click(page,"btn_realm");
            await page.waitForFunction(()=>window.__skillBattlePreview.view?.isOpened&&window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.pageRole==="start");
            await page.screenshot({path:path.join(output,`preparation-${viewport.width}.png`)});
            await click(page,"invPrimary");
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.inventory.phase),"active",
                JSON.stringify(await page.evaluate(()=>{const v=window.__skillBattlePreview,p=v.panel,n=p.nodes.invPrimary;
                    return {notice:p.notice,error:v.trial.error,enabled:n?.mouseEnabled,visible:n?.visible,top:v.ui.topView?.path};})));
            await page.waitForFunction(()=>window.__skillBattlePreview.view?.isOpened&&window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.pageRole==="map");
            await click(page,"expBuild");
            await page.waitForFunction(()=>window.__skillBattlePreview.view?.isOpened&&window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.pageRole==="build").catch(async error=>{
                await page.screenshot({path:path.join(output,"navigation-failure.png")});
                console.error(await page.evaluate(()=>{const v=window.__skillBattlePreview;return {view:v.view?.path,role:v.panel?.pageRole,notice:v.panel?.notice,error:v.trial.error,top:v.ui.topView?.path};}),errors);
                throw error;
            });
            await click(page,"cancel");await click(page,"upgrade0");await click(page,"warehouse0");await click(page,"newRun");
            await page.screenshot({path:path.join(output,`skills-${viewport.width}.png`)});
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.flow.skills.length),5,
                JSON.stringify(await page.evaluate(()=>{const v=window.__skillBattlePreview;return {notice:v.panel.notice,error:v.trial.error,chosen:v.panel.chosen,skills:v.trial.flow.skills};})));
            await click(page,"hub");
            await page.waitForFunction(()=>window.__skillBattlePreview.view?.isOpened&&window.__skillBattlePreview.panel?.opened&&window.__skillBattlePreview.panel.pageRole==="map");
            await page.evaluate(()=>{
                const v=window.__skillBattlePreview,m=v.trial;
                m.mapCommand({type:"debugEnemyBlocking",enabled:false});
                const s=m.inventory,target=s.map.nodes.find(n=>n.kind==="normal"),q=[[s.node]],seen=new Set();
                let route;
                while(q.length){
                    const p=q.shift(),id=p[p.length-1];if(id===target.id){route=p;break;}seen.add(id);
                    for(const [a,b]of s.map.edges){const n=a===id?b:b===id?a:null;if(n&&!seen.has(n))q.push([...p,n]);}
                }
                for(const node of route.slice(1))m.mapCommand({type:"travel",node});
                m.mapCommand({type:"fight"});v.reopen();
            });
            await page.waitForFunction(()=>window.__skillBattlePreview.view?.path.endsWith("/SkillBattleBattleView.lh")&&window.__skillBattlePreview.panel?.opened);
            const display=await page.evaluate(()=>{
                const v=window.__skillBattlePreview,p=v.panel,s=v.trial.state;
                return {skills:s.combat.build.skills.length,round:p.labels.round.text,buttons:
                    ["skill1","skill2","skill3","skill4","upgrade0","qFall","qEnd"].map(k=>p.buttons[k].visible),
                    old:"qingming" in s};
            });
            assert.equal(display.skills,5);assert(display.round.includes("一次行动"));assert(display.buttons.every(Boolean));assert.equal(display.old,false);
            for(let i=0;i<3;i++){
                const needs=await page.evaluate(()=>{const p=window.__skillBattlePreview.trial.state.player;return p.hp<p.maxHp;});
                if(needs)break;
                await click(page,"skill3");await click(page,"confirm");
                await page.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
            }
            const beforePotion=await page.evaluate(()=>{const s=window.__skillBattlePreview.trial.state;return {actions:s.mainActions,round:s.round,potions:s.pouch.filter(Boolean).length,cds:s.combat.p.cds,statuses:s.combat.p.statuses};});
            await click(page,"pouch0");await click(page,"confirm");
            await page.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
            assert.deepEqual(await page.evaluate(()=>{const s=window.__skillBattlePreview.trial.state;return {actions:s.mainActions,round:s.round,potions:s.pouch.filter(Boolean).length,cds:s.combat.p.cds,statuses:s.combat.p.statuses};}),
                {...beforePotion,potions:beforePotion.potions-1});
            await click(page,"skill3");await click(page,"confirm");
            await page.waitForFunction(()=>!window.__skillBattlePreview.panel.busy);
            assert.equal(await page.evaluate(()=>window.__skillBattlePreview.trial.state.mainActions),beforePotion.actions+1);
            const canvas=await page.screenshot({path:path.join(output,`battle-${viewport.width}.png`)});
            assert((await sharp(canvas).stats()).channels.slice(0,3).some(channel=>channel.stdev>12),"战斗画布应有实际内容");
            assert((await page.evaluate(()=>window.__skillBattlePreview.panel.labels.durability.text)).includes("灼烧"));
            const saved=await page.evaluate(()=>JSON.stringify(window.__skillBattlePreview.trial.archive));
            await page.reload();await confirmStartup(page);await page.waitForTimeout(150);
            assert.equal(await page.evaluate(()=>JSON.stringify(window.__skillBattlePreview.trial.archive)),saved);
            assert.deepEqual(errors,[]);
            console.log(`浏览器 ${viewport.width}x${viewport.height}：三部位拖装/拖修/愿力修理（隔离夹具）、五技能装配、用药后出招、正式读档通过`);
            await context.close();
        }
    } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
