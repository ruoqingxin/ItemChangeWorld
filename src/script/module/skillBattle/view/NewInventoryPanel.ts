import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { NewBattleCore as Core } from "../newRules/NewBattleCore";
import { NewBuildConfigUtils } from "../newRules/NewBuildConfigUtils";
import { NewInventoryConfigUtils } from "../newRules/NewInventoryConfigUtils";
import { NewInventoryRules as Rules } from "../newRules/NewInventoryRules";
import { NewInventorySession } from "../newRules/NewInventorySession";
import type { NewBuildToken } from "../newRules/NewBuildTypes";
import type { InventoryCommand, InventoryItem, InventoryLocation, InventorySpace, InventoryState } from "../newRules/NewInventoryTypes";
import { NewBuildPanel } from "./NewBuildPanel";

/** Image-backed inventory projection; all accepted changes pass through the single saved reducer. */
export class NewInventoryPanel extends NewBuildPanel {
    private inventoryMode: "storage" | "build" = "storage";
    private uid = "";
    private rotated = false;
    private draft: InventoryCommand | null = null;
    private draftToken: NewBuildToken | null = null;
    private draftError = "";
    private oldWeaponUid = "";
    private inventoryPage = 0;
    private filter = "all";
    private nodes: { [key: string]: Laya.GWidget } = {};
    private visibleItems: InventoryItem[] = [];
    private gridItems: InventoryItem[] = [];
    constructor(view: UIBaseView, readonly inventorySession: NewInventorySession,
        navigate: (screen: "start" | "battle" | "settlement") => void, screen: "start" | "battle" | "settlement") {
        super(view,inventorySession,navigate,screen);
        const root = view.getElement<Laya.GWidget>("inventoryRoot",false);
        if (screen === "battle") return;
        if (!root) throw new Error("储物预制未绑定");
        this.nodes.inventoryRoot = root;
        for (let i = 0; i < root.numChildren; i++) {
            const n = root.getChildAt(i) as Laya.GWidget;
            const bound = view.getElement<Laya.GWidget>(n.name,false);
            if (!bound) throw new Error(`储物节点未绑定：${n.name}`);
            this.nodes[n.name] = bound;
            if (!(n instanceof Laya.GTextField) && !(n instanceof Laya.GImage) && n.numChildren) {
                this.buttons[n.name] = n;
                n.on(Laya.Event.CLICK,this,() => this.command(n.name));
                n.on(Laya.Event.MOUSE_OVER,this,() => {
                    if (n.name === "invRotate") this.label("invNotice","旋转 90 度",18,"#d5dce4");
                });
            }
        }
    }
    refresh(): void {
        if (this.nodes) for (const key of Object.keys(this.nodes)) this.nodes[key].visible = false;
        super.refresh();
    }
    openHubScreen(): void {
        super.openHubScreen();
        Laya.timer.loop(250,this,this.updateInventoryClock);
    }
    private updateInventoryClock(): void {
        if (this.nodes.invClock?.visible && this.inventorySession.inventory?.phase === "active")
            this.label("invClock",this.timeText(),22);
    }
    startRun(): void {
        this.run(() => {
            const session = this.inventorySession, state = session.inventory;
            if (!state || state.phase === "ended") {
                const config = NewInventoryConfigUtils.read(ConfigUtil.Tables), seed = new Uint32Array(1);
                window.crypto.getRandomValues(seed);
                session.prepare(config,NewBuildConfigUtils.profile(config.build),seed[0] || 1);
                this.inventoryMode = "storage"; this.clearSelection(); return;
            }
            if (state.phase === "preparation") {
                session.inventoryCommand({ type: "enter" }); this.inventoryMode = "build"; this.clearSelection();
            } else if (state.flow?.phase === "battle") this.navigate("battle");
            else if (state.flow?.pending) this.inventoryMode = "build";
            else {
                const target = state.flow!.battles.length;
                if (target === session.archive!.config.build.encounters.length) this.stage({ type: "extract" });
                else if (state.node !== target) {
                    session.inventoryCommand({ type: "visit", node: target }); this.inventoryMode = "storage";
                } else { session.dispatch({ type: "battle" }); this.navigate("battle"); }
            }
        });
    }
    protected command(key: string): void {
        if (key === "invToggle") {
            this.run(() => { this.inventoryMode = this.inventoryMode === "storage" ? "build" : "storage"; this.clearSelection(); }); return;
        }
        if (key.startsWith("inv")) {
            this.run(() => this.inventoryCommand(key)); return;
        }
        if (key === "reset" && this.inventorySession.inventory?.phase === "active") {
            this.run(() => { this.inventoryMode = "storage"; this.stage({ type: "abandon" }); }); return;
        }
        if (this.screen === "battle" || this.overlay) { super.command(key); return; }
        if (key === "resetYes" && this.resetConfirm) {
            this.run(() => {
                this.inventorySession.resetConfirmed(); this.resetConfirm = false; this.clearSelection();
            }); return;
        }
        super.command(key);
    }
    private inventoryCommand(key: string): void {
        const session = this.inventorySession, state = session.inventory;
        if (key === "invPrimary") { this.startRun(); return; }
        if (key === "invAbandon") {
            if (session.error) { this.resetConfirm = true; return; }
            this.stage({ type: "abandon" }); return;
        }
        if (key === "invCancel") { this.clearSelection(); return; }
        if (key === "invConfirm" && this.draft) {
            if (this.draftError) throw new Error(this.draftError);
            session.inventoryCommand(this.draft,this.draftToken!);
            this.clearSelection();
            if (session.inventory?.phase === "ended") this.navigate("settlement");
            return;
        }
        if (!state) return;
        if (["invAll","invMedicine","invMaterials","invEquipment"].includes(key)) {
            this.filter = key.slice(3).toLowerCase(); this.inventoryPage = 0; return;
        }
        if (key === "invPrev") { this.inventoryPage = Math.max(0,this.inventoryPage - 1); return; }
        if (key === "invNext") { this.inventoryPage++; return; }
        if (key === "invReveal") { session.inventoryCommand({ type: "reveal" }); return; }
        if (key === "invNodePrev" || key === "invNodeNext") {
            session.inventoryCommand({ type: "visit", node: state.node + (key === "invNodeNext" ? 1 : -1) });
            this.inventoryPage = 0; this.clearSelection(); return;
        }
        if (key === "invExtract") { this.stage({ type: "extract" }); return; }
        if (key === "invRotate") {
            if (!this.uid) return;
            const item = Rules.item(state,this.uid), t = Rules.template(session.archive!.config,item);
            if (!t.rotate) throw new Error("该物品旋转不改变尺寸");
            this.rotated = !this.rotated;
            if (this.draft?.type === "move") {
                const to = { ...this.draft.move.to, rotated: this.rotated };
                this.stageMove(to);
            }
            return;
        }
        if (key === "invUse" && this.uid) {
            const i = Rules.item(state,this.uid); this.stage({ type: "use", uid: i.uid, from: i.location }); return;
        }
        if (key === "invDrop") {
            this.target(state.phase === "preparation" ? { space: "warehouse" } : { space: "ground", node: state.node }); return;
        }
        if (key === "invWeapon" || key === "invContainer") {
            const space = key === "invWeapon" ? "weapon" : "container", equipped = state.items.find(i => i.location.space === space);
            if (!this.uid) { if (equipped) this.selectItem(equipped); return; }
            const i = Rules.item(state,this.uid), t = Rules.template(session.archive!.config,i);
            if (t.kind !== space) throw new Error(space === "weapon" ? "请选择一件武器" : "请选择一个纳虚器本体");
            if (space === "weapon") {
                if (equipped && equipped.uid !== i.uid) {
                    this.oldWeaponUid = equipped.uid; this.notice = "请选择原武器的合法去向，再确认换装";
                } else this.stage({ type: "equipWeapon", uid: i.uid, from: i.location });
            } else this.stageContainer(i);
            return;
        }
        const list = /^invList(\d+)$/.exec(key);
        if (list) {
            const i = this.visibleItems[Number(list[1])];
            if (i) this.selectItem(i);
            return;
        }
        const item = /^invItem(\d+)$/.exec(key);
        if (item) {
            const i = this.gridItems[Number(item[1])];
            if (!i) return;
            if (this.uid && this.uid !== i.uid) this.target({ ...i.location, rotated: this.rotated });
            else this.selectItem(Rules.item(state,i.uid));
            return;
        }
        const cell = /^invCell_(battle|safe|bag)_(\d+)$/.exec(key);
        if (cell) {
            const [width] = Rules.size(session.archive!.config,this.projection()!,cell[1] as InventorySpace);
            this.target({ space: cell[1] as InventorySpace, x: Number(cell[2]) % width,
                y: Math.floor(Number(cell[2]) / width), rotated: this.rotated });
        }
    }
    private selectItem(item: InventoryItem): void {
        this.uid = item.uid; this.rotated = !!item.location.rotated; this.notice = ""; this.oldWeaponUid = "";
        if (this.draft?.type !== "equipContainer") { this.draft = null; this.draftToken = null; this.draftError = ""; }
    }
    private clearSelection(): void {
        this.uid = ""; this.draft = null; this.draftToken = null; this.draftError = "";
        this.oldWeaponUid = ""; this.notice = "";
    }
    private stage(command: InventoryCommand): void {
        this.draft = command; this.draftToken = this.inventorySession.token; this.checkDraft();
    }
    private checkDraft(): void {
        this.draftError = ""; this.notice = "";
        try { this.inventorySession.previewMove(this.draft!,this.draftToken!); }
        catch (error) { this.draftError = (error as Error).message; }
    }
    private stageContainer(item: InventoryItem | null): void {
        const state = this.inventorySession.inventory!, old = state.items.find(i => i.location.space === "container");
        this.stage({ type: "equipContainer", uid: item?.uid || null, from: item?.location,
            oldTo: old ? state.phase === "preparation" ? { space: "warehouse" } : { space: "ground", node: state.node } : undefined,
            contents: state.items.filter(i => i.location.space === "bag").map(i => ({
                uid: i.uid, from: i.location, to: Core.clone(i.location),
            })) });
        this.uid = "";
    }
    private target(to: InventoryLocation): void {
        if (!this.uid) throw new Error("尚未选中物品");
        const state = this.inventorySession.inventory!, item = Rules.item(state,this.uid);
        if (this.oldWeaponUid) {
            this.stage({ type: "equipWeapon", uid: item.uid, from: item.location, oldTo: to }); return;
        }
        if (this.draft?.type === "equipContainer") {
            const m = this.draft.contents.find(m => m.uid === item.uid);
            if (!m) throw new Error("换匣预览中只能安排原纳虚器内容");
            m.to = to; this.checkDraft(); return;
        }
        if (item.location.space === "weapon") {
            this.stage({ type: "equipWeapon", uid: null, oldTo: to }); return;
        }
        if (item.location.space === "container") {
            this.stageContainer(null); return;
        }
        this.stageMove(to);
    }
    private stageMove(to: InventoryLocation): void {
        const i = Rules.item(this.inventorySession.inventory!,this.uid);
        this.stage({ type: "move", move: { uid: i.uid, from: i.location, to } });
    }
    private projection(): InventoryState | null {
        const s = this.inventorySession.inventory;
        if (!s || this.draft?.type !== "equipContainer") return s;
        const command = this.draft, old = s.items.find(i => i.location.space === "container");
        if (old) old.location = command.oldTo!;
        if (command.uid) Rules.item(s,command.uid).location = { space: "container" };
        for (const m of command.contents) Rules.item(s,m.uid).location = Core.clone(m.to);
        return s;
    }
    protected renderStart(): void {
        if (this.inventorySession.inventory?.phase === "active" && this.inventoryMode === "build") {
            super.renderStart();
            this.button("invToggle","储物",24,78,128,48);
            // A run must not silently skip the current node's loot panel.
            return;
        }
        this.renderInventory();
    }
    protected renderSettlement(): void {
        if (this.inventorySession.inventory?.phase === "ended") this.renderInventory();
        else this.renderStart();
    }
    protected renderReset(): void {
        super.renderReset();
        this.text("resultTitle","清除损坏的储物演练档？",240,190,800,60,30,"#e3c98c");
        this.text("resultDetail","仅删除阶段 3 演练档，阶段 1、2 及其他应用存档保留。",200,284,880,90,22);
    }
    private label(key: string, text: string, size = 18, color = "#e8edf0"): void {
        const l = this.nodes[key] as Laya.GTextField;
        l.text = text; l.fontSize = size; l.color = color; l.textIns.color = color;
        l.textIns.wordWrap = true; l.visible = true;
        this.fit(l,12);
    }
    private control(key: string, text: string, enabled = true, selected = false): void {
        const n = this.nodes[key]; n.visible = true; n.mouseEnabled = enabled; n.alpha = enabled ? 1 : 0.4;
        const l = n.getChildAt(1) as Laya.GTextField;
        l.text = text; l.fontSize = n.height <= 32 ? 16 : 18;
        l.y = 0; l.height = n.height; l.color = selected ? "#ffd879" : "#e8edf0"; l.textIns.color = l.color;
        l.textIns.wordWrap = true; l.align = key.startsWith("invList") ? "left" : "center"; l.valign = "middle";
        (n.getChildAt(0) as Laya.GImage).alpha = selected ? 0.55 : 0.95;
        this.fit(l,12);
    }
    private fit(label: Laya.GTextField, min: number): void {
        label.textIns.typeset(true);
        while (label.fontSize > min && (label.textIns.textWidth > label.width || label.textIns.textHeight > label.height)) {
            label.fontSize--; label.textIns.typeset(true);
        }
    }
    private icon(n: Laya.GWidget, src: string, width: number, height: number, x = 6, y = 6): void {
        const image = n.getChildAt(2) as Laya.GImage;
        image.src = src; image.visible = true;
        const texture = Laya.loader.getRes(src) as Laya.Texture;
        const ratio = Math.min(width / (texture?.width || width),height / (texture?.height || height));
        const w = (texture?.width || width) * ratio, h = (texture?.height || height) * ratio;
        image.pos(x + (width - w) / 2,y + (height - h) / 2); image.size(w,h);
    }
    private renderInventory(): void {
        const session = this.inventorySession, save = session.archive, actual = save?.state, state = this.projection();
        this.backdrop();
        const root = this.nodes.inventoryRoot; root.visible = true;
        for (const key of Object.keys(this.nodes)) if (key !== "inventoryRoot") this.nodes[key].visible = false;
        for (const key of ["invLeftPanel","invBagPanel","invBagTopbar","invRightPanel","invLock"]) this.nodes[key].visible = true;
        this.label("invTitle","末法寻仙 · 储物演练",26,"#e3c98c");
        this.label("invClock",actual?.phase === "active" ? this.timeText() : actual?.phase === "preparation" ? "整备" : "演练库存",22);
        this.label("invEquipTitle","装备",18,"#c2dbdd");
        this.label("invBattleTitle","斗法匣 · 5 格",18,"#e3c98c");
        this.label("invSafeTitle","归真匣 · 2 格",18,"#a5d8b9");
        this.label("invProtection","归真匣保护非装备。\n装备、斗法匣与纳虚器\n在失败时损失。",18,"#bbcbd0");
        this.label("invBagTitle","纳虚器",20,"#c2dbdd");
        this.label("invSourceTitle",actual?.phase === "active" ? `节点 ${actual.node + 1} · 地面来源` :
            actual?.phase === "ended" ? "结算账本" : "统一库存 · 演练物品",20,"#e3c98c");
        this.control("invPrimary",!state || state.phase === "ended" ? "建立新演练库存" :
            state.phase === "preparation" ? "入境" : state.flow?.phase === "battle" ? "返回战斗" :
            state.flow?.pending ? "领取借法" : state.node < state.flow!.battles.length ? "前往下一节点" : "进入战斗",!session.error && !this.draft);
        if (session.error) this.control("invAbandon","清除损坏档");
        if (!state || !save) { this.label("invNotice",session.error || ""); return; }
        const editable = state.phase !== "ended" && state.flow?.phase !== "battle";
        for (const space of ["weapon","container"] as const) {
            const key = space === "weapon" ? "invWeapon" : "invContainer", item = state.items.find(i => i.location.space === space);
            this.control(key,"",editable && this.draft?.type !== "equipContainer");
            const icon = this.nodes[key].getChildAt(2) as Laya.GImage; icon.visible = !!item;
            if (item) this.icon(this.nodes[key],Rules.template(save.config,item).icon,46,46,7,7);
            this.label(key+"Name",item ? `${Rules.template(save.config,item).name}${space === "weapon" ?
                `\n耐久 ${item.durability}/${save.config.build.setup.weapon!.maxDurability}` : ""}` :
                space === "weapon" ? "未装备武器" : "未装备纳虚器",17);
        }
        let count = 0;
        for (const space of ["battle","safe","bag"] as const) {
            const [cols,rows] = Rules.size(save.config,state,space), size = space === "bag" ? 50 : space === "battle" ? 52 : 64;
            const startX = space === "bag" ? 350 : 34, startY = space === "bag" ? 120 : space === "battle" ? 282 : 388;
            if (space === "bag") {
                this.label("invBagTitle",`纳虚器${cols ? ` · ${cols}×${rows}` : ""}${this.draft?.type === "equipContainer" ? " · 换匣预览" : ""}`,20);
                if (!cols) this.label("invEmptyBag","未装备纳虚器",22,"#c2cbcf");
            }
            for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
                const key = `invCell_${space}_${y * cols + x}`, cell = this.nodes[key];
                this.control(key,"",editable); cell.pos(startX + x * size,startY + y * size);
            }
            for (const item of state.items.filter(i => i.location.space === space)) {
                const key = `invItem${count++}`, n = this.nodes[key], t = Rules.template(save.config,item);
                const [w,h] = Rules.dimensions(t,item.location);
                this.control(key,"",editable,item.uid === this.uid);
                n.pos(startX + item.location.x! * size,startY + item.location.y! * size); n.size(w * size - 2,h * size - 2);
                const bg = n.getChildAt(0) as Laya.GImage; bg.size(n.width,n.height);
                bg.src = `ui/atlas/module/inventory/${item.uid === this.uid ? "item-frame-selected" : "item-frame"}.png`;
                this.icon(n,t.icon,n.width - 12,n.height - 12);
                const caption = n.getChildAt(3) as Laya.GTextField;
                caption.text = `${w}×${h}`; caption.pos(3,n.height - 22); caption.size(n.width - 6,22);
                caption.color = "#ffffff"; caption.fontSize = 12;
            }
        }
        const gridItems = state.items.filter(i => ["battle","safe","bag"].includes(i.location.space));
        // The item indices are shared by the click projection above.
        gridItems.sort((a,b) => ["battle","safe","bag"].indexOf(a.location.space) - ["battle","safe","bag"].indexOf(b.location.space));
        this.gridItems = gridItems;
        if (this.draft?.type === "move") {
            const to = this.draft.move.to;
            if (["battle","safe","bag"].includes(to.space)) {
                const size = to.space === "bag" ? 50 : to.space === "battle" ? 52 : 64;
                const x = to.space === "bag" ? 350 : 34, y = to.space === "bag" ? 120 : to.space === "battle" ? 282 : 388;
                const item = Rules.item(actual!,this.draft.move.uid), [w,h] = Rules.dimensions(Rules.template(save.config,item),to);
                const ghost = this.nodes.invGhost; ghost.pos(x + to.x! * size,y + to.y! * size);
                ghost.size(w * size - 2,h * size - 2); ghost.visible = true;
            }
        }
        let list = state.items.filter(i => i.location.space === (state.phase === "active" ? "ground" : "warehouse") &&
            (state.phase !== "active" || i.location.node === state.node && state.revealed.includes(state.node)));
        if (state.phase === "ended") list = state.items.filter(i => this.filter === "all" ? i.location.space === "warehouse" :
            this.filter === "medicine" ? state.returned.includes(i.uid) : this.filter === "materials" ?
                state.lost.includes(i.uid) : state.consumed.includes(i.uid));
        else list = list.filter(i => {
            const t = Rules.template(save.config,i);
            return this.filter === "all" || this.filter === "medicine" && ["hp","mp","repair"].includes(t.kind) ||
                this.filter === "materials" && ["material","book"].includes(t.kind) ||
                this.filter === "equipment" && ["weapon","container"].includes(t.kind);
        });
        const pages = Math.max(1,Math.ceil(list.length / 8)); this.inventoryPage = Math.min(this.inventoryPage,pages - 1);
        this.visibleItems = list.slice(this.inventoryPage * 8,this.inventoryPage * 8 + 8);
        this.visibleItems.forEach((item,i) => {
            const key = `invList${i}`, t = Rules.template(save.config,item);
            this.control(key,`${t.name} · ${t.width}×${t.height}${item.durability !== null ? ` · 耐久 ${item.durability}` : ""}`,
                editable || state.phase === "ended",item.uid === this.uid);
            this.icon(this.nodes[key],t.icon,38,38,7,4);
        });
        const filters = state.phase === "ended" ? [["invAll","库存"],["invMedicine","实际带回"],["invMaterials","实际损失"],["invEquipment","已消耗"]] :
            [["invAll","全部"],["invMedicine","药与修补"],["invMaterials","书与材料"],["invEquipment","装备"]];
        for (const [key,name] of filters)
            this.control(key,name,true,this.filter === key.slice(3).toLowerCase());
        const revealed = state.revealed.includes(state.node);
        if (state.phase === "active" && !revealed) this.control("invReveal","揭示当前来源",editable);
        else this.control("invPrev","<",this.inventoryPage > 0);
        this.control("invNext",">",this.inventoryPage + 1 < pages);
        this.label("invPage",`${list.length} 件 · ${this.inventoryPage + 1}/${pages}`,17,"#b9c9cf");
        const selected = actual!.items.find(i => i.uid === this.uid);
        let detail = selected ? this.describeItem(selected) : `生命 ${Core.format(state.hp)} / ${Core.format(save.config.build.setup.player.maxHp)}\n灵力 ${Core.format(state.mp)} / ${Core.format(save.config.build.setup.player.maxMp)}`;
        if (this.draft?.type === "equipContainer") {
            const old = actual!.items.find(i => i.location.space === "container");
            const next = this.draft.uid && Rules.item(actual!,this.draft.uid);
            detail = `换匣：${old ? Rules.template(save.config,old).name : "无"} → ${next ? Rules.template(save.config,next).name : "无"}\n原内容 ${this.draft.contents.length} 件 · 旧本体${state.phase === "preparation" ? "回仓库" : "落当前地面"}${selected ? `\n${this.describeItem(selected)}` : ""}`;
        } else if (this.draft?.type === "equipWeapon") detail += `\n原武器去向：${this.locationName(this.draft.oldTo)}`;
        else if (this.draft?.type === "extract") detail = "确认撤离\n仅带回当前携带物，地面物品清局。";
        else if (this.draft?.type === "abandon") detail = "确认放弃\n只保留归真匣，所有携带装备及其他内容损失。";
        if (state.phase === "ended") detail = `${{extract:"撤离成功",defeat:"战斗失败",abandon:"已主动放弃",timeout:"演练超时"}[state.result!]}\n带回 ${state.returned.length} 件 · 损失 ${state.lost.length} 件\n已消耗 ${state.consumed.length} 件${selected ? `\n${Rules.template(save.config,selected).name}` : ""}`;
        this.label("invDetail",detail,18,"#d9e1e5");
        this.label("invNotice",session.error || this.draftError || this.notice ||
            (this.draft ? "预览未提交" : ""),18,this.draftError ? "#ffb4a8" : "#c2d1d8");
        this.control("invRotate","",editable && !!selected && Rules.template(save.config,selected).rotate);
        (this.nodes.invRotate.getChildAt(2) as Laya.GImage).visible = true;
        this.control("invCancel","取消",!!this.uid || !!this.draft);
        this.control("invConfirm","确认提交",!!this.draft && !this.draftError);
        this.control("invUse","使用",editable && state.phase === "active" && !!selected && !this.draft &&
            ["hp","mp","repair"].includes(Rules.template(save.config,selected).kind));
        this.control("invDrop",state.phase === "preparation" ? "放回仓库" : "放到地面",editable && !!selected &&
            (state.phase === "preparation" || revealed));
        if (state.phase === "active") {
            this.control("invAbandon","放弃",true);
            this.control("invExtract","撤离",editable && !state.flow?.pending && !this.draft);
            const victories = state.flow!.battles.filter(b => b.state.phase === "victory").length;
            this.control("invNodePrev","<",editable && state.node > 0 && !state.flow?.pending && !this.draft);
            this.control("invNodeNext",">",editable && state.node < victories && !state.flow?.pending && !this.draft);
            this.button("invToggle","构筑",630,16,128,46,editable && !this.draft);
        }
    }
    protected renderBattle(): void {
        super.renderBattle();
        const archive = this.inventorySession.archive;
        if (!archive) return;
        for (const item of archive.state.items.filter(i => i.location.space === "battle")) {
            if (Rules.template(archive.config,item).kind === "repair") {
                const index = item.location.y! * archive.config.spaces.battleWidth + item.location.x!;
                this.button(`pouch${index}`,"修补工具\n战外使用",454 + index * 112,540,102,62,false);
            }
        }
    }
    private locationName(l?: InventoryLocation): string {
        return !l ? "无" : ({warehouse:"仓库",battle:"斗法匣",safe:"归真匣",bag:"纳虚器",weapon:"武器位",
            container:"纳虚器位",ground:"当前地面",consumed:"已消耗",lost:"损失"})[l.space] +
            (l.x !== undefined ? ` ${l.x + 1},${l.y! + 1}` : "");
    }
    private describeItem(item: InventoryItem): string {
        const t = Rules.template(this.inventorySession.archive!.config,item);
        return `${t.name} · ${t.width}×${t.height}${this.rotated ? " · 旋转" : ""}\n${this.locationName(item.location)}${item.durability !== null ?
            ` · 耐久 ${item.durability}` : ""}\n${t.safe ? "归真匣合规，仍需尺寸适配" : "禁止归真匣"}${t.kind === "book" ? "\n书籍本阶段仅携入带出，不学习" : ""}`;
    }
}
