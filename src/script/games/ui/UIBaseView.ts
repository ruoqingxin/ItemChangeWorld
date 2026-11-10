import { AssetRequest } from "../asset/AssetRequest";
import { ResLoader } from "../asset/ResLoader";
import { UIElements } from "./UIElements";
import { UILayer } from "./UILayer";
import { UIManager } from "./UIManager";
import { SoundManager } from "src/script/games/sound/SoundManager";
import EventEngine from "src/script/games/eventSystem/EventEngine";
import { UIUtils } from "src/script/games/utils/UIUtils";
import { ErrorReportManager } from "../report/ErrorReportManager";
import { MapperTypeEnum } from "./components/ElementMapper";
import { UIViewportLayout } from "./UIViewportLayout";
/**
 * ui界面基类
 */
export abstract class UIBaseView {
    private _id: number;
    /**
     * 当前界面的id，只有子界面会被赋予id
     */
    public get id() {
        return this._id;
    }
    /**
     * 标识当前界面是否处于首次onOpen期间
     */
    private _isOpening;
    /**
     * 标识当前界面是否处于首次onOpen期间
     */
    protected get isOpening() {
        return this._isOpening;
    }
    private _opened: boolean = false;
    /**
     * 业务层设置的显示状态
     */
    private _manualActive: boolean = true;
    /**
     * 全屏遮挡系统设置的显示状态
     */
    private _fullscreenActive: boolean = true;
    private _constructed: boolean = false;
    private _view: Laya.GWidget;
    /**
     * 界面本体
     */
    public get view() {
        return this._view;
    }
    protected elems: UIElements = null;
    /**
     * ui节点关联
     */
    public get uiElement() {
        return this.elems;
    }
    /**
     * 标记当前界面是否打开，且界面节点已创建
     */
    public get isOpened() {
        return this._opened && this._view != null;
    }
    /**
     * 标记当前界面是否打开或正在打开
     */
    public get isOpenedOrOpening() {
        return this._opened;
    }
    private _lastCloseTimeAt: number = 0;
    /**
     * 界面最近一次关闭的时间
     * Laya.Browser.now()
     */
    public get lastCloseTimeAt() {
        return this._lastCloseTimeAt;
    }

    public set lastCloseTimeAt(v) {
        this._lastCloseTimeAt = v;
    }

    /**
     * 父界面
     */
    protected _parentView: UIBaseView = null;
    /**
     * 父界面根节点名称
     */
    private _panelRootName: string = null;
    /**
     * 标记当前打开界面是否是异步
     */
    private _asyncOpen: boolean = false;
    /**
     * 异步打开界面的请求
     */
    private _uiRequest: AssetRequest = null;
    /**
     * 当前界面排序
     */
    private _sortingOrder: number = -1;
    /**
     * 当前界面排序
     */
    public get sortingOrder() {
        return this._sortingOrder;
    }
    /** 同层级内的显示优先级，值越大越靠上。 */
    public get stackPriority(): number {
        return 0;
    }
    /**
     * 界面mapper类型
     */
    public get mapperType() {
        return this.elems?.mapperType;
    }
    /**
     * 全屏界面的首屏内容是否已经可以展示。
     * 返回 false 时 UIManager 暂不隐藏下层界面。
     */
    public get isFullscreenReady() {
        return true;
    }
    /**
     * 统计按钮绑定数量
     */
    private _listenerCnt: number = 0;
    /**
     * 界面打开音效
     */
    protected _openSound: string;
    /**
     * 界面关闭音效
     */
    protected _closeSound: string;
    /**
     * 是否自动播放音效（默认 = true）
     */
    protected _autoSoundPlay: boolean = true;
    /**
     * 关闭自动销毁
     */
    protected _autoDestroyOnClose: boolean = false;
    /**
     * 关闭自动销毁
     */
    public get autoDestroyOnClose() {
        return this._autoDestroyOnClose;
    }
    /**
     * 父节点
     */
    protected _parent: Laya.GWidget = null;
    /**
     * 界面打开回调
     */
    private _openCallback: (param?: UIBaseView) => void;
    /**
     * 界面关闭回调
     */
    private _closeCallback: (param?: UIBaseView) => void;
    private _closeAnimationCallback: (() => void) | null = null;
    private _closeInProgress = false;
    /** 关闭动画尚未结束时，界面仍可能可见，不能作为闲置缓存回收。 */
    public get isClosing(): boolean {
        return this._closeInProgress;
    }
    /**
     * 是否有关闭回调
     */
    public get hasCloseCallback() {
        return this._closeCallback != null;
    }
    /**
     * 界面打开动画
     */
    private _windowAnimator: Laya.Animator2D;
    /**
     * 界面打开动画
     */
    public get windowAnimator() {
        return this._windowAnimator;
    }
    protected _autoCollect: boolean = true;
    /**
     * 界面是否自动回收资源 默认 = true
     */
    public get autoCollect() {
        return this._autoCollect;
    }
    /**
     * 界面关闭特殊动画
     */
    private _windowAnimatorOut: (callback: () => void) => void;
    /**
    * 界面关闭动画播放
    */
    public set windowAnimatorOut(v: (callback: () => void) => void) {
        this._windowAnimatorOut = v;
    }
    /**
     * 界面打开的参数缓存
     */
    private _openArgs: any[];
    /**
     * 关联的事件列表
     */
    private _eventRegister: { eventId: number, func: Function }[];
    /**
     * 计时器保护字典
     */
    private _timerRegister: { [key: string]: any } = {};

