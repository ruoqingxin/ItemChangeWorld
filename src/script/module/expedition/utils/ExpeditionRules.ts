import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { BuildRules as Build } from "../../build/utils/BuildRules";
import { InventoryRules as Inventory } from "../../inventory/utils/InventoryRules";
import type { NewBattleResult } from "../../skillBattle/types/BattleTypes";
import type { NewBuildProfile } from "../../build/types/BuildTypes";
import type { ExpeditionCommand, ExpeditionConfig, ExpeditionNode, ExpeditionSource, ExpeditionState } from "../types/ExpeditionRunTypes";

/** Source-keyed streams keep map placement, construction and each box independent. */
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
    static node(config: ExpeditionConfig, id: number, state?: ExpeditionState) {
        const row = (state?.map.nodes.length ? state.map.nodes : config.nodes).find(n => n.id === id);
        if (!row) throw new Error("地图节点不存在");
        return row;
    }
    static validateConfig(c: ExpeditionConfig, profile: NewBuildProfile): void {
        Inventory.validateConfig(c,profile);
        if (!c.mapVersion || !c.nodes.length || new Set(c.nodes.map(n => n.id)).size !== c.nodes.length ||
            new Set(c.nodes.map(n => n.key)).size !== c.nodes.length ||
            c.rules.limitMs !== 1200000 || c.rules.searchMs !== 1000 || c.rules.checkpointMs !== 250)
            throw new Error("正式地图版本、节点或时限无效");
        const weights = (values: number[]) => Array.isArray(values) && values.every(v =>
            Number.isSafeInteger(v) && v >= 0) && values.reduce((a,b) => a+b,0) === 100;
        if (!weights(c.rules.supply) || !weights(c.rules.books) || c.rules.supply.length !== 3 || c.rules.books.length !== 3 ||
            !Number.isSafeInteger(c.rules.recoveryPercent) || c.rules.recoveryPercent < 1 || c.rules.recoveryPercent > 100 ||
            c.pools.length !== 5 || new Set(c.pools.map(p => p.id)).size !== 5 ||
            !["normal","elite","boss","search","risk"].every(id => c.pools.some(p => p.id === id)))
            throw new Error("恢复、补给或掉落条件权重无效");
        for (const n of c.nodes) {
            if (!Number.isInteger(n.id) || n.id < 1 || n.id > 32 ||
                !["start","normal","elite","boss","search","borrow","insight","transit","extract","recovery"].includes(n.kind) ||
                !Number.isFinite(n.x) || !Number.isFinite(n.y) ||
                !!n.enemy !== ["normal","elite","boss"].includes(n.kind) ||
                n.enemy && !c.build.encounters.some(e => e.id === `battle:${n.key}`))
                throw new Error("地图类型或敌人绑定无效");
        }
        if(c.nodes.filter(n=>n.kind==="normal").length!==11 || c.nodes.filter(n=>n.kind==="elite").length!==3 ||
            c.nodes.filter(n=>n.kind==="boss").length!==1 || !c.weight || c.staminaMax!==c.rules.staminaMax ||
            !["start","transit","borrow","insight","extract","recovery"].every(kind=>c.nodes.some(n=>n.kind===kind)) ||
            c.nodes.filter(n=>n.kind==="search").length<c.rules.searchMax ||
            ![c.rules.staminaMax,c.rules.moveCost,c.rules.normalCost,c.rules.eliteCost,c.rules.bossCost,c.rules.searchCost,
                c.rules.moveHpPercent,c.rules.searchHpPercent,c.rules.transitMin,c.rules.transitMax,
                c.rules.searchMin,c.rules.searchMax].every(v=>Number.isSafeInteger(v)&&v>0) ||
            c.rules.moveHpPercent>100 || c.rules.searchHpPercent>100 ||
            c.rules.transitMin<10 || c.rules.transitMax>14 || c.rules.transitMin>c.rules.transitMax ||
            c.rules.searchMin<3 || c.rules.searchMax>5 || c.rules.searchMin>c.rules.searchMax)
            throw new Error("随机图规模、体力或承重配置无效");
        for (const p of c.pools) {
            if (![p.categories,p.qualities].every(w => w.every(n => Number.isSafeInteger(n) && n >= 0) &&
                w.reduce((a,b) => a+b,0) === 100) || p.categories.length !== 9 || p.qualities.length !== 6 ||
                p.min < 1 || p.max > 4 || p.min > p.max || p.minWeight < 0 || p.minWeight > 100 ||
                p.durability[0] < 0 || p.durability[1] > 60 || p.durability[0] > p.durability[1])
                throw new Error("掉落池无效");
        }
        for (const group of ["recoveryCount","recoveryAttach","exitCount","exit2","exit3"]) {
            const rows = c.placements.filter(r => r.group === group);
            if (!rows.length || rows.some(r => !Number.isSafeInteger(r.weight) || r.weight <= 0) ||
                rows.reduce((a,b) => a+b.weight,0) !== 100) throw new Error("布点条件权重无效");
        }
        for (const family of ["hp","mp","repair","herb","ore","small","weapon","bookSword","bookEarth","bookCommon",
            ...[1,2,3,4,5,6].map(q => `container${q}`)]) {
            const rows = c.variants.filter(r => r.family === family);
            if (!rows.length || rows.some(r => !c.templates.some(t => t.id === r.templateId) ||
                !Number.isSafeInteger(r.weight) || r.weight <= 0)) throw new Error("掉落子项无效");
        }
    }
    static start(c: ExpeditionConfig, p: NewBuildProfile, seed: number, runId: string, generatorVersion: 1|2 = 2): ExpeditionState {
        this.validateConfig(c,p);
        const base = Inventory.start(c,p,seed,runId);
        const state: ExpeditionState = { ...base, node: 1, stamina: c.rules.staminaMax,
            sourceLayouts: [], interactionSource: null, map: { version: c.mapVersion,
                ...(generatorVersion===2?{generatorVersion:2 as const}:{}), nodes: [], edges: [],
            present: [], visible: [], cleared: [], used: [], sources: [], warnings: [], warning: null } };
        let slot = 0;
        for (const item of state.items) {
            const kind = Inventory.template(c,item).kind;
            if(kind==="stamina")continue;
            item.location = kind === "weapon" || kind === "container" ? { space: kind } :
                kind === "repair" ? { space: "bag", x: 0, y: 0, rotated: false } :
                { space: "battle", x: slot++, y: 0, rotated: false };
        }
        Inventory.validate(c,state);
        return state;
    }
    private static generateMap(c: ExpeditionConfig, s: ExpeditionState, seed: number): void {
        const random = new Random(seed,"map");
        const pick = (kind: string) => Core.clone(c.nodes.find(n=>n.kind===kind)!);
        const range = (a:number,b:number) => a+random.below(b-a+1);
        const add = (row: ExpeditionNode,x:number,y:number,mainOrder=-1) => {
            const id=s.map.nodes.length+1;
            const node={...row,id,key:`${row.key}@${id}`,x,y,mainOrder,
                ...(row.enemy?{encounterKey:row.key}:{})};
            s.map.nodes.push(node);return id;
        };
        const link=(a:number,b:number) => {
            if(a!==b&&!s.map.edges.some(e=>e.includes(a)&&e.includes(b)))s.map.edges.push([a,b]);
        };
        const normals=random.shuffle(c.nodes.filter(n=>n.kind==="normal"));
        const elites=random.shuffle(c.nodes.filter(n=>n.kind==="elite"));
        const transit=()=>pick("transit"), borrow=()=>pick("borrow");
        const searches=random.shuffle(c.nodes.filter(n=>n.kind==="search"));
        const mains: ExpeditionNode[][] = [
            [transit(),normals.pop()!,transit(),normals.pop()!],
            [searches.pop()!,transit(),normals.pop()!,transit(),normals.pop()!,elites.pop()!],
            [transit(),normals.pop()!,transit(),normals.pop()!,transit(),elites.pop()!,transit()],
        ];
        // Shared rewards between legs keep all three borrows available in one run.
        const extra=[...normals,...elites,pick("insight")];
        for(let i=1,n=range(c.rules.searchMin,c.rules.searchMax);i<n;i++)extra.push(searches.pop()!);
        for(let i=0,n=range(1,2);i<n;i++)extra.push(pick("recovery"));
        for(let i=8,n=range(c.rules.transitMin,c.rules.transitMax);i<n;i++)extra.push(transit());
        const branches: ExpeditionNode[][]=[[],[],[]];
        random.shuffle(extra).forEach((row,i)=>branches[i%3].push(row));
        let previous=add(pick("start"),0,0,0),order=0;
        const merges:number[]=[];
        for(let leg=0;leg<3;leg++) {
            if(s.map.generatorVersion===2) {
                const routeCount=range(2,4);
                const levels=routeCount===4?[-1.1,-0.3,0.5,1.3]:[-1.1,0,1.1];
                const lanes=random.shuffle(levels.map((y,i)=>({y,phase:routeCount===4&&i%2?0.5:0})));
                const lane=lanes[0],content=leg===0?mains[leg]:random.shuffle(mains[leg]);
                // Stagger the four compact lanes by half a column to keep node hit areas apart.
                const slots=(from:number,to:number,phase:number) => {
                    const xs:number[]=[];
                    for(let x=leg*8+phase;x<leg*8+8;x+=routeCount===4?1:0.5)
                        if(x>from&&x<to)xs.push(x);
                    return xs;
                };
                const place=(rows:ExpeditionNode[],from:number,to:number,lane:{y:number;phase:number},main=false) => {
                    const xs=slots(from,to,lane.phase);
                    if(xs.length<rows.length)throw new Error("随机路线节点间距不足");
                    return rows.map((row,i)=>add(row,xs[Math.floor((i+0.5)*xs.length/rows.length)],lane.y,
                        main?++order:-1));
                };
                const path=[previous,...place(content,leg*8,(leg+1)*8,lane,true)];
                const merge=add(borrow(),(leg+1)*8,0,++order);
                path.push(merge);for(let i=1;i<path.length;i++)link(path[i-1],path[i]);
                const fork=path[random.below(2)],join=path[path.length-1-random.below(2)];
                const rows:ExpeditionNode[][]=Array.from({length:routeCount-1},()=>[]);
                branches[leg].forEach((row,i)=>rows[i%rows.length].push(row));
                let first:number[]=[];
                for(let i=0;i<rows.length;i++) {
                    let from=fork,to=join;
                    if(i>0&&random.below(2)===0) {
                        const a=first[1],b=first[first.length-2];
                        if(slots(s.map.nodes[a-1].x,s.map.nodes[b-1].x,lanes[i+1].phase).length>=rows[i].length) {
                            from=a;to=b;
                        }
                    }
                    const route=[from,...place(rows[i],s.map.nodes[from-1].x,s.map.nodes[to-1].x,lanes[i+1]),to];
                    for(let j=1;j<route.length;j++)link(route[j-1],route[j]);
                    if(!i)first=route;
                }
                previous=merge;merges.push(merge);continue;
            }
            // Existing v4 saves replay the original generator without rerolling their graph.
            const lanes=random.shuffle([-1.1,0,1.1]),main=mains[leg];
            // Permute events within a leg, without moving the first borrow before its two fights.
            const content=leg===0?main:random.shuffle(main);
            const path=[previous];
            content.forEach((n,i)=>path.push(add(n,leg*8+(i+1)*8/(content.length+1),lanes[0],++order)));
            const merge=add(borrow(),(leg+1)*8,0,++order);
            path.push(merge);for(let i=1;i<path.length;i++)link(path[i-1],path[i]);
            const fork=path[random.below(2)],join=path[path.length-1-random.below(2)];
            const fromX=s.map.nodes[fork-1].x,toX=s.map.nodes[join-1].x;
            const branch=[fork];
            branches[leg].forEach((n,i)=>branch.push(add(n,fromX+(i+1)*(toX-fromX)/(branches[leg].length+1),lanes[1])));
            branch.push(join);for(let i=1;i<branch.length;i++)link(branch[i-1],branch[i]);
            // Random cross-route joins add cycles while never bypassing the final boss gate.
            if(random.below(2) && branch.length>3) {
                const index=range(1,path.length-2);
                const target=branch.slice(1,-1).reduce((best,id)=>
                    Math.abs(s.map.nodes[id-1].x-s.map.nodes[path[index]-1].x) <
                    Math.abs(s.map.nodes[best-1].x-s.map.nodes[path[index]-1].x)?id:best,branch[1]);
                link(path[index],target);
            }
            previous=merge;merges.push(merge);
        }
        const boss=add(pick("boss"),26,0,++order),terminal=add(pick("extract"),27,0,++order);
        link(previous,boss);link(boss,terminal);
        const exit=add(pick("extract"),24,1.1);link(previous,exit);
        if(random.below(100)>=60) {
            const leg=random.below(2),early=add(pick("extract"),(leg+1)*8,-1.1);link(merges[leg],early);
        }
        s.map.present=s.map.nodes.map(n=>n.id);s.map.visible=[1];s.revealed=[1];
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
        if(this.node(c,s.node,s).enemy&&!s.map.cleared.includes(s.node))return paths;
        for(const [a,b]of s.map.edges) {
            const next=a===s.node?b:b===s.node?a:null;
            if(next!==null)paths.set(next,[s.node,next]);
        }
        return paths;
    }
    static recovery(c: ExpeditionConfig, s: ExpeditionState): { hp: number; mp: number } {
        const p = c.build.setup.player, ratio = c.rules.recoveryPercent / 100;
        return { hp: Math.min(p.maxHp-s.hp,Math.round(p.maxHp*ratio)),
            mp: Math.min(p.maxMp-s.mp,Math.round(p.maxMp*ratio)) };
    }
    static source(s: ExpeditionState): ExpeditionSource | undefined { return s.map.sources.find(b => b.node === s.node); }
    static searchDuration(c: ExpeditionConfig, s: ExpeditionState): number {
        const box=this.source(s),item=box?.entries[box.revealed];
        return item ? c.rules.searchMs*Math.max(1,Inventory.template(c,item).quality || 1) : 0;
    }
    static makeSource(c: ExpeditionConfig, s: ExpeditionState, seed: number): void {
        if (this.source(s)) throw new Error("箱来源已生成");
        const node = this.node(c,s.node,s), random = new Random(seed,`loot:${node.key}`);
        const supply = node.pool.startsWith("supply");
        const pool = c.pools.find(p => p.id === (node.pool === "deep" ? "risk" : node.pool));
        if (!supply && !pool) throw new Error("节点来源池不存在");
        const count = supply ? 3 : random.below(100) < pool!.minWeight ? pool!.min : pool!.max;
        const entries: ExpeditionSource["entries"] = [];
        for (let i = 0; i < count; i++) {
            let family = supply ? i === 0 ? "hp" : i === 1 ? "mp" :
                ["hp","mp","repair"][random.weighted(c.rules.supply)] :
                ["hp","mp","repair","herb","ore","small","book","container","weapon"][random.weighted(pool!.categories)];
            if (family === "book") family = ["bookSword","bookEarth","bookCommon"][random.weighted(c.rules.books)];
            if (family === "container") family += random.weighted(pool!.qualities) + 1;
            const variants = c.variants.filter(v => v.family === family);
            const templateId = variants[random.weighted(variants.map(v => v.weight))].templateId;
            const durability = family === "weapon" ? pool!.durability[0] +
                random.below(pool!.durability[1]-pool!.durability[0]+1) : null;
            entries.push({ uid: `${s.runId}:loot:${node.key}:${i}`, templateId, durability,
                location: { space: "source", node: s.node } });
        }
        s.map.sources.push({ node: s.node, entries, opened: false, revealed: 0, progressMs: 0 });
        s.sourceLayouts!.push({node:s.node,slots:[]});
        Inventory.syncSources(c,s);
    }
    private static pay(c: ExpeditionConfig,s: ExpeditionState,cost:number,hpPercent:number): boolean {
        if(s.stamina!>=cost) { s.stamina!-=cost;return true; }
        s.hp=Math.max(0,s.hp-Math.round(c.build.setup.player.maxHp*hpPercent/100));
        if(s.hp>0)return true;
        s.flow!.phase="ended";s.flow!.endReason="defeat";s.flow!.pending=null;
        Inventory.settle(s,"defeat");return false;
    }
    static apply(c: ExpeditionConfig, p: NewBuildProfile, snapshot: ExpeditionState,
        command: ExpeditionCommand, at: number, seed: number): { state: ExpeditionState; battle?: NewBattleResult } {
        let s = Core.clone(snapshot), battle: NewBattleResult | undefined;
        if (!command || s.phase === "ended") throw new Error("本局已结算");
        if(command.type==="move" && [command.move.from.space,command.move.to.space].includes("ground") ||
            (command.type==="equipWeapon" || command.type==="equipContainer") &&
            (command.from?.space==="ground" || command.oldTo?.space==="ground"))
            throw new Error("局内物品只存放于来源仓库，不存在地面散落物");
        if (!Number.isSafeInteger(at) || at < 0) throw new Error("操作时间无效");
        if (s.deadlineAt !== null && (command.type === "timeout" ? at < s.deadlineAt : at >= s.deadlineAt))
            throw new Error("已到截止，须先结算超时");
        const ready = () => {
            if (s.phase !== "active" || s.flow?.phase !== "ready" || s.flow.pending)
                throw new Error("请先完成当前选择或战斗");
        };
        const finish = (reason: "extract" | "abandon" | "timeout") => {
            if (s.phase !== "active" || !s.flow) throw new Error("当前未入境");
            s.flow = Build.apply(c.build,p,s.flow,{ type: reason },at).state;
            Inventory.settle(s,reason);
        };
        switch (command.type) {
            case "enter":
                if (s.phase !== "preparation") throw new Error("不能重复入境");
                s.flow = Build.start(c.build,p,seed,s.runId);
                s.phase = "active"; s.enteredAt = at; s.deadlineAt = at + c.rules.limitMs;
                this.generateMap(c,s,seed);
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
                if(!n.enemy||s.map.cleared.includes(n.id))throw new Error("此处没有待战敌人");
                const cost=n.kind==="boss"?c.rules.bossCost:n.kind==="elite"?c.rules.eliteCost:c.rules.normalCost;
                if(s.stamina!<cost)throw new Error(`体力不足，开战需要 ${cost}，当前 ${s.stamina}`);
                s.stamina!-=cost;
                s.flow=Build.apply(c.build,p,s.flow!,{type:"battle"},at,Inventory.carry(c,s),`battle:${n.encounterKey}`).state;
                break;
            }
            case "borrow": case "insight":
                ready();
                if (this.node(c,s.node,s).kind !== command.type || s.map.used.includes(s.node)) throw new Error("此处奖励不可用");
                s.flow = Build.offer(c.build,p,s.flow!,`${command.type}:${this.node(c,s.node,s).key}`,
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
                    command.deltaMs < 1 || command.deltaMs > c.rules.checkpointMs) throw new Error("搜索进度无效");
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
                const crossed = [600000,300000].filter(v => at >= s.deadlineAt! - v && !s.map.warnings.includes(v));
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
                if (s.phase !== "active" || !s.flow || !["choose","forgo","upgrade","action"].includes(command.command.type))
                    throw new Error("图上战斗及奖励须由对应节点发起");
                const result = Build.apply(c.build,p,s.flow,command.command,at,Inventory.carry(c,s),
                    `battle:${this.node(c,s.node,s).encounterKey}`);
                s.flow = result.state; battle = result.battle;
                if (battle?.ok) {
                    s.hp = battle.state.player.hp; s.mp = battle.state.player.mp;
                    const weapon = s.items.find(i => i.location.space === "weapon");
                    if (weapon) weapon.durability = battle.state.weapon!.durability;
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
            case "visit": case "reveal": throw new Error("旧线性地图命令已停用");
            default: {
                // Inventory remains the sole owner of actual instance movement and consumption.
                if (s.phase === "active" && s.flow?.pending) throw new Error("请先完成强制选择");
                const result = Inventory.apply(c,p,s,command,at,seed);
                s = result.state as ExpeditionState;
                s.revision--;
            }
        }
        if (s.warehouseLayout) s.warehouseLayout = Inventory.warehousePlacements(c,s);
        Inventory.syncSources(c,s);
        if(s.items.some(i=>i.location.space==="ground"))throw new Error("正式地图只允许来源仓库，不存在地面物品");
        s.revision++;
        Inventory.validate(c,s);
        return { state: s, battle };
    }
}
