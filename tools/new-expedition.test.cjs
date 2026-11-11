const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),build=path.resolve(process.argv.slice(2).find(a=>!a.startsWith("--"))||path.join(root,"bin/skill-battle-tests"));
global.Laya={Resource:class{},Byte:class{constructor(b){this.bytes=Buffer.from(b);this.pos=0;}
    readUTFBytes(n){const s=this.bytes.toString("utf8",this.pos,this.pos+n);this.pos+=n;return s;}}};
const load=p=>require(path.join(build,"script",p));
const ByteBuf=load("config/bright/serialization/ByteBuf.js").default,{Tables}=load("config/schema.js");
const {NewExpeditionConfigUtils:Config}=load("module/skillBattle/newRules/NewExpeditionConfigUtils.js");
const {NewExpeditionRules:R}=load("module/skillBattle/newRules/NewExpeditionRules.js");
const {NewExpeditionSession:S}=load("module/skillBattle/newRules/NewExpeditionSession.js");
const {NewBuildConfigUtils:B}=load("module/skillBattle/newRules/NewBuildConfigUtils.js");
const {NewInventoryRules:I}=load("module/skillBattle/newRules/NewInventoryRules.js");
const {SkillBattleManager:M}=load("module/skillBattle/manager/SkillBattleManager.js");
function unpack(b){if(!Buffer.isBuffer(b))b=fs.readFileSync(b);let at=4;const out={};
    for(let i=0;i<b.readInt32LE(0);i++){const len=b.readInt32LE(at);at+=4;const key=b.toString("utf8",at,at+len);at+=len;
        const size=b.readInt32LE(at);at+=4;out[key]=b.subarray(at,at+size);at+=size;}assert.equal(at,b.length);return out;}
const blocks=unpack(path.join(root,"assets/config/configbin.bin"));
const cfg=Config.read(new Tables(n=>new ByteBuf(new Uint8Array(blocks[n])))),profile=B.profile(cfg.build);
let count=0;
function test(name,fn){try{fn();count++;console.log("PASS expedition "+name);}catch(e){console.error("FAIL "+name);throw e;}}
function fixture(c=cfg,seed=1){
    let now=1000,mono=0,fail=false;const data=new Map([["other-app","keep"]]);
    const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(fail)throw Error("disk");data.set(k,v);},removeItem:k=>data.delete(k)};
    const s=new S(new M(),storage,()=>now,c,()=>mono);s.prepare(c,B.profile(c.build),seed);
    return{s,c,data,storage,setNow:v=>now=v,setMono:v=>mono=v,setFail:v=>fail=v,restore:()=>new S(new M(),storage,()=>now,c,()=>mono)};
}
function choose(f){while(f.s.flow.pending){const flow=f.s.flow,p=flow.pending;
    f.s.dispatch({type:"choose",source:p.source,id:p.candidates[0],
        ...(p.kind==="active"&&flow.build.actives.length===3?{replaceId:flow.build.actives[0].skillId}:{})});}}
function enter(f){f.s.inventoryCommand({type:"enter"});choose(f);}
function apply(s,command,c=cfg){return R.apply(c,B.profile(c.build),s,command,1100,1).state;}
function ready(seed=1,c=cfg){const f=fixture(c,seed);enter(f);return f.s.inventory;}
function ns(s,id){return s.map.edges.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[]);}
function pathTo(s,id,avoid=new Set()){const queue=[[s.node]],seen=new Set([s.node]);if(s.node===id)return[s.node];
    for(const p of queue)for(const n of ns(s,p.at(-1))){if(seen.has(n)||avoid.has(n))continue;
        const next=[...p,n];if(n===id)return next;seen.add(n);queue.push(next);}return null;}
