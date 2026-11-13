import type { UIBaseView } from "../../../games/ui/UIBaseView";
import { ExpeditionManager } from "../manager/ExpeditionManager";
import type { ExpeditionMapNodeType, IExpeditionMapNode } from "../types/ExpeditionMapTypes";

type MapScreen = "start" | "battle" | "settlement" | "map";

const COLORS = {
    ink: "#08100d", panel: "#111c17", panelSoft: "#16251e", border: "#4b6659",
    text: "#ece9dc", muted: "#aab4a7", jade: "#8fc7ae", gold: "#d8bd7c",
    route: "#8f4439", routeActive: "#d4775f", danger: "#d98c78", hidden: "#33443b",
    cyan: "#9bd8d0", panelEdge: "#7c8c72",
};

const NODE_SIZE = 76;
const NODE_SOURCE_ROOT = "ui/image/expeditionNodes/";

const TYPE_LABEL: { [key in ExpeditionMapNodeType]: string } = {
    start: "入境处",
    battle: "普通战斗",
    elite: "精英战斗",
    boss: "首领战斗",
    borrow: "途中借法台",
    enlightenment: "悟道残碑",
    search: "搜索点",
    recovery: "恢复点",
    extract: "撤离点",
};

const NODE_SOURCE: { [key in ExpeditionMapNodeType]: { active: string; inactive: string } } = {
    start: { active: "node-start.png", inactive: "node-start.png" },
    battle: { active: "node-enemy-normal.png", inactive: "node-enemy-normal.png" },
    elite: { active: "node-enemy-elite.png", inactive: "node-enemy-elite.png" },
    boss: { active: "node-enemy-boss.png", inactive: "node-enemy-boss.png" },
    borrow: { active: "node-borrow.png", inactive: "node-borrow.png" },
    enlightenment: { active: "node-insight.png", inactive: "node-insight.png" },
    search: { active: "node-search.png", inactive: "node-search.png" },
    recovery: { active: "node-recovery.png", inactive: "node-recovery.png" },
    extract: { active: "node-extract.png", inactive: "node-extract.png" },
};

export class SkillBattleMapPanel {
    readonly screen = "map";
    private readonly expedition: ExpeditionManager;
    private readonly navigate: (screen: MapScreen) => void;
    private readonly root: Laya.GWidget;
    private readonly labels: { [key: string]: Laya.GTextField } = {};
    private readonly buttons: { [key: string]: Laya.GWidget } = {};
    private readonly mapArea: Laya.GWidget;
    private readonly edgeLayer: Laya.GWidget;
    private readonly nodeLayer: Laya.GWidget;
    private readonly statusPanel: Laya.GWidget;
    private readonly infoPanel: Laya.GWidget;
    private readonly tint: Laya.GWidget;
    private readonly topBar: Laya.GWidget;
    private readonly backButton: Laya.GImage;
    private readonly healthBar: Laya.GImage;
    private readonly durabilityBar: Laya.GImage;
    private readonly suppliesBar: Laya.GImage;
    private readonly nodeWidgets = new Map<string, Laya.GImage>();
    private selectedId = "";
    private armedExtract = false;
    private notice = "";

