import { ElementAnimHelper, ElementAnimInBase, ElementAnimMenuGroup, ElementTargetInfo } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.In},2`,
    caption: "Y轴偏移",
})
export class ElementAnimFromUpperOffset extends ElementAnimInBase {
    @property({ type: [Laya.Node], tips: "从目标位置上方偏移后下落的节点列表" })
    public nodes: Laya.Node[] = [];

    @property({ type: Number, defaultValue: 400, tips: "动画时长(ms)" })
    public duration: number = 400;

    @property({ type: Number, defaultValue: 0, tips: "单节点动画延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 80, tips: "上方偏移量(px)" })
    public upperOffsetY: number = 80;

    @property({ type: Boolean, defaultValue: true, tips: "启用时自动播放" })
    public playOnEnable: boolean = true;

    private _targetInfoList: ElementTargetInfo[] = [];
    private _hasCachedTargets: boolean = false;

    onAwake(): void {
    }

    onEnable(): void {
    }

    onDisable(): void {
        this.clearAllTweens();
        this.resetNode();
    }

    resetNode(): void {
        ElementAnimHelper.restorePositionTargets(this._targetInfoList);
    }
    public play(): void {
        if (!this._hasCachedTargets || this._targetInfoList.length <= 0) {
            this.cacheTargets();
            this._hasCachedTargets = true;
        }
        this.clearAllTweens();
        for (let i = 0; i < this.nodes.length; i++) {
            const node = ElementAnimHelper.asSprite(this.nodes[i]);
            if (!node) {
                continue;
            }
            const targetInfo = this.getTargetInfo(node);
            if (!targetInfo) {
                continue;
            }
            node.pos(targetInfo.x, targetInfo.y - this.upperOffsetY);
            ElementAnimHelper.tweenTo(node, this, targetInfo.x, targetInfo.y, this.duration, this.delay);
        }
    }

    private cacheTargets(): void {
        this._targetInfoList.length = 0;
        for (let i = 0; i < this.nodes.length; i++) {
            const node = ElementAnimHelper.asSprite(this.nodes[i]);
            if (!node) {
                continue;
            }
            this._targetInfoList.push({ node: node, x: node.x, y: node.y });
        }
    }

    private getTargetInfo(node: Laya.Sprite): ElementTargetInfo {
        for (let i = 0; i < this._targetInfoList.length; i++) {
            if (this._targetInfoList[i].node === node) {
                return this._targetInfoList[i];
            }
        }
        return null;
    }

    public clearAllTweens(): void {
        ElementAnimHelper.clearTweens(this);
    }
}
