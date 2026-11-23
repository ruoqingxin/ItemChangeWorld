const assert=require("node:assert/strict");
const {config:c,load,tables}=require("./config-fixture.cjs");
const {InventoryRules:I}=load("module/inventory/utils/InventoryRules.js");
const {ExpeditionRules:X}=load("module/expedition/utils/ExpeditionRules.js");
const {BattleRules:B}=load("module/skillBattle/utils/BattleRules.js");
const {BuildRules:F}=load("module/build/utils/BuildRules.js");
const {SkillBattleManager}=load("module/skillBattle/manager/SkillBattleManager.js");
const {ExpeditionRunManager:M}=load("module/expedition/manager/ExpeditionRunManager.js");
const C=load("module/skillBattle/utils/CombatConfig.js"),E=load("module/skillBattle/utils/CombatEngine.js");
let checks=0;
function test(name,fn){fn();checks++;console.log("通过",name);}
const state=()=>X.start(c,733,"expedition_1000_733");
const clone=B.clone;
function memory(){
    const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
}
function setup(skills=C.START_SKILLS,enemyId=1,gear=[]){return {...clone(c.build.setup),skills,enemyId,equipment:gear};}
function fight(s){
    let rounds=0;
    while(s.phase==="player_input"&&rounds++<100){
        const actions=[...s.combat.build.skills.map(code=>({type:"skill",code})),{type:"basic"}];
        const candidates=actions.map(a=>B.resolve(setup(s.combat.build.skills,s.combat.enemies[0].id+1,s.equipment),s,a)).filter(r=>r.ok);
        const result=candidates.sort((a,b)=>a.state.enemy.hp-b.state.enemy.hp||b.state.player.hp-a.state.player.hp)[0];
        if(!result)throw Error("无可用招式");
        s=result.state;
    }
    return s;
}
test("真实配置包、六属性及五技能位",()=>{
    assert.deepEqual(C.RULES.player,{hp:240,mp:36,a:18,s:18,armor:6,speed:10});
    assert.equal(C.SKILLS.length,36);assert.equal(C.BASES.length,24);assert.equal(C.TRAITS.length,24);
    assert.equal(C.ENEMIES.length,15);assert.equal(c.build.setup.skills.length,5);
    assert.equal(tables.item.get(101).name,"轻翎剑");assert.equal(tables.item.get(601).name,"青冥剑典");
    assert.equal(c.templates.length,200);
});
test("六药单格单份与正确药效",()=>{
    for(let i=0;i<6;i++){const t=c.templates.find(t=>t.id===301+i);assert.equal(t.width*t.height,1);assert.equal(t.stack,1);}
    assert.deepEqual(C.POTIONS.map(p=>[p.hp,p.mp,p.shield]),[[90,0,0],[0,18,0],[150,0,0],[0,30,0],[45,9,0],[0,0,45]]);
});
test("初始整备按装备上限补满，后续换装和修理不补血蓝",()=>{
    for(let seed=1;seed<=48;seed++){
        let s=X.start(c,seed,"initial_"+seed);
        const initial=I.stats(c,s);
        assert.equal(s.hp,initial.hp);assert.equal(s.mp,initial.mp);
        s.hp=90;s.mp=4;
        const armor=I.createItem(c,1501,"new-armor",{space:"warehouse"},seed);
        s.items.push(armor);
        s=I.apply(c,s,I.equipmentPlan(c,s,armor.uid),1000).state;
        assert.equal(s.hp,90);assert.equal(s.mp,4);
        const weapon=s.items.find(i=>i.location.space==="weapon");
        weapon.durability=0;weapon.equipment.durability=0;
        const tool=s.items.find(i=>i.templateId===307);
        s=I.apply(c,s,{type:"repair",uid:tool.uid,from:tool.location,targetUid:weapon.uid},1000).state;
        assert.equal(s.hp,90);assert.equal(s.mp,4);
    }
});
test("全底材、六品质独立属性档位与特性池",()=>{
    for(const base of C.BASES)for(let q=1;q<=6;q++)for(let seed=1;seed<=16;seed++){
        const gear=C.rollItem(base.code,q,seed),[lo,hi]=C.WINDOWS[q-1];
        assert(gear.mainBand>=lo&&gear.mainBand<=hi);assert(gear.subBand>=lo&&gear.subBand<=hi);
        assert(C.TRAITS.some(t=>t.code===gear.trait.code&&t.slot===base.slot));assert(gear.subValue>0);
    }
});
test("零耐久同属性合并后减半、特性继续存在",()=>{
    const gear=C.rollItem("steelSword",6,4);gear.sub=gear.main;gear.mainValue=13;gear.subValue=5;gear.durability=0;
    assert.equal(C.statsFromItems([gear]).a,27);assert(C.activeTraits([gear])[gear.trait.code]);
});
test("护甲同时处理物理与魔法并先扣盾",()=>{
    assert.equal(E.armorDamage(40,100),20);
    const s=E.createBattle({skills:[],potions:[]},[],[1]),e=s.enemies[0];e.armor=100;e.shield=10;
    assert.equal(E.hitEnemy(s,e,40,2),10);assert.equal(e.shield,0);
});
test("速度先手、每人一行动且同速玩家先",()=>{
    const s=B.start(setup([],2),"speed");assert.equal(s.combat.enemies[0].actions,1);
    const next=B.resolve(setup([],2),s,{type:"basic"});assert(next.ok);assert.equal(next.state.mainActions,1);
    assert.equal(next.state.combat.enemies[0].actions,2);
    const tie=B.start(setup([],4),"tie");assert.equal(tie.combat.enemies[0].actions,0);
});
test("药品不占行动、不刷新冷却且每自身回合共用一次",()=>{
    const carry={hp:150,mp:10,weapon:null,equipment:[],pouch:[{itemUid:"h",itemId:301},{itemUid:"m",itemId:302},null,null,null]};
    const a=setup(["sunder"]),s=B.start(a,"potions",carry),result=B.resolve(a,s,{type:"potion",itemUid:"h"});
    assert(result.ok);assert.equal(result.state.mainActions,0);assert.equal(result.state.round,s.round);
    assert.equal(result.state.player.hp,240);assert.equal(result.state.pouch[0],null);
    assert.equal(B.resolve(a,result.state,{type:"potion",itemUid:"m"}).ok,false);
    const next=B.resolve(a,result.state,{type:"skill",code:"sunder"});assert(next.ok);assert.equal(next.state.mainActions,1);
    assert.equal(B.resolve(a,next.state,{type:"potion",itemUid:"m"}).ok,true);
    assert(s.pouch[0]);assert.equal(s.player.hp,150);
});
test("五格限制、技能资源失败不扣费、预览不修改原状态",()=>{
    assert.throws(()=>B.start(setup(C.SKILLS.slice(2,8).map(s=>s.code)),"invalid"));
    const a=setup(["detonate"]),s=B.start(a,"bad"),before=JSON.stringify(s);
    assert.equal(B.resolve(a,s,{type:"skill",code:"detonate"}).ok,false);assert.equal(JSON.stringify(s),before);
    assert.equal(B.resolve(a,s,{type:"skill",code:"rend"}).ok,false);
});
test("全34技能均可调用，独立参数来自生成配置",()=>{
    for(const skill of C.SKILLS.slice(2)){
        const a=setup([skill.code]),s=B.start(a,"skill-"+skill.code),p=s.combat.p,e=s.combat.enemies[0];
        p.hp=100;p.mp=p.maxMp;e.hp=20;
        for(const type of ["bleed","burn","chill","mark"])E.addStatus(s.combat,e,type,3,3,3);
        E.addStatus(s.combat,p,"burn",1,3,3);
        // 显示快照必须与规则状态保持一致。
        s.player.hp=p.hp;s.enemy.hp=e.hp;
        const r=B.resolve(a,s,{type:"skill",code:skill.code});
        assert(r.ok,skill.code+": "+r.reason);assert.equal(r.state.mainActions,1);
    }
});
test("三装备实例生成固定、换装及修理不重抽",()=>{
    let s=state();const t=c.templates.find(t=>t.kind==="armor");
    const armor=I.createItem(c,t.id,"armor",{space:"warehouse"},733);s.items.push(armor);
    const rolled=clone(armor.equipment);
    s=I.apply(c,s,I.equipmentPlan(c,s,armor.uid),1000).state;
    assert.deepEqual(I.item(s,"armor").equipment,rolled);
    const equipped=I.item(s,"armor");equipped.durability=1;equipped.equipment.durability=1;
    const tool=s.items.find(i=>i.templateId===307);
    s=I.apply(c,s,{type:"repair",uid:tool.uid,from:tool.location,targetUid:"armor"},1000).state;
    assert.equal(I.item(s,"armor").durability,13);
    assert.deepEqual({...I.item(s,"armor").equipment,durability:rolled.durability},rolled);
    assert.equal(I.item(s,tool.uid).location.space,"consumed");
});
test("整场只扣一次三部位耐久",()=>{
    const instances=[C.rollItem("steelSword",6,9),C.rollItem("scale",6,10),C.rollItem("pin",6,11)];
    let s=E.createBattle({skills:["rend"],potions:[]},instances,[1]);
    E.playerAct(s,"rend");assert.deepEqual(s.items.map(i=>i.durability),instances.map(i=>i.durability));
    while(!s.settled&&s.round<30)E.playerAct(s,"rend");
    assert(s.won);assert.deepEqual(s.items.map(i=>i.durability),instances.map((i,n)=>i.durability-[2,2,1][n]));
});
test("愿力修理不足整笔回滚，出售所得进入同档账本",()=>{
    let s=state(),weapon=s.items.find(i=>i.location.space==="weapon");weapon.durability=1;weapon.equipment.durability=1;
    const before=JSON.stringify(s);assert.throws(()=>I.apply(c,s,{type:"repairAll"},1000),/愿力不足/);assert.equal(JSON.stringify(s),before);
    const sold=s.items.find(i=>i.templateId===311),price=I.template(c,sold).recyclePrice;
    s=I.apply(c,s,{type:"sell",uid:sold.uid,from:sold.location},1000).state;assert.equal(s.wish,price);
    const cost=I.repairCost(s);assert(s.wish>=cost);
    s=I.apply(c,s,{type:"repairAll"},1000).state;assert.equal(s.wish,price-cost);assert.equal(I.repairCost(s),0);
});
test("技能机缘只给主动，保存候选且最多装配五招",()=>{
    const s=F.start(c.build,733,"skills"),offer=F.offer(c.build,s,"node","active");
    assert.equal(offer.pending.candidates.length,3);assert.deepEqual(F.offer(c.build,s,"node","active"),offer);
    const next=F.apply(c.build,offer,{type:"choose",source:"node",id:offer.pending.candidates[0],slot:2},1000).state;
    assert.equal(next.skills.length,5);assert.equal(next.knownSkills.length,6);
    assert.throws(()=>F.apply(c.build,next,{type:"loadout",skills:[...next.skills,"ignite"]},1000));
});
test("新地图敌人从15模板按品级固定、掉落包含三部位且可重放",()=>{
    const a=X.apply(c,state(),{type:"enter"},1000,733).state,b=X.apply(c,state(),{type:"enter"},1000,733).state;
    assert.deepEqual(a,b);
    for(const n of a.map.nodes.filter(n=>["normal","elite","boss"].includes(n.kind))){
        const e=C.ENEMIES.find(e=>e.id===n.enemyId);assert.equal(e.tier,n.kind==="boss"?3:n.kind==="elite"?2:1);
    }
    assert(c.variants.some(v=>v.family==="armor"));assert(c.variants.some(v=>v.family==="accessory"));
});
test("整备、读档、完整命令回放与配置不匹配保留原文",()=>{
    const storage=memory(),m=new M(new SkillBattleManager(),storage,()=>1000,c);
    m.prepare(c,733);m.inventoryCommand({type:"enter"});
    const reloaded=new M(new SkillBattleManager(),storage,()=>1000,c);assert.equal(reloaded.error,"");assert.deepEqual(reloaded.archive,m.archive);
    const original=storage.getItem(M.key),other=clone(c);other.mapVersion+="changed";
    const refused=new M(new SkillBattleManager(),storage,()=>1000,other);assert(refused.error.includes("原文保留"));
    assert.equal(storage.getItem(M.key),original);
});
test("保存失败与过期预览不发布，其他标签页覆盖拒绝",()=>{
    const storage=memory(),manager=new SkillBattleManager(),m=new M(manager,storage,()=>1000,c);
    m.prepare(c,733);const before=JSON.stringify(m.archive),write=storage.setItem;
    storage.setItem=()=>{throw Error("磁盘满");};assert.throws(()=>m.inventoryCommand({type:"enter"}),/磁盘满/);
    assert.equal(JSON.stringify(m.archive),before);storage.setItem=write;
    const old=m.token;m.inventoryCommand({type:"enter"});assert.throws(()=>m.previewMove({type:"sortStorage",page:0},old),/过期/);
    storage.data.set(M.key,"external");assert.throws(()=>m.mapCommand({type:"debugEnemyBlocking",enabled:false}),/其他页面/);
});
test("战斗确认和实际药品、血蓝、三装备进入同一保存事务",()=>{
    const storage=memory(),manager=new SkillBattleManager(),m=new M(manager,storage,()=>1000,c);
    m.prepare(c,733);m.inventoryCommand({type:"enter"});m.mapCommand({type:"debugEnemyBlocking",enabled:false});
    const route=(()=>{const s=m.inventory,target=s.map.nodes.find(n=>n.kind==="normal"),queue=[[s.node]],seen=new Set();
        while(queue.length){const p=queue.shift(),v=p[p.length-1];if(v===target.id)return p;seen.add(v);for(const [a,b]of s.map.edges){
            const n=a===v?b:b===v?a:null;if(n&&!seen.has(n))queue.push([...p,n]);}}})();
    for(const node of route.slice(1))m.mapCommand({type:"travel",node});
    m.mapCommand({type:"fight"});
    const preview=m.preview({type:"basic"});assert(preview.ok);
    const before=JSON.stringify(m.archive),write=storage.setItem;
    storage.setItem=()=>{throw Error("写失败");};
    assert.equal(m.confirm({type:"basic"},preview.preview.token).ok,false);
    assert.equal(JSON.stringify(m.archive),before);storage.setItem=write;
    assert(m.confirm({type:"basic"},preview.preview.token).ok);
    assert.equal(m.confirm({type:"basic"},preview.preview.token).ok,false);
    while(m.flow.phase==="battle"){
        const s=m.state,action={type:"skill",code:"rend"};
        const p=m.preview(action);assert(p.ok);assert(m.confirm(action,p.preview.token).ok);
        if(s.round>30)throw Error("战斗没有结束");
    }
    assert(m.inventory.map.cleared.length);assert.equal(m.inventory.hp,m.state.player.hp);
    const previous=m.inventory.hp;assert(previous<240);
    const restored=new M(new SkillBattleManager(),storage,()=>1000,c);assert.equal(restored.error,"");
    assert.equal(restored.inventory.hp,previous);assert.deepEqual(restored.archive,m.archive);
});
console.log(`正式客户端规则与事务：${checks} 组通过；装备生成2304次。`);
module.exports={checks};