    constructor(view: UIBaseView, expedition: ExpeditionManager, navigate: (screen: MapScreen) => void) {
        this.root = view.view;
        this.expedition = expedition;
        this.navigate = navigate;
        const element = <T extends Laya.Sprite>(name: string) => {
            const value = view.getElement<T>(name, false);
            if (!value) throw new Error(`地图预制体缺少节点：${name}`);
            return value;
        };
        for (const name of ["mapTitle", "mapSubtitle", "mapTimer", "mapLife", "mapDurability",
            "mapBuild", "mapSupplies", "mapSkillPoints", "mapProgress", "nodeType", "nodeTitle",
            "nodeDetail", "nodeHint", "mapNotice", "mapLegend"]) {
            this.labels[name] = element<Laya.GTextField>(name);
            this.labels[name].textIns.bgColor = null as any;
            this.labels[name].textIns.borderColor = null as any;
        }
        for (const name of ["mapConfirm", "mapCancel", "mapBuildButton"]) {
            this.buttons[name] = element<Laya.GWidget>(name);
            const text = this.buttons[name].getChildAt(0) as Laya.GTextField;
            if (text) text.text = name === "mapConfirm" ? "前往节点" : name === "mapCancel" ? "取消" : "局内构筑";
            this.styleButton(this.buttons[name], false, true);
        }
        this.statusPanel = element<Laya.GWidget>("mapStatusPanel");
        this.infoPanel = element<Laya.GWidget>("mapInfoPanel");
        this.tint = element<Laya.GWidget>("mapTint");
        this.topBar = element<Laya.GWidget>("mapTopBar");
        this.mapArea = element<Laya.GWidget>("mapArea");
        this.edgeLayer = element<Laya.GWidget>("mapEdges");
        this.nodeLayer = element<Laya.GWidget>("mapNodes");
        this.backButton = element<Laya.GImage>("mapBack");
        this.healthBar = element<Laya.GImage>("mapHealthBar");
        this.durabilityBar = element<Laya.GImage>("mapDurabilityBar");
        this.suppliesBar = element<Laya.GImage>("mapSuppliesBar");

        this.statusPanel.mouseEnabled = false;
        this.infoPanel.mouseEnabled = false;
        this.tint.graphics.clear();
        this.tint.graphics.drawRect(0, 0, 1280, 720, "#0a1c25");
        this.tint.alpha = 0.46;
        this.topBar.graphics.clear();
        this.topBar.graphics.drawRect(0, 0, 1280, 82, "#07121a");
        this.topBar.alpha = 0.58;

        this.backButton.on(Laya.Event.CLICK, this, () => this.navigate("start"));
        this.buttons.mapConfirm.on(Laya.Event.CLICK, this, this.confirmNode);
        this.buttons.mapCancel.on(Laya.Event.CLICK, this, this.cancelNode);
        this.buttons.mapBuildButton.on(Laya.Event.CLICK, this, () => this.navigate("start"));
        this.buttons.mapCancel.visible = false;
        this.buildNodeWidgets();
    }

    open(): void {
        this.notice = "";
        this.selectedId = this.expedition.map?.currentNodeId || "";
        this.armedExtract = false;
        this.refresh();
    }

    tick(): void {
        if (!this.expedition.active) return;
        try {
            if (this.expedition.expireMap()) {
                this.navigate("settlement");
                return;
            }
        } catch (error) {
            this.notice = (error as Error).message;
        }
        this.refresh();
    }

    resizeTo(view: Laya.GWidget): void {
        this.root.pos(0, 0);
        this.root.scaleX = 1;
        this.root.scaleY = 1;
    }

    private buildNodeWidgets(): void {
        const config = this.expedition.mapConfig;
        if (!config) return;
        const bounds = this.mapBounds(config.nodes);
        const found = new Set<string>();
        for (const node of config.nodes) {
            const image = this.nodeLayer.getChildByName(node.id) as Laya.GImage;
            if (!image) throw new Error(`地图预制体缺少真实节点图片：${node.id}`);
            image.mouseEnabled = true;
            image.on(Laya.Event.CLICK, this, () => this.selectNode(node));
            const position = this.nodePosition(node, bounds);
            image.pos(position.x, position.y);
            this.nodeWidgets.set(node.id, image);
            found.add(node.id);
        }
        for (let index = 0; index < this.nodeLayer.numChildren; index++) {
            const child = this.nodeLayer.getChildAt(index);
            if (!found.has(child.name)) child.visible = false;
        }
    }