    /**
     * 界面是否是横屏模式
     */
    private _isHor: boolean = false;

    /**
     * 为界面设置父界面
     * @param parentView 夫界面
     * @param panelRootName 父节点
     */
    setParentView(parentView: UIBaseView, panelRootName: string) {
        this._parentView = parentView;
        this._panelRootName = panelRootName;
    }
    /**
     * 设置父节点
     * @param parent 父节点
     */
    setParent(parent: Laya.GWidget) {
        this._parent = parent;
    }

    /**
     * 设置界面id
     * @param id 唯一id 
     */
    setViewId(id: number) {
        this._id = id;
    }

    /**
     * 设置下一次界面打开回调
     * @param cb 回调函数
     */
    setOpenCallback(cb: (param?: any) => void) {
        if (this.isOpened) {
            cb(this);
        }
        else {
            this._openCallback = cb;
        }
    }

    /**
     * 设置下一次界面关闭回调
     * @param cb 回调函数
     */
    setCloseCallback(cb: (param?: any) => void) {
        this._closeCallback = cb;
    }

    private _loadingTestTime: number = 0;
    public createForm() {
        if (this._uiRequest != null || this._view != null) {
            return;
        }
        const depList = this.dependencyRes;
        const requestList = [this.path];
        if (depList) {
            requestList.push(...depList);
        }
        this._loadingTestTime = new Date().getTime();
        this._uiRequest = ResLoader.createAssetsRequest(requestList);
        ResLoader.beginAssetRequest(this._uiRequest, this, this._onCreate);
    }

