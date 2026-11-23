import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { BuildRules as Build } from "../../build/utils/BuildRules";
import { InventoryRules as Inventory } from "../../inventory/utils/InventoryRules";
import type { BattleResult } from "../../skillBattle/types/BattleTypes";
import type { ExpeditionCommand, ExpeditionConfig, ExpeditionNode, ExpeditionSource, ExpeditionState } from "../types/ExpeditionRunTypes";
import { EXPEDITION_LOOT_FAMILIES, isBattleNode } from "../types/ExpeditionRunTypes";
import { ENEMIES } from "../../skillBattle/utils/CombatConfig";


class Random {
    private value: number;
    constructor(seed: number, key: string) {
        let hash = seed >>> 0;
        for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i),16777619) >>> 0;
        this.value = hash || 1;
    }
    below(limit: number): number {
        const ceiling = 0x100000000 - 0x100000000 % limit;
        let v: number;
        do {
            let x = this.value; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
            v = this.value = x >>> 0;
        } while (v >= ceiling);
        return v % limit;
    }
    weighted(weights: number[]): number {
        let n = this.below(weights.reduce((a,b) => a + b,0));
        for (let i = 0; i < weights.length; i++) { n -= weights[i]; if (n < 0) return i; }
        throw new Error("随机权重无效");
    }
    shuffle<T>(values: T[]): T[] {
        const rows = values.slice();
        for(let i=rows.length-1;i>0;i--) { const j=this.below(i+1);[rows[i],rows[j]]=[rows[j],rows[i]]; }
        return rows;
    }
}

