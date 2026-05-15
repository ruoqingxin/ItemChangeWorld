export abstract class ListItemCtrl<T = unknown> {
    /**
     * 根节点
     */
    public get rootNode() {
        return this._rootNode;
    }
    constructor(protected _rootNode: Laya.GWidget = null) { }
    abstract setComponents(rootNode: Laya.GWidget, index: number, ...args);
    abstract update(data: T, index: number, ...args);
}