    private _onCreate(request: AssetRequest) {
        let useLoadingTime = new Date().getTime() - this._loadingTestTime;
        if (useLoadingTime > 300) {
            console.warn("界面加载总时间：" + this.path + " 时间：" + useLoadingTime);
        }
        this._uiRequest = null;
        if (request.error != null) {
            Laya.timer.clear(this, this.createForm);
            Laya.timer.once(1000, this, () => {
                console.warn("界面加载失败，重试：" + this.path + " error:" + request.error);
                this.createForm();
            });
            return;
        }
        if (this._asyncOpen) {
            this._asyncOpen = false;
            if (this._parentView == null) {
                UIManager.ins()._onFormAsyncLoad(this);
            }
        }
        try {
            let asset = ResLoader.getAsset(this.path);
            asset.autoCollect = true;
            // 处理elementmapper
            let prefab = asset.instantiate() as Laya.GWidget;
            this._view = prefab;
            this._windowAnimator = prefab.getComponent<Laya.Animator2D>(Laya.Animator2D);
            prefab.drawCallOptimize = true;
            this.elems = new UIElements(prefab, asset);
            let panelRoot: Laya.GWidget = null;
            if (this._parentView == null) {
                if (this.mapperType == MapperTypeEnum.MaskWithClose) {
                    this._view.mouseThrough = true;
                }
                else if (this.mapperType == MapperTypeEnum.NoMaskWithThrough) {
                    this._view.mouseThrough = true;
                }
                else {
                    this._view.mouseThrough = false;
                }
                panelRoot = this._parent;
            }
            else {
                if (null != this._panelRootName) {
                    panelRoot = this._parentView.elems.getElement(this._panelRootName, false);
                    if (panelRoot && panelRoot.parent == this._parentView.view) {
                        panelRoot.anchor(0, 0);
                        panelRoot.pos(0, 0);
                        panelRoot.makeFullSize();
                        panelRoot.clearRelations();
                        panelRoot.addRelation(this._parentView.view, Laya.RelationType.Size);
                        panelRoot.mouseThrough = true;
                    }
                }
                if (panelRoot == null) {
                    panelRoot = this._parentView._view;
                }
                this._view.mouseThrough = true;
            }
            panelRoot.addChild(this._view);
            this._view.makeFullSize();
            this._view.clearRelations();
            this._view.addRelation(panelRoot, Laya.RelationType.Size);
            const background = this.elems.getElement<Laya.GImage>("screenBackground", false);
            if (background instanceof Laya.GImage) UIViewportLayout.coverBackground(background, this._view);
            if (this._opened) {
                this._manualActive = true;
                this._fullscreenActive = true;
                this.applyMergedActiveState();
                this.notifyOpen();
            }
            else {
                this._view.visible = false;
                this._view.active = false;
            }
        }
        catch (e) {
            this.close();
            console.error("界面加载失败：" + this.path);
            ErrorReportManager.ins().reportError(e);
        }
    }

    private notifyOpen() {
        if (!this._constructed) {
            this._constructed = true;
            this._internal_construct();
        }

        if (this._parentView == null) {
            UIManager.ins()._afterFormOpened(this);
        }
        if (this._openSound) {
            SoundManager.ins().playSound(this._openSound);
        }

        if (this.mapperType == MapperTypeEnum.NoMaskWithThrough) {
            Laya.stage.on(Laya.Event.MOUSE_UP, this, this.close);
        }

        this._isOpening = true;
        this._internal_open();
        this._isOpening = false;

        const callback = this._openCallback;
        this._openCallback = null;
        if (callback) {
            callback(this);
        }
    }
    open(...args) {
        if (this._closeInProgress) this.closeImmediately();
        if (args && args.length > 0) {
            this._openArgs = args;
        }
        else {
            this._openArgs = null;
        }
        if (this._opened == true) {
            this.processOpenedAlready();
            return;
        }
        this._opened = true;
        this._asyncOpen = this._uiRequest != null;

        if (this._parentView == null) {
            UIManager.ins()._onFormOpen(this, this._asyncOpen);
        }
        else {
            if (this._parentView._view == null) {
                console.warn("界面在父界面没有打开时，无法调用open函数");
                return;
            }
        }

        if (this._view != null) {
            this._manualActive = true;
            this._fullscreenActive = true;
            this.applyMergedActiveState();
            this.notifyOpen();
        }
    }
    /**
     * 通过点击遮罩关闭，主动关闭请勿调用
     */
    public closeByMask() {
        this.close();
    }
    /**
     * 关闭界面
     */
    public close() {
        if (this._opened == false) {
            return;
        }
        this._opened = false;
        this._closeInProgress = true;
        this._openArgs = null;
        this._lastCloseTimeAt = Laya.Browser.now();

        if (this._asyncOpen) {
            if (this._parentView == null) {
                UIManager.ins()._onFormAsyncLoad(this);
            }
            this._asyncOpen = false;
        }

        Laya.timer.clearAll(this);
        this._timerRegister = {};
        if (this.mapperType == MapperTypeEnum.NoMaskWithThrough) {
            Laya.stage.off(Laya.Event.MOUSE_UP, this, this.close);
        }

        if (this._uiRequest != null) {
            this._uiRequest.abort();
            this._uiRequest = null;
        }
        if (this._eventRegister) {
            for (let _info of this._eventRegister) {
                EventEngine.unregisterEvent(_info.eventId, this, _info.func);
            }
            this._eventRegister = null;
        }

        if (null != this._view) {
            if (this._closeSound) {
                SoundManager.ins().playSound(this._closeSound);
            }
        }
        if (this._parentView == null) {
            if (this._autoSoundPlay && this.layer >= UILayer.HighBase && this.layer <= UILayer.OnlyTip) {
                SoundManager.ins().stopSound(SoundManager.COMMON_CLICK_SOUND);
                SoundManager.ins().playSound(SoundManager.COMMON_CLOSE_SOUND);
            }
        }

        /*关闭动画关闭后回调 */
        const animOutBack = () => {
            if (this._closeAnimationCallback !== animOutBack) {
                return;
            }
            this._closeAnimationCallback = null;
            try {
                if (null != this._view) {
                    // onClose may close an owned popup and reenter fullscreen visibility updates.
                    this._manualActive = false;
                    this._view.active = false;
                    this._view.visible = false;
                    this._internal_close();
                }

                if (this._parentView == null) {
                    UIManager.ins()._onFormClose(this);
                }
            }
            finally {
                this._closeInProgress = false;
            }
        }

        this._closeAnimationCallback = animOutBack;
        /*特殊关闭动画*/
        if (this._windowAnimatorOut) {
            this._windowAnimatorOut(() => {
                animOutBack();
            });
        }
        else {
            //通用关闭动画
            this.playElementAnimOut(() => {
                animOutBack();
            });
        }


        const callback = this._closeCallback;
        this._closeCallback = null;
        if (callback) {
            callback(this);
        }
    }