    private refresh(): void {
        const run = this.expedition.run, map = this.expedition.map, config = this.expedition.mapConfig;
        if (!run?.map || !map || !config) {
            this.notice = this.expedition.error || "当前没有可显示的地图";
            return;
        }
        this.labels.mapTitle.text = config.name;
        this.labels.mapSubtitle.text = `第 ${map.battleCount} 战 · ${map.currentNodeId === "start" ? "尚在入境处" : "已深入残景"}`;
        this.labels.mapTimer.text = this.timeText(this.expedition.mapRemainingMs());
        this.labels.mapLife.text = `生命  ${run.battle.player.hp} / ${run.battle.player.maxHp}`;
        this.labels.mapDurability.text = `铁剑耐久  ${run.battle.weaponDurability} / ${this.expedition.setup.weaponDurability}`;
        this.labels.mapBuild.text = run.build?.activeSkills.length
            ? run.build.activeSkills.map(active => {
                const skill = this.expedition.configuration.build?.skills.find(row => row.id === active.skillId);
                return `${skill?.name || active.skillId}${active.level ? ` +${active.level}` : " 基础"}`;
            }).join(" · ")
            : "尚未借法";
        const pouchCount = run.battle.pouchSlots.filter(Boolean).length;
        this.labels.mapSupplies.text = `法囊  ${pouchCount} / 5`;
        this.labels.mapSkillPoints.text = `技能点  ${run.build?.skillPoints || 0}`;
        this.labels.mapProgress.text = `路线推进  ${map.resolvedIds.filter(id => {
            const node = config.nodes.find(value => value.id === id);
            return node && ["battle", "elite", "boss"].includes(node.type);
        }).length} / ${config.nodes.filter(node => ["battle", "elite", "boss"].includes(node.type)).length} 战`;
        this.labels.mapLegend.text = "朱线  已行道路    ·    圆环  已揭示节点    ·    点击节点查看情报";
        this.labels.mapNotice.text = this.notice;
        this.setMeter(this.healthBar, run.battle.player.hp / Math.max(1, run.battle.player.maxHp));
        this.setMeter(this.durabilityBar,
            run.battle.weaponDurability / Math.max(1, this.expedition.setup.weaponDurability));
        this.setMeter(this.suppliesBar, pouchCount / 5);
        this.drawEdges();
        for (const node of config.nodes) {
            const widget = this.nodeWidgets.get(node.id);
            if (!widget) continue;
            const revealed = map.revealedIds.includes(node.id);
            const shown = revealed || node.main;
            const resolved = map.resolvedIds.includes(node.id);
            const reachable = this.expedition.mapCanEnter(node.id);
            const current = map.currentNodeId === node.id;
            const selected = node.id === this.selectedId;
            this.applyNodeImage(widget, node, resolved, reachable, current, selected, shown, revealed,
                map.visitedIds.includes(node.id));
        }
        this.refreshSelection();
    }

    private refreshSelection(): void {
        const config = this.expedition.mapConfig, run = this.expedition.run;
        if (!config || !run) return;
        const node = config.nodes.find(value => value.id === this.selectedId);
        if (!node) {
            this.labels.nodeType.text = "路线情报";
            this.labels.nodeTitle.text = "选择已揭示节点";
            this.labels.nodeDetail.text = "只能沿连线前往相邻节点；已走通路线可以自由回退。";
            this.labels.nodeHint.text = "";
            this.styleButton(this.buttons.mapConfirm, false, false);
            this.buttons.mapConfirm.visible = false;
            this.buttons.mapCancel.visible = false;
            return;
        }
        const resolved = run.map?.resolvedIds.includes(node.id);
        const reachable = this.expedition.mapCanEnter(node.id);
        const current = run.map?.currentNodeId === node.id;
        this.labels.nodeType.text = TYPE_LABEL[node.type] || node.type;
        this.labels.nodeTitle.text = node.name;
        this.labels.nodeDetail.text = this.nodeDescription(node, resolved, current);
        this.labels.nodeHint.text = current ? "当前位置"
            : resolved ? "已结算，可安全回退"
                : reachable ? "沿当前连线可前往"
                    : "尚未接通到当前位置";
        const action = current ? "当前位置"
            : node.type === "extract" ? "查看撤离"
                : resolved ? "前往节点"
                    : ["battle", "elite", "boss"].includes(node.type) ? "确认入战" : "进入节点";
        this.setButtonText(this.buttons.mapConfirm, action);
        this.styleButton(this.buttons.mapConfirm, false, reachable && !current);
        this.buttons.mapConfirm.visible = reachable && !current;
        this.buttons.mapCancel.visible = false;
        if (current && node.type === "extract") {
            this.setButtonText(this.buttons.mapConfirm, "确认撤离");
            this.styleButton(this.buttons.mapConfirm, true, true);
            this.buttons.mapConfirm.visible = true;
        }
    }

    private selectNode(node: IExpeditionMapNode): void {
        const run = this.expedition.run;
        if (!run?.map?.revealedIds.includes(node.id)) return;
        this.selectedId = node.id;
        this.armedExtract = false;
        this.notice = "";
        if (["battle", "elite", "boss"].includes(node.type) &&
            !run.map.resolvedIds.includes(node.id) && this.expedition.mapCanEnter(node.id)) {
            this.confirmNode();
            return;
        }
        this.refresh();
    }

