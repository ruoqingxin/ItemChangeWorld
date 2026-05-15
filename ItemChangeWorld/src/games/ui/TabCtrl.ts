import { UIBaseView } from "./UIBaseView";
import { List } from "src/script/sfgames/uilib/List";
import { ListItemCtrl } from "src/script/sfgames/uilib/ListItemCtrl";
import { ElemFinder } from "src/script/sfgames/utils/ElemFinder";
import { UIUtils } from "src/script/sfgames/utils/UIUtils";
import { UITabSubView } from "./UITabView";
import { TabConstructor } from "./TabConstructor";

export type TabFormSearcher = {
    getTabFormByClass<T extends UIBaseView>(formclass: new () => T): T;
};
/**
 * 页签控制器
 */
export class TabCtrl {
    /**
     * tab页签列表
     */
    private _tabIdList: number[] = [];
    /**
     * 子页签缓存字典
     */
    private _tabTypeMap: Map<new () => UITabSubView, UITabSubView> = new Map<new () => UITabSubView, UITabSubView>();
    /**
     * 当前显示的tab id列表
     */
    private _visibleTabIdList: number[] = [];
    /**
     * 当前显示的tab id列表
     */
    public get visibleTabIdList() {
        return this._visibleTabIdList;
    }
    /**
     * tab页签id列表
     */
    public get tabIdList() {
        return this._tabIdList;
    }
    /**
     * 当前正打开的tab界面
     */
    private _openenView: UITabSubView;
    /**
     * 当前打开的index
     */
    private _openedViewId: number = -1;
    /**
     * 当前打开的tab id
     */
    public get openedViewId() {
        return this._openedViewId;
    }

    /**
     * 当前打开的tab index
     */
    public get openedViewIndex() {
        return this._visibleTabIdList.indexOf(this._openedViewId);
    }

    protected _tabList: List<TabItemCtrl>;

    /**
     * tab页签列表
     */
    public get tabList() {
        return this._tabList;
    }

    /**
     * 父界面
     */
    private _parentView: UIBaseView;
    /**
     * tab构造器
     */
    private _tabConstructor: TabConstructor;
    private _autoHideRoot: Laya.GWidget;

    initSubViews(parentView: UIBaseView, tabConstructor: TabConstructor) {
        this._tabConstructor = tabConstructor;
        this._parentView = parentView;
        this._tabConstructor.viewClassList = this._tabConstructor.viewClassList || [];
        this._tabIdList.length = 0;
        let size = this._tabConstructor.viewClassList.length;
        for (let i = 0; i < size; i++) {
            const tabDefine = this._tabConstructor.viewClassList[i];
            if (!tabDefine) {
                continue;
            }
            this._tabIdList.push(tabDefine.id);
        }
        if (!this._autoHideRoot) {
            this._autoHideRoot = this._parentView.getElement(this._tabConstructor.autoHideRootName, false);
        }
        if (!this._tabList) {
            this._tabList = this._parentView.uiElement.getList(tabConstructor.tabListName);
            if (!this._tabList) {
                console.error("tabview 必须拥有一个tabList节点");
                return;
            }
            // 页签tab不适用虚拟列表
            this._tabList.isVirtual = false;
            this._tabList.itemCtrl = tabConstructor.tabCtrl;
        }
    }

    /**
     * 更新页签开启状态
     */
    public updateTabStatus() {
        this._visibleTabIdList = [];
        const viewClassList = this._tabConstructor.viewClassList || [];
        let availableList: any[] = [];
        for (let i = 0, len = this._tabIdList.length; i < len; i++) {
            let tabId = this._tabIdList[i];
            let tabDefine = viewClassList[i];
            if (!tabDefine) {
                continue;
            }
            let available = this._tabConstructor.visibleCheckFunc ?
                this._tabConstructor.visibleCheckFunc(this._tabIdList[i], tabDefine.data) : true;
            if (available) {
                availableList.push(tabDefine.data);
                this._visibleTabIdList.push(tabId);
            }
        }
        this._tabList.array = availableList;
    }

    onOpen() {
        this.updateTabStatus();
    }

    onClose() {
        this.switchTabFormById(-1);
    }

    /**
     * 获取当前打开的页签
     * @returns 
     */
    getCurrentTab(): UITabSubView {
        return this._openenView;
    }

    private _isTabFormSearcher(view: UIBaseView): view is UIBaseView & TabFormSearcher {
        if (!view) {
            return false;
        }
        const searcher = view as Partial<TabFormSearcher>;
        return typeof searcher.getTabFormByClass === "function";
    }

