import type {
    IExpeditionMapConfig,
    IExpeditionMapEdge,
    IExpeditionMapNode,
    IExpeditionMapState,
} from "../types/ExpeditionMapTypes";

const node = (
    id: string, name: string, type: IExpeditionMapNode["type"], x: number, y: number,
    stage: number, main: boolean, encounterIndex?: number,
): IExpeditionMapNode => ({ id, name, type, x, y, stage, main, encounterIndex });

const edge = (from: string, to: string): IExpeditionMapEdge => ({ from, to });

export class ExpeditionMapUtils {
    static createFirstMap(durationMs = 20 * 60 * 1000): IExpeditionMapConfig {
        const nodes = [
            node("start", "入境处", "start", 70, 300, 0, true),
            node("b1", "荒径", "battle", 165, 300, 1, true, 0),
            node("b2", "残田", "battle", 260, 300, 2, true, 1),
            node("borrow1", "借法台·一", "borrow", 355, 300, 3, true),
            node("b3", "断垣", "battle", 450, 300, 3, true, 0),
            node("elite1", "藤甲守", "elite", 545, 300, 4, true, 1),
            node("borrow2", "借法台·二",  "borrow", 545, 170, 4, true),
            node("b4", "塌桥", "battle", 650, 170, 5, true, 0),
            node("elite2", "残阵卫", "elite", 650, 300, 6, true, 1),
            node("borrow3", "借法台·三", "borrow", 740, 170, 6, true),
            node("b5", "灵脉井", "battle", 650, 430, 7, true, 0),
            node("boss", "守碑兽", "boss", 835, 300, 8, true, 2),
            node("extract-final", "古碑归途", "extract", 835, 430, 9, true),

            node("opt1", "腐叶涧", "battle", 260, 430, 3, false, 0),
            node("opt2", "碎木坡", "battle", 355, 430, 4, false, 1),
            node("opt3", "灰雾林", "battle", 545, 430, 6, false, 0),
            node("search1", "草丛", "search", 165, 170, 3, false),
            node("recovery1", "灵泉", "recovery", 260, 170, 4, false),
            node("enlightenment", "悟道残碑", "enlightenment", 450, 170, 5, false),
            node("extract-mid", "旧山门", "extract", 70, 430, 4, false),
            node("search2", "田埂", "search", 650, 70, 5, false),
            node("opt4", "荒祠", "battle", 450, 370, 6, false, 1),
            node("search3", "残龛", "search", 740, 70, 7, false),
            node("recovery2", "月泉", "recovery", 835, 70, 7, false),
            node("extract-deep", "断崖", "extract", 835, 220, 8, false),
            node("opt5", "祭坛", "elite", 740, 300, 8, false, 1),
            node("opt6", "尸林", "battle", 740, 430, 9, false, 0),
            node("search4", "枯井", "search", 545, 530, 8, false),
            node("opt7", "碑影", "battle", 650, 530, 10, false, 1),
        ];
        const edges = [
            edge("start", "b1"), edge("start", "search1"),
            edge("b1", "b2"), edge("b1", "extract-mid"),
            edge("b2", "borrow1"), edge("b2", "opt1"),
            edge("opt1", "opt2"), edge("opt2", "b3"), edge("opt2", "search1"),
            edge("borrow1", "b3"), edge("borrow1", "recovery1"),
            edge("b3", "elite1"), edge("b3", "opt4"),
            edge("elite1", "borrow2"), edge("elite1", "search2"),
            edge("elite1", "extract-mid"),
            edge("borrow2", "b4"), edge("borrow2", "enlightenment"),
            edge("b4", "elite2"), edge("b4", "search2"),
            edge("elite2", "borrow3"), edge("elite2", "opt4"),
            edge("opt4", "opt5"), edge("opt5", "b5"),
            edge("borrow3", "b5"), edge("borrow3", "search3"),
            edge("borrow3", "recovery2"), edge("borrow3", "extract-deep"),
            edge("b5", "boss"), edge("b5", "opt3"), edge("opt3", "search4"),
            edge("boss", "extract-final"), edge("boss", "opt6"),
            edge("opt6", "opt7"), edge("opt7", "extract-final"),
            edge("search3", "opt5"), edge("search4", "boss"),
        ];
        const map: IExpeditionMapConfig = {
            id: "first-realm-abandoned-field",
            name: "废弃灵田 · 低阶残景",
            startNodeId: "start",
            initialRevealStage: 3,
            durationMs,
            recoveryRate: 0.2,
            nodes,
            edges,
        };
        this.validateConfig(map);
        return map;
    }

