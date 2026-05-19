const { regClass, property } = Laya;

@regClass()
export class UIDragListener extends Laya.Script {
    declare owner: Laya.Sprite;

    private _enableListener: boolean = false;
    onDrag: any;
    onDragEnd: any;
    static create(node: Laya.Sprite) {
        let component = node.getComponent(UIDragListener);
        if (!component) {
            component = node.addComponent(UIDragListener);
        }
        return component;
    }

    onMouseDrag(evt: Laya.Event): void {
        if (!this._enableListener) {
            this._enableListener = true;
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this._stageListenCall);
            Laya.stage.on(Laya.Event.MOUSE_DRAG_END, this, this._stageListenCall);
        }

        if (this.onDrag) {
            this.onDrag();
        }
    }

    private _stageListenCall(): void {
        this._enableListener = false;
        Laya.stage.offAllCaller(this);
        if (this.onDragEnd) {
            this.onDragEnd();
        }
    }
}