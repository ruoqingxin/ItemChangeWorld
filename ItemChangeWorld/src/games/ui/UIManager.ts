import { UIBaseView } from "./UIBaseView";
import { UILayer } from "./UILayer";
import { UIUtils } from "src/script/sfgames/utils/UIUtils";
import { UIEvents } from "./UIEvnets";
import { MapperTypeEnum } from "./components/ElementMapper";
import { UIRotateLoadingTipsView } from "src/script/module/tips/view/UIRotateLoadingTipsView";
import { TabFormSearcher } from "./TabCtrl";

export type UIOpenParameters<T extends (...args: any) => any> = T extends (...args: infer P) => any ? P : never;
/**
 * ui管理器
 * 派发事件
 * FullscreenChange
 */
export class UIManager extends Laya.EventDispatcher {
    private static _ins: UIManager;
    /**
     * 获取单例
     * @returns 
     */
    static ins() {
        if (!this._ins) {
            this._ins = new UIManager();
        }
        return this._ins;
    }
    /**
     * 界面缓存过期时间，关闭后大于这个时间将被删除
     */
    public readonly viewCacheExpireTime: number = 5000;

    /**
     * id与界面类型的字典
     */
    private _viewTypeMap: { [funcId: number]: { viewClass: new () => UIBaseView, argv?: any[] } } = {};
    /**
     * 界面类型与id的字典
     */
    private _viewIdMap: Map<new () => UIBaseView, number> = new Map();
    /**
     * tab子界面类型注册
     */
    private _tabSubViewTypeMap: {
        [funcId: number]: {
            baseId: number,
            viewClass: new () => UIBaseView,
            redDotVisibleGetter?: () => boolean
        }
    } = {};
    /**
     * 打开的界面类型列表
     */
    private _openedViewTypes: (new () => UIBaseView)[] = [];
    /**
     * 打开的界面实体列表
     */
    private _openedViewList: UIBaseView[] = [];
    /**
     * 当前打开的界面堆栈
     */
    private _openstacks: { [index: number]: Array<UIBaseView> } = {};
    /**
     * 异步加载中的界面数量
     */
    private _asyncOpenCnt: number = 0;
    /**
     * ui根节点
     */
    private _uiRoot: Laya.GWidget = null;
    /**
     * ui根节点
     */
    public get uiRoot() {
        return this._uiRoot;
    }
    /**
     * 标记当前是否显示适配遮罩
     */
    private _isAdapterMaskActive: boolean;
    /**
     * 标记当前是否显示适配遮罩
     */
    public get isAdapterMaskActive() {
        return this._isAdapterMaskActive;
    }
    private _topFullScreenView: UIBaseView;
    /**
     * 当前的顶部全屏界面
     */
    public get topFullScreenView() {
        return this._topFullScreenView;
    }
    /**
     * 点击遮罩
     */
    private _mask: Laya.GImage = null;
    /**
     * 具有mask层的顶部界面
     */
    private _topMaskView: UIBaseView;
    /**
     * 标记当前资源准备是否完毕
     */
    public isReady: boolean;

    /**
     * 当前是否是横屏模式
     */
    private _isHor: boolean;

