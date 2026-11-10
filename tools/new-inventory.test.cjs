const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,".."),build=path.resolve(process.argv[2]||path.join(root,"bin/skill-battle-tests"));
global.Laya={Resource:class{},Byte:class{
    constructor(buffer){this.bytes=Buffer.from(buffer);this.pos=0;}
    readUTFBytes(n){const s=this.bytes.toString("utf8",this.pos,this.pos+n);this.pos+=n;return s;}
}};
const load=p=>require(path.join(build,"script",p));
const ByteBuf=load("config/bright/serialization/ByteBuf.js").default;
const {Tables}=load("config/schema.js");
const {NewInventoryConfigUtils:Config}=load("module/skillBattle/newRules/NewInventoryConfigUtils.js");
const {NewInventoryRules:R}=load("module/skillBattle/newRules/NewInventoryRules.js");
const {NewInventorySession:Session}=load("module/skillBattle/newRules/NewInventorySession.js");
const {NewBuildConfigUtils:B}=load("module/skillBattle/newRules/NewBuildConfigUtils.js");
const {SkillBattleManager:Manager}=load("module/skillBattle/manager/SkillBattleManager.js");
const bytes=fs.readFileSync(path.join(root,"assets/config/configbin.bin"));
let offset=4;const blocks={};
for(let n=0;n<bytes.readInt32LE(0);n++){
    const len=bytes.readInt32LE(offset);offset+=4;
    const name=bytes.toString("utf8",offset,offset+len);offset+=len;
    const size=bytes.readInt32LE(offset);offset+=4;
    const data=bytes.subarray(offset,offset+size);offset+=size;
    blocks[name]=data;
}
const tables=new Tables(name=>new ByteBuf(new Uint8Array(blocks[name]))),liveConfig=Config.read(tables);
// Geometry regressions retain explicit 6x5/8x6 fixtures, independent of the adjustable item catalogue.
const config=structuredClone(liveConfig);
Object.assign(config.templates.find(t=>t.id===10),{bagWidth:6,bagHeight:5});
Object.assign(config.templates.find(t=>t.id===11),{bagWidth:8,bagHeight:6});
const profile=B.profile(config.build);
let passed=0;
function test(name,fn){try{fn();console.log(`PASS inventory ${name}`);passed++;}catch(e){console.error(`FAIL inventory ${name}`);throw e;}}
function fixture(c=config){
    let now=1000;
    const data=new Map([["other","keep"],["nowchange.stage2-build.v1","stage2-preserved"]]);
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
    const manager=new Manager(),s=new Session(manager,storage,()=>now,c);
    s.prepare(c,B.profile(c.build),13);
    return{s,data,storage,manager,c,setNow:v=>now=v,now:()=>now};
}
const items=(f,id,space="warehouse")=>f.s.inventory.items.filter(i=>i.templateId===id&&i.location.space===space);
const at=(space,x=0,y=0,rotated=false)=>({space,x,y,rotated});
const cmd=(f,c)=>f.s.inventoryCommand(c);
function move(f,item,to){return cmd(f,{type:"move",move:{uid:item.uid,from:item.location,to}});}
function equip(f,id=10){const i=items(f,id)[0];cmd(f,{type:"equipContainer",uid:i.uid,from:i.location,contents:[],
    ...(f.s.inventory.items.some(i=>i.location.space==="container")?{oldTo:{space:"warehouse"}}:{})});}
function enter(f){cmd(f,{type:"enter"});const p=f.s.flow.pending;f.s.dispatch({type:"choose",source:p.source,id:p.candidates[0]});}
function battle(f){f.s.dispatch({type:"battle"});}
function act(f,a){const p=f.s.preview(a);assert.equal(p.ok,true,p.reason);const r=f.s.confirm(a,p.preview.token);assert.equal(r.ok,true,r.reason);return r;}
function unchanged(f,action,re){const before=f.s.archive,text=f.data.get(Session.key);
    assert.throws(action,re);assert.deepEqual(f.s.archive,before);assert.equal(f.data.get(Session.key),text);}
