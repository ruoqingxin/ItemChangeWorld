import { ElementAnimHelper, ElementAnimInBase, ElementAnimMenuGroup } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

interface AlphaTargetInfo {
    node: Laya.Sprite;
    alpha: number;
}

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.In},0`,
    caption: "淡入",
})
export class ElementAnimFadeIn extends ElementAnimInBase {
    @property({ type: [Laya.Node], tips: "需要执行透明度淡入动画的节点列表" })
    public nodes: Laya.Node[] = [];

    @property({ type: Number, defaultValue: 150, tips: "动画时长(ms)" })
    public duration: number = 150;

    @property({ type: Number, defaultValue: 0, tips: "起始延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 0, tips: "单节点动画间隔(ms)" })
    public interval: number = 0;

    public playOnEnable: boolean = true;

    private _targetInfoList: AlphaTargetInfo[] = [];
    private _hasCachedTargets: boolean = false;
    private _onComplete: () => void = null;

    onAwake(): void {
    }

    onEnable(): void {
    }

    onDisable(): void {
        this.clearAllTweens();
        this.resetNode();
    }

    public resetNode(): void {
        for (let i = 0; i < this._targetInfoList.length; i++) {
            const info = this._targetInfoList[i];
            if (info.node.destroyed) continue;
            info.node.alpha = info.alpha;
        }
    }

    public play(onComplete?: () => void): void {
        if (!this._hasCachedTargets || this._targetInfoList.length <= 0) {
            this.cacheTargets();
            this._hasCachedTargets = true;
        }
        this.clearAllTweens();
        let maxIndex = -1;
        for (let i = 0; i < this.nodes.length; i++) {
            const node = ElementAnimHelper.asSprite(this.nodes[i]);
            if (!node) {
                continue;
            }
            const targetInfo = this.getTargetInfo(node);
            if (!targetInfo) {
                continue;
            }
            node.alpha = 0;
            Laya.Tween.create(node, this)
                .delay(this.delay + i * this.interval)
                .duration(this.duration)
                .ease(Laya.Ease.linearOut)
                .to("alpha", targetInfo.alpha);
            maxIndex = i;
        }
        if (!onComplete) {
            return;
        }
        this._onComplete = onComplete;
        if (maxIndex < 0) {
            this._onComplete();
            return;
        }
        const totalTime = this.delay + maxIndex * this.interval + this.duration;
        Laya.timer.clear(this, this._onComplete);
        Laya.timer.once(totalTime, this, this._onComplete);
    }

    private cacheTargets(): void {
        this._targetInfoList.length = 0;
        for (let i = 0; i < this.nodes.length; i++) {
            const node = ElementAnimHelper.asSprite(this.nodes[i]);
            if (!node) {
                continue;
            }
            this._targetInfoList.push({
                node: node,
                alpha: node.alpha,
            });
        }
    }

    private getTargetInfo(node: Laya.Sprite): AlphaTargetInfo {
        for (let i = 0; i < this._targetInfoList.length; i++) {
            if (this._targetInfoList[i].node === node) {
                return this._targetInfoList[i];
            }
        }
        return null;
    }

    public clearAllTweens(): void {
        ElementAnimHelper.clearTweens(this);
        if (this._onComplete) {
            Laya.timer.clear(this, this._onComplete);
        }
    }
}
