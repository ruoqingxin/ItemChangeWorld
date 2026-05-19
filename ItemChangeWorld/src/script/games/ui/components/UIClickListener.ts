const { regClass, property } = Laya;

@regClass()
export class UIClickListener extends Laya.Script {
    declare owner: Laya.Sprite;

    onClick: Function;
    /**
     * 点击间隔
     */
    clickDelta: number = 100;
    /**
     * 上次点击时间
     */
    private _lastClickTimeAt: number = 0;

    static create(node: Laya.Sprite) {
        let component = node.getComponent(UIClickListener);
        if (!component) {
            component = node.addComponent(UIClickListener);
        }
        return component;
    }

    onMouseClick(evt: Laya.Event): void {
        this.handleClick();
        evt.stopPropagation();
    }

    handleClick() {
        if (!this.owner.activeInHierarchy) {
            return;
        }
        const now = Laya.Browser.now();
        if (now - this._lastClickTimeAt < this.clickDelta) {
            return;
        }
        this._lastClickTimeAt = now;

        if (this.onClick) {
            this.onClick();
        }
    }
}