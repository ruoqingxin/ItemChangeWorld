import { Tables } from "../../../config/schema";
import type { CombatSkill, CombatStats, EnemyTemplate, EquipmentInstance, EquipmentTrait, StatKey } from "../types/CombatTypes";

export const STAT_KEYS: StatKey[] = ["hp","mp","a","s","armor","speed"];
export const STAT_NAMES: Record<StatKey,string> = {hp:"生命",mp:"法力",a:"物攻",s:"精神",armor:"护甲",speed:"速度"};
export const QUALITY_NAMES = ["普通","优秀","精良","稀有","史诗","传说"];
export interface CombatRuleConfig {
    player: CombatStats; activeSlots: number; equipmentSlots: number; traitsPerItem: number;
    mainActions: number; medicineUsesPerOwnTurn: number; medicineUsesAction: number;
    potionCells: number; hpPotion: number; mpPotion: number; shieldCap: number; statusTicks: number;
    statusLimits: Record<string,number>; bleedRatio: number; burnRatio: number; chillReduction: number;
    armorConstant: number; basicMana: number; lifePaymentRate: number; lifePaymentMin: number;
    durabilityQuality: number[]; durabilityLoss: number[][]; repairPrice: number[]; repairSand: number;
    route: number[]; pressureEvery: number; pressureMax: number; pressureHp: number; pressureAttack: number;
}
export interface EquipmentBase { id: number; code: string; name: string; slot: number; main: StatKey; weight?: number; durability: number; }
export interface TraitTemplate { id: number; code: string; name: string; slot: number; text: string; p: number[][]; n?: number[][]; }
export let RULES: CombatRuleConfig;
export let SKILLS: CombatSkill[] = [];
export let BY_SKILL: Record<string,CombatSkill> = {};
export let ENEMIES: EnemyTemplate[] = [];
export let BASES: EquipmentBase[] = [];
export let TRAITS: TraitTemplate[] = [];
export let WINDOWS: number[][] = [];
export let MAIN: Record<string,number[][]> = {};
export let SUB: Record<string,number[][]> = {};
export let POTIONS: Array<{code:string; name:string; resource:number; hp:number; mp:number; shield:number}> = [];
export let START_SKILLS: string[] = [];
export function combatSignature():string {
    return JSON.stringify({RULES,SKILLS,ENEMIES,BASES,TRAITS,WINDOWS,MAIN,SUB,POTIONS,START_SKILLS});
}
export class CombatConfig {
    static load(t: Tables): void {
        const row = t.battle_rule.get(1);
        if (!row || row.version !== 2 || row.active_slots !== 5) throw new Error("单行动战斗配置版本无效");
        // 导表的单精度浮点先恢复配置精度，避免0.4等倍率改变整数取整边界。
        const decimal=(n:number)=>Number(n.toFixed(6));
        const parameter = Object.fromEntries(t.battle_parameter.getDataList().map(p=>[p.code,decimal(p.value)]));
        const value = (code:string) => {
            if (!Number.isFinite(parameter[code])) throw new Error(`战斗参数缺失：${code}`);
            return parameter[code];
        };
        RULES = {
            player: {hp:row.player_hp,mp:row.player_mp,a:row.base_attack,s:row.base_spirit,armor:row.base_defense,speed:row.base_speed},
            activeSlots:row.active_slots,equipmentSlots:value("equipmentSlots"),traitsPerItem:value("traitsPerItem"),
            mainActions:value("mainActions"),medicineUsesPerOwnTurn:value("medicineUsesPerOwnTurn"),medicineUsesAction:value("medicineUsesAction"),
            potionCells:value("potionCells"),hpPotion:value("hpPotion"),mpPotion:value("mpPotion"),shieldCap:value("shieldCap"),
            statusTicks:value("statusTicks"),statusLimits:Object.fromEntries(["bleed","burn","chill","mark"].map(k=>[k,value(`statusLimits.${k}`)])),
            bleedRatio:value("bleedRatio"),burnRatio:value("burnRatio"),chillReduction:value("chillReduction"),armorConstant:value("armorConstant"),
            basicMana:value("basicMana"),lifePaymentRate:value("lifePaymentRate"),lifePaymentMin:value("lifePaymentMin"),
            durabilityQuality:Array.from({length:6},(_,i)=>value(`durabilityQuality.${i}`)),
            durabilityLoss:Array.from({length:3},(_,i)=>Array.from({length:3},(_,j)=>value(`durabilityLoss.${i}.${j}`))),
            repairPrice:Array.from({length:6},(_,i)=>value(`repairPrice.${i}`)),repairSand:value("repairSand"),
            route:Array.from({length:8},(_,i)=>value(`route.${i}`)),pressureEvery:value("pressureEvery"),pressureMax:value("pressureMax"),
            pressureHp:value("pressureHp"),pressureAttack:value("pressureAttack"),
        };
        SKILLS = t.skill.getDataList().map(s => ({id:s.id,code:s.code,name:s.name,mp:s.mp_cost,cd:s.cooldown,kind:s.kind,uses:s.uses,
            description:s.description,effect:{}}));
        BY_SKILL = Object.fromEntries(SKILLS.map(s=>[s.code,s]));
        for (const fx of t.skill_effect.getDataList()) {
            const skill = SKILLS.find(s=>s.id===fx.skill_id);
            if (!skill || fx.code in skill.effect || !Number.isFinite(fx.value)) throw new Error("技能效果引用或参数无效");
            skill.effect[fx.code] = decimal(fx.value);
        }
        START_SKILLS = t.battle_start_skill.getDataList().map(s=>{
            const skill=SKILLS.find(k=>k.id===s.skill_id);
            if(!skill || ["basic","guard"].includes(skill.code))throw new Error("起始主动技能无效");
            return skill.code;
        });
        ENEMIES = t.enemy.getDataList().map(e=>({
            id:e.id,name:e.name,tier:e.tier,hp:e.hp,mp:e.mp,a:e.attack,s:e.spirit,armor:e.armor,speed:e.speed,
            healUses:e.heal_uses,wardUses:e.ward_uses,purifyUses:e.purify_uses,
            pattern:t.enemy_action.getDataList().filter(a=>a.enemy_id===e.id).sort((a,b)=>a.order-b.order).map(a=>a.code),
        }));
        BASES = t.equipment_base.getDataList().map(b=>({id:b.id,code:b.code,name:b.name,slot:b.slot,main:STAT_KEYS[b.main_stat-1],durability:b.durability}));
        MAIN = {}; SUB = {};
        for(const key of STAT_KEYS) {
            const rows=t.equipment_band.getDataList().filter(b=>b.stat===STAT_KEYS.indexOf(key)+1).sort((a,b)=>a.band-b.band);
            if(rows.length!==6)throw new Error("装备属性档位不完整");
            MAIN[key]=rows.map(b=>[b.main_min,b.main_max]);SUB[key]=rows.map(b=>[b.sub_min,b.sub_max]);
        }
        WINDOWS=t.equipment_quality.getDataList().sort((a,b)=>a.quality-b.quality).map(q=>[q.band_min,q.band_max]);
        TRAITS=t.equipment_trait.getDataList().map(tr=>{
            const rolls=t.equipment_trait_roll.getDataList().filter(r=>r.trait_id===tr.id).sort((a,b)=>a.quality-b.quality);
            if(rolls.length!==6)throw new Error("装备特性品质区间不完整");
            return {id:tr.id,code:tr.code,name:tr.name,slot:tr.slot,text:tr.description,p:rolls.map(r=>[r.p_min,r.p_max]),
                ...(rolls.some(r=>r.n_max>0)?{n:rolls.map(r=>[r.n_min,r.n_max])}:{})};
        });
        POTIONS=t.potion.getDataList().sort((a,b)=>a.id-b.id).map((p,i)=>({
            code:["hp","mp","hpPlus","mpPlus","dual","ward"][i],name:t.item.get(301+i)?.name || "",
            resource:p.resource,hp:[1,3].includes(p.resource)?p.amount:0,mp:p.resource===2?p.amount:p.secondary_amount,
            shield:p.resource===4?p.amount:0,
        }));
        if(SKILLS.length!==36 || TRAITS.length!==24 || BASES.length!==24 || ENEMIES.length!==15 ||
            ENEMIES.some(e=>!e.pattern.length) || START_SKILLS.length>5)throw new Error("战斗内容配置不完整");
    }
}
export function rng(seed:number):()=>number {
    let v=seed>>>0;
    return ()=>{v=(Math.imul(v,1664525)+1013904223)>>>0;return v/4294967296;};
}
export const integer=(random:()=>number,low:number,high:number)=>low+Math.floor(random()*(high-low+1));
export function rollItem(code:string,quality:number,seed:number,traitCode?:string):EquipmentInstance {
    const base=BASES.find(b=>b.code===code);
    if(!base || !Number.isInteger(quality) || quality<1 || quality>6)throw new Error("无效装备底材或品质");
    const random=rng(seed),tr=rng(seed^0x9e3779b9),[lo,hi]=WINDOWS[quality-1];
    const mainBand=integer(random,lo,hi),sub=STAT_KEYS[integer(random,0,5)],subBand=integer(random,lo,hi);
    const mainRange=MAIN[base.main][mainBand-1],subRange=SUB[sub][subBand-1];
    const mainValue=integer(random,mainRange[0],mainRange[1]),subValue=integer(random,subRange[0],subRange[1]);
    const pool=TRAITS.filter(t=>t.slot===base.slot),source=traitCode?pool.find(t=>t.code===traitCode):pool[integer(tr,0,pool.length-1)];
    if(!source)throw new Error("特性不属于该部位");
    const range=source.p[quality-1],trait:EquipmentTrait={code:source.code,name:source.name,p:integer(tr,range[0],range[1])};
    if(source.n){const nr=source.n[quality-1];trait.n=integer(tr,nr[0],nr[1]);}
    const maxDurability=base.durability+RULES.durabilityQuality[quality-1];
    return {code,name:base.name,slot:base.slot,quality,main:base.main,mainBand,mainValue,sub,subBand,subValue,trait,durability:maxDurability,maxDurability,kills:0};
}
export function statsFromItems(items:EquipmentInstance[],player:CombatStats=RULES.player):CombatStats {
    const stats={...player};
    for(const item of items){
        const contribution=Object.fromEntries(STAT_KEYS.map(k=>[k,0])) as CombatStats;
        contribution[item.main]+=item.mainValue;contribution[item.sub]+=item.subValue;
        for(const key of STAT_KEYS)stats[key]+=Math.round(contribution[key]*(item.durability>0?1:0.5));
    }
    return stats;
}
export function activeTraits(items:EquipmentInstance[]):Record<string,EquipmentTrait> {
    const result:Record<string,EquipmentTrait>={};
    for(const item of items){
        const trait={...item.trait,kills:item.kills},old=result[trait.code];
        if(!old || trait.p>old.p || trait.p===old.p&&(trait.n??0)<(old.n??0))result[trait.code]=trait;
    }
    return result;
}
export function traitDescription(item:EquipmentInstance):string {
    const source=TRAITS.find(t=>t.code===item.trait.code);
    return `${item.trait.name}：${(source?.text||"").replace(/P/g,String(item.trait.p)).replace(/N/g,String(item.trait.n??0))}`;
}
