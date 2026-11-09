const { regClass, property } = Laya;

@regClass()
export class UIActiveListener extends Laya.Script {
    public onActiveChange: (value: boolean) => void;
    private _destroyListeners = new Set<() => void>();

    /** 真正销毁节点时清理其独立资源；隐藏、移除和列表入池不会触发。 */
    public addDestroyListener(listener: () => void): void {
        this._destroyListeners.add(listener);
    }

    static create(node: Laya.Sprite) {
        let component = node.getComponent(UIActiveListener);
        if (!component) {
            component = node.addComponent(UIActiveListener);
        }
        return component;
    }

    //组件被启用后执行，例如节点被添加到舞台后
    onEnable(): void {
        if (this.onActiveChange != null) {
            this.onActiveChange(true);
        }
    }

    //组件被禁用时执行，例如从节点从舞台移除后
    onDisable(): void {
        if (this.onActiveChange != null) {
            this.onActiveChange(false);
        }
    }

    onDestroy(): void {
        const listeners = Array.from(this._destroyListeners);
        this._destroyListeners.clear();
        this.onActiveChange = null;
        for (const listener of listeners) {
            listener();
        }
    }
}
