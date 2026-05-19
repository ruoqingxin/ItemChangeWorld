
import { ListItemCtrl } from "./ListItemCtrl.js";
import { UIUtils } from "../utils/UIUtils.js";
import { ErrorReportManager } from "../report/ErrorReportManager.js";
import { SoundManager } from "../sound/SoundManager.js";

declare type TLayaListCell<I> = Laya.GWidget & { listItem: I };
declare type TLayaList<I> = Laya.GList & { children: TLayaListCell<I>[] };
export declare type ListParameters<T extends (data: any, index: number, ...args: any) => any> = T extends (data: any, index: number, ...args: infer P) => any ? P : never;
/**
 * 列表容器类
 * 选中效果 在需要处理选中效果的节点上，设置c1 ， 0 = 未选中， 1 = 选中
 */
export class List<R extends ListItemCtrl, I extends ListItem<R> = ListItem<R>, D = Parameters<R['update']>[0]> {
    private _layalist: TLayaList<I>;
    public get rootNode(): Laya.GList {
        return this._layalist;
    }
    private _selectIndex: number = -1;
    private _itemCtrl: new (rootNode: Laya.GWidget) => R = null;
    /**
     * 组件控制器
     */
    set itemCtrl(t: new () => R) {
        this._itemCtrl = t;
    }
    private _onClickThis: any;
    /**
     * 点击回调，必须在赋值array前赋值，否则无效
     */
    private _onClickItem: (index: number, ctrl: R) => void;
    private _onClickSound: string;

    private _onRenderThis: any;
    /**
     * 更新回调，必须在赋值array前赋值，否则无效
     */
    private _onRenderItem: (index: number, ctrl: R) => void;
    private _everVirtualSet = false;

    /**
     * 数据变化时自动选中新的并滚动到对应位置
     */
    public autoSelectOnChange = true;
    /**
     * 是否是虚拟列表 默认 = 是
     */
    public isVirtual: boolean = true;

    constructor(layalist: Laya.GList) {
        this._layalist = layalist as TLayaList<I>;
        if (this._layalist.scroller) {

        }
        this._layalist.itemRenderer = (index: number, item: any) => {
            try {
                this._onUpdateListItem(index, item);
            }
            catch (e) {
                ErrorReportManager.ins().reportError(e);
            }
        };
    }

    /**
     * 修改选中下标
     * @param value 下标
     */
    private _changeSelected(value: number) {
        let allCells = this._layalist.children;
        for (let cell of allCells) {
            let listItem = cell.listItem;
            if (listItem) {
                listItem.selected = listItem._index == value;
            }
        }
        this._selectIndex = value;
    }


    private _onSelectListItem(index: number) {
        this._changeSelected(index);
    }

    /**
     * 设置列表点击回调
     * @param callthis this
     * @param func 回调函数
     * @param clickSound 点击音效 默认 = SoundID.SYS_BTNCLICK
     */
    public setClickListener(callthis: any, func: (index: number, ctrl: R) => void, clickSound: string = SoundManager.COMMON_CLICK_SOUND) {
        this._onClickThis = callthis;
        this._onClickItem = func;
        this._onClickSound = clickSound;
    }

    /**
     * 设置列表刷新回调
     * 用于在列表刷新到指定位置时，做一些自定义逻辑的行为
     * @param callthis this
     * @param func 回调函数
     */
    public setRenderListener(callthis: any, func: (index: number, ctrl: R) => void) {
        this._onRenderThis = callthis;
        this._onRenderItem = func;
    }

    /**
     * 元素被点击回调
     * @param listItem 元素
     */
    private _onClickListItem(listItem: I) {
        if (this._layalist.selection.mode != Laya.SelectionMode.None) {
            this._onSelectListItem(listItem._index);
        }
        if (this._onClickItem) {
            this._onClickItem.apply(this._onClickThis, [listItem._index, listItem._itemCtrl]);
        }
    }