    /**
     * 初始化ui管理器
     */
    public init() {
        for (let i = 0; i < UILayer.Max; i++) {
            this._openstacks[i] = [];
        }

        this._uiRoot = new Laya.GWidget();
        this._uiRoot.name = "adapter";
        Laya.GRoot.inst.addChild(this._uiRoot);

        // 创建左右遮罩图
        const leftMask = new Laya.GWidget();
        leftMask.name = "leftMask";
        leftMask.graphics.drawRect(0, 0, 1, 1, "#000000", null, 1, true);

        const rightMask = new Laya.GWidget();
        rightMask.name = "rightMask";
        rightMask.graphics.drawRect(0, 0, 1, 1, "#000000", null, 1, true);

        Laya.GRoot.inst.addChild(leftMask);
        Laya.GRoot.inst.addChild(rightMask);

        console.log("Laya.stage.width:" + Laya.stage.width);
        console.log("Laya.stage.height:" + Laya.stage.height);

        // stage变化时，调整ui适配
        const autoSize = () => {
            let designWidth = Laya.stage.designWidth;
            let designHeight = Laya.stage.designHeight;
            if (Laya.stage.width / Laya.stage.height > designWidth / designHeight) {
                this._uiRoot.height = Laya.stage.height;
                this._uiRoot.width = (designWidth / designHeight) * Laya.stage.height;
                const widthOffset = (Laya.stage.width - this._uiRoot.width) / 2;
                this._uiRoot.pos(widthOffset, 0);

                UIUtils.setActive(leftMask, true);
                UIUtils.setActive(rightMask, true);
                leftMask.size(widthOffset, this._uiRoot.height);
                rightMask.size(widthOffset, this._uiRoot.height);
                leftMask.pos(0, 0);
                rightMask.pos(widthOffset + this._uiRoot.width, 0);
                this._isAdapterMaskActive = true;
            }
            else {
                // 限制最高
                const limit = 720 / 1660;
                if (Laya.stage.width / Laya.stage.height < limit) {
                    this._uiRoot.width = Laya.stage.width;
                    this._uiRoot.height = Laya.stage.width / limit;

                    const heightOffset = (Laya.stage.height - this._uiRoot.height) / 2;
                    this._uiRoot.pos(0, heightOffset);

                    UIUtils.setActive(leftMask, true);
                    UIUtils.setActive(rightMask, true);
                    leftMask.size(this._uiRoot.width, heightOffset);
                    rightMask.size(this._uiRoot.width, heightOffset);
                    leftMask.pos(0, 0);
                    rightMask.pos(0, heightOffset + this._uiRoot.height);
                    this._isAdapterMaskActive = true;
                }
                else {
                    this._uiRoot.pos(0, 0);
                    this._uiRoot.makeFullSize();
                    UIUtils.setActive(leftMask, false);
                    UIUtils.setActive(rightMask, false);
                    this._isAdapterMaskActive = false;
                }
            }
            this.event(Laya.Event.RESIZE);
        }
        autoSize();
        Laya.stage.on(Laya.Event.RESIZE, autoSize);


        this._uiRoot.mouseThrough = true;

        this._mask = new Laya.GImage();
        this._mask.name = "mask";
        this._mask.zOrder = 0;
        this._mask.mouseEnabled = true;
        this._uiRoot.addChild(this._mask);
        this._mask.makeFullSize(this._uiRoot);
        this._mask.addRelation(this._uiRoot, Laya.RelationType.Size);

        this._mask.graphics.drawRect(0, 0, 1, 1, "#000000e0", null, 1, true);
        UIUtils.addClickListener(this._mask, this, this._onClickMask);
        UIUtils.setActive(this._mask, false);
    }

    /**
     * 内部使用 检查刘海屏适配
     * @param value 首次检查标记
     */
    public _checkSafeArea(value: boolean) {
    }

    /**
     * 注册界面
     * @param id 界面id
     * @param viewclass 界面实际类型
     * @param argv 注册默认启动参数列表
     */
    public registerForm(id: number, viewclass: new () => UIBaseView, ...argv) {
        if (this._viewTypeMap[id]) {
            console.error("界面已注册：" + id);
            return;
        }
        this._viewTypeMap[id] = {
            viewClass: viewclass,
            argv: argv,
        };
        this._viewIdMap.set(viewclass, id);
    }

    /**
     * 注册tab子界面
     * @param id 子界面唯一id（通常使用功能id）
     * @param viewclass 子界面实际类型
     * @param redDotVisibleGetter 子界面红点显示检查
     */
    public registerTabSubView(
        id: number,
        viewclass: new () => UIBaseView,
        baseId?: number,
        redDotVisibleGetter?: () => boolean
    ) {
        if (this._tabSubViewTypeMap[id]) {
            console.error("tab子界面已注册：" + id);
            return;
        }
        this._tabSubViewTypeMap[id] = {
            baseId: baseId || 0,
            viewClass: viewclass,
            redDotVisibleGetter: redDotVisibleGetter,
        };
    }

    /**
     * 获取注册的tab子界面id列表
     * @param baseViewClass 已注册父界面类型
     */
    public getTabSubViewIdList(baseViewClass: new () => UIBaseView): number[] {
        const baseId = this._getViewId(baseViewClass);
        if (baseId <= 0) {
            return [];
        }
        const idList: number[] = [];
        for (const key in this._tabSubViewTypeMap) {
            const id = parseInt(key);
            const define = this._tabSubViewTypeMap[id];
            if (!define) {
                continue;
            }
            if (baseId == 0 || define.baseId != baseId) {
                continue;
            }
            idList.push(id);
        }
        return idList;
    }

    /**
     * 获取界面注册id
     * @param viewClass 已注册界面类型
     */
    private _getViewId(viewClass: new () => UIBaseView): number {
        const viewId = this._viewIdMap.get(viewClass);
        return viewId || 0;
    }

