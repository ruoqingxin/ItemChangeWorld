const assert = require("node:assert/strict");
const {load} = require("./config-fixture.cjs");
const {QingmingRules:R} = load("module/skillBattle/utils/QingmingRules.js");
const {QingmingConfig:C} = load("module/skillBattle/utils/QingmingConfig.js");
const {WeaponTrialRules:W} = load("module/skillBattle/utils/WeaponTrialRules.js");
const {EquipmentTrialRules:G} = load("module/skillBattle/utils/EquipmentTrialRules.js");
const {GuzongEnemyRules:E} = load("module/skillBattle/utils/GuzongEnemyRules.js");
const {WeaponTrialConfig:T} = load("module/manualTest/utils/WeaponTrialConfig.js");
let groups=0;
function test(name,fn){fn();groups++;console.log("PASS 全装 "+name);}
function start(armor="iron",accessory="pulse",patch={}){
    const d=T.defaults();
    return R.start({...d,battles:1,enemyId:"patrol",...patch,
        armorTrial:armor?{base:2,quality:6,passive:armor}:undefined,
        accessoryTrial:accessory?{base:1,quality:6,passive:accessory}:undefined,
        enemy:{hp:10000,mp:120,attack:20,defense:0,...patch.enemy},
        weaponTrial:{base:1,quality:6,passive:"thunder",...patch.weaponTrial}});
}
function act(s,move,extra={}){
    const before=structuredClone(s),r=R.resolve(s,{move,...extra});
    assert.deepEqual(s,before);assert.ok(r.ok,r.reason);R.validateState(r.state);return r.state;
}
function gift(s,...keys){
    for(const k of keys){s.acquired.push(k);if(C.items[k].type==="core")s.core=k;
        else if(C.items[k].slot)s.mutations[C.items[k].slot]=k;else s.passives.push(k);}
}
test("全部24底材、六品质和24独立被动池；副属性重复且独立流不改敌阵",()=>{
    assert.equal(new Set([...Object.keys(W.names),...Object.keys(G.names)]).size,24);
    for(const slot of ["armor","accessory"])for(let base=1;base<=6;base++)for(let quality=1;quality<=6;quality++){
        const seen=new Set();
        for(let seed=1;seed<=120;seed++){
            const roll=G.roll(slot,{base,quality},seed);
            assert.deepEqual(roll,G.roll(slot,{base,quality},seed));seen.add(roll.passive);
            assert.equal(roll.main.attribute,G.bases[slot][base-1].attribute);
            for(const [stat,table] of [[roll.main,W.main],[roll.secondary,W.secondary]]){
                assert.ok(stat.band>=W.windows[quality-1][0]&&stat.band<=W.windows[quality-1][1]);
                const [lo,hi]=table[stat.attribute][stat.band-1];assert.ok(stat.value>=lo&&stat.value<=hi);
            }
        }
        assert.equal(seen.size,8);
    }
    const d=C.defaults(),a=R.start(d),b=R.start(T.defaults());
    assert.deepEqual(a.enemyPlan,b.enemyPlan);assert.equal(a.rng,b.rng);
    assert.throws(()=>G.roll("armor",{base:1,quality:6,passive:"frugal"},1));
});
test("全套属性逐件合并、零耐久减半，战斗锁定和各部位品质损耗",()=>{
    for(const [enemyId,costs] of [["patrol",[2,2,1]],["gatekeeper",[3,3,2]],["tortoise",[5,5,3]]]){
        let s=start("nourish","return",{enemyId,enemy:{hp:1}});
        const all=[s.weapon,s.armor,s.accessory],stats={hp:0,mp:0,attack:0,defense:0};
        for(const e of all)for(const k of Object.keys(stats))stats[k]+=e.applied[k];
        assert.equal(s.player.maxHp,s.setup.player.hp+stats.hp);
        assert.equal(s.player.maxMp,s.setup.player.mp+stats.mp);
        assert.equal(s.player.attack,s.setup.player.attack+stats.attack);
        assert.equal(s.player.defense,s.setup.player.defense+stats.defense);
        all.forEach(e=>e.durability=1);
        const initial=structuredClone(s.player);s=act(s,"basic");
        assert.equal(s.reports.length,1);assert.equal(s.player.maxHp,initial.maxHp);
        for(const [i,e] of [s.weapon,s.armor,s.accessory].entries()){
            assert.equal(e.durability,0);
            assert.equal(s.reports[0][["weapon","armor","accessory"][i]].durability,0);
        }
        let full=start("iron","pulse",{enemyId,enemy:{hp:1}});
        const before=[full.weapon,full.armor,full.accessory].map(e=>e.durability);full=act(full,"basic");
        [full.weapon,full.armor,full.accessory].forEach((e,i)=>assert.equal(e.durability,before[i]-costs[i]));
    }
    const d=T.defaults();d.armorTrial.broken=true;d.accessoryTrial.broken=true;
    const s=R.start(d),keys={1:"hp",2:"mp",3:"defense",4:"attack"};
    for(const e of [s.armor,s.accessory]){
        const values={hp:0,mp:0,attack:0,defense:0};
        for(const stat of [e.roll.main,e.roll.secondary])values[keys[stat.attribute]]+=stat.value;
        for(const k of Object.keys(values))assert.equal(e.applied[k],Math.round(values[k]/2));
    }
});
test("铁衣持续至指定敌阶段末，固守不叠加，守危即时判定且不增加产盾基数",()=>{
    let s=start("iron");const p=s.armor.roll,base=s.player.defense;
    assert.equal(G.armor(s),base+p.benefit);const power=G.shieldPower(s);
    for(let i=0;i<p.threshold;i++)s=act(s,"end");
    assert.equal(G.armor(s),base);assert.equal(G.shieldPower(s),power);
    s=start("fortify",null,{enemy:{attack:100}});const a=s.player.defense;
    const taken=Math.max(0,W.armorDamage(100,a+s.armor.roll.benefit,true)-Math.round(G.shieldPower(s)*T.tuning.guard));
    s=act(s,"guard");assert.equal(s.totals.taken,taken);assert.equal(G.armor(s),a);
    s=start("danger");const b=s.player.defense;s.player.hp=Math.floor(s.player.maxHp*.35);
    assert.equal(G.armor(s),b+s.armor.roll.benefit);s=act(s,"heal");assert.equal(G.armor(s),b);
});
test("回甲仅每回合首次基础防御触发，护体在实际扣血后生成",()=>{
    let s=start("reguard"),b=s.armor.roll.benefit;s=act(s,"guard");s=act(s,"guard");
    assert.equal(s.totals.events.equipmentShield,b*2);
    s=act(s,"end");s=act(s,"guard");assert.equal(s.totals.events.equipmentShield,b*3);
    s=start("ward");const hp=s.player.hp;s=act(s,"end");
    assert.ok(s.player.hp<hp);assert.equal(s.totals.events.equipmentShield,s.armor.roll.benefit);
    assert.equal(s.armor.used,true);
    s=start("ward");s.player.shield=G.shieldCap(s);s=act(s,"end");assert.equal(s.armor.used,false);
    s=start("ward",null,{enemyId:"breaker"});
    s=act(s,"end");
    assert.equal(s.totals.events.enemyShatter||0,0,"新护体盾不被刚完成的震盾攻击再削减");
});
test("反震每敌阶段一次、不过量不递归，致死不反震或复活",()=>{
    let s=start("reflect"),d=s.armor.roll.benefit;s=act(s,"end");
    assert.equal(s.totals.events.equipmentReflect,1);assert.equal(s.totals.events.equipmentDamage,d);
    assert.equal(s.totals.events.weaponAttacks||0,0);s=act(s,"end");assert.equal(s.totals.events.equipmentReflect,1);
    s=act(s,"end");assert.equal(s.totals.events.equipmentReflect,2);
    s=start("reflect");s.player.hp=1;s=act(s,"end");
    assert.equal(s.phase,"defeat");assert.equal(s.totals.events.equipmentReflect||0,0);
    s=start("reflect");s.enemy.hp=1;s=act(s,"end");
    assert.equal(s.phase,"complete");assert.equal(s.reports.length,1);
    assert.equal(s.totals.events.equipmentDamage,1);
});
test("续命实际受伤后排队至下回合，单场一次，失败不能补活",()=>{
    let s=start("revive");s.player.hp=Math.floor(s.player.maxHp*.35)+5;
    s=act(s,"end");assert.equal(s.armor.used,true);assert.equal(s.armor.pendingHeal,0);
    assert.equal(s.totals.events.equipmentHeal,s.armor.roll.benefit);
    s=act(s,"end");assert.equal(s.totals.events.equipmentHeal,s.armor.roll.benefit);
    s=start("revive");s.player.hp=1;s=act(s,"end");assert.equal(s.player.hp,0);
    assert.equal(s.totals.events.equipmentHeal||0,0);
});
test("养元归灵先恢复再封战报，跨战不补满、不重抽",()=>{
    let s=start("nourish","return",{battles:12,enemyId:null,enemy:{hp:1}});
    s.player.hp-=100;s.player.mp-=20;
    const hp=s.player.hp,mp=s.player.mp,roll=structuredClone([s.armor.roll,s.accessory.roll]);
    s=act(s,"basic");assert.equal(s.player.hp,hp+s.armor.roll.benefit);
    assert.equal(s.player.mp,mp+s.accessory.roll.benefit);
    assert.equal(s.reports[0].endHp,s.player.hp);assert.equal(s.reports[0].endMp,s.player.mp);
    if(s.phase==="reward")s=act(s,"choose",{choice:s.offers[0]});
    const end=structuredClone(s.player);s=act(s,"next");
    assert.equal(s.player.hp,end.hp);assert.equal(s.player.mp,end.mp);
    assert.deepEqual([s.armor.roll,s.accessory.roll],roll);
});
test("灵息按指定回合触发三次，静虑按结束次数而非剩余AP计数",()=>{
    let s=start(null,"pulse",{enemy:{attack:0}});s.player.mp=0;
    const p=s.accessory.roll;
    for(let i=1;i<=p.threshold*4;i++)s=act(s,"end");
    assert.equal(s.totals.events.equipmentMana,p.benefit*3);
    s=start(null,"calm",{enemy:{attack:0}});s.player.mp=0;
    for(let i=0;i<5;i++)s=act(s,"end");
    assert.equal(s.accessory.calmUses,3);assert.equal(s.totals.events.equipmentMana,s.accessory.roll.benefit*3);
});
test("节用先付得起再返，不超过实际支付，凝雷按返还后净值",()=>{
    let s=start(null,"frugal");const cost=C.cost("wind",s),refund=Math.min(cost,s.accessory.roll.benefit);
    s.weapon.charge=0;s=act(s,"wind");assert.equal(s.weapon.charge,cost-refund);
    assert.equal(s.totals.events.equipmentRefund,refund);s=act(s,"wind");
    assert.equal(s.weapon.charge,(cost-refund)*2);assert.equal(s.totals.events.equipmentRefund,refund*2);
    s=start(null,"frugal");s.player.mp=cost-1;
    const bad=R.resolve(s,{move:"wind"});assert.equal(bad.ok,false);assert.equal(bad.state,s);
});
test("合律跨回合计三种主动，重复不计且触发清空，药引只增强药物",()=>{
    let s=start(null,"harmony",{enemy:{attack:0}});s.player.mp-=15;
    s=act(s,"edge");s=act(s,"wind");s=act(s,"guide");
    assert.equal(s.totals.events.equipmentHarmony,1);
    assert.equal(s.totals.events.equipmentMana,s.accessory.roll.benefit);
    assert.equal(s.accessory.forms.length,0);
    s=act(s,"edge");s=act(s,"edge");s=act(s,"wind");
    assert.equal(s.totals.events.equipmentHarmony,1);s=act(s,"guide");
    assert.equal(s.totals.events.equipmentHarmony,2);
    s=start(null,"harmony");s=act(s,"basic");s=act(s,"guard");s=act(s,"edge");
    assert.equal(s.totals.events.equipmentHarmony||0,0);
    s=start(null,"medicine",{enemy:{attack:0}});s.player.hp=1;
    const expected=Math.round(s.player.maxHp*.3*(1+s.accessory.roll.benefit/100));s=act(s,"heal");
    assert.equal(s.player.hp,1+expected);assert.equal(s.ap,1);assert.equal(s.round,2);
    assert.equal(s.totals.actions,1);
});
test("启明作用全部攻击派生并按阶段消退，定心允许盾挡但不允许扣血",()=>{
    let s=start(null,"dawn",{enemy:{attack:0}});
    assert.equal(G.attack(s),s.player.attack+s.accessory.roll.benefit);
    const d=G.attack(s);s=act(s,"basic");assert.equal(s.totals.damage,d);
    while(s.round<=s.accessory.roll.threshold)s=act(s,"end");
    assert.equal(G.attack(s),s.player.attack);
    s=start(null,"steady",{enemy:{attack:1}});s.player.mp-=10;s.player.shield=G.shieldCap(s);
    s=act(s,"end");assert.equal(s.totals.events.equipmentMana,s.accessory.roll.benefit);
    const gain=s.totals.events.equipmentMana;s=act(s,"end");assert.equal(s.totals.events.equipmentMana,gain);
    s=start(null,"steady");s.player.mp-=10;s=act(s,"end");assert.equal(s.totals.events.equipmentMana||0,0);
});
test("试调技能倍率、费用、组合盾基数与正式默认隔离",()=>{
    let s=start(null,null,{weaponTrial:{passive:"leech"}});s=act(s,"edge");
    assert.equal(s.totals.damage,Math.round(s.player.attack*T.tuning.edge));assert.equal(s.totals.mpSpent,T.tuning.costs.edge);
    s=start(null,null,{enemy:{attack:0}});const n=act(s,"wind");
    assert.equal(n.player.shield,Math.floor(Math.round(G.shieldPower(s)*T.tuning.wind)/2));
    assert.equal(C.cost("edge",R.start(C.defaults())),4);
    assert.equal(R.start(C.defaults()).setup.combatTrial,undefined);
    s=start(null,null);const guided=act(s,"guide");
    assert.equal(guided.totals.damage,Math.round(s.player.attack*T.tuning.guide+s.player.maxMp*T.tuning.guideMp));
});
test("单行动双方各执行一次，用药与跳过占回合，战间用药不触发敌人",()=>{
    let s=start(null,null),round=s.round,hp=s.player.hp;
    s=act(s,"basic");assert.equal(s.round,round+1);assert.equal(s.ap,1);
    assert.equal(s.totals.events.enemyActions,1);assert.equal(s.totals.actions,1);assert.ok(s.player.hp<hp);
    s.player.hp-=20;round=s.round;s=act(s,"heal");
    assert.equal(s.round,round+1);assert.equal(s.totals.events.enemyActions,2);assert.equal(s.totals.actions,2);
    s=act(s,"end");assert.equal(s.totals.actions,3);assert.equal(s.totals.events.enemyActions,3);
    assert.equal(R.resolve(s,{move:"guide",enemyAction:2}).ok,false);
    s=start(null,null,{battles:12,enemyId:null,enemy:{hp:1}});s=act(s,"basic");
    if(s.phase==="reward")s=act(s,"choose",{choice:s.offers[0]});
    s.player.hp-=30;round=s.round;const actions=s.totals.actions;
    s=act(s,"heal");assert.equal(s.round,round);assert.equal(s.totals.actions,actions);
    assert.equal(s.phase,"between");
    for(let i=0;i<T.presets.length;i++){const d=T.defaults();T.apply(d,i);
        assert.equal(R.start(d).ap,1);assert.equal(R.start(d).intentions.length,1);}
    assert.equal(R.start(C.defaults()).ap,3);
});
test("十五敌人单行动轮换保留蓄雷、有限治疗、破盾、暴露、拆阵与读招",()=>{
    for(const id of Object.keys(E.enemies)){
        let s=start(null,null,{enemyId:id,player:{hp:10000,mp:1000,attack:18,defense:6}});
        for(let i=0;i<10;i++){
            assert.equal(s.intentions.length,1);const count=s.totals.events.enemyActions||0;
            s=act(s,"end");assert.equal(s.totals.events.enemyActions,count+1);
        }
    }
    let s=start(null,null,{enemyId:"thunder"});
    s=act(s,"end");assert.equal(s.intentions[0].kind,"charge");
    s=act(s,"end");assert.equal(s.enemy.charged,true);assert.equal(s.intentions[0].percent,220);
    s=act(s,"end");assert.equal(s.enemy.charged,false);
    s=start(null,null,{enemyId:"arrayMaster"});s=act(s,"end");assert.equal(s.foe.formation,true);
    s=act(s,"basic");assert.equal(s.totals.events.enemyArrayBreak,1);assert.equal(s.totals.events.enemyBonus||0,0);
    s=start(null,null,{enemyId:"arrayMaster"});s=act(act(s,"end"),"end");
    assert.equal(s.totals.events.enemyBonus,1);assert.equal(s.foe.formation,false);
    s=start(null,null,{enemyId:"echo"});s=act(act(s,"edge"),"edge");assert.equal(s.totals.events.enemyEcho,1);
    s=act(s,"basic");s=act(s,"edge");assert.equal(s.totals.events.enemyEcho,1);
    s=start(null,null,{enemyId:"swordsman"});s=act(act(s,"edge"),"edge");assert.equal(s.totals.events.enemyRead,1);
    s=start(null,null,{enemyId:"gatekeeper",enemy:{defense:8}});s=act(s,"end");s=act(s,"fall");
    assert.equal(s.totals.events.enemyBreak,1);assert.equal(s.totals.events.enemyBonus||0,0);
    s=start(null,null,{enemyId:"bloodBlade"});s=act(s,"end");assert.equal(s.foe.vulnerable,true);
    const before=s.totals.damage;s=act(s,"basic");
    assert.equal(s.totals.damage-before,Math.round(s.player.attack*1.2));
});
test("余盾可供下一回合碎盾，守势增强保留；剑伤跨三回合衰减",()=>{
    let s=start(null,null,{enemy:{attack:0}});gift(s,"shieldFall");
    s=act(s,"wind");assert.ok(s.player.shield>0);
    const shield=s.player.shield,damage=s.totals.damage;s=act(s,"fall");
    assert.equal(s.totals.damage-damage,Math.round(s.player.attack*T.tuning.fall+shield*1.25));
    s=start(null,null,{enemy:{attack:0}});gift(s,"retention");s=act(s,"wind");
    assert.equal(s.player.shield,Math.round(G.shieldPower(s)*T.tuning.wind));
    s=start(null,null,{enemy:{attack:10}});gift(s,"retention","turnTables");
    s=act(s,"wind");s=act(s,"guard");s=act(s,"end");
    assert.equal(s.totals.events.turnTables,1);assert.equal(s.totals.events.counter,1);
    s=start(null,null,{enemy:{attack:0}});gift(s,"wound");
    s=act(s,"basic");assert.equal(s.wounds,1);s=act(s,"basic");assert.equal(s.wounds,2);
    s=act(s,"basic");assert.equal(s.wounds,2);assert.equal(s.totals.events.woundTick,3);
});
test("全套极端属性与全部敌人混合行动，预览纯净且状态有界",()=>{
    let attempts=0;const errors=new Set();
    for(const base of [[11,4,1],[5,3,3],[1,4,4],[9,6,2]])for(const enemyId of
        ["patrol","stone","thunder","apothecary","bloodBlade","echo","shade","gatekeeper","alchemist","swordsman","breaker","arrayMaster","tortoise","swordmaster","swordSpirit"]){
        const d=T.defaults();d.enemyId=enemyId;d.battles=1;d.seed=417;
        [d.weaponTrial,d.armorTrial,d.accessoryTrial].forEach((v,i)=>{v.base=base[i];v.quality=6;});
        let s=R.start(d);
        // 仅在测试构造合法属性上界，确认极端专精不会溢出或改变血蓝继承规则。
        for(const e of [s.weapon,s.armor,s.accessory]){
            e.roll.main.band=6;e.roll.main.value=W.main[e.roll.main.attribute][5][1];
            e.roll.secondary={attribute:e.roll.main.attribute,band:6,value:W.secondary[e.roll.main.attribute][5][1]};
        }
        W.beginFight(s);G.beginFight(s);s.player.hp=s.player.maxHp;s.player.mp=s.player.maxMp;
        R.validateState(s);let rng=731;
        for(let i=0;i<100&&s.phase==="fighting";i++){
            rng=rng*16807%2147483647;
            const move=["basic","guard","edge","wind","guide","fall","end","heal","mana"][rng%9];
            const before=structuredClone(s),result=R.resolve(s,{move,enemyAction:1});
            assert.deepEqual(s,before);attempts++;
            if(result.ok)s=result.state;else errors.add(result.reason);
            R.validateState(s);
        }
    }
    assert.ok(attempts>1000);assert.ok(!errors.has("状态边界异常"));console.log(`全套极端混合输入 ${attempts}次`);
});
console.log(`全装备演练：${groups}组通过`);
