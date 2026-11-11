import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ConfigUtil } from "../../../config/ConfigUtil";
import { EQuality } from "../../../config/schema";
import { NewBattleCore as Core } from "../newRules/NewBattleCore";
import { NewBuildConfigUtils } from "../newRules/NewBuildConfigUtils";
import { NewInventoryConfigUtils } from "../newRules/NewInventoryConfigUtils";
import { NewInventoryRules as Rules } from "../newRules/NewInventoryRules";
import { NewInventorySession } from "../newRules/NewInventorySession";
import type { NewBuildToken } from "../newRules/NewBuildTypes";
import type { InventoryCommand, InventoryConfig, InventoryItem, InventoryLocation, InventorySpace, InventoryState, InventoryTemplate } from "../newRules/NewInventoryTypes";
import { NewBuildPanel } from "./NewBuildPanel";
import { NewInventoryDragController } from "./NewInventoryDragController";
import { pagePosition, placeInPage, visitRegion } from "./SkillBattleUILayout";
import type { SkillBattlePage } from "./SkillBattleUILayout";

interface InventorySelection {
    uid: string; rotated: boolean; draft: InventoryCommand | null; token: NewBuildToken | null;
    error: string; notice: string;
}
type InventoryDropTarget = InventoryLocation & { page?: number };
interface HeldInventoryItem {
    key: string; uid: string; point: Laya.Point; grabX: number; grabY: number; rotated: boolean;
    previous: InventorySelection; token: NewBuildToken; target: InventoryDropTarget | null;
    candidate: InventoryCommand | null; error: string; valid: boolean;
    hover: { key: string; point: Laya.Point; blocked: boolean } | null;
}
export type NewInventoryPanelSession = Pick<NewInventorySession, "inventory" | "flow" | "snapshot" | "state" |
    "record" | "records" | "token" | "remainingMs" | "outcome" | "screen" | "error" | "preview" | "confirm" |
    "expire" | "resetConfirmed" | "previewMove" | "inventoryCommand" | "dispatch"> & {
        readonly archive: { config: InventoryConfig; profile: import("../newRules/NewBuildTypes").NewBuildProfile;
            state: InventoryState } | null;
        prepare: NewInventorySession["prepare"];
    };