    /** 切场时立即完成关闭，先执行 onClose 释放模型和事件，再销毁界面。 */
    public closeImmediately(): void {
        this.close();
        if (this._closeAnimationCallback) {
            this.killAllElementAnim();
            this._closeAnimationCallback?.();
        }
    }

    /**
     * 内部使用，请勿调用
     */
    _destroy() {
        this.closeImmediately();
        this._uiRequest?.abort();
        this._uiRequest = null;
        Laya.timer.clearAll(this);
        this._openCallback = null;
        this._closeCallback = null;
        this._openArgs = null;
        this.killAllElementAnim();
        if (!this._view) {
            return;
        }
        this._view.destroy();
        this._view = null;
        this._windowAnimator = null;
        this.elems = null;
        this._constructed = false;
        this.onRelease();
    }

    protected processOpenedAlready() {
        if (this._view != null) {
            if (this._parentView == null) {
                UIManager.ins()._afterFormOpened(this);
            }
            this._manualActive = true;
            this._fullscreenActive = true;
            this.applyMergedActiveState();
            this._internal_open();
        }
    }

    private _removeOldTimer(callback: () => void, key: string) {
        if (!Object.getPrototypeOf(this).hasOwnProperty(callback.name)) {
            const old = this._timerRegister[key];
            if (old) {
                Laya.timer.clear(this, old);
            }
            this._timerRegister[key] = callback;
        }
    }

    /**
     * 添加单次计时器
     * 匿名函数必须添加一个计时器key 否则只运行创建一个，新的会覆盖旧的
     * @param delta 时间间隔（毫秒）
     * @param callback 回调函数
     */
    public addOnceTimer(delta: number, callback: () => void, key: string = "default"): void {
        this._removeOldTimer(callback, key);
        Laya.timer.once(delta, this, callback);
    }

    /**
     * 添加循环计时器
     * 匿名函数必须添加一个计时器key 否则只运行创建一个，新的会覆盖旧的
     * @param delta 时间间隔（毫秒）
     * @param callback 回调函数
     */
    public addLoopTimer(delta: number, callback: () => void, key: string = "default"): void {
        this._removeOldTimer(callback, key);
        Laya.timer.loop(delta, this, callback);
    }
    /**
     * 清除计时器
     * @param callback 回调函数 
     */
    public removeTimer(callback: () => void) {
        Laya.timer.clear(this, callback);
    }

    /**
     * 内部使用
     */
    protected _internal_construct() {
        this.onConstruct();
    }

    /**
     * 内部使用
     */
    protected _internal_open() {
        if (!this._eventRegister) {
            this.onRegisterEvent();
        }
        if (this._openArgs && this._openArgs.length > 0) {
            this.onOpen(...this._openArgs);
        }
        else {
            this.onOpen();
        }
        this._internal_checkRedDot();
        this.killAllElementAnim();
        this.playElementAnim();
    }

