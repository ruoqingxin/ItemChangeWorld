import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import { BuildRules as Build } from "../../build/utils/BuildRules";
import type { BattleCarry, BattleResult, BattleWeapon } from "../../skillBattle/types/BattleTypes";
import type { InventoryCommand, InventoryConfig, InventoryItem, InventoryLocation, InventorySpace, InventoryState, InventoryTemplate, InventoryWarehousePlacement, InventoryWarehouseTarget } from "../types/InventoryTypes";


export class InventoryRules {
    static readonly WAREHOUSE_COLUMNS = 8;
    static readonly WAREHOUSE_ROWS = 7;
    static weight(config: InventoryConfig, state: InventoryState): { current: number; limit: number } {
        const container = state.items.find(i => i.location.space === "container");
        return { current: state.items.filter(i => ["weapon","container","bag"].includes(i.location.space))
            .reduce((sum,i) => sum + (this.template(config,i).weight || 0),0),
            limit: config.weight.base + (container ? this.template(config,container).weightLimit : 0) };
    }
    static same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
    static template(config: InventoryConfig, item: InventoryItem): InventoryTemplate {
        const row = config.templates.find(t => t.id === item.templateId);
        if (!row) throw new Error("物品模板不存在");
        return row;
    }
    static weapon(config: InventoryConfig, item: InventoryItem): BattleWeapon {
        const t = this.template(config,item);
        if (t.kind !== "weapon") throw new Error("物品不是武器");
        return {id:t.id,name:t.name,attack:t.weaponAttack,defense:t.weaponDefense,
            durability:item.durability!,maxDurability:t.weaponDurability};
    }
    static dimensions(t: InventoryTemplate, l: InventoryLocation): [number, number] {
        return l.rotated ? [t.height, t.width] : [t.width, t.height];
    }
    static size(config: InventoryConfig, state: InventoryState, space: InventorySpace): [number, number] {
        if (space === "battle") return [config.spaces.battleWidth, config.spaces.battleHeight];
        if (space === "safe") return [config.spaces.safeWidth, config.spaces.safeHeight];
        const container = state.items.find(i => i.location.space === "container");
        const t = container && this.template(config, container);
        return t ? [t.bagWidth, t.bagHeight] : [0, 0];
    }
    static validateConfig(config: InventoryConfig): void {
        Build.validateConfig(config.build);
        const int = (n: number, min = 0, max = 100000000) => Number.isSafeInteger(n) && n >= min && n <= max;
        if (!config.spaces || !Object.values(config.spaces).every(v => int(v, 1)) ||
            config.spaces.battleWidth * config.spaces.battleHeight !== 5 ||
            ![[1,2],[2,2],[3,2],[3,3]].some(([w,h]) =>
                config.spaces.safeWidth === w && config.spaces.safeHeight === h) ||
            !Array.isArray(config.templates) || !config.templates.length ||
            new Set(config.templates.map(t => t.id)).size !== config.templates.length)
            throw new Error("三空间配置无效");
        for (const t of config.templates) {
            if (!int(t.id, 101) || !t.name || !["hp","mp","mixed","shield","repair","stamina","book","material","weapon","container"].includes(t.kind) ||
                !int(t.width, 1, 8) || !int(t.height, 1, 6) || t.stack !== 1 ||
                ![t.rotate,t.battle,t.safe].every(v => typeof v === "boolean") ||
                !int(t.bagWidth, 0, 8) || !int(t.bagHeight, 0, 6) ||
                !/^(?:ui\/atlas\/module\/inventory\/[\w-]+|ui\/image\/naxu\/naxu-[a-z]+-q[1-6])\.png$/.test(t.icon) ||
                (t.quality !== undefined && !int(t.quality, 1, 6)) ||
                (["weapon","container"].includes(t.kind) && (t.safe || t.battle)) ||
                (t.battle && !["hp","mp","mixed","shield"].includes(t.kind)) ||
                (t.kind === "container" ? !t.bagWidth || !t.bagHeight : t.bagWidth !== 0 || t.bagHeight !== 0))
                throw new Error("物品形状、类别或资源配置无效");
            if (t.weight !== undefined && !int(t.weight,1) || t.weightLimit !== undefined && !int(t.weightLimit) ||
                t.staminaRestore !== undefined && !int(t.staminaRestore) ||
                t.kind === "stamina" && (!t.staminaRestore || t.battle) ||
                t.kind !== "stamina" && !!t.staminaRestore)
                throw new Error("物品重量、承重或体力药配置无效");
            if (!int(t.recyclePrice) || ![t.weaponAttack,t.weaponDefense,t.weaponDurability].every(v=>int(v)) ||
                (t.kind === "weapon" ? t.weaponDurability <= 0 : t.weaponAttack + t.weaponDefense + t.weaponDurability !== 0) ||
                (t.kind === "repair" ? t.repairAmount !== -1 && !int(t.repairAmount,1) : t.repairAmount !== 0))
                throw new Error("物品价格、武器属性或修理量无效");
            if (["hp","mp","mixed","shield"].includes(t.kind)) {
                if (!config.build.setup.potions.some(p => p.itemId === t.id && p.resource === t.kind))
                    throw new Error("实际药品与新核配置不匹配");
            }
            if (t.kind === "weapon" && (t.width !== 2 || t.height !== 3) ||
                t.kind === "container" && (t.width !== 2 || t.height !== 2))
                throw new Error("武器实体须为2×3六格，纳虚器本体须为2×2四格");
        }
        if (!config.weight || !int(config.weight.base,1) || !int(config.weight.sourcePages,1,7) ||
            config.templates.some(t => !int(t.weight,1) || t.kind === "container" && !int(t.weightLimit,1)))
            throw new Error("角色或背包承重配置无效");
        if (!config.build.setup.weapon || !Array.isArray(config.fixtures) || !config.fixtures.length ||
            new Set(config.fixtures.map(f => f.id)).size !== config.fixtures.length)
            throw new Error("隔离物品来源缺失");
        for (const f of config.fixtures) {
            const t = config.templates.find(t => t.id === f.templateId);
            if (!t || !int(f.id,1) || !int(f.count,1,30) || !int(f.node,0,config.build.encounters.length + 1) ||
                !int(f.durability,0,t.kind === "weapon" ? t.weaponDurability : 0))
                throw new Error("演练来源表无效");
        }
    }
    static start(config: InventoryConfig, seed: number, runId: string): InventoryState {
        this.validateConfig(config);
        Build.start(config.build, seed, runId);
        const items: InventoryItem[] = [];
        for (const f of config.fixtures) for (let n = 0; n < f.count; n++) {
            const t = config.templates.find(t => t.id === f.templateId)!;
            items.push({ uid: `${runId}:f${f.id}:${n}`, templateId: t.id,
                location: { space: "warehouse" },
                durability: t.kind === "weapon" ? f.durability : null });
        }
        const state: InventoryState = { runId, revision: 0, phase: "preparation", enteredAt: null, deadlineAt: null,
            flow: null, items, hp: config.build.setup.player.maxHp, mp: config.build.setup.player.maxMp,
            node: 0, revealed: [], result: null, returned: [], lost: [], consumed: [] };
        this.validate(config, state);
        return state;
    }
    static item(state: InventoryState, uid: string): InventoryItem {
        const item = state.items.find(i => i.uid === uid);
        if (!item) throw new Error("物品已不存在");
        return item;
    }
    static warehousePlacements(config: InventoryConfig, state: InventoryState, maxPages?: number): InventoryWarehousePlacement[] {
        const items = state.items.filter(i => i.location.space === "warehouse"), byUid = new Map(items.map(i => [i.uid,i]));
        const placed = new Map<string,InventoryWarehousePlacement>(), occupied = new Map<number,Set<number>>();
        const cols = this.WAREHOUSE_COLUMNS, rows = this.WAREHOUSE_ROWS;
        const reserve = (slot: InventoryWarehousePlacement) => {
            const item = byUid.get(slot.uid)!;
            const t = this.template(config,item), [w,h] = this.dimensions(t,{ space: "warehouse", rotated: slot.rotated });
            if (placed.has(slot.uid) || !Number.isSafeInteger(slot.page) || slot.page < 0 || slot.page >= (maxPages ?? state.items.length) ||
                !Number.isInteger(slot.x) || !Number.isInteger(slot.y) || slot.x < 0 || slot.y < 0 ||
                typeof slot.rotated !== "boolean" || slot.rotated && !t.rotate ||
                slot.x + w > cols || slot.y + h > rows ||
                Object.keys(slot).some(k => !["uid","page","x","y","rotated"].includes(k)))
                throw new Error("仓库坐标、页码或旋转无效");
            const grid = occupied.get(slot.page) || new Set<number>();
            for (let y = slot.y; y < slot.y + h; y++) for (let x = slot.x; x < slot.x + w; x++) {
                const cell = y * cols + x;
                if (grid.has(cell)) throw new Error("落点与现有物品相交");
                grid.add(cell);
            }
            occupied.set(slot.page,grid); placed.set(slot.uid,{ ...slot });
        };

        for (const slot of state.warehouseLayout || []) if (byUid.has(slot.uid)) reserve(slot);
        for (const item of items) {
            if (placed.has(item.uid)) continue;
            const t = this.template(config,item);
            if (t.width > cols || t.height > rows) throw new Error("物品超出仓库单页尺寸");
            let found = false;
            for (let page = 0; !found; page++) {
                if (maxPages !== undefined && page >= maxPages) throw new Error("当前交互仓库空间不足，不能完成此操作");
                const grid = occupied.get(page) || new Set<number>();
                for (let y = 0; y <= rows - t.height && !found; y++) for (let x = 0; x <= cols - t.width; x++) {
                    let free = true;
                    for (let dy = 0; dy < t.height; dy++) for (let dx = 0; dx < t.width; dx++)
                        if (grid.has((y + dy) * cols + x + dx)) free = false;
                    if (!free) continue;
                    reserve({ uid: item.uid, page, x, y, rotated: false }); found = true; break;
                }
            }
        }
        return items.map(i => placed.get(i.uid)!);
    }
    static sourcePlacements(config: InventoryConfig, state: InventoryState, node = state.node): InventoryWarehousePlacement[] {

        const sources = (state as InventoryState & {
            map?: { sources: Array<{ node: number; entries: InventoryItem[] }> }
        }).map?.sources || [];
        const known = state.items.filter(i => i.location.space === "source" && i.location.node === node);
        const reserved = sources.find(s => s.node === node)?.entries.filter(i => !state.items.some(v => v.uid === i.uid)) || [];
        return this.warehousePlacements(config,{ ...state,
            items: [...known,...reserved].map(i => ({ ...i,location: {space:"warehouse"} })),
            warehouseLayout: state.sourceLayouts?.find(s => s.node === node)?.slots || [],
        },config.weight.sourcePages);
    }
    static syncSources(config: InventoryConfig, state: InventoryState): void {
        if (!state.sourceLayouts) return;
        state.sourceLayouts = state.sourceLayouts.map(s => ({ node:s.node,slots:this.sourcePlacements(config,state,s.node) }));
    }
    private static sourceTarget(state: InventoryState, item: InventoryItem, to: InventoryLocation): void {
        const source = state.sourceLayouts?.find(s => s.node === to.node);
        if (!source || to.node !== state.interactionSource) throw new Error("请先打开当前节点的交互仓库");
        const slots = source.slots.filter(p => p.uid !== item.uid);
        if (to.x !== undefined) {
            const page = to.y === undefined ? -1 : Math.floor(to.y / this.WAREHOUSE_ROWS);
            slots.push({uid:item.uid,page,x:to.x,y:to.y! % this.WAREHOUSE_ROWS,rotated:!!to.rotated});
        }
        source.slots = slots;
        item.location = {space:"source",node:to.node};
    }
    private static placeWarehouse(state: InventoryState, uid: string, to: InventoryWarehouseTarget,
        layout: InventoryWarehousePlacement[]): void {
        if (!to || !Number.isSafeInteger(to.page) || to.page < 0 ||
            to.page > Math.max(0,...layout.map(p => p.page)) ||
            Object.keys(to).some(k => !["page","x","y","rotated"].includes(k)))
            throw new Error("仓库目标页无效");
        const present = new Set(state.items.filter(i => i.location.space === "warehouse").map(i => i.uid));
        if (!present.has(uid)) throw new Error("指定落格的物品必须移入仓库");

        state.warehouseLayout = layout.filter(p => p.uid !== uid && present.has(p.uid));
        state.warehouseLayout.push({ uid, ...to });
    }
    static weaponPlan(config: InventoryConfig, state: InventoryState, uid: string):
        Extract<InventoryCommand,{ type: "equipWeapon" }> {
        this.movable(state);
        const next = this.item(state,uid), old = state.items.find(i => i.location.space === "weapon");
        this.accessible(state,next.location);
        if (this.template(config,next).kind !== "weapon") throw new Error("只能装备武器");
        if (old?.uid === uid) throw new Error("已经装备此武器");
        return { type: "equipWeapon", uid, from: Core.clone(next.location),
            ...(old ? { oldTo: Core.clone(next.location) } : {}) };
    }
    static containerPlan(config: InventoryConfig, state: InventoryState, uid: string | null):
        Extract<InventoryCommand,{ type: "equipContainer" }> {
        return this.weightedContainerPlan(config,state,uid);
    }
    private static weightedContainerPlan(config: InventoryConfig, state: InventoryState, uid: string | null, validate = true):
        Extract<InventoryCommand,{ type: "equipContainer" }> {
        this.movable(state);
        const old = state.items.find(i => i.location.space === "container"), next = uid ? this.item(state,uid) : null;
        if (old?.uid === uid || !old && !next) throw new Error("没有需要更换的背包");
        if (next) {
            this.accessible(state,next.location);
            if (this.template(config,next).kind !== "container" ||
                !["warehouse","source","bag"].includes(next.location.space)) throw new Error("新背包来源无效");
        }
        const outside: InventoryLocation = state.phase === "preparation" ? {space:"warehouse"} :
            {space:"source",node:state.interactionSource!};
        const rows = state.items.filter(i => i.location.space === "bag" && i.uid !== uid)
            .sort((a,b) => a.location.y! - b.location.y! || a.location.x! - b.location.x! || a.uid.localeCompare(b.uid));
        const t = next && this.template(config,next), width = t?.bagWidth || 0, height = t?.bagHeight || 0;
        const limit = config.weight!.base + (t?.weightLimit || 0);
        const equippedWeight = state.items.filter(i => i.location.space === "weapon")
            .reduce((n,i) => n + this.template(config,i).weight!,0) + (t?.weight || 0);
        const pack = (items: InventoryItem[]) => {
            if (items.reduce((n,i) => n + this.template(config,i).weight!,equippedWeight) > limit) return null;
            if (items.every(i => {
                const [w,h] = this.dimensions(this.template(config,i),i.location);
                return i.location.x!+w<=width && i.location.y!+h<=height;
            })) return new Map(items.map(i => [i.uid,Core.clone(i.location)]));
            const occupied = new Set<number>(), targets = new Map<string,InventoryLocation>();
            for (const i of items) {
                const it = this.template(config,i), preferred = !!i.location.rotated;
                let found: InventoryLocation | null = null;
                for (const rotated of it.rotate && it.width !== it.height ? [preferred,!preferred] : [preferred]) {
                    const [w,h] = this.dimensions(it,{space:"bag",rotated});
                    for (let y=0;y+h<=height&&!found;y++) for (let x=0;x+w<=width&&!found;x++) {
                        const cells: number[] = [];
                        for(let dy=0;dy<h;dy++) for(let dx=0;dx<w;dx++) cells.push((y+dy)*width+x+dx);
                        if(cells.some(v=>occupied.has(v)))continue;
                        cells.forEach(v=>occupied.add(v)); found={space:"bag",x,y,rotated};
                    }
                    if (found) break;
                }
                if (!found) return null;
                targets.set(i.uid,found);
            }
            return targets;
        };
        let returned = 0, targets = pack(rows);
        while (!targets && returned < rows.length) targets = pack(rows.slice(++returned));
        if (!targets) throw new Error("基础装备重量超过新承重上限，不能换包");
        if (state.phase === "active" && (old || returned) && state.interactionSource == null)
            throw new Error("请先打开当前节点的交互仓库，再更换背包");
        const plan: Extract<InventoryCommand,{type:"equipContainer"}> = {
            type:"equipContainer",uid,...(next?{from:Core.clone(next.location)}:{}),
            ...(old?{oldTo:outside}:{}),contents:rows.map(i => ({uid:i.uid,from:Core.clone(i.location),
                to:Core.clone(targets!.get(i.uid) || outside)})),
        };
        if(validate)this.apply(config,state,plan,state.enteredAt || 0);
        return plan;
    }
    private static accessible(state: InventoryState, location: InventoryLocation): void {
        if (["consumed","lost"].includes(location.space)) throw new Error("该物品已消耗或损失");
        if (location.space === "warehouse" && state.phase !== "preparation") throw new Error("局内不能访问局外仓库");
        if (location.space === "source" && (state.phase !== "active" || location.node !== state.node ||
            location.node !== state.interactionSource)) throw new Error("只能访问当前交互仓库");
    }
    private static source(state: InventoryState, uid: string, from: InventoryLocation): InventoryItem {
        const item = this.item(state, uid);
        if (!this.same(item.location, from)) throw new Error("物品来源已改变，请重新选择");
        this.accessible(state, from);
        return item;
    }
    private static destination(state: InventoryState, to: InventoryLocation): void {
        if (["weapon","container","consumed","lost"].includes(to.space)) throw new Error("目标必须是合法储物位置");
        this.accessible(state, to);
    }
    private static movable(state: InventoryState): void {
        if (state.phase === "ended") throw new Error("本次演练已结算");
        if (state.flow?.phase === "battle") throw new Error("战斗中锁定整理、换装与修补");
    }
    private static consume(state: InventoryState, item: InventoryItem): void {
        item.location = { space: "consumed" }; state.consumed.push(item.uid);
    }
    static carry(config: InventoryConfig, state: InventoryState): BattleCarry {
        const weapon = state.items.find(i => i.location.space === "weapon");
        const pouch: BattleCarry["pouch"] = [null,null,null,null,null];
        for (const item of state.items.filter(i => i.location.space === "battle")) {
            const t = this.template(config,item);
            if (["hp","mp","mixed","shield"].includes(t.kind))
                pouch[item.location.y! * config.spaces.battleWidth + item.location.x!] = { itemUid: item.uid, itemId: t.id };
        }
        return { hp: state.hp, mp: state.mp, weapon: weapon ?
            this.weapon(config,weapon) : null, pouch };
    }
    static settle(state: InventoryState, result: NonNullable<InventoryState["result"]>): void {
        state.result = result; state.phase = "ended";
        for (const item of state.items) {
            const space = item.location.space;
            if (["warehouse","consumed","lost"].includes(space)) continue;
            if (space !== "source" && (result === "extract" || space === "safe")) {
                item.location = { space: "warehouse" }; state.returned.push(item.uid);
            } else { item.location = { space: "lost" }; state.lost.push(item.uid); }
        }
    }
    static apply(config: InventoryConfig, snapshot: InventoryState,
        command: InventoryCommand, at: number): { state: InventoryState; battle?: BattleResult } {
        const state = Core.clone(snapshot);
        if (!command || state.phase === "ended") throw new Error("本次演练已结算");
        if (!Number.isSafeInteger(at) || at < 0) throw new Error("操作时间无效");
        if (state.deadlineAt !== null && (command.type === "timeout" ? at < state.deadlineAt : at >= state.deadlineAt))
            throw new Error("已到截止，须先结算超时");
        let battle: BattleResult | undefined;
        const warehouseTo = "warehouseTo" in command ? command.warehouseTo : undefined;
        const warehouseLayout = warehouseTo ? this.warehousePlacements(config,state) : undefined;
        let warehouseUid: string | undefined;
        switch (command.type) {
            case "move": {
                this.movable(state);
                const { uid, from, to } = command.move, item = this.source(state,uid,from);
                if (["weapon","container"].includes(from.space))
                    throw new Error("装备本体须通过换装事务移动");
                this.destination(state,to);
                if (warehouseTo && to.space !== "warehouse") throw new Error("仓库落点只能用于入库");
                if (to.space === "source") this.sourceTarget(state,item,to);
                else item.location = Core.clone(to);
                warehouseUid = uid;
                break;
            }
            case "arrangeWarehouse": {
                this.movable(state);
                const item = this.source(state,command.uid,command.from);
                if (item.location.space !== "warehouse") throw new Error("只能整理仓库中的物品");
                const layout = this.warehousePlacements(config,state);
                this.placeWarehouse(state,item.uid,command.to,layout);
                break;
            }
            case "equipWeapon": {
                this.movable(state);
                const old = state.items.find(i => i.location.space === "weapon");
                if (old && old.uid === command.uid) throw new Error("已经装备此武器");
                const next = command.uid ? this.source(state,command.uid,command.from!) : null;
                if (next && this.template(config,next).kind !== "weapon") throw new Error("只能装备武器");
                if (!old && !next) throw new Error("没有武器可卸下");
                if (warehouseTo && (next || !old || command.oldTo?.space !== "warehouse"))
                    throw new Error("仓库落点只能用于卸下装备入库");
                warehouseUid = old?.uid;
                if (old) {
                    if (!command.oldTo) throw new Error("请为原武器指定合法去向");
                    this.destination(state,command.oldTo);
                    if(command.oldTo.space === "source") this.sourceTarget(state,old,command.oldTo);
                    else old.location = Core.clone(command.oldTo);
                    if (state.warehouseLayout && next && this.same(command.oldTo,command.from) && command.oldTo.space === "warehouse")
                        state.warehouseLayout = state.warehouseLayout.map(p => p.uid === next.uid ? { ...p, uid: old.uid } : p);
                }
                if (next) next.location = { space: "weapon" };
                break;
            }
            case "equipContainer": {
                this.movable(state);
                {
                    const expected=this.weightedContainerPlan(config,state,command.uid,false);
                    if(!this.same(expected.contents,command.contents) || !this.same(expected.from,command.from) ||
                        !this.same(expected.oldTo,command.oldTo)) throw new Error("换包方案必须按原排列逐件退回当前交互仓库");
                }
                const old = state.items.find(i => i.location.space === "container");
                if (old && old.uid === command.uid) throw new Error("已经装备此纳虚器");
                const next = command.uid ? this.source(state,command.uid,command.from!) : null;
                if (next && (this.template(config,next).kind !== "container" ||
                    !["bag",state.phase === "preparation" ? "warehouse" : "source"].includes(next.location.space)))
                    throw new Error("新纳虚器须来自背包或当前可交互的来源");
                if (!old && !next) throw new Error("没有纳虚器可卸下");
                if (warehouseTo && (next || !old || command.oldTo?.space !== "warehouse"))
                    throw new Error("仓库落点只能用于卸下装备入库");
                warehouseUid = old?.uid;
                const contents = state.items.filter(i => i.location.space === "bag" && i.uid !== next?.uid);
                if (!Array.isArray(command.contents) || new Set(command.contents.map(m => m.uid)).size !== command.contents.length ||
                    command.contents.length !== contents.length || contents.some(i => !command.contents.some(m => m.uid === i.uid)))
                    throw new Error("必须逐件安排原纳虚器的全部内容");
                for (const m of command.contents) {
                    const item = this.source(state,m.uid,m.from);
                    this.destination(state,m.to);
                    if(m.to.space !== "bag" && !(state.phase === "preparation" ?
                        m.to.space === "warehouse" : m.to.space === "source" && m.to.node === state.interactionSource))
                        throw new Error("换包内容只能留包内或退回当前交互仓库");
                    if(m.to.space === "source")this.sourceTarget(state,item,m.to);
                    else item.location = Core.clone(m.to);
                }
                if (old) {
                    const target: InventoryLocation = state.phase === "preparation" ? { space: "warehouse" } :
                        { space: "source", node: state.interactionSource! };
                    if (!this.same(command.oldTo,target)) throw new Error("旧纳虚器必须退回当前交互来源");
                    this.destination(state,target);
                    if(target.space === "source")this.sourceTarget(state,old,target);
                    else old.location = target;
                    if (state.warehouseLayout && next && target.space === "warehouse")
                        state.warehouseLayout = state.warehouseLayout.map(p => p.uid === next.uid ? { ...p, uid: old.uid } : p);
                }
                if (next) next.location = { space: "container" };
                break;
            }
            case "use": {
                this.movable(state);
                if (state.phase !== "active") throw new Error("仅能在入境后使用携带物");
                const item = this.source(state,command.uid,command.from), t = this.template(config,item);
                if (!["battle","bag","safe"].includes(item.location.space)) throw new Error("只能使用三空间中实际携带的物品");
                if (t.kind === "repair") {
                    const weapon = state.items.find(i => i.location.space === "weapon");
                    if (!weapon) throw new Error("未装备武器，工具未消耗");
                    const max = this.template(config,weapon).weaponDurability;
                    if (weapon.durability! >= max) throw new Error("武器耐久已满，工具未消耗");
                    weapon.durability = t.repairAmount === -1 ? max : Math.min(max,weapon.durability! + t.repairAmount);
                } else if (t.kind === "stamina") {
                    if (state.stamina === undefined || !config.staminaMax) throw new Error("当前没有探索体力");
                    if (state.stamina >= config.staminaMax) throw new Error("体力已满，药品未消耗");
                    state.stamina = Math.min(config.staminaMax,state.stamina + t.staminaRestore!);
                } else if (["hp","mp","mixed"].includes(t.kind)) {
                    const effect = config.build.setup.potions.find(p => p.itemId === t.id)!;
                    const hp = ["hp","mixed"].includes(t.kind) ? Math.min(effect.amount,config.build.setup.player.maxHp-state.hp) : 0;
                    const mp = t.kind === "mp" ? Math.min(effect.amount,config.build.setup.player.maxMp-state.mp) :
                        t.kind === "mixed" ? Math.min(effect.secondaryAmount,config.build.setup.player.maxMp-state.mp) : 0;
                    if (!hp && !mp) throw new Error("生命灵力已满，药品未消耗");
                    state.hp += hp; state.mp += mp;
                } else if (t.kind === "shield") {
                    throw new Error("护元散仅可在战斗中使用");
                } else throw new Error("此物品不能使用；本阶段不开放学习");
                this.consume(state,item);
                break;
            }
            default: throw new Error("不支持的物品操作");
        }
        if (warehouseTo) {
            if (!warehouseUid) throw new Error("此操作不支持仓库落格");
            this.placeWarehouse(state,warehouseUid,warehouseTo,warehouseLayout!);
        }
        if (state.warehouseLayout) state.warehouseLayout = this.warehousePlacements(config,state);
        this.syncSources(config,state);
        state.revision++;
        this.validate(config,state);
        return { state, battle };
    }
    static validate(config: InventoryConfig, state: InventoryState): void {
        if (!state.items.length || new Set(state.items.map(i => i.uid)).size !== state.items.length ||
            !Number.isSafeInteger(state.revision) || state.revision < 0) throw new Error("物品 UID 或修订无效");
        if (state.warehouseLayout !== undefined) {
            if (!Array.isArray(state.warehouseLayout) ||
                state.warehouseLayout.length !== state.items.filter(i => i.location.space === "warehouse").length ||
                state.warehouseLayout.some(p => !p || !state.items.some(i => i.uid === p.uid && i.location.space === "warehouse")))
                throw new Error("仓库布局与实际物品不一致");
            this.warehousePlacements(config,state);
        }
        const equipped: string[] = [], grids: { [key: string]: Set<string> } = {};
        for (const item of state.items) {
            const t = this.template(config,item), l = item.location;
            if (!l || !["warehouse","battle","safe","bag","weapon","container","source","consumed","lost"].includes(l.space))
                throw new Error("物品归属无效");
            if (t.kind === "weapon" ? !Number.isInteger(item.durability) || item.durability! < 0 ||
                item.durability! > t.weaponDurability : item.durability !== null)
                throw new Error("实际耐久无效");
            if (["battle","safe","bag"].includes(l.space)) {
                if (l.space === "battle" && !t.battle) throw new Error("斗法匣只收获准战斗药品");
                if (l.space === "safe" && !t.safe) throw new Error("归真匣禁止装备与纳虚器");
                if (typeof l.rotated !== "boolean" || l.rotated && !t.rotate ||
                    !Number.isInteger(l.x) || !Number.isInteger(l.y) || l.x! < 0 || l.y! < 0)
                    throw new Error("物品坐标或旋转无效");
                const [w,h] = this.dimensions(t,l), [width,height] = this.size(config,state,l.space);
                if (l.x! + w > width || l.y! + h > height) throw new Error("尺寸不足或落点超出边界");
                const grid = grids[l.space] ||= new Set();
                for (let y = l.y!; y < l.y! + h; y++) for (let x = l.x!; x < l.x! + w; x++) {
                    const key = `${x}:${y}`;
                    if (grid.has(key)) throw new Error("落点与现有物品相交");
                    grid.add(key);
                }
                if (Object.keys(l).some(k => !["space","x","y","rotated"].includes(k))) throw new Error("网格归属字段无效");
            } else {
                if (Object.keys(l).some(k => !["space",...(l.space === "source" ? ["node"] : [])].includes(k)))
                    throw new Error("列表或装备位不能保留格坐标");
                if (l.space === "source" && (!Number.isInteger(l.node) || l.node! < 0 ||
                    l.node! > config.nodeLimit)) throw new Error("物品来源节点无效");
                if (l.space === "weapon" || l.space === "container") {
                    if (t.kind !== l.space || equipped.includes(l.space)) throw new Error("装备类型或数量不合法");
                    equipped.push(l.space);
                }
            }
        }
        {
            const weight=this.weight(config,state);
            if (weight.current > weight.limit) throw new Error(`负重超限：${weight.current} / ${weight.limit}`);
            if(state.sourceLayouts) {
                if(new Set(state.sourceLayouts.map(s=>s.node)).size!==state.sourceLayouts.length)
                    throw new Error("交互仓库重复");
                for(const source of state.sourceLayouts)
                    if(!this.same(this.sourcePlacements(config,state,source.node),source.slots))
                        throw new Error("交互仓库布局不一致");
                if(state.items.some(i=>i.location.space==="source"&&
                    !state.sourceLayouts!.some(s=>s.node===i.location.node&&s.slots.some(p=>p.uid===i.uid))))
                    throw new Error("来源物品缺少仓库位置");
            }
        }
        if(state.stamina!==undefined && (!Number.isSafeInteger(state.stamina) || state.stamina<0 ||
            state.stamina>(config.staminaMax || 0))) throw new Error("体力数据无效");
        for (const [key,space] of [["consumed","consumed"],["lost","lost"]] as const) {
            if (new Set(state[key]).size !== state[key].length ||
                !this.same(state.items.filter(i => i.location.space === space).map(i => i.uid),state[key].slice().sort((a,b) =>
                    state.items.findIndex(i => i.uid === a) - state.items.findIndex(i => i.uid === b))))
                throw new Error("消费或损失账本不一致");
        }
        if (state.phase === "active" && state.flow?.phase === "battle") {
            const record = state.flow.battles[state.flow.battles.length - 1], carry = this.carry(config,state);
            if (!this.same(record.state.pouch,carry.pouch) || !this.same(record.state.weapon,carry.weapon) ||
                record.state.player.hp !== state.hp || record.state.player.mp !== state.mp)
                throw new Error("战斗与实际携带物不一致");
        }
    }
}
