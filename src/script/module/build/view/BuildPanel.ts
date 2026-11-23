import type { UIBaseView } from "../../../games/ui/UIBaseView";
import type { ExpeditionRunManager } from "../../expedition/manager/ExpeditionRunManager";
import { BattlePanel } from "../../skillBattle/view/BattlePanel";
import type { SkillBattlePage } from "../../gameplay/utils/GameplayLayout";
import { BY_SKILL, SKILLS } from "../../skillBattle/utils/CombatConfig";

export type BuildPanelSession = ExpeditionRunManager;
export class BuildPanel extends BattlePanel {
    private chosen=0;
    private page=0;
    private slot=0;
    private readonly slotKeys=["skill1","skill2","skill3","skill4","upgrade0"];
    constructor(view:UIBaseView,readonly flowSession:BuildPanelSession,navigate:(screen:SkillBattlePage)=>void,
        screen:"start"|"battle"|"settlement",page:SkillBattlePage=screen){super(view,flowSession,navigate,screen,page);}
    startRun():void{this.navigate(this.flowSession.flow?.phase==="battle"?"battle":this.flowSession.inventory?.phase==="active"?"map":"start");}
    protected command(key:string):void {
        if(this.modalOpen)return;
        if(this.screen==="battle"||this.overlay){super.command(key);return;}
        this.run(()=>{
            const flow=this.flowSession.flow;if(!flow)return;
            const index=this.slotKeys.indexOf(key);
            if(index>=0){this.slot=index;return;}
            if(key==="previousPage"){this.page=Math.max(0,this.page-1);this.chosen=0;return;}
            if(key==="nextPage"){this.page++;this.chosen=0;return;}
            if(key==="report"){this.openReport();return;}
            if(key==="hub"){this.startRun();return;}
            const rows=this.rows(),match=/^warehouse([0-2])$/.exec(key);
            if(match){this.chosen=rows[this.page*3+Number(match[1])]?.id||0;return;}
            if(key==="cancel"&&!flow.pending){
                this.flowSession.dispatch({type:"loadout",skills:flow.skills.filter((_,i)=>i!==this.slot)});return;
            }
            if(key==="newRun"&&this.chosen){
                if(flow.pending)this.flowSession.dispatch({type:"choose",source:flow.pending.source,id:this.chosen,slot:this.slot});
                else{
                    const skill=SKILLS.find(s=>s.id===this.chosen),skills=flow.skills.slice();
                    if(skills.includes(skill.code))throw new Error("该技能已装配");
                    skills[Math.min(this.slot,skills.length)]=skill.code;
                    this.flowSession.dispatch({type:"loadout",skills});
                }
                this.chosen=0;
            }
        });
    }
    private rows(){
        const flow=this.flowSession.flow;
        return flow?.pending?flow.pending.candidates.map(id=>SKILLS.find(s=>s.id===id)):
            (flow?.knownSkills||[]).map(code=>BY_SKILL[code]);
    }
    protected renderStart():void {
        const flow=this.flowSession.flow;
        if(!flow){this.navigate("start");return;}
        this.backdrop();
        this.text("overlayBrand","末法寻仙",32,18,420,44,26,"#e3c98c");
        this.text("currency",this.timeText(),1000,22,248,40,20,"#bac3b6");
        this.text("resultTitle",flow.pending?"技能机缘":"技能装配",170,76,940,46,30);
        this.text("resultDetail",`已掌握 ${flow.knownSkills.length} 招 · 已装配 ${flow.skills.length}/5`,170,128,940,34,20,"#a1d7ba");
        this.slotKeys.forEach((key,i)=>this.button(key,`${i+1} · ${BY_SKILL[flow.skills[i]]?.name||"空位"}`,
            170+i*190,176,178,48,true,i===this.slot));
        const rows=this.rows(),pages=Math.max(1,Math.ceil(rows.length/3));this.page=Math.min(this.page,pages-1);
        rows.slice(this.page*3,this.page*3+3).forEach((s,i)=>this.button(`warehouse${i}`,
            `${s.name}\n${["","物理","魔法","混合","辅助"][s.kind]} · ${s.mp}法力`,
            170+i*320,254,300,76,true,s.id===this.chosen));
        const selected=rows.find(s=>s.id===this.chosen);
        this.text("reportBody",selected?`${selected.name}\n${selected.description}\n冷却 ${selected.cd}${selected.uses?` · 每战 ${selected.uses} 次`:""}`:"",
            170,350,940,170,18);
        this.text("choiceTitle",`${this.page+1} / ${pages}`,540,542,120,36,18);
        this.button("previousPage","<",670,542,90,38,this.page>0);
        this.button("nextPage",">",780,542,90,38,this.page+1<pages);
        this.text("overlayMessage",this.flowSession.error||this.notice,170,586,940,34,17,"#efa797");
        this.button("hub","返回",170,634,240,54,!flow.pending);
        this.button("cancel","卸下选中技能",450,634,270,54,!flow.pending&&!!flow.skills[this.slot]);
        this.button("newRun",flow.pending?"领悟并装配":"装配到选中位",810,634,300,54,!!selected);
    }
}
