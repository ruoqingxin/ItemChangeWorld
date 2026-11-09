import { ElementAnimHelper, ElementAnimInBase, ElementAnimMenuGroup } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

interface ScaleTargetInfo {
    node: Laya.Sprite;
    scaleX: number;
    scaleY: number;
}

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.In},5`,
    caption: "缩放弹性",
})
export class ElementAnimScaleBounce extends ElementAnimInBase {
    @property({ type: [Laya.Node], tips: "需要执行缩放弹性动画的节点列表" })
    public nodes: Laya.Node[] = [];

    @property({ type: Number, defaultValue: 0, tips: "起始延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 0, tips: "单节点动画间隔(ms)" })
    public interval: number = 0;

    @property({ type: Number, defaultValue: 50, tips: "95% -> 100% 时长(ms)" })
    public stage1Duration: number = 50;

    @property({ type: Number, defaultValue: 50, tips: "100% -> 98% 时长(ms)" })
    public stage2Duration: number = 50;

    @property({ type: Number, defaultValue: 50, tips: "98% -> 100% 时长(ms)" })
    public stage3Duration: number = 50;

    @property({ type: Boolean, defaultValue: true, tips: "启用时自动播放" })
    public playOnEnable: boolean = true;

    private _targetInfoList: ScaleTargetInfo[] = [];
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
        for (let i = 0; i < this._targetInfoList.length; i++) {
            const info = this._targetInfoList[i];
            if (info.node.destroyed) continue;
            info.node.scale(info.scaleX, info.scaleY);
            info.node.alpha = 1;
        }
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
            const itemDelay = this.delay + i * this.interval;
            const scale95X = targetInfo.scaleX * 0.95;
            const scale95Y = targetInfo.scaleY * 0.95;
            const scale98X = targetInfo.scaleX * 0.98;
            const scale98Y = targetInfo.scaleY * 0.98;
            const scale102X = targetInfo.scaleX * 1.02;
            const scale102Y = targetInfo.scaleY * 1.02;
            node.scale(scale95X, scale95Y);

            node.alpha = 0;
            Laya.Tween.create(node, this)
                .to("alpha", 1)
                .duration(this.stage1Duration + this.stage2Duration + this.stage3Duration)
                .ease(Laya.Ease.sineOut);

            Laya.Tween.create(node, this)
                .delay(itemDelay)
                .to("scaleX", scale102X)
                .to("scaleY", scale102Y)
                .duration(this.stage1Duration)
                .ease(Laya.Ease.sineOut)
                .then(() => {
                    Laya.Tween.create(node, this)
                        .to("scaleX", scale98X)
                        .to("scaleY", scale98Y)
                        .duration(this.stage2Duration)
                        .ease(Laya.Ease.sineInOut)
                        .then(() => {
                            Laya.Tween.create(node, this)
                                .to("scaleX", targetInfo.scaleX)
                                .to("scaleY", targetInfo.scaleY)
                                .duration(this.stage3Duration)
                                .ease(Laya.Ease.sineOut);
                        });
                });
        }
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
                scaleX: node.scaleX,
                scaleY: node.scaleY,
            });
        }
    }

    private getTargetInfo(node: Laya.Sprite): ScaleTargetInfo {
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