export class ExpeditionRules {
    static readonly searchCheckpointMs = 250;
    static pendingWarnings(c: ExpeditionConfig, s: ExpeditionState, at: number): number[] {
        return [600000,300000].filter(ms => ms < c.rules.limitMs &&
            at >= s.deadlineAt! - ms && !s.map.warnings.includes(ms));
    }
    static node(config: ExpeditionConfig, id: number, state?: ExpeditionState) {
        const row = (state?.map.nodes.length ? state.map.nodes : config.nodes).find(n => n.id === id);
        if (!row) throw new Error("地图节点不存在");
        return row;
    }
    static validateConfig(c: ExpeditionConfig): void {
        Inventory.validateConfig(c);
        if (!c.mapVersion || !c.nodes.length || new Set(c.nodes.map(n => n.id)).size !== c.nodes.length ||
            new Set(c.nodes.map(n => n.key)).size !== c.nodes.length ||
            !Number.isSafeInteger(c.rules.limitMs) || c.rules.limitMs <= 0 ||
            !Number.isSafeInteger(c.rules.searchMs) || c.rules.searchMs < this.searchCheckpointMs)
            throw new Error("正式地图版本、节点或时限无效");
        if (!Number.isSafeInteger(c.rules.recoveryPercent) || c.rules.recoveryPercent < 1 || c.rules.recoveryPercent > 100 ||
            new Set(c.pools.map(p => p.id)).size !== c.pools.length ||
            new Set(c.pools.map(p => p.code)).size !== c.pools.length)
            throw new Error("恢复、补给或掉落条件权重无效");
        const poolIds = new Set(c.pools.map(p => p.id));
        for (const n of c.nodes) {
            if (!Number.isSafeInteger(n.id) || n.id < 1 || !n.key ||
                !["start","normal","elite","boss","search","borrow","insight","transit","extract","recovery"].includes(n.kind) ||
                !Number.isFinite(n.x) || !Number.isFinite(n.y) ||
                ((isBattleNode(n) || n.kind === "search") ? !poolIds.has(n.poolId) : n.poolId !== 0) ||
                isBattleNode(n) && !c.build.encounters.some(e => e.id === `battle:${n.key}`))
                throw new Error(`地图节点类型或掉落池引用无效：${n.id}`);
        }
        const searches = c.nodes.filter(n => n.kind === "search");
        {
            if (searches.some(n => !Number.isSafeInteger(n.searchMin) || n.searchMin! < 0 ||
                !Number.isSafeInteger(n.searchMax) || n.searchMax! < n.searchMin! ||
                !Number.isSafeInteger(n.searchWeight) || n.searchWeight! <= 0 ||
                !/^[a-z]+(?:-[a-z]+)*$/.test(n.icon || "")) ||
                searches.reduce((sum,n) => sum+n.searchWeight!,0) !== 100 ||
                (
                    searches.reduce((sum,n) => sum+n.searchMin!,0) > c.rules.searchMin ||
                    searches.reduce((sum,n) => sum+n.searchMax!,0) < c.rules.searchMax))
                throw new Error("搜索节点分类或数量预算无效");
        }
        const budgets = [c.rules.normalMin,c.rules.normalMax,c.rules.eliteMin,c.rules.eliteMax,
            c.rules.insightMin,c.rules.insightMax,c.rules.borrowMin,c.rules.borrowMax];
        if (budgets.some(v=>!Number.isSafeInteger(v)||v!<=0) ||
            c.rules.normalMin!<13 || c.rules.normalMax!>16 || c.rules.normalMin!>c.rules.normalMax! ||
            c.rules.eliteMin!<4 || c.rules.eliteMax!>7 || c.rules.eliteMin!>c.rules.eliteMax! ||
            c.rules.insightMin!<2 || c.rules.insightMax!>4 || c.rules.insightMin!>c.rules.insightMax! ||
            c.rules.borrowMin!<3 || c.rules.borrowMax!>5 || c.rules.borrowMin!>c.rules.borrowMax! ||
            c.nodeLimit!==65) throw new Error("地图节点预算无效");
        if(c.nodes.filter(n=>n.kind==="normal").length!==11 || c.nodes.filter(n=>n.kind==="elite").length!==3 ||
            c.nodes.filter(n=>n.kind==="boss").length!==1 || !c.weight || c.staminaMax!==c.rules.staminaMax ||
            !["start","transit","borrow","insight","extract","recovery"].every(kind=>c.nodes.some(n=>n.kind===kind)) ||
            c.nodes.filter(n=>n.kind==="search").length<1 ||
            ![c.rules.staminaMax,c.rules.moveCost,c.rules.normalCost,c.rules.eliteCost,c.rules.bossCost,c.rules.searchCost,
                c.rules.moveHpPercent,c.rules.searchHpPercent,c.rules.transitMin,c.rules.transitMax,
                c.rules.searchMin,c.rules.searchMax].every(v=>Number.isSafeInteger(v)&&v>0) ||
            c.rules.moveHpPercent>100 || c.rules.searchHpPercent>100 ||
            c.rules.transitMin<10 || c.rules.transitMax>14 || c.rules.transitMin>c.rules.transitMax ||
            c.rules.searchMin<8 || c.rules.searchMax>12 || c.rules.searchMin>c.rules.searchMax)
            throw new Error("随机图规模、体力或承重配置无效");
        for (const p of c.pools) {
            if (!Number.isSafeInteger(p.id) || p.id <= 0 || !/^[a-z][a-zA-Z]*$/.test(p.code) ||
                ![p.min,p.max,p.minWeight,...p.durability].every(Number.isSafeInteger) ||
                ![p.categories,p.qualities].every(w => w.every(n => Number.isSafeInteger(n) && n >= 0) &&
                w.reduce((a,b) => a+b,0) === 100) || p.categories.length !== EXPEDITION_LOOT_FAMILIES.length || p.qualities.length !== 6 ||
                p.min < 1 || p.max > 4 || p.min > p.max || p.minWeight < 0 || p.minWeight > 100 ||
                p.durability[0] < 0 || p.durability[1] > 100000000 ||
                p.durability[0] > p.durability[1])
                throw new Error(`掉落池配置无效：${p.id}`);
        }
        const familyKinds = new Map<string, string>([
            ["hp","hp"],["mp","mp"],["mixed","mixed"],["shield","shield"],["repair","repair"],["stamina","stamina"],
            ["herb","material"],["ore","material"],["beast","material"],["relic","material"],
            ["weapon","weapon"],["armor","armor"],["accessory","accessory"],["book","book"],["container","container"],
        ]);
        const families = new Set(familyKinds.keys());
        for (const v of c.variants) {
            const template = c.templates.find(t => t.id === v.templateId);
            if (!template || template.kind !== familyKinds.get(v.family) ||
                !Number.isSafeInteger(v.weight) || v.weight <= 0)
                throw new Error(`掉落条目 ${v.family} 引用的物品编号或权重无效：${v.templateId}`);
            families.delete(v.family);
        }
        if (families.size) throw new Error(`掉落组缺少物品：${[...families].join("、")}`);
    }
    static start(c: ExpeditionConfig, seed: number, runId: string): ExpeditionState {
        this.validateConfig(c);
        const base = Inventory.start(c,seed,runId);
        const state: ExpeditionState = { ...base, node: 1, stamina: c.rules.staminaMax,
            sourceLayouts: [], interactionSource: null, map: { version: c.mapVersion,
                generatorVersion: 4, nodes: [], edges: [],
            present: [], visible: [], cleared: [], used: [], sources: [], warnings: [], warning: null } };
        let slot = 0;
        for (const item of state.items) {
            const template = Inventory.template(c,item), kind = template.kind;
            if(kind==="stamina")continue;
            const rotated = template.height > c.spaces.battleHeight && template.rotate;
            item.location = Inventory.isEquipment(kind) || kind === "container" ? { space: kind } :
                kind === "repair" ? { space: "bag", x: 0, y: 0, rotated: false } :
                { space: "battle", x: slot, y: 0, rotated };
            if (item.location.space === "battle") slot += Inventory.dimensions(template,item.location)[0];
        }
        const initialStats=Inventory.stats(c,state);
        state.hp=initialStats.hp;state.mp=initialStats.mp;
        Inventory.validate(c,state);
        return state;
    }
    private static generateLongRouteMap(c: ExpeditionConfig, s: ExpeditionState, seed: number): void {
        const random = new Random(seed,"long-route-map");
        const range = (a:number,b:number) => a+random.below(b-a+1);
        const pick = (kind:string) => Core.clone(c.nodes.find(n=>n.kind===kind)!);
        const add = (row:ExpeditionNode,x:number,y:number,mainOrder=-1) => {
            const id=s.map.nodes.length+1;
            s.map.nodes.push({...row,id,key:`${row.key}@${id}`,x,y,mainOrder,
                ...(isBattleNode(row)?{encounterKey:row.key}:{})});
            return id;
        };
        const sample = (kind:string,count:number) => {
            const templates=random.shuffle(c.nodes.filter(n=>n.kind===kind));
            return random.shuffle(Array.from({length:count},(_,i)=>templates[i%templates.length]));
        };
        const normals=sample("normal",range(c.rules.normalMin!,c.rules.normalMax!));
        const elites=sample("elite",range(c.rules.eliteMin!,c.rules.eliteMax!));
        const transitCount=range(c.rules.transitMin,c.rules.transitMax);
        const searchCount=range(c.rules.searchMin,c.rules.searchMax);
        const searchTemplates=c.nodes.filter(n=>n.kind==="search");
        const alchemyId = c.pools.find(p => p.code === "alchemy")?.id;
        let searches: ExpeditionNode[];
        {
            const counts=searchTemplates.map(n=>n.searchMin!);
            for(let left=searchCount-counts.reduce((sum,n)=>sum+n,0);left>0;left--) {
                const weights=searchTemplates.map((n,i)=>counts[i]<n.searchMax!?n.searchWeight!:0);
                counts[random.weighted(weights)]++;
            }
            searches=random.shuffle(searchTemplates.flatMap((n,i)=>Array.from({length:counts[i]},()=>n)));
            const supply=searches.findIndex(n=>n.poolId===alchemyId);
            if(supply>=0)searches.unshift(...searches.splice(supply,1));
        }
        const insightCount=range(c.rules.insightMin!,c.rules.insightMax!);
        const borrowCount=range(c.rules.borrowMin!,c.rules.borrowMax!);
        const recoveryCount=range(1,2), exitCount=range(1,2);
        const mainSearch=range(1,2);
        const total=3+normals.length+elites.length+searchCount+insightCount+borrowCount+transitCount+recoveryCount+exitCount;
        const mainTransit=Math.min(total-35-mainSearch,Math.max(range(7,9),9-mainSearch));
        const main=[
            pick("transit"),normals.pop()!,
            ...random.shuffle([...normals.splice(0,5),...elites.splice(0,2),
                ...searches.splice(0,mainSearch),...Array.from({length:mainTransit-1},()=>pick("transit"))])
        ];
        const supplyIndex=main.findIndex(n=>n.poolId===alchemyId);
        if(supplyIndex>=0) {
            const early=2+random.below(5);
            [main[early],main[supplyIndex]]=[main[supplyIndex],main[early]];
        }
        const fights=main.flatMap((n,i)=>isBattleNode(n)?[i]:[]);
        const first=range(fights[1]+1,fights[2]);
        const later=random.shuffle(Array.from({length:main.length-first},(_,i)=>first+i+1)).slice(0,2);
        for (const index of [first,...later].sort((a,b)=>b-a)) main.splice(index,0,pick("borrow"));
        const columns=[1,...random.shuffle(Array.from({length:23},(_,i)=>i+2))
            .slice(0,main.length-1).sort((a,b)=>a-b)];
        const mirror=random.below(2)?1:-1, mainLane=0.4*mirror;
        add(pick("start"),0,0,0);
        main.forEach((row,i)=>add(row,columns[i],mainLane,i+1));
        const reference=s.map.nodes.slice(), last=reference.length-1;
        for (let id=2;id<=reference.length;id++) s.map.edges.push([id-1,id]);
        const extra=random.shuffle([
            ...normals,...elites,...searches,
            ...Array.from({length:insightCount},()=>pick("insight")),
            ...Array.from({length:borrowCount-3},()=>pick("borrow")),
            ...Array.from({length:transitCount-mainTransit},()=>pick("transit")),
            ...Array.from({length:recoveryCount},()=>pick("recovery")),
            ...Array.from({length:exitCount},()=>pick("extract"))
        ]);
        const innerStart=range(3,4), innerEnd=range(last-6,last-5);
        const outerEnd=range(last-1,last);
        const routes=[
            {from:1,to:outerEnd,y:-1.1*mirror,phase:0,count:10},
            {from:innerStart,to:innerEnd,y:-0.35*mirror,phase:0.5,count:6},
            {from:range(innerStart+3,innerStart+4),to:range(last-3,last-2),
                y:1.15*mirror,phase:0.5,count:5}
        ];
        const slots = (r:typeof routes[number]) => Array.from({length:24},(_,i)=>i+r.phase)
            .filter(x=>x>reference[r.from].x&&x<reference[r.to].x);

        for (let remaining=extra.length-routes.reduce((n,r)=>n+r.count,0);remaining>0;remaining--) {
            const available=routes.filter(r=>r.count<slots(r).length);
            if(!available.length)throw new Error("长分流节点位置不足");
            available[random.below(available.length)].count++;
        }
        for (const r of routes) {
            const available=slots(r);
            const xs=Array.from({length:r.count},(_,i)=>available[Math.round(i*(available.length-1)/(r.count-1))]);
            let previous=reference[r.from].id;
            for (const x of xs) {
                const id=add(extra.pop()!,x,r.y);
                s.map.edges.push([previous,id]);previous=id;
            }
            s.map.edges.push([previous,reference[r.to].id]);
        }
        if (extra.length) throw new Error("长分流节点预算未分配完毕");
        const boss=add(pick("boss"),26,0), terminal=add(pick("extract"),27,0);
        s.map.edges.push([reference[last].id,boss],[boss,terminal]);
        s.map.present=s.map.nodes.map(n=>n.id); s.map.visible=[1]; s.revealed=[1];
    }
    static browseWidth(s: ExpeditionState, viewportWidth: number, pitch=242): number {
        const end=Math.max(viewportWidth,...s.map.nodes.map(n=>112+n.x*pitch+80));
        return Math.min(end,viewportWidth+Math.max(0,s.revealed.length-1)*2*pitch);
    }
    static displayNodes(s: ExpeditionState, viewportWidth=1280, pitch=242): number[] {
        const width=this.browseWidth(s,viewportWidth,pitch);
        return s.map.nodes.filter(n=>112+n.x*pitch-58<width).map(n=>n.id);
    }
    static reachable(c: ExpeditionConfig, s: ExpeditionState): Set<number> {
        return new Set(this.travelPaths(c,s).keys());
    }
    static travelPaths(c: ExpeditionConfig, s: ExpeditionState): Map<number,number[]> {
        const paths=new Map([[s.node,[s.node]]]);
        if(s.map.debugEnemyBlocking!==false&&isBattleNode(this.node(c,s.node,s))&&!s.map.cleared.includes(s.node))return paths;
        for(const [a,b]of s.map.edges) {
            const next=a===s.node?b:b===s.node?a:null;
            if(next!==null)paths.set(next,[s.node,next]);
        }
        return paths;
    }
    static recovery(c: ExpeditionConfig, s: ExpeditionState): { hp: number; mp: number } {
        const p = Inventory.stats(c,s), ratio = c.rules.recoveryPercent / 100;
        return { hp: Math.min(p.hp-s.hp,Math.round(p.hp*ratio)),
            mp: Math.min(p.mp-s.mp,Math.round(p.mp*ratio)) };
    }
    static source(s: ExpeditionState): ExpeditionSource | undefined { return s.map.sources.find(b => b.node === s.node); }
    static searchDuration(c: ExpeditionConfig, s: ExpeditionState): number {
        const box=this.source(s),item=box?.entries[box.revealed];
        return item ? c.rules.searchMs*Math.max(1,Inventory.template(c,item).quality || 1) : 0;
    }
    static makeSource(c: ExpeditionConfig, s: ExpeditionState, seed: number): void {
        if (this.source(s)) throw new Error("箱来源已生成");
        const node = this.node(c,s.node,s), random = new Random(seed,`loot:${node.key}`);
        const pool = c.pools.find(p => p.id === node.poolId);
        if (!pool) throw new Error("节点来源池不存在");
        const count = random.below(100) < pool.minWeight ? pool.min : pool.max;
        const entries: ExpeditionSource["entries"] = [];
        for (let i = 0; i < count; i++) {
            const family = pool.code === "alchemy" && i < 2 ? ["hp","mp"][i] :
                EXPEDITION_LOOT_FAMILIES[random.weighted(pool.categories)];
            const candidates = c.variants.filter(v => v.family === family);
            const qualities = pool.qualities.map((weight,index) =>
                candidates.some(v=>c.templates.find(t=>t.id===v.templateId)!.quality===index+1) ? weight : 0);
            // 来源先抽现有品质；该类别没有来源偏好品质时，按条目权重抽取。
            const quality = qualities.some(Boolean) ? random.weighted(qualities)+1 : null;
            const variants = candidates.filter(v => quality === null || c.templates.find(t=>t.id===v.templateId)!.quality===quality);
            const templateId = variants[random.weighted(variants.map(v => v.weight))].templateId;
            const template = c.templates.find(t=>t.id===templateId)!;
            const max = Math.min(pool.durability[1],template.weaponDurability);
            const min = Math.min(pool.durability[0],max);
            const durability = Inventory.isEquipment(family) ? min+random.below(max-min+1) : undefined;
            entries.push(Inventory.createItem(c,templateId,`${s.runId}:loot:${node.key}:${i}`,
                {space:"source",node:s.node},seed,durability));
        }
        s.map.sources.push({ node: s.node, entries, opened: false, revealed: 0, progressMs: 0 });
        s.sourceLayouts!.push({node:s.node,slots:[]});
        Inventory.syncSources(c,s);
    }
    private static pay(c: ExpeditionConfig,s: ExpeditionState,cost:number,hpPercent:number): boolean {
        if(s.stamina!>=cost) { s.stamina!-=cost;return true; }
        s.hp=Math.max(0,s.hp-Math.round(Inventory.stats(c,s).hp*hpPercent/100));
        if(s.hp>0)return true;
        s.flow!.phase="ended";s.flow!.endReason="defeat";s.flow!.pending=null;
        Inventory.settle(s,"defeat");return false;
    }
    private static battleConfig(c: ExpeditionConfig,s: ExpeditionState) {
        return {...c.build,encounters:s.map.nodes.filter(isBattleNode).map(n=>{
            const template=c.build.encounters.find(e=>e.id===`battle:${n.encounterKey}`);
            if(!template)throw new Error("地图敌人模板不存在");
            return {...template,id:`battle:${n.key}`,enemyId:n.enemyId};
        })};
    }
    static apply(c: ExpeditionConfig, snapshot: ExpeditionState,
        command: ExpeditionCommand, at: number, seed: number): { state: ExpeditionState; battle?: BattleResult } {
        let s = Core.clone(snapshot), battle: BattleResult | undefined;
        if (!command || s.phase === "ended") throw new Error("本局已结算");
        if (!Number.isSafeInteger(at) || at < 0) throw new Error("操作时间无效");
        if (s.deadlineAt !== null && (command.type === "timeout" ? at < s.deadlineAt : at >= s.deadlineAt))
            throw new Error("已到截止，须先结算超时");
        const ready = () => {
            if (s.phase !== "active" || s.flow?.phase !== "ready" || s.flow.pending)
                throw new Error("请先完成当前选择或战斗");
        };
        const finish = (reason: "extract" | "abandon" | "timeout") => {
            if (s.phase !== "active" || !s.flow) throw new Error("当前未入境");
            s.flow = Build.apply(c.build,s.flow,{ type: reason },at).state;
            Inventory.settle(s,reason);
        };
        switch (command.type) {
            case "debugEnemyBlocking":
                ready();
                if (typeof command.enabled !== "boolean") throw new Error("怪物拦路开关无效");
                s.map.debugEnemyBlocking = command.enabled;
                break;
            case "enter":
                if (s.phase !== "preparation") throw new Error("不能重复入境");
                s.flow = Build.start(c.build,seed,s.runId);
                s.phase = "active"; s.enteredAt = at; s.deadlineAt = at + c.rules.limitMs;
                this.generateLongRouteMap(c,s,seed);
                {
                    for(const n of s.map.nodes.filter(isBattleNode)) {
                        const tier=n.kind==="boss"?3:n.kind==="elite"?2:1;
                        const pool=ENEMIES.filter(e=>e.tier===tier);
                        const enemy=pool[new Random(seed,`enemy:${n.key}`).below(pool.length)];
                        n.enemyId=enemy.id;n.name=enemy.name;
                    }
                }
                break;
            case "travel": {
                ready();
                if (command.node === s.node || !this.reachable(c,s).has(command.node)) throw new Error("该节点不可达");
                if(!this.pay(c,s,c.rules.moveCost,c.rules.moveHpPercent))break;
                s.node = command.node;
                s.interactionSource=null;
                if (!s.revealed.includes(s.node)) s.revealed.push(s.node);
                s.map.visible=[...s.revealed];
                const n = this.node(c,s.node,s);
                if (n.kind === "search" && !this.source(s)) this.makeSource(c,s,seed);
                break;
            }
            case "fight": {
                ready();
                const n=this.node(c,s.node,s);
                if(!isBattleNode(n)||s.map.cleared.includes(n.id))throw new Error("此处没有待战敌人");
                const cost=n.kind==="boss"?c.rules.bossCost:n.kind==="elite"?c.rules.eliteCost:c.rules.normalCost;
                if(s.stamina!<cost)throw new Error(`体力不足，开战需要 ${cost}，当前 ${s.stamina}`);
                s.stamina!-=cost;
                s.flow=Build.apply(this.battleConfig(c,s),s.flow!,{type:"battle"},at,Inventory.carry(c,s),
                    `battle:${n.key}`).state;
                {
                    const initial=s.flow.battles[s.flow.battles.length-1].state;
                    s.hp=initial.player.hp;s.mp=initial.player.mp;
                    for(const gear of initial.equipment){
                        const item=Inventory.item(s,gear.itemUid);item.equipment=Core.clone(gear.instance);item.durability=gear.instance.durability;
                    }
                    if(initial.phase==="defeat")Inventory.settle(s,"defeat");
                }
                break;
            }
            case "borrow": case "insight":
                ready();
                if (this.node(c,s.node,s).kind !== command.type || s.map.used.includes(s.node)) throw new Error("此处奖励不可用");
                s.flow = Build.offer(c.build,s.flow!,`${command.type}:${this.node(c,s.node,s).key}`,
                    command.type === "borrow" ? "active" : "passive");
                s.map.used.push(s.node);
                break;
            case "recover": {
                ready();
                if (this.node(c,s.node,s).kind !== "recovery" || s.map.used.includes(s.node)) throw new Error("恢复处不可用");
                const value = this.recovery(c,s);
                if (!value.hp && !value.mp) throw new Error("生命灵力已满，机会未使用");
                s.hp += value.hp; s.mp += value.mp; s.map.used.push(s.node);
                break;
            }
            case "openSource": {
                ready();
                const box=this.source(s);
                if(!box || box.opened)throw new Error("此处来源已打开或不存在");
                if(!this.pay(c,s,c.rules.searchCost,c.rules.searchHpPercent))break;
                box.opened=true;
                s.interactionSource=s.node;
                break;
            }
            case "interactSource":
                ready();
                if(!this.source(s)?.opened)throw new Error("请先开始搜索此来源");
                s.interactionSource=s.node;
                break;
            case "search": {
                ready();
                const box = this.source(s);
                if (!box || !box.opened || box.revealed >= box.entries.length || !Number.isInteger(command.deltaMs) ||
                    command.deltaMs < 1 || command.deltaMs > this.searchCheckpointMs) throw new Error("搜索进度无效");
                const duration=this.searchDuration(c,s);
                box.progressMs += command.deltaMs;
                if (box.progressMs >= duration) {
                    s.items.push(Core.clone(box.entries[box.revealed++]));
                    box.progressMs -= duration;
                    if (box.revealed === box.entries.length) box.progressMs = 0;
                }
                break;
            }
            case "warnings": {
                if (s.phase !== "active") throw new Error("当前未入境");
                const crossed = this.pendingWarnings(c,s,at);
                if (!crossed.length) throw new Error("没有新的计时提示");
                s.map.warnings.push(...crossed); s.map.warning = Math.min(...crossed);
                break;
            }
            case "extract":
                ready();
                if (this.node(c,s.node,s).kind !== "extract") throw new Error("须到撤离点确认");
                finish("extract"); break;
            case "abandon": case "timeout": finish(command.type); break;
            case "build": {
                if (s.phase !== "active" || !s.flow || !["choose","action","loadout"].includes(command.command.type))
                    throw new Error("图上战斗及奖励须由对应节点发起");
                const n=this.node(c,s.node,s);
                const result = Build.apply(this.battleConfig(c,s),s.flow,command.command,at,Inventory.carry(c,s),
                    `battle:${n.key}`);
                s.flow = result.state; battle = result.battle;
                if (battle?.ok) {
                    s.hp = battle.state.player.hp; s.mp = battle.state.player.mp;
                    for(const gear of battle.state.equipment){
                        const item=Inventory.item(s,gear.itemUid);item.equipment=Core.clone(gear.instance);item.durability=gear.instance.durability;
                    }
                    if (command.command.type === "action" && command.command.action.type === "potion") {
                        const item = Inventory.item(s,command.command.action.itemUid);
                        if (item.location.space !== "battle") throw new Error("药品不在斗法匣");
                        item.location = { space: "consumed" }; s.consumed.push(item.uid);
                    }
                    if (battle.state.phase === "victory") {
                        if (s.map.cleared.includes(s.node)) throw new Error("战后来源重复");
                        s.map.cleared.push(s.node); this.makeSource(c,s,seed);
                    }
                    if (s.flow.endReason === "defeat") Inventory.settle(s,"defeat");
                }
                break;
            }
            default: {

                if (s.phase === "active" && s.flow?.pending) throw new Error("请先完成强制选择");
                const result = Inventory.apply(c,s,command,at);
                s = result.state as ExpeditionState;
                s.revision--;
            }
        }
        if (s.warehouseLayout) s.warehouseLayout = Inventory.warehousePlacements(c,s);
        Inventory.syncSources(c,s);
        if(s.flow?.phase!=="battle")Inventory.clampResources(c,s);
        s.revision++;
        Inventory.validate(c,s);
        return { state: s, battle };
    }
}
