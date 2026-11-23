const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {load,root}=require("./config-fixture.cjs");
const {QingmingRules:R}=load("module/skillBattle/utils/QingmingRules.js");
const {QingmingConfig:C}=load("module/skillBattle/utils/QingmingConfig.js");
const {WeaponTrialConfig:T}=load("module/manualTest/utils/WeaponTrialConfig.js");
const {WeaponTrialRules:W}=load("module/skillBattle/utils/WeaponTrialRules.js");
const {EquipmentTrialRules:G}=load("module/skillBattle/utils/EquipmentTrialRules.js");
const {GuzongEnemyRules:E}=load("module/skillBattle/utils/GuzongEnemyRules.js");
const out=path.join(root,"bin/equipment-trial/single-action");
const styles=[
    {name:"均衡",bases:[1,2,1],priority:["tempo","cycle","breathing","swordcraft","wound","storedEdge"]},
    {name:"进攻",bases:[4,4,4],priority:["swordcraft","flyingEdge","swordUnity","salvo","swordSiphon","tempo"]},
    {name:"守御",bases:[5,3,3],priority:["riposte","breakingWave","retention","turnTables","storedEdge","shieldFall"]},
    {name:"灵力",bases:[9,6,2],priority:["wound","rupture","endlessWound","breathing","bloodMana","dye"]},
    {name:"堆血",bases:[11,4,6],priority:["delayedFall","stillness","retention","riposte","breathing"]},
    {name:"蓄势",bases:[12,5,5],priority:["storedEdge","heavyEdge","meditation","tempo","cycle","delayedFall"]},
];
function choose(s,policy="balanced"){
    const slim={...s,logs:[],reports:[],rewards:[]},power=G.attack(s),scale=power/100,defensive=policy!=="burst";
    const candidates=["basic","guard","edge","wind","fall","end"].map(move=>({move}));
    for(let enemyAction=1;enemyAction<=s.intentions.length;enemyAction++)candidates.push({move:"guide",enemyAction});
    const score=(n,action,remaining=s.ap)=>{
        const ended=n.round>s.round||n.phase!=="fighting";
        const extra=((n.flying-s.flying)*40+(n.wounds-s.wounds)*18+
            (n.momentum-s.momentum)*22+(n.forms.length-s.forms.length)*20)*scale;
        const shield=ended&&!s.setup.singleAction?0:Math.min(n.player.shield-s.player.shield,s.enemy.attack*2);
        const suppression=(n.suppression.reduce((a,b)=>a+b,0)-s.suppression.reduce((a,b)=>a+b,0))/100;
        return n.totals.damage-s.totals.damage-(s.player.hp-n.player.hp)*(defensive?.85:.4)-
            (s.player.mp-n.player.mp)*scale*(defensive?2:.25)+extra+
            shield*(defensive?.2:.1)+suppression*s.enemy.attack*(defensive?.8:.1)+
            (n.pendingSword-s.pendingSword)*.7-(action.move==="end"?remaining*power*.4:0)+
            (["complete","between","reward"].includes(n.phase)?10000:0)-(n.phase==="defeat"?100000:0);
    };
    if(policy==="beam"){
        // 单行动展望三回合，构筑收益只计相对增量，避免重复计分造成空转。
        let beam=[{state:slim,first:null,value:0}],finished=[];
        const horizon=s.setup.singleAction?3:s.ap;
        for(let depth=0;depth<horizon;depth++){
            const next=[];
            for(const b of beam)for(const action of candidates){
                const r=R.resolve(b.state,action);if(!r.ok)continue;
                const row={state:r.state,first:b.first||action,value:score(r.state,action,b.state.ap)};
                if(r.state.phase!=="fighting"||depth===horizon-1)finished.push(row);else next.push(row);
            }
            next.sort((a,b)=>b.value-a.value);beam=next.slice(0,5);
        }
        const best=(finished.length?finished:beam).sort((a,b)=>b.value-a.value)[0];
        assert.ok(best);return best.first;
    }
    let best=null,bestScore=-Infinity;
    for(const action of candidates){
        const r=R.resolve(slim,action);if(!r.ok)continue;
        const value=score(r.state,action);
        if(value>bestScore){best=action;bestScore=value;}
    }
    assert.ok(best);return best;
}
function setup(style,quality,seed){
    const d=T.defaults();d.seed=seed;
    [d.weaponTrial,d.armorTrial,d.accessoryTrial].forEach((e,i)=>{e.base=style.bases[i];e.quality=quality;});
    return d;
}
function run(d,policy,style,label){
    let s=R.start(d),steps=0,idle=0,stalled=false;const initial={...s.player},rolls=[s.weapon?.roll,s.armor?.roll,s.accessory?.roll];
    for(;steps<1500&&["fighting","reward","between"].includes(s.phase);steps++){
        let action;
        if(s.phase==="reward")action={move:"choose",choice:style.priority.find(k=>s.offers.includes(k))||s.offers[0]};
        else if(!s.potionUsed&&s.potions.heal&&s.player.hp<=s.player.maxHp*.65)action={move:"heal"};
        else if(!s.potionUsed&&s.potions.mana&&s.player.mp<=s.player.maxMp*.5)action={move:"mana"};
        else if(s.phase==="between")action={move:"next"};
        else action=choose(s,policy);
        const r=R.resolve(s,action);assert.ok(r.ok,r.reason);
        // 连续十二个敌阶段未削减敌人生命则记为策略停滞，不伪造胜败或改动战斗规则。
        idle=r.state.battle!==s.battle||r.state.enemy.hp<s.enemy.hp?0:
            idle+(r.state.round>s.round?1:0);
        s=r.state;if(idle>=12){stalled=true;break;}
    }
    assert.ok(steps<1500,`${label}/${style.name}/${d.seed}/${d.weaponTrial?.quality}/${policy}行动上限`);R.validateState(s);
    return {label,setup:d,seed:d.seed,policy,style:style.name,quality:d.weaponTrial?.quality||0,initial,rolls,phase:stalled?"stalled":s.phase,
        completed:s.reports.filter(r=>r.won).length,hp:s.player.hp,mp:s.player.mp,totals:s.totals,
        lineup:s.enemyPlan,rewards:s.rewards.map(r=>r.choice),
        durability:[s.weapon?.durability,s.armor?.durability,s.accessory?.durability],
        reports:s.reports.map(r=>({tier:r.tier,enemyId:r.enemyId,rounds:r.rounds,won:r.won,actions:r.actions,
            taken:r.taken,damage:r.damage,endHp:r.endHp,endMp:r.endMp,events:r.events,skills:r.skills}))};
}
const mean=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):0;
function summarize(rows){
    const reports=rows.flatMap(r=>r.reports);
    return {runs:rows.length,wins:rows.filter(r=>r.phase==="complete").length,
        winRate:mean(rows.map(r=>r.phase==="complete"?100:0)),stalled:rows.filter(r=>r.phase==="stalled").length,battles:reports.length,
        completed:mean(rows.map(r=>r.completed)),
        rounds:Object.fromEntries(["普通","精英","首领"].map(t=>[t,mean(reports.filter(r=>r.tier===t).map(r=>r.rounds))])),
        ordinaryFirstTurn:mean(reports.filter(r=>r.tier==="普通").map(r=>r.won&&r.rounds===1?100:0)),
        hpRemaining:mean(rows.filter(r=>r.phase==="complete").map(r=>r.hp/r.initial.maxHp*100)),
        hpPotions:mean(rows.map(r=>r.totals.healUsed)),mpPotions:mean(rows.map(r=>r.totals.manaUsed)),
        manaSpent:mean(rows.map(r=>r.totals.mpSpent)),
        skills:Object.fromEntries(["basic","guard","edge","wind","guide","fall"].map(k=>[k,reports.reduce((n,r)=>n+(r.skills[k]||0),0)])),
        events:Object.fromEntries([...new Set(rows.flatMap(r=>Object.keys(r.totals.events)))].map(k=>[k,rows.reduce((n,r)=>n+(r.totals.events[k]||0),0)]))};
}
function paired(a,b){
    assert.deepEqual(a.lineup,b.lineup);const n=Math.min(a.rewards.length,b.rewards.length);
    assert.deepEqual(a.rewards.slice(0,n),b.rewards.slice(0,n));
}
function main(){
    fs.mkdirSync(out,{recursive:true});const rows=[],refine=process.argv.includes("--refine"),sweep=process.argv.includes("--sweep")||refine;
    if(sweep){
        // 固定本轮候选输入，调整默认值后仍能复现初筛数据。
        const player={hp:240,mp:36,attack:18,defense:6},enemy={hp:110,mp:60,attack:17,defense:8};
        const combat={edge:1.5,guide:.8,guideMp:.25,fall:2.3,guard:1.2,wind:2,
            shieldAttack:.5,shieldArmor:.5,shieldCap:4,basicMana:2,
            costs:{edge:3,wind:3,guide:4,fall:6},enemyHp:{普通:1,精英:1.1,首领:1.2}};
        const candidates=refine?[
            {name:"分工版",player:T.presets[3].player,enemy:{...T.presets[3].enemy,attack:16},
                combat:{...T.tuning,edge:1.6,guide:.65,guideMp:.4,fall:2.2,costs:{edge:2,wind:2,guide:4,fall:7}}},
            {name:"分工高血",player:{...T.presets[3].player,hp:260},enemy:{...T.presets[3].enemy,attack:16},
                combat:{...T.tuning,edge:1.6,guide:.65,guideMp:.4,fall:2.2,costs:{edge:2,wind:2,guide:4,fall:7}}},
            {name:"分工敌攻15",player:T.presets[3].player,enemy:{...T.presets[3].enemy,attack:15},
                combat:{...T.tuning,edge:1.6,guide:.65,guideMp:.4,fall:2.2,costs:{edge:2,wind:2,guide:4,fall:7}}},
        ]:[
            {name:"单行动基准",player,enemy,combat},
            {name:"敌攻15",player,enemy:{...enemy,attack:15},combat},
            {name:"敌攻19",player,enemy:{...enemy,attack:19},combat},
            {name:"角色血280",player:{...player,hp:280},enemy,combat},
            {name:"敌血95",player,enemy:{...enemy,hp:95},combat},
            {name:"低耗蓝",player,enemy,combat:{...combat,costs:{edge:2,wind:2,guide:3,fall:5}}},
            {name:"灵力转化",player,enemy,combat:{...combat,guide:.65,guideMp:.4}},
        ];
        for(const candidate of candidates){
            for(const style of styles)for(const quality of [1,3,6])for(const seed of [17,118,219])for(const policy of ["burst","balanced"]){
                const d=setup(style,quality,seed);d.player=candidate.player;d.enemy=candidate.enemy;
                if(candidate.combat)d.combatTrial=candidate.combat;else delete d.combatTrial;
                rows.push(run(d,policy,style,candidate.name));
            }
            console.log(candidate.name,JSON.stringify(summarize(rows.filter(r=>r.label===candidate.name))));
        }
    }else{
        const seeds=[17,118,219,320],policies=["burst","balanced"];
        for(const seed of seeds)for(const policy of policies){
            for(const style of styles){
                const plain=setup(style,1,seed);delete plain.weaponTrial;delete plain.armorTrial;delete plain.accessoryTrial;
                const naked=run(plain,policy,style,"裸装");rows.push(naked);
                for(let q=1;q<=6;q++){const row=run(setup(style,q,seed),policy,style,"搭配");paired(naked,row);rows.push(row);}
            }
            for(const slot of ["weapon","armor","accessory"]){
                const count=slot==="weapon"?12:6,pool=slot==="weapon"?Object.keys(W.names):G.pools[slot];
                for(let base=1;base<=count;base++)for(let quality=1;quality<=6;quality++){
                    const d=setup(styles[0],quality,seed);d[slot+"Trial"].base=base;
                    rows.push(run(d,policy,styles[0],`底材/${slot}/${base}`));
                }
                for(const passive of pool)for(const quality of [1,3,6]){
                    const d=setup(styles[0],quality,seed);d[slot+"Trial"].passive=passive;
                    rows.push(run(d,policy,styles[0],`被动/${slot}/${passive}`));
                }
            }
            console.log(`完成种子${seed}/${policy}，累计${rows.length}局`);
        }
        for(const style of styles)for(const quality of [1,3,6])for(const enemyId of Object.keys(E.enemies)){
            const d=setup(style,quality,421);d.battles=1;d.enemyId=enemyId;d.healPotions=d.manaPotions=0;
            rows.push(run(d,"balanced",style,"单敌无药"));
        }
        // 独立留出种子与三步搜索策略，避免只对单步评分调参。
        for(const style of styles)for(const quality of [1,3,6])for(const seed of [733,941]){
            rows.push(run(setup(style,quality,seed),"beam",style,"留出搜索"));
        }
    }
    const summary={};
    for(const label of [...new Set(rows.map(r=>r.label))]){
        const selected=rows.filter(r=>r.label===label);
        summary[label]={all:summarize(selected),qualities:Object.fromEntries([0,1,2,3,4,5,6]
            .filter(q=>selected.some(r=>r.quality===q)).map(q=>[q,summarize(selected.filter(r=>r.quality===q))]))};
    }
    const result={profile:T.presets[3],tuning:T.tuning,rows,summary};
    fs.writeFileSync(path.join(out,refine?"refine.json":sweep?"sweep.json":"results.json"),JSON.stringify(result,null,2));
    console.log(JSON.stringify(Object.fromEntries(Object.entries(summary).filter(([k])=>!k.startsWith("底材/")&&!k.startsWith("被动/"))
        .map(([k,v])=>[k,{...v.all,events:undefined,skills:undefined,
            qualities:Object.fromEntries(Object.entries(v.qualities).map(([q,s])=>[q,{wins:s.wins,runs:s.runs,rounds:s.rounds}]))}])),null,2));
}
module.exports={choose,run,setup,summarize,styles};
if(require.main===module)main();
