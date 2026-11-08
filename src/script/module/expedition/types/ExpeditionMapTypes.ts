export type ExpeditionMapNodeType =
    | "start"
    | "battle"
    | "elite"
    | "boss"
    | "borrow"
    | "enlightenment"
    | "search"
    | "recovery"
    | "extract";

export interface IExpeditionMapNode {
    id: string;
    name: string;
    type: ExpeditionMapNodeType;
    x: number;
    y: number;
    stage: number;
    main: boolean;
    encounterIndex?: number;
}

export interface IExpeditionMapEdge {
    from: string;
    to: string;
}

export interface IExpeditionMapConfig {
    id: string;
    name: string;
    startNodeId: string;
    initialRevealStage: number;
    durationMs: number;
    recoveryRate: number;
    nodes: IExpeditionMapNode[];
    edges: IExpeditionMapEdge[];
}

export interface IExpeditionMapState {
    templateId: string;
    currentNodeId: string;
    revealStage: number;
    revealedIds: string[];
    visitedIds: string[];
    resolvedIds: string[];
    battleCount: number;
    battleNodeId: string | null;
    startedAt: number;
    deadlineAt: number;
}
