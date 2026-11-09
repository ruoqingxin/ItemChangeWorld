import { ElementAnimHelper, ElementAnimMenuGroup, ElementAnimOutBase, ElementTargetInfo, OutsideFromType } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.Out},1`,
    caption: "移到外部",
})
export class ElementAnimToOutside extends ElementAnimOutBase {
    @property({ type: [Laya.Node], tips: "向顶部移出界面的节点列表" })
    public toTopNodes: Laya.Node[] = [];

    @property({ type: [Laya.Node], tips: "向右侧移出界面的节点列表" })
    public toRightNodes: Laya.Node[] = [];

    @property({ type: [Laya.Node], tips: "向左侧移出界面的节点列表" })
    public toLeftNodes: Laya.Node[] = [];

    @property({ type: [Laya.Node], tips: "向底部移出界面的节点列表" })
    public toBottomNodes: Laya.Node[] = [];

    @property({ type: Number, defaultValue: 300, tips: "动画时长(ms)" })
    public duration: number = 300;

    @property({ type: Number, defaultValue: 0, tips: "起始延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 0, tips: "单节点动画间隔(ms)" })
    public interval: number = 0;

    @property({ type: Number, defaultValue: 120, tips: "外部预留距离(px)" })
    public outsidePadding: number = 120;

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
    public play(onComplete?: () => void): void {
        if (!this._hasCachedTargets || this._targetInfoList.length <= 0) {
            this.cacheTargets();
            this._hasCachedTargets = true;
        }
        this.clearAllTweens();

        let startIndex = 0;
        startIndex = this.playNodeGroupToOutside(this.toTopNodes, OutsideFromType.Top, startIndex);
        startIndex = this.playNodeGroupToOutside(this.toRightNodes, OutsideFromType.Right, startIndex);
        startIndex = this.playNodeGroupToOutside(this.toLeftNodes, OutsideFromType.Left, startIndex);
        startIndex = this.playNodeGroupToOutside(this.toBottomNodes, OutsideFromType.Bottom, startIndex);

        if (!onComplete) {
            return;
        }
        if (startIndex <= 0) {
            onComplete();
            return;
        }

        const totalTime = this.delay + (startIndex - 1) * this.interval + this.duration;
        Laya.timer.clear(this, onComplete);
        Laya.timer.once(totalTime, this, onComplete);
    }

    private cacheTargets(): void {
        this._targetInfoList.length = 0;
        this.cacheNodeListTargets(this.toTopNodes);
        this.cacheNodeListTargets(this.toRightNodes);
        this.cacheNodeListTargets(this.toLeftNodes);
        this.cacheNodeListTargets(this.toBottomNodes);
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

    private playNodeGroupToOutside(nodeList: Laya.Node[], to: OutsideFromType, startIndex: number): number {
        let index = startIndex;
        for (let i = 0; i < nodeList.length; i++) {
            const node = ElementAnimHelper.asSprite(nodeList[i]);
            if (!node) {
                continue;
            }
            const targetInfo = this.getTargetInfo(node);
            if (!targetInfo) {
                continue;
            }

            node.pos(targetInfo.x, targetInfo.y);
            const outsidePos = ElementAnimHelper.getOutsidePos(node, to, this.outsidePadding);
            ElementAnimHelper.tweenTo(node, this, outsidePos.x, outsidePos.y, this.duration, this.delay + index * this.interval);
            index++;
        }
        return index;
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
