const { regClass, property } = Laya;

@regClass()
export class UITouchListener extends Laya.Script {
    declare owner: Laya.Sprite;

    onTouchBegin: Function;
    onTouchEnd: Function;
    static create(node: Laya.Sprite) {
        let component = node.getComponent(UITouchListener);
        if (!component) {
            component = node.addComponent(UITouchListener);
        }
        return component;
    }

    onMouseDown(evt: Laya.Event): void {
        if (this.onTouchBegin) {
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this._stageListenCall);
            Laya.stage.on(Laya.Event.MOUSE_OUT, this, this._stageListenCall);
            this.onTouchBegin();
        }
    }

    private _stageListenCall(): void {
        Laya.stage.offAllCaller(this);
        if (this.onTouchEnd) {
            this.onTouchEnd();
        }
    }
}