/** Image-backed inventory projection; all accepted changes pass through the single saved reducer. */
export class NewInventoryPanel extends NewBuildPanel {
    private static readonly AUTO_ROTATE_DELAY = 400;
    private static readonly HOVER_TOLERANCE = 6;
    private uid = "";
    private rotated = false;
    private draft: InventoryCommand | null = null;
    private draftToken: NewBuildToken | null = null;
    private draftError = "";
    protected inventoryPage = 0;
    protected filter = "all";
    protected nodes: { [key: string]: Laya.GWidget } = {};
    private visibleItems: InventoryItem[] = [];
    private gridItems: InventoryItem[] = [];
    private dragController: NewInventoryDragController;
    private presentedRunId = "";
    protected held: HeldInventoryItem | null = null;
    constructor(view: UIBaseView, readonly inventorySession: NewInventoryPanelSession,
        navigate: (screen: SkillBattlePage) => void, screen: "start" | "battle" | "settlement",
        page: SkillBattlePage = screen) {
        super(view,inventorySession,navigate,screen,page);
        const root = view.getElement<Laya.GWidget>("inventoryRoot",false);
        if (screen === "battle") return;
        if (!root) return;
        this.dragController = new NewInventoryDragController(this.root,{
            begin: (key,point) => this.beginDrag(key,point),
            move: point => this.moveDrag(point),
            release: () => this.releaseDrag(),
            cancel: () => this.cancelDrag(),
            rotate: () => this.rotateDrag(),
        });
        this.nodes.inventoryRoot = root;
        visitRegion(view, root, n => {
            const bound = view.getElement<Laya.GWidget>(n.name,false);
            if (!bound) throw new Error(`储物节点未绑定：${n.name}`);
            this.nodes[n.name] = bound;
            if (!(n instanceof Laya.GTextField) && !(n instanceof Laya.GImage) && n.numChildren && n.mouseEnabled) {
                this.buttons[n.name] = n;
                n.on(Laya.Event.CLICK,this,() => this.command(n.name));
                n.on(Laya.Event.MOUSE_OVER,this,() => {
                    if (n.name === "invRotate") this.label("invNotice","旋转 90 度",18,"#d5dce4");
                });
                if (/^inv(List\d+|Item\d+|Weapon|Container)$/.test(n.name))
                    n.on(Laya.Event.MOUSE_DOWN,this,(event: Laya.Event) => this.dragController.arm(n.name,event));
            }
            return false;
        });
    }
    suspend(): void {
        super.suspend();
        this.dragController?.cancel();
    }
    protected resizeLayout(): void {
        if (!this.opened) return;
        this.dragController?.cancel();
        super.resizeLayout();
    }
    refresh(): void {
        if (this.modalOpen || this.resetConfirm || this.overlay) { super.refresh(); return; }
        if (this.nodes) for (const key of Object.keys(this.nodes)) this.nodes[key].visible = false;
        super.refresh();
    }
    openHubScreen(): void {
        this.resetPresentation();
        super.openHubScreen();
        Laya.timer.loop(250,this,this.updateInventoryClock);
    }
    private resetPresentation(): void {
        const id = this.inventorySession.inventory?.runId || "";
        if (this.presentedRunId === id) return;
        this.presentedRunId = id; this.inventoryPage = 0; this.filter = "all"; this.clearSelection();
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
                this.clearSelection(); return;
            }
            if (state.phase === "preparation") {
                session.inventoryCommand({ type: "enter" }); this.clearSelection();
                this.navigate("build");
            } else if (state.flow?.phase === "battle") this.navigate("battle");
            else if (state.flow?.pending) this.navigate("build");
            else {
                const target = state.flow!.battles.length;
                if (target === session.archive!.config.build.encounters.length) this.stage({ type: "extract" });
                else if (state.node !== target) {
                    session.inventoryCommand({ type: "visit", node: target });
                    this.navigate("inventory");
                } else { session.dispatch({ type: "battle" }); this.navigate("battle"); }
            }
        });
    }
    protected command(key: string): void {
        if (this.modalOpen) return;
        if (this.held) {
            if (key === "invRotate") this.rotateDrag();
            else if (key === "invCancel") this.dragController.cancel();
            return;
        }
        if (this.dragController?.suppressClick()) return;
        if (key === "invToggle") {
            this.run(() => { this.clearSelection(); this.navigate(this.pageRole === "build" ? "inventory" : "build"); }); return;
        }
        if (key.startsWith("inv")) {
            this.run(() => this.inventoryCommand(key)); return;
        }
        if (key === "reset" && this.inventorySession.inventory?.phase === "active") {
            this.run(() => { this.stage({ type: "abandon" }); }); return;
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
            this.target(state.phase === "preparation" ? { space: "warehouse" } :
                session.archive!.config.weight ? {space:"source",node:state.node} : { space: "ground", node: state.node }); return;
        }
        if (key === "invWeapon" || key === "invContainer") {
            const space = key === "invWeapon" ? "weapon" : "container", equipped = state.items.find(i => i.location.space === space);
            if (!this.uid) { if (equipped) this.selectItem(equipped); return; }
            const i = Rules.item(state,this.uid), t = Rules.template(session.archive!.config,i);
            if (t.kind !== space) throw new Error(space === "weapon" ? "请选择一件武器" : "请选择一个纳虚器本体");
            if (space === "weapon") {
                session.inventoryCommand(Rules.weaponPlan(session.archive!.config,state,i.uid));
                this.clearSelection();
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
        this.uid = item.uid;
        this.rotated = item.location.space === "warehouse" ?
            !!Rules.warehousePlacements(this.inventorySession.archive!.config,this.projection()!).find(p => p.uid === item.uid)?.rotated :
            item.location.space === "source" ?
            !!Rules.sourcePlacements(this.inventorySession.archive!.config,this.projection()!).find(p=>p.uid===item.uid)?.rotated :
            !!item.location.rotated;
        this.notice = "";
        this.draft = null; this.draftToken = null; this.draftError = "";
    }
    private clearSelection(): void {
        this.uid = ""; this.draft = null; this.draftToken = null; this.draftError = "";
        this.notice = "";
    }
    private stage(command: InventoryCommand): void {
        if (command.type === "extract" || command.type === "abandon") {
            const token = this.inventorySession.token;
            this.requestConfirmation(command.type === "extract" ? "确认撤离？" : "放弃本局？",
                command.type === "extract" ? "携带物带回，来源仓库内未携带物不带出，本局临时构筑结束。" :
                    "仅保留归真匣合规物品，装备及其他携带物损失。",
                () => {
                    this.inventorySession.inventoryCommand(command,token);
                    this.navigate("settlement");
                });
            return;
        }
        this.draft = command; this.draftToken = this.inventorySession.token; this.checkDraft();
    }
    private checkDraft(): void {
        this.draftError = ""; this.notice = "";
        try { this.inventorySession.previewMove(this.draft!,this.draftToken!); }
        catch (error) { this.draftError = (error as Error).message; }
    }
    private stageContainer(item: InventoryItem | null): void {
        this.inventorySession.inventoryCommand(this.containerPlan(item));
        this.clearSelection();
    }
    private target(to: InventoryLocation): void {
        if (!this.uid) throw new Error("尚未选中物品");
        const state = this.inventorySession.inventory!, item = Rules.item(state,this.uid);
        if (item.location.space === "weapon") {
            this.inventorySession.inventoryCommand({ type: "equipWeapon", uid: null, oldTo: to });
            this.clearSelection(); return;
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
        return this.inventorySession.inventory;
    }
    protected renderStart(): void {
        if (this.inventorySession.inventory?.phase === "active" && this.pageRole === "build") {
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
        this.requestConfirmation("清除损坏的储物演练档？",
            "仅删除阶段 3 演练档，阶段 1、2 及其他应用存档保留。",
            () => { this.inventorySession.resetConfirmed(); this.resetConfirm = false; this.navigate("start"); },
            "确认清除");
    }
    protected position(node: Laya.GWidget): Laya.Point { return pagePosition(node,this.root); }
    protected place(node: Laya.GWidget, x: number, y: number): void { placeInPage(node,this.root,x,y); }
    protected label(key: string, text: string, size = 18, color = "#e8edf0"): void {
        const l = this.nodes[key] as Laya.GTextField;
        l.text = text; l.fontSize = size; l.color = color; l.textIns.color = color;
        l.textIns.wordWrap = true; l.visible = true;
        this.fit(l,12);
    }
    protected control(key: string, text: string, enabled = true, selected = false): void {
        const n = this.nodes[key]; n.visible = true; n.mouseEnabled = enabled; n.alpha = enabled ? 1 : 0.4;
        const l = n.getChildAt(1) as Laya.GTextField;
        l.text = text; l.fontSize = key === "invRotate" ? 30 : n.height <= 32 ? 16 : 18;
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
    private icon(n: Laya.GWidget, src: string, width: number, height: number, x = 6, y = 6, rotated = false): void {
        const image = n.getChildAt(2) as Laya.GImage;
        image.src = src; image.visible = true;
        const texture = Laya.loader.getRes(src) as Laya.Texture;
        const tw = texture?.width || width, th = texture?.height || height;
        const ratio = Math.min(width / (rotated ? th : tw),height / (rotated ? tw : th));
        const w = tw * ratio, h = th * ratio;
        image.rotation = rotated ? 90 : 0;
        image.pos(x + (width - (rotated ? h : w)) / 2 + (rotated ? h : 0),
            y + (height - (rotated ? w : h)) / 2); image.size(w,h);
    }
    private quality(t: InventoryTemplate): EQuality {
        return Number.isInteger(t.quality) && t.quality >= EQuality.normal && t.quality <= EQuality.legendary ?
            t.quality : EQuality.normal;
    }
    private qualityImage(image: Laya.GImage, t: InventoryTemplate): void {
        image.autoSize = false; image.color = "#ffffff"; image.alpha = 1; image.visible = true;
        image.off(Laya.Event.LOADED,this,this.qualityLoaded);
        image.on(Laya.Event.LOADED,this,this.qualityLoaded,[image]);
        image.src = `ui/atlas/module/inventory/quality-${this.quality(t)}.png`;
        this.qualityLoaded(image);
    }
    private qualityLoaded(image: Laya.GImage): void {
        const texture = image.texture, grid = [8,8,8,8,0];
        if (!texture || texture._sizeGrid?.join(",") === grid.join(",") &&
            image.graphics.cmds.some(cmd => cmd.cmdID === Laya.Draw9GridTextureCmd.ID)) return;
        // Raw-PNG browser previews do not run the IDE's .meta texture importer.
        texture._sizeGrid = grid;
        const src = image.src;
        image.src = ""; image.src = src;
    }
    private qualityFrame(n: Laya.GWidget, t: InventoryTemplate, selected = false, color = "#f4f5e9"): void {
        const bg = n.getChildAt(0) as Laya.GImage;
        bg.size(n.width,n.height); this.qualityImage(bg,t);
        const outline = n.getChildByName(n.name+"Selection") as Laya.GWidget;
        outline.size(n.width,n.height); outline.visible = selected; outline.graphics.clear();
        if (selected) outline.graphics.drawRoundRect(1,1,n.width - 2,n.height - 2,6,6,6,6,null,color,2);
    }
    private renderInventory(): void {
        const session = this.inventorySession, save = session.archive, actual = save?.state;
        if (actual?.phase === "ended" && this.draft) this.clearSelection();
        const state = this.projection();
        this.backdrop();
        const root = this.nodes.inventoryRoot; root.visible = true;
        for (const key of Object.keys(this.nodes)) if (key !== "inventoryRoot") this.nodes[key].visible = false;
        for (const key of ["invLeftPanel","invBagPanel","invBagTopbar","invRightPanel","invLock"]) this.nodes[key].visible = true;
        this.label("invTitle","末法寻仙 · 储物演练",26,"#e3c98c");
        this.label("invClock",actual?.phase === "active" ? this.timeText() : actual?.phase === "preparation" ? "整备" : "演练库存",22);
        this.label("invEquipTitle","装备",18,"#c2dbdd");
        this.label("invBattleTitle","斗法匣 · 5 格",18,"#e3c98c");
        this.label("invSafeTitle","归真匣 · 2 格",18,"#a5d8b9");
        this.label("invProtection","归真匣保护非装备。\n其余携带物失败损失。",16,"#bbcbd0");
        this.label("invBagTitle","纳虚器",20,"#c2dbdd");
        this.label("invSourceTitle",actual?.phase === "active" ? `节点 ${actual.node + 1} · 来源仓库` :
            actual?.phase === "ended" ? "结算账本" : "统一库存 · 演练物品",20,"#e3c98c");
        this.control("invPrimary",!state || state.phase === "ended" ? "建立新演练库存" :
            state.phase === "preparation" ? "入境" : state.flow?.phase === "battle" ? "返回战斗" :
            state.flow?.pending ? "领取借法" : state.node < state.flow!.battles.length ? "前往下一节点" : "进入战斗",!session.error && !this.draft);
        if (session.error) this.control("invAbandon","清除损坏档");
        if (!state || !save) { this.label("invNotice",session.error || ""); return; }
        const editable = state.phase !== "ended" && state.flow?.phase !== "battle";
        for (const space of ["weapon","container"] as const) {
            const key = space === "weapon" ? "invWeapon" : "invContainer", item = state.items.find(i => i.location.space === space);
            this.control(key,"",editable);
            const n = this.nodes[key], cols = 2, rows = space === "weapon" ? 3 : 2;
            for (let i = 0; i < cols * rows; i++) this.nodes[`invEquipCell_${space}_${i}`].visible = true;
            (n.getChildAt(0) as Laya.GImage).visible = !!item;
            n.getChildByName(key+"Selection").visible = false;
            const icon = this.nodes[key].getChildAt(2) as Laya.GImage; icon.visible = !!item;
            if (item) {
                const t = Rules.template(save.config,item);
                this.qualityFrame(n,t,item.uid === this.uid);
                this.icon(n,t.icon,n.width - 12,n.height - 12);
            }
            this.label(key+"Name",`${item ? Rules.template(save.config,item).name :
                space === "weapon" ? "未装备武器" : "未装备纳虚器"}\n${cols}×${rows}${item && space === "weapon" ?
                ` · 耐久 ${item.durability}/${save.config.build.setup.weapon!.maxDurability}` : ""}`,17);
        }
        let count = 0;
        for (const space of ["battle","safe","bag"] as const) {
            const { cols,rows,size,x: startX,y: startY } = this.gridGeometry(space);
            if (space === "bag") {
                const weight=Rules.weight(save.config,state);
                this.label("invBagTitle",`纳虚器${cols ? ` · ${cols}×${rows}` : ""}${save.config.weight ?
                    ` · ${weight.current}/${weight.limit}` : ""}`,20);
                if (!cols) this.label("invEmptyBag","未装备纳虚器",22,"#c2cbcf");
            }
            for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
                const key = `invCell_${space}_${y * cols + x}`, cell = this.nodes[key];
                this.control(key,"",editable); this.place(cell,startX + x * size,startY + y * size);
            }
            for (const item of state.items.filter(i => i.location.space === space)) {
                const key = `invItem${count++}`, n = this.nodes[key], t = Rules.template(save.config,item);
                const area = this.root.findChild(space === "bag" ? "bagItemsArea" :
                    space === "battle" ? "battleItemsArea" : "safeItemsArea") as Laya.GWidget;
                if (area && n.parent !== area) area.addChild(n);
                const [w,h] = Rules.dimensions(t,item.location);
                this.control(key,"",editable,item.uid === this.uid);
                this.place(n,startX + item.location.x! * size,startY + item.location.y! * size); n.size(w * size - 2,h * size - 2);
                this.qualityFrame(n,t,item.uid === this.uid);
                this.icon(n,t.icon,n.width - 12,n.height - 12,6,6,!!item.location.rotated);
                const caption = n.getChildAt(3) as Laya.GTextField;
                caption.text = ""; caption.visible = false;
            }
        }
        const gridItems = state.items.filter(i => ["battle","safe","bag"].includes(i.location.space));
        // The item indices are shared by the click projection above.
        gridItems.sort((a,b) => ["battle","safe","bag"].indexOf(a.location.space) - ["battle","safe","bag"].indexOf(b.location.space));
        this.gridItems = gridItems;
        if (this.draft?.type === "move") {
            const to = this.draft.move.to;
            if (["battle","safe","bag"].includes(to.space)) {
                const { size,x,y } = this.gridGeometry(to.space);
                const item = Rules.item(actual!,this.draft.move.uid), [w,h] = Rules.dimensions(Rules.template(save.config,item),to);
                const ghost = this.nodes.invGhost; this.place(ghost,x + to.x! * size,y + to.y! * size);
                ghost.size(w * size - 2,h * size - 2); ghost.visible = true;
                this.qualityLoaded(ghost as Laya.GImage);
            }
        }
        const activeSource=!!save.config.weight && state.phase==="active";
        let list = state.items.filter(i => i.location.space === (state.phase === "active" ? activeSource ? "source" : "ground" : "warehouse") &&
            (state.phase !== "active" || i.location.node === state.node && state.revealed.includes(state.node)));
        if (state.phase === "ended") list = state.items.filter(i => this.filter === "all" ? i.location.space === "warehouse" :
            this.filter === "medicine" ? state.returned.includes(i.uid) : this.filter === "materials" ?
                state.lost.includes(i.uid) : state.consumed.includes(i.uid));
        else list = list.filter(i => {
            const t = Rules.template(save.config,i);
            return this.filter === "all" || this.filter === "medicine" && ["hp","mp","repair","stamina"].includes(t.kind) ||
                this.filter === "materials" && ["material","book"].includes(t.kind) ||
                this.filter === "equipment" && ["weapon","container"].includes(t.kind);
        });
        if(activeSource && state.interactionSource!==state.node)list=[];
        const sourcePages = activeSource ? this.packActiveSource(list,save.config,state) :
            state.phase !== "active" && (state.phase !== "ended" || this.filter === "all") ?
            this.packWarehouse(list,save.config,state) : this.packSource(list,save.config);
        const pages = this.sourcePageCount(sourcePages.length); this.inventoryPage = Math.min(this.inventoryPage,pages - 1);
        const sourcePage = sourcePages[this.inventoryPage] || [];
        this.visibleItems = sourcePage.map(p => p.item);
        for (let i = 0; i < 56; i++) this.nodes[`invSourceCell${i}`].visible = true;
        sourcePage.forEach(({item,x,y,rotated},i) => {
            const key = `invList${i}`, t = Rules.template(save.config,item);
            const n = this.nodes[key], origin = this.nodes.invSourceCell0, size = origin.width + 2;
            const point = this.position(origin);
            this.control(key,"",editable || state.phase === "ended",item.uid === this.uid);
            const [width,height] = Rules.dimensions(t,{ space: "warehouse", rotated });
            this.place(n,point.x + x * size,point.y + y * size); n.size(width * size - 2,height * size - 2);
            this.qualityFrame(n,t,item.uid === this.uid);
            this.icon(n,t.icon,n.width - 12,n.height - 12,6,6,rotated);
            const caption = n.getChildAt(3) as Laya.GTextField;
            caption.text = ""; caption.visible = false;
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
        if(!selected && state.stamina!==undefined)detail+=`\n体力 ${state.stamina} / ${save.config.staminaMax}`;
        if (this.draft?.type === "extract") detail = "确认撤离\n仅带回当前携带物，来源仓库内物品不带出。";
        else if (this.draft?.type === "abandon") detail = "确认放弃\n只保留归真匣，所有携带装备及其他内容损失。";
        if (state.phase === "ended") detail = `${{extract:"撤离成功",defeat:"战斗失败",abandon:"已主动放弃",timeout:"演练超时"}[state.result!]}\n带回 ${state.returned.length} 件 · 损失 ${state.lost.length} 件\n已消耗 ${state.consumed.length} 件${selected ? `\n${Rules.template(save.config,selected).name}` : ""}`;
        this.label("invDetail",detail,18,"#d9e1e5");
        this.label("invNotice",session.error || this.draftError || this.notice ||
            (this.draft ? "预览未提交" : ""),18,this.draftError ? "#ffb4a8" : "#c2d1d8");
        this.control("invRotate","\u21bb",editable && !!selected && Rules.template(save.config,selected).rotate);
        (this.nodes.invRotate.getChildAt(2) as Laya.GImage).visible = false;
        this.control("invCancel","取消",!!this.uid || !!this.draft);
        this.control("invConfirm","确认提交",!!this.draft && !this.draftError);
        this.control("invUse","使用",editable && state.phase === "active" && !!selected && !this.draft &&
            ["hp","mp","repair","stamina"].includes(Rules.template(save.config,selected).kind) &&
            (Rules.template(save.config,selected).kind!=="stamina" || state.stamina!<save.config.staminaMax!));
        this.control("invDrop",state.phase === "preparation" ? "放回仓库" : activeSource ? "退回来源" : "放到地面",editable && !!selected &&
            (state.phase === "preparation" || activeSource ? state.phase==="preparation" || state.interactionSource===state.node : revealed));
        if (state.phase === "active") {
            this.control("invAbandon","放弃",true);
            this.control("invExtract","撤离",editable && !state.flow?.pending && !this.draft);
            const victories = state.flow!.battles.filter(b => b.state.phase === "victory").length;
            this.control("invNodePrev","<",editable && state.node > 0 && !state.flow?.pending && !this.draft);
            this.control("invNodeNext",">",editable && state.node < victories && !state.flow?.pending && !this.draft);
            this.button("invToggle","构筑",630,16,128,46,editable && !this.draft);
        }
        if (this.held) this.renderHeld();
    }
    protected sourcePageCount(count: number): number { return count; }
    private packActiveSource(items: InventoryItem[],config: InventoryConfig,state: InventoryState) {
        const slots=Rules.sourcePlacements(config,state),byUid=new Map(items.map(i=>[i.uid,i]));
        const pages: Array<Array<{item:InventoryItem;x:number;y:number;rotated:boolean}>>=
            Array.from({length:config.weight!.sourcePages},()=>[]);
        for(const slot of slots) {
            const item=byUid.get(slot.uid);
            if(item)pages[slot.page].push({item,x:slot.x,y:slot.y,rotated:slot.rotated});
        }
        return pages;
    }
    private packWarehouse(items: InventoryItem[], config: InventoryConfig, state: InventoryState) {
        const slots = Rules.warehousePlacements(config,state), byUid = new Map(items.map(i => [i.uid,i]));
        const pages: Array<Array<{ item: InventoryItem; x: number; y: number; rotated: boolean }>> =
            Array.from({ length: Math.max(1,...slots.map(p => p.page + 1)) },() => []);
        for (const slot of slots) {
            const item = byUid.get(slot.uid);
            if (item) pages[slot.page].push({ item, x: slot.x, y: slot.y, rotated: slot.rotated });
        }
        return pages;
    }
    private packSource(items: InventoryItem[], config: InventoryConfig) {
        const { cols,rows } = this.sourceGeometry();
        const pages: Array<Array<{ item: InventoryItem; x: number; y: number; rotated: boolean }>> = [[]];
        let occupied = new Set<number>();
        for (const item of items) {
            const t = Rules.template(config,item);
            if (t.width > cols || t.height > rows) throw new Error(`物品 ${t.name} 超出来源页尺寸 ${cols}×${rows}`);
            let position = -1;
            while (position < 0) {
                for (let y = 0; y <= rows - t.height && position < 0; y++) for (let x = 0; x <= cols - t.width; x++) {
                    let free = true;
                    for (let dy = 0; dy < t.height; dy++) for (let dx = 0; dx < t.width; dx++)
                        if (occupied.has((y + dy) * cols + x + dx)) free = false;
                    if (free) { position = y * cols + x; break; }
                }
                if (position < 0) { pages.push([]); occupied = new Set(); }
            }
            const x = position % cols, y = Math.floor(position / cols);
            for (let dy = 0; dy < t.height; dy++) for (let dx = 0; dx < t.width; dx++)
                occupied.add((y + dy) * cols + x + dx);
            pages[pages.length - 1].push({ item, x, y, rotated: false });
        }
        return pages;
    }
    protected beginDrag(key: string, point: Laya.Point): boolean {
        const state = this.inventorySession.inventory;
        if (!this.opened || this.busy || this.overlay || this.resetConfirm || !state ||
            state.phase === "ended" || state.flow?.phase === "battle") return false;
        const source = /^invList(\d+)$/.exec(key), grid = /^invItem(\d+)$/.exec(key);
        const item = source ? this.visibleItems[+source[1]] : grid ? this.gridItems[+grid[1]] :
            state.items.find(i => i.location.space === (key === "invWeapon" ? "weapon" : "container"));
        if (!item) return false;
        const n = this.nodes[key], previous: InventorySelection = {
            uid: this.uid, rotated: this.rotated, draft: Core.clone(this.draft), token: Core.clone(this.draftToken),
            error: this.draftError, notice: this.notice,
        };
        this.selectItem(Rules.item(state,item.uid));
        const origin = this.position(n);
        this.held = { key, uid: item.uid, point, grabX: Math.max(0,Math.min(1,(point.x - origin.x) / n.width)),
            grabY: Math.max(0,Math.min(1,(point.y - origin.y) / n.height)), rotated: this.rotated, previous,
            token: this.inventorySession.token,
            target: null, candidate: null, error: "", valid: false, hover: null };
        this.refresh();
        return true;
    }
    private gridGeometry(space: InventorySpace) {
        if (space === "warehouse" || space === "source") return this.sourceGeometry();
        const [cols,rows] = Rules.size(this.inventorySession.archive!.config,this.projection()!,space);
        const cell = this.nodes[`invCell_${space}_0`];
        return { ...this.position(cell), size: cell.width + 2, cols, rows };
    }
    private sourceGeometry() {
        const first = this.nodes.invSourceCell0, last = this.nodes.invSourceCell55, size = first.width + 2;
        const a = this.position(first), b = this.position(last);
        return { x: a.x, y: a.y, size, cols: Math.round((b.x - a.x) / size) + 1,
            rows: Math.round((b.y - a.y) / size) + 1 };
    }
    private hitDrag(point: Laya.Point, h: Pick<HeldInventoryItem,"uid" | "rotated" | "grabX" | "grabY"> = this.held!): InventoryDropTarget | null {
        const state = this.projection()!, config = this.inventorySession.archive!.config;
        const t = Rules.template(config,Rules.item(state,h.uid)), [w,height] = Rules.dimensions(t,{ space: "bag", rotated: h.rotated });
        for (const space of ["battle","safe","bag"] as const) {
            const g = this.gridGeometry(space);
            if (point.x >= g.x && point.x < g.x + g.cols * g.size && point.y >= g.y && point.y < g.y + g.rows * g.size)
                return { space, x: Math.round((point.x - h.grabX * w * g.size - g.x) / g.size),
                    y: Math.round((point.y - h.grabY * height * g.size - g.y) / g.size), rotated: h.rotated };
        }
        for (const [space,key] of [["weapon","invWeapon"],["container","invContainer"]] as const) {
            const n = this.nodes[key];
            const origin = this.position(n);
            if (point.x >= origin.x && point.x < origin.x + n.width && point.y >= origin.y && point.y < origin.y + n.height) return { space };
        }
        const source = this.sourceGeometry();
        if (point.x >= source.x && point.x < source.x + source.cols * source.size &&
            point.y >= source.y && point.y < source.y + source.rows * source.size) {
            if (state.phase === "preparation" || config.weight)
                return { space: state.phase==="preparation" ? "warehouse" : "source", page: this.inventoryPage,
                    ...(state.phase==="active"?{node:state.node}:{}),
                    x: Math.round((point.x - h.grabX * w * source.size - source.x) / source.size),
                    y: Math.round((point.y - h.grabY * height * source.size - source.y) / source.size), rotated: h.rotated };
            return { space: "ground", node: state.node };
        }
        return null;
    }
    private warehouseCommand(item: InventoryItem, to: InventoryDropTarget): InventoryCommand {
        return { type: "arrangeWarehouse", uid: item.uid, from: item.location,
            to: { page: to.page!, x: to.x!, y: to.y!, rotated: !!to.rotated } };
    }
    private containerPlan(item: InventoryItem | null): Extract<InventoryCommand,{ type: "equipContainer" }> {
        return Rules.containerPlan(this.inventorySession.archive!.config,this.inventorySession.inventory!,item?.uid || null);
    }
    private transferCommand(item: InventoryItem, to: InventoryDropTarget): InventoryCommand {
        const { page,x,y,rotated,space,node } = to;
        const destination: InventoryLocation = space === "warehouse" ? { space } :
            space === "source" ? {space,node,x,y:y!+page!*Rules.WAREHOUSE_ROWS,rotated} :
            space === "ground" ? { space, node } : { space, x, y, rotated };
        const warehouse = space === "warehouse" ?
            { warehouseTo: { page: page!, x: x!, y: y!, rotated: !!rotated } } : {};
        if (item.location.space === "weapon")
            return { type: "equipWeapon", uid: null, oldTo: destination, ...warehouse };
        if (item.location.space === "container") {
            const state = this.inventorySession.inventory!;
            const expected = state.phase === "preparation" ? "warehouse" :
                this.inventorySession.archive!.config.weight ? "source" : "ground";
            if (space !== expected || ["ground","source"].includes(space) && node !== state.node)
                throw new Error("背包本体只能卸回当前交互仓库");
            return { ...this.containerPlan(null), ...warehouse };
        }
        return { type: "move", move: { uid: item.uid, from: item.location, to: destination }, ...warehouse };
    }
    private moveDrag(point: Laya.Point): void {
        const h = this.held;
        if (!h) return;
        try {
            if (this.inventorySession.expire() || this.inventorySession.inventory?.phase === "ended") {
                this.dragController.cancel(); return;
            }
        } catch (error) {
            this.clearAutoRotation();
            h.valid = false; h.error = (error as Error).message; this.renderHeld(); return;
        }
        h.point = point; h.target = this.hitDrag(point); h.candidate = null;
        h.valid = false; h.error = "";
        const state = this.inventorySession.inventory!, config = this.inventorySession.archive!.config;
        const item = Rules.item(state,h.uid), t = Rules.template(config,item), to = h.target;
        try {
            if (!to) throw new Error("落点不在储物区域");
            if (to.space === "warehouse" && item.location.space === "warehouse") {
                const slot = Rules.warehousePlacements(config,state).find(p => p.uid === item.uid)!;
                if (slot.page !== to.page || slot.x !== to.x || slot.y !== to.y || slot.rotated !== to.rotated)
                    h.candidate = this.warehouseCommand(item,to);
            } else if (to.space === "weapon") {
                if (t.kind !== "weapon") throw new Error("武器位只能放武器");
                const old = state.items.find(i => i.location.space === "weapon");
                if (old?.uid === item.uid) { this.clearAutoRotation(); this.renderHeld(); return; }
                h.candidate = Rules.weaponPlan(config,state,item.uid);
            } else if (to.space === "container") {
                if (t.kind !== "container") throw new Error("纳虚器位只能放纳虚器");
                if (item.location.space === "container") { this.clearAutoRotation(); this.renderHeld(); return; }
                h.candidate = this.containerPlan(item);
            } else {
                if (Rules.same(item.location,to)) { this.clearAutoRotation(); this.renderHeld(); return; }
                h.candidate = this.transferCommand(item,to);
            }
            if (h.candidate) this.inventorySession.previewMove(h.candidate,h.token);
            h.valid = true;
        } catch (error) { h.error = (error as Error).message; }
        if (this.inventorySession.archive?.state.phase === "ended") {
            this.dragController.cancel();
            return;
        }
        this.renderHeld();
        this.updateAutoRotation();
    }
    private validatePlanDrop(item: InventoryItem, to: InventoryDropTarget): void {
        const state = this.projection()!, config = this.inventorySession.archive!.config, t = Rules.template(config,item);
        if (["warehouse","ground","source"].includes(to.space)) {
            if (to.space === "warehouse" ? state.phase !== "preparation" :
                state.phase !== "active" || to.node !== state.node || !state.revealed.includes(state.node))
                throw new Error("不能放到该来源");
            if (to.space === "warehouse" || to.space === "source")
                this.inventorySession.previewMove(item.location.space === "warehouse" ? this.warehouseCommand(item,to) :
                    this.transferCommand(item,to),this.held!.token);
            return;
        }
        if (!["battle","safe","bag"].includes(to.space)) throw new Error("原内容必须安排到合法空间");
        if (to.space === "battle" && !t.battle) throw new Error("斗法匣只收药品与修补工具");
        if (to.space === "safe" && !t.safe) throw new Error("归真匣禁止装备与纳虚器");
        const [w,h] = Rules.dimensions(t,to), [cols,rows] = Rules.size(config,state,to.space);
        if (to.x! < 0 || to.y! < 0 || to.x! + w > cols || to.y! + h > rows) throw new Error("尺寸不足或落点超出边界");
        for (const other of state.items.filter(i => i.uid !== item.uid && i.location.space === to.space)) {
            const l = other.location, [ow,oh] = Rules.dimensions(Rules.template(config,other),l);
            if (to.x! < l.x! + ow && to.x! + w > l.x! && to.y! < l.y! + oh && to.y! + h > l.y!)
                throw new Error("落点与现有物品相交");
        }
    }
    private rotatedGrip(h: HeldInventoryItem) {
        return { uid: h.uid, rotated: !h.rotated,
            grabX: h.rotated ? h.grabY : 1 - h.grabY, grabY: h.rotated ? 1 - h.grabX : h.grabX };
    }
    private hoverKey(h: HeldInventoryItem): string {
        const to = h.target;
        if (!to || !["battle","safe","bag","warehouse","source"].includes(to.space) || to.x === undefined) return "";
        const g = this.gridGeometry(to.space);
        return `${to.space}:${Math.floor((h.point.x - g.x) / g.size)}:${Math.floor((h.point.y - g.y) / g.size)}`;
    }
    private canAutoRotate(h: HeldInventoryItem): boolean {
        const item = Rules.item(this.inventorySession.inventory!,h.uid);
        const t = Rules.template(this.inventorySession.archive!.config,item);
        if (h.valid || !this.hoverKey(h) || !t.rotate || t.width === t.height) return false;
        const to = this.hitDrag(h.point,this.rotatedGrip(h));
        if (to?.space !== h.target!.space || this.fitsDragGrid(item,h.target!)) return false;
        return this.fitsDragGrid(item,to);
    }
    private fitsDragGrid(item: InventoryItem, to: InventoryDropTarget): boolean {
        try { this.validatePlanDrop(item,to); return true; }
        catch { return false; }
    }
    private clearAutoRotation(): void {
        Laya.timer.clear(this,this.autoRotateDrag);
        if (this.held) this.held.hover = null;
    }
    private updateAutoRotation(): void {
        const h = this.held!, key = this.hoverKey(h), hover = h.hover;
        if (hover && hover.key === key &&
            Math.hypot(h.point.x - hover.point.x,h.point.y - hover.point.y) <= NewInventoryPanel.HOVER_TOLERANCE) {
            if (hover.blocked || !h.valid) return;
        }
        this.clearAutoRotation();
        if (!this.canAutoRotate(h)) return;
        h.hover = { key, point: new Laya.Point(h.point.x,h.point.y), blocked: false };
        Laya.timer.once(NewInventoryPanel.AUTO_ROTATE_DELAY,this,this.autoRotateDrag);
    }
    private autoRotateDrag(): void {
        const h = this.held;
        if (!h || !h.hover || h.hover.blocked) return;
        // Recheck expiry and the authoritative candidate after the stationary dwell.
        this.moveDrag(h.point);
        if (this.held === h && h.hover && !h.hover.blocked && this.canAutoRotate(h)) this.rotateDrag();
    }
    private rotateDrag(): void {
        const h = this.held;
        if (!h || !Rules.template(this.inventorySession.archive!.config,Rules.item(this.inventorySession.inventory!,h.uid)).rotate) return;
        this.clearAutoRotation();
        h.hover = { key: this.hoverKey(h), point: new Laya.Point(h.point.x,h.point.y), blocked: true };
        Object.assign(h,this.rotatedGrip(h)); this.rotated = h.rotated;
        this.moveDrag(h.point);
    }
    private restoreSelection(previous: InventorySelection): void {
        this.uid = previous.uid; this.rotated = previous.rotated; this.draft = previous.draft; this.draftToken = previous.token;
        this.draftError = previous.error; this.notice = previous.notice;
    }
    private releaseDrag(): void {
        const h = this.held;
        if (!h) return;
        this.clearAutoRotation();
        this.held = null;
        this.restoreSelection(h.previous);
        this.run(() => {
            if (!h.valid) { this.notice = h.error; return; }
            if (h.candidate) {
                this.inventorySession.inventoryCommand(h.candidate,h.token);
                this.clearSelection();
                if (h.candidate.type === "equipContainer") {
                    const contents = h.candidate.contents, inside = contents.filter(m => m.to.space === "bag").length;
                    this.notice = `包内 ${inside} 件 · ${this.inventorySession.inventory!.phase === "preparation" ?
                        "退回仓库" : this.inventorySession.archive!.config.weight ? "退回交互仓库" : "放到地面"} ${contents.length - inside} 件`;
                }
            }
        });
    }
    private cancelDrag(): void {
        this.clearAutoRotation();
        if (!this.held) return;
        const previous = this.held.previous;
        this.held = null;
        if (this.inventorySession.inventory?.phase === "ended") this.clearSelection();
        else this.restoreSelection(previous);
        if (this.opened) this.refresh();
    }
    private renderHeld(): void {
        const h = this.held;
        if (!h) return;
        const config = this.inventorySession.archive!.config, t = Rules.template(config,Rules.item(this.inventorySession.inventory!,h.uid));
        const [w,height] = Rules.dimensions(t,{ space: "bag", rotated: h.rotated });
        const to = h.target, equipment = to && ["weapon","container"].includes(to.space) ?
            this.nodes[to.space === "weapon" ? "invWeapon" : "invContainer"] : null;
        const grid = equipment ? { ...this.position(equipment), size: this.nodes.invSourceCell0.width + 2,
            cols: 2, rows: to!.space === "weapon" ? 3 : 2 } :
            to && ["battle","safe","bag","warehouse","source"].includes(to.space) && to.x !== undefined ? this.gridGeometry(to.space) : null;
        const size = grid?.size || this.nodes.invSourceCell0.width + 2;
        this.nodes[h.key].alpha = 0.16;
        this.nodes.invGhost.visible = false;
        for (let i = 0; i < 48; i++) this.nodes[`invDragCell${i}`].visible = false;
        if (grid) {
            let index = 0;
            for (let y = 0; y < (equipment ? grid.rows : height); y++) for (let x = 0; x < (equipment ? grid.cols : w); x++) {
                const cx = equipment ? x : to!.x! + x, cy = equipment ? y : to!.y! + y;
                if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) continue;
                const cell = this.nodes[`invDragCell${index++}`] as Laya.GImage;
                this.place(cell,grid.x + cx * grid.size,grid.y + cy * grid.size);
                cell.size(grid.size - 2,grid.size - 2); cell.color = h.valid ? "#76ffad" : "#ff6262"; cell.visible = true;
                this.qualityLoaded(cell);
            }
        }
        const n = this.nodes.invHeld;
        n.visible = true; this.place(n,h.point.x - h.grabX * w * size,h.point.y - h.grabY * height * size);
        n.size(w * size - 2,height * size - 2);
        this.qualityFrame(n,t,!!h.target,h.valid ? "#76ffad" : "#ff6262");
        this.icon(n,t.icon,n.width - 12,n.height - 12,6,6,h.rotated);
        const caption = n.getChildAt(3) as Laya.GTextField;
        caption.text = ""; caption.visible = false;
        for (const key of ["invPrimary","invDrop","invUse","invConfirm","invExtract","invToggle","invAbandon",
            "invNodePrev","invNodeNext","invAll","invMedicine","invMaterials","invEquipment","invPrev","invNext","invReveal"]) {
            const control = this.buttons[key];
            if (control?.visible) { control.mouseEnabled = false; control.alpha = 0.4; }
        }
        this.control("invRotate","\u21bb",t.rotate);
        this.label("invDetail",this.describeItem(Rules.item(this.inventorySession.inventory!,h.uid)),18,"#d9e1e5");
        this.label("invNotice",h.error || "",18,h.valid ? "#a7e5bf" : "#ffb4a8");
    }
    protected renderBattle(): void {
        super.renderBattle();
        const archive = this.inventorySession.archive;
        if (!archive) return;
        for (const item of archive.state.items.filter(i => i.location.space === "battle")) {
            const t = Rules.template(archive.config,item);
            const index = item.location.y! * archive.config.spaces.battleWidth + item.location.x!;
            if (t.kind === "repair") {
                this.button(`pouch${index}`,"修补工具\n战外使用",454 + index * 112,540,102,62,false);
            }
            const button = this.buttons[`pouch${index}`], frame = this.elements[`pouchQuality${index}`] as Laya.GImage;
            const point = this.position(button);
            this.place(frame,point.x + 3,point.y + (button.height - 30) / 2); frame.size(30,30);
            this.qualityImage(frame,t);
            const icon = this.elements[`pouchIcon${index}`] as Laya.GImage;
            icon.autoSize = false; icon.src = t.icon; icon.visible = true;
            const framePoint = this.position(frame);
            this.place(icon,framePoint.x + 3,framePoint.y + 3); icon.size(24,24);
            const label = button.getChildAt(0) as Laya.GTextField;
            label.pos(36,4); label.size(button.width - 40,button.height - 8); this.fit(label,12);
        }
    }
    private locationName(l?: InventoryLocation): string {
        return !l ? "无" : ({warehouse:"仓库",battle:"斗法匣",safe:"归真匣",bag:"纳虚器",weapon:"武器位",
            container:"纳虚器位",ground:"当前地面",source:"交互仓库",consumed:"已消耗",lost:"损失"})[l.space] +
            (l.x !== undefined ? ` ${l.x + 1},${l.y! + 1}` : "");
    }
    private describeItem(item: InventoryItem): string {
        const t = Rules.template(this.inventorySession.archive!.config,item);
        const [w,h] = Rules.dimensions(t,{ ...item.location, rotated: this.rotated });
        const qualityName = ["","普通","优秀","精良","稀有","史诗","传说"][this.quality(t)];
        return `${t.name} · ${qualityName} · ${w}×${h}${this.rotated ? " · 旋转" : ""}\n${this.locationName(item.location)}${item.durability !== null ?
            ` · 耐久 ${item.durability}` : ""}${t.weight!==undefined?` · 重量 ${t.weight}`:""}\n${
            t.kind==="container"?`背包承重 +${t.weightLimit || 0}\n`:""}${
            t.kind==="stamina"?`战外恢复体力 ${t.staminaRestore}\n`:""}${t.safe ? "归真匣合规，仍需尺寸适配" : "禁止归真匣"}${t.kind === "book" ? "\n书籍本阶段仅携入带出，不学习" : ""}`;
    }
}