    /**
     * 获取tab子界面类型
     * @param id 子界面唯一id
     */
    public getTabSubViewClass<T extends UIBaseView>(id: number): new () => T {
        const define = this._tabSubViewTypeMap[id];
        if (!define) {
            return null;
        }
        return define.viewClass as new () => T;
    }

    /**
     * 获取tab子界面红点状态
     * @param id 子界面唯一id
     */
    public getTabSubViewRedDotVisible(id: number): boolean {
        const define = this._tabSubViewTypeMap[id];
        if (!define || !define.redDotVisibleGetter) {
            return false;
        }
        return !!define.redDotVisibleGetter();
    }

    /**
     * 通关功能id打开界面
     * @param id 功能id
     * @param argv 额外参数
     * @returns 界面
     */
    public openFormById(id: number, ...argv) {
        let viewDefine = this._viewTypeMap[id];
        if (!viewDefine) {
            const tabSubDefine = this._tabSubViewTypeMap[id];
            if (tabSubDefine && tabSubDefine.baseId > 0) {
                const baseViewDefine = this._viewTypeMap[tabSubDefine.baseId];
                if (!baseViewDefine) {
                    console.error("tab子界面父界面未注册：" + tabSubDefine.baseId + "，子界面：" + id);
                    return null;
                }
                const openArgv = [id, ...argv];
                return this.openForm(baseViewDefine.viewClass, ...openArgv);
            }
        }
        if (!viewDefine) {
            console.error("界面未注册：" + id);
            return null;
        }
        const openArgv = argv.length > 0 ? argv : (viewDefine.argv || []);
        let view = this.openForm(viewDefine.viewClass, ...openArgv);
        return view;
    }

    /**
     * 打开一个指定界面
     * @param viewclass 界面类型
     * @returns 界面类
     */
    public openForm<T extends UIBaseView>(viewclass: new () => T, ...argv: UIOpenParameters<T['onOpen']>): T {
        let index = this._openedViewTypes.indexOf(viewclass);
        if (index == -1) {
            this._openedViewTypes.push(viewclass);
            let form = (new (viewclass as any)()) as UIBaseView;
            this._openedViewList.push(form);
            form.setParent(this._uiRoot);
            form.createForm();
            if (argv && argv.length > 0) {
                form.open(...argv);
            }
            else {
                form.open();
            }
            return form as any;
        }
        let form = (this._openedViewList[index] as any) as T;
        form.createForm();
        if (argv && argv.length > 0) {
            form.open(...argv);
        }
        else {
            form.open();
        }
        return form;
    }

    /**
     * 缓存一个指定界面（不打开）
     * @param viewclass 界面类型
     * @returns 界面类
     */
    public cacheForm<T extends UIBaseView>(viewclass: new () => T): T {
        let index = this._openedViewTypes.indexOf(viewclass);
        if (index == -1) {
            this._openedViewTypes.push(viewclass);
            let form = (new (viewclass as any)()) as UIBaseView;
            this._openedViewList.push(form);
            form.setParent(this._uiRoot);
            form.createForm();
            return form as any;
        }
        let form = (this._openedViewList[index] as any) as T;
        form.createForm();
        return form;
    }


    /**
     * 打开一个指定界面
     * @param viewclass 界面类型
     * @param callback 界面打开回调函数
     * @returns 界面类
     */
    public openFormWithCallback<T extends UIBaseView>(viewclass: new () => T, callback: (param: any) => void, ...argv: UIOpenParameters<T['onOpen']>): T {
        const form = this.openForm(viewclass, ...argv);
        if (form.isOpened) {
            if (callback) {
                callback(form);
            }
        }
        else {
            form.setOpenCallback(callback);
        }
        return form;
    }

    /**
     * 获取一个已打开的界面，如果界面未打开，则返回null
     * @param formclass 界面类型
     * @returns 界面实体
     */
    public getForm<T extends UIBaseView>(formclass: new () => T): T {
        let index = this._openedViewTypes.indexOf(formclass);
        if (index === -1) {
            for (let i = 0, len = this._openedViewList.length; i < len; i++) {
                const parentForm = this._openedViewList[i];
                if (!parentForm || !parentForm.isOpened) {
                    continue;
                }
                if (!this._isTabFormSearcher(parentForm)) {
                    continue;
                }
                const subForm = parentForm.getTabFormByClass(formclass);
                if (subForm && subForm.isOpened) {
                    return subForm;
                }
            }
            return null;
        }
        let form = this._openedViewList[index] as UIBaseView;
        if (form.isOpened) {
            return form as any;
        }
        return null;
    }

