const assert=require("node:assert/strict");
const {load,config:c}=require("./config-fixture.cjs");
const {InventoryRules:I}=load("module/inventory/utils/InventoryRules.js");
const {ExpeditionRules:R}=load("module/expedition/utils/ExpeditionRules.js");
const {ExpeditionRunManager:Session}=load("module/expedition/manager/ExpeditionRunManager.js");
const {SkillBattleManager:BattleManager}=load("module/skillBattle/manager/SkillBattleManager.js");
let groups=0;
const test=(name,fn)=>{fn();groups++;console.log("通过 "+name);};
const start=(seed=17)=>R.start(c,seed,"inventory-map");
const enter=s=>R.apply(c,s,{type:"enter"},1000,17).state;
const move=(s,item,to)=>I.apply(c,s,{type:"move",move:{uid:item.uid,from:item.location,to}},1000).state;
test("网格碰撞、越界、归真匣限制与失败原子性",()=>{
    const s=start(),p=s.items.find(i=>I.template(c,i).kind==="hp"),before=structuredClone(s);
    assert.throws(()=>move(s,p,{space:"battle",x:1,y:0,rotated:false}),/相交/);
    assert.throws(()=>move(s,p,{space:"safe",x:2,y:0,rotated:false}),/越界|尺寸|网格/);
    const w=s.items.find(i=>i.location.space==="weapon");
    assert.throws(()=>I.apply(c,s,{type:"equipWeapon",uid:null,oldTo:{space:"safe",x:0,y:0,rotated:false}},1000));
    assert.deepEqual(s,before);
    const safe=move(s,p,{space:"safe",x:0,y:0,rotated:false});
    assert.equal(I.item(safe,p.uid).location.space,"safe");
});
test("仓库定点排列、旋转与换包内容完整性",()=>{
    const s=start(),weapon=s.items.find(i=>i.location.space==="weapon");
    const u=I.apply(c,s,{type:"equipWeapon",uid:null,oldTo:{space:"warehouse"}},1000).state;
    const a=I.apply(c,u,{type:"arrangeWarehouse",uid:weapon.uid,from:{space:"warehouse"},
        to:{page:0,x:3,y:3,rotated:true}},1000).state;
    assert.deepEqual(I.warehousePlacements(c,a).find(p=>p.uid===weapon.uid),
        {uid:weapon.uid,page:0,x:3,y:3,rotated:true});
    const plan=I.containerPlan(c,s,null);
    assert.equal(plan.contents.length,s.items.filter(i=>i.location.space==="bag").length);
    assert.throws(()=>I.apply(c,s,{...plan,contents:[]},1000));
    const removed=I.apply(c,s,plan,1000).state;
    assert.equal(removed.items.filter(i=>["bag","container"].includes(i.location.space)).length,0);
});
test("来源仓库为未揭示物品预留位置",()=>{
    const s=enter(start()),node=s.node;
    const t=c.templates.find(t=>t.kind==="material");
    const unknown={uid:"unknown",templateId:t.id,location:{space:"source",node},durability:null};
    s.map.sources.push({node,entries:[unknown],opened:true,revealed:0,progressMs:0});
    const slots=I.sourcePlacements(c,s,node);
    assert.ok(slots.some(p=>p.uid==="unknown"));
    const p=s.items.find(i=>I.template(c,i).kind==="hp");
    s.interactionSource=node;s.sourceLayouts=[{node,slots}];
    const reserved=slots[0],before=structuredClone(s);
    assert.throws(()=>move(s,p,{space:"source",node,x:reserved.x,y:reserved.y,rotated:false}),/相交/);
    assert.deepEqual(s,before);
});
test("承重限制、修补与体力药按实际实例消费",()=>{
    const s=enter(start()),tool=s.items.find(i=>I.template(c,i).kind==="repair");
    s.items.find(i=>i.location.space==="weapon").durability=1;
    const repaired=I.apply(c,s,{type:"use",uid:tool.uid,from:tool.location},1000).state;
    assert.equal(I.item(repaired,tool.uid).location.space,"consumed");
    assert.equal(repaired.items.find(i=>i.location.space==="weapon").durability,21);
    const prep=start(),stamina=prep.items.find(i=>I.template(c,i).kind==="stamina");
    const carrying=move(prep,stamina,{space:"bag",x:1,y:0,rotated:false}),active=enter(carrying);
    active.stamina=1;
    const used=I.apply(c,active,{type:"use",uid:stamina.uid,from:I.item(active,stamina.uid).location},1000).state;
    assert.ok(used.stamina>1);assert.equal(I.item(used,stamina.uid).location.space,"consumed");
    const heavy=structuredClone(active);heavy.items.push({...stamina,uid:"heavy",location:{space:"bag",x:2,y:0,rotated:false}});
    const limited=structuredClone(c);limited.weight.base=1;
    limited.templates.filter(t=>t.kind==="container").forEach(t=>t.weightLimit=1);
    assert.throws(()=>I.validate(limited,heavy),/负重/);
});
test("失败保护归真匣与撤离返还装备",()=>{
    const s=start(),p=s.items.find(i=>I.template(c,i).kind==="hp");
    const carrying=move(s,p,{space:"safe",x:0,y:0,rotated:false});
    const failed=enter(carrying),extracted=structuredClone(failed);
    I.settle(failed,"defeat");I.settle(extracted,"extract");
    assert.ok(failed.returned.includes(p.uid));
    assert.equal(failed.items.find(i=>I.template(c,i).kind==="weapon").location.space,"lost");
    assert.equal(extracted.items.find(i=>I.template(c,i).kind==="weapon").location.space,"warehouse");
});
test("搜索首次扣费、检查点与尾段保存、刷新暂停和逐件揭示",()=>{
    let now=1000,tick=0;
    const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
    const restore=()=>new Session(new BattleManager(),storage,()=>now,c,()=>tick);
    let session=restore();
    session.prepare(c,17);session.inventoryCommand({type:"enter"});
    session.mapCommand({type:"debugEnemyBlocking",enabled:false});
    const state=session.inventory,queue=[[state.node]],seen=new Set([state.node]);
    let route;
    for(const p of queue){
        if(state.map.nodes.find(n=>n.id===p.at(-1)).kind==="search"){route=p;break;}
        for(const [a,b]of state.map.edges){
            const next=a===p.at(-1)?b:b===p.at(-1)?a:null;
            if(next&&!seen.has(next)){seen.add(next);queue.push([...p,next]);}
        }
    }
    assert.ok(route);
    for(const node of route.slice(1))session.mapCommand({type:"travel",node});
    const before=session.inventory.stamina,unknown=R.source(session.inventory).entries[0].uid;
    session.openSource();
    assert.equal(session.inventory.stamina,before-c.rules.searchCost);
    assert.equal(session.inventory.items.some(i=>i.uid===unknown),false);
    tick+=R.searchCheckpointMs;now+=R.searchCheckpointMs;
    assert.equal(session.advanceSearch(),true);
    tick+=100;now+=100;session.pauseSearch();
    assert.equal(R.source(session.inventory).progressMs,R.searchCheckpointMs+100);
    const archive=session.archive;
    session=restore();
    assert.equal(session.searching,false);assert.deepEqual(session.archive,archive);
    const paid=session.inventory.stamina;
    session.startSearch();assert.equal(session.inventory.stamina,paid);
    tick+=1500;now+=1500;
    assert.equal(session.advanceSearch(),false);
    assert.equal(R.source(session.inventory).progressMs,R.searchCheckpointMs+100);
    session.startSearch();
    for(let i=0;i<24&&!R.source(session.inventory).revealed;i++){
        tick+=R.searchCheckpointMs;now+=R.searchCheckpointMs;session.advanceSearch();
    }
    assert.equal(R.source(session.inventory).revealed,1);
    assert.equal(session.inventory.items.filter(i=>i.uid===unknown).length,1);
    assert.equal(session.inventory.stamina,paid);
    session.pauseSearch();assert.deepEqual(restore().archive,session.archive);
});
test("128 个种子的地图预算、连通性、确定性和首领出口",()=>{
    for(let seed=1;seed<=128;seed++){
        const a=R.apply(c,start(seed),{type:"enter"},1000,seed).state;
        const b=R.apply(c,start(seed),{type:"enter"},1000,seed).state;
        assert.deepEqual(a.map,b.map);
        const {nodes,edges}=a.map;
        assert.ok(nodes.length>=45&&nodes.length<=65);
        assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
        const count=kind=>nodes.filter(n=>n.kind===kind).length;
        for(const [kind,min,max]of [["normal",13,16],["elite",4,7],["search",8,12],["borrow",3,5],["insight",2,4]])
            assert.ok(count(kind)>=min&&count(kind)<=max,kind);
        const seen=new Set([1]),queue=[1];
        for(const id of queue)for(const [x,y]of edges){
            assert.ok(nodes.some(n=>n.id===x)&&nodes.some(n=>n.id===y));
            const next=id===x?y:id===y?x:null;
            if(next&&!seen.has(next)){seen.add(next);queue.push(next);}
        }
        assert.equal(seen.size,nodes.length);
        const boss=nodes.find(n=>n.kind==="boss"),last=nodes.filter(n=>n.kind==="extract").sort((a,b)=>b.x-a.x)[0];
        assert.ok(edges.some(([x,y])=>x===boss.id&&y===last.id||y===boss.id&&x===last.id));
    }
});
console.log(`储物与地图：${groups} 组通过`);