    /**
     * 内部使用
     */
    protected _internal_close() {
        this.onClose();
    }

    /**
     * 内部使用 
     */
    _internal_checkRedDot() {
        this.onRedDotChange();
    }

    /**
     * 当前界面所处层级
     */
    public abstract get layer(): UILayer;
    /**
     * 当前界面资源路径
     */
    public abstract get path(): string;
    /**
     * 当前界面创建时调用
     */
    protected abstract onConstruct();
    /**
     * 当前界面打开时调用(请勿直接使用参数列表，请明确定义具体类型)
     */
    abstract onOpen(...args);
    /**
     * 当界面注册事件时调用
     */
    onRegisterEvent() { };
    /**
     * 当前界面关闭时调用
     */
    protected abstract onClose();

    /**
     * 红点变化时调用
     */
    protected onRedDotChange() { }

    /**
     * 界面刷新，不会自动执行
     */
    public updateView() { };

    /**
     * 当前界面销毁时调用
     */
    protected onRelease() { };

    /**
     * 获取关联资源，子类可重载此方法，用于预加载一些资源
     */
    protected get dependencyRes(): string[] {
        return null;
    }
    /** 首屏异步内容加载完成后，刷新全屏遮挡状态。 */
    protected notifyFullscreenReady(): void {
        UIManager.ins()._onFormFullscreenReady(this);
    }
    /**
    * 绑定按钮点击，caller不需要使用delegate来封装，在函数内部已实现
    * @param element 节点
    * @param callback 回调函数
    * @param clickSound 点击音效 默认 = SoundID.SYS_BTNCLICK
    */
    protected addClickListener(element: Laya.Sprite, callback: (...args) => void, clickSound: string = SoundManager.COMMON_CLICK_SOUND, ...args) {
        this._listenerCnt++;
        return UIUtils.addClickListener(element, this, callback, clickSound, ...args);
    }

    /**
     * 绑定点击，内部不播放音效
     * @param element 节点
     * @param callback 回调函数
     */
    protected addMuteClickListener(element: Laya.Sprite, callback: (...args) => void, ...args) {
        UIUtils.addClickListener(element, this, callback, null, ...args);
        this._listenerCnt++;
    }

    /**
     * 从当前界面获得一个指定名称节点
     * @param name 节点名称
     * @returns 节点
     */
    public getElement<T extends Laya.Sprite = Laya.Sprite>(name: string, showTips: boolean = true) {
        return this.elems.getElement<T>(name, showTips);
    }

    /**
     * 注册事件
     * @param eventId 事件id
     * @param func 方法
     */
    public registerEvent(eventId: number, func: Function) {
        if (!this._eventRegister) {
            this._eventRegister = [];
        }
        let _info = { eventId: eventId, func: func };
        // 如果事件已经注册，则不重复注册
        if (this._eventRegister.find(e => e.eventId === eventId)) {
            return;
        }
        this._eventRegister.push(_info);
        EventEngine.registerEvent(eventId, this, func);
    }

    /**
     * 设置界面朝向
     * @param isHor 是否横向
     * @param anim 是否过渡动画
     */
    public setDirection(isHor: boolean, anim: boolean) {
        if (!this.elems) return;
        const elementMapper = this.elems.elementMapper;
        if (!elementMapper) {
            return;
        }
        this._isHor = isHor;
        elementMapper.setDirection(isHor, anim);
    }

    /**动态设置横屏部分节点 横屏位置不统一情况*/
    public setHorizontalNodes(nodes: Laya.GWidget[]) {
        if (!this.elems) return;
        const elementMapper = this.elems.elementMapper;
        if (!elementMapper) {
            return;
        }
        elementMapper.setHorizontalNodes(nodes);
    }

    /**动态设置竖屏部分节点 节点动态变化情况*/
    public setVerticalNodeInfos(nodes: { name: string, x: number, y: number }[]) {
        if (!this.elems) return;
        const elementMapper = this.elems.elementMapper;
        if (!elementMapper) {
            return;
        }
        elementMapper.setVerticalNodeInfos(nodes);
    }

