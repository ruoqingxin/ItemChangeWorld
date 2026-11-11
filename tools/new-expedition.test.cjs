const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),build=path.resolve(process.argv[2]||path.join(root,"bin/skill-battle-tests"));
global.Laya={Resource:class{},Byte:class{
    constructor(buffer){this.bytes=Buffer.from(buffer);this.pos=0;}
    readUTFBytes(n){const s=this.bytes.toString("utf8",this.pos,this.pos+n);this.pos+=n;return s;}
}};
const load=p=>require(path.join(build,"script",p));
const ByteBuf=load("config/bright/serialization/ByteBuf.js").default,{Tables}=load("config/schema.js");
const {NewExpeditionConfigUtils:Config}=load("module/skillBattle/newRules/NewExpeditionConfigUtils.js");
const {NewExpeditionRules:R}=load("module/skillBattle/newRules/NewExpeditionRules.js");
const {NewExpeditionSession:S}=load("module/skillBattle/newRules/NewExpeditionSession.js");
const {NewBuildConfigUtils:B}=load("module/skillBattle/newRules/NewBuildConfigUtils.js");
const {NewInventoryRules:I}=load("module/skillBattle/newRules/NewInventoryRules.js");
const {SkillBattleManager:M}=load("module/skillBattle/manager/SkillBattleManager.js");
function unpack(file) {
    const bytes=Buffer.isBuffer(file)?file:fs.readFileSync(file),blocks={};let at=4;
    for(let i=0;i<bytes.readInt32LE(0);i++){
        const n=bytes.readInt32LE(at);at+=4;const key=bytes.toString("utf8",at,at+n);at+=n;
        const size=bytes.readInt32LE(at);at+=4;blocks[key]=bytes.subarray(at,at+size);at+=size;
    }assert.equal(at,bytes.length);return blocks;
}
const blocks=unpack(path.join(root,"assets/config/configbin.bin"));
const tables=new Tables(n=>new ByteBuf(new Uint8Array(blocks[n]))),cfg=Config.read(tables),profile=B.profile(cfg.build);
let count=0;
function test(name,fn){fn();count++;console.log("PASS expedition "+name);}
function fixture(c=cfg,seed=1) {
    let now=1000,mono=0,fail=false;
    const data=new Map([["other-app","keep"]]);
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error("disk");data.set(k,v);},removeItem:k=>data.delete(k)};
    const s=new S(new M(),storage,()=>now,c,()=>mono);s.prepare(c,B.profile(c.build),seed);
    return{s,c,data,storage,setNow:v=>now=v,setMono:v=>mono=v,setFail:v=>fail=v,
        restore:()=>new S(new M(),storage,()=>now,c,()=>mono)};
}
function enter(f){f.s.inventoryCommand({type:"enter"});choose(f);}
function choose(f){while(f.s.flow.pending){const flow=f.s.flow,p=flow.pending;
    f.s.dispatch({type:"choose",source:p.source,id:p.candidates[0],
        ...(p.kind==="active"&&flow.build.actives.length===3?{replaceId:flow.build.actives[0].skillId}:{})});}}
