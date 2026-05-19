import { UIBaseView } from "./UIBaseView";
import { UIManager, UIOpenParameters } from "./UIManager";

/**
 * 具有添加子界面能力的抽象类,默认寻找subViewRoot子节点（没有则使用根节点作为子界面的父节点）
 */
export abstract class UIContainerView extends UIBaseView {
    private _children: Map<new () => UIBaseView, UIBaseView> = new Map<any, UIBaseView>();

    /**
     * 打开一个子界面 挂载节点名称 默认 = subViewRoot
     * @param formclass 界面类型
     * @param switchMode 互斥模式 默认 = false
     * @returns 
     */
    openChildForm<T extends UIBaseView>(formclass: new () => T, switchMode: boolean = false, ...argv: UIOpenParameters<T['onOpen']>): T {
        let form = this._children.get(formclass) as UIBaseView;
        if (form == null) {
            form = new formclass();
            form.setParentView(this, "subViewRoot");
            this._children.set(formclass, form);
        }
        if (switchMode) {
            for (let view of this._children.values()) {
                if (view == form) {
                    continue;
                }
                view.close();
            }
        }

        form.createForm();
        if (argv && argv.length > 0) {
            form.open(...argv);
        }
        else {
            form.open();
        }
        return form as T;
    }

    /**
     * 获取一个子界面
     * @param formclass 界面类型
     * @returns 
     */
    getChildForm<T extends UIBaseView>(formclass: new () => T): T {
        let form = this._children.get(formclass);
        return form as T;
    }

    /**
     * 关闭一个子界面
     * @param formclass 界面类型
     * @returns 
     */
    closeChildForm<T extends UIBaseView>(formclass: new () => T): void {
        let form = this._children.get(formclass);
        if (form) {
            form.close();
        }
    }

    updateView(): void {
        for (let view of this._children.values()) {
            if (view.isOpened) {
                view.updateView();
            }
        }
    }

    protected _internal_close() {
        for (let view of this._children.values()) {
            view.close();
        }
        super._internal_close();
    }

    public _internal_checkRedDot() {
        super._internal_checkRedDot();
        for (let view of this._children.values()) {
            if (view.isOpened) {
                view._internal_checkRedDot();
            }
        }
    }
}