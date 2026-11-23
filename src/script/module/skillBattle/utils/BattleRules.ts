import type { BattleAction, BattleCarry, BattleEvent, BattleResult, BattleSetup, BattleState } from "../types/BattleTypes";
import { attributes, createBattle, legal, playerAct, skillCost, usePotion, validate } from "./CombatEngine";
import { BY_SKILL, ENEMIES, POTIONS, RULES } from "./CombatConfig";
import type { CombatStats } from "../types/CombatTypes";

/** 预览与实际提交共用纯结算，真实药品始终以UID扣除。 */
export class BattleRules {
    static clone<T>(v:T):T {return v===undefined?v:JSON.parse(JSON.stringify(v));}
    static format(n:number):string{return String(n);}
    static scale(n:number,percent:number):number{return Math.round(n*percent/100);}
    static base(setup:BattleSetup):CombatStats {
        const p=setup.player;
        return {hp:p.maxHp,mp:p.maxMp,a:p.baseAttack,s:p.baseSpirit,armor:p.baseDefense,speed:p.baseSpeed};
    }
    static attributes(_setup:BattleSetup,state:BattleState) {
        const a=attributes(state.combat);
        return {attack:a.a,spirit:a.s,defense:Math.round(a.armor),speed:state.combat.p.speed};
    }
    private static sync(state:BattleState):void {
        const c=state.combat,p=c.p,e=c.enemies[0];
        state.phase=c.lost?"defeat":c.won?"victory":"player_input";
        state.round=c.round;state.mainActions=c.metrics.playerActions;
        state.player={hp:p.hp,maxHp:p.maxHp,mp:p.mp,maxMp:p.maxMp,block:p.shield};
        state.enemy={hp:e.hp,maxHp:e.maxHp,block:e.shield};
        state.potionUsed=c.potionUsedAt===p.turns;
        state.equipment.forEach((g,i)=>g.instance=this.clone(c.items[i]));
        const weapon=state.equipment.find(g=>g.instance.slot===1);
        state.weapon=weapon?{id:weapon.itemId,name:weapon.name,attack:0,defense:0,
            durability:weapon.instance.durability,maxDurability:weapon.instance.maxDurability}:null;
    }
    static start(setup:BattleSetup,battleId:string,carry?:BattleCarry):BattleState {
        this.validateSetup(setup);
        const equipment=this.clone(carry?.equipment??setup.equipment),pouch=this.clone(carry?.pouch??[null,null,null,null,null]);
        const doses=POTIONS.map(()=>0);
        pouch.forEach(item=>{
            if(!item)return;
            const i=setup.potions.findIndex(p=>p.itemId===item.itemId);
            if(i<0)throw new Error("药匣包含未知药品");
            doses[i]++;
        });
        const combat=createBattle({skills:this.clone(setup.skills),potions:doses},equipment.map(g=>g.instance),[setup.enemyId],
            {player:this.base(setup),hp:carry?.hp,mp:carry?.mp,pressure:setup.pressure,potions:doses,trace:true});
        const state:BattleState={combat,version:2,battleId,phase:"player_input",revision:0,round:1,mainActions:0,
            player:null,enemy:null,weapon:null,equipment,pouch,potionUsed:false};
        this.sync(state);this.validateState(setup,state);return state;
    }
    static validateSetup(setup:BattleSetup):void {
        if(!RULES || !setup?.rulesId || !ENEMIES.some(e=>e.id===setup.enemyId) ||
            !setup.player || Object.values(setup.player).some(n=>!Number.isSafeInteger(n)||n<0) ||
            setup.player.maxHp<1 || !Number.isInteger(setup.pressure) || setup.pressure<0 ||
            setup.skills.length>RULES.activeSlots || new Set(setup.skills).size!==setup.skills.length ||
            setup.skills.some(s=>!BY_SKILL[s]||["basic","guard"].includes(s)) ||
            setup.potions.length!==POTIONS.length || setup.equipment.length>3)
            throw new Error("战斗配置、装配或敌人无效");
    }
    static validateState(setup:BattleSetup,state:BattleState):void {
        if(state.version!==2 || !state.battleId || state.pouch.length!==5 ||
            state.pouch.filter(Boolean).some(p=>!setup.potions.some(v=>v.itemId===p.itemId)) ||
            new Set(state.pouch.filter(Boolean).map(p=>p.itemUid)).size!==state.pouch.filter(Boolean).length)
            throw new Error("战斗实例或药匣无效");
        const expected=this.clone(state);this.sync(expected);
        if(JSON.stringify(expected)!==JSON.stringify(state))throw new Error("战斗显示快照与规则核不一致");
        validate(state.combat);
    }
    static resolve(setup:BattleSetup,original:BattleState,action:BattleAction):BattleResult {
        const state=this.clone(original),c=state.combat,events:BattleEvent[]=[];
        const reject=(reason:string):BattleResult=>({ok:false,state:this.clone(original),events:[],preview:null,reason});
        if(state.phase!=="player_input")return reject("战斗已结束");
        let name="",resource:null|"hp"|"mp"|"mixed"|"shield"=null,mpCost=0;
        try {
            this.validateState(setup,original);
            if(action.type==="potion"){
                const slot=state.pouch.findIndex(i=>i?.itemUid===action.itemUid),item=state.pouch[slot];
                if(!item)return reject("药品已不在斗法匣");
                const i=setup.potions.findIndex(p=>p.itemId===item.itemId),potion=setup.potions[i];
                if(!usePotion(c,POTIONS[i].code))return reject("本回合已用药，或当前药效没有可恢复空间");
                state.pouch[slot]=null;name=potion.name;resource=potion.resource;
                events.push({type:"potion",itemUid:item.itemUid,itemId:item.itemId,slot});
            } else {
                const code=action.type==="skill"?action.code:action.type,target=action.type==="skill"?action.target??0:0;
                const enemy=c.enemies.find(e=>e.id===target),skill=BY_SKILL[code];
                if(!legal(c,code,enemy))return reject("技能不可用：检查法力、状态材料、冷却或每战次数");
                name=skill.name;mpCost=skillCost(c,code);
                playerAct(c,code,target,action.type==="skill"?action:{});
            }
            this.sync(state);state.revision++;
            const enemyHpLoss=Math.max(0,c.metrics.damage-original.combat.metrics.damage);
            const playerHpLoss=Math.max(0,c.metrics.incoming-original.combat.metrics.incoming);
            if(enemyHpLoss)events.push({type:"damage",part:"body",target:"enemy",amount:enemyHpLoss,absorbed:0,hpLoss:enemyHpLoss});
            if(playerHpLoss)events.push({type:"damage",part:"enemy",target:"player",amount:playerHpLoss,absorbed:0,hpLoss:playerHpLoss});
            if(c.settled)events.push({type:"ended",result:c.won?"victory":"defeat"});
            const durabilityCost=original.equipment.reduce((n,g,i)=>n+g.instance.durability-state.equipment[i].instance.durability,0);
            this.validateState(setup,state);
            return {ok:true,state,events,preview:{
                token:{battleId:original.battleId,revision:original.revision},name,mpCost,durabilityCost,
                body:enemyHpLoss,enemyHpLoss,playerHpLoss,shield:Math.max(0,state.player.block-original.player.block),
                recovery:resource==="mp"?state.player.mp-original.player.mp:Math.max(0,state.player.hp-original.player.hp),
                resource,secondaryRecovery:resource==="mixed"?state.player.mp-original.player.mp:0,potion:action.type==="potion",
            }};
        } catch(e){return reject((e as Error).message);}
    }
}
