const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const build = process.argv[2];
global.Laya = { Resource: class {}, Byte: class {
    constructor(buffer) { this.bytes = Buffer.from(buffer); this.pos = 0; }
    readUTFBytes(n) { const s = this.bytes.toString("utf8", this.pos, this.pos + n); this.pos += n; return s; }
} };
const load = file => require(path.join(build, `script/${file}.js`));
const { BattleRules: Core } = load("module/skillBattle/utils/BattleRules");
const { BattleConfigUtils: Config } = load("module/skillBattle/utils/BattleConfigUtils");
const { BattleTrialManager: Session } = load("module/skillBattle/manager/BattleTrialManager");
const { SkillBattleManager: Manager } = load("module/skillBattle/manager/SkillBattleManager");
const { Tables } = load("config/schema");
const ByteBuf = load("config/bright/serialization/ByteBuf").default;
const pack = fs.readFileSync(path.join(__dirname, "../assets/config/configbin.bin"));
let offset = 0;
const uint = () => { const n = pack.readUInt32LE(offset); offset += 4; return n; };
const count = uint(), buffers = new Map();
for (let i = 0; i < count; i++) {
    const length = uint(), name = pack.toString("utf8", offset, offset + length); offset += length;
    const size = uint(); buffers.set(name, pack.subarray(offset, offset + size)); offset += size;
}
assert.equal(offset, pack.length);
const tables = new Tables(name => new ByteBuf(new Uint8Array(buffers.get(name))));
const copy = value => structuredClone(value);
const setup = (options = {}) => Config.read(tables, { ...Config.defaults(), ...options });
const state = cfg => Core.start(cfg, "fixture");
const cast = id => ({ type: "skill", skillId: id });
const basic = { type: "basic" }, guard = { type: "guard" };
function step(cfg, s, action) {
    const before = copy(s), c = copy(cfg);
    const result = Core.resolve(cfg, s, action);
    assert.ok(result.ok, result.reason);
    assert.deepEqual(s, before); assert.deepEqual(cfg, c);
    assert.deepEqual(result, Core.resolve(cfg, s, action));
    return result;
}
function reject(cfg, s, action) {
    const before = copy(s), result = Core.resolve(cfg, s, action);
    assert.equal(result.ok, false); assert.ok(result.reason);
    assert.deepEqual(s, before); assert.deepEqual(result.state, before);
    assert.deepEqual(result.events, []);
}
let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`OK new: ${name}`); }
    catch (error) { console.error(`FAIL new: ${name}`); throw error; }
}
const skills = ids => ids.map(skillId => ({ skillId, level: 0 }));
const allPassives = [1, 2, 3, 4, 5, 6];
const quiet = cfg => { cfg.enemy.maxHp = 1000000; cfg.enemy.intents = [{ id: 1, name: "观察", damage: 0, block: 0, charging: false }]; return cfg; };