function act(f,action={type:"basic"}){const p=f.s.preview(action);assert.ok(p.ok,p.reason);const r=f.s.confirm(action,p.preview.token);assert.ok(r.ok,r.reason);}
function travel(f,node){f.s.mapCommand({type:"travel",node});}
function win(f) {
    const node=R.node(f.c,f.s.inventory.node);
    if(node.enemy&&!f.s.inventory.map.cleared.includes(node.id))f.s.mapCommand({type:"fight"});
    while(f.s.flow.phase==="battle"){
    const s=f.s.state;
    if(s.player.hp<=2500&&!s.potionUsed) {
        const hp=s.pouch.find(v=>v&&v.itemId===1);if(hp)act(f,{type:"potion",itemUid:hp.itemUid});
    }act(f);
    assert.notEqual(f.s.inventory.result,"defeat","Combat fixture must survive");
}choose(f);}
function unchanged(f,fn,re){const text=f.data.get(S.key),state=f.s.archive;assert.throws(fn,re);assert.equal(f.data.get(S.key),text);assert.deepEqual(f.s.archive,state);}
test("43 generated tables, 32 node catalogue, 27 fixed nodes, 15 source-keyed encounters",()=>{
    assert.equal(Object.keys(blocks).length,43);assert.equal(cfg.nodes.length,32);assert.equal(cfg.edges.length,37);
    assert.equal(cfg.build.encounters.length,15);assert.equal(cfg.build.encounters.filter(e=>e.daoyun===10).length,11);
    assert.equal(cfg.build.encounters.filter(e=>e.daoyun===20).length,3);
    assert.deepEqual(cfg.build.encounters.find(e=>e.id==="battle:H14").enemy.intents.map(i=>[i.damage,i.block,i.charging]),
        [[0,1800,false],[1000,0,false],[2600,0,true],[1200,0,false]]);
    assert.equal(cfg.build.encounters.reduce((a,e)=>a+e.daoyun,0),200);
    assert.equal(cfg.build.encounters.filter(e=>/^battle:H/.test(e.id)&&e.id!=="battle:H14").reduce((a,e)=>a+e.daoyun,0),100);
});
test("seven added branch links widen choices without bypassing any main enemy gate",()=>{
    for(const [a,b]of [[6,19],[18,20],[19,21],[9,23],[22,24],[12,26],[25,27]])
        assert.ok(cfg.edges.some(e=>e.includes(a)&&e.includes(b)));
    for(const enemy of cfg.nodes.filter(n=>n.mainOrder>=0&&n.enemy)){
        const seen=new Set([1]),queue=[1];
        for(const at of queue)for(const [a,b]of cfg.edges){
            const next=a===at?b:b===at?a:null;
            if(next!==null&&next!==enemy.id&&!seen.has(next)){seen.add(next);queue.push(next);}
        }
        assert.equal(seen.has(enemy.id+1),false,`${enemy.key} remains a gate`);
    }
    const degree=id=>cfg.edges.filter(e=>e.includes(id)).length;
    assert.ok([6,18,19,20,21,9,22,23,24,12,25,26,27].every(id=>degree(id)>=3));
});
test("source export preserves original 34 table blocks; both package/schema copies match",()=>{
    const before=unpack(require("node:child_process").execFileSync("git",
        ["show","32917d0b1fb7843dbd1d8dd1480b22f0b3c20b06:assets/config/configbin.bin"],{cwd:root}));
    const configRoot=path.resolve(root,"../config");
    for(const key of Object.keys(before)) if(key!=="new_inventory_item")assert.deepEqual(blocks[key],before[key],key);
    assert.deepEqual(fs.readFileSync(path.join(root,"assets/config/configbin.bin")),fs.readFileSync(path.join(configRoot,"configbin.bin")));
    assert.deepEqual(fs.readFileSync(path.join(root,"src/script/config/schema.ts")),fs.readFileSync(path.join(configRoot,"output_client/code/schema.ts")));
});
test("explicit test inventory, no permanent gifts or extra ground fixtures",()=>{
    const f=fixture(),s=f.s.inventory;assert.equal(s.items.length,7);assert.equal(s.items.filter(i=>i.location.space==="battle").length,4);
    assert.equal(s.items.find(i=>i.location.space==="weapon").durability,60);assert.deepEqual(I.size(cfg,s,"bag"),[4,3]);
    assert.equal(s.items.filter(i=>i.location.space==="safe"||i.location.space==="ground").length,0);
    assert.equal(f.data.get("other-app"),"keep");
});
test("saved discovery candidates retain their format; blocked future node cannot bypass enemies",()=>{
    const f=fixture();enter(f);const s=f.s.inventory;
    assert.deepEqual(s.map.visible.filter(id=>id<=16),[1,2,3,4,5]);assert.ok(s.map.visible.includes(17));
    assert.deepEqual([...R.reachable(cfg,s)].sort((a,b)=>a-b),[1,2]);
    unchanged(f,()=>travel(f,4),/不可达/);unchanged(f,()=>f.s.inventoryCommand({type:"extract"}),/撤离点/);
    unchanged(f,()=>f.s.inventoryCommand({type:"visit",node:3}),/停用/);
    unchanged(f,()=>f.s.dispatch({type:"meditate"}),/节点/);
    travel(f,2);assert.equal(f.s.flow.phase,"ready");
    f.s.mapCommand({type:"fight"});assert.equal(f.s.flow.phase,"battle");
    unchanged(f,()=>travel(f,1),/战斗/);
});
test("arrival and combat are independent; unengaged enemy allows retreat but never passage",()=>{
    const f=fixture();enter(f);const before=f.s.inventory;
    unchanged(f,()=>f.s.mapCommand({type:"fight"}),/待战/);
    travel(f,2);
    assert.equal(f.s.inventory.node,2);assert.equal(f.s.flow.phase,"ready");
    assert.equal(f.s.inventory.map.sources.length,0);assert.equal(f.s.inventory.hp,before.hp);
    assert.deepEqual(f.s.inventory.items,before.items);
    assert.deepEqual([...R.reachable(cfg,f.s.inventory)].sort(),[1,2]);
    unchanged(f,()=>travel(f,3),/不可达/);
    assert.deepEqual(R.travelPaths(cfg,f.s.inventory).get(1),[2,1]);
    const loaded=f.restore();assert.equal(loaded.error,"");assert.equal(loaded.inventory.node,2);
    assert.equal(loaded.flow.phase,"ready");
    travel(f,1);travel(f,2);f.s.mapCommand({type:"fight"});
    assert.equal(f.s.flow.phase,"battle");
    unchanged(f,()=>f.s.mapCommand({type:"fight"}),/战斗/);
    unchanged(f,()=>travel(f,1),/战斗/);
});
test("display shows every generated node without changing discovery, saves or travel permissions",()=>{
    const f=fixture();enter(f);
    const saved=f.data.get(S.key),before=f.s.archive;
    const present=[...f.s.inventory.map.present];
    assert.deepEqual(R.displayNodes(f.s.inventory),present);
    assert.equal(f.data.get(S.key),saved);assert.deepEqual(f.s.archive,before);
    unchanged(f,()=>travel(f,16),/不可达/);
    travel(f,2);
    assert.deepEqual(R.displayNodes(f.s.inventory),present);
    assert.equal(R.reachable(cfg,f.s.inventory).has(3),false,"Full-map display does not bypass an unengaged enemy");
    travel(f,1);
    assert.deepEqual(R.displayNodes(f.s.inventory),present,"Retreat retains the full map");
    assert.deepEqual(R.displayNodes(f.restore().inventory),present,"Existing saves display all generated nodes too");
    const fixtureState=JSON.parse(JSON.stringify(f.s.inventory));
    fixtureState.map.visible=[1];fixtureState.revealed=[1];
    const displayed=R.displayNodes(fixtureState);
    assert.deepEqual(displayed,present,"Presentation is independent of saved discovery candidates");
    displayed.pop();
    assert.deepEqual(fixtureState.map.present,present,"The display list must not alias authoritative state");
    for(let seed=1;seed<=6;seed++) {
        const next=fixture(cfg,seed);enter(next);
        const state=next.s.inventory,shown=R.displayNodes(state);
        assert.deepEqual(shown,state.map.present,"Each run shows exactly its own generated map");
        for(const node of cfg.nodes.filter(n=>!state.map.present.includes(n.id)))
            assert.equal(shown.includes(node.id),false,"Do not show ungenerated random nodes");
    }
});
test("arriving at a reward or source never automatically claims or searches it",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);travel(f,3);win(f);
    const rewards=f.s.flow.sources;
    travel(f,4);assert.equal(f.s.flow.pending,null);assert.deepEqual(f.s.flow.sources,rewards);
    assert.equal(f.s.inventory.map.used.includes(4),false);
    travel(f,17);
    assert.equal(R.source(f.s.inventory).opened,false);assert.equal(f.s.searching,false);
    assert.equal(R.source(f.s.inventory).revealed,0);
    const entries=R.source(f.s.inventory).entries;
    travel(f,4);f.s.mapCommand({type:"borrow"});choose(f);
    travel(f,17);assert.deepEqual(R.source(f.s.inventory).entries,entries);
    assert.equal(f.s.searching,false);
    for(const path of R.travelPaths(cfg,f.s.inventory).values()) {
        assert.equal(path[0],17);
        for(let i=1;i<path.length;i++)assert.ok(f.s.inventory.map.edges.some(e=>e.includes(path[i-1])&&e.includes(path[i])));
    }
    assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("explicit fight retains write failure, concurrent revision and deadline guarantees",()=>{
    const f=fixture();enter(f);travel(f,2);const other=f.restore(),old=f.s.token;
    f.setFail(true);unchanged(f,()=>f.s.mapCommand({type:"fight"}),/disk/);
    f.setFail(false);f.s.mapCommand({type:"fight"});
    unchanged(f,()=>other.mapCommand({type:"fight"}),/其他页面/);
    unchanged(f,()=>f.s.mapCommand({type:"fight"},old),/过期/);
    const deadline=fixture();enter(deadline);travel(deadline,2);
    deadline.setNow(deadline.s.inventory.deadlineAt);
    assert.throws(()=>deadline.s.mapCommand({type:"fight"}),/截止|结算/);
    assert.equal(deadline.s.inventory.result,"timeout");
    assert.equal(deadline.s.inventory.map.cleared.length,0);
});
test("victory atomically creates one hidden box, persists daoyun and actual durability",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);
    const s=f.s.inventory;assert.deepEqual(s.map.cleared,[2]);assert.equal(s.flow.daoyun,10);
    assert.equal(s.map.sources.length,1);assert.equal(s.map.sources[0].revealed,0);assert.equal(s.items.length,7);
    assert.equal(s.items.find(i=>i.location.space==="weapon").durability,56);
    assert.deepEqual(f.restore().inventory,s);assert.equal(f.restore().searching,false);
    travel(f,1);travel(f,2);assert.equal(f.s.map?.sources,undefined);assert.equal(f.s.inventory.map.sources.length,1);
});
test("normal-quality 1000ms, 250ms checkpoints, pause/reload requires explicit resume",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);f.s.startSearch();
    f.setMono(249);assert.equal(f.s.advanceSearch(),false);
    f.setMono(250);assert.equal(f.s.advanceSearch(),true);assert.equal(R.source(f.s.inventory).progressMs,250);
    f.setMono(375);f.s.pauseSearch();assert.equal(R.source(f.s.inventory).progressMs,375);
    const loaded=f.restore();assert.equal(loaded.searching,false);assert.equal(loaded.advanceSearch(),false);
    f.s.startSearch();
    for(const t of [625,875,1125]){f.setMono(t);f.s.advanceSearch();}
    assert.equal(R.source(f.s.inventory).revealed,1);assert.equal(f.s.inventory.items.length,8);
    assert.equal(new Set(f.s.inventory.items.map(i=>i.uid)).size,8);
    const item=f.s.inventory.items.find(i=>i.location.space==="ground"),t=I.template(cfg,item);
    if(t.width===1&&t.height===1) f.s.inventoryCommand({type:"move",move:{uid:item.uid,from:item.location,to:{space:"bag",x:1,y:0,rotated:false}}});
    assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("first source opening starts search once; reopening and reload retain paused progress",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);
    assert.equal(R.source(f.s.inventory).opened,false);
    f.s.openSource();assert.equal(f.s.searching,true);assert.equal(R.source(f.s.inventory).opened,true);
    const firstRevision=f.s.token.revision;
    f.s.openSource();assert.equal(f.s.token.revision,firstRevision);
    f.setMono(375);f.s.pauseSearch();assert.equal(R.source(f.s.inventory).progressMs,375);
    f.s.openSource();assert.equal(f.s.searching,false);assert.equal(R.source(f.s.inventory).progressMs,375);
    const loaded=f.restore();loaded.openSource();assert.equal(loaded.searching,false);
    assert.deepEqual(loaded.inventory,f.s.inventory);
    travel(f,1);travel(f,2);f.s.openSource();assert.equal(f.s.searching,false);
    f.s.startSearch();assert.equal(f.s.searching,true);assert.equal(R.source(f.s.inventory).progressMs,375);
    for(const version of [1,2]) {
        const old=JSON.parse(f.data.get(S.key));old.version=version;
        assert.throws(()=>S.validate(old),/版本/);
    }
});
test("six qualities require increasing 1-6 second searches and reveal each exact instance only at completion",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);
    for(let quality=1;quality<=6;quality++){
        let s=f.s.inventory,box=R.source(s);
        const t=cfg.templates.find(t=>t.quality===quality);
        assert.ok(t,`Quality ${quality} exists`);
        const item={...box.entries[0],uid:`quality-${quality}`,templateId:t.id,durability:null};
        box.entries=[item];box.opened=true;box.revealed=0;box.progressMs=0;
        assert.equal(R.searchDuration(cfg,s),1000*quality);
        let remaining=1000*quality-1;
        while(remaining>0){
            const deltaMs=Math.min(250,remaining);s=R.apply(cfg,profile,s,{type:"search",deltaMs},1100,1).state;
            remaining-=deltaMs;
        }
        assert.equal(R.source(s).revealed,0);assert.equal(s.items.some(i=>i.uid===item.uid),false);
        s=R.apply(cfg,profile,s,{type:"search",deltaMs:1},1101,1).state;
        assert.equal(R.source(s).revealed,1);assert.equal(R.source(s).progressMs,0);
        assert.deepEqual(s.items.find(i=>i.uid===item.uid),item);
        assert.throws(()=>R.apply(cfg,profile,s,{type:"search",deltaMs:1},1102,1),/进度/);
    }
});
test("opening failure, stale tokens, hidden items and deadline retain authoritative source state",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);
    const hidden=R.source(f.s.inventory).entries[0];
    unchanged(f,()=>f.s.inventoryCommand({type:"move",move:{uid:hidden.uid,from:hidden.location,to:{space:"bag",x:1,y:0,rotated:false}}}),/不存在/);
    f.setFail(true);unchanged(f,()=>f.s.openSource(),/disk/);assert.equal(f.s.searching,false);
    f.setFail(false);const stale=f.s.token;f.s.openSource();
    unchanged(f,()=>f.s.mapCommand({type:"search",deltaMs:250},stale),/过期/);
    f.setNow(f.s.inventory.deadlineAt);assert.throws(()=>f.s.openSource(),/不能打开/);
    assert.equal(f.s.inventory.result,"timeout");
});
test("hidden/pause/sleep never search offline; failed write publishes no reveal",()=>{
    const f=fixture();enter(f);travel(f,2);win(f);f.s.startSearch();f.setMono(8000);
    assert.equal(f.s.advanceSearch(),false);assert.equal(R.source(f.s.inventory).progressMs,0);
    f.s.startSearch();f.setMono(8250);f.s.advanceSearch(false);assert.equal(R.source(f.s.inventory).progressMs,0);
    f.s.startSearch();f.setMono(8500);f.setFail(true);
    unchanged(f,()=>f.s.advanceSearch(),/disk/);assert.equal(f.s.searching,false);
});
test("all six exit sets, both recovery counts and both RA parents are generated and stable",()=>{
    const sets=new Set(),counts=new Set(),parents=new Set();
    for(let seed=1;seed<=400;seed++) {
        let s=R.start(cfg,profile,seed,"distribution");
        s=R.apply(cfg,profile,s,{type:"enter"},1000,seed).state;
        sets.add(s.map.present.filter(i=>i>=30).join(","));counts.add(s.map.present.filter(i=>i===28||i===29).length);
        parents.add(s.map.edges.find(e=>e.includes(28)).find(i=>i!==28));
        assert.equal(s.map.edges.filter(e=>e.includes(16)).length,1);
        assert.deepEqual(s.map.edges.find(e=>e.includes(16)),[15,16]);
    }
    assert.equal(sets.size,6);assert.deepEqual([...counts].sort(),[1,2]);assert.deepEqual([...parents].sort(),[7,9]);
});
test("recovery truncates gaps, rounds hundredths, consumes once and not at full",()=>{
    const f=fixture();enter(f);
    let s=f.s.inventory;s.node=28;s.revealed.push(28);s.flow.pending=null;s.flow.phase="ready";
    assert.throws(()=>R.apply(cfg,profile,s,{type:"recover"},1100,1),/已满/);
    s.hp-=1500;s.mp-=100;
    const after=R.apply(cfg,profile,s,{type:"recover"},1100,1).state;
    assert.equal(after.hp,s.hp+1200);assert.equal(after.mp,cfg.build.setup.player.maxMp);
    assert.throws(()=>R.apply(cfg,profile,after,{type:"recover"},1101,1),/不可用/);
    const c=structuredClone(cfg);c.build.setup.player.maxHp=6003;c.build.setup.player.maxMp=3003;
    s.hp=1;s.mp=1;assert.deepEqual(R.recovery(c,s),{hp:1201,mp:601});
});
test("all 14 specific books and 12 containers have legal probabilities, durability ranges and unique loot IDs",()=>{
    const seen=new Set();
    for(let seed=1;seed<=4000;seed++) {
        const s=R.start(cfg,profile,seed,"loot");
        for(const node of [2,6,15,17,19,24,27]) {
            s.node=node;R.makeSource(cfg,s,seed);
            const box=R.source(s);assert.ok(box.entries.length>=1&&box.entries.length<=4);
            assert.equal(new Set(box.entries.map(i=>i.uid)).size,box.entries.length);
            for(const item of box.entries) {
                seen.add(item.templateId);const t=I.template(cfg,item);
                if(t.kind==="weapon") {
                    const n=R.node(cfg,node),p=cfg.pools.find(p=>p.id===(n.pool==="deep"?"risk":n.pool));
                    assert.ok(item.durability>=p.durability[0]&&item.durability<=p.durability[1]);
                }
            }
            if(node===17)assert.deepEqual(box.entries.slice(0,2).map(i=>i.templateId),[1,2]);
        }
    }
    for(let id=10;id<=35;id++)assert.ok(seen.has(id),`Unreachable template ${id}`);
});
test("two-battle early extraction has no eight-battle minimum and settles once",()=>{
    let f;for(let seed=1;seed<100;seed++){f=fixture(cfg,seed);enter(f);if(f.s.inventory.map.present.includes(30))break;}
    travel(f,2);win(f);travel(f,3);win(f);travel(f,4);travel(f,30);
    const token=f.s.token;f.s.inventoryCommand({type:"extract"},token);
    assert.equal(f.s.inventory.result,"extract");assert.equal(f.s.inventory.returned.length,7-f.s.inventory.consumed.length);
    assert.equal(f.s.flow.phase,"ended");unchanged(f,()=>f.s.inventoryCommand({type:"extract"},token),/过期/);
    assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("full-map transaction fixture gives three unique borrows, one insight, fifteen unique boxes and no auto-extract",()=>{
    const c=structuredClone(cfg);c.build.setup.player.maxHp=1000000;
    const f=fixture(c);enter(f);
    const move=node=>{travel(f,node);if(R.node(c,node).enemy&&!f.s.inventory.map.cleared.includes(node))win(f);};
    for(let node=2;node<=16;node++) {
        move(node);
        if([4,9,14].includes(node)){f.s.mapCommand({type:"borrow"});choose(f);}
        if(node===6)for(const b of [18,19,20,21]){move(b);if(b===21){f.s.mapCommand({type:"insight"});choose(f);}}
        if(node===9)for(const b of [22,23,24,10,9])move(b);
        if(node===12)for(const b of [25,26,27,13,12])move(b);
    }
    assert.equal(f.s.inventory.map.cleared.length,15);assert.equal(f.s.inventory.map.sources.filter(b=>R.node(c,b.node).enemy).length,15);
    assert.equal(f.s.flow.sources.filter(x=>x.startsWith("borrow:")).length,3);
    assert.ok(f.s.flow.sources.includes("insight:W01"));assert.equal(f.s.inventory.phase,"active");
    assert.equal(new Set(f.s.flow.sources).size,f.s.flow.sources.length);
    assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("source-keyed loot independent of box generation order and map preview",()=>{
    const a=R.start(cfg,profile,123,"same"),b=structuredClone(a);
    a.node=2;R.makeSource(cfg,a,123);a.node=6;R.makeSource(cfg,a,123);
    b.node=6;R.makeSource(cfg,b,123);b.node=2;R.makeSource(cfg,b,123);
    for(const id of [2,6])assert.deepEqual(a.map.sources.find(s=>s.node===id),b.map.sources.find(s=>s.node===id));
});
test("write failure, replay tamper and competing windows preserve authoritative save",()=>{
    const f=fixture();enter(f);const loaded=f.restore(),token=f.s.token;
    travel(f,2);unchanged(f,()=>loaded.mapCommand({type:"travel",node:2}),/其他页面/);
    unchanged(f,()=>f.s.dispatch({type:"upgrade",skillId:1},token),/过期/);
    const bad=structuredClone(f.s.archive);bad.state.map.cleared.push(2);
    assert.throws(()=>S.validate(bad),/重放/);f.s.mapCommand({type:"fight"});f.setFail(true);
    unchanged(f,()=>act(f),/disk|提交/);
    assert.equal(f.data.get("other-app"),"keep");
});
test("warning catch-up emits tightest threshold, survives reload and exact cutoff wins",()=>{
    const f=fixture();enter(f);f.setNow(901000);f.s.expire();
    assert.deepEqual(f.s.inventory.map.warnings,[600000,300000]);assert.equal(f.s.inventory.map.warning,300000);
    assert.deepEqual(f.restore().inventory,f.s.inventory);const text=f.data.get(S.key);
    f.s.expire();assert.equal(f.data.get(S.key),text);
    f.setNow(1201000);assert.equal(f.s.expire(),true);assert.equal(f.s.inventory.result,"timeout");
    assert.equal(f.s.inventory.returned.length,0);assert.equal(f.s.inventory.lost.length,7);
    assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("deadline crossed during final write does not publish move or victory",()=>{
    const f=fixture();enter(f);travel(f,2);f.s.mapCommand({type:"fight"});
    f.setNow(1200999);f.s.expire();
    let now=1200999,trigger=false;
    const storage={...f.storage,getItem:k=>{const text=f.storage.getItem(k);if(trigger)now=1201000;return text;}};
    const s=new S(new M(),storage,()=>now,cfg,()=>0);
    const before=f.data.get(S.key);
    const p=s.preview({type:"basic"});assert.ok(p.ok);
    trigger=true;const result=s.confirm({type:"basic"},p.preview.token);
    assert.equal(result.ok,false);assert.match(result.reason,/截止/);
    assert.equal(f.data.get(S.key),before);
});
console.log(`${count} stage4 groups passed.`);
