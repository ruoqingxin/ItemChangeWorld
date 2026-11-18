const {load}=require("./config-fixture.cjs");
const {QingmingRules:R}=load("module/skillBattle/utils/QingmingRules.js");
function choose(s){
    const source=R.clone(s);source.logs=[];source.reports=[];source.rewards=[];
    const score=n=>{
        const future=n.phase==="fighting"?Math.min(3,n.enemy.hp/Math.max(1,n.player.attack)):0;
        return source.enemy.hp-n.enemy.hp+(n.player.hp-source.player.hp)*1.5-
            (source.player.mp-n.player.mp)*2+n.flying*12*future+n.wounds*6*future+
            n.momentum*18*future+n.forms.length*16*future+
            (n.phase==="fighting"?Math.min(n.player.shield,60)*.1+n.pendingSword*.45:0)+
            (["reward","between","complete"].includes(n.phase)?150:0)-(n.phase==="defeat"?100000:0);
    };
    let beam=[{state:source,first:null,value:0}],finished=[];
    for(let depth=0;depth<Math.min(3,s.ap);depth++){
        const next=[];
        for(const b of beam){
            const actions=["basic","guard","edge","wind","fall","end"].map(move=>({move})).concat(
                (R.has(b.state,"rupture")?[1]:[1,2,3]).map(enemyAction=>({move:"guide",enemyAction})));
            for(const action of actions){
                const result=R.resolve(b.state,action);if(!result.ok)continue;
                const row={state:result.state,first:b.first||action,value:score(result.state)};
                if(row.state.round>source.round||row.state.phase!=="fighting")finished.push(row);else next.push(row);
            }
        }
        next.sort((a,b)=>b.value-a.value);beam=next.slice(0,5);
    }
    return (finished.length?finished:beam).sort((a,b)=>b.value-a.value)[0]?.first||{move:"basic"};
}
module.exports={choose,reward:s=>s.offers[0]};
