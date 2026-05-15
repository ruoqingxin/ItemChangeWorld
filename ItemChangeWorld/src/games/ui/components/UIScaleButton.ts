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

    private _lastDownTimeAt: number = 0;

    private mScale: number;
    onAwake(): void {
        if (this.tweenTarget == null) {
            this.tweenTarget = this.owner;
        }
        this.mScale = this.tweenTarget.scaleX;
        const targetWidth = Math.max(0, Math.min(this.tweenTarget.width, this.maxWidth));
        const widthRatio = Math.min(1, targetWidth / this.maxWidth);
        // 根据节点宽度缩放pressed
        this.pressed = this.minPressed + (this.maxPressed - this.minPressed) * widthRatio;
    }
    onEnable(): void {
    }
    onDisable(): void {
        this.tweenTarget.scaleX = this.tweenTarget.scaleY = this.mScale;
        Laya.Tween.killAll(this.tweenTarget);
    }
    onMouseDown(evt: Laya.Event): void {
        this._lastDownTimeAt = Laya.timer.totalTime;
        let targetSize = this.mScale * this.pressed;
        Laya.stage.on(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);

        Laya.Tween.killAll(this.tweenTarget);
        Laya.Tween.to(this.tweenTarget, { scaleX: targetSize, scaleY: targetSize }, this.downTime);
    }
    onStageMouseUp(evt: Laya.Event): void {
        Laya.stage.off(Laya.Event.MOUSE_UP, this, this.onStageMouseUp);
        let now = Laya.timer.totalTime;
        if (now - this._lastDownTimeAt < this.downTime) {
            let newTime = this.upTime * (now - this._lastDownTimeAt);
            if (newTime <= 0) {
                newTime = 100 / this.downTime;
            }
            this._toNormal(newTime);
        }
        else {
            this._toNormal(this.upTime);
        }
    }

    private _toNormal(upTime: number) {
        Laya.Tween.killAll(this.tweenTarget);
        Laya.Tween.to(this.tweenTarget, { scaleX: this.mScale, scaleY: this.mScale }, this.downTime);
    }
}