test("generated approved values, repeated intent references and integer formatting", () => {
    assert.equal(count, Tables.getTableNames().length);
    const cfg = setup();
    assert.deepEqual(cfg.enemy.intents.map(i => i.id), [1, 1, 2]);
    assert.deepEqual(Core.attributes(cfg, state(cfg)), { attack: 1400, defense: 800 });
    assert.deepEqual(cfg.skills.map(s => s.mpCost), [200, 400, 500, 500, 200]);
    assert.equal(cfg.passives.length, 6); assert.equal(cfg.potions.length, 2);
    for (const [n, text] of [[0,"0"],[1000,"10"],[725,"7.25"],[1050,"10.5"]])
        assert.equal(Core.format(n), text);
    assert.equal(Core.scale(630, 100, 115), 725);
    assert.throws(() => Core.scale(Number.MAX_SAFE_INTEGER, 100000000), /安全范围/);
});
test("hand-calibrated armed and unarmed basic battles", () => {
    for (const [weapon, rounds, hp] of [["full",4,2200],["none",6,200]]) {
        const cfg = setup({ weapon }); let s = state(cfg);
        while (s.phase === "player_input") s = step(cfg, s, basic).state;
        assert.equal(s.phase, "victory"); assert.equal(s.mainActions, rounds); assert.equal(s.player.hp, hp);
    }
});
test("zero MP, zero durability and no weapon retain free universal actions", () => {
    for (const weapon of ["full","zero","none"]) for (const action of [basic,guard]) {
        const cfg = setup({ weapon, sword:false }), s = state(cfg); s.player.mp = 0;
        const r = step(cfg, s, action);
        assert.equal(r.state.player.mp, 0); assert.equal(r.preview.mpCost, 0);
        assert.equal(r.state.sword.momentum, 0);
        assert.equal(r.preview.body, action.type === "basic" ? {full:1400,zero:1200,none:1000}[weapon] : 0);
        assert.equal(r.preview.shield, action.type === "guard" ? {full:1200,zero:1050,none:900}[weapon] : 0);
    }
});
test("durability 1 to 0 uses the original attributes for the entire action", () => {
    const cfg = quiet(setup()), s = state(cfg); s.weapon.durability = 1;
    const first = step(cfg, s, guard);
    assert.equal(first.preview.shield, 1200); assert.equal(first.state.weapon.durability, 0);
    const next = step(cfg, first.state, guard);
    assert.equal(next.preview.shield, 1050); assert.equal(next.preview.durabilityCost, 0);
});
test("unborrowed skills, insufficient MP and terminal actions reject without mutation", () => {
    const cfg = setup(), s = state(cfg);
    reject(cfg, s, cast(3)); s.player.mp = 0; reject(cfg, s, cast(1));
    reject(cfg, s, {type:"use_item"}); reject(cfg, s, null);
    s.enemy.hp = 1;
    const final = step(cfg, s, basic);
    reject(cfg, final.state, guard);
    assert.equal(final.events.filter(e => e.type === "intent").length, 0);
    assert.equal(Core.resolve(cfg, undefined, basic).ok, false);
});
const expected = {
    1: { body:[1120,1232,1344,1456,1568,1680] },
    2: { body:[1400,1540,1540,1680,1680,1820], shred:[840,840,966,966,1092,1218] },
    3: { body:[1260,1386,1386,1512,1512,1638], shield:[800,800,920,920,1040,1160] },
    4: { body:[630,630,725,725,819,914], mark:[560,616,616,672,672,728] },
};
for (let id = 1; id <= 5; id++) for (let level = 0; level <= 5; level++)
    test(`skill ${id} at +${level} matches the approved independent effect values`, () => {
        const cfg = quiet(setup({actives:[{skillId:id,level}],passiveIds:[]})), s = state(cfg);
        s.enemy.block = 5000;
        const r = step(cfg, s, cast(id));
        assert.equal(r.preview.mpCost, cfg.skills.find(s => s.id === id).mpCost);
        assert.equal(r.state.player.mp, 3000 - r.preview.mpCost);
        assert.equal(r.preview.durabilityCost, 1);
        for (const [effect, values] of Object.entries(expected[id] || {})) assert.equal(r.preview[effect], values[level]);
        if (id === 5) {
            assert.equal(r.state.sword.momentum, level < 3 ? 2 : 3);
            assert.equal(r.preview.momentumGain, level < 3 ? 2 : 3);
            assert.equal(r.preview.keenEnhancement, [100,110,120,120,130,140][level]);
            assert.equal(r.state.sword.enhancement, [100,110,120,120,130,140][level]);
        }
    });