    /**设置适配节点*/
    public SetAdapterNodes(force: boolean = false) {
        if (!this.elems) return;
        const elementMapper = this.elems.elementMapper;
        if (!elementMapper) {
            return;
        }
        elementMapper.SetAdapterNodes(force);
    }

    /**
     * 播放元素动画
     */
    public playElementAnim(useOnEnable: boolean = true) {
        if (!this.elems) return;
        this._resetElementAnim();
        /** 横屏动画 */
        if (this.elems.elementAnimInHor && this._isHor) {
            if (!useOnEnable || this.elems.elementAnimInHor.playOnEnable) {
                this.elems.elementAnimInHor.play();
            }
            return;
        }

        const elementAnimList = this.elems.elementAnimList;
        if (!elementAnimList || elementAnimList.length <= 0) {
            return;
        }
        for (let i = 0; i < elementAnimList.length; i++) {
            const animScript = elementAnimList[i];
            if (!useOnEnable || animScript.playOnEnable) {
                animScript.play();
            }
        }
    }

    /**
     * 界面关闭时播放元素动画
     */
    public playElementAnimOut(onComplete?: () => void) {
        if (!this.elems) {
            if (onComplete) {
                onComplete();
            }
            return;
        };

        const elementAnimOutList = this.elems.elementAnimOutList;
        if (!elementAnimOutList || elementAnimOutList.length <= 0) {
            if (onComplete) {
                onComplete();
            }
            return;
        }
        let remaining = elementAnimOutList.length;
        for (let i = 0; i < elementAnimOutList.length; i++) {
            const animScript = elementAnimOutList[i];
            let completed = false;
            animScript.play(() => {
                if (completed) return;
                completed = true;
                if (--remaining === 0) onComplete?.();
            });
        }
    }

    /**
     * 杀死所有元素动画
     */
    public killAllElementAnim() {
        if (!this.elems) return;
        this._resetElementAnim();
        const elementAnimList = this.elems.elementAnimList;
        if (elementAnimList) {
            for (let i = 0; i < elementAnimList.length; i++) {
                const animScript = elementAnimList[i];
                animScript.clearAllTweens();
            }
        }

        const elementAnimInHor = this.elems.elementAnimInHor;
        if (elementAnimInHor) {
            elementAnimInHor.clearAllTweens();
        }

        const elementAnimOutList = this.elems.elementAnimOutList;
        if (elementAnimOutList) {
            for (let i = 0; i < elementAnimOutList.length; i++) {
                const animScript = elementAnimOutList[i];
                animScript.clearAllTweens();
            }
        }
    }

    /**重置动画节点 */
    private _resetElementAnim() {
        if (!this.elems) return;
        const elementAnimList = this.elems.elementAnimList;
        if (elementAnimList) {
            for (let i = 0; i < elementAnimList.length; i++) {
                const animScript = elementAnimList[i];
                animScript.resetNode();
            }
        }

        const elementAnimOutList = this.elems.elementAnimOutList;
        if (elementAnimOutList) {
            for (let i = 0; i < elementAnimOutList.length; i++) {
                const animScript = elementAnimOutList[i];
                animScript.resetNode();
            }
        }

    }



    /**
     * 设置界面层级
     * @param order 
     */
    public setSortingOrder(order: number) {
        this._sortingOrder = order;
        if (this._view) {
            this._view.zOrder = order;
        }
    }

    /**
     * 设置界面是否显示
     * @param active 是否显示
     */
    public setActive(active: boolean) {
        this._manualActive = active;
        this.applyMergedActiveState();
    }

    /**
     * 设置全屏遮挡系统显示状态（仅供UIManager调用）
     * @param active 是否显示
     */
    public setFullscreenActive(active: boolean) {
        this._fullscreenActive = active;
        this.applyMergedActiveState();
    }

    /**
     * 合并业务态与全屏态，得到最终显示状态
     */
    private applyMergedActiveState() {
        if (!this._view) {
            return;
        }
        const active = (this._opened || this._closeInProgress) && this._manualActive && this._fullscreenActive;
        this._view.active = active;
        this._view.visible = active;
    }
}
