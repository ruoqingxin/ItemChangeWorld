import { ElementAnimHelper, ElementAnimInBase, ElementAnimMenuGroup, ElementTargetInfo, OutsideFromType } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.In},3`,
    caption: "子节点错峰",
})
export class ElementAnimChildrenStagger extends ElementAnimInBase {
    @property({ type: [Laya.Node], tips: "这些节点的子节点会依次从外部进入" })
    public roots: Laya.Node[] = [];

    @property(OutsideFromType)
    public from: OutsideFromType = OutsideFromType.Right;

    @property({ type: Number, defaultValue: 400, tips: "动画时长(ms)" })
    public duration: number = 400;

    @property({ type: Number, defaultValue: 0, tips: "起始延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 80, tips: "子节点间隔(ms)" })
    public childInterval: number = 80;

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
        ElementAnimHelper.restorePositionTargets(this._targetInfoList);
    }
    public play(): void {
        if (!this._hasCachedTargets || this._targetInfoList.length <= 0) {
            this.cacheTargets();
            this._hasCachedTargets = true;
        }
        this.clearAllTweens();
        for (let i = 0; i < this.roots.length; i++) {
            const root = ElementAnimHelper.asSprite(this.roots[i]);
            if (!root) {
                continue;
            }
            for (let j = 0; j < root.numChildren; j++) {
                const child = ElementAnimHelper.asSprite(root.getChildAt(j));
                if (!child) {
                    continue;
                }
                const targetInfo = this.getTargetInfo(child);
                if (!targetInfo) {
                    continue;
                }
                const startPos = ElementAnimHelper.getOutsidePos(child, this.from, this.outsidePadding);
                child.pos(startPos.x, startPos.y);
                ElementAnimHelper.tweenTo(child, this, targetInfo.x, targetInfo.y, this.duration, this.delay + j * this.childInterval);
            }
        }
    }

    private cacheTargets(): void {
        this._targetInfoList.length = 0;
        for (let i = 0; i < this.roots.length; i++) {
            const root = ElementAnimHelper.asSprite(this.roots[i]);
            if (!root) {
                continue;
            }
            for (let j = 0; j < root.numChildren; j++) {
                const child = ElementAnimHelper.asSprite(root.getChildAt(j));
                if (!child) {
                    continue;
                }
                this._targetInfoList.push({ node: child, x: child.x, y: child.y });
            }
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
