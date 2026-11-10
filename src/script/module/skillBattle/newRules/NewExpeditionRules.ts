import { NewBattleCore as Core } from "./NewBattleCore";
import { NewBuildRules as Build } from "./NewBuildRules";
import { NewInventoryRules as Inventory } from "./NewInventoryRules";
import { ExpeditionMapUtils } from "../../expedition/utils/ExpeditionMapUtils";
import type { NewBattleResult } from "./NewBattleTypes";
import type { NewBuildProfile } from "./NewBuildTypes";
import type { ExpeditionCommand, ExpeditionConfig, ExpeditionSource, ExpeditionState } from "./NewExpeditionTypes";

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
}

export class NewExpeditionRules {
    static node(config: ExpeditionConfig, id: number) {
        const row = config.nodes.find(n => n.id === id);
        if (!row) throw new Error("地图节点不存在");
        return row;
    }
    static validateConfig(c: ExpeditionConfig, profile: NewBuildProfile): void {
        Inventory.validateConfig(c,profile);
        if (!c.mapVersion || c.nodes.length !== 32 || new Set(c.nodes.map(n => n.id)).size !== 32 ||
            new Set(c.nodes.map(n => n.key)).size !== 32 || c.edges.length !== 37 ||
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
        const edges = new Set<string>();
        for (const [a,b] of c.edges) {
            this.node(c,a); this.node(c,b);
            const key = [a,b].sort((x,y) => x-y).join(":");
            if (a === b || a > 27 || b > 27 || edges.has(key)) throw new Error("地图连线重复或非法");
            edges.add(key);
        }
        if (ExpeditionMapUtils.reachableGraph(1,c.edges,() => true,() => true).size !== 27)
            throw new Error("固定地图必须完整连通");
        for (let i = 1; i <= 16; i++) {
            if (this.node(c,i).mainOrder !== i-1 || i < 16 && !edges.has(`${i}:${i+1}`))
                throw new Error("主节点序号或骨架不完整");
        }
        if (c.edges.filter(e => e.includes(16)).length !== 1 || !edges.has("15:16"))
            throw new Error("末撤离点必须仅连首领");
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
    static start(c: ExpeditionConfig, p: NewBuildProfile, seed: number, runId: string): ExpeditionState {
        this.validateConfig(c,p);
        const base = Inventory.start(c,p,seed,runId);
        const state: ExpeditionState = { ...base, node: 1, map: { version: c.mapVersion, edges: [],
            present: [], visible: [], cleared: [], used: [], sources: [], warnings: [], warning: null } };
        let slot = 0;
        for (const item of state.items) {
            const kind = Inventory.template(c,item).kind;
            item.location = kind === "weapon" || kind === "container" ? { space: kind } :
                kind === "repair" ? { space: "bag", x: 0, y: 0, rotated: false } :
                { space: "battle", x: slot++, y: 0, rotated: false };
        }
        Inventory.validate(c,state);
        return state;
    }
    private static generateMap(c: ExpeditionConfig, s: ExpeditionState, seed: number): void {
        const random = new Random(seed,"map");
        const pick = (group: string) => {
            const rows = c.placements.filter(r => r.group === group);
            return rows[random.weighted(rows.map(r => r.weight))];
        };
        const recoveries = pick("recoveryCount").a, attach = pick("recoveryAttach").a;
        const exits = pick(`exit${pick("exitCount").a}`);
        s.map.edges = Core.clone(c.edges);
        s.map.present = c.nodes.filter(n => n.id <= 27).map(n => n.id);
        const leaf = (id: number, parent: number) => {
            this.node(c,id); this.node(c,parent); s.map.present.push(id); s.map.edges.push([id,parent]);
        };
        leaf(28,attach); if (recoveries === 2) leaf(29,12);
        for (const id of [exits.a,exits.b].filter(Boolean)) leaf(id,id === 30 ? 4 : id === 31 ? 9 : 14);
        s.revealed = [1]; this.revealMap(c,s,1);
    }
    private static revealMap(c: ExpeditionConfig, s: ExpeditionState, id: number): void {
        const n = this.node(c,id), visible = new Set(s.map.visible);
        visible.add(id);
        if (n.mainOrder >= 0) for (const row of c.nodes)
            if (row.mainOrder >= 0 && row.mainOrder <= n.mainOrder + 4) visible.add(row.id);
        const neighbors = (from: number) => s.map.edges.flatMap(([a,b]) => a === from ? [b] : b === from ? [a] : []);
        // Newly visible main nodes expose only their immediate branch/leaf neighbors.
        for (const row of c.nodes.filter(r => r.mainOrder >= 0 && visible.has(r.id)))
            for (const neighbor of neighbors(row.id))
                if (this.node(c,neighbor).mainOrder < 0) visible.add(neighbor);
        if (n.mainOrder < 0) for (const neighbor of neighbors(id)) visible.add(neighbor);
        s.map.visible = [...visible].filter(v => s.map.present.includes(v)).sort((a,b) => a-b);
    }
    static reachable(c: ExpeditionConfig, s: ExpeditionState): Set<number> {
        return new Set(this.travelPaths(c,s).keys());
    }
    static travelPaths(c: ExpeditionConfig, s: ExpeditionState): Map<number,number[]> {
        const paths=new Map([[s.node,[s.node]]]),queue=[s.node];
        const passable=(id:number)=>s.revealed.includes(id)&&(!this.node(c,id).enemy||s.map.cleared.includes(id));
        for(const current of queue) {
            if(current!==s.node&&!passable(current))continue;
            for(const [a,b]of s.map.edges) {
                const next=a===current?b:b===current?a:null;
                if(next===null||paths.has(next)||!s.map.visible.includes(next))continue;
                // An unengaged enemy permits retreat, never passage to its unexplored far side.
                if(current===s.node&&!passable(current)&&!passable(next))continue;
                paths.set(next,[...paths.get(current)!,next]);queue.push(next);
            }
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
        const node = this.node(c,s.node), random = new Random(seed,`loot:${node.key}`);
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
                location: { space: "ground", node: s.node } });
        }
        s.map.sources.push({ node: s.node, entries, opened: false, revealed: 0, progressMs: 0 });
    }
    static apply(c: ExpeditionConfig, p: NewBuildProfile, snapshot: ExpeditionState,
        command: ExpeditionCommand, at: number, seed: number): { state: ExpeditionState; battle?: NewBattleResult } {
        let s = Core.clone(snapshot), battle: NewBattleResult | undefined;
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
                s.node = command.node;
                if (!s.revealed.includes(s.node)) s.revealed.push(s.node);
                this.revealMap(c,s,s.node);
                const n = this.node(c,s.node);
                if (n.kind === "search" && !this.source(s)) this.makeSource(c,s,seed);
                break;
            }
            case "fight": {
                ready();
                const n=this.node(c,s.node);
                if(!n.enemy||s.map.cleared.includes(n.id))throw new Error("此处没有待战敌人");
                s.flow=Build.apply(c.build,p,s.flow!,{type:"battle"},at,Inventory.carry(c,s),`battle:${n.key}`).state;
                break;
            }
            case "borrow": case "insight":
                ready();
                if (this.node(c,s.node).kind !== command.type || s.map.used.includes(s.node)) throw new Error("此处奖励不可用");
                s.flow = Build.offer(c.build,p,s.flow!,`${command.type}:${this.node(c,s.node).key}`,
                    command.type === "borrow" ? "active" : "passive");
                s.map.used.push(s.node);
                break;
            case "recover": {
                ready();
                if (this.node(c,s.node).kind !== "recovery" || s.map.used.includes(s.node)) throw new Error("恢复处不可用");
                const value = this.recovery(c,s);
                if (!value.hp && !value.mp) throw new Error("生命灵力已满，机会未使用");
                s.hp += value.hp; s.mp += value.mp; s.map.used.push(s.node);
                break;
            }
            case "openSource": {
                ready();
                const box=this.source(s);
                if(!box || box.opened)throw new Error("此处来源已打开或不存在");
                box.opened=true;
                break;
            }
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
                if (this.node(c,s.node).kind !== "extract") throw new Error("须到撤离点确认");
                finish("extract"); break;
            case "abandon": case "timeout": finish(command.type); break;
            case "build": {
                if (s.phase !== "active" || !s.flow || !["choose","forgo","upgrade","action"].includes(command.command.type))
                    throw new Error("图上战斗及奖励须由对应节点发起");
                const result = Build.apply(c.build,p,s.flow,command.command,at,Inventory.carry(c,s),
                    `battle:${this.node(c,s.node).key}`);
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
        s.revision++;
        Inventory.validate(c,s);
        return { state: s, battle };
    }
}
