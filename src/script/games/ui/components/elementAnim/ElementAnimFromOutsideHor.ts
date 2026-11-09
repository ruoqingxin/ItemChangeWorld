import { ElementAnimHelper, ElementAnimInHorBase, ElementAnimMenuGroup, ElementTargetInfo, OutsideFromType } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.InHor},0`,
    caption: "外侧进入(横屏)",
})
export class ElementAnimFromOutsideHor extends ElementAnimInHorBase {
    @property({ type: [Laya.Node], tips: "从顶部外部向下进入的节点列表" })
    public fromTopNodes: Laya.Node[] = [];

    @property({ type: [Laya.Node], tips: "从右侧外部向左进入的节点列表" })
    public fromRightNodes: Laya.Node[] = [];

    @property({ type: [Laya.Node], tips: "从左侧外部向右进入的节点列表" })
    public fromLeftNodes: Laya.Node[] = [];

    @property({ type: [Laya.Node], tips: "从底部外部向上进入的节点列表" })
    public fromBottomNodes: Laya.Node[] = [];

    @property({ type: Number, defaultValue: 400, tips: "动画时长(ms)" })
    public duration: number = 400;

    @property({ type: Number, defaultValue: 0, tips: "单节点动画延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 120, tips: "外部入场预留距离(px)" })
    public outsidePadding: number = 120;

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
        ElementAnimHelper.restorePositionTargetsWithAlpha(this._targetInfoList);
    }
    public play(): void {
        if (!this._hasCachedTargets || this._targetInfoList.length <= 0) {
            this.cacheTargets();
            this._hasCachedTargets = true;
        }
        this.clearAllTweens();
        this.playNodeGroupFromOutside(this.fromTopNodes, OutsideFromType.Top);
        this.playNodeGroupFromOutside(this.fromRightNodes, OutsideFromType.Right);
        this.playNodeGroupFromOutside(this.fromLeftNodes, OutsideFromType.Left);
        this.playNodeGroupFromOutside(this.fromBottomNodes, OutsideFromType.Bottom);
    }

    private cacheTargets(): void {
        this._targetInfoList.length = 0;
        this.cacheNodeListTargets(this.fromTopNodes);
        this.cacheNodeListTargets(this.fromRightNodes);
        this.cacheNodeListTargets(this.fromLeftNodes);
        this.cacheNodeListTargets(this.fromBottomNodes);
    }

    private cacheNodeListTargets(nodeList: Laya.Node[]): void {
        for (let i = 0; i < nodeList.length; i++) {
            const node = ElementAnimHelper.asSprite(nodeList[i]);
            if (!node) {
                continue;
            }
            this.tryAddTarget(node);
        }
    }

    private tryAddTarget(node: Laya.Sprite): void {
        for (let i = 0; i < this._targetInfoList.length; i++) {
            if (this._targetInfoList[i].node === node) {
                return;
            }
        }
        this._targetInfoList.push({ node: node, x: node.x, y: node.y });
    }

    private playNodeGroupFromOutside(nodeList: Laya.Node[], from: OutsideFromType): void {
        for (let i = 0; i < nodeList.length; i++) {
            const node = ElementAnimHelper.asSprite(nodeList[i]);
            if (!node) {
                continue;
            }
            const targetInfo = this.getTargetInfo(node);
            if (!targetInfo) {
                continue;
            }
            node.alpha = 1;
            const startPos = ElementAnimHelper.getOutsidePos(node, from, this.outsidePadding);
            node.pos(startPos.x, startPos.y);
            console.log("startPos:", startPos.x, startPos.y);
            ElementAnimHelper.tweenTo(node, this, targetInfo.x, targetInfo.y, this.duration, i * this.delay);
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
