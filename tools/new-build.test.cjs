const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const build = process.argv[2];
global.Laya = { Resource: class {}, Byte: class {
    constructor(buffer) { this.bytes=Buffer.from(buffer);this.pos=0; }
    readUTFBytes(n) {const text=this.bytes.toString("utf8",this.pos,this.pos+n);this.pos+=n;return text;}
}};
const load = file => require(path.join(build, `script/${file}.js`));
const { NewBattleCore: Core } = load("module/skillBattle/newRules/NewBattleCore");
const { NewBuildConfigUtils: Config } = load("module/skillBattle/newRules/NewBuildConfigUtils");
const { NewBuildRules: Rules } = load("module/skillBattle/newRules/NewBuildRules");
const { NewBuildSession: Session } = load("module/skillBattle/newRules/NewBuildSession");
const { SkillBattleManager: Manager } = load("module/skillBattle/manager/SkillBattleManager");
const { Tables } = load("config/schema");
const ByteBuf=load("config/bright/serialization/ByteBuf").default;
const pack=fs.readFileSync(path.join(__dirname,"../assets/config/configbin.bin"));
let offset=0;
const uint=()=>{const n=pack.readUInt32LE(offset);offset+=4;return n;};
const count=uint(),buffers=new Map();
for(let i=0;i<count;i++){const n=uint(),name=pack.toString("utf8",offset,offset+n);offset+=n;const size=uint();buffers.set(name,pack.subarray(offset,offset+size));offset+=size;}
const tables=new Tables(name=>new ByteBuf(new Uint8Array(buffers.get(name))));
const config=()=>Config.read(tables),copy=structuredClone;
const basic={type:"basic"},guard={type:"guard"},cast=skillId=>({type:"skill",skillId});
let passed=0;
function test(name,fn){try{fn();passed++;console.log(`OK build: ${name}`);}catch(e){console.error(`FAIL build: ${name}`);throw e;}}
const quiet = () => {const c=config();c.setup.enemy.maxHp=100000;
    c.setup.enemy.intents=[{id:1,name:"测试攻击",damage:1000,block:0,charging:false}];return c;};
function fixture(id,level=0,passives=[]) {
    const cfg=quiet(),s=cfg.setup;
    s.build={schools:["sword","earth"],actives:[{skillId:id,level}],passiveIds:passives};
    return {cfg:s,state:Core.start(s,"earth-test")};
}
function step(cfg,s,action){
    const before=copy(s),saved=copy(cfg),r=Core.resolve(cfg,s,action);
    assert.ok(r.ok,r.reason);assert.deepEqual(s,before);assert.deepEqual(cfg,saved);
    assert.deepEqual(r,Core.resolve(cfg,s,action));return r;
}
test("approved nine sheets supply ten actives, sixteen passives and default qualifications",()=>{
    const cfg=config(),profile=Config.profile(cfg),s=Rules.start(cfg,profile,15,"run");
    assert.equal(count,32);assert.equal(cfg.setup.skills.length,10);assert.equal(cfg.setup.passives.length,16);
    assert.deepEqual(Rules.activePool(cfg,profile,s),[1,2,6,7]);
    assert.equal(s.pending.candidates.length,3);assert.equal(s.build.actives.length,0);
    assert.deepEqual(profile.learnedSkills,[]);assert.deepEqual(profile.learnedPassives,[]);
    assert.equal(new Set(s.build.schools).size,2);
});
const primary=[100,110,110,120,120,130],secondary=[100,100,115,115,130,145],single=[100,110,120,130,140,150];
const rounded=(base,...percent)=>{
    const d=100n**BigInt(percent.length),n=percent.reduce((v,p)=>v*BigInt(p),BigInt(base));
    return Number((n+d/2n)/d);
};
for(const id of [6,7,8,9,10])for(let level=0;level<=5;level++)
    test(`earth skill ${id} +${level}: full, broken, absent and crossing-zero weapon, power/no power`,()=>{
        for(const weapon of ["full","zero","none","cross"])for(const power of [false,true]) {
            const {cfg,state:s}=fixture(id,level);
            if(weapon==="none"){cfg.weapon=null;s.weapon=null;}
            if(weapon==="zero")s.weapon.durability=0;
            if(weapon==="cross")s.weapon.durability=1;
            s.earth.power=power;
            const A={full:1400,zero:1200,none:1000,cross:1400}[weapon],D={full:800,zero:700,none:600,cross:800}[weapon];
            const r=step(cfg,s,cast(id)),p=r.preview;
            const body=id===6?rounded(A,85,single[level],power?120:100):
                id===8?rounded(A,110,primary[level],power?120:100,...power?[125,secondary[level]]:[]):
                id===9?rounded(A,55,primary[level],power?120:100):0;
            assert.equal(p.body,body);
            assert.equal(p.shield,id===7?rounded(D,200,single[level]):id===10?rounded(D,100,secondary[level]):0);
            if(id===9)assert.equal(p.reduction,rounded(D,50,secondary[level]));
            if(id===10)assert.equal(p.counter,rounded(A,70,primary[level]));
            assert.equal(r.state.player.mp,3000-cfg.skills.find(r=>r.id===id).mpCost);
            if(weapon==="cross")assert.equal(r.state.weapon.durability,0);
        }
    });
test("power is earned only by real absorbed intent damage while alive, expires on nonattacks",()=>{
    const {cfg,state:s}=fixture(7);
    const shield=step(cfg,s,cast(7));assert.equal(shield.state.earth.power,true);
    const p=copy(shield.state);p.player.hp-=100;p.pouch[0]={itemUid:"hp",itemId:1};
    const med=step(cfg,p,{type:"potion",itemUid:"hp"});assert.equal(med.state.earth.power,true);
    const hit=step(cfg,med.state,basic);assert.equal(hit.preview.body,1680);assert.equal(hit.state.earth.power,false);
    cfg.enemy.intents[0].damage=0;
    const non=step(cfg,shield.state,guard);assert.equal(non.state.earth.power,false);
    const none=step(cfg,s,basic);assert.equal(none.state.earth.power,false);
    cfg.build.schools=["sword"];cfg.build.actives=[];assert.equal(step(cfg,s,guard).state.earth.power,false);
});
test("earth power and keen are separate; earth and common extra hits do not multiply",()=>{
    const {cfg,state:s}=fixture(1,5,[11,13]);
    s.earth.power=true;s.sword.momentum=3;s.sword.keen=true;
    const r=step(cfg,s,cast(1));
    assert.equal(r.preview.body,2016);assert.equal(r.preview.keen,500);
    assert.equal(r.preview.earthBonus,200);assert.equal(r.preview.commonBonus,200);
    assert.equal(r.state.sword.momentum,0);
});
test("thick rampart and medicine marker add independent unscaled shields",()=>{
    const {cfg,state:s}=fixture(7,5,[7,12,16]);
    s.player.hp-=100;s.pouch[0]={itemUid:"hp",itemId:1};
    const p=step(cfg,s,{type:"potion",itemUid:"hp"});
    assert.equal(p.preview.shield,400);assert.equal(p.state.earth.gumai,true);assert.equal(p.state.mainActions,0);
    const r=step(cfg,p.state,cast(7));
    assert.equal(r.preview.shield,2400+200+400);assert.equal(r.state.earth.gumai,false);
    assert.equal(r.events.filter(e=>e.type==="passive"&&e.name==="厚垒").length,1);
    const wasted=step(cfg,p.state,basic);assert.equal(wasted.state.earth.gumai,false);
    assert.equal(step(cfg,wasted.state,cast(7)).preview.shield,2600);
});
test("rock-edge, mountain-weight and borrowed-mountain select exactly their attack category",()=>{
    for(const [id,kind] of [[null,"lifeng"],[6,"zhongyue"],[1,"jieshan"]]){
        const {cfg,state:s}=fixture(id||1,0,[8,10,11]);s.earth.power=true;
        const r=step(cfg,s,id?cast(id):basic);
        assert.equal(r.preview.earthBonus,200);
        assert.equal(r.events.filter(e=>e.type==="damage"&&e.part===kind).length,1);
    }
});
test("danger shields use explicit charging and borrowed attacks, never basic/nonattacks",()=>{
    const {cfg,state:s}=fixture(6,0,[9]);cfg.enemy.intents[0].charging=true;
    assert.equal(step(cfg,s,cast(6)).preview.shield,200);
    assert.equal(step(cfg,s,basic).preview.shield,0);
    cfg.enemy.intents[0].charging=false;assert.equal(step(cfg,s,cast(6)).preview.shield,0);
});
test("first-strike, first-guard and low-HP rescue are once per battle and cannot resurrect",()=>{
    const {cfg,state:s}=fixture(1,0,[13,14,15]);
    let r=step(cfg,s,basic);assert.equal(r.preview.commonBonus,200);
    assert.equal(step(cfg,r.state,basic).preview.commonBonus,undefined);
    r=step(cfg,s,guard);assert.equal(r.preview.shield,1600);
    assert.equal(step(cfg,r.state,guard).preview.shield,1200);
    s.player.hp=1800;r=step(cfg,s,basic);assert.equal(r.preview.shield,800);
    assert.equal(r.state.common.rescueUsed,true);
    assert.equal(step(cfg,r.state,basic).preview.shield,0);
    s.player.hp=100;cfg.enemy.intents[0].damage=10000;
    const dead=step(cfg,s,guard);assert.equal(dead.state.phase,"defeat");
    assert.equal(dead.events.at(-1).type,"ended");
});
test("reduction precedes shields, does not persist and cannot generate power without absorption",()=>{
    const {cfg,state:s}=fixture(9);s.player.block=200;
    let r=step(cfg,s,cast(9));assert.equal(r.preview.reduction,400);assert.equal(r.preview.playerHpLoss,400);
    assert.equal(r.state.earth.power,true);
    r=step(cfg,r.state,basic);assert.equal(r.preview.playerHpLoss,1000);
    cfg.enemy.intents[0].damage=200;r=step(cfg,s,cast(9));
    assert.equal(r.preview.reduction,200);assert.equal(r.state.earth.power,false);
});
test("counter is once, hits new enemy shields, truncates mark and never recurses",()=>{
    const {cfg,state:s}=fixture(10,0,[4,7,8,9,10,11]);
    cfg.enemy.intents[0].block=500;
    let r=step(cfg,s,cast(10));assert.equal(r.preview.counter,980);
    assert.equal(r.events.filter(e=>e.type==="damage"&&e.part==="counter").length,1);
    assert.equal(r.state.enemy.hp,100000-480);
    assert.equal(r.events.some(e=>e.type==="passive"&&e.name==="崩甲"),false);
    s.player.hp=1;cfg.enemy.intents[0].damage=10000;
    r=step(cfg,s,cast(10));assert.equal(r.state.phase,"defeat");assert.equal(r.preview.counter,undefined);
    cfg.enemy.intents[0].damage=500;cfg.enemy.intents[0].block=0;s.player.hp=6000;s.enemy.hp=900;
    s.sword.mark={damage:300,ticks:2};
    r=step(cfg,s,cast(10));assert.equal(r.state.phase,"victory");
    assert.equal(r.events.some(e=>e.type==="damage"&&e.part==="mark"),false);
});
test("invalid/full potion and invalid main action do not consume first-use or power",()=>{
    const {cfg,state:s}=fixture(5,0,[12,16]);s.earth.power=true;s.sword.momentum=3;s.sword.keen=true;
    s.pouch[0]={itemUid:"hp",itemId:1};
    for(const a of [{type:"potion",itemUid:"hp"},cast(5)]){
        const r=Core.resolve(cfg,s,a);assert.equal(r.ok,false);assert.deepEqual(r.state,s);
    }
});
const easy = () => {const cfg=config();for(const e of cfg.encounters) {
    e.enemy.maxHp=100;e.enemy.intents=[{id:1,name:"观察",damage:0,block:0,charging:false}];
}return cfg;};
function memory(){const map=new Map([["other-app","keep"],["nowchange.stage1-battle.v1","keep-trial"],["nowchange.skill-expedition.current.v2","keep-v2"]]);
    return {map,fail:false,getItem(k){return map.get(k)??null;},setItem(k,v){if(this.fail)throw Error("disk full");map.set(k,v);},
        removeItem(k){if(this.fail)throw Error("disk full");map.delete(k);}};}
