import type { BuildCommand, BuildConfig, BuildState } from "../types/BuildTypes";
import type { BattleCarry, BattleResult } from "../../skillBattle/types/BattleTypes";
import type { RogueItem, RogueLoadout } from "../../skillBattle/types/QingmingTypes";
import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { QingmingRules as R } from "../../skillBattle/utils/QingmingRules";
import { QingmingConfig as C } from "../../skillBattle/utils/QingmingConfig";
import { GuzongEnemyRules as E } from "../../skillBattle/utils/GuzongEnemyRules";

export class QingmingBuildRules {
    static get items(): RogueItem[] { return Object.keys(C.items) as RogueItem[]; }
    static item(id: number): RogueItem { return this.items[id-1]; }
    static empty(seed: number): RogueLoadout {
        return { acquired: [], passives: [], mutations: {}, core: null, offers: [], offerRoles: {},
            rng: 1+(seed-1)%2147483646 };
    }
    static start(seed: number, runId: string): BuildState {
        return { runId, revision: 0, phase: "ready", endReason: null,
            paidChoices: 0, pending: null,
            sources: [], battles: [], qingming: this.empty(seed) };
    }
    static offer(snapshot: BuildState, source: string): BuildState {
        const s = Core.clone(snapshot);
        if (!s.qingming || s.phase !== "ready" || s.pending || !source || s.sources.includes(source))
            throw new Error("功法机缘不可用或已领取");
        s.sources.push(source);
        R.rollOffers(s.qingming,(s.paidChoices+1)%3===0);
        if (s.qingming.offers.length) s.pending = {kind:"qingming",source,
            candidates:s.qingming.offers.map(k => this.items.indexOf(k)+1)};
        s.revision++;
        return s;
    }
    static apply(config: BuildConfig, snapshot: BuildState, command: BuildCommand, at: number,
        carry?: BattleCarry, encounterId?: string): {state:BuildState; battle?:BattleResult} {
        let s = Core.clone(snapshot), battle: BattleResult | undefined;
        if (!command || s.phase === "ended" || !s.qingming) throw new Error("本局功法构筑已结束");
        const ready = () => { if (s.phase!=="ready" || s.pending) throw new Error("请先完成当前选择或战斗"); };
        const end = (reason: NonNullable<BuildState["endReason"]>) => {
            s.phase="ended";s.endReason=reason;s.pending=null;
            delete s.qingming;
        };
        switch(command.type) {
            case "choose": {
                const p=s.pending,key=this.item(command.id);
                if(!p || p.kind!=="qingming" || p.source!==command.source || !p.candidates.includes(command.id))throw new Error("功法候选已过期");
                R.choose(s.qingming,key);s.qingming.offers=[];s.qingming.offerRoles={};
                s.paidChoices++;s.pending=null;break;
            }
            case "battle": {
                ready();
                const row=encounterId?config.encounters.find(e=>e.id===encounterId):config.encounters[s.battles.length];
                if(!row?.qingmingEnemy)throw new Error("古宗敌人绑定缺失");
                const enemy=E.enemies[row.qingmingEnemy],q=config.qingming;
                const stage=Math.min(3,Math.floor(s.battles.length/3)),pressure=C.pressures.standard;
                const maxHp=Math.round(q.enemy.hp*(enemy.tier==="首领"?3:enemy.tier==="精英"?1.6:1)*
                    C.guzongTempo.hp[enemy.tier]*(1+stage*pressure.hp));
                const setup=Core.clone(config.setup);
                setup.enemy={id:enemy.id,name:enemy.name,maxHp,
                    };
                setup.qingming={enemyId:row.qingmingEnemy,enemyMp:q.enemy.mp,enemyDefense:q.enemy.defense,
                    enemyAttack:Math.round(q.enemy.attack*(enemy.tier==="首领"?1.5:enemy.tier==="精英"?1.2:1)*
                        (1+stage*pressure.attack)),seed:s.qingming.rng,loadout:Core.clone(s.qingming)};
                if(carry)setup.weapon=Core.clone(carry.weapon);
                const previous=s.battles[s.battles.length-1]?.state;
                const initial=Core.start(setup,`${s.runId}_${s.battles.length+1}`,carry || (previous?
                    {hp:previous.player.hp,mp:previous.player.mp,weapon:previous.weapon,pouch:previous.pouch}:undefined));
                s.battles.push({setup,initial,actions:[],state:Core.clone(initial)});s.phase="battle";break;
            }
            case "action": {
                if(s.phase!=="battle")throw new Error("当前没有战斗");
                const record=s.battles[s.battles.length-1];
                battle=Core.resolve(record.setup,record.state,command.action);
                if(battle.ok===false)throw new Error(battle.reason);
                record.actions.push({at,action:Core.clone(command.action)});record.state=battle.state;
                if(battle.state.phase==="defeat")end("defeat");
                else if(battle.state.phase==="victory") {
                    const row=encounterId?config.encounters.find(e=>e.id===encounterId):config.encounters[s.battles.length-1];
                    if(!row || row.qingmingEnemy!==record.setup.qingming.enemyId || s.sources.includes(row.id))
                        throw new Error("战斗来源不匹配或已结算");
                    s.sources.push(row.id);s.phase="ready";
                    if(s.battles.length<=config.qingming.battleRewards)s=this.offer(s,`qingming:${row.id}`);
                }
                break;
            }
            case "extract": ready();end("complete");break;
            case "abandon": end("abandon");break;
            case "timeout": end("timeout");break;
            default: throw new Error("青冥构筑不使用旧借法、强化点或道韵");
        }
        s.revision++;return {state:s,battle};
    }
}
