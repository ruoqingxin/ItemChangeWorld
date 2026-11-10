import { NewBattleCore as Core } from "./NewBattleCore";
import { NewBuildRules as Build } from "./NewBuildRules";
import type { NewBattleCarry, NewBattleResult } from "./NewBattleTypes";
import type { NewBuildProfile } from "./NewBuildTypes";
import type { InventoryCommand, InventoryConfig, InventoryItem, InventoryLocation, InventoryMove,
    InventorySpace, InventoryState, InventoryTemplate, InventoryWarehousePlacement, InventoryWarehouseTarget } from "./NewInventoryTypes";

/** Every instance, including spent and lost items, has exactly one authoritative location. */
export class NewInventoryRules {
    static readonly WAREHOUSE_COLUMNS = 8;
    static readonly WAREHOUSE_ROWS = 7;
    static same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
    static template(config: InventoryConfig, item: InventoryItem): InventoryTemplate {
        const row = config.templates.find(t => t.id === item.templateId);
        if (!row) throw new Error("物品模板不存在");
        return row;
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
    static validateConfig(config: InventoryConfig, profile: NewBuildProfile): void {
        Build.validateConfig(config.build, profile);
        const int = (n: number, min = 0, max = 100000000) => Number.isSafeInteger(n) && n >= min && n <= max;
        if (!config.spaces || !Object.values(config.spaces).every(v => int(v, 1)) ||
            config.spaces.battleWidth * config.spaces.battleHeight !== 5 ||
            config.spaces.safeWidth * config.spaces.safeHeight !== 2 ||
            !Array.isArray(config.templates) || !config.templates.length ||
            new Set(config.templates.map(t => t.id)).size !== config.templates.length)
            throw new Error("三空间配置无效");
        for (const t of config.templates) {
            if (!int(t.id, 1) || !t.name || !["hp","mp","repair","book","material","weapon","container"].includes(t.kind) ||
                !int(t.width, 1, 8) || !int(t.height, 1, 6) || t.stack !== 1 ||
                ![t.rotate,t.battle,t.safe].every(v => typeof v === "boolean") ||
                !int(t.bagWidth, 0, 8) || !int(t.bagHeight, 0, 6) || !int(t.potionId) ||
                !/^(?:ui\/atlas\/module\/inventory\/[\w-]+|ui\/image\/naxu\/naxu-[a-z]+-q[1-6])\.png$/.test(t.icon) ||
                (t.quality !== undefined && !int(t.quality, 1, 6)) ||
                (["weapon","container"].includes(t.kind) && (t.safe || t.battle)) ||
                (t.battle && !["hp","mp","repair"].includes(t.kind)) ||
                (t.kind === "container" ? !t.bagWidth || !t.bagHeight : t.bagWidth !== 0 || t.bagHeight !== 0))
                throw new Error("物品形状、类别或资源配置无效");
            if (t.kind === "hp" || t.kind === "mp") {
                if (!config.build.setup.potions.some(p => p.itemId === t.potionId && p.resource === t.kind) ||
                    t.width !== 1 || t.height !== 1) throw new Error("实际药品与新核配置不匹配");
            } else if (t.potionId !== 0) throw new Error("非药品不能借用药品效果");
            if (t.kind === "weapon" && (t.width !== 2 || t.height !== 3) ||
                t.kind === "container" && (t.width !== 2 || t.height !== 2))
                throw new Error("武器实体须为2×3六格，纳虚器本体须为2×2四格");
        }
        if (!config.build.setup.weapon || !Array.isArray(config.fixtures) || !config.fixtures.length ||
            new Set(config.fixtures.map(f => f.id)).size !== config.fixtures.length)
            throw new Error("隔离物品来源缺失");
        for (const f of config.fixtures) {
            const t = config.templates.find(t => t.id === f.templateId);
            if (!t || !int(f.id,1) || !int(f.count,1,30) || !int(f.node,0,config.build.encounters.length + 1) ||
                !int(f.durability,0,config.build.setup.weapon.maxDurability))
                throw new Error("演练来源表无效");
        }
    }
    static start(config: InventoryConfig, profile: NewBuildProfile, seed: number, runId: string): InventoryState {
        this.validateConfig(config, profile);
        Build.start(config.build, profile, seed, runId);
        const items: InventoryItem[] = [];
        for (const f of config.fixtures) for (let n = 0; n < f.count; n++) {
            const t = config.templates.find(t => t.id === f.templateId)!;
            items.push({ uid: `${runId}:f${f.id}:${n}`, templateId: t.id,
                location: f.node === 0 ? { space: "warehouse" } : { space: "ground", node: f.node - 1 },
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
    static warehousePlacements(config: InventoryConfig, state: InventoryState): InventoryWarehousePlacement[] {
        const items = state.items.filter(i => i.location.space === "warehouse"), byUid = new Map(items.map(i => [i.uid,i]));
        const placed = new Map<string,InventoryWarehousePlacement>(), occupied = new Map<number,Set<number>>();
        const cols = this.WAREHOUSE_COLUMNS, rows = this.WAREHOUSE_ROWS;
        const reserve = (slot: InventoryWarehousePlacement) => {
            const item = byUid.get(slot.uid)!;
            const t = this.template(config,item), [w,h] = this.dimensions(t,{ space: "warehouse", rotated: slot.rotated });
            if (placed.has(slot.uid) || !Number.isSafeInteger(slot.page) || slot.page < 0 || slot.page >= state.items.length ||
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
        // Keep committed positions; only new arrivals use the first available space.
        for (const slot of state.warehouseLayout || []) if (byUid.has(slot.uid)) reserve(slot);
        for (const item of items) {
            if (placed.has(item.uid)) continue;
            const t = this.template(config,item);
            if (t.width > cols || t.height > rows) throw new Error("物品超出仓库单页尺寸");
            let found = false;
            for (let page = 0; !found; page++) {
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
    private static placeWarehouse(state: InventoryState, uid: string, to: InventoryWarehouseTarget,
        layout: InventoryWarehousePlacement[]): void {
        if (!to || !Number.isSafeInteger(to.page) || to.page < 0 ||
            to.page > Math.max(0,...layout.map(p => p.page)) ||
            Object.keys(to).some(k => !["page","x","y","rotated"].includes(k)))
            throw new Error("仓库目标页无效");
        const present = new Set(state.items.filter(i => i.location.space === "warehouse").map(i => i.uid));
        if (!present.has(uid)) throw new Error("指定落格的物品必须移入仓库");
        // Pin existing items before reserving the drop; unload overflow is packed around it.
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
        this.movable(state);
        const old = state.items.find(i => i.location.space === "container");
        const next = uid ? this.item(state,uid) : null;
        if (next) {
            this.accessible(state,next.location);
            if (this.template(config,next).kind !== "container" ||
                !["bag",state.phase === "preparation" ? "warehouse" : "ground"].includes(next.location.space))
                throw new Error("新纳虚器须来自背包、仓库或当前节点地面");
        }
        if (old?.uid === uid) throw new Error("已经装备此纳虚器");
        if (!old && !next) throw new Error("没有纳虚器可卸下");
        const outside: InventoryLocation = state.phase === "preparation" ? { space: "warehouse" } :
            { space: "ground", node: state.node };
        if (old || state.items.some(i => i.location.space === "bag")) this.accessible(state,outside);
        const template = next && this.template(config,next), width = template?.bagWidth || 0,
            height = template?.bagHeight || 0, items = state.items.filter(i => i.location.space === "bag" && i.uid !== next?.uid);
        let targets = new Map<string,InventoryLocation>();
        // Keep an already legal layout, including user-arranged layouts when upgrading.
        if (items.every(i => {
            const [w,h] = this.dimensions(this.template(config,i),i.location);
            return i.location.x! + w <= width && i.location.y! + h <= height;
        })) {
            targets = new Map(items.map(i => [i.uid,Core.clone(i.location)]));
        } else {
            const rows = items.map((item,index) => ({ item, index, t: this.template(config,item) }));
            let bestArea = -1, bestCount = -1;
            // Try stable large-first orders and both preferred orientations to reduce fragmentation.
            // This is bounded (at most 16 small-grid passes), not an optimal-packing search.
            for (const order of ["area","side","width","height"] as const) for (const reverse of [false,true])
                for (const rotateFirst of [false,true]) {
                    const score = (t: InventoryTemplate) => order === "area" ? t.width * t.height :
                        order === "side" ? Math.max(t.width,t.height) : order === "width" ? t.width : t.height;
                    const sorted = rows.slice().sort((a,b) => score(b.t) - score(a.t) ||
                        b.t.width * b.t.height - a.t.width * a.t.height ||
                        (reverse ? b.index - a.index : a.index - b.index));
                    const occupied = new Set<number>(), packed = new Map<string,InventoryLocation>();
                    let area = 0;
                    for (const { item, t } of sorted) {
                        const preferred = !!item.location.rotated !== rotateFirst;
                        const rotations = t.rotate && t.width !== t.height ? [preferred,!preferred] : [!!item.location.rotated];
                        let to: InventoryLocation | null = null;
                        for (let y = 0; y < height && !to; y++) for (let x = 0; x < width && !to; x++)
                            for (const rotated of rotations) {
                                const [w,h] = this.dimensions(t,{ space: "bag", rotated });
                                if (x + w > width || y + h > height) continue;
                                let free = true;
                                for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
                                    if (occupied.has((y + dy) * width + x + dx)) free = false;
                                if (!free) continue;
                                to = { space: "bag", x, y, rotated };
                                for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++)
                                    occupied.add((y + dy) * width + x + dx);
                                break;
                            }
                        if (to) { packed.set(item.uid,to); area += t.width * t.height; }
                    }
                    if (area > bestArea || area === bestArea && packed.size > bestCount) {
                        targets = packed; bestArea = area; bestCount = packed.size;
                    }
                }
        }
        return { type: "equipContainer", uid, ...(next ? { from: Core.clone(next.location) } : {}),
            ...(old ? { oldTo: Core.clone(outside) } : {}),
            contents: items.map(i => ({ uid: i.uid, from: Core.clone(i.location),
                to: Core.clone(targets.get(i.uid) || outside) })) };
    }
    private static accessible(state: InventoryState, location: InventoryLocation): void {
        if (["consumed","lost"].includes(location.space)) throw new Error("该物品已消耗或损失");
        if (location.space === "warehouse" && state.phase !== "preparation") throw new Error("局内不能访问局外仓库");
        if (location.space === "ground" && (state.phase !== "active" ||
            location.node !== state.node || !state.revealed.includes(state.node)))
            throw new Error("只能取放当前已揭示节点的物品");
    }
    private static source(state: InventoryState, uid: string, from: InventoryLocation): InventoryItem {
        const item = this.item(state, uid);
        if (!this.same(item.location, from)) throw new Error("物品来源已改变，请重新选择");
        this.accessible(state, from);
        return item;
    }
    private static destination(state: InventoryState, to: InventoryLocation): void {
        if (["weapon","container","consumed","lost"].includes(to.space)) throw new Error("目标必须是合法储物或地面位置");
        this.accessible(state, to);
    }
    private static movable(state: InventoryState): void {
        if (state.phase === "ended") throw new Error("本次演练已结算");
        if (state.flow?.phase === "battle") throw new Error("战斗中锁定整理、换装与修补");
    }
    private static consume(state: InventoryState, item: InventoryItem): void {
        item.location = { space: "consumed" }; state.consumed.push(item.uid);
    }
    static carry(config: InventoryConfig, state: InventoryState): NewBattleCarry {
        const weapon = state.items.find(i => i.location.space === "weapon");
        const pouch: NewBattleCarry["pouch"] = [null,null,null,null,null];
        for (const item of state.items.filter(i => i.location.space === "battle")) {
            const t = this.template(config,item);
            if (t.kind === "hp" || t.kind === "mp")
                pouch[item.location.y! * config.spaces.battleWidth + item.location.x!] = { itemUid: item.uid, itemId: t.potionId };
        }
        return { hp: state.hp, mp: state.mp, weapon: weapon ?
            { ...Core.clone(config.build.setup.weapon!), durability: weapon.durability! } : null, pouch };
    }
    private static settle(state: InventoryState, result: NonNullable<InventoryState["result"]>): void {
        state.result = result; state.phase = "ended";
        for (const item of state.items) {
            const space = item.location.space;
            if (["warehouse","consumed","lost"].includes(space)) continue;
            if (space !== "ground" && (result === "extract" || space === "safe")) {
                item.location = { space: "warehouse" }; state.returned.push(item.uid);
            } else { item.location = { space: "lost" }; state.lost.push(item.uid); }
        }
    }
    static apply(config: InventoryConfig, profile: NewBuildProfile, snapshot: InventoryState,
        command: InventoryCommand, at: number, seed: number): { state: InventoryState; battle?: NewBattleResult } {
        const state = Core.clone(snapshot);
        if (!command || state.phase === "ended") throw new Error("本次演练已结算");
        if (!Number.isSafeInteger(at) || at < 0) throw new Error("操作时间无效");
        if (state.deadlineAt !== null && (command.type === "timeout" ? at < state.deadlineAt : at >= state.deadlineAt))
            throw new Error("已到截止，须先结算超时");
        let battle: NewBattleResult | undefined;
        const warehouseTo = "warehouseTo" in command ? command.warehouseTo : undefined;
        const warehouseLayout = warehouseTo ? this.warehousePlacements(config,state) : undefined;
        let warehouseUid: string | undefined;
        switch (command.type) {
            case "enter":
                if (state.phase !== "preparation") throw new Error("不能重复入境");
                state.flow = Build.start(config.build, profile, seed, state.runId);
                state.phase = "active"; state.enteredAt = at; state.deadlineAt = at + 1200000;
                break;
            case "move": {
                this.movable(state);
                const { uid, from, to } = command.move, item = this.source(state,uid,from);
                if (["weapon","container"].includes(from.space))
                    throw new Error("装备本体须通过换装事务移动");
                this.destination(state,to);
                if (warehouseTo && to.space !== "warehouse") throw new Error("仓库落点只能用于入库");
                item.location = Core.clone(to);
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
                    this.destination(state,command.oldTo); old.location = Core.clone(command.oldTo);
                    if (state.warehouseLayout && next && this.same(command.oldTo,command.from) && command.oldTo.space === "warehouse")
                        state.warehouseLayout = state.warehouseLayout.map(p => p.uid === next.uid ? { ...p, uid: old.uid } : p);
                }
                if (next) next.location = { space: "weapon" };
                break;
            }
            case "equipContainer": {
                this.movable(state);
                const old = state.items.find(i => i.location.space === "container");
                if (old && old.uid === command.uid) throw new Error("已经装备此纳虚器");
                const next = command.uid ? this.source(state,command.uid,command.from!) : null;
                if (next && (this.template(config,next).kind !== "container" ||
                    !["bag",state.phase === "preparation" ? "warehouse" : "ground"].includes(next.location.space)))
                    throw new Error("新纳虚器须来自背包、仓库或当前节点地面");
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
                    this.destination(state,m.to); item.location = Core.clone(m.to);
                }
                if (old) {
                    const target: InventoryLocation = state.phase === "preparation" ? { space: "warehouse" } :
                        { space: "ground", node: state.node };
                    if (!this.same(command.oldTo,target)) throw new Error("旧纳虚器必须回仓库或当前节点地面");
                    this.destination(state,target); old.location = target;
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
                    const max = config.build.setup.weapon!.maxDurability;
                    if (weapon.durability! >= max) throw new Error("武器耐久已满，工具未消耗");
                    weapon.durability = Math.min(max,weapon.durability! + config.spaces.repair);
                } else if (t.kind === "hp" || t.kind === "mp") {
                    const max = t.kind === "hp" ? config.build.setup.player.maxHp : config.build.setup.player.maxMp;
                    if (state[t.kind] >= max) throw new Error(t.kind === "hp" ? "生命已满" : "灵力已满");
                    state[t.kind] = Math.min(max,state[t.kind] + config.build.setup.potions.find(p => p.itemId === t.potionId)!.amount);
                } else throw new Error("此物品不能使用；本阶段不开放学习");
                this.consume(state,item);
                break;
            }
            case "visit":
                this.movable(state);
                if (state.phase !== "active" || state.flow?.pending || !Number.isInteger(command.node) ||
                    command.node < 0 || command.node > state.flow!.battles.filter(b => b.state.phase === "victory").length)
                    throw new Error("该隔离节点尚不可达");
                state.node = command.node;
                break;
            case "reveal":
                this.movable(state);
                if (state.phase !== "active" || state.revealed.includes(state.node)) throw new Error("当前来源不可重复揭示");
                state.revealed.push(state.node);
                break;
            case "build": {
                if (state.phase !== "active" || !state.flow ||
                    ["finish","extract","abandon","timeout"].includes(command.command.type))
                    throw new Error("该操作须从整局事务提交");
                if (command.command.type === "battle" && state.node !== state.flow.battles.length)
                    throw new Error("请前往当前可战节点");
                const result = Build.apply(config.build, profile, state.flow, command.command, at, this.carry(config,state));
                state.flow = result.state; battle = result.battle;
                if (command.command.type === "action") {
                    if (!battle?.ok) throw new Error("战斗提交失败");
                    state.hp = battle.state.player.hp; state.mp = battle.state.player.mp;
                    const weapon = state.items.find(i => i.location.space === "weapon");
                    if (weapon) weapon.durability = battle.state.weapon!.durability;
                    if (command.command.action.type === "potion") {
                        const item = this.item(state,command.command.action.itemUid);
                        if (item.location.space !== "battle") throw new Error("战斗药品不属于斗法匣");
                        this.consume(state,item);
                    }
                    if (state.flow.endReason === "defeat") this.settle(state,"defeat");
                }
                break;
            }
            case "extract": case "abandon": case "timeout":
                if (state.phase !== "active" || !state.flow) throw new Error("当前未入境");
                state.flow = Build.apply(config.build,profile,state.flow,{ type: command.type },at).state;
                this.settle(state,command.type);
                break;
            default: throw new Error("不支持的物品操作");
        }
        if (warehouseTo) {
            if (!warehouseUid) throw new Error("此操作不支持仓库落格");
            this.placeWarehouse(state,warehouseUid,warehouseTo,warehouseLayout!);
        }
        if (state.warehouseLayout) state.warehouseLayout = this.warehousePlacements(config,state);
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
            if (!l || !["warehouse","battle","safe","bag","weapon","container","ground","consumed","lost"].includes(l.space))
                throw new Error("物品归属无效");
            if (t.kind === "weapon" ? !Number.isInteger(item.durability) || item.durability! < 0 ||
                item.durability! > config.build.setup.weapon!.maxDurability : item.durability !== null)
                throw new Error("实际耐久无效");
            if (["battle","safe","bag"].includes(l.space)) {
                if (l.space === "battle" && !t.battle) throw new Error("斗法匣只收获准药品或修补工具");
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
                if (Object.keys(l).some(k => !["space",...(l.space === "ground" ? ["node"] : [])].includes(k)))
                    throw new Error("列表或装备位不能保留格坐标");
                if (l.space === "ground" && (!Number.isInteger(l.node) || l.node! < 0 ||
                    l.node! > config.build.encounters.length)) throw new Error("地面来源无效");
                if (l.space === "weapon" || l.space === "container") {
                    if (t.kind !== l.space || equipped.includes(l.space)) throw new Error("装备类型或数量不合法");
                    equipped.push(l.space);
                }
            }
        }
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