    private confirmNode(): void {
        const node = this.expedition.mapConfig?.nodes.find(value => value.id === this.selectedId);
        if (!node) return;
        const current = this.expedition.map?.currentNodeId === node.id;
        const reachable = this.expedition.mapCanEnter(node.id);
        if (!reachable && !(current && node.type === "extract")) return;
        if (node.type === "extract") {
            if (!this.armedExtract) {
                if (!current) this.expedition.enterMapNode(node.id);
                this.armedExtract = true;
                this.labels.nodeTitle.text = "确认离开忆境";
                this.labels.nodeDetail.text = "本局战利品与剩余法囊将带回据点。\n本局临时两道、主动、被动、强化与技能点会清除。";
                this.labels.nodeHint.text = "取消后仍可继续沿路探索";
                this.setButtonText(this.buttons.mapConfirm, "确认撤离");
                this.styleButton(this.buttons.mapConfirm, true, true);
                this.buttons.mapCancel.visible = true;
                this.styleButton(this.buttons.mapCancel, false, true);
                return;
            }
            try {
                this.expedition.extractMap(node.id);
                this.navigate("settlement");
            } catch (error) {
                this.notice = (error as Error).message;
                this.refresh();
            }
            return;
        }
        try {
            const result = this.expedition.enterMapNode(node.id);
            this.selectedId = node.id;
            this.armedExtract = false;
            if (result === "battle") this.navigate("battle");
            else if (result === "extract") this.refresh();
            else {
                this.notice = this.resultNotice(node, result);
                this.refresh();
            }
        } catch (error) {
            this.notice = (error as Error).message;
            this.armedExtract = false;
            this.refresh();
        }
    }

    private cancelNode(): void {
        this.armedExtract = false;
        this.notice = "";
        this.refresh();
    }

    private resultNotice(node: IExpeditionMapNode, result: string): string {
        if (result === "move") return "已沿旧路返回";
        if (node.type === "borrow") {
            const candidates = this.expedition.build?.pendingActiveCandidateIds || [];
            return candidates.length ? "借法候选已生成，请进入局内构筑选择" : "此处已无新的主动可借";
        }
        if (node.type === "enlightenment") {
            const candidates = this.expedition.build?.pendingPassiveCandidateIds || [];
            return candidates.length ? "悟道候选已生成，请进入局内构筑选择" : "已悟尽，此处不再提供被动";
        }
        if (node.type === "search") return "搜索完成，找到的物资已放入本局战利品";
        if (node.type === "recovery") return "灵泉恢复了两成生命";
        return "节点已结算";
    }

    private nodeDescription(node: IExpeditionMapNode, resolved?: boolean, current?: boolean): string {
        if (resolved && !current) return "该节点本局只结算一次，回退不会刷新敌人或奖励。";
        switch (node.type) {
            case "start": return "本局入口，可以从这里沿已揭示路线出发。";
            case "battle": return "危险类别：普通。只显示类别，不提前透露具体敌人。";
            case "elite": return "危险类别：精英。强度更高，胜利后恢复正常处理构筑奖励。";
            case "boss": return "危险类别：首领。奖励更好，也更可能终结本次探索。";
            case "borrow": return "从本局两道中生成主动候选；可借取，也可放弃换两点技能点。";
            case "enlightenment": return "额外提供一次被动参悟，不改变道韵阈值与余量。";
            case "search": return "搜索物资，首次确定结果；回退不会重抽或复制。";
            case "recovery": return "每处一次，恢复生命上限的两成；生命已满时不消耗。";
            case "extract": return "到达后可确认离境；确认前可取消并继续探索。";
            default: return "";
        }
    }