    /**
     * laya glist更新元素回调
     * @param cell 
     * @param index 
     */
    private _onUpdateListItem(index: number, cell: TLayaListCell<I>) {
        let listItem = cell.listItem;
        if (!listItem) {
            listItem = cell.listItem = new ListItem(cell) as I;
        }
        listItem._index = index;
        listItem.selected = this._selectIndex == index;

        if (this._itemCtrl) {
            if (!listItem._itemCtrl) {
                listItem._itemCtrl = new this._itemCtrl(listItem.rootNode);
                listItem._itemCtrl
                listItem._itemCtrl.setComponents(cell, index, ...this._initParam);
                if (this._onClickItem) {
                    UIUtils.addClickListener(cell, this, this._onClickListItem, this._onClickSound, listItem);
                }
            }
            listItem._itemCtrl.update(this.array[index], index, ...this._updateParam);

            if (this._onRenderItem) {
                this._onRenderItem.apply(this._onRenderThis, [listItem._index, listItem._itemCtrl]);
            }
        }
    }
    private _array: D[];
    /**
     * 设置元数据，列表立即刷新
     */
    set array(value: D[]) {
        if (!value) {
            value = [];
        }
        const preSelected = this.selectedItem;
        this._array = value;

        // 设置数据前，更新一次虚拟列表标记
        if (!this._everVirtualSet) {
            this._everVirtualSet = true;
            if (this.isVirtual && this._layalist.scroller) {
                this._layalist.setVirtual();
            }
        }
        this._layalist.numItems = value.length;

        if (value && this.autoSelectOnChange && preSelected && preSelected != this.selectedItem) {
            const newSelect = value.indexOf(preSelected);
            if (newSelect > -1) {
                this.selected = newSelect;
                this.scrollToSelected();
            }
        }
    }
    /**
     * 获取元数据，未设置则返回 null
     */
    get array(): D[] {
        return this._array;
    }

    /**
     * 获取数据源长度
     */
    get arrayLen() {
        return this._array ? this._array.length : 0;
    }

    /**
     * 设置选中位置
     */
    set selected(value: number) {
        this._changeSelected(value);
    }

    /**
     * 获取当前选中位置
     */
    get selected() {
        return this._selectIndex;
    }

    /**
     * 获取当前选中的元素
     */
    get selectedItem() {
        if (this._array) {
            return this._array[this._selectIndex];
        }
        return null;
    }


    /**
     * 滚动到当前选中对象
     * @param ani 是否开启动画
     */
    scrollToSelected(ani: boolean = true) {
        if (this._layalist.scroller) {
            this._layalist.scroller.scrollTo(Math.max(0, this.selected), ani)
        }
    }

    /**
     * 滚动至目标item
     * @param index item索引
     * @param ani 是否开启动画
     */
    scrollTo(index: number, ani: boolean = true) {
        if (this._layalist.scroller) {
            this._layalist.scroller.scrollTo(Math.min(this.arrayLen - 1, Math.max(0, index)), ani)
        }
    }

    /**
     * 滚动到顶部
     * @param ani 是否开启动画
     */
    scrollTop(ani: boolean = false) {
        if (this._layalist.scroller) {
            this._layalist.scroller.scrollTop(ani);
        }
    }

    /**
     * 滚动到底部
     * @param ani 是否开启动画
     */
    scrollBottom(ani: boolean = false) {
        if (this._layalist.scroller) {
            this._layalist.scroller.scrollBottom(ani);
        }
    }

    private _updateParam: ListParameters<R['update']> = [] as ListParameters<R['update']>;
    /**
     * 设置更新参数
     * @param args 参数列表
     */
    setUpdateParam(...args: ListParameters<R['update']>) {
        this._updateParam = args;
    }

    private _initParam: ListParameters<R['setComponents']> = [] as ListParameters<R['setComponents']>;
    /**
     * 设置构造初始化参数
     * @param args 参数列表
     */
    setInitParam(...args: ListParameters<R['setComponents']>) {
        this._initParam = args;
    }

    /**
     * 获取所有ctrl控制组件
     * @returns 
     */
    getItemCtrlList(): R[] {
        let cells = this._layalist.children;
        const outArr = [];
        for (let i = 0, len = cells.length; i < len; i++) {
            if (cells[i]?.listItem?._itemCtrl) {
                if (cells[i].listItem._index < this._array.length) {
                    outArr.push(cells[i].listItem._itemCtrl);
                }
            }
        }
        return outArr;
    }

    /**
     * 获取子节点控制器
     * @param index 子节点下标
     * @returns 
     */
    getItemCtrl(index: number) {
        let cell = this._layalist.children[index];
        return cell?.listItem?._itemCtrl;
    }

    /**
     * 获取子节点
     * @param index 子节点下标
     */
    getChildNode(index: number) {
        return this._layalist.getChildAt(index) as Laya.GWidget;
    }

    /**
     * 仅刷新当前显示的数据
     */
    public refresh() {
        if (this.isVirtual && this._layalist.scroller) {
            if (this._array && this._array.length > 0) {
                this._layalist.refreshVirtualList();
            }
        }
        else {
            this.array = this._array;
        }
    }

    /**
     * 设置列表是否显示
     * @param value 是否
     */
    setActive(value: boolean) {
        this._layalist.visible = value;
        this._layalist.active = value;
    }
}

class ListItem<T extends ListItemCtrl> {
    public _index: number;
    public _itemCtrl: T;
    public get rootNode() {
        return this._rootNode;
    }
    constructor(protected _rootNode: Laya.GWidget) {

    }
    public set selected(value: boolean) {
        UIUtils.setNodeCtrlStatus(this._rootNode, value ? 1 : 0);
    }
}