    static createState(config: IExpeditionMapConfig, now = Date.now()): IExpeditionMapState {
        this.validateConfig(config);
        return {
            templateId: config.id,
            currentNodeId: config.startNodeId,
            revealStage: config.initialRevealStage,
            revealedIds: config.nodes.filter(node =>
                node.main && node.stage <= config.initialRevealStage).map(node => node.id),
            visitedIds: [config.startNodeId],
            resolvedIds: [config.startNodeId],
            battleCount: 0,
            battleNodeId: null,
            startedAt: now,
            deadlineAt: now + config.durationMs,
        };
    }

    static node(config: IExpeditionMapConfig, nodeId: string): IExpeditionMapNode {
        const found = config.nodes.find(node => node.id === nodeId);
        if (!found) throw new Error(`地图节点不存在：${nodeId}`);
        return found;
    }

    static adjacent(config: IExpeditionMapConfig, from: string, to: string): boolean {
        return config.edges.some(edge =>
            (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from));
    }

    static canMove(config: IExpeditionMapConfig, state: IExpeditionMapState, to: string): boolean {
        if (to === state.currentNodeId) return state.visitedIds.includes(to);
        const target = this.node(config, to);
        return state.revealedIds.includes(to) && target.stage <= state.revealStage && this.adjacent(config, state.currentNodeId, to);
    }

    static advance(state: IExpeditionMapState, nodeId: string): void {
        state.currentNodeId = nodeId;
        if (!state.visitedIds.includes(nodeId)) state.visitedIds.push(nodeId);
    }

    static reveal(state: IExpeditionMapState, config: IExpeditionMapConfig, stage: number): void {
        state.revealStage = Math.max(state.revealStage, stage);
        for (const node of config.nodes) {
            if (node.stage > state.revealStage || state.revealedIds.includes(node.id)) continue;
            if (state.visitedIds.some(visited => this.adjacent(config, visited, node.id)))
                state.revealedIds.push(node.id);
        }
    }

    static requireRevealed(config: IExpeditionMapConfig, state: IExpeditionMapState, nodeId: string): void {
        if (!this.canMove(config, state, nodeId)) throw new Error("该节点当前不可达或尚未揭示");
    }

    static validateConfig(config: IExpeditionMapConfig): void {
        const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
        check(!!config && typeof config.id === "string" && !!config.id, "地图模板无效");
        check(Number.isSafeInteger(config.durationMs) && config.durationMs > 0, "地图时限无效");
        check(config.recoveryRate > 0 && config.recoveryRate <= 1, "恢复比例无效");
        check(Array.isArray(config.nodes) && config.nodes.length > 0 && Array.isArray(config.edges), "地图节点或连线无效");
        const ids = new Set(config.nodes.map(node => node.id));
        check(ids.size === config.nodes.length, "地图节点 ID 重复");
        check(ids.has(config.startNodeId), "地图入口不存在");
        const battleNodes = config.nodes.filter(node => ["battle", "elite", "boss"].includes(node.type));
        check(battleNodes.length >= 8 && battleNodes.length <= 15, "首图战斗节点必须为八至十五场");
        check(config.nodes.some(node => node.type === "boss"), "地图缺少首领节点");
        check(config.nodes.filter(node => node.main && node.type === "borrow").length >= 3,
            "常规路线至少需要三处借法台");
        check(config.nodes.some(node => node.type === "enlightenment"), "地图缺少悟道台");
        const extracts = config.nodes.filter(node => node.type === "extract").length;
        check(extracts >= 2 && extracts <= 3, "首图撤离点必须为二至三个");
        const recoveries = config.nodes.filter(node => node.type === "recovery").length;
        check(recoveries >= 1 && recoveries <= 2, "首图恢复点必须为一至两个");
        const searches = config.nodes.filter(node => node.type === "search").length;
        check(searches >= 3 && searches <= 5, "首图搜索点必须为三至五处");
        for (const node of config.nodes) {
            check(Number.isFinite(node.x) && Number.isFinite(node.y), `节点坐标无效：${node.id}`);
            check(Number.isSafeInteger(node.stage) && node.stage >= 0, `节点阶段无效：${node.id}`);
            if (["battle", "elite", "boss"].includes(node.type))
                check(Number.isSafeInteger(node.encounterIndex), `战斗节点缺少遭遇：${node.id}`);
        }
        const graph = new Map<string, string[]>();
        for (const id of ids) graph.set(id, []);
        for (const item of config.edges) {
            check(ids.has(item.from) && ids.has(item.to) && item.from !== item.to, "地图连线引用无效");
            graph.get(item.from)!.push(item.to);
            graph.get(item.to)!.push(item.from);
        }
        const queue = [config.startNodeId], seen = new Set<string>(queue);
        while (queue.length) {
            for (const next of graph.get(queue.shift()!)!) {
                if (!seen.has(next)) { seen.add(next); queue.push(next); }
            }
        }
        check([...ids].every(id => seen.has(id)), "地图存在不可达节点");
    }
}
