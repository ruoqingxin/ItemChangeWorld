const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),build=path.resolve(process.argv[2]||path.join(root,"bin/gameplay-tests"));
const {load,blocks,tables,config:cfg}=require("./config-fixture.cjs");
const {EItemKind}=load("config/schema.js");
const {BattleRules:Core}=load("module/skillBattle/utils/BattleRules.js");
const {QingmingRules:Q}=load("module/skillBattle/utils/QingmingRules.js");
const {QingmingConfig:C}=load("module/skillBattle/utils/QingmingConfig.js");
const {GuzongEnemyRules:E}=load("module/skillBattle/utils/GuzongEnemyRules.js");
const {QingmingBuildRules:QB}=load("module/build/utils/QingmingBuildRules.js");
const {BuildRules:B}=load("module/build/utils/BuildRules.js");
const {BuildConfigUtils:BC}=load("module/build/utils/BuildConfigUtils.js");
const {ExpeditionRunConfigUtils:Config}=load("module/expedition/utils/ExpeditionRunConfigUtils.js");
const {ExpeditionRules:R}=load("module/expedition/utils/ExpeditionRules.js");
const {ExpeditionRunManager:S}=load("module/expedition/manager/ExpeditionRunManager.js");
const {SkillBattleManager:M}=load("module/skillBattle/manager/SkillBattleManager.js");
let groups=0;
const test=(name,fn)=>{fn();groups++;console.log("PASS Qingming formal "+name);};
function makeLoadout(items=[]){const q=QB.empty(17);for(const k of items){
    const d=C.items[k];q.acquired.push(k);if(d.type==="core")q.core=k;else if(d.slot)q.mutations[d.slot]=k;else q.passives.push(k);}return q;}
function battle(id="patrol",items=[],patch={}){
    const c=structuredClone(cfg.build);c.encounters[0].qingmingEnemy=id;
    let flow=QB.start(17,"formal");flow.qingming=makeLoadout(items);
    const record=QB.apply(c,flow,{type:"battle"},1).state.battles[0];
    Object.assign(record.setup,patch);record.state=Core.start(record.setup,"formal");
    return record;
}
function act(record,move,extra={}){
    const before=structuredClone(record.state),action={type:"qingming",move,...extra};
    const result=Core.resolve(record.setup,record.state,action);
    assert.ok(result.ok,result.reason);assert.deepEqual(record.state,before);
    record.state=result.state;return result;
}
function fixture(seed=1,c=cfg){
    let now=1000,fail=false;const data=new Map([["other-app","keep"]]);
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error("disk");data.set(k,v);},removeItem:k=>data.delete(k)};
    const s=new S(new M(),storage,()=>now,c,()=>0);s.prepare(c,seed);
    return {s,data,storage,fail:v=>fail=v,clock:v=>now=v,restore:()=>new S(new M(),storage,()=>now,c,()=>0)};
}
function enterFight(f){
    f.s.inventoryCommand({type:"enter"});
    const nodes=f.s.inventory.map.nodes,enemy=nodes.filter(n=>n.qingmingEnemy&&n.mainOrder>=0).sort((a,b)=>a.mainOrder-b.mainOrder)[0];
    const queue=[[f.s.inventory.node]],seen=new Set(queue[0]),edges=f.s.inventory.map.edges;
    let route;
    for(const p of queue){if(p.at(-1)===enemy.id){route=p;break;}
        for(const [a,b]of edges){const n=a===p.at(-1)?b:b===p.at(-1)?a:null;if(n&&!seen.has(n)){seen.add(n);queue.push([...p,n]);}}}
    for(const node of route.slice(1))f.s.mapCommand({type:"travel",node});
    f.s.mapCommand({type:"fight"});return enemy;
}
function confirm(f,action){const p=f.s.preview(action);assert.ok(p.ok,p.reason);
    const r=f.s.confirm(action,p.preview.token);assert.ok(r.ok,r.reason);return r;}
