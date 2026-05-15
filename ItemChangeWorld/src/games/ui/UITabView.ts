import { TabConstructor } from "./TabConstructor";
import { TabCtrl } from "./TabCtrl";
import { UIBaseView } from "./UIBaseView";
import { UILayer } from "./UILayer";
import { UIManager } from "./UIManager";
import { FuncEntryData } from "src/script/module/main/data/FuncEntryData";

export abstract class UITabSubView extends UIBaseView {
    public get layer(): UILayer {
        return UILayer.Base;
    }
}
/**
 * 具有切换子界面能力的切页抽象类
 * 注意会默认寻找list_tab子节点和subViewRoot子节点（没有则使用根节点作为子界面的父节点）
 * updateTabStatus 会自动调用，请勿在界面打开时手动触发
 * onOpen 的第一个参数必须是页签功能id
 */
export abstract class UITabView extends UIBaseView {
    private _tabCtrl: TabCtrl = new TabCtrl();
    /**
     * 页签控制器
     */
    public get tabCtrl() {
        return this._tabCtrl;
    }

    /**
     * 子页签定义
     * onOpen前调用，每次打开界面都会触发
     */
    public onInitTabs(tabConstructor: TabConstructor) {
        const tabIdList = UIManager.ins().getTabSubViewIdList(this.constructor as new () => UIBaseView);
        if (!tabIdList || tabIdList.length <= 0) {
            return;
        }
        tabIdList.sort((a, b) => {
            const aCfg = FuncEntryData.ins().getFuncCfg(a as any);
            const bCfg = FuncEntryData.ins().getFuncCfg(b as any);
            if (!aCfg || !bCfg) {
                return a - b;
            }
            return aCfg.order - bCfg.order;
        });
        tabConstructor.viewClassList = this.buildViewClassList(tabIdList);
    }

    /**
     * 默认根据tab id从UIManager构建viewClassList
     */
    protected buildViewClassList(tabDataList: number[]): TabConstructor["viewClassList"] {
        const viewClassList: TabConstructor["viewClassList"] = [];
        for (let i = 0; i < tabDataList.length; i++) {
            const id = tabDataList[i];
            viewClassList.push({
                id: id,
                viewClass: UIManager.ins().getTabSubViewClass(id),
                data: id,
            });
        }
        return viewClassList;
    }

    protected _internal_open() {
        const tabConstructor: TabConstructor = new TabConstructor();
        this.onInitTabs(tabConstructor);
        this._tabCtrl.initSubViews(this, tabConstructor);
        if (this._tabCtrl.tabList) {
            this._tabCtrl.tabList.setClickListener(this, this.onTabGroupClick);
        }
        this._tabCtrl.onOpen();
        if (this.isOpening) {
            // 重置小红点
            for (let i = 0, len = this._tabCtrl.visibleTabIdList.length; i < len; i++) {
                this.setRedDotVisibleById(this._tabCtrl.visibleTabIdList[i], false);
            }
        }
        super._internal_open();
    }

    protected _internal_close() {
        this._tabCtrl.onClose();
        super._internal_close();
    }

    /**
     * 红点变化时通知
     */
    public _internal_checkRedDot() {
        super._internal_checkRedDot();
        let view = this.getCurrentTab();
        if (view && view.isOpened) {
            view._internal_checkRedDot();
        }
    }

    /**
     * 界面打开时调用
     * @param openId 界面打开默认切换的界面
     * @param args 参数列表
     */
    public onOpen(openId: number, ...args: any[]) {
        this.switchTabFormById(openId, ...args);
    }

    updateView(): void {
        let view = this.getCurrentTab();
        if (view && view.isOpened) {
            view.updateView();
        }
    }

    protected onTabGroupClick(index: number) {
        if (this._tabCtrl.getCurrentTab() && this._tabCtrl.getCurrentTab().id == this._tabCtrl.visibleTabIdList[index]) {
            return;
        }
        this.switchTabFormById(this._tabCtrl.visibleTabIdList[index]);
    }

    protected onRedDotChange(): void {
        const tabIdList = this.tabCtrl.tabIdList;
        for (let i = 0; i < tabIdList.length; i++) {
            const id = tabIdList[i];
            this.setRedDotVisibleById(id, UIManager.ins().getTabSubViewRedDotVisible(id));
        }
    }

    /**
     * 获取当前页签
     * @returns 
     */
    getCurrentTab(): UITabSubView {
        return this._tabCtrl.getCurrentTab();
    }

    /**
     * 根据类型获取已打开的tab子界面
     * @param formclass 界面类型
     */
    getTabFormByClass<T extends UIBaseView>(formclass: new () => T): T {
        return this._tabCtrl.getTabFormByClass(formclass);
    }

    /**
     * 根据功能id切换界面 如果目标界面不存在，则打开第一个可用界面
     * @param id 功能id
     * @param args 参数列表
     */
    switchTabFormById(id: number, ...args) {
        this._tabCtrl.switchTabFormById(id, ...args);
    }

    /**
     * 设置页签红点
     * @param id 页签
     * @param value 是否显示 
     */
    setRedDotVisibleById(id: number, value: boolean) {
        this._tabCtrl.setRedDotVisibleById(id, value);
    }

    /**
     * 设置页签控制器状态
     * 需要设置在onopen生命周期中
     * @param id 页签id
     * @param cname 控制器名称
     * @param cindex 控制器下标
     */
    setTabCtrlStatusById(id: number, cname: string, cindex: number) {
        this._tabCtrl.setTabCtrlStatusById(id, cname, cindex);
    }
    /**
     * 检查页签状态
     */
    updateTabStatus() {
        this._tabCtrl.updateTabStatus();
    }
}