    private _isTabFormSearcher(view: UIBaseView): view is UIBaseView & TabFormSearcher {
        if (!view) {
            return false;
        }
        const searcher = view as Partial<TabFormSearcher>;
        return typeof searcher.getTabFormByClass === "function";
    }

    /**
     * 关闭界面
     * @param formclass 界面类型
     */
    public closeForm<T extends UIBaseView>(formclass: new () => T): void {
        let index = this._openedViewTypes.indexOf(formclass);
        if (index === -1) {
            return;
        }
        let form = this._openedViewList[index] as UIBaseView;
        if (form != null) {
            form.close();
        }
    }

    /**
     * 关闭某个层级所有界面
     * @param layer 界面层级
     * @returns 
     */
    public closeLayerForms(layer: UILayer) {
        let forms = this._openstacks[layer];
        if (!forms) {
            return;
        }
        const viewList = Array.from(forms);
        for (let form of viewList) {
            form.close();
        }
        forms.length = 0;
    }

    /**
     * 立即清除所有已关闭界面
     */
    public clearAllInstant() {
        // 只处理second层级的ui
        // for (let form of this._openedViewList) {
        //     if (form.layer != UILayer.Second) {
        //         continue;
        //     }
        //     if (!form.lastCloseTimeAt || form.isOpened) {
        //         continue;
        //     }
        //     form.lastCloseTimeAt = Laya.Browser.now() - this.viewCacheExpireTime - 10;
        // }

        // this.onUpdate();
    }

    /**
     * 是否有任意一个界面正打开
     * @param layer 界面层级
     * @returns 
     */
    isAnyFormOpenedInLayer(layer: UILayer): boolean {
        let forms = this._openstacks[layer];
        return forms && forms.length > 0;
    }