    private drawEdges(): void {
        const config = this.expedition.mapConfig, map = this.expedition.map;
        if (!config || !map) return;
        const graphics = this.edgeLayer.graphics;
        graphics.clear();
        const bounds = this.mapBounds(config.nodes);
        for (const edge of config.edges) {
            const from = config.nodes.find(node => node.id === edge.from);
            const to = config.nodes.find(node => node.id === edge.to);
            if (!from || !to) continue;
            const revealed = map.revealedIds.includes(from.id) && map.revealedIds.includes(to.id);
            const mainRoute = from.main && to.main;
            if (!revealed && !mainRoute) continue;
            const a = this.nodePosition(from, bounds), b = this.nodePosition(to, bounds);
            const traversed = map.visitedIds.includes(from.id) && map.visitedIds.includes(to.id);
            const active = map.currentNodeId === from.id || map.currentNodeId === to.id;
            const color = traversed ? COLORS.routeActive : active ? COLORS.route
                : revealed ? "#8f4439" : "#5b332f";
            this.dashedLine(graphics, a.x, a.y, b.x, b.y, color, traversed ? 6 : revealed ? 4 : 3);
        }
    }

    private dashedLine(graphics: Laya.Graphics, x1: number, y1: number, x2: number, y2: number,
        color: string, width: number): void {
        const dx = x2 - x1, dy = y2 - y1, length = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const dash = 16, gap = 10, steps = Math.ceil(length / (dash + gap));
        for (let index = 0; index < steps; index++) {
            const start = index * (dash + gap), end = Math.min(length, start + dash);
            const ax = x1 + dx * start / length, ay = y1 + dy * start / length;
            const bx = x1 + dx * end / length, by = y1 + dy * end / length;
            graphics.drawLine(ax, ay, bx, by, color, width);
        }
    }

    private applyNodeImage(widget: Laya.GImage, node: IExpeditionMapNode, resolved: boolean,
        reachable: boolean, current: boolean, selected: boolean, shown: boolean, revealed: boolean,
        visited: boolean): void {
        widget.visible = shown;
        widget.mouseEnabled = revealed;
        if (!shown) return;
        const source = current || reachable || selected
            ? NODE_SOURCE[node.type].active : NODE_SOURCE[node.type].inactive;
        const path = `${NODE_SOURCE_ROOT}${source}`;
        if (widget.src !== path) widget.src = path;
        widget.autoSize = false;
        widget.size(NODE_SIZE, NODE_SIZE);
        widget.grayed = resolved && !current;
        widget.alpha = current ? 1 : selected ? 1 : reachable ? 0.98
            : visited ? 0.82 : revealed ? 0.7 : 0.46;
        const scale = selected ? 1.17 : current ? 1.1 : reachable ? 1.04 : 1;
        widget.scaleX = scale;
        widget.scaleY = scale;
    }

    private setMeter(bar: Laya.GImage, ratio: number): void {
        const safe = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
        bar.visible = safe > 0;
        bar.scaleX = safe;
    }

    private mapBounds(nodes: IExpeditionMapNode[]) {
        const xs = nodes.map(node => node.x), ys = nodes.map(node => node.y);
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    }

    private nodePosition(node: IExpeditionMapNode,
        bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
        const width = this.mapArea.width - 110, height = this.mapArea.height - 86;
        const scale = Math.min(width / Math.max(1, bounds.maxX - bounds.minX),
            height / Math.max(1, bounds.maxY - bounds.minY));
        return {
            x: 55 + (node.x - bounds.minX) * scale,
            y: 43 + (node.y - bounds.minY) * scale,
        };
    }

    private styleButton(button: Laya.GWidget, selected: boolean, enabled: boolean): void {
        button.graphics.clear();
        const width = button.width, height = button.height, cut = 8;
        button.graphics.drawPoly(0, 0, [cut, 0, width - cut, 0, width, cut, width, height - cut,
            width - cut, height, cut, height, 0, height - cut, 0, cut],
            selected ? "#2b3d32" : enabled ? COLORS.panelSoft : "#1c2521",
            selected ? COLORS.gold : enabled ? COLORS.border : "#333d37", selected ? 2 : 1);
        button.graphics.drawLine(cut + 8, 2, width - cut - 8, 2,
            selected ? COLORS.cyan : enabled ? "#31483b" : "#253029", 1);
        button.alpha = enabled ? 1 : 0.46;
        button.mouseEnabled = enabled;
    }

    private setButtonText(button: Laya.GWidget, text: string): void {
        const label = button.getChildAt(0) as Laya.GTextField;
        if (label) label.text = text;
    }

    private timeText(milliseconds: number): string {
        const total = Math.ceil(milliseconds / 1000);
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    }
}