    /**
     * 根据类型获取已打开的tab子界面（支持递归查找嵌套tab）
     * @param formclass 界面类型
     */
    getTabFormByClass<T extends UIBaseView>(formclass: new () => T): T {
        for (const form of this._tabTypeMap.values()) {
            if (!form) {
                continue;
            }
            if (form.isOpened && form instanceof formclass) {
                return form as T;
            }
            if (this._isTabFormSearcher(form)) {
                const subForm = form.getTabFormByClass(formclass);
                if (subForm && subForm.isOpened) {
                    return subForm;
                }
            }
        }
        return null;
    }

    /**
     * 根据页签功能id切换子界面
     * @param id 页签功能id
     * @param args 参数列表
     * @returns 
     */
    switchTabFormById(id: number, ...args: any[]) {

        if (id == this._openedViewId) {
            if (this._openenView) {
                if (args && args.length > 0) {
                    this._openenView.open(...args);
                }
                else {
                    this._openenView.open();
                }
            }
            return;
        }
        if (this._openenView != null) {
            this._openenView.close();
            this._openenView = null;
        }
        if (id < 0) {
            // 小于0 取消选中
            this._tabList.selected = -1;
            id = -1;
        }

        const viewClassList = this._tabConstructor.viewClassList || [];
        let define = viewClassList.find(e => e.id == id);
        if (define == null && this._visibleTabIdList.length > 0 && id > -1) {
            // 赋予一个id
            id = this._visibleTabIdList[0];
            define = viewClassList.find(e => e.id == id);
        }
        this._openedViewId = id;

        if (define == null || define.viewClass == null) {
            return;
        }
        let newForm = this._tabTypeMap.get(define.viewClass);
        if (newForm == null) {
            newForm = (new define.viewClass);
            newForm.setParentView(this._parentView, this._tabConstructor.subViewRootName);
            this._tabTypeMap.set(define.viewClass, newForm);
        }
        let newIndex = this._visibleTabIdList.indexOf(id);
        this._tabList.selected = newIndex;
        this._tabList.scrollTo(newIndex);
        if (newForm != null) {
            // 检测自动隐藏
            if (this._autoHideRoot) {
                UIUtils.setActive(this._autoHideRoot, !define.autoHideParentRoot);
            }
            this._openenView = newForm;
            newForm.setViewId(define.id);
            newForm.createForm();
            if (args && args.length > 0) {
                newForm.open(...args);
            }
            else {
                newForm.open();
            }
        }
    }

    /**
     * 设置页签红点是否显示
     * @param id 页签功能id
     * @param value 是否显示
     */
    setRedDotVisibleById(id: number, value: boolean) {
        let index = this._visibleTabIdList.indexOf(id);
        if (index > -1) {
            let ctrl = this._tabList.getItemCtrl(index);
            if (null != ctrl) {
                ctrl.setRedDotVisible(value);
            }
        }
    }

    /**
     * 设置页签控制器状态
     * @param id 页签id
     * @param cname 控制器名称
     * @param cindex 控制器下标
     */
    setTabCtrlStatusById(id: number, cname: string, cindex: number) {
        let index = this._visibleTabIdList.indexOf(id);
        if (index > -1) {
            let ctrl = this._tabList.getItemCtrl(index);
            if (null != ctrl) {
                ctrl.setNodeCtrlStatus(cname, cindex);
            }
        }
    }
}

export abstract class TabItemCtrl<T = unknown> extends ListItemCtrl<T> {
    protected _redDotNode: Laya.GWidget;
    /**
     * 设置红点是否显示 默认 = redDot || redDotNum
     * @param value 是否显示
     */
    setRedDotVisible(value: boolean) {
        if (!this._redDotNode) {
            this._redDotNode = ElemFinder.getElement(this._rootNode, "redDot") || ElemFinder.getElement(this._rootNode, "redDotNum");
        }
        if (this._redDotNode) {
            this._redDotNode.visible = value;
            this._redDotNode.active = value;
        }
    }

    /**
     * 设置红点数量 默认 = redDotNum
     * @param value 数量
     */
    setRedDotNum(value: number) {
        if (!this._redDotNode) {
            this._redDotNode = ElemFinder.getElement(this._rootNode, "redDotNum");
        }
        if (this._redDotNode) {
            const txt = ElemFinder.getText(this._redDotNode, "txt_title");
            if (txt) {
                txt.text = value.toString();
            }
            this._redDotNode.visible = value > 0;
            this._redDotNode.active = value > 0;
        }
    }

    /**
     * 设置节点ctrl状态
     * @param cname ctrl名称
     * @param index 状态下标
     */
    setNodeCtrlStatus(cname: string, index: number) {
        UIUtils.setNodeCtrlStatus(this._rootNode, index, cname)
    }
};