    /**
     * 是否有任意一个界面正打开
     * @param excludedForm 排除掉的界面组
     * @param excludedLayers 排除掉的层级组
     */
    isAnyFormOpenedBut(excludedForms: UIBaseView[], includedLayers: UILayer[]): boolean {
        for (let layer of includedLayers) {
            let forms = this._openstacks[layer];
            for (let form of forms) {
                if (!form.isOpened || (null != excludedForms && excludedForms.indexOf(form) >= 0)) {
                    continue;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * 内部使用
     */
    _onFormOpen(form: UIBaseView, ansyc: boolean): void {
        if (ansyc) {
            // isReady 防止加载过程中出现遮罩
            if (this._asyncOpenCnt == 0 && this.isReady) {
                this.openForm(UIRotateLoadingTipsView, "加载中...");
            }
            this._asyncOpenCnt++;
        }
        let layer = form.layer;
        let group = this._openstacks[layer];
        const oldIndex = group.indexOf(form);
        if (oldIndex != -1) {
            group.splice(oldIndex, 1);
        }
        group.push(form);
    }

    /**
     * 内部使用
     */
    _onFormAsyncLoad(form: UIBaseView) {
        this._asyncOpenCnt--;
        if (this._asyncOpenCnt == 0) {
            this.closeForm(UIRotateLoadingTipsView);
        }
        //uts.log("remove form:" + form.Name);
    }

    /**
     * 内部使用
     */
    _afterFormOpened(form: UIBaseView) {
        form.setDirection(this._isHor, false);

        // 更新同层级界面，将即将打开的界面置顶
        {
            let layer = form.layer;
            let group = this._openstacks[layer];
            const oldIndex = group.indexOf(form);
            if (oldIndex == -1) {
                console.error("form after open error：" + form.path);
                return;
            }
            let sortingIndex = 0;
            for (const check of group) {
                check.setSortingOrder(layer * 100 + sortingIndex * 10);
                sortingIndex++;
            }
        }
        if (form.mapperType == MapperTypeEnum.Fullscreen && form.fullscreenBgNode) {
            form.fullscreenBgNode.off(Laya.Event.LOADED, this, this._updateFullScreenHide);
            form.fullscreenBgNode.on(Laya.Event.LOADED, this, this._updateFullScreenHide);
        }

        this._updateFullScreenHide();
        // 更新界面mask
        this._updateTopMaskTypeView();
    }

    /**
     * 内部使用
     */
    _onFormClose(form: UIBaseView): void {
        let layer = form.layer;
        let group = this._openstacks[layer];

        let index = group.indexOf(form);
        if (index >= 0) {
            group.splice(index, 1);
            if (form.autoDestroyOnClose) {
                this._destroyView(form);
            }
        }
        if (form.mapperType == MapperTypeEnum.Fullscreen && form.fullscreenBgNode) {
            form.fullscreenBgNode.off(Laya.Event.LOADED, this, this._updateFullScreenHide);
        }
        this._updateFullScreenHide();
        // 更新界面mask
        this._updateTopMaskTypeView();
    }


    /**
     * 内部使用 红点变化时调用
     */
    _onRedDotChange() {
        for (let indexKey in this._openstacks) {
            let forms = this._openstacks[indexKey];
            for (let form of forms) {
                if (!form.isOpened) {
                    continue;
                }
                form._internal_checkRedDot();
            }
        }
    }

    /**
     * 刷新全屏状态
     */
    private _updateFullScreenHide() {
        let fullScreenView: UIBaseView;
        for (let layer = UILayer.MessageBox; layer >= UILayer.Second; layer--) {
            let forms = this._openstacks[layer];
            for (let i = forms.length - 1; i >= 0; i--) {
                const form = forms[i];
                if (!form.isOpened) {
                    continue;
                }
                if (form.mapperType == MapperTypeEnum.Fullscreen && form.fullscreenBgNode
                    && (form.fullscreenBgNode.texture || !form.fullscreenBgNode.src)
                ) {
                    fullScreenView = form;
                    break;
                }
            }
            if (fullScreenView) {
                break;
            }
        }

        // 派发全屏变化通知
        for (let layer = UILayer.Second; layer >= UILayer.Base; layer--) {
            let forms = this._openstacks[layer];
            for (let i = forms.length - 1; i >= 0; i--) {
                const form = forms[i];
                if (!form.isOpened) {
                    continue;
                }
                let active = true;
                if (fullScreenView && fullScreenView != form) {
                    if (form.sortingOrder < fullScreenView.sortingOrder) {
                        active = false;
                    }
                }
                form.setFullscreenActive(active);
            }
        }
        if (this._topFullScreenView != fullScreenView) {
            this._topFullScreenView = fullScreenView;
            this.event(UIEvents.FormOpenClose);
        }
    }

    /**
     * 更新顶部mask界面
     */
    private _updateTopMaskTypeView() {
        let topView: UIBaseView;
        for (let layer = UILayer.Top; layer >= UILayer.Second; layer--) {
            let forms = this._openstacks[layer];
            for (let i = forms.length - 1; i >= 0; i--) {
                const form = forms[i];
                if (!form.isOpened) {
                    continue;
                }
                if (form.mapperType == MapperTypeEnum.MaskWithClose || form.mapperType == MapperTypeEnum.MaskWithoutClose) {
                    topView = form;
                    break;
                }
            }
            // 如果已经找到顶级界面则跳出循环
            if (topView) {
                break;
            }
        }
        if (topView) {
            UIUtils.setActive(this._mask, true);
            this._mask.zOrder = topView.sortingOrder - 1;
        }
        else {
            UIUtils.setActive(this._mask, false);
        }
        if (this._topMaskView != topView) {
            this._topMaskView = topView;
            this.event(UIEvents.FormOpenClose);
        }
    }

    private _onClickMask() {
        if (this._topMaskView) {
            this._topMaskView.closeByMask();
        }
        this._updateTopMaskTypeView();
    }

    /**
     * 设置ui是否是横屏模式
     * @param isHor 横屏模式
     */
    setDirection(isHor: boolean, anim: boolean = true) {
        this._isHor = isHor;
        for (let indexKey in this._openstacks) {
            let forms = this._openstacks[indexKey];
            for (let form of forms) {
                if (!form.isOpened) {
                    continue;
                }
                form.setDirection(isHor, anim);
            }
        }
    }

    private _destroyView(view: UIBaseView) {
        const index = this._openedViewList.indexOf(view);
        if (index == -1) {
            return;
        }
        this._openedViewTypes.splice(index, 1);
        this._openedViewList.splice(index, 1);
        view._destroy();
        // console.log("destroy view " + view.path);
    }

    /**
     * 任意计时器位置进行检查，自动删除无用界面
     */
    onUpdate() {
        // 检查过期界面
        let expiredList: UIBaseView[];
        const now = Laya.Browser.now();

        // 只检查second层级的过期ui
        for (let form of this._openedViewList) {
            if (form.layer != UILayer.Second) {
                continue;
            }
            if (!form.lastCloseTimeAt || form.isOpened) {
                continue;
            }
            if (now - form.lastCloseTimeAt > this.viewCacheExpireTime) {
                if (!expiredList) {
                    expiredList = [];
                }
                expiredList.push(form);
            }
        }

        if (expiredList && expiredList.length > 0) {
            for (const view of expiredList) {
                this._destroyView(view);
            }
        }
    }

}