function create(store=memory(),clock=()=>1000){const manager=new Manager();return {manager,store,session:new Session(manager,store,clock)};}
function begin(session,cfg=easy(),fixture=false,seed=15){
    session.start(cfg,Config.profile(cfg,fixture),seed);
    const p=session.flow.pending;session.dispatch({type:"choose",source:p.source,id:p.candidates[0]});
}
const choose=session=>{const p=session.flow.pending;session.dispatch({type:"choose",source:p.source,id:p.candidates[0]});};
const win=session=>{session.dispatch({type:"battle"});const p=session.preview(basic);assert.ok(session.confirm(basic,p.preview.token).ok);};
test("start/upgrade/replacement require valid source, slots and qualifications",()=>{
    const cfg=easy(),profile=Config.profile(cfg,true);let s=Rules.start(cfg,profile,15,"fixture");
    assert.throws(()=>Rules.apply(cfg,profile,s,{type:"battle"},1000));
    assert.throws(()=>Rules.apply(cfg,profile,s,{type:"forgo",source:"starting"},1000));
    assert.throws(()=>Rules.apply(cfg,profile,s,{type:"choose",source:"starting",id:999},1000));
    s=Rules.apply(cfg,profile,s,{type:"choose",source:s.pending.source,id:s.pending.candidates[0]},1000).state;
    s.build.actives=[{skillId:1,level:3}];s.points=2;s.pending={kind:"active",source:"borrow-test",candidates:[6,7]};
    const replaced=Rules.apply(cfg,profile,s,{type:"choose",source:"borrow-test",id:6,replaceId:1},1000).state;
    assert.deepEqual(replaced.build.actives,[{skillId:6,level:3}]);assert.equal(replaced.points,2);
    assert.ok(Rules.activePool(cfg,profile,replaced).includes(1));
    assert.throws(()=>Rules.apply(cfg,profile,replaced,{type:"choose",source:"borrow-test",id:7},1000));
    const upgraded=Rules.apply(cfg,profile,replaced,{type:"upgrade",skillId:6},1000).state;
    assert.equal(upgraded.build.actives[0].level,4);assert.equal(upgraded.points,1);
    const fight=Rules.apply(cfg,profile,upgraded,{type:"battle"},1000).state;
    assert.throws(()=>Rules.apply(cfg,profile,fight,{type:"upgrade",skillId:6},1000));
});
test("three full slots require replace; no refund or hidden spare; forgoing max-three grants no points",()=>{
    const cfg=easy(),profile=Config.profile(cfg,true);const s=Rules.start(cfg,profile,15,"fixture");
    s.phase="ready";s.build.actives=[1,2,6].map(skillId=>({skillId,level:5}));s.points=0;
    s.pending={kind:"active",source:"test",candidates:[7]};
    assert.throws(()=>Rules.apply(cfg,profile,s,{type:"choose",source:"test",id:7},1000),/替换/);
    const r=Rules.apply(cfg,profile,s,{type:"choose",source:"test",id:7,replaceId:2},1000).state;
    assert.equal(r.build.actives.length,3);assert.deepEqual(r.build.actives[1],{skillId:7,level:5});assert.equal(r.points,0);
    assert.equal(Rules.apply(cfg,profile,s,{type:"forgo",source:"test"},1000).state.points,0);
    s.build.actives=[{skillId:1,level:5}];
    assert.equal(Rules.apply(cfg,profile,s,{type:"forgo",source:"test"},1000).state.points,2);
});
test("passive multiple thresholds use updated pool, common cap and separate meditation accounting",()=>{
    const cfg=easy();cfg.rules.commonMixPercent=100;const profile=Config.profile(cfg,true);
    let s=Rules.start(cfg,profile,15,"fixture");s.phase="ready";s.pending=null;s.daoyun=110;
    s.build.actives=[{skillId:1,level:0}];
    // A legal choice completion invokes the same automatic threshold drain.
    s.pending={kind:"active",source:"test",candidates:[6]};
    s=Rules.apply(cfg,profile,s,{type:"forgo",source:"test"},1000).state;
    const selected=[];
    while(s.pending){
        assert.equal(s.pending.kind,"passive");
        assert.ok(s.pending.candidates.filter(id=>cfg.passives.find(p=>p.id===id).school==="common").length<=1);
        const id=s.pending.candidates[0];assert.ok(!selected.includes(id));selected.push(id);
        s=Rules.apply(cfg,profile,s,{type:"choose",source:s.pending.source,id},1000).state;
    }
    assert.equal(selected.length,3);assert.equal(s.daoyun,0);assert.equal(s.paidChoices,3);
    s.battles=[{},{}];s.daoyun=12;
    const m=Rules.apply(cfg,profile,s,{type:"meditate"},1000).state;
    assert.equal(m.daoyun,12);assert.equal(m.paidChoices,3);
    assert.throws(()=>Rules.apply(cfg,profile,m,{type:"meditate"},1000));
});
test("passives all-dao collected yield one common then stop; short active pool never pads",()=>{
    const cfg=easy(),profile=Config.profile(cfg,true);let s=Rules.start(cfg,profile,15,"fixture");
    s.phase="ready";s.pending={kind:"active",source:"test",candidates:[1]};
    s.build.passiveIds=cfg.passives.filter(r=>r.school!=="common").map(r=>r.id);
    s.daoyun=1000;
    s=Rules.apply(cfg,profile,s,{type:"forgo",source:"test"},1000).state;
    for(let i=0;i<4;i++) {
        assert.equal(s.pending.candidates.length,1);
        s=Rules.apply(cfg,profile,s,{type:"choose",source:s.pending.source,id:s.pending.candidates[0]},1000).state;
    }
    assert.equal(s.pending,null);assert.equal(Rules.passivePool(cfg,profile,s).length,0);
    const balance=s.daoyun;
    s=Rules.apply(cfg,profile,s,{type:"battle"},1000).state;
    s=Rules.apply(cfg,profile,s,{type:"action",action:basic},1000).state;
    assert.equal(s.daoyun,balance);assert.equal(s.pending.candidates.length,3);
    // Make the default active pool exactly the three equipped entries.
    const small=easy();small.skills.forEach(r=>r.defaultEligible=[1,2,6].includes(r.id));
    const smallProfile=Config.profile(small);let t=Rules.start(small,smallProfile,15,"small");
    t.phase="ready";t.pending=null;t.build.actives=[1,2,6].map(skillId=>({skillId,level:5}));
    t=Rules.apply(small,smallProfile,t,{type:"battle"},1000).state;
    t=Rules.apply(small,smallProfile,t,{type:"action",action:basic},1000).state;
    assert.equal(t.pending,null);assert.equal(t.points,0);
});
test("six encounters, three borrows, real battle snapshots, upgrades and restore form one replayable flow",()=>{
    const {session,store}=create();begin(session);
    const start=session.snapshot;
    for(let i=0;i<6;i++) {
        win(session);
        while(session.flow.pending) {
            const p=session.flow.pending;
            if(p.kind==="active")session.dispatch({type:"forgo",source:p.source});else choose(session);
        }
        if(session.flow.points&&session.flow.build.actives[0].level<5)
            session.dispatch({type:"upgrade",skillId:session.flow.build.actives[0].skillId});
        if(i===1){session.dispatch({type:"meditate"});choose(session);}
        const restored=create(store).session;assert.equal(restored.error,"");assert.deepEqual(restored.snapshot,session.snapshot);
    }
    assert.equal(session.flow.sources.filter(s=>s.startsWith("borrow:")).length,3);
    assert.equal(session.records[0].setup.build.actives[0].level,0);
    assert.ok(session.records.at(-1).setup.build.actives[0].level>0);
    session.dispatch({type:"finish"});assert.equal(session.flow.endReason,"complete");
    assert.deepEqual(session.flow.build,{schools:[],actives:[],passiveIds:[]});
    assert.equal(session.flow.points,0);assert.equal(start.state.build.actives.length,1);
});
test("writes, reentrancy, stale tokens, other saves and corrupt files are isolated",()=>{
    const {session,manager,store}=create();begin(session);
    const old=session.token;win(session);assert.throws(()=>session.dispatch({type:"battle"},old),/过期/);
    let before=session.snapshot;store.fail=true;assert.throws(()=>choose(session),/disk full/);
    assert.deepEqual(session.snapshot,before);store.fail=false;
    session.dispatch({type:"forgo",source:session.flow.pending.source});session.dispatch({type:"battle"});
    const p=session.preview(basic);before=session.snapshot;store.fail=true;
    assert.equal(session.confirm(basic,p.preview.token).ok,false);assert.deepEqual(session.snapshot,before);
    assert.deepEqual(manager.newState,before.state.battles.at(-1).state);store.fail=false;
    assert.ok(session.confirm(basic,p.preview.token).ok);assert.throws(()=>session.confirm(basic,p.preview.token),/当前没有/);
    const raw=store.getItem(Session.key);const bad=JSON.parse(raw);bad.state.points++;
    for(const text of ["broken",JSON.stringify({...bad,version:2}),JSON.stringify(bad)]) {
        store.map.set(Session.key,text);const loaded=create(store).session;
        assert.ok(loaded.error);assert.equal(store.getItem(Session.key),text);
        assert.throws(()=>begin(loaded));loaded.resetConfirmed();
    }
    assert.equal(store.map.get("other-app"),"keep");assert.equal(store.map.get("nowchange.stage1-battle.v1"),"keep-trial");
    assert.equal(store.map.get("nowchange.skill-expedition.current.v2"),"keep-v2");
});
test("same-run reload preserves random choices; two tabs cannot commit over newer construction",()=>{
    const {session,store}=create();session.start(easy(),Config.profile(easy()),15);
    const restored=create(store).session;assert.deepEqual(restored.flow.pending,session.flow.pending);
    assert.equal(restored.flow.randomState,session.flow.randomState);
    choose(session);assert.throws(()=>choose(restored),/其他页面/);
    assert.equal(restored.flow.phase,"starting");
});
test("configuration mismatch preserves raw save; Manager/session disagreement is rejected before writing",()=>{
    const cfg=easy(),{session,manager,store}=create();begin(session,cfg);
    const changed=copy(cfg);changed.setup.earthRules.powerPercent=130;
    const loaded=new Session(new Manager(),store,()=>1000,changed);
    assert.match(loaded.error,/配置签名/);
    assert.equal(new Session(new Manager(),store,()=>1000,cfg).error,"");
    session.dispatch({type:"battle"});
    const record=session.record,wrong=copy(record.state);wrong.player.hp--;
    manager.restoreNewRules(record.setup,wrong);
    const raw=store.getItem(Session.key),before=session.snapshot,p=manager.previewNewAction(basic);
    assert.equal(manager.confirmNewAction(basic,p.preview.token).ok,false);
    assert.equal(store.getItem(Session.key),raw);assert.deepEqual(session.snapshot,before);
    assert.throws(()=>session.dispatch({type:"action",action:basic}),/预览与确认/);
});
test("save reentrancy is rejected and CAS reads cannot bypass the final deadline check",()=>{
    let now=1000;const {session,manager,store}=create(memory(),()=>now);begin(session);
    const original=store.setItem.bind(store);
    store.setItem=(key,value)=>{
        assert.throws(()=>session.resetConfirmed(),/提交/);
        assert.throws(()=>session.dispatch({type:"battle"}),/提交/);
        original(key,value);
    };
    session.dispatch({type:"battle"});
    const preview=session.preview(basic),before=session.snapshot,raw=store.getItem(Session.key);
    const get=store.getItem.bind(store);let cross=true;
    store.getItem=k=>{const text=get(k);if(cross)now=before.deadlineAt;return text;};
    const result=session.confirm(basic,preview.preview.token);
    assert.equal(result.ok,false);assert.match(result.reason,/截止/);
    cross=false;assert.equal(store.getItem(Session.key),raw);assert.deepEqual(session.snapshot,before);
    assert.deepEqual(manager.newState,before.state.battles.at(-1).state);
    assert.equal(session.expire(),true);
});
test("new passive damage lethal stops all later effects; first-hit flags survive potion transactions",()=>{
    const {cfg,state:s}=fixture(1,0,[3,11,13]);s.earth.power=true;s.sword.previousAttack=2;s.enemy.hp=1400;
    const r=step(cfg,s,cast(1));
    assert.equal(r.state.phase,"victory");
    assert.equal(r.events.filter(e=>e.type==="damage").at(-1).part,"xianji");
    assert.equal(r.events.some(e=>e.type==="damage"&&e.part==="jieshan"),false);
    assert.equal(r.events.some(e=>e.type==="intent"),false);
});
test("short/no active candidate branches, realm filtering and non-contiguous IDs preserve eligibility",()=>{
    for(const available of [0,1,2])for(const full of [false,true]){
        const cfg=easy(),profile=Config.profile(cfg,true);let s=Rules.start(cfg,profile,15,"small");
        const eligible=[1,2,6,...[7,8].slice(0,available)];
        cfg.skills.forEach(r=>r.realm=eligible.includes(r.id)?1:2);
        s.phase="ready";s.pending=null;s.build.actives=[1,2,6].map(skillId=>({skillId,level:full?5:0}));
        s=Rules.apply(cfg,profile,s,{type:"battle"},1000).state;
        s=Rules.apply(cfg,profile,s,{type:"action",action:basic},1000).state;
        if(available)assert.equal(s.pending.candidates.length,available);
        else {assert.equal(s.pending,null);assert.equal(s.points,full?0:2);}
    }
    const cfg=easy(),remap=id=>id*17+3;
    cfg.setup.skills.forEach(s=>s.id=remap(s.id));cfg.skills.forEach(s=>s.id=remap(s.id));
    const s=Rules.start(cfg,Config.profile(cfg),7,"remap");
    assert.equal(s.pending.candidates.length,3);
    assert.ok(s.pending.candidates.every(id=>[1,2,6,7].map(remap).includes(id)));
    const chosen=Rules.apply(cfg,Config.profile(cfg),s,{type:"choose",source:s.pending.source,id:s.pending.candidates[0]},1000).state;
    assert.equal(Rules.apply(cfg,Config.profile(cfg),chosen,{type:"battle"},1000).state.battles[0].setup.build.actives[0].skillId,s.pending.candidates[0]);
});
test("successful medicine is independent of a later failed or expired main action",()=>{
    let now=1000;const cfg=config(),{session,store}=create(memory(),()=>now);
    begin(session,cfg);session.dispatch({type:"battle"});
    let p=session.preview(basic);assert.ok(session.confirm(basic,p.preview.token).ok);
    const uid=session.state.pouch[0].itemUid;p=session.preview({type:"potion",itemUid:uid});
    assert.ok(session.confirm({type:"potion",itemUid:uid},p.preview.token).ok);
    const before=session.snapshot,original=session.state;
    p=session.preview(basic);store.fail=true;assert.equal(session.confirm(basic,p.preview.token).ok,false);
    assert.deepEqual(session.snapshot,before);store.fail=false;now=before.deadlineAt;
    assert.throws(()=>session.confirm(basic,p.preview.token),/超时/);
    assert.deepEqual(session.state,original);assert.equal(session.state.pouch[0],null);
    assert.equal(create(store,()=>now).session.error,"");
});
test("deadline covers initial choices, combat and reward screens; failed timeout writes retry",()=>{
    for(const where of ["start","battle","reward"]){
        let now=1000;const {session,store}=create(memory(),()=>now);
        if(where==="start")session.start(easy(),Config.profile(easy()),15);
        else {begin(session);if(where==="battle")session.dispatch({type:"battle"});else win(session);}
        const before=session.snapshot;now=before.deadlineAt;
        store.fail=true;assert.throws(()=>session.expire(),/disk full/);assert.deepEqual(session.snapshot,before);
        store.fail=false;assert.equal(session.expire(),true);assert.equal(session.expire(),false);
        assert.equal(session.outcome,"timeout");assert.equal(session.flow.pending,null);
        assert.equal(session.flow.points,0);assert.equal(create(store,()=>now).session.error,"");
        assert.throws(()=>session.dispatch({type:"battle"}),/结束|超时/);
    }
});
console.log(`Stage2 core/build/session: ${passed} groups passed.`);