test("live catalogue binds twelve named icons, six qualities and increasing capacity gaps",()=>{
    assert.equal(Object.keys(blocks).length,35);
    const containers=liveConfig.templates.filter(t=>t.kind==="container");
    assert.equal(containers.length,12);
    assert.equal(new Set(containers.map(t=>t.name)).size,12);
    assert.equal(new Set(containers.map(t=>t.icon)).size,12);
    const sizes=[[4,3],[4,4],[7,3],[7,4],[6,6],[8,6]],areas=sizes.map(([w,h])=>w*h);
    const gaps=areas.slice(1).map((area,i)=>area-areas[i]);
    assert.deepEqual(gaps,[4,5,7,8,12]);
    for(const t of containers){
        assert.doesNotMatch(t.name,/纳虚/);
        assert.deepEqual([t.width,t.height],[2,2]);
        assert.deepEqual([t.bagWidth,t.bagHeight],sizes[t.quality-1]);
        assert.ok(t.icon.endsWith(`-q${t.quality}.png`));
        assert.ok(fs.existsSync(path.join(root,"assets",t.icon)),t.icon);
        const meta=JSON.parse(fs.readFileSync(path.join(root,"assets",t.icon+".meta"),"utf8"));
        assert.deepEqual(meta.importer,{textureType:2,sRGB:true,premultiplyAlpha:true});
        assert.ok(liveConfig.fixtures.some(f=>f.templateId===t.id&&f.node===0));
    }
    for(let quality=1;quality<=6;quality++)assert.equal(containers.filter(t=>t.quality===quality).length,2);
    const f=fixture(liveConfig);
    for(const t of containers){
        const item=items(f,t.id)[0];cmd(f,R.containerPlan(liveConfig,f.s.inventory,item.uid));
        assert.deepEqual(R.size(liveConfig,f.s.inventory,"bag"),sizes[t.quality-1]);
        assert.deepEqual(new Session(new Manager(),f.storage,f.now,liveConfig).inventory,f.s.inventory);
    }
    const raw=f.data.get(Session.key);
    const incompatible=structuredClone(liveConfig);incompatible.templates.find(t=>t.id===10).bagHeight=4;
    assert.equal(new Session(new Manager(),f.storage,f.now,incompatible).inventory,null);
    assert.equal(f.data.get(Session.key),raw,"A changed catalogue must preserve the original save");
});
test("catalogue rejects invalid quality and non-project image paths",()=>{
    for(const quality of [0,7,-1,2.5]){
        const c=structuredClone(liveConfig);c.templates.find(t=>t.id===10).quality=quality;
        assert.throws(()=>R.validateConfig(c,B.profile(c.build)),/配置无效/);
    }
    for(const icon of ["ui/image/naxu/../other.png","https://example.com/a.png","ui/image/naxu/naxu-box-q7.png"]){
        const c=structuredClone(liveConfig);c.templates.find(t=>t.id===10).icon=icon;
        assert.throws(()=>R.validateConfig(c,B.profile(c.build)),/配置无效/);
    }
});
test("geometry fixtures have 35 tables, 6x5/8x6 grids, fixed shapes and conserved instances",()=>{
    assert.equal(Object.keys(blocks).length,35);const f=fixture();equip(f);
    assert.deepEqual(R.size(config,f.s.inventory,"bag"),[6,5]);equip(f,11);
    assert.deepEqual(R.size(config,f.s.inventory,"bag"),[8,6]);
    assert.equal(f.s.inventory.items.length,config.fixtures.reduce((n,r)=>n+r.count,0));
    assert.equal(new Set(f.s.inventory.items.map(i=>i.uid)).size,f.s.inventory.items.length);
    for(const t of config.templates.filter(t=>t.kind==="weapon"))assert.deepEqual([t.width,t.height],[2,3]);
    for(const t of config.templates.filter(t=>t.kind==="container"))assert.deepEqual([t.width,t.height],[2,2]);
});
test("all weapons occupy six cells, containers four; rotation and full-footprint collision survive restore",()=>{
    const f=fixture();equip(f);
    const sword=items(f,9)[0];move(f,sword,at("bag",4,0));
    unchanged(f,()=>move(f,items(f,1)[0],at("bag",5,2)),/相交/);
    move(f,items(f,9,"bag")[0],at("bag",3,3,true));
    unchanged(f,()=>move(f,items(f,1)[0],at("bag",5,4)),/相交/);
    unchanged(f,()=>move(f,items(f,9,"bag")[0],at("bag",4,3,true)),/尺寸/);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,config).inventory,f.s.inventory);
    for(const [id,w,h]of[[9,1,3],[10,1,2],[11,3,2]]){
        const c=JSON.parse(JSON.stringify(config)),t=c.templates.find(t=>t.id===id);
        t.width=w;t.height=h;
        assert.throws(()=>R.validateConfig(c,B.profile(c.build)),/武器实体须/);
    }
    const old=f.s.archive;old.config.templates.find(t=>t.kind==="weapon").width=1;
    const raw=JSON.stringify(old);f.data.set(Session.key,raw);
    const incompatible=new Session(new Manager(),f.storage,f.now,config);
    assert.equal(incompatible.inventory,null);assert.match(incompatible.error,/原档已保留/);
    assert.equal(f.data.get(Session.key),raw);assert.equal(f.data.get("other"),"keep");
});
test("preparation does not start countdown; no container required",()=>{
    const f=fixture();f.setNow(99999999);assert.equal(f.s.expire(),false);enter(f);
    assert.equal(f.s.remainingMs,1200000);battle(f);assert.equal(f.s.state.weapon,null);
    assert.deepEqual(f.s.state.pouch,[null,null,null,null,null]);
});
test("rotation, category restriction, collision and invalid boundaries do not mutate",()=>{
    const f=fixture(),book=items(f,4)[0];unchanged(f,()=>move(f,book,at("safe")),/尺寸/);
    move(f,book,at("safe",0,0,true));
    unchanged(f,()=>move(f,items(f,8)[0],at("safe",1)),/相交/);
    unchanged(f,()=>move(f,items(f,9)[0],at("safe")),/禁止/);
    unchanged(f,()=>move(f,items(f,7)[0],at("safe")),/尺寸/);
    unchanged(f,()=>move(f,items(f,8)[0],at("battle")),/只收/);
    unchanged(f,()=>move(f,items(f,1)[0],at("battle",5)),/边界/);
});
test("preview and cancel preserve source and every UID",()=>{
    const f=fixture(),i=items(f,1)[0],before=f.s.archive;
    f.s.previewMove({type:"move",move:{uid:i.uid,from:i.location,to:at("battle")}});
    assert.deepEqual(f.s.archive,before);move(f,i,at("battle"));
    assert.equal(f.s.inventory.items.filter(j=>j.uid===i.uid).length,1);
    unchanged(f,()=>move(f,i,at("safe")),/来源/);
});
function warehouseFixture(){
    const c=structuredClone(config);
    c.fixtures=[{id:950,templateId:10,count:1,node:0,durability:0},
        {id:951,templateId:11,count:1,node:0,durability:0},
        {id:952,templateId:9,count:2,node:0,durability:30},
        {id:953,templateId:6,count:1,node:0,durability:0},
        {id:954,templateId:1,count:2,node:0,durability:0}];
    return fixture(c);
}
const arrange=(item,x,y,rotated=false,page=0)=>({type:"arrangeWarehouse",uid:item.uid,from:item.location,to:{page,x,y,rotated}});
test("warehouse same-space drag keeps a 2x2 container in the lower rows and preserves every other position on reload",()=>{
    const f=warehouseFixture(),bag=items(f,10)[0],before=f.s.archive,slots=R.warehousePlacements(f.c,f.s.inventory);
    assert.equal(before.state.warehouseLayout,undefined,"Existing saves do not need migration or an eager write");
    const plan=arrange(bag,1,5),preview=f.s.previewMove(plan);
    assert.deepEqual(f.s.archive,before,"Dragging/preview does not write");
    cmd(f,plan);
    assert.deepEqual(f.s.inventory,preview.state);
    assert.deepEqual(f.s.inventory.warehouseLayout.find(p=>p.uid===bag.uid),{uid:bag.uid,page:0,x:1,y:5,rotated:false});
    assert.deepEqual(f.s.inventory.warehouseLayout.filter(p=>p.uid!==bag.uid),slots.filter(p=>p.uid!==bag.uid));
    assert.deepEqual(f.s.inventory.items,before.state.items,"Arrangement changes neither ownership nor instances");
    assert.equal(f.s.inventory.revision,before.state.revision+1);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("warehouse arrangement excludes its own old footprint but rejects collisions, edges and invalid rotations",()=>{
    const f=warehouseFixture(),bag=items(f,10)[0],slots=R.warehousePlacements(f.c,f.s.inventory);
    const other=slots.find(p=>p.uid!==bag.uid);
    unchanged(f,()=>cmd(f,arrange(bag,other.x,other.y)),/相交/);
    for(const [x,y,page]of [[-1,0,0],[7,0,0],[0,6,0],[0,0,-1],[0,0,1],[0.5,0,0]])
        unchanged(f,()=>cmd(f,arrange(bag,x,y,false,page)),/仓库/);
    const badRotation=arrange(bag,1,5);badRotation.to.rotated="yes";
    unchanged(f,()=>cmd(f,badRotation),/旋转/);
    const self=fixture({...f.c,fixtures:f.c.fixtures.slice(0,1)}),own=items(self,10)[0];
    cmd(self,arrange(own,0,1));
    assert.equal(self.s.inventory.warehouseLayout.find(p=>p.uid===own.uid).y,1);
});
test("warehouse image rotation, first-fit arrivals and departing items preserve the committed layout",()=>{
    const f=warehouseFixture(),herb=items(f,6)[0];
    cmd(f,arrange(herb,4,6,true));
    const original=f.s.inventory.warehouseLayout.find(p=>p.uid===herb.uid);
    equip(f);
    const potion=items(f,1)[0];move(f,potion,at("battle"));
    assert.ok(!f.s.inventory.warehouseLayout.some(p=>p.uid===potion.uid));
    move(f,items(f,1,"battle")[0],{space:"warehouse"});
    assert.deepEqual(f.s.inventory.warehouseLayout.find(p=>p.uid===herb.uid),original);
    assert.equal(f.s.inventory.warehouseLayout.filter(p=>p.uid===potion.uid).length,1);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("warehouse equipment replacements return the old body to the incoming body's slot",()=>{
    const f=warehouseFixture(),bag=items(f,11)[0];
    cmd(f,arrange(bag,1,5));equip(f);
    const slot=f.s.inventory.warehouseLayout.find(p=>p.uid===bag.uid),old=items(f,10,"container")[0];
    cmd(f,R.containerPlan(f.c,f.s.inventory,bag.uid));
    assert.deepEqual(f.s.inventory.warehouseLayout.find(p=>p.uid===old.uid),{...slot,uid:old.uid});
    const sword=items(f,9)[0];cmd(f,R.weaponPlan(f.c,f.s.inventory,sword.uid));
    const next=items(f,9)[0],nextSlot=f.s.inventory.warehouseLayout.find(p=>p.uid===next.uid);
    cmd(f,R.weaponPlan(f.c,f.s.inventory,next.uid));
    assert.deepEqual(f.s.inventory.warehouseLayout.find(p=>p.uid===sword.uid),{...nextSlot,uid:sword.uid});
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("warehouse arrangement is atomic on quota failure, stale page and concurrent save, and cannot bypass active access",()=>{
    const f=warehouseFixture(),bag=items(f,10)[0],plan=arrange(bag,1,5),token=f.s.token;
    const write=f.storage.setItem;f.storage.setItem=()=>{throw Error("warehouse quota");};
    unchanged(f,()=>cmd(f,plan),/warehouse quota/);f.storage.setItem=write;cmd(f,plan);
    unchanged(f,()=>f.s.inventoryCommand(arrange(bag,4,5),token),/过期/);
    const current=f.data.get(Session.key);f.data.set(Session.key,current+" ");
    unchanged(f,()=>cmd(f,arrange(bag,4,5)),/其他页面/);f.data.set(Session.key,current);
    enter(f);unchanged(f,()=>cmd(f,arrange(bag,4,5)),/局内/);
});
test("warehouse legacy saves stay byte-identical until rearrangement and layout tampering is rejected",()=>{
    const f=warehouseFixture(),raw=f.data.get(Session.key);
    const restored=new Session(new Manager(),f.storage,f.now,f.c);
    assert.equal(restored.error,"");assert.equal(f.data.get(Session.key),raw);
    assert.equal(restored.inventory.warehouseLayout,undefined);
    cmd(f,arrange(items(f,10)[0],1,5));
    const tampered=f.s.archive;tampered.state.warehouseLayout[0].x=4;
    const text=JSON.stringify(tampered);f.data.set(Session.key,text);
    const rejected=new Session(new Manager(),f.storage,f.now,f.c);
    assert.equal(rejected.inventory,null);assert.match(rejected.error,/原档已保留/);
    assert.equal(f.data.get(Session.key),text);assert.equal(f.data.get("other"),"keep");
});
test("warehouse pagination keeps all 57 actual items and permits placement on an existing second page",()=>{
    const c=structuredClone(config);c.fixtures=[
        {id:960,templateId:8,count:30,node:0,durability:0},{id:961,templateId:8,count:27,node:0,durability:0}];
    const f=fixture(c),all=items(f,8),slots=R.warehousePlacements(c,f.s.inventory);
    assert.equal(slots.filter(p=>p.page===0).length,56);assert.equal(slots.filter(p=>p.page===1).length,1);
    cmd(f,arrange(all[0],7,6,false,1));
    assert.equal(f.s.inventory.warehouseLayout.length,57);
    assert.deepEqual(f.s.inventory.warehouseLayout.find(p=>p.uid===all[0].uid),
        {uid:all[0].uid,page:1,x:7,y:6,rotated:false});
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,c).inventory,f.s.inventory);
});
test("warehouse layout survives extraction and timeout without losing arrivals or moving retained items",()=>{
    for(const result of ["extract","timeout"]){
        const f=warehouseFixture(),bag=items(f,10)[0];cmd(f,arrange(bag,1,5));equip(f,11);
        move(f,items(f,1)[0],at("safe"));
        const retained=f.s.inventory.warehouseLayout;
        enter(f);
        if(result==="extract")cmd(f,{type:"extract"});
        else{f.setNow(f.s.inventory.deadlineAt);f.s.expire();}
        assert.equal(f.s.inventory.result,result);
        for(const slot of retained)assert.deepEqual(f.s.inventory.warehouseLayout.find(p=>p.uid===slot.uid),slot);
        assert.equal(f.s.inventory.warehouseLayout.length,f.s.inventory.items.filter(i=>i.location.space==="warehouse").length);
        assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
    }
});
test("unequipped container occupies four bag cells without providing capacity; invalid swaps remain atomic",()=>{
    const f=fixture();equip(f,11);
    const m=items(f,7)[0];move(f,m,at("bag",6,4));
    const small=items(f,10)[0],inside=items(f,7,"bag")[0];
    unchanged(f,()=>cmd(f,{type:"equipContainer",uid:small.uid,from:small.location,oldTo:{space:"warehouse"},contents:[]}),/全部/);
    unchanged(f,()=>cmd(f,{type:"equipContainer",uid:small.uid,from:small.location,oldTo:{space:"warehouse"},
        contents:[{uid:inside.uid,from:inside.location,to:inside.location}]}),/尺寸/);
    cmd(f,{type:"equipContainer",uid:small.uid,from:small.location,oldTo:{space:"warehouse"},
        contents:[{uid:inside.uid,from:inside.location,to:at("bag",0,0)}]});
    const spare=items(f,11)[0];move(f,spare,at("bag",2));
    assert.equal(items(f,11,"bag")[0].uid,spare.uid);
    assert.deepEqual(R.size(config,f.s.inventory,"bag"),[6,5]);
    unchanged(f,()=>move(f,items(f,1)[0],at("bag",3,1)),/相交/);
    unchanged(f,()=>move(f,items(f,11,"bag")[0],at("safe")),/禁止/);
    unchanged(f,()=>move(f,items(f,11,"bag")[0],at("battle")),/只收/);
    unchanged(f,()=>move(f,items(f,10,"container")[0],at("bag",4)),/换装/);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("container in bag can equip without being counted twice as its own cargo",()=>{
    const f=fixture();equip(f,11);
    const spare=items(f,10)[0];move(f,spare,at("bag",0,0));
    move(f,items(f,7)[0],at("bag",6,4));
    const plan=R.containerPlan(f.c,f.s.inventory,spare.uid),before=f.s.archive;
    assert.equal(plan.from.space,"bag");assert.equal(plan.contents.length,1);
    assert.ok(plan.contents.every(m=>m.uid!==spare.uid));
    const bad=structuredClone(plan);bad.contents.push({uid:spare.uid,from:items(f,10,"bag")[0].location,to:at("bag")});
    unchanged(f,()=>cmd(f,bad),/全部/);
    f.s.previewMove(plan);assert.deepEqual(f.s.archive,before);cmd(f,plan);
    assert.equal(items(f,10,"container")[0].uid,spare.uid);
    assert.equal(items(f,10,"bag").length,0);assert.equal(items(f,11).length,1);
    assert.equal(items(f,7,"bag").length,1);assert.deepEqual(R.size(config,f.s.inventory,"bag"),[6,5]);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
const returnTo=(item,x,y,rotated=false,page=0)=>({type:"move",
    move:{uid:item.uid,from:item.location,to:{space:"warehouse"}},warehouseTo:{page,x,y,rotated}});
test("bag-to-warehouse exact drop and warehouse-to-bag use the same full footprint, preserving unrelated slots",()=>{
    const f=warehouseFixture();equip(f,11);
    const spare=items(f,10)[0];move(f,spare,at("bag",0,0));
    const slots=R.warehousePlacements(f.c,f.s.inventory),before=f.s.archive;
    const plan=returnTo(items(f,10,"bag")[0],1,5);
    const preview=f.s.previewMove(plan);assert.deepEqual(f.s.archive,before);
    cmd(f,plan);assert.deepEqual(f.s.inventory,preview.state);
    assert.deepEqual(f.s.inventory.warehouseLayout.find(s=>s.uid===spare.uid),{uid:spare.uid,page:0,x:1,y:5,rotated:false});
    assert.deepEqual(f.s.inventory.warehouseLayout.filter(s=>s.uid!==spare.uid),slots);
    move(f,items(f,10)[0],at("bag",4,3));
    assert.deepEqual(R.size(f.c,f.s.inventory,"bag"),[8,6]);
    assert.equal(f.s.inventory.warehouseLayout.some(s=>s.uid===spare.uid),false);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("exact warehouse returns reject collisions, bounds, pages and incompatible targets without automatic relocation",()=>{
    const f=warehouseFixture();equip(f,11);move(f,items(f,10)[0],at("bag"));
    const spare=items(f,10,"bag")[0],other=R.warehousePlacements(f.c,f.s.inventory)[0];
    unchanged(f,()=>cmd(f,returnTo(spare,other.x,other.y)),/相交/);
    for(const [x,y,page]of[[-1,5,0],[7,5,0],[1,6,0],[1,5,1],[1,5,-1]])
        unchanged(f,()=>cmd(f,returnTo(spare,x,y,false,page)),/仓库/);
    const bad=returnTo(spare,1,5);bad.move.to=at("bag",2);
    unchanged(f,()=>cmd(f,bad),/入库/);
    const sword=items(f,9)[0],badEquip={...R.weaponPlan(f.c,f.s.inventory,sword.uid),warehouseTo:{page:0,x:1,y:5,rotated:false}};
    unchanged(f,()=>cmd(f,badEquip),/卸下/);
});
test("exact return rotation persists and quota failure, stale token and concurrent writes preserve both grids",()=>{
    const f=warehouseFixture();equip(f,11);move(f,items(f,6)[0],at("bag"));
    const herb=items(f,6,"bag")[0],plan=returnTo(herb,4,6,true),token=f.s.token,write=f.storage.setItem;
    f.s.previewMove(plan);
    f.storage.setItem=()=>{throw Error("return quota");};
    unchanged(f,()=>cmd(f,plan),/return quota/);f.storage.setItem=write;
    const text=f.data.get(Session.key);f.data.set(Session.key,text+" ");
    unchanged(f,()=>cmd(f,plan),/其他页面/);f.data.set(Session.key,text);
    cmd(f,plan);
    unchanged(f,()=>f.s.inventoryCommand(returnTo(herb,5,6,true),token),/过期/);
    assert.deepEqual(f.s.inventory.warehouseLayout.find(s=>s.uid===herb.uid),{uid:herb.uid,page:0,x:4,y:6,rotated:true});
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("unloading equipment targets exact warehouse slots and packs container contents around the body atomically",()=>{
    const f=warehouseFixture();equip(f,11);
    move(f,items(f,10)[0],at("bag"));move(f,items(f,6)[0],at("bag",2));
    const weapon=items(f,9)[0];cmd(f,R.weaponPlan(f.c,f.s.inventory,weapon.uid));
    const before=f.s.archive,slot={page:0,x:5,y:4,rotated:true};
    cmd(f,{type:"equipWeapon",uid:null,oldTo:{space:"warehouse"},warehouseTo:slot});
    assert.deepEqual(f.s.inventory.warehouseLayout.find(s=>s.uid===weapon.uid),{uid:weapon.uid,...slot});
    assert.equal(items(f,9).find(i=>i.uid===weapon.uid).durability,weapon.durability);
    const body=items(f,11,"container")[0],plan={...R.containerPlan(f.c,f.s.inventory,null),
        warehouseTo:{page:0,x:0,y:5,rotated:false}};
    const old=f.s.archive,write=f.storage.setItem;
    f.storage.setItem=()=>{throw Error("unload quota");};
    unchanged(f,()=>cmd(f,plan),/unload quota/);f.storage.setItem=write;cmd(f,plan);
    assert.equal(f.s.inventory.revision,old.state.revision+1);
    assert.ok(f.s.inventory.items.every(i=>!["bag","container"].includes(i.location.space)));
    assert.deepEqual(f.s.inventory.warehouseLayout.find(s=>s.uid===body.uid),{uid:body.uid,...plan.warehouseTo});
    assert.deepEqual(f.s.inventory.items.map(i=>i.uid),before.state.items.map(i=>i.uid));
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("spare container follows ground access, battle lock and carried-item settlement without nested storage",()=>{
    for(const result of ["extract","abandon"]){
        const f=fixture();equip(f,11);const spare=items(f,10)[0];move(f,spare,at("bag"));
        enter(f);
        unchanged(f,()=>cmd(f,returnTo(items(f,10,"bag")[0],0,5)),/局内/);
        unchanged(f,()=>move(f,items(f,10,"bag")[0],{space:"ground",node:0}),/揭示/);
        cmd(f,{type:"reveal"});move(f,items(f,10,"bag")[0],{space:"ground",node:0});
        move(f,items(f,10,"ground")[0],at("bag"));
        const plan=R.containerPlan(f.c,f.s.inventory,spare.uid);
        cmd(f,plan);assert.equal(items(f,10,"container")[0].uid,spare.uid);
        const spareLarge=items(f,11,"ground")[0];move(f,spareLarge,at("bag",2));
        cmd(f,{type:result});
        assert.equal(R.item(f.s.inventory,spare.uid).location.space,result==="extract"?"warehouse":"lost");
        assert.equal(R.item(f.s.inventory,spareLarge.uid).location.space,result==="extract"?"warehouse":"lost");
        assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
    }
    const f=fixture();equip(f,11);move(f,items(f,10)[0],at("bag"));enter(f);battle(f);
    unchanged(f,()=>move(f,items(f,10,"bag")[0],at("bag",2)),/锁定/);
});
test("automatic downsize repacks fragmented out-of-bounds contents without touching live state",()=>{
    const f=fixture();equip(f,11);
    move(f,items(f,7)[0],at("bag",6,4));move(f,items(f,9)[0],at("bag",2,2));
    move(f,items(f,6)[0],at("bag",4,0,true));
    const before=f.s.archive,small=items(f,10)[0],plan=R.containerPlan(config,f.s.inventory,small.uid);
    assert.deepEqual(R.containerPlan(config,f.s.inventory,small.uid),plan,"Deterministic layout");
    assert.equal(plan.contents.length,3);assert.ok(plan.contents.every(m=>m.to.space==="bag"));
    const preview=f.s.previewMove(plan);assert.deepEqual(f.s.archive,before,"Preview/cancel leaves original untouched");
    assert.deepEqual(R.size(config,preview.state,"bag"),[6,5]);cmd(f,plan);
    assert.deepEqual(f.s.inventory,preview.state);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,config).inventory,f.s.inventory);
    const upgrade=R.containerPlan(config,f.s.inventory,items(f,11)[0].uid);
    assert.ok(upgrade.contents.every(m=>R.same(m.from,m.to)),"Already legal layouts are preserved");
});
function fullBag(groundSmall=false){
    const c=structuredClone(config);
    c.fixtures=[{id:900,templateId:10,count:1,node:0,durability:0},
        {id:901,templateId:11,count:1,node:0,durability:0},
        {id:902,templateId:8,count:30,node:0,durability:0},{id:903,templateId:8,count:10,node:0,durability:0}];
    if(groundSmall)c.fixtures.push({id:904,templateId:10,count:1,node:1,durability:0});
    const f=fixture(c);equip(f,11);
    for(let n=0;n<40;n++)move(f,items(f,8)[0],at("bag",n%8,Math.floor(n/8)));
    return f;
}
test("40-cell downsize keeps 30 and returns 10 exact instances to warehouse in one revision",()=>{
    const f=fullBag(),before=f.s.archive,plan=R.containerPlan(f.c,f.s.inventory,items(f,10)[0].uid);
    assert.equal(plan.contents.filter(m=>m.to.space==="bag").length,30);
    assert.equal(plan.contents.filter(m=>m.to.space==="warehouse").length,10);
    assert.equal(new Set(plan.contents.map(m=>m.uid)).size,40);
    assert.ok(plan.contents.every(m=>R.same(m.from,R.item(before.state,m.uid).location)));
    f.s.previewMove(plan);assert.deepEqual(f.s.archive,before);cmd(f,plan);
    assert.equal(f.s.inventory.revision,before.state.revision+1);
    assert.equal(items(f,8,"bag").length,30);assert.equal(items(f,8).length,10);
    assert.deepEqual(f.s.inventory.items.map(i=>[i.uid,i.templateId,i.durability]),
        before.state.items.map(i=>[i.uid,i.templateId,i.durability]));
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("automatic packing uses full six-cell shapes, allowed rotation and all 30 cells",()=>{
    const c=structuredClone(config);c.fixtures.find(f=>f.templateId===9&&f.node===0).count=5;
    const f=fixture(c);equip(f,11);
    for(const [x,y,r]of[[0,0,false],[2,0,false],[4,0,false],[6,0,false],[0,3,true]])
        move(f,items(f,9)[0],at("bag",x,y,r));
    const plan=R.containerPlan(c,f.s.inventory,items(f,10)[0].uid);
    assert.equal(plan.contents.filter(m=>m.to.space==="bag").length,5);cmd(f,plan);
    const d=structuredClone(config);d.templates.find(t=>t.id===10).bagWidth=2;d.templates.find(t=>t.id===10).bagHeight=3;
    const g=fixture(d);equip(g,11);move(g,items(g,9)[0],at("bag",5,4,true));
    const rotated=R.containerPlan(d,g.s.inventory,items(g,10)[0].uid);
    assert.deepEqual(rotated.contents[0].to,at("bag"));cmd(g,rotated);
    const squareConfig=structuredClone(config);squareConfig.fixtures.find(f=>f.templateId===7&&f.node===0).count=7;
    const h=fixture(squareConfig);equip(h,11);
    for(const [x,y]of[[0,0],[2,0],[4,0],[6,0],[0,2],[2,2],[4,2]])move(h,items(h,7)[0],at("bag",x,y));
    const squares=R.containerPlan(squareConfig,h.s.inventory,items(h,10)[0].uid);
    assert.equal(squares.contents.filter(m=>m.to.space==="bag").length,6,"Area alone does not imply a shape fits");
    cmd(h,squares);assert.equal(items(h,7).length,1);
});
test("automatic unload routes every content outside; no nested or orphaned bag",()=>{
    const f=fullBag(),plan=R.containerPlan(f.c,f.s.inventory,null);
    assert.ok(plan.contents.every(m=>R.same(m.to,{space:"warehouse"})));cmd(f,plan);
    assert.equal(f.s.inventory.items.some(i=>["bag","container"].includes(i.location.space)),false);
    assert.equal(items(f,8).length,40);
});
test("active downsize returns overflow only to current revealed ground, never remote warehouse",()=>{
    const f=fullBag(true);enter(f);const next=items(f,10,"ground")[0];
    assert.throws(()=>R.containerPlan(f.c,f.s.inventory,next.uid),/揭示/);cmd(f,{type:"reveal"});
    const plan=R.containerPlan(f.c,f.s.inventory,next.uid);
    assert.equal(plan.contents.filter(m=>m.to.space==="ground"&&m.to.node===0).length,10);
    assert.equal(plan.contents.filter(m=>m.to.space==="warehouse").length,0);cmd(f,plan);
    assert.equal(items(f,8,"ground").length,10);assert.equal(items(f,8).length,0);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("automatic swap preserves source access, battle lock and current revealed ground boundary",()=>{
    const f=fullBag();enter(f);
    assert.throws(()=>R.containerPlan(f.c,f.s.inventory,items(f,10)[0].uid),/仓库/);
    assert.throws(()=>R.containerPlan(f.c,f.s.inventory,null),/揭示/);
    cmd(f,{type:"reveal"});
    const unload=R.containerPlan(f.c,f.s.inventory,null);
    assert.ok(unload.contents.every(m=>R.same(m.to,{space:"ground",node:0})));cmd(f,unload);
    const old=items(f,11,"ground")[0];cmd(f,R.containerPlan(f.c,f.s.inventory,old.uid));
    battle(f);assert.throws(()=>R.containerPlan(f.c,f.s.inventory,null),/锁定/);
    const c=structuredClone(config);c.build.encounters.forEach(e=>e.enemy.maxHp=100);
    const g=fixture(c);equip(g,11);move(g,items(g,7)[0],at("bag",6,4));enter(g);
    win(g);cmd(g,{type:"visit",node:1});cmd(g,{type:"reveal"});
    const incoming=items(g,11,"ground")[0];
    cmd(g,R.containerPlan(g.c,g.s.inventory,incoming.uid));
    assert.equal(items(g,7,"bag").length,1);
});
test("automatic exchange stays atomic on write failure, stale revision, concurrent page and expiry",()=>{
    const f=fullBag(),plan=R.containerPlan(f.c,f.s.inventory,items(f,10)[0].uid),token=f.s.token;
    f.s.previewMove(plan);const original=f.storage.setItem;f.storage.setItem=()=>{throw Error("swap quota");};
    unchanged(f,()=>f.s.inventoryCommand(plan,token),/swap quota/);f.storage.setItem=original;
    cmd(f,{type:"enter"});unchanged(f,()=>f.s.inventoryCommand(plan,token),/过期/);
    const g=fullBag(),other=new Session(new Manager(),g.storage,g.now,g.c);
    const pending=R.containerPlan(g.c,g.s.inventory,items(g,10)[0].uid);
    other.inventoryCommand({type:"enter"});
    unchanged(g,()=>cmd(g,pending),/其他页面/);
    const h=fullBag();enter(h);cmd(h,{type:"reveal"});
    const expired=R.containerPlan(h.c,h.s.inventory,null);h.setNow(h.s.inventory.deadlineAt);
    assert.throws(()=>cmd(h,expired),/已结算/);assert.equal(h.s.inventory.result,"timeout");
    assert.equal(items(h,8,"bag").length,0);assert.equal(items(h,8,"lost").length,40);
});
test("weapon swap requires old destination, preserves durability",()=>{
    const f=fixture(),a=items(f,9)[0],b=items(f,9)[1];
    cmd(f,{type:"equipWeapon",uid:a.uid,from:a.location});
    unchanged(f,()=>cmd(f,{type:"equipWeapon",uid:b.uid,from:b.location}),/去向/);
    cmd(f,{type:"equipWeapon",uid:b.uid,from:b.location,oldTo:{space:"warehouse"}});
    assert.equal(items(f,9,"weapon")[0].durability,7);assert.equal(items(f,9)[0].durability,30);
});
test("automatic weapon replacement swaps source position and orientation, preserving actual durability",()=>{
    const f=fixture();equip(f);
    const first=items(f,9)[0],second=items(f,9)[1];
    cmd(f,R.weaponPlan(config,f.s.inventory,first.uid));
    cmd(f,R.weaponPlan(config,f.s.inventory,second.uid));
    assert.deepEqual(R.item(f.s.inventory,first.uid).location,{space:"warehouse"});
    move(f,R.item(f.s.inventory,first.uid),at("bag",3,3,true));
    const plan=R.weaponPlan(config,f.s.inventory,first.uid),before=f.s.archive;
    f.s.previewMove(plan);assert.deepEqual(f.s.archive,before);
    const original=f.storage.setItem;f.storage.setItem=()=>{throw Error("weapon quota");};
    unchanged(f,()=>cmd(f,plan),/weapon quota/);f.storage.setItem=original;cmd(f,plan);
    assert.deepEqual(R.item(f.s.inventory,second.uid).location,at("bag",3,3,true));
    assert.equal(R.item(f.s.inventory,second.uid).durability,7);
    assert.equal(R.item(f.s.inventory,first.uid).durability,30);
    assert.equal(f.s.inventory.revision,before.state.revision+1);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,config).inventory,f.s.inventory);
});
test("repair consumes actual carried tool, +20 capped; no weapon no debit",()=>{
    const f=fixture(),tool=items(f,3)[0];move(f,tool,at("battle"));
    enter(f);const carried=items(f,3,"battle")[0];
    unchanged(f,()=>cmd(f,{type:"use",uid:carried.uid,from:carried.location}),/未装备/);
    const g=fixture(),w=items(g,9)[0];cmd(g,{type:"equipWeapon",uid:w.uid,from:w.location});
    for(let n=0;n<3;n++)move(g,items(g,3)[0],at("battle",n));enter(g);
    for(const expected of [50,60]){
        const t=items(g,3,"battle")[0];cmd(g,{type:"use",uid:t.uid,from:t.location});
        assert.equal(items(g,9,"weapon")[0].durability,expected);
    }
    const t=items(g,3,"battle")[0];unchanged(g,()=>cmd(g,{type:"use",uid:t.uid,from:t.location}),/已满/);
});
test("hidden ground never usable; reveal, discard, re-pick preserve UID",()=>{
    const f=fixture();const hidden=items(f,8,"ground")[0];enter(f);
    unchanged(f,()=>move(f,hidden,at("safe")),/揭示/);cmd(f,{type:"reveal"});move(f,hidden,at("safe"));
    const carried=items(f,8,"safe")[0];move(f,carried,{space:"ground",node:0});
    assert.equal(items(f,8,"ground").find(i=>i.uid===hidden.uid).uid,hidden.uid);
    move(f,items(f,8,"ground").find(i=>i.uid===hidden.uid),at("safe"));
    unchanged(f,()=>cmd(f,{type:"reveal"}),/重复/);
    unchanged(f,()=>cmd(f,{type:"visit",node:1}),/不可达/);
});
test("full pickup leaves original ground instance",()=>{
    const f=fixture();for(let n=0;n<2;n++)move(f,items(f,8)[0],at("safe",n));enter(f);cmd(f,{type:"reveal"});
    unchanged(f,()=>move(f,items(f,8,"ground")[0],at("safe")),/相交/);
});
test("battle uses only actual pouch; locks cross-space moves, use and equipment",()=>{
    const f=fixture();move(f,items(f,1)[0],at("safe"));move(f,items(f,2)[0],at("battle",2));enter(f);battle(f);
    assert.equal(f.s.state.pouch.filter(Boolean).length,1);
    assert.equal(f.s.state.pouch[2].itemUid,items(f,2,"battle")[0].uid);
    unchanged(f,()=>move(f,items(f,1,"safe")[0],at("battle")),/锁定/);
    unchanged(f,()=>cmd(f,{type:"use",uid:items(f,1,"safe")[0].uid,from:items(f,1,"safe")[0].location}),/锁定/);
    unchanged(f,()=>cmd(f,{type:"equipWeapon",uid:null}),/锁定/);
    assert.equal(f.s.preview({type:"potion",itemUid:items(f,1,"safe")[0].uid}).ok,false);
});
test("potion, slot and opportunity saved together; later failed action does not refund",()=>{
    const f=fixture();move(f,items(f,1)[0],at("battle"));move(f,items(f,1)[0],at("battle",1));enter(f);battle(f);
    act(f,{type:"basic"});const uid=items(f,1,"battle")[0].uid;act(f,{type:"potion",itemUid:uid});
    assert.equal(f.s.state.potionUsed,true);assert.equal(f.s.inventory.consumed.includes(uid),true);
    assert.equal(f.s.state.pouch[0],null);
    assert.equal(f.s.preview({type:"skill",skillId:999}).ok,false);
    assert.equal(f.s.preview({type:"potion",itemUid:items(f,1,"battle")[0].uid}).ok,false);
    assert.equal(new Session(new Manager(),f.storage,f.now,config).inventory.consumed.includes(uid),true);
    f.setNow(f.s.inventory.deadlineAt);f.s.expire();
    assert.equal(f.s.inventory.consumed.includes(uid),true);assert.equal(f.s.inventory.returned.includes(uid),false);
});
test("out of battle medicine comes from any three spaces without modifying battle history",()=>{
    const f=fixture();move(f,items(f,1)[0],at("safe"));enter(f);battle(f);
    for(let n=0;n<10&&f.s.flow.phase==="battle";n++)act(f,{type:"basic"});
    assert.equal(f.s.inventory.phase,"active");const r=f.s.record;
    const i=items(f,1,"safe")[0],hp=f.s.inventory.hp;cmd(f,{type:"use",uid:i.uid,from:i.location});
    assert.equal(f.s.inventory.hp,Math.min(hp+2000,6000));assert.deepEqual(f.s.record,r);
});
test("extract includes carried only, preserves warehouse and losses ledger, cannot repeat",()=>{
    const f=fixture();equip(f);move(f,items(f,4)[0],at("safe",0,0,true));move(f,items(f,1)[0],at("battle"));enter(f);
    cmd(f,{type:"extract"});assert.equal(f.s.inventory.returned.length,3);
    assert.equal(f.s.inventory.items.some(i=>i.location.space==="ground"),false);
    assert.equal(f.s.flow.build.schools.length,0);
    unchanged(f,()=>cmd(f,{type:"extract"}),/已结算/);
    const resumed=new Session(new Manager(),f.storage,f.now,config);assert.deepEqual(resumed.inventory,f.s.inventory);
});
test("failure keeps safe only; all equipment, battle and bag lost; uncarried warehouse unchanged",()=>{
    const f=fixture();equip(f);const w=items(f,9)[0];cmd(f,{type:"equipWeapon",uid:w.uid,from:w.location});
    move(f,items(f,1)[0],at("battle"));move(f,items(f,7)[0],at("bag"));move(f,items(f,8)[0],at("safe"));
    enter(f);cmd(f,{type:"abandon"});assert.equal(f.s.inventory.returned.length,1);
    assert.ok(f.s.inventory.lost.includes(w.uid));assert.equal(f.s.inventory.items.find(i=>i.uid===w.uid).location.space,"lost");
    assert.ok(items(f,9).length);assert.equal(f.data.get("other"),"keep");assert.equal(f.data.get("nowchange.stage2-build.v1"),"stage2-preserved");
});
test("write failure never publishes half movement, battle or settlement",()=>{
    const f=fixture(),before=f.s.archive;f.storage.setItem=()=>{throw Error("disk full");};
    unchanged(f,()=>move(f,items(f,1)[0],at("battle")),/disk full/);assert.deepEqual(f.s.archive,before);
    const g=fixture();move(g,items(g,1)[0],at("battle"));enter(g);battle(g);
    const beforeBattle=g.s.archive,managerState=g.manager.newState;
    g.storage.setItem=()=>{throw Error("disk full");};
    const p=g.s.preview({type:"basic"});assert.equal(g.s.confirm({type:"basic"},p.preview.token).ok,false);
    assert.deepEqual(g.s.archive,beforeBattle);assert.deepEqual(g.manager.newState,managerState);
    unchanged(g,()=>cmd(g,{type:"abandon"}),/disk full/);
});
test("old page, stale preview and storage re-entry cannot duplicate",()=>{
    const f=fixture(),other=new Session(new Manager(),f.storage,f.now,config),token=f.s.token;
    move(f,items(f,1)[0],at("battle"));
    assert.throws(()=>other.inventoryCommand({type:"move",move:{uid:items(f,2)[0].uid,from:{space:"warehouse"},to:at("safe")}}),/其他页面/);
    unchanged(f,()=>f.s.inventoryCommand({type:"move",move:{uid:items(f,2)[0].uid,from:{space:"warehouse"},to:at("safe")}},token),/过期/);
    const original=f.storage.setItem;let reentry;
    f.storage.setItem=(k,v)=>{try{cmd(f,{type:"enter"});}catch(e){reentry=e.message;}original(k,v);};
    move(f,items(f,2)[0],at("battle",1));assert.match(reentry,/正在提交/);
});
test("deadline at final write rejects movement and can retry timeout",()=>{
    const f=fixture();enter(f);const end=f.s.inventory.deadlineAt,original=f.storage.getItem;
    f.storage.getItem=k=>{f.setNow(end);return original(k);};
    const before=f.s.archive;assert.throws(()=>cmd(f,{type:"reveal"}),/截止/);assert.deepEqual(f.s.archive,before);
    f.storage.getItem=original;f.s.expire();assert.equal(f.s.inventory.result,"timeout");
});
test("tampered UID/coordinates/consumption/history/config retained and blocked",()=>{
    for(const mutate of [
        s=>s.state.items.push(s.state.items[0]),
        s=>s.state.items[0].location={space:"safe",x:9,y:0,rotated:false},
        s=>s.state.consumed.push("fake"),s=>s.state.hp=1,s=>s.commands.push({at:1,command:{type:"enter"}}),
    ]){
        const f=fixture(),s=f.s.archive;mutate(s);const bad=JSON.stringify(s);f.data.set(Session.key,bad);
        const resumed=new Session(new Manager(),f.storage,f.now,config);assert.ok(resumed.error);
        assert.equal(f.data.get(Session.key),bad);assert.equal(resumed.archive,null);
    }
});
const shortConfig=()=>{const c=structuredClone(config);c.build.encounters.forEach(e=>e.enemy.maxHp=100);return c;};
function win(f){battle(f);act(f,{type:"basic"});while(f.s.flow.pending){
    const p=f.s.flow.pending;f.s.dispatch({type:"choose",source:p.source,id:p.candidates[0]});
}}
test("current-node container exchange keeps exact contents and drops old body once",()=>{
    const f=fixture(shortConfig());equip(f);move(f,items(f,7)[0],at("bag",2,1));enter(f);win(f);
    cmd(f,{type:"visit",node:1});cmd(f,{type:"reveal"});
    const next=items(f,11,"ground")[0],old=items(f,10,"container")[0],cargo=items(f,7,"bag")[0];
    cmd(f,{type:"equipContainer",uid:next.uid,from:next.location,oldTo:{space:"ground",node:1},
        contents:[{uid:cargo.uid,from:cargo.location,to:at("bag",6,4)}]});
    assert.equal(R.size(f.c,f.s.inventory,"bag")[0],8);
    assert.deepEqual(f.s.inventory.items.find(i=>i.uid===old.uid).location,{space:"ground",node:1});
    assert.equal(f.s.inventory.items.find(i=>i.uid===cargo.uid).location.x,6);
    unchanged(f,()=>cmd(f,{type:"equipContainer",uid:next.uid,from:next.location,contents:[]}),/已经/);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,f.c).inventory,f.s.inventory);
});
test("container plan can distribute into safe, pouch and ground; removal cannot leave bag cargo",()=>{
    const f=fixture();equip(f);
    move(f,items(f,1)[0],at("bag"));move(f,items(f,8)[0],at("bag",1));move(f,items(f,7)[0],at("bag",2));
    enter(f);cmd(f,{type:"reveal"});const rows=f.s.inventory.items.filter(i=>i.location.space==="bag");
    const old=items(f,10,"container")[0];
    cmd(f,{type:"equipContainer",uid:null,oldTo:{space:"ground",node:0},contents:rows.map(i=>({
        uid:i.uid,from:i.location,to:i.templateId===1?at("battle"):i.templateId===8?at("safe"):{space:"ground",node:0},
    }))});
    assert.equal(f.s.inventory.items.some(i=>i.location.space==="bag"||i.location.space==="container"),false);
    assert.equal(f.s.inventory.items.find(i=>i.uid===old.uid).location.space,"ground");
    assert.equal(f.s.inventory.items.length,f.s.archive.config.fixtures.reduce((n,f)=>n+f.count,0));
});
test("container unknown source, duplicate content and nested destinations reject whole plan",()=>{
    const f=fixture();equip(f);move(f,items(f,1)[0],at("bag"));const next=items(f,11)[0],i=items(f,1,"bag")[0];
    const m={uid:i.uid,from:i.location,to:at("bag")};
    unchanged(f,()=>cmd(f,{type:"equipContainer",uid:next.uid,from:{space:"ground",node:0},oldTo:{space:"warehouse"},contents:[m]}),/来源/);
    unchanged(f,()=>cmd(f,{type:"equipContainer",uid:next.uid,from:next.location,oldTo:{space:"warehouse"},contents:[m,m]}),/全部/);
    unchanged(f,()=>cmd(f,{type:"equipContainer",uid:next.uid,from:next.location,oldTo:{space:"safe"},contents:[m]}),/旧纳虚/);
});
test("backtrack retrieves original dropped instance; future and other-node sources rejected",()=>{
    const f=fixture(shortConfig());move(f,items(f,8)[0],at("safe"));enter(f);cmd(f,{type:"reveal"});
    const item=items(f,8,"safe")[0];move(f,item,{space:"ground",node:0});win(f);cmd(f,{type:"visit",node:1});
    const ground=f.s.inventory.items.find(i=>i.uid===item.uid);
    unchanged(f,()=>move(f,ground,at("safe")),/当前/);
    cmd(f,{type:"visit",node:0});move(f,ground,at("safe"));
    assert.equal(items(f,8,"safe")[0].uid,item.uid);
    const future=f.s.inventory.items.find(i=>i.location.space==="ground"&&i.location.node===3);
    unchanged(f,()=>move(f,future,at("safe",1)),/当前/);
});
test("different actual weapons and medicine carry across encounters without free refill",()=>{
    const f=fixture(shortConfig());equip(f);
    const w=items(f,9)[1];cmd(f,{type:"equipWeapon",uid:w.uid,from:w.location});move(f,items(f,2)[0],at("battle",3));
    enter(f);win(f);cmd(f,{type:"visit",node:1});battle(f);
    assert.equal(f.s.state.weapon.durability,6);assert.equal(f.s.state.pouch.filter(Boolean).length,1);
    assert.equal(f.s.state.pouch[3].itemUid,items(f,2,"battle")[0].uid);
});
test("death settles safe book protection without leaving a warehouse duplicate",()=>{
    const c=structuredClone(config);c.build.encounters[0].enemy.intents=[{id:1,name:"致命夹具",damage:100000,block:0,charging:false}];
    const f=fixture(c);move(f,items(f,4)[0],at("safe",0,0,true));enter(f);battle(f);act(f,{type:"guard"});
    assert.equal(f.s.inventory.result,"defeat");assert.equal(f.s.inventory.returned.length,1);
    assert.equal(f.s.inventory.items.filter(i=>i.templateId===4&&i.location.space==="warehouse").length,1);
    assert.deepEqual(new Session(new Manager(),f.storage,f.now,c).inventory,f.s.inventory);
});
test("potion write failure leaves both original item and opportunity",()=>{
    const f=fixture();move(f,items(f,1)[0],at("battle"));enter(f);battle(f);act(f,{type:"basic"});
    const before=f.s.archive,p=f.s.preview({type:"potion",itemUid:items(f,1,"battle")[0].uid});
    f.storage.setItem=()=>{throw Error("quota");};
    assert.equal(f.s.confirm({type:"potion",itemUid:items(f,1,"battle")[0].uid},p.preview.token).ok,false);
    assert.deepEqual(f.s.archive,before);assert.equal(f.s.state.potionUsed,false);
});
test("failed timeout write retries once, restores same terminal ledger and isolates other keys",()=>{
    const f=fixture();move(f,items(f,8)[0],at("safe"));enter(f);f.setNow(f.s.inventory.deadlineAt);
    const before=f.s.archive,original=f.storage.setItem;f.storage.setItem=()=>{throw Error("quota");};
    assert.throws(()=>f.s.expire(),/quota/);assert.deepEqual(f.s.archive,before);f.storage.setItem=original;
    assert.equal(f.s.expire(),true);assert.equal(f.s.expire(),false);assert.equal(f.s.inventory.returned.length,1);
    const text=f.data.get(Session.key);new Session(new Manager(),f.storage,f.now,config).expire();
    assert.equal(f.data.get(Session.key),text);assert.equal(f.data.get("other"),"keep");
});
test("extraction crossing deadline at final write cannot publish a successful settlement",()=>{
    const f=fixture();move(f,items(f,8)[0],at("safe"));enter(f);
    const before=f.s.archive,end=f.s.inventory.deadlineAt,original=f.storage.getItem;
    f.storage.getItem=k=>{f.setNow(end);return original(k);};
    assert.throws(()=>cmd(f,{type:"extract"}),/截止/);assert.deepEqual(f.s.archive,before);
    f.storage.getItem=original;assert.equal(f.s.expire(),true);
    assert.equal(f.s.inventory.result,"timeout");assert.equal(f.s.inventory.returned.length,1);
});
console.log(`${passed} inventory transaction tests passed.`);
