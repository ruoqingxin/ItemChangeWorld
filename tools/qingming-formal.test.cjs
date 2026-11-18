const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),build=path.resolve(process.argv[2]||path.join(root,"bin/gameplay-tests"));
global.Laya={Resource:class{},Byte:class{constructor(b){this.bytes=Buffer.from(b);this.pos=0;}
    readUTFBytes(n){const s=this.bytes.toString("utf8",this.pos,this.pos+n);this.pos+=n;return s;}}};
const load=p=>require(path.join(build,"script",p));
const {Tables}=load("config/schema.js"),ByteBuf=load("config/bright/serialization/ByteBuf.js").default;
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
function unpack(file){const b=fs.readFileSync(file),out={};let p=4;
    for(let i=0;i<b.readInt32LE(0);i++){const n=b.readInt32LE(p);p+=4;const k=b.toString("utf8",p,p+n);p+=n;
        const l=b.readInt32LE(p);p+=4;out[k]=b.subarray(p,p+l);p+=l;}assert.equal(p,b.length);return out;}
const blocks=unpack(path.join(root,"assets/config/configbin.bin"));
const cfg=Config.read(new Tables(n=>new ByteBuf(new Uint8Array(blocks[n])))),profile=BC.profile(cfg.build);
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
    const s=new S(new M(),storage,()=>now,c,()=>0);s.prepare(c,BC.profile(c.build),seed);
    return {s,data,storage,fail:v=>fail=v,clock:v=>now=v,restore:()=>new S(new M(),storage,()=>now,c,()=>0)};
}
function enterFight(f){
    f.s.inventoryCommand({type:"enter"});
    const nodes=f.s.inventory.map.nodes,enemy=nodes.filter(n=>n.enemy&&n.mainOrder>=0).sort((a,b)=>a.mainOrder-b.mainOrder)[0];
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
    assert.equal(Object.keys(blocks).length,44);
    assert.equal(cfg.mapVersion,"qingming-20261117-integer-v1");
    assert.ok(blocks.new_qingming_rule);
    assert.deepEqual(fs.readFileSync(path.join(root,"assets/config/configbin.bin")),fs.readFileSync(path.join(root,"../config/configbin.bin")));
    assert.deepEqual(fs.readFileSync(path.join(root,"src/script/config/schema.ts")),fs.readFileSync(path.join(root,"../config/output_client/code/schema.ts")));
    assert.deepEqual(cfg.build.setup.player,{maxHp:1000,maxMp:120,baseAttack:96,baseDefense:38});
    assert.deepEqual(cfg.build.setup.potions.map(p=>p.amount),[300,36]);
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
    const state=f.s.state,mp=state.pouch.find(i=>i?.itemId===2);
    const p=f.s.preview({type:"potion",itemUid:mp.itemUid});
    assert.equal(p.preview.recovery,4);
    confirm(f,{type:"potion",itemUid:mp.itemUid});
    assert.equal(f.s.state.qingming.ap,state.qingming.ap);
    assert.equal(f.s.state.weapon.durability,state.weapon.durability);
    assert.equal(f.s.state.player.mp,120);assert.ok(f.s.inventory.consumed.includes(mp.itemUid));
    assert.deepEqual(f.restore().archive,f.s.archive);
    assert.equal(f.s.preview({type:"potion",itemUid:mp.itemUid}).ok,false);
    assert.equal(f.s.preview({type:"potion",itemUid:state.pouch.find(i=>i?.itemId===1).itemUid}).ok,false);
    assert.equal(f.s.preview({type:"qingming",move:"heal"}).ok,false,"no prototype potion path");
    assert.equal(f.data.get("other-app"),"keep");
});
test("durability crossing uses full attributes, subsequent action uses half weapon, no weapon remains playable",()=>{
    const r=battle();r.setup.weapon.durability=1;r.state=Core.start(r.setup,"cross");
    assert.equal(act(r,"edge").preview.enemyHpLoss,110);
    assert.equal(r.state.weapon.durability,0);
    assert.equal(act(r,"edge").preview.enemyHpLoss,108);
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
        const s=R.apply(cfg,profile,R.start(cfg,profile,seed,"coverage"),{type:"enter"},1000,seed).state;
        for(const n of s.map.nodes.filter(n=>n.enemy)){
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
    let s=B.start(c,profile,17,"rewards");
    for(let n=1;n<=12;n++){
        s=B.apply(c,profile,s,{type:"battle"},n).state;
        while(s.phase==="battle")s=B.apply(c,profile,s,{type:"action",action:{type:"basic"}},n).state;
        if(n<=9){
            assert.equal(s.pending.kind,"qingming");
            if(n%3===0&&Object.keys(C.items).some(k=>C.items[k].type==="core"&&Q.eligible(s.qingming,k)))
                assert.ok(s.qingming.offers.some(k=>C.items[k].type==="core"));
            s=B.apply(c,profile,s,{type:"choose",source:s.pending.source,id:s.pending.candidates[0]},n).state;
        }else assert.equal(s.pending,null);
    }
    s=B.offer(c,profile,s,"borrow:unique","active");assert.equal(s.pending.kind,"qingming");
    assert.equal(s.daoyun,0);assert.equal(s.points,0);assert.equal(s.build.actives.length,0);
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
    const entered=R.apply(cfg,profile,R.start(cfg,profile,1,"exhaustion"),{type:"enter"},1000,1).state;
    for(const type of ["travel","openSource"]){
        let s=structuredClone(entered);s.flow.qingming=makeLoadout(["swordcraft"]);
        let command;
        if(type==="travel"){
            command={type,node:[...R.reachable(cfg,s)].find(n=>n!==s.node)};
        }else{
            const id=s.map.nodes.find(n=>n.kind==="search").id;
            const edge=s.map.edges.find(([a,b])=>a===id||b===id);
            s.node=edge.find(n=>n!==id);s.map.debugEnemyBlocking=false;
            s=R.apply(cfg,profile,s,{type:"travel",node:id},1050,1).state;command={type};
        }
        s.stamina=0;s.hp=1;
        const result=R.apply(cfg,profile,s,command,1100,1).state;
        assert.equal(result.phase,"ended");assert.equal(result.result,"defeat");
        assert.equal(result.flow.qingming,undefined);assert.equal(result.flow.pending,null);
        assert.deepEqual(result.flow.build,{schools:[],actives:[],passiveIds:[]});
        assert.throws(()=>R.apply(cfg,profile,result,command,1200,1));
    }
});
test("changed config and fractional/tampered snapshots preserve raw archive and block restoration",()=>{
    const f=fixture();enterFight(f);const raw=f.data.get(S.key),changed=structuredClone(cfg);
    changed.build.setup.player.maxHp++;
    const mismatch=new S(new M(),f.storage,()=>1000,changed,()=>0);
    assert.match(mismatch.error,/配置已改变/);assert.equal(f.data.get(S.key),raw);
    const bad=JSON.parse(raw);bad.state.flow.battles[0].state.player.hp+=0.5;f.data.set(S.key,JSON.stringify(bad));
    assert.match(f.restore().error,/无法读取/);assert.equal(f.data.get(S.key),JSON.stringify(bad));
});
console.log(`${groups} Qingming formal integration groups passed.`);