test("generated config stores raw integer units and matches the source export",()=>{
    assert.equal(Object.keys(blocks).length,22);
    assert.equal(cfg.mapVersion,"qingming-20261119-items-v2");
    assert.ok(blocks.battle_rule && blocks.skill && blocks.build && blocks.enemy);
    const configRoot=process.env.CONFIG_ROOT||path.resolve(root,"../config");
    assert.deepEqual(fs.readFileSync(path.join(root,"assets/config/configbin.bin")),fs.readFileSync(path.join(configRoot,"configbin.bin")));
    assert.deepEqual(fs.readFileSync(path.join(root,"src/script/config/schema.ts")),fs.readFileSync(path.join(configRoot,"output_client/code/schema.ts")));
    assert.deepEqual(cfg.build.setup.player,{maxHp:1000,maxMp:120,baseAttack:96,baseDefense:38});
    assert.deepEqual(cfg.build.setup.potions.map(p=>p.amount),[420,50,560,70,160,120]);
});
function withRows(changes){
    const edited=Object.create(tables);
    for(const [name,transform] of Object.entries(changes)){
        const rows=transform(tables[name].getDataList().map(row=>({...row})));
        const byId=new Map(rows.map(row=>[row.id,row]));
        Object.defineProperty(edited,name,{value:{getDataList:()=>rows,get:id=>byId.get(id)}});
    }
    return edited;
}
test("物品编号稳定，药效编号独立，引用按目标表查找",()=>{
    const bands=[
        [101,300,[EItemKind.weapon]], [301,600,[EItemKind.hp,EItemKind.mp,EItemKind.repair,EItemKind.stamina,EItemKind.mixed,EItemKind.shield]],
        [601,900,[EItemKind.book]], [901,1200,[EItemKind.material]], [1201,1500,[EItemKind.container]],
    ];
    const items=tables.item.getDataList();
    for(const {id,kind} of items){
        const band=bands.find(([first,last])=>id>=first&&id<=last);
        assert.ok(band?.[2].includes(kind),`${id} ${kind} 不在对应编号段`);
        assert.ok(id>100,`编号 ${id} 占用了货币预留区`);
    }
    assert.equal(tables.item.get(101)?.name,"轻翎剑");
    assert.equal(tables.item.get(601)?.name,"青冥剑典");
    assert.equal(tables.item.get(1201)?.name,"素麻囊");
    assert.ok(items.every(i=>i.enabled===1));
    assert.equal(cfg.templates.length,56);
    for(const [first,last]of [[101,108],[301,311],[601,601],[901,924],[1201,1212]])
        assert.deepEqual(items.filter(i=>i.id>=first&&i.id<=last).map(i=>i.id),Array.from({length:last-first+1},(_,i)=>first+i));
    assert.deepEqual(cfg.fixtures.map(f=>f.templateId),[101,1201,301,302,307,309,310,311]);
    assert.equal(tables.item.get(924)?.recycle_price,1200);
    assert.equal(tables.weapon.get(108)?.durability,76);
    assert.equal(tables.repair.get(308)?.amount,-1);
    assert.equal(tables.potion.get(tables.potion_item.get(305).potion_id)?.secondary_amount,20);
    assert.deepEqual(items.filter(i=>i.kind===EItemKind.book).map(i=>i.name),["青冥剑典"]);
    assert.ok(cfg.variants.every(v=>!/^book[A-Z]|^container\d|^small$/.test(v.family)));
    const reordered=withRows({
        item:rows=>rows.reverse(),
        potion_item:rows=>rows.map(r=>r.id===301?{...r,potion_id:101}:r).reverse(),
        potion:rows=>rows.map(r=>r.id===1?{...r,id:101}:r).reverse(),
        weapon:rows=>rows.reverse(),
        container:rows=>rows.reverse(),
        repair:rows=>rows.reverse(),
        stamina:rows=>rows.reverse(),
        inventory_start:rows=>rows.reverse(),
        build_mutation:rows=>rows.reverse(),
        map_node:rows=>rows.reverse(),
        map_search:rows=>rows.reverse(),
        map_pool:rows=>rows.reverse(),
        map_pool_category:rows=>rows.reverse(),
        map_pool_quality:rows=>rows.reverse(),
        map_pool_weapon:rows=>rows.reverse(),
        map_variant:rows=>rows.reverse(),
        skill:rows=>rows.reverse(),
        build:rows=>rows.reverse(),
        enemy:rows=>rows.reverse(),
    });
    const before=[Object.keys(C.items),Object.keys(E.enemies)];
    assert.deepEqual(Config.read(reordered),cfg);
    assert.deepEqual([Object.keys(C.items),Object.keys(E.enemies)],before);
});
test("重复编号、未知行为码和错误跨表引用在读表时拒绝",()=>{
    const change=(at,fields)=>rows=>rows.map((r,i)=>i===at?{...r,...fields}:r);
    for(const [table,patch,reason] of [
        ["item",change(1,{id:101}),/编号无效或重复/],
        ["item",change(1,{enabled:2}),/投放开关/],
        ["build",change(0,{code:"unknown"}),/行为码未知或重复/],
        ["enemy",change(1,{code:"patrol"}),/行为码未知或重复/],
        ["potion",change(0,{id:99}),/引用的药效/],
        ["inventory_start",change(2,{item_id:999}),/起始物品编号/],
        ["inventory_start",change(2,{count:0}),/起始物品编号/],
        ["map_node",change(1,{pool_id:999}),/掉落池引用无效/],
        ["map_variant",change(0,{item_id:302}),/引用的物品编号/],
        ["map_variant",change(0,{item_id:307}),/引用的物品编号/],
        ["map_variant",change(0,{item_id:999}),/引用的物品编号/],
    ]) assert.throws(()=>Config.read(withRows({[table]:patch})),reason);
});
test("专属配置与枚举、关联权重必须完整且有效",()=>{
    for(const item of tables.item.getDataList()){
        assert.equal(typeof item.kind,"number");
        for(const field of ["weapon_attack","weapon_defense","weapon_durability","repair_amount",
            "bag_width","bag_height","weight_limit","stamina_restore","potion_id"])assert.ok(!(field in item));
    }
    const change=(at,fields)=>rows=>rows.map((r,i)=>i===at?{...r,...fields}:r);
    const cases=[
        ["item",change(0,{kind:999}),/物品类别.*枚举值无效|类别无效/],
        ["weapon",rows=>rows.slice(1),/缺少物品/],
        ["weapon",change(0,{id:301}),/类别无效/],
        ["container",change(0,{id:999}),/类别无效/],
        ["repair",change(0,{id:301}),/类别无效/],
        ["stamina",rows=>rows.slice(1),/缺少物品/],
        ["potion_item",change(0,{potion_id:999}),/引用的药效/],
        ["potion",change(0,{resource:999}),/枚举值无效/],
        ["build",change(0,{type:999}),/枚举值无效/],
        ["build",change(0,{family:999}),/枚举值无效/],
        ["build_mutation",change(0,{skill_id:999}),/技能引用无效/],
        ["build_mutation",rows=>rows.slice(1),/构筑配置无效/],
        ["enemy",change(0,{tier:999}),/枚举值无效/],
        ["map_node",change(0,{kind:999}),/枚举值无效/],
        ["map_search",rows=>rows.slice(1),/缺少专属参数/],
        ["map_search",change(0,{id:1}),/引用的节点无效/],
        ["map_variant",change(0,{family:999}),/枚举值无效/],
        ["map_pool_category",change(0,{family:999}),/枚举值无效/],
        ["map_pool_category",change(0,{pool_id:999}),/掉落池引用无效/],
        ["map_pool_category",change(0,{weight:-1}),/权重/],
        ["map_pool_category",change(1,{family:1}),/权重重复/],
        ["map_pool_quality",change(0,{quality:0}),/权重/],
        ["map_pool_quality",change(1,{quality:1}),/权重重复/],
        ["map_pool_quality",rows=>rows.slice(1),/缺少类别、品质/],
        ["map_pool_weapon",rows=>rows.slice(1),/武器耐久配置/],
        ["map_pool_weapon",change(0,{id:999}),/掉落池引用无效/],
        ["inventory_start",change(0,{durability:999}),/起始物品/],
    ];
    for(const [table,patch,reason]of cases)
        assert.throws(()=>Config.read(withRows({[table]:patch})),reason,table);
});
test("地图计时与搜索参数实际生效，耐久上限统一读表",()=>{
    const c=Config.read(withRows({
        weapon:rows=>rows.map(r=>r.id===101?{...r,durability:65}:r),
        map_rule:rows=>rows.map(r=>({...r,limit_ms:450000,search_ms:1500})),
    }));
    assert.equal(c.build.setup.weapon.maxDurability,65);
    assert.equal(c.fixtures.find(f=>f.templateId===101).durability,48);
    const f=fixture(1,c);
    f.s.inventoryCommand({type:"enter"});
    assert.equal(f.s.remainingMs,450000);
    assert.deepEqual(f.s.inventory.map.warnings,[]);
    f.clock(151000);
    f.s.expire();
    assert.deepEqual(f.s.inventory.map.warnings,[300000]);
    const s=f.s.inventory;
    s.node=s.map.nodes.find(n=>n.kind==="search").id;
    R.makeSource(c,s,1);
    const item=R.source(s).entries[0];
    assert.equal(R.searchDuration(c,s),1500*c.templates.find(t=>t.id===item.templateId).quality);
});
test("3AP, four base skills, nearest-integer rounding and exact shared-kernel parity for all fifteen enemies",()=>{
    for(const id of Object.keys(E.enemies)){
        const r=battle(id);
        assert.equal(r.state.qingming.enemy.attack,r.setup.qingming.enemyAttack,"tier multiplier applied once");
        for(const move of ["edge","wind","guide","end","fall"]){
            const attributes=Core.attributes(r.setup,r.state),source=structuredClone(r.state.qingming);
            Object.assign(source.player,attributes);
            const expected=Q.resolve(source,{move,enemyAction:move==="guide"?3:undefined});
            const actual=act(r,move,move==="guide"?{enemyAction:3}:{});
            assert.deepEqual(actual.state.qingming,expected.state);
            for(const a of [actual.state.player,actual.state.enemy])for(const n of Object.values(a))assert.ok(Number.isInteger(n));
        }
    }
    const r=battle("patrol",[],{weapon:null,player:{maxHp:1000,maxMp:120,baseAttack:101,baseDefense:39}});
    assert.equal(act(r,"edge").preview.enemyHpLoss,111);
    assert.equal(act(r,"wind").state.player.block,98);
});
test("all 27 items retain effects and replacement prerequisites in formal combat",()=>{
    const anchors={salvo:["swordcraft"],swordUnity:["swordcraft"],rupture:["wound"],dye:["wound","riposte"],
        endlessWound:["wound","rupture"],heavyEdge:["storedEdge"],pinGuide:["wound"],swordSiphon:["swordcraft"],
        woundGuard:["wound"],stillness:["delayedFall"]};
    for(const key of Object.keys(C.items)){
        const r=battle("tortoise",[...(anchors[key]||[]),key]);
        for(const move of ["wind","edge","guide","end","edge","fall"])if(r.state.phase==="player_input")act(r,move);
        assert.ok(Q.has(r.state.qingming,key));Core.validateState(r.setup,r.state);
    }
    const q=makeLoadout(["flyingEdge","swordUnity"]);assert.equal(Q.eligible(q,"heavyEdge"),false);
});
test("actual potion UID, independent save, shared once-per-turn chance and no AP or durability cost",()=>{
    const f=fixture();enterFight(f);
    assert.deepEqual(f.s.state.qingming.potions,{heal:0,mana:0});
    confirm(f,{type:"qingming",move:"edge"});
    const state=f.s.state,mp=state.pouch.find(i=>i?.itemId===302);
    const p=f.s.preview({type:"potion",itemUid:mp.itemUid});
    assert.equal(p.preview.recovery,4);
    confirm(f,{type:"potion",itemUid:mp.itemUid});
    assert.equal(f.s.state.qingming.ap,state.qingming.ap);
    assert.equal(f.s.state.weapon.durability,state.weapon.durability);
    assert.equal(f.s.state.player.mp,120);assert.ok(f.s.inventory.consumed.includes(mp.itemUid));
    assert.deepEqual(f.restore().archive,f.s.archive);
    assert.equal(f.s.preview({type:"potion",itemUid:mp.itemUid}).ok,false);
    assert.equal(f.s.preview({type:"potion",itemUid:state.pouch.find(i=>i?.itemId===301).itemUid}).ok,false);
    assert.equal(f.s.preview({type:"qingming",move:"heal"}).ok,false,"no prototype potion path");
    assert.equal(f.data.get("other-app"),"keep");
});
test("六种正式药品按缺口生效，共用机会且不扣行动和耐久",()=>{
    for(const id of [301,302,303,304,305,306]){
        const r=battle("tortoise"),p=r.setup.potions.find(p=>p.itemId===id);
        const pouch=[{itemUid:"actual",itemId:id},null,null,null,null];
        r.state=Core.start(r.setup,"medicine",{hp:500,mp:60,weapon:r.setup.weapon,pouch});
        const before=structuredClone(r.state);
        const actual=Core.resolve(r.setup,r.state,{type:"potion",itemUid:"actual"});
        assert.ok(actual.ok,actual.reason);assert.deepEqual(r.state,before);
        const next=actual.state;
        assert.equal(next.player.hp,500+(["hp","mixed"].includes(p.resource)?Math.min(p.amount,500):0));
        assert.equal(next.player.mp,60+(p.resource==="mp"?Math.min(p.amount,60):p.resource==="mixed"?20:0));
        assert.equal(next.player.block,p.resource==="shield"?120:0);
        assert.equal(next.qingming.ap,before.qingming.ap);
        assert.deepEqual(next.weapon,before.weapon);
        assert.equal(next.pouch[0],null);assert.ok(next.potionUsed);
        Core.validateState(r.setup,next);
        assert.equal(Core.resolve(r.setup,next,{type:"potion",itemUid:"actual"}).ok,false);
    }
});
test("双恢复可只补一种资源，护盾截断且满额拒绝时不消耗",()=>{
    for(const [hp,mp]of [[1000,100],[900,120],[1000,120]]){
        const r=battle("tortoise");
        r.state=Core.start(r.setup,"mixed",{hp,mp,weapon:r.setup.weapon,
            pouch:[{itemUid:"mixed",itemId:305},null,null,null,null]});
        const result=Core.resolve(r.setup,r.state,{type:"potion",itemUid:"mixed"});
        assert.equal(result.ok,hp<1000||mp<120);
        if(result.ok){assert.equal(result.state.player.hp,1000);assert.equal(result.state.player.mp,120);}
    }
    const r=battle("tortoise");
    r.state=Core.start(r.setup,"shield",{hp:1000,mp:120,weapon:r.setup.weapon,
        pouch:[{itemUid:"shield",itemId:306},null,null,null,null]});
    r.state.qingming.player.shield=r.state.player.block=r.state.qingming.setup.player.defense*6-20;
    const capped=Core.resolve(r.setup,r.state,{type:"potion",itemUid:"shield"});
    assert.ok(capped.ok);assert.equal(capped.preview.shield,20);
    r.state.qingming.player.shield=r.state.player.block=r.state.qingming.setup.player.defense*6;
    const full=Core.resolve(r.setup,r.state,{type:"potion",itemUid:"shield"});
    assert.equal(full.ok,false);assert.deepEqual(full.state,r.state);
});
test("durability crossing uses full attributes, subsequent action uses half weapon, no weapon remains playable",()=>{
    const r=battle();r.setup.weapon.durability=1;r.state=Core.start(r.setup,"cross");
    assert.equal(act(r,"edge").preview.enemyHpLoss,112);
    assert.equal(r.state.weapon.durability,0);
    assert.equal(act(r,"edge").preview.enemyHpLoss,109);
    assert.equal(act(r,"end").preview.durabilityCost,0);
    const none=battle("patrol",[],{weapon:null});assert.ok(act(none,"basic").ok);
});
test("durability loss preserves shields and deferred damage already earned",()=>{
    const r=battle("tortoise",[],{weapon:{...cfg.build.setup.weapon,attack:100,defense:100,durability:2}});
    act(r,"wind");act(r,"wind");
    assert.equal(r.state.weapon.durability,0);
    assert.ok(r.state.player.block>Core.attributes(r.setup,r.state).defense*6);
    const source=structuredClone(r.state.qingming);
    Object.assign(source.player,Core.attributes(r.setup,r.state));
    const expected=Q.resolve(source,{move:"basic"});
    assert.ok(expected.ok,expected.reason);
    assert.deepEqual(act(r,"basic").state.qingming,expected.state);
    const d=battle("tortoise",["delayedFall","stillness"],
        {weapon:{...cfg.build.setup.weapon,attack:100,defense:100,durability:1}});
    act(d,"fall");const suspended=d.state.qingming.pendingSword;
    assert.equal(suspended,Math.round(196*2.2*1.5));
    act(d,"wind");assert.equal(d.state.qingming.pendingSword,suspended);
    act(d,"end");Core.validateState(d.setup,d.state);
});
test("bad targets, old skills, prototype actions and full/absent potions reject without mutation",()=>{
    const r=battle();
    for(const action of [{type:"qingming",move:"guide",enemyAction:4},{type:"skill",skillId:1},
        ...["next","choose","retreat","heal","mana"].map(move=>({type:"qingming",move})),
        {type:"potion",itemUid:"missing"}]){
        const before=structuredClone(r.state),result=Core.resolve(r.setup,r.state,action);
        assert.equal(result.ok,false);assert.deepEqual(result.state,before);assert.deepEqual(r.state,before);
    }
});
test("map roster is seeded independently, complete 7/5/3 coverage and reload preserves exact map",()=>{
    const found=new Set();
    for(let seed=1;seed<=128;seed++){
        const s=R.apply(cfg,R.start(cfg,seed,"coverage"),{type:"enter"},1000,seed).state;
        for(const n of s.map.nodes.filter(n=>n.qingmingEnemy)){
            found.add(n.qingmingEnemy);const e=E.enemies[n.qingmingEnemy];
            assert.equal(n.name,e.name);assert.equal(e.tier,n.kind==="normal"?"普通":n.kind==="elite"?"精英":"首领");
        }
    }
    assert.equal(found.size,15);
    const f=fixture();f.s.inventoryCommand({type:"enter"});assert.deepEqual(f.restore().archive,f.s.archive);
    assert.equal(f.s.flow.pending,null);assert.equal(f.s.flow.phase,"ready");
});
test("victory pays one persisted three-choice reward, preserves carried resources and blocks until claimed",()=>{
    const f=fixture();const enemy=enterFight(f);
    for(let n=0;f.s.flow.phase==="battle"&&n<60;n++)confirm(f,{type:"basic"});
    assert.equal(f.s.flow.phase,"ready");
    const pending=f.s.flow.pending;assert.equal(pending.kind,"qingming");assert.equal(pending.candidates.length,3);
    assert.equal(new Set(pending.candidates).size,3);assert.ok(f.s.inventory.map.cleared.includes(enemy.id));
    const before=f.s.archive;assert.throws(()=>f.s.mapCommand({type:"fight"}));
    assert.deepEqual(f.s.archive,before);assert.deepEqual(f.restore().archive,before);
    f.s.dispatch({type:"choose",source:pending.source,id:pending.candidates[0]});
    assert.equal(f.s.flow.qingming.acquired.length,1);assert.equal(f.s.flow.pending,null);
    assert.equal(f.s.inventory.hp,before.state.hp);assert.equal(f.s.inventory.mp,before.state.mp);
    assert.throws(()=>f.s.dispatch({type:"choose",source:pending.source,id:pending.candidates[0]}));
});
test("first nine battle rewards, every third choice core, node offers, and pool exhaustion do not grant old points",()=>{
    const c=structuredClone(cfg.build);c.setup.player.maxHp=1000000;c.setup.player.baseAttack=10000;
    c.encounters=Array.from({length:12},(_,i)=>({...c.encounters[0],id:"enc"+i}));
    let s=B.start(c,17,"rewards");
    for(let n=1;n<=12;n++){
        s=B.apply(c,s,{type:"battle"},n).state;
        while(s.phase==="battle")s=B.apply(c,s,{type:"action",action:{type:"basic"}},n).state;
        if(n<=9){
            assert.equal(s.pending.kind,"qingming");
            if(n%3===0&&Object.keys(C.items).some(k=>C.items[k].type==="core"&&Q.eligible(s.qingming,k)))
                assert.ok(s.qingming.offers.some(k=>C.items[k].type==="core"));
            s=B.apply(c,s,{type:"choose",source:s.pending.source,id:s.pending.candidates[0]},n).state;
        }else assert.equal(s.pending,null);
    }
    s=B.offer(c,s,"borrow:unique","active");assert.equal(s.pending.kind,"qingming");
    assert.ok(!("daoyun" in s) && !("points" in s) && !("build" in s));
    const full=QB.start(17,"full");full.qingming.acquired=Object.keys(C.items);
    const exhausted=QB.offer(full,"insight:full");assert.equal(exhausted.pending,null);
    assert.throws(()=>QB.offer(exhausted,"insight:full"));
});
test("save failure, stale preview, concurrent tab and timeout preserve atomic inventory and combat",()=>{
    const f=fixture();enterFight(f);const before=f.s.archive,text=f.data.get(S.key);
    const action={type:"qingming",move:"edge"},preview=f.s.preview(action);
    f.fail(true);assert.equal(f.s.confirm(action,preview.preview.token).ok,false);
    assert.deepEqual(f.s.archive,before);assert.equal(f.data.get(S.key),text);
    f.fail(false);confirm(f,action);assert.equal(f.s.confirm(action,preview.preview.token).ok,false);
    const other=f.restore();confirm(f,{type:"basic"});const latest=f.data.get(S.key);
    const p=other.preview({type:"basic"});assert.equal(other.confirm({type:"basic"},p.preview.token).ok,false);
    assert.equal(f.data.get(S.key),latest);
    f.clock(f.s.archive.state.deadlineAt);assert.equal(f.s.expire(),true);
    assert.equal(f.s.inventory.result,"timeout");assert.equal(f.s.flow.qingming,undefined);
    assert.equal(f.data.get("other-app"),"keep");assert.deepEqual(f.restore().archive,f.s.archive);
});
test("movement and search exhaustion deaths clear the current loadout and settle once",()=>{
    const entered=R.apply(cfg,R.start(cfg,1,"exhaustion"),{type:"enter"},1000,1).state;
    for(const type of ["travel","openSource"]){
        let s=structuredClone(entered);s.flow.qingming=makeLoadout(["swordcraft"]);
        let command;
        if(type==="travel"){
            command={type,node:[...R.reachable(cfg,s)].find(n=>n!==s.node)};
        }else{
            const id=s.map.nodes.find(n=>n.kind==="search").id;
            const edge=s.map.edges.find(([a,b])=>a===id||b===id);
            s.node=edge.find(n=>n!==id);s.map.debugEnemyBlocking=false;
            s=R.apply(cfg,s,{type:"travel",node:id},1050,1).state;command={type};
        }
        s.stamina=0;s.hp=1;
        const result=R.apply(cfg,s,command,1100,1).state;
        assert.equal(result.phase,"ended");assert.equal(result.result,"defeat");
        assert.equal(result.flow.qingming,undefined);assert.equal(result.flow.pending,null);
        assert.ok(!("build" in result.flow));
        assert.throws(()=>R.apply(cfg,result,command,1200,1));
    }
});
test("changed config and fractional/tampered snapshots preserve raw archive and block restoration",()=>{
    const f=fixture();enterFight(f);const raw=f.data.get(S.key),changed=structuredClone(cfg);
    changed.build.setup.player.maxHp++;
    const mismatch=new S(new M(),f.storage,()=>1000,changed,()=>0);
    assert.match(mismatch.error,/配置已改变/);assert.equal(f.data.get(S.key),raw);
    const former=JSON.parse(raw);former.config.rules.checkpointMs=250;
    f.data.set(S.key,JSON.stringify(former));
    assert.match(f.restore().error,/配置已改变，请明确重建/);
    assert.equal(f.data.get(S.key),JSON.stringify(former));
    const bad=JSON.parse(raw);bad.state.flow.battles[0].state.player.hp+=0.5;f.data.set(S.key,JSON.stringify(bad));
    assert.match(f.restore().error,/无法读取/);assert.equal(f.data.get(S.key),JSON.stringify(bad));
});
console.log(`${groups} Qingming formal integration groups passed.`);
