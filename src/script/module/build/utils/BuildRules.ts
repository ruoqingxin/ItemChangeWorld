import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { ENEMIES, RULES, SKILLS, combatSignature } from "../../skillBattle/utils/CombatConfig";
import type { BuildCommand, BuildConfig, BuildState } from "../types/BuildTypes";
import type { BattleCarry, BattleResult } from "../../skillBattle/types/BattleTypes";

export class BuildRules {
    static validateConfig(config:BuildConfig):void {
        Core.validateSetup(config.setup);
        if(!config.version||config.combatSignature!==combatSignature()||!config.encounters.length||config.encounters.some(e=>!ENEMIES.some(k=>k.id===e.enemyId)))
            throw new Error("战斗节点配置无效");
    }
    static start(config:BuildConfig,seed:number,runId:string):BuildState {
        this.validateConfig(config);
        if(!Number.isInteger(seed)||seed<1||seed>0xffffffff||!runId)throw new Error("随机种子或局标识无效");
        return {skills:Core.clone(config.setup.skills),knownSkills:Core.clone(config.setup.skills),rng:seed,runId,revision:0,phase:"ready",
            endReason:null,paidChoices:0,pending:null,sources:[],battles:[]};
    }
    static offer(_config:BuildConfig,snapshot:BuildState,source:string,_kind:"active"|"passive"):BuildState {
        const s=Core.clone(snapshot);
        if(s.phase!=="ready"||s.pending||s.sources.includes(source))throw new Error("技能机缘不可重复领取");
        const pool=SKILLS.filter(k=>!["basic","guard"].includes(k.code)&&!s.knownSkills.includes(k.code));
        const candidates:number[]=[];
        while(pool.length&&candidates.length<3){
            s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;
            const index=Math.floor(s.rng/4294967296*pool.length);
            candidates.push(pool.splice(index,1)[0].id);
        }
        s.sources.push(source);
        if(candidates.length)s.pending={kind:"skill",source,candidates};
        s.revision++;return s;
    }
    static apply(config:BuildConfig,snapshot:BuildState,command:BuildCommand,at:number,carry?:BattleCarry,encounterId?:string):
        {state:BuildState;battle?:BattleResult} {
        const s=Core.clone(snapshot);let battle:BattleResult;
        if(s.phase==="ended")throw new Error("本局已结束");
        const ready=()=>{if(s.phase!=="ready"||s.pending)throw new Error("请先完成当前战斗或选择");};
        switch(command.type){
            case "loadout":
                ready();
                if(command.skills.length>RULES.activeSlots||new Set(command.skills).size!==command.skills.length||
                    command.skills.some(k=>!s.knownSkills.includes(k)))throw new Error("最多装配五个已掌握技能");
                s.skills=Core.clone(command.skills);break;
            case "choose": {
                const p=s.pending,skill=SKILLS.find(k=>k.id===command.id);
                if(!p||p.source!==command.source||!p.candidates.includes(command.id)||!skill)throw new Error("技能候选已过期");
                s.knownSkills.push(skill.code);s.paidChoices++;s.pending=null;
                if(s.skills.length<5)s.skills.push(skill.code);
                else if(command.slot!==undefined){
                    if(!Number.isInteger(command.slot)||command.slot<0||command.slot>=5)throw new Error("替换技能位无效");
                    s.skills[command.slot]=skill.code;
                }
                break;
            }
            case "battle": {
                ready();
                const row=config.encounters.find(e=>e.id===encounterId)||config.encounters[s.battles.length];
                if(!row)throw new Error("当前敌人不存在");
                const setup=Core.clone(config.setup),enemy=ENEMIES.find(e=>e.id===row.enemyId);
                setup.enemyId=enemy.id;setup.skills=Core.clone(s.skills);
                setup.pressure=Math.min(RULES.pressureMax,Math.floor(s.battles.length/RULES.pressureEvery));
                setup.enemy={id:enemy.id,name:enemy.name,maxHp:Math.round(enemy.hp*(1+setup.pressure*RULES.pressureHp))};
                setup.equipment=Core.clone(carry?.equipment||setup.equipment);
                const previous=s.battles[s.battles.length-1]?.state;
                const initial=Core.start(setup,`${s.runId}_${s.battles.length+1}`,carry||(previous?{
                    hp:previous.player.hp,mp:previous.player.mp,weapon:previous.weapon,equipment:previous.equipment,pouch:previous.pouch}:undefined));
                s.battles.push({setup,initial,actions:[],state:Core.clone(initial)});
                s.phase=initial.phase==="player_input"?"battle":"ended";
                if(initial.phase==="defeat")s.endReason="defeat";
                break;
            }
            case "action": {
                if(s.phase!=="battle")throw new Error("当前没有战斗");
                const record=s.battles[s.battles.length-1];
                battle=Core.resolve(record.setup,record.state,command.action);
                if(battle.ok===false)throw new Error(battle.reason);
                record.actions.push({at,action:Core.clone(command.action)});record.state=battle.state;
                if(battle.state.phase==="defeat"){s.phase="ended";s.endReason="defeat";}
                if(battle.state.phase==="victory"){s.phase="ready";s.sources.push(encounterId||`battle:${s.battles.length}`);}
                break;
            }
            case "extract":ready();s.phase="ended";s.endReason="complete";break;
            case "abandon":case "timeout":s.phase="ended";s.endReason=command.type;s.pending=null;break;
            default:throw new Error("不支持的技能操作");
        }
        s.revision++;return {state:s,battle};
    }
}