function travel(f,node){return f.s.mapCommand({type:"travel",node});}
function act(f,action={type:"basic"}){const p=f.s.preview(action);assert.ok(p.ok,p.reason);const r=f.s.confirm(action,p.preview.token);assert.ok(r.ok,r.reason);}
function win(f){
    const node=R.node(f.c,f.s.inventory.node,f.s.inventory);
    if(node.enemy&&!f.s.inventory.map.cleared.includes(node.id)&&f.s.flow.phase!=="battle")f.s.mapCommand({type:"fight"});
    for(let i=0;f.s.flow.phase==="battle"&&i<100;i++){const b=f.s.state;if(b.player.hp<=2500&&!b.potionUsed){
        const hp=b.pouch.find(v=>v?.itemId===1);if(hp)act(f,{type:"potion",itemUid:hp.itemUid});}act(f);}
    assert.equal(f.s.inventory.phase,"active");choose(f);
}
function walk(f,id){for(const n of pathTo(f.s.inventory,id).slice(1)){travel(f,n);if(R.node(f.c,n,f.s.inventory).enemy)win(f);}}
function firstBattle(f){const n=f.s.inventory.map.nodes.find(n=>n.mainOrder>=0&&n.enemy);walk(f,n.id);return n.id;}
function unchanged(f,fn,re){const text=f.data.get(S.key),before=f.s.archive;assert.throws(fn,re);assert.equal(f.data.get(S.key),text);assert.deepEqual(f.s.archive,before);}
function sourceState(){const s=ready(),n=s.map.nodes.find(n=>n.kind==="search");s.node=n.id;s.revealed.push(n.id);R.makeSource(cfg,s,1);return s;}
function searchAll(s){while(R.source(s).revealed<R.source(s).entries.length)s=apply(s,{type:"search",deltaMs:250});return s;}
if(!process.argv.includes("--rules-only"))test("43 tables, only three changed blocks and synchronized exports",()=>{
    const before=unpack(require("node:child_process").execFileSync("git",["show","HEAD:assets/config/configbin.bin"],{cwd:root}));
    assert.equal(Object.keys(blocks).length,43);
    assert.deepEqual(Object.keys(blocks).filter(k=>!blocks[k].equals(before[k])).sort(),["new_expedition_rule","new_inventory_item","new_inventory_rule"]);
    for(const [a,b]of [["assets/config/configbin.bin","../config/configbin.bin"],["src/script/config/schema.ts","../config/output_client/code/schema.ts"]])
        assert.deepEqual(fs.readFileSync(path.join(root,a)),fs.readFileSync(path.join(root,b)));
});
else console.log("SKIP historical export-vs-HEAD check (--rules-only); no configuration exports in this change.");
test("512 random graphs: counts, connectivity, sequential borrows, eight-fight main route and boss gate",()=>{
    const graphs=new Set(),sizes=new Set(),rec=new Set(),exits=new Set();
    for(let seed=1;seed<=512;seed++){
        let s=R.start(cfg,profile,seed,"distribution");s=R.apply(cfg,profile,s,{type:"enter"},1000,seed).state;
        const nodes=s.map.nodes,kind=k=>nodes.filter(n=>n.kind===k);
        assert.ok(nodes.length>=36&&nodes.length<=44);sizes.add(nodes.length);
        for(const [k,n]of [["normal",11],["elite",3],["boss",1],["borrow",3],["insight",1]])assert.equal(kind(k).length,n);
        assert.ok(kind("transit").length>=10&&kind("transit").length<=14);assert.ok(kind("search").length>=3&&kind("search").length<=5);
        rec.add(kind("recovery").length);exits.add(kind("extract").length);
        assert.equal(new Set(nodes.map(n=>n.key)).size,nodes.length);
        assert.equal(new Set(s.map.edges.map(e=>[...e].sort((a,b)=>a-b).join(":"))).size,s.map.edges.length);
        for(const n of nodes)assert.ok(pathTo(s,n.id),`${seed}/${n.id}`);
        for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++)
            assert.ok(Math.abs((nodes[i].x-nodes[j].x)*242)>=116 || Math.abs((nodes[i].y-nodes[j].y)*128)>=116,
                `Overlapping node hit areas ${seed}/${nodes[i].id}/${nodes[j].id}`);
        const main=nodes.filter(n=>n.mainOrder>=0).sort((a,b)=>a.mainOrder-b.mainOrder);
        for(let i=1;i<main.length;i++)assert.ok(ns(s,main[i-1].id).includes(main[i].id));
        const regular=main.filter(n=>n.x<26);assert.equal(regular.filter(n=>n.kind==="normal").length,6);
        assert.equal(regular.filter(n=>n.kind==="elite").length,2);assert.equal(regular.filter(n=>n.kind==="borrow").length,3);
        assert.ok(regular.length>=20&&regular.length<=26);
        const boss=kind("boss")[0],last=nodes.find(n=>n.x===27);assert.deepEqual(ns(s,last.id),[boss.id]);
        assert.equal(pathTo(s,last.id,new Set([boss.id])),null);
        assert.ok(kind("extract").some(n=>n.id!==last.id&&pathTo(s,n.id,new Set([boss.id]))));
        assert.deepEqual([nodes[0].x,boss.x,last.x],[0,26,27]);graphs.add(JSON.stringify(s.map.edges));
    }
    assert.ok(graphs.size>400);assert.ok(sizes.size>=7);assert.deepEqual([...rec].sort(),[1,2]);assert.deepEqual([...exits].sort(),[2,3]);
});
test("512 random graphs: real 2/3/4 routes, nested forks, early joins and single-route stretches",()=>{
    const widths=new Set(),perLeg=[new Set(),new Set(),new Set()];
    let nested=0,joined=0,single=0;
    for(let seed=1;seed<=512;seed++) {
        const s=ready(seed);
        assert.equal(s.map.generatorVersion,2);
        assert.deepEqual(ready(seed).map,s.map,"Same seed keeps the complete graph deterministic");
        for(let leg=0;leg<3;leg++) {
            const from=leg*8,to=(leg+1)*8,interior=s.map.nodes.filter(n=>n.x>from&&n.x<to);
            const width=new Set(interior.map(n=>n.y)).size;
            assert.ok(width>=2&&width<=4);widths.add(width);perLeg[leg].add(width);
            const local=s.map.edges.map(e=>e.map(id=>s.map.nodes[id-1]))
                .filter(([a,b])=>a.x>=from&&a.x<=to&&b.x>=from&&b.x<=to&&a.x!==b.x);
            const xs=[...new Set([from,to,...interior.map(n=>n.x)])].sort((a,b)=>a-b);
            const cuts=xs.slice(1).map((x,i)=>(x+xs[i])/2).map(x=>
                local.filter(([a,b])=>Math.min(a.x,b.x)<x&&Math.max(a.x,b.x)>x).length);
            assert.equal(Math.max(...cuts),width,`Real edges must expose ${width} concurrent routes, seed ${seed}/${leg}`);
            assert.ok(cuts.every(n=>n>=1&&n<=4),"No disconnected stretch or hidden fifth route");
            if(cuts.includes(1))single++;
            for(const n of interior.filter(n=>n.mainOrder<0)) {
                const neighbors=ns(s,n.id).map(id=>s.map.nodes[id-1]);
                if(neighbors.filter(v=>v.x>n.x).length>=2)nested++;
                if(neighbors.filter(v=>v.x<n.x).length>=2)joined++;
            }
        }
    }
    assert.deepEqual([...widths].sort(),[2,3,4]);
    for(const widths of perLeg)assert.deepEqual([...widths].sort(),[2,3,4],"Every leg can roll all route counts");
    assert.ok(nested>50&&joined>50&&single>50,"Nested branch, intermediate join and single-path cases are exercised");
});
test("new generator replay, existing v4 graph preserved and unknown generator rejected",()=>{
    const fresh=fixture();enter(fresh);travel(fresh,2);
    assert.equal(fresh.s.inventory.map.generatorVersion,2);
    assert.deepEqual(fresh.restore().inventory,fresh.s.inventory);
    const legacy=fixture(),old=legacy.s.archive;
    old.state=R.start(old.config,old.profile,old.seed,old.runId,1);
    legacy.data.set(S.key,JSON.stringify(old));legacy.s=legacy.restore();enter(legacy);travel(legacy,2);
    assert.equal("generatorVersion" in legacy.s.inventory.map,false);
    const saved=legacy.data.get(S.key);
    assert.deepEqual(legacy.restore().inventory,legacy.s.inventory);
    assert.equal(legacy.data.get(S.key),saved,"Opening an existing v4 save never rewrites or rerolls it");
    const bad=fresh.s.archive;bad.state.map.generatorVersion=3;
    assert.throws(()=>S.validate(bad),/生成版本/);
    delete bad.state.map.generatorVersion;
    assert.throws(()=>S.validate(bad),/重放/);
});
test("viewport plus two pitches per unique arrival, never revisits, exact terminal cap",()=>{
    let s=ready();assert.equal(R.browseWidth(s,1280),1280);assert.ok(R.displayNodes(s).length<s.map.nodes.length);
    s=apply(s,{type:"travel",node:2});assert.equal(R.browseWidth(s,1280),1764);
    s=apply(s,{type:"travel",node:1});s=apply(s,{type:"travel",node:2});
    assert.equal(R.browseWidth(s,1280),1764);assert.equal(R.browseWidth(s,1560),2044);
    s.revealed=[...s.map.present];assert.equal(R.browseWidth(s,1280),112+27*242+80);
});
test("adjacent only, arrival never starts combat, uncleared enemy locks all directions and restore",()=>{
    const f=fixture();enter(f);const n=f.s.inventory.map.nodes.find(n=>n.enemy&&n.mainOrder>=0);
    unchanged(f,()=>travel(f,n.id),/不可达/);const path=pathTo(f.s.inventory,n.id);
    for(const id of path.slice(1,-1))travel(f,id);const before=f.s.inventory;travel(f,n.id);
    assert.equal(f.s.flow.phase,"ready");assert.equal(f.s.inventory.hp,before.hp);assert.equal(f.s.inventory.stamina,before.stamina-20);
    assert.deepEqual([...R.reachable(cfg,f.s.inventory)],[n.id]);
    for(const id of ns(f.s.inventory,n.id))unchanged(f,()=>travel(f,id),/不可达/);
    assert.deepEqual(f.restore().inventory,f.s.inventory);win(f);
    assert.ok(R.reachable(cfg,f.s.inventory).has(path.at(-2)));assert.ok([...R.travelPaths(cfg,f.s.inventory).values()].every(p=>p.length<=2));
});
test("independent move/fight/search costs; battle actions are free",()=>{
    const f=fixture();enter(f);travel(f,2);assert.equal(f.s.inventory.stamina,980);
    const n=f.s.inventory.map.nodes.find(n=>n.enemy&&n.mainOrder>=0);travel(f,n.id);
    const before=f.s.inventory.stamina;f.s.mapCommand({type:"fight"});assert.equal(f.s.inventory.stamina,before-10);
    win(f);assert.equal(f.s.inventory.stamina,before-10);f.s.openSource();assert.equal(f.s.inventory.stamina,before-15);
});
test("insufficient stamina keeps remainder, subtracts current HP without lowering max; can kill before action",()=>{
    let s=ready();s.stamina=8;const max=cfg.build.setup.player.maxHp;s=apply(s,{type:"travel",node:2});
    assert.equal(s.stamina,8);assert.equal(s.hp,max-Math.round(max*.1));assert.equal(cfg.build.setup.player.maxHp,max);
    let box=sourceState();box.stamina=8;box=apply(box,{type:"openSource"});assert.equal(box.stamina,3);
    box=sourceState();box.stamina=4;const hp=box.hp;box=apply(box,{type:"openSource"});box=searchAll(box);
    assert.equal(box.stamina,4);assert.equal(box.hp,hp-Math.round(max*.05));
    s=ready();s.stamina=1;s.hp=600;const original=s.revealed.slice();
    const safe=s.items.find(i=>i.location.space==="battle");safe.location={space:"safe",x:0,y:0,rotated:false};
    s=apply(s,{type:"travel",node:2});assert.equal(s.hp,0);assert.equal(s.result,"defeat");assert.equal(s.node,1);
    assert.deepEqual(s.revealed,original);assert.ok(s.returned.includes(safe.uid));assert.equal(s.stamina,1);
    box=sourceState();box.stamina=4;box.hp=300;box=apply(box,{type:"openSource"});
    assert.equal(box.result,"defeat");assert.equal(box.hp,0);assert.equal(R.source(box).opened,false);assert.equal(R.source(box).revealed,0);
});
test("no reservation on enemy arrival, insufficient fight refuses; normal/elite/boss exact fee",()=>{
    for(const [kind,cost]of [["normal",10],["elite",30],["boss",60]]){
        let s=ready();s.node=s.map.nodes.find(n=>n.kind===kind).id;s.stamina=cost-1;
        assert.throws(()=>apply(s,{type:"fight"}),/体力不足/);s.stamina=cost;s=apply(s,{type:"fight"});
        assert.equal(s.stamina,0);assert.equal(s.flow.phase,"battle");
    }
    let s=ready();const enemy=s.map.nodes.find(n=>n.enemy);s.node=ns(s,enemy.id)[0];s.stamina=20;
    s=apply(s,{type:"travel",node:enemy.id});assert.equal(s.node,enemy.id);assert.equal(s.stamina,0);
});
test("actual saved HP-cost deaths settle before movement/search and search timer never starts",()=>{
    const f=fixture(),small=f.s.inventory.items.find(i=>i.templateId===36);
    f.s.inventoryCommand({type:"move",move:{uid:small.uid,from:small.location,to:{space:"safe",x:0,y:0,rotated:false}}});
    enter(f);
    for(let i=0;i<59;i++)travel(f,f.s.inventory.node===1?2:1);
    const before=f.s.inventory;assert.equal(before.hp,600);assert.equal(before.stamina,0);
    travel(f,before.node===1?2:1);assert.equal(f.s.inventory.node,before.node);
    assert.equal(f.s.inventory.hp,0);assert.equal(f.s.inventory.result,"defeat");
    assert.ok(f.s.inventory.returned.includes(small.uid));assert.deepEqual(f.restore().inventory,f.s.inventory);
    const c=structuredClone(cfg);c.rules.searchCost=2000;c.rules.searchHpPercent=100;
    const search=fixture(c);enter(search);firstBattle(search);search.s.startSearch();
    assert.equal(search.s.inventory.result,"defeat");assert.equal(search.s.searching,false);
    assert.equal(R.source(search.s.inventory).opened,false);assert.deepEqual(search.restore().inventory,search.s.inventory);
});
test("source search paid exactly once across checkpoints, pause, reload, return, hidden and failed save",()=>{
    const f=fixture();enter(f);firstBattle(f);const before=f.s.inventory.stamina,hidden=R.source(f.s.inventory).entries[0];
    unchanged(f,()=>f.s.inventoryCommand({type:"move",move:{uid:hidden.uid,from:hidden.location,to:{space:"bag",x:1,y:0,rotated:false}}}),/不存在/);
    f.setFail(true);unchanged(f,()=>f.s.openSource(),/disk/);assert.equal(f.s.searching,false);f.setFail(false);
    f.s.openSource();assert.equal(f.s.inventory.stamina,before-5);f.setMono(375);f.s.pauseSearch();
    assert.equal(R.source(f.s.inventory).progressMs,375);const loaded=f.restore();loaded.openSource();
    assert.equal(loaded.searching,false);assert.equal(loaded.inventory.stamina,before-5);
    f.s.openSource();assert.equal(f.s.searching,false);f.s.startSearch();
    for(const t of [625,875,1125]){f.setMono(t);f.s.advanceSearch();}
    assert.equal(R.source(f.s.inventory).revealed,1);assert.equal(f.s.inventory.stamina,before-5);f.s.pauseSearch(false);
    const from=f.s.inventory.node,back=ns(f.s.inventory,from).find(id=>!R.node(cfg,id,f.s.inventory).enemy);
    travel(f,back);travel(f,from);const stamina=f.s.inventory.stamina;f.s.openSource();
    assert.equal(f.s.inventory.stamina,stamina);assert.equal(f.s.searching,false);
    assert.equal(f.s.inventory.interactionSource,from);assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("six quality durations reserve hidden source space and reveal exact UID only at completion",()=>{
    for(let q=1;q<=6;q++){
        let s=sourceState(),box=R.source(s),t=cfg.templates.find(t=>t.quality===q&&t.kind!=="weapon");
        box.entries=[{uid:`quality${q}`,templateId:t.id,durability:null,location:{space:"source",node:s.node}}];
        s.sourceLayouts=[{node:s.node,slots:[]}];I.syncSources(cfg,s);assert.equal(I.sourcePlacements(cfg,s).length,1);
        s=apply(s,{type:"openSource"});assert.equal(R.searchDuration(cfg,s),1000*q);
        let remaining=1000*q-1;while(remaining>0){const deltaMs=Math.min(250,remaining);s=apply(s,{type:"search",deltaMs});remaining-=deltaMs;}
        assert.equal(s.items.some(i=>i.uid===`quality${q}`),false);s=apply(s,{type:"search",deltaMs:1});
        assert.equal(R.source(s).revealed,1);assert.ok(s.items.some(i=>i.uid===`quality${q}`));
    }
});
test("sleep, background, failed writes never advance search",()=>{
    const f=fixture();enter(f);firstBattle(f);f.s.startSearch();const before=f.s.inventory;
    f.setMono(8000);assert.equal(f.s.advanceSearch(),false);assert.deepEqual(f.s.inventory,before);
    f.s.startSearch();f.setMono(8250);f.s.advanceSearch(false);assert.deepEqual(f.s.inventory,before);
    f.s.startSearch();f.setMono(8500);f.setFail(true);unchanged(f,()=>f.s.advanceSearch(),/disk/);assert.equal(f.s.searching,false);
});
test("three stamina potions: 200/400/600, 1/2/4 cells, full/cap and battle restrictions",()=>{
    const rows=cfg.templates.filter(t=>t.kind==="stamina");
    assert.deepEqual(rows.map(t=>t.staminaRestore),[200,400,600]);assert.deepEqual(rows.map(t=>t.width*t.height),[1,2,4]);
    for(const t of rows){
        let s=ready(),i=s.items.find(i=>i.templateId===t.id);i.location={space:"bag",x:1,y:1,rotated:false};
        assert.throws(()=>apply(s,{type:"use",uid:i.uid,from:i.location}),/体力已满/);s.stamina=100;
        s=apply(s,{type:"use",uid:i.uid,from:i.location});assert.equal(s.stamina,100+t.staminaRestore);
        assert.equal(s.items.find(v=>v.uid===i.uid).location.space,"consumed");
        s=ready();i=s.items.find(i=>i.templateId===t.id);i.location={space:"bag",x:1,y:1,rotated:false};s.stamina=999;
        s=apply(s,{type:"use",uid:i.uid,from:i.location});assert.equal(s.stamina,1000);
    }
    let s=ready(),i=s.items.find(i=>i.templateId===36);i.location={space:"bag",x:1,y:0,rotated:false};
    s.node=s.map.nodes.find(n=>n.enemy).id;s=apply(s,{type:"fight"});
    assert.throws(()=>apply(s,{type:"use",uid:i.uid,from:i.location}),/战斗/);assert.equal(cfg.templates.find(t=>t.id===36).battle,false);
});
test("only equipped plus bag count, six weight limits, exact limit accepted and excess source transfer atomic",()=>{
    let s=ready();assert.deepEqual(I.weight(cfg,s),{current:9,limit:20});
    for(let q=1;q<=6;q++)assert.equal(cfg.templates.find(t=>t.kind==="container"&&t.quality===q).weightLimit,[10,16,24,34,46,60][q-1]);
    s.items.find(i=>i.location.space==="bag").location={space:"safe",x:0,y:0,rotated:false};assert.equal(I.weight(cfg,s).current,8);
    const c=structuredClone(cfg);c.weight.base=1;
    const f=fixture(c);for(const [id,x,y]of [[36,1,0],[37,2,0]]){
        const i=f.s.inventory.items.find(i=>i.templateId===id);
        f.s.inventoryCommand({type:"move",move:{uid:i.uid,from:i.location,to:{space:"bag",x,y,rotated:false}}});
    }
    enter(f);s=f.s.inventory;assert.deepEqual(I.weight(c,s),{current:11,limit:11});
    const large=s.items.find(i=>i.templateId===38),node=s.node;
    s.map.sources.push({node,entries:[],opened:true,revealed:0,progressMs:0});s.interactionSource=node;
    large.location={space:"source",node};s.sourceLayouts.push({node,slots:[]});I.syncSources(c,s);const before=structuredClone(s);
    assert.throws(()=>apply(s,{type:"move",move:{uid:large.uid,from:large.location,to:{space:"bag",x:0,y:1,rotated:false}}},c),/负重超限/);
    assert.deepEqual(s,before);
});
function swapState(full=false){
    const s=ready();s.items=[];s.consumed=[];s.lost=[];s.returned=[];s.warehouseLayout=undefined;
    const item=(uid,id,location)=>({uid,templateId:id,location,durability:id===9?60:null});
    s.items.push(item("weapon",9,{space:"weapon"}),item("old",20,{space:"container"}));
    for(let i=0;i<14;i++)s.items.push(item(`bag-${i}`,8,{space:"bag",x:i%8,y:Math.floor(i/8),rotated:false}));
    s.map.sources=[{node:s.node,entries:[],opened:true,revealed:0,progressMs:0}];s.interactionSource=s.node;s.sourceLayouts=[{node:s.node,slots:[]}];
    s.items.push(item("new",10,{space:"source",node:s.node}));
    if(full)for(let i=0;i<388;i++)s.items.push(item(`stored-${i}`,8,{space:"source",node:s.node}));
    I.syncSources(cfg,s);I.validate(cfg,s);return s;
}
test("downgrade returns original row/column order until both limits legal, same source not ground",()=>{
    let s=swapState();const plan=I.containerPlan(cfg,s,"new");
    assert.deepEqual(plan.contents.filter(m=>m.to.space!=="bag").map(m=>m.uid),["bag-0","bag-1"]);
    assert.ok(plan.contents.filter(m=>m.to.space!=="bag").every(m=>m.to.space==="source"&&m.to.node===s.node));
    s=apply(s,plan);assert.equal(s.items.find(i=>i.uid==="old").location.space,"source");
    assert.deepEqual(I.weight(cfg,s),{current:20,limit:20});assert.equal(s.items.some(i=>i.location.space==="ground"),false);
    assert.equal(I.sourcePlacements(cfg,s).length,3);
    const wrong=I.containerPlan(cfg,swapState(),"new");wrong.contents[0].to=wrong.contents.at(-1).to;
    assert.throws(()=>apply(swapState(),wrong),/原排列/);
});
test("full or hidden-reserved source rejects entire swap, no unlimited source invented",()=>{
    const s=swapState(true),before=structuredClone(s);assert.equal(I.sourcePlacements(cfg,s).length,389);
    assert.throws(()=>I.containerPlan(cfg,s,"new"),/交互仓库空间不足/);assert.deepEqual(s,before);
    const unknown=swapState();unknown.map.sources[0].entries=Array.from({length:388},(_,i)=>({
        uid:`hidden${i}`,templateId:8,durability:null,location:{space:"source",node:s.node}}));I.syncSources(cfg,unknown);
    assert.throws(()=>I.containerPlan(cfg,unknown,"new"),/交互仓库空间不足/);
    const missing=swapState();missing.interactionSource=null;assert.throws(()=>I.containerPlan(cfg,missing,null),/交互仓库/);
});
test("there is no live ground storage, sources keep exact page/position and reject an eighth page",()=>{
    let s=sourceState();s=apply(s,{type:"openSource"});s=searchAll(s);
    const item=s.items.find(i=>i.location.space==="source"),from=structuredClone(item.location),node=s.node;
    assert.throws(()=>apply(s,{type:"move",move:{uid:item.uid,from,to:{space:"ground",node}}}),/不存在地面/);
    s=apply(s,{type:"move",move:{uid:item.uid,from,to:{space:"source",node,x:4,y:6*7+3,rotated:false}}});
    const slot=I.sourcePlacements(cfg,s).find(p=>p.uid===item.uid);
    assert.deepEqual([slot.page,slot.x,slot.y],[6,4,3]);
    const before=structuredClone(s);
    assert.throws(()=>apply(s,{type:"move",move:{uid:item.uid,from,to:{space:"source",node,x:4,y:7*7+3,rotated:false}}}),/页码/);
    assert.deepEqual(s,before);assert.equal(s.items.some(i=>i.location.space==="ground"),false);
});
test("recovery once for HP/MP only, never stamina",()=>{
    let s=ready();s.node=s.map.nodes.find(n=>n.kind==="recovery").id;assert.throws(()=>apply(s,{type:"recover"}),/已满/);
    s.hp-=1500;s.mp-=100;s.stamina=1;const hp=s.hp;s=apply(s,{type:"recover"});
    assert.equal(s.hp,hp+1200);assert.equal(s.mp,cfg.build.setup.player.maxMp);assert.equal(s.stamina,1);assert.throws(()=>apply(s,{type:"recover"}),/不可用/);
});
test("full session: fifteen fights, three borrows, unique boxes and exact replay",()=>{
    const c=structuredClone(cfg);c.build.setup.player.maxHp=1000000;c.staminaMax=c.rules.staminaMax=100000;
    const f=fixture(c);enter(f);
    for(const n of f.s.inventory.map.nodes.filter(n=>n.mainOrder>=0).sort((a,b)=>a.mainOrder-b.mainOrder)){
        if(n.id!==f.s.inventory.node)walk(f,n.id);if(n.kind==="borrow"){f.s.mapCommand({type:"borrow"});choose(f);}
    }
    for(const n of f.s.inventory.map.nodes.filter(n=>n.enemy&&!f.s.inventory.map.cleared.includes(n.id)))walk(f,n.id);
    assert.equal(f.s.inventory.map.cleared.length,15);assert.equal(f.s.inventory.map.sources.filter(b=>R.node(c,b.node,f.s.inventory).enemy).length,15);
    assert.equal(f.s.flow.sources.filter(x=>x.startsWith("borrow:")).length,3);
    assert.equal(f.s.inventory.phase,"active");assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("1200 loot seeds: unique IDs and all fourteen books/twelve containers obtainable",()=>{
    const seen=new Set();for(let seed=1;seed<=1200;seed++){
        let s=R.start(cfg,profile,seed,"loot");s=R.apply(cfg,profile,s,{type:"enter"},1000,seed).state;
        for(const n of s.map.nodes.filter(n=>n.enemy||n.kind==="search")){s.node=n.id;R.makeSource(cfg,s,seed);for(const i of R.source(s).entries)seen.add(i.templateId);}
        const ids=s.map.sources.flatMap(s=>s.entries.map(i=>i.uid));assert.equal(new Set(ids).size,ids.length);
    }for(let id=10;id<=35;id++)assert.ok(seen.has(id),`Unreachable template ${id}`);
});
test("nonboss extraction no kill minimum and no repeat settlement",()=>{
    let s=ready();s.node=s.map.nodes.find(n=>n.kind==="extract"&&n.x!==27).id;s=apply(s,{type:"extract"});
    assert.equal(s.result,"extract");assert.equal(s.returned.length,7);assert.equal(s.map.cleared.length,0);assert.throws(()=>apply(s,{type:"extract"}),/结算/);
});
test("write failure, stale revision, competing window, replay tamper preserve authoritative state",()=>{
    const f=fixture();enter(f);const loaded=f.restore(),token=f.s.token;
    f.setFail(true);unchanged(f,()=>travel(f,2),/disk/);f.setFail(false);travel(f,2);
    unchanged(f,()=>loaded.mapCommand({type:"travel",node:2}),/其他页面/);unchanged(f,()=>f.s.mapCommand({type:"travel",node:1},token),/过期/);
    for(const tamper of [s=>s.stamina++,s=>s.map.edges.pop()]){const bad=f.s.archive;tamper(bad.state);assert.throws(()=>S.validate(bad),/重放/);}
    assert.equal(f.data.get("other-app"),"keep");
});
test("old v1-v3 and changed config retain raw text; reset affects own key only",()=>{
    const f=fixture(),raw=f.data.get(S.key);for(const version of [1,2,3]){
        const old=JSON.parse(raw);old.version=version;f.data.set(S.key,JSON.stringify(old));const loaded=f.restore();
        assert.match(loaded.error,/原文保留/);assert.equal(loaded.inventory,null);assert.equal(f.data.get(S.key),JSON.stringify(old));
        loaded.resetConfirmed();assert.equal(f.data.has(S.key),false);
    }f.data.set(S.key,raw);const c=structuredClone(cfg);c.rules.moveCost++;
    assert.match(new S(new M(),f.storage,()=>1000,c).error,/配置已改变/);assert.equal(f.data.get(S.key),raw);assert.equal(f.data.get("other-app"),"keep");
});
test("warnings once, exact cutoff, save replay and no collateral key deletion",()=>{
    const f=fixture();enter(f);f.setNow(901000);f.s.expire();assert.deepEqual(f.s.inventory.map.warnings,[600000,300000]);
    assert.equal(f.s.inventory.map.warning,300000);assert.deepEqual(f.restore().inventory,f.s.inventory);
    const text=f.data.get(S.key);f.s.expire();assert.equal(f.data.get(S.key),text);f.setNow(1201000);
    assert.equal(f.s.expire(),true);assert.equal(f.s.inventory.result,"timeout");assert.equal(f.s.inventory.lost.length,7);assert.deepEqual(f.restore().inventory,f.s.inventory);
});
test("deadline during final write publishes no movement or deduction",()=>{
    const f=fixture();enter(f);let now=1200999,trigger=false;f.setNow(now);f.s.expire();
    const storage={...f.storage,getItem:k=>{const text=f.storage.getItem(k);if(trigger)now=1201000;return text;}};
    const s=new S(new M(),storage,()=>now,cfg),text=f.data.get(S.key);trigger=true;
    assert.throws(()=>s.mapCommand({type:"travel",node:2}),/截止/);assert.equal(f.data.get(S.key),text);assert.deepEqual(s.inventory,f.s.inventory);
});
console.log(`${count} stage4 groups passed.`);
