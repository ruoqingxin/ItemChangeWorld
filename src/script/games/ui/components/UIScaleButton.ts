import { UIClickListener } from "./UIClickListener";

const { regClass, classInfo, runInEditor, property } = Laya;
@regClass()
@classInfo({
    menu: "UI扩展",
    caption: "UIScaleButton",
})
export class UIScaleButton extends Laya.Script {
    declare owner: Laya.Sprite;
    @property({ type: Laya.Sprite })
    public tweenTarget: Laya.Sprite;
    private pressed: number = 0.9;
    private downTime: number = 120;
    private upTime: number = 60;
    private readonly minPressed: number = 0.85;
    private readonly maxPressed: number = 0.95;
    private readonly maxWidth: number = 300;

    private _lastTween: Laya.Tween;

    private _lastDownTimeAt: number = 0;

    private mScaleX: number;
    private mScaleY: number;
    onAwake(): void {
        if (this.tweenTarget == null) {
            this.tweenTarget = this.owner;
        }
        this.mScaleX = this.tweenTarget.scaleX;
        this.mScaleY = this.tweenTarget.scaleY;
        const targetWidth = Math.max(0, Math.min(this.tweenTarget.width, this.maxWidth));
        const widthRatio = Math.min(1, targetWidth / this.maxWidth);
        // 根据节点宽度缩放pressed
        this.pressed = this.minPressed + (this.maxPressed - this.minPressed) * widthRatio;
    }
    onEnable(): void {
    }
    onDisable(): void {
        this._removeStageMouseUp();
        this.tweenTarget.scaleX = this.mScaleX;
        this.tweenTarget.scaleY = this.mScaleY;
        this._killLastTween();
    }
    onMouseDown(evt: Laya.Event): void {
        // 内部独立点击控件的按压不触发父按钮缩放，事件仍可冒泡供列表滑动使用。
        for (let target = evt.target as Laya.Node; target && target !== this.owner; target = target.parent) {
            if (target.getComponent(UIClickListener)) {
                return;
            }
        }
        this._lastDownTimeAt = Laya.timer.totalTime;
        const targetScaleX = this.mScaleX * this.pressed;
        const targetScaleY = this.mScaleY * this.pressed;
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);

        this._killLastTween();
        this._lastTween = Laya.Tween.to(this.tweenTarget, { scaleX: targetScaleX, scaleY: targetScaleY }, this.downTime);
    }
    onStageMouseUp(evt: Laya.Event): void {
        this._removeStageMouseUp();
        const elapsed = Laya.timer.totalTime - this._lastDownTimeAt;
        if (elapsed < this.downTime) {
            const newTime = Math.max(1, this.upTime * (elapsed / this.downTime));
            this._toNormal(newTime);
        } else {
            this._toNormal(this.upTime);
        }
    }

    private _toNormal(upTime: number) {
        this._killLastTween();
        this._lastTween = Laya.Tween.to(this.tweenTarget, { scaleX: this.mScaleX, scaleY: this.mScaleY }, upTime);
    }

    private _removeStageMouseUp(): void {
        Laya.stage.off(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
    }

    private _killLastTween() {
        if (this._lastTween) {
            Laya.Tween.kill(this._lastTween);
            this._lastTween = null;
        }
    }
}
