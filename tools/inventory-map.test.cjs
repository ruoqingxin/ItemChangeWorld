const assert=require("node:assert/strict");
const {load,config:c}=require("./config-fixture.cjs");
const {InventoryRules:I}=load("module/inventory/utils/InventoryRules.js");
const {ExpeditionRules:R}=load("module/expedition/utils/ExpeditionRules.js");
const {ExpeditionRunManager:Session}=load("module/expedition/manager/ExpeditionRunManager.js");
const {SkillBattleManager:BattleManager}=load("module/skillBattle/manager/SkillBattleManager.js");
const {InventoryTransferUtils:Transfer}=load("module/inventory/utils/InventoryTransferUtils.js");
let groups=0;
const test=(name,fn)=>{fn();groups++;console.log("通过 "+name);};
const start=(seed=17)=>R.start(c,seed,"inventory-map");
const enter=s=>R.apply(c,s,{type:"enter"},1000,17).state;
const move=(s,item,to)=>I.apply(c,s,{type:"move",move:{uid:item.uid,from:item.location,to}},1000).state;
test("当前页整理保留其他页、携带物品，重复整理位置稳定",()=>{
    const s=start(),outside=s.items.filter(i=>i.location.space==="warehouse");
    s.warehouseLayout=I.warehousePlacements(c,s);
    const first=s.warehouseLayout.find(p=>p.uid===outside[0].uid);
    first.x=7;first.y=6;
    const other=s.warehouseLayout.find(p=>p.uid===outside[1].uid);other.page=1;
    const before=structuredClone(s),result=I.apply(c,s,{type:"sortStorage",page:0},1000).state;
    assert.deepEqual(s,before);assert.equal(result.revision,s.revision+1);
    assert.deepEqual(result.items,s.items);
    assert.deepEqual(result.warehouseLayout.find(p=>p.uid===other.uid),other);
    assert.ok(!I.same(result.warehouseLayout,s.warehouseLayout));
    assert.deepEqual(I.sortedStorage(c,result,0),result.warehouseLayout);
    assert.throws(()=>I.apply(c,s,{type:"sortStorage",page:7},1000),/页码/);
});
test("局内整理保留未知物位置和来源进度，不解锁其他来源",()=>{
    const s=enter(start()),node=s.node,t=c.templates.find(t=>t.kind==="material"&&t.width===1&&t.height===1);
    const known={uid:"sort-known",templateId:t.id,durability:null,location:{space:"source",node}},
        unknown={...known,uid:"sort-unknown"};
    s.items.push(known);s.map.sources.push({node,entries:[known,unknown],opened:true,revealed:1,progressMs:120});
    s.interactionSource=node;s.sourceLayouts.push({node,slots:I.sourcePlacements(c,s)});
    s.sourceLayouts[0].slots.find(p=>p.uid===known.uid).x=7;
    const before=structuredClone(s),result=I.apply(c,s,{type:"sortStorage",page:0},1000).state;
    assert.deepEqual(result.map.sources,before.map.sources);
    assert.deepEqual(result.sourceLayouts[0].slots.find(p=>p.uid===unknown.uid),
        before.sourceLayouts[0].slots.find(p=>p.uid===unknown.uid));
    assert.equal(result.items.some(i=>i.uid===unknown.uid),false);
    assert.deepEqual(result.items,s.items);assert.deepEqual(s,before);
    s.interactionSource=null;assert.throws(()=>I.apply(c,s,{type:"sortStorage",page:0},1000),/交互仓库/);
    assert.throws(()=>I.apply(c,before,{type:"sortStorage",page:0},before.deadlineAt),/截止/);
});
test("整理一次保存与完整重放，写失败及过期修订不改档",()=>{
    const saved=new Map();let fail=false,writes=0;
    const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>{
        if(fail)throw new Error("模拟写失败");writes++;saved.set(k,v);
    },removeItem:k=>saved.delete(k)};
    const restore=()=>new Session(new BattleManager(),storage,()=>1000,c),session=restore();
    session.prepare(c,17);
    const before=session.archive,raw=saved.get(Session.key),token=session.token,cmd={type:"sortStorage",page:0};
    fail=true;assert.throws(()=>session.inventoryCommand(cmd,token),/写失败/);
    assert.deepEqual(session.archive,before);assert.equal(saved.get(Session.key),raw);
    fail=false;session.inventoryCommand(cmd,token);assert.equal(writes,2);
    assert.equal(session.inventory.revision,before.state.revision+1);
    assert.deepEqual(restore().archive,session.archive);
    assert.throws(()=>session.inventoryCommand(cmd,token),/过期/);
});
test("整批收取只处理当前页，空间不足保留原物且不动装备药匣",()=>{
    const s=start(),t=c.templates.find(t=>t.kind==="material"&&t.width===1&&t.height===1);
    for(let i=0;i<24;i++)s.items.push({uid:"bulk-"+i,templateId:t.id,durability:null,location:{space:"warehouse"}});
    s.warehouseLayout=I.warehousePlacements(c,s);
    s.warehouseLayout.find(p=>p.uid==="bulk-23").page=1;
    const before=structuredClone(s),plan=Transfer.plan(c,s,true,0);
    assert.ok(plan.moved>0);assert.ok(plan.remaining>0);assert.match(plan.reason,/不足/);
    assert.deepEqual(s,before);
    const result=I.apply(c,s,plan.command,1000).state;
    assert.equal(result.revision,s.revision+1);
    assert.equal(I.item(result,"bulk-23").location.space,"warehouse");
    assert.equal(result.items.length,s.items.length);
    for(const space of ["weapon","container","safe","battle"])
        assert.deepEqual(result.items.filter(i=>i.location.space===space),s.items.filter(i=>i.location.space===space));
    I.validate(c,result);
    const returned=Transfer.plan(c,result,false,0),restored=I.apply(c,result,returned.command,1000).state;
    assert.equal(restored.items.filter(i=>i.location.space==="bag").length,0);
    assert.equal(restored.items.length,s.items.length);
});
test("整批移动校验负重、未装备背包与空清单",()=>{
    const s=start();
    const config=structuredClone(c);
    config.weight.base=1;
    I.template(config,s.items.find(i=>i.location.space==="container")).weightLimit=I.weight(c,s).current-1;
    // 仅为本组测试把可用承重压到当前重量，不改正式配置。
    const plan=Transfer.plan(config,s,true,0);
    assert.equal(plan.command,null);assert.ok(plan.remaining>0);assert.match(plan.reason,/负重/);
    const removed=I.apply(c,s,I.containerPlan(c,s,null),1000).state;
    assert.equal(Transfer.plan(c,removed,true,0).command,null);
    assert.equal(Transfer.plan(c,removed,false,0).command,null);
    assert.throws(()=>I.apply(c,s,{type:"moveBatch",moves:[]},1000),/清单/);
    const bag=s.items.find(i=>i.location.space==="bag");
    const m={uid:bag.uid,from:bag.location,to:{space:"warehouse"}};
    assert.throws(()=>I.apply(c,s,{type:"moveBatch",moves:[m,m]},1000),/清单/);
    assert.throws(()=>I.apply(c,s,{type:"moveBatch",moves:[{...m,from:{space:"battle"}}]},1000),/同向/);
});
test("整批移动一次写入和重放，保存失败及过期修订保持原档",()=>{
    const saved=new Map();let fail=false,writes=0;
    const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>{
        if(fail)throw new Error("模拟写失败");writes++;saved.set(k,v);
    },removeItem:k=>saved.delete(k)};
    const session=new Session(new BattleManager(),storage,()=>1000,c);
    session.prepare(c,17);
    const plan=Transfer.plan(c,session.inventory,true,0),before=session.archive,raw=saved.get(Session.key),token=session.token;
    session.previewMove(plan.command,token);
    assert.equal(writes,1);assert.deepEqual(session.archive,before);
    fail=true;assert.throws(()=>session.inventoryCommand(plan.command,token),/写失败/);
    assert.deepEqual(session.archive,before);assert.equal(saved.get(Session.key),raw);
    fail=false;session.inventoryCommand(plan.command,token);
    assert.equal(writes,2);assert.equal(session.archive.commands.length,1);
    assert.equal(session.inventory.revision,before.state.revision+1);
    const committed=session.archive;
    assert.throws(()=>session.inventoryCommand(plan.command,token),/过期/);
    assert.deepEqual(session.archive,committed);
    assert.deepEqual(new Session(new BattleManager(),storage,()=>1000,c).archive,committed);
    const invalid=structuredClone(plan.command);
    const moves=invalid.type==="reflowBag"?invalid.action.moves:invalid.moves;
    moves.at(-1).to={space:"bag",x:100,y:100,rotated:false};
    assert.throws(()=>I.apply(c,before.state,invalid,1000),/边界/);
    assert.deepEqual(session.archive,committed);
});
test("来源整批收取不揭示未知物，整批放回保留未知物占格",()=>{
    const s=enter(start()),node=s.node,t=c.templates.find(t=>t.kind==="material"&&t.width===1&&t.height===1);
    const known={uid:"bulk-known",templateId:t.id,durability:null,location:{space:"source",node}};
    const unknown={...known,uid:"bulk-unknown"};
    s.items.push(known);
    s.map.sources.push({node,entries:[known,unknown],opened:true,revealed:1,progressMs:0});
    s.interactionSource=node;
    s.sourceLayouts.push({node,slots:I.sourcePlacements(c,s)});
    const unknownSlot=structuredClone(s.sourceLayouts[0].slots.find(p=>p.uid===unknown.uid));
    const picked=Transfer.plan(c,s,true,0);
    assert.equal(picked.moved,1);
    const next=I.apply(c,s,picked.command,1000).state;
    assert.equal(next.items.some(i=>i.uid===unknown.uid),false);
    assert.deepEqual(next.sourceLayouts[0].slots.find(p=>p.uid===unknown.uid),unknownSlot);
    const stored=Transfer.plan(c,next,false,0),after=I.apply(c,next,stored.command,1000).state;
    assert.equal(after.items.filter(i=>i.location.space==="bag").length,0);
    assert.deepEqual(after.sourceLayouts[0].slots.find(p=>p.uid===unknown.uid),unknownSlot);
    assert.throws(()=>I.apply(c,s,picked.command,s.deadlineAt),/截止/);
});
test("归真匣四种规格的边界、碰撞、禁入与存档重放",()=>{
    assert.deepEqual([c.spaces.safeWidth,c.spaces.safeHeight],[2,1]);
    for(const [width,height] of [[2,1],[2,2],[3,2],[3,3]]){
        const config=structuredClone(c);
        config.spaces.safeWidth=width;config.spaces.safeHeight=height;
        const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
        const restore=()=>new Session(new BattleManager(),storage,()=>1000,config);
        const session=restore();session.prepare(config,17);
        const potion=session.inventory.items.find(i=>I.template(config,i).kind==="hp");
        const to={space:"safe",x:width-1,y:height-1,rotated:false};
        session.inventoryCommand({type:"move",move:{uid:potion.uid,from:potion.location,to}});
        assert.deepEqual(I.item(session.inventory,potion.uid).location,to);
        assert.deepEqual(restore().archive,session.archive);
        const other=session.inventory.items.find(i=>I.template(config,i).kind==="mp");
        const archive=session.archive;
        assert.throws(()=>I.apply(config,session.inventory,{type:"move",move:{uid:other.uid,from:other.location,to}},1000),/相交/);
        assert.throws(()=>I.apply(config,session.inventory,{type:"move",move:{uid:other.uid,from:other.location,
            to:{space:"safe",x:width,y:0,rotated:false}}},1000),/越界|尺寸|网格/);
        assert.throws(()=>I.apply(config,session.inventory,{type:"equipWeapon",uid:null,oldTo:to},1000));
        assert.deepEqual(session.archive,archive);
    }
    for(const [width,height] of [[1,2],[1,1],[2,3],[4,2]]){
        const config=structuredClone(c);config.spaces.safeWidth=width;config.spaces.safeHeight=height;
        assert.throws(()=>I.validateConfig(config),/三空间配置无效/);
    }
});
test("七列背包保留六档总容量，末行禁放与原档重放",()=>{
    for(const id of [1201,1203,1205,1207,1209,1211]){
        const config=structuredClone(c);
        config.fixtures.find(f=>f.templateId===1201).templateId=id;
        const saved=new Map(),storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
        const restore=()=>new Session(new BattleManager(),storage,()=>1000,config);
        let session=restore();session.prepare(config,17);
        const original=session.archive,raw=saved.get(Session.key);
        const projection=I.bagProjection(config,session.inventory),capacity=I.bagCapacity(config,session.inventory);
        assert.equal(projection.overflow.length,0);assert.equal(saved.get(Session.key),raw);
        assert.deepEqual(session.archive,original);
        assert.deepEqual(I.size(config,projection.state,"bag"),[7,Math.ceil(capacity/7)]);
        const item=projection.state.items.find(i=>i.templateId===309);
        const to={space:"bag",x:(capacity-1)%7,y:Math.floor((capacity-1)/7),rotated:false};
        const command={type:"reflowBag",action:{type:"move",move:{uid:item.uid,from:item.location,to}}};
        session.inventoryCommand(command);
        assert.equal(I.bagCapacity(config,session.inventory),capacity);
        assert.deepEqual(I.item(session.inventory,item.uid).location,to);
        assert.equal(session.inventory.bagColumns,7);
        session=restore();assert.equal(session.error,"");assert.deepEqual(session.inventory.bagColumns,7);
        assert.deepEqual(session.archive.commands.at(-1).command,command);
        const before=session.archive;
        if(capacity%7)assert.throws(()=>I.apply(config,session.inventory,{type:"move",move:{
            uid:item.uid,from:to,to:{space:"bag",x:capacity%7,y:Math.floor(capacity/7),rotated:false}}},1000),/末行/);
        assert.throws(()=>I.apply(config,session.inventory,{type:"reflowBag",action:{type:"enter"}},1000),/整理一并提交/);
        assert.deepEqual(session.archive,before);
    }
});
test("七列多格碰撞、旋转、换包与无法重排时保留原物",()=>{
    let s=start();
    const item=s.items.find(i=>i.templateId===309);
    const p=I.bagProjection(c,s);
    const mixed={uid:"wide",templateId:304,durability:null,location:{space:"warehouse"}};
    p.state.items.push(mixed);
    let arranged=I.apply(c,p.state,{type:"move",move:{uid:item.uid,from:item.location,
        to:{space:"bag",x:6,y:0,rotated:false}}},1000).state;
    assert.throws(()=>I.apply(c,arranged,{type:"move",move:{uid:mixed.uid,from:mixed.location,
        to:{space:"bag",x:6,y:0,rotated:true}}},1000),/边界/);
    arranged=I.apply(c,arranged,{type:"move",move:{uid:mixed.uid,from:mixed.location,
        to:{space:"bag",x:2,y:1,rotated:true}}},1000).state;
    assert.deepEqual(I.dimensions(I.template(c,mixed),I.item(arranged,mixed.uid).location),[2,1]);
    assert.throws(()=>I.apply(c,arranged,{type:"move",move:{uid:item.uid,from:I.item(arranged,item.uid).location,
        to:{space:"bag",x:3,y:1,rotated:false}}},1000),/相交/);
    const plan=I.containerPlan(c,arranged,null),removed=I.apply(c,arranged,plan,1000).state;
    assert.equal(removed.items.filter(i=>i.location.space==="bag").length,0);
    s.items.filter(i=>i.location.space==="bag").forEach(i=>i.location={space:"warehouse"});
    for(let i=0;i<2;i++)s.items.push({uid:"packed-weapon-"+i,templateId:101,durability:c.templates.find(t=>t.id===101).weaponDurability,
        location:{space:"bag",x:i*2,y:0,rotated:false}});
    I.validate(c,s);
    const before=structuredClone(s),projection=I.bagProjection(c,s);
    assert.equal(projection.overflow.length,1);assert.deepEqual(s,before);
    assert.throws(()=>I.apply(c,s,{type:"reflowBag",action:{type:"arrangeWarehouse",uid:item.uid,
        from:item.location,to:{page:0,x:3,y:3,rotated:false}}},1000),/先取出/);
    const overflow=I.item(s,projection.overflow[0]);
    s=I.apply(c,s,{type:"move",move:{uid:overflow.uid,from:overflow.location,to:{space:"warehouse"}}},1000).state;
    assert.equal(I.bagProjection(c,s).overflow.length,0);assert.equal(s.items.length,before.items.length);
});
test("七列整理和移动同笔保存，写失败、碰撞与过期均不发布",()=>{
    const saved=new Map();let fail=false;
    const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>{
        if(fail)throw new Error("模拟写失败");saved.set(k,v);
    },removeItem:k=>saved.delete(k)};
    const session=new Session(new BattleManager(),storage,()=>1000,c);session.prepare(c,17);
    const projected=I.bagProjection(c,session.inventory).state;
    const item=projected.items.find(i=>i.templateId===309),token=session.token;
    const command={type:"reflowBag",action:{type:"move",move:{uid:item.uid,from:item.location,
        to:{space:"bag",x:1,y:0,rotated:false}}}};
    const before=session.archive,raw=saved.get(Session.key);
    session.previewMove(command,token);
    assert.deepEqual(session.archive,before);assert.equal(saved.get(Session.key),raw);
    fail=true;assert.throws(()=>session.inventoryCommand(command,token),/写失败/);
    assert.deepEqual(session.archive,before);assert.equal(saved.get(Session.key),raw);
    fail=false;
    assert.throws(()=>session.inventoryCommand({...command,action:{...command.action,move:{...command.action.move,
        to:{space:"bag",x:0,y:0,rotated:false}}}},token),/相交/);
    assert.deepEqual(session.archive,before);assert.equal(saved.get(Session.key),raw);
    session.inventoryCommand(command,token);
    assert.equal(session.inventory.bagColumns,7);
    assert.equal(session.inventory.revision,before.state.revision+1);
    assert.equal(session.archive.commands.length,before.commands.length+1);
    const committed=session.archive,committedRaw=saved.get(Session.key);
    assert.throws(()=>session.inventoryCommand(command,token),/过期|修订/);
    assert.deepEqual(session.archive,committed);assert.equal(saved.get(Session.key),committedRaw);
    assert.deepEqual(new Session(new BattleManager(),storage,()=>1000,c).archive,committed);
});
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
    assert.equal(repaired.items.find(i=>i.location.space==="weapon").durability,36);
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
test("八把武器的换装属性、逐件耐久上限与两档修理有效",()=>{
    for(const t of c.templates.filter(t=>t.kind==="weapon")){
        let s=start();
        const item={uid:"new-weapon",templateId:t.id,durability:t.weaponDurability,location:{space:"warehouse"}};
        s.items.push(item);
        s=I.apply(c,s,{type:"equipWeapon",uid:item.uid,from:item.location,oldTo:{space:"warehouse"}},1000).state;
        assert.deepEqual(I.carry(c,s).weapon,{id:t.id,name:t.name,attack:t.weaponAttack,defense:t.weaponDefense,
            durability:t.weaponDurability,maxDurability:t.weaponDurability});
        s=enter(s);I.item(s,item.uid).durability=1;
        const tool=s.items.find(i=>i.templateId===307);
        s=I.apply(c,s,{type:"use",uid:tool.uid,from:tool.location},1000).state;
        assert.equal(I.item(s,item.uid).durability,36);
        const full={uid:"full-repair",templateId:308,durability:null,location:{space:"bag",x:1,y:0,rotated:false}};
        s.items.push(full);
        s=I.apply(c,s,{type:"use",uid:full.uid,from:full.location},1000).state;
        assert.equal(I.item(s,item.uid).durability,t.weaponDurability);
        const unused={...full,uid:"unused"};s.items.push(unused);
        const before=structuredClone(s);
        assert.throws(()=>I.apply(c,s,{type:"use",uid:unused.uid,from:unused.location},1000),/已满/);
        assert.deepEqual(s,before);
        I.item(s,item.uid).durability=t.weaponDurability+1;
        assert.throws(()=>I.validate(c,s),/实际耐久/);
    }
});
test("两格药品占据完整网格，旋转后仅一个实际用药实例",()=>{
    const config=structuredClone(c);
    config.fixtures.find(f=>f.templateId===301).templateId=303;
    config.fixtures.find(f=>f.templateId===303).count=1;
    config.fixtures.find(f=>f.templateId===302).templateId=304;
    config.fixtures.find(f=>f.templateId===304).count=1;
    let s=R.start(config,17,"wide-potion");
    const item=s.items.find(i=>i.templateId===303);
    assert.deepEqual(item.location,{space:"battle",x:0,y:0,rotated:false});
    assert.deepEqual(s.items.find(i=>i.templateId===304).location,{space:"battle",x:2,y:0,rotated:true});
    assert.equal(I.carry(config,s).pouch.filter(Boolean).length,2);
    const before=structuredClone(s);
    assert.throws(()=>I.apply(config,s,{type:"move",move:{uid:item.uid,from:item.location,
        to:{space:"battle",x:4,y:0,rotated:false}}},1000),/尺寸|越界/);
    assert.deepEqual(s,before);
    s=R.apply(config,s,{type:"enter"},1000,17).state;s.hp=400;
    s=I.apply(config,s,{type:"use",uid:item.uid,from:item.location},1000).state;
    assert.equal(s.hp,960);assert.equal(I.item(s,item.uid).location.space,"consumed");
    assert.equal(I.carry(config,s).pouch[0],null);assert.equal(I.carry(config,s).pouch[1],null);
});
test("战外双恢复按各自缺口消费，护盾药不在战外消耗",()=>{
    const base=enter(start());
    const mixed={uid:"mixed",templateId:305,durability:null,location:{space:"safe",x:0,y:0,rotated:false}};
    base.items.push(mixed);base.hp=950;base.mp=115;
    const used=I.apply(c,base,{type:"use",uid:mixed.uid,from:mixed.location},1000).state;
    assert.equal(used.hp,1000);assert.equal(used.mp,120);
    assert.equal(I.item(used,mixed.uid).location.space,"consumed");
    base.hp=1000;base.mp=120;
    assert.throws(()=>I.apply(c,base,{type:"use",uid:mixed.uid,from:mixed.location},1000),/已满/);
    mixed.templateId=306;
    assert.throws(()=>I.apply(c,base,{type:"use",uid:mixed.uid,from:mixed.location},1000),/仅可在战斗/);
    assert.equal(I.item(base,mixed.uid).location.space,"safe");
});
test("全部新物品可从当前来源产出，草药矿材兽材按来源区分",()=>{
    const base=start(),seen=new Set();
    for(const pool of c.pools){
        const node=c.nodes.find(n=>n.poolId===pool.id);
        assert.ok(node);
        for(let seed=1;seed<=2048;seed++){
            const s=structuredClone(base);s.node=node.id;R.makeSource(c,s,seed);
            const entries=R.source(s).entries;
            if(pool.code==="alchemy"){
                assert.equal(I.template(c,entries[0]).kind,"hp");
                assert.equal(I.template(c,entries[1]).kind,"mp");
            }
            for(const item of entries){
                const t=I.template(c,item);seen.add(t.id);
                if(pool.code==="herb")assert.ok(t.id>=901&&t.id<=906);
                if(pool.code==="ore")assert.ok(t.id>=907&&t.id<=912);
                if(pool.code==="beast")assert.ok(!(t.id>=919&&t.id<=924));
                if(t.kind==="weapon")assert.ok(item.durability>=0&&item.durability<=t.weaponDurability);
            }
        }
    }
    assert.deepEqual([...seen].sort((a,b)=>a-b),c.templates.map(t=>t.id));
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