test("zero momentum does not gate sword skills; only sword borrowing enables momentum", () => {
    const cfg = setup(), r = step(cfg, state(cfg), cast(1));
    assert.equal(r.preview.body, 1120); assert.equal(r.preview.keen, 0);
    const noSword = setup({sword:false}); assert.deepEqual(noSword.build.actives, []);
    assert.equal(step(noSword, state(noSword), basic).state.sword.momentum, 0);
    const other = quiet(setup({actives:skills([2]),passiveIds:[]}));
    other.build.schools.push("fixture-other");
    other.skills.find(row => row.id === 2).school = "fixture-other";
    const ready = state(other); ready.sword.momentum = 3; ready.sword.keen = true;
    const otherHit = step(other,ready,cast(2));
    assert.equal(otherHit.preview.keen,0);
    assert.equal(otherHit.state.sword.keen,true);
});
test("Chuzhao, Xifeng and one keen token obey the cap and persist first-use history", () => {
    const cfg = quiet(setup({passiveIds:[1,2]})); let s = state(cfg);
    s = step(cfg, s, basic).state; assert.equal(s.sword.momentum, 2);
    s = step(cfg, s, guard).state; assert.equal(s.sword.keen, true);
    s = step(cfg, s, basic).state; assert.equal(s.sword.momentum, 3);
    const cash = step(cfg, s, cast(1));
    assert.equal(cash.preview.keen, 500); assert.equal(cash.state.sword.momentum, 0);
    assert.equal(cash.state.sword.xifeng, true);
    s = step(cfg, cash.state, basic).state; assert.equal(s.sword.momentum, 2);
    assert.equal(s.sword.xifeng, false); assert.equal(s.sword.firstBasicUsed, true);
    s = step(cfg, s, basic).state; assert.equal(s.sword.momentum, 3);
});
test("Ningfeng enhancement waits for the same cycle and is not multiplied by the cashing skill", () => {
    for (let level = 0; level <= 5; level++) {
        const cfg = quiet(setup({actives:[{skillId:5,level},{skillId:1,level:5}],passiveIds:[]}));
        let s = step(cfg, state(cfg), cast(5)).state;
        if (s.sword.momentum < 3) s = step(cfg, s, guard).state;
        reject(cfg, s, cast(5));
        const r = step(cfg, s, cast(1));
        assert.equal(r.preview.keen, [500,550,600,600,650,700][level]);
        assert.equal(r.preview.body,1680); assert.equal(r.state.sword.enhancement,100);
    }
    const cfg = quiet(setup({actives:[{skillId:5,level:2}],passiveIds:[]}));
    let s = step(cfg, state(cfg), cast(5)).state;
    cfg.build.actives[0].level = 0;
    s = step(cfg,s,cast(5)).state; assert.equal(s.sword.enhancement,120);
});
test("DIFENG uses different borrowed attack names; basic, guard and Ningfeng break continuity", () => {
    const cfg = quiet(setup({actives:skills([1,2,5]),passiveIds:[3]}));
    const first = step(cfg, state(cfg), cast(1));
    assert.equal(step(cfg, first.state, cast(2)).preview.difeng,200);
    assert.equal(step(cfg, first.state, cast(1)).preview.difeng,0);
    for (const between of [basic,guard,cast(5)]) {
        const mid = step(cfg,first.state,between);
        assert.equal(step(cfg,mid.state,cast(2)).preview.difeng,0);
    }
});
test("potions share one opportunity, preserve shields/marks/intent/continuity and stale tokens", () => {
    const cfg = quiet(setup({actives:skills([1,2,4]),passiveIds:[3]})), s = state(cfg);
    s.player.hp -= 100; s.player.mp -= 1000;
    s.pouch = [{itemUid:"hp",itemId:1},{itemUid:"mp",itemId:2},null,null,null];
    s.enemy.block = 1000; s.player.block = 300; s.sword.mark = {damage:560,ticks:2};
    s.sword.previousAttack = 1;
    const p = step(cfg,s,{type:"potion",itemUid:"hp"});
    assert.equal(p.preview.recovery,100); assert.equal(p.state.revision,1);
    assert.equal(p.state.round,1); assert.equal(p.state.mainActions,0);
    assert.equal(p.state.enemy.block,1000); assert.equal(p.state.player.block,300);
    assert.deepEqual(p.state.sword,s.sword); assert.equal(p.state.weapon.durability,60);
    reject(cfg,p.state,{type:"potion",itemUid:"mp"});
    assert.equal(step(cfg,p.state,cast(2)).preview.difeng,200);
    const manager = new Manager(); manager.restoreNewRules(cfg,s);
    const old = manager.previewNewAction(cast(1)).preview.token;
    const potion = manager.previewNewAction({type:"potion",itemUid:"hp"});
    assert.equal(manager.confirmNewAction({type:"potion",itemUid:"hp"},potion.preview.token).ok,true);
    assert.equal(manager.confirmNewAction(cast(1),old).ok,false);
    const full = state(cfg); full.pouch[0] = {itemUid:"hp",itemId:1};
    reject(cfg,full,{type:"potion",itemUid:"hp"});
});
test("old enemy shield expires after the player, new shield absorbs the first mark tick", () => {
    const cfg = setup({enemyId:2,actives:skills([4]),passiveIds:[]}), s = state(cfg);
    const r = step(cfg,s,cast(4));
    assert.equal(r.preview.body,630); assert.equal(r.preview.mark,560);
    assert.equal(r.state.enemy.hp,5370); assert.equal(r.state.enemy.block,440);
    assert.deepEqual(r.state.sword.mark,{damage:560,ticks:1});
    r.state.player.hp -= 100; r.state.pouch[0]={itemUid:"h",itemId:1};
    const p = step(cfg,r.state,{type:"potion",itemUid:"h"});
    assert.equal(p.state.enemy.block,440); assert.equal(p.state.sword.mark.ticks,1);
    const next = step(cfg,p.state,guard);
    assert.equal(next.state.enemy.block,0); assert.equal(next.state.enemy.hp,4810);
    assert.equal(next.state.sword.mark,null);
});
test("refreshing a mark stores current cast values and replaces remaining ticks", () => {
    const cfg = quiet(setup({actives:skills([4]),passiveIds:[]})), s = state(cfg);
    let r=step(cfg,s,cast(4)); assert.equal(r.state.sword.mark.damage,560);
    cfg.build.actives[0].level=5; r=step(cfg,r.state,cast(4));
    assert.deepEqual(r.state.sword.mark,{damage:728,ticks:1});
    cfg.build.actives[0].level=0;
    const last=step(cfg,r.state,guard);
    assert.equal(last.events.find(e=>e.type==="damage"&&e.part==="mark").amount,728);
});
test("Bengjia triggers once only from shred, body or keen, not passive/mark/expiry", () => {
    const cfg=quiet(setup({actives:skills([1,2,4]),passiveIds:allPassives}));
    for(const [action,block] of [[cast(2),800],[cast(1),1000],[cast(1),1300]]) {
        const s=state(cfg); s.enemy.block=block; s.sword.momentum=3; s.sword.keen=true;
        const r=step(cfg,s,action);
        assert.equal(r.events.filter(e=>e.type==="passive"&&e.name==="崩甲").length,1);
        assert.equal(r.preview.shield,800,"Bengjia and Lianmang each grant 4 shield");
    }
    const s=state(cfg); s.enemy.block=1200; s.sword.previousAttack=2;
    const r=step(cfg,s,cast(1));
    assert.equal(r.preview.difeng,200);
    assert.equal(r.events.filter(e=>e.type==="passive"&&e.name==="崩甲").length,0);
    const expiry=state(cfg); expiry.enemy.block=500;
    assert.equal(step(cfg,expiry,guard).events.filter(e=>e.type==="passive"&&e.name==="崩甲").length,0);
    cfg.enemy.intents[0].block=300;
    assert.equal(step(cfg,state(cfg),cast(4)).events.filter(e=>e.type==="passive"&&e.name==="崩甲").length,0);
});
test("Guanxi reads the explicit charging tag and does not interrupt the published attack", () => {
    const cfg=setup({passiveIds:[6]}), s=state(cfg); s.enemy.intentIndex=2;
    const r=step(cfg,s,cast(1)); assert.equal(r.preview.guanxi,200);
    assert.equal(r.preview.playerHpLoss,1800); assert.equal(r.state.player.hp,4200);
    cfg.enemy.intents[2].charging=false;
    assert.equal(step(cfg,s,cast(1)).preview.guanxi,0);
});
test("lethal body, keen, passive and mark each truncate subsequent events", () => {
    for(const [hp,part] of [[100,"body"],[1200,"keen"],[1800,"difeng"],[2000,"guanxi"]]) {
        const cfg=quiet(setup({actives:skills([1,2]),passiveIds:[3,5,6]})), s=state(cfg);
        s.enemy.hp=hp; s.sword.momentum=3;s.sword.keen=true;s.sword.previousAttack=2;
        cfg.enemy.intents[0].charging=true;
        const r=step(cfg,s,cast(1));
        const damage=r.events.filter(e=>e.type==="damage");
        assert.equal(damage[damage.length-1].part,part);
        assert.equal(r.state.phase,"victory");assert.equal(r.state.player.mp,2800);
        assert.equal(r.state.weapon.durability,59);
        assert.equal(r.events.filter(e=>e.type==="intent").length,0);
        assert.equal(r.state.sword.mark,null);assert.equal(r.state.sword.momentum,0);
    }
    const cfg=quiet(setup({actives:skills([4]),passiveIds:[]})), s=state(cfg);s.enemy.hp=1000;
    assert.equal(step(cfg,s,cast(4)).state.phase,"victory");
    cfg.enemy.intents[0].damage=100; s.player.hp=100;
    const dead=step(cfg,s,cast(4));
    assert.equal(dead.state.phase,"defeat");assert.equal(dead.events.some(e=>e.type==="damage"&&e.part==="mark"),false);
});
test("safe state validation rejects impossible HP, revisions, weapons and duplicate potion identities", () => {
    const cfg=setup(), original=state(cfg);
    for(const mutate of [
        s=>s.player.hp=-1,s=>s.player.mp=3001,s=>s.round=0,s=>s.revision=2,
        s=>s.sword.keen=true,s=>s.weapon.attack++,s=>s.pouch=[null],
        s=>s.pouch=[{itemUid:"same",itemId:1},{itemUid:"same",itemId:1},null,null,null],
    ]) {const s=copy(original);mutate(s);reject(cfg,s,basic);}
});
function create(store, clock) {
    const manager=new Manager(), session=new Session(manager,store,clock);
    return {manager,session};
}
function memory() {
    const map=new Map([["nowchange.skill-expedition.current.v2","preserved"],["other-app","keep"]]);
    return {map,fail:false,writes:0,
        getItem(k){return map.has(k)?map.get(k):null;},
        setItem(k,v){if(this.fail)throw new Error("disk full");map.set(k,v);this.writes++;},
        removeItem(k){if(this.fail)throw new Error("disk full");map.delete(k);}};
}
const submit=(session,action)=>session.confirm(action,session.preview(action).preview.token);
test("session restores exact state, separates potion revisions from rounds and protects other saves", () => {
    let now=1000;const store=memory(), {session}=create(store,()=>now);
    session.start(setup());
    submit(session,cast(1));submit(session,{type:"potion",itemUid:session.state.pouch[0].itemUid});
    assert.equal(session.state.round,2);assert.equal(session.state.revision,2);assert.equal(session.state.potionUsed,true);
    const restored=create(store,()=>now).session;
    assert.equal(restored.error,"");assert.deepEqual(restored.snapshot,session.snapshot);
    assert.equal(restored.state.potionUsed,true);assert.deepEqual(restored.manager.newState,restored.state);
    assert.equal(store.map.get("nowchange.skill-expedition.current.v2"),"preserved");
    assert.equal(store.map.get("other-app"),"keep");
});
test("save failure, duplicate tokens and reentrant confirmation never partially charge", () => {
    const store=memory(),{session,manager}=create(store,()=>1000);session.start(setup());
    const action=cast(1),p=session.preview(action), before=session.snapshot, raw=store.getItem(Session.key);
    store.fail=true;
    assert.equal(session.confirm(action,p.preview.token).ok,false);
    assert.deepEqual(session.snapshot,before);assert.deepEqual(manager.newState,before.battles[0].state);
    assert.equal(store.getItem(Session.key),raw);store.fail=false;
    assert.equal(session.confirm(action,p.preview.token).ok,true);
    assert.equal(session.confirm(action,p.preview.token).ok,false);
    const single=new Manager(),cfg=setup();single.startNewRules(cfg,"lock");
    single.beforeNewCommit=()=>assert.equal(single.confirmNewAction(basic,{battleId:"lock",revision:0}).ok,false);
    assert.equal(single.confirmNewAction(basic,{battleId:"lock",revision:0}).ok,true);
    const own=single.newState;own.player.hp=1;assert.notEqual(single.newState.player.hp,1);
});
test("a saved potion survives failed main action and exact-deadline timeout", () => {
    let now=1000;const store=memory(),{session}=create(store,()=>now);session.start(setup());
    submit(session,cast(1));
    const uid=session.state.pouch[2].itemUid;submit(session,{type:"potion",itemUid:uid});
    const before=session.snapshot;
    store.fail=true;const p=session.preview(basic);assert.equal(session.confirm(basic,p.preview.token).ok,false);
    store.fail=false;assert.deepEqual(session.snapshot,before);
    now=session.snapshot.deadlineAt;
    assert.throws(()=>session.confirm(basic,p.preview.token),/超时/);
    assert.equal(session.outcome,"timeout");assert.equal(session.state.pouch[2],null);
    assert.equal(session.state.player.mp,3000);assert.equal(session.state.potionUsed,true);
    assert.equal(create(store,()=>now).session.outcome,"timeout");
});
test("deadline checked again after replay validation; timeout persistence failure is retryable", () => {
    let now=1000;const store=memory(),{session}=create(store,()=>now);session.start(setup());
    const p=session.preview(basic), before=session.snapshot;now=before.deadlineAt;
    store.fail=true;assert.throws(()=>session.expire(),/disk full/);assert.deepEqual(session.snapshot,before);
    store.fail=false;assert.equal(session.expire(),true);assert.equal(session.expire(),false);
    assert.throws(()=>session.confirm(basic,p.preview.token),/超时/);
    const boundaryStore=memory();let advancing=false,reads=0,deadline=0;
    const boundary=create(boundaryStore,()=>advancing && ++reads>=4 ? deadline : 1000).session;
    boundary.start(setup());deadline=boundary.snapshot.deadlineAt;
    const preview=boundary.preview(basic),original=boundary.snapshot,raw=boundaryStore.getItem(Session.key);
    advancing=true;
    const late=boundary.confirm(basic,preview.preview.token);
    assert.equal(late.ok,false);assert.match(late.reason,/截止/);
    assert.deepEqual(boundary.snapshot,original);assert.deepEqual(boundary.manager.newState,original.battles[0].state);
    assert.equal(boundaryStore.getItem(Session.key),raw);
});
test("victory can continue with actual HP/MP/durability/pouch and reset temporary effects", () => {
    let now=1000;const store=memory(),{session}=create(store,()=>now);session.start(setup());
    submit(session,cast(1));while(session.outcome==="active")submit(session,basic);
    assert.equal(session.outcome,"victory");const before=session.state;
    now++;session.continueBattle();
    assert.equal(session.state.player.hp,before.player.hp);assert.equal(session.state.player.mp,before.player.mp);
    assert.deepEqual(session.state.weapon,before.weapon);assert.deepEqual(session.state.pouch,before.pouch);
    assert.equal(session.state.sword.momentum,0);assert.equal(session.state.sword.firstBasicUsed,false);
    assert.equal(session.snapshot.battles.length,2);
    assert.equal(create(store,()=>now).session.error,"");
    const historical=copy(session.snapshot.battles[0]);
    const external=session.snapshot;external.battles[0].setup.build.actives[0].level=5;
    assert.deepEqual(session.snapshot.battles[0],historical);
});
test("malformed or tampered saves are retained and cannot be silently overwritten", () => {
    const store=memory(),c=create(store,()=>1000);c.session.start(setup());submit(c.session,basic);
    const valid=store.getItem(Session.key);
    const cases=["invalid",JSON.stringify({...JSON.parse(valid),version:2})];
    const bad=JSON.parse(valid);bad.battles[0].state.player.mp--;cases.push(JSON.stringify(bad));
    const badInitial=JSON.parse(valid);badInitial.battles[0].initial.sword.momentum=1;cases.push(JSON.stringify(badInitial));
    for(const text of cases) {
        store.map.set(Session.key,text);
        const restored=create(store,()=>1000).session;
        assert.ok(restored.error);assert.throws(()=>restored.start(setup()));assert.equal(store.getItem(Session.key),text);
        restored.resetConfirmed();assert.equal(store.getItem(Session.key),null);
    }
    assert.equal(store.map.get("nowchange.skill-expedition.current.v2"),"preserved");
});
test("two tabs cannot overwrite each other's newer revision", () => {
    const store=memory(),a=create(store,()=>1000).session;a.start(setup());
    const b=create(store,()=>1000).session, p=b.preview(basic);submit(a,basic);
    assert.equal(b.confirm(basic,p.preview.token).ok,false);
    assert.equal(b.state.revision,0);assert.equal(a.state.revision,1);
});
console.log(`New battle core/session: ${passed} groups passed (all five skills at six strengths included).`);
