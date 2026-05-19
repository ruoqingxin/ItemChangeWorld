/**
 * 社交分页集合
 */
export class PageList<T> {
    /**
     * 储存分页数据
     */
    private _map = new Map<number, T[]>();

    private _array: T[] = [];
    private _dirty: boolean = false;
    /**
     * 所有分页数据集合
     */
    public get array() {
        if (this._dirty) {
            this._dirty = false;
            let arr: T[] = [];
            this._map.forEach((value, key, Map) => {
                arr.push(...value);
            })
            this._array = arr;
        }
        return this._array;
    }
    /**
     * 起始分页
     */
    private _startPage: number = 0;
    /**
     * 当前分页
     */
    private _pageIndex: number = 0;
    /**
     * 当前分页
     */
    public get pageIndex() {
        return this._pageIndex;
    }
    private _isFinished: boolean = false;
    /**
     * 标记分页是否结束
     */
    public get isFinished() {
        return this._isFinished;
    }
    private _pageSending = false;
    private _nextPageCallThis: Function;
    private _nextPageStartCall: (page: number) => void;
    private _nextPageEndCall: (page: number, data: T[]) => void;

    /**
     * 绑定翻页回调
     * @param callthis 
     * @param call 
     */
    bindNextPageCall(callthis: any, startCall: (page: number) => void, endCall: (page: number, data: T[]) => void) {
        this._nextPageCallThis = callthis;
        this._nextPageStartCall = startCall;
        this._nextPageEndCall = endCall;
    }

    /**
     * 开始分页
     * @param start 起始分页
     */
    public startPage(start: number = 0) {
        this._isFinished = false;
        this._startPage = start;
        this._pageIndex = start;
        this._pageSending = false;
        if (this._nextPageStartCall) {
            this._nextPageStartCall.apply(this._nextPageCallThis, [this._pageIndex]);
        }
    }

    /**
     * 拉取下一页
     */
    public tryNextPage() {
        if (this._pageSending || this._pageIndex == 0 || this._map.size == 0) {
            return;
        }
        if (!this._isFinished && this._nextPageStartCall) {
            this._pageSending = true;
            this._nextPageStartCall.apply(this._nextPageCallThis, [this._pageIndex]);
        }
    }

    /**
     * 刷新当前所有页数据
     */
    public refreshPages() {
        const targetPage = this._pageIndex;
        this._pageIndex = this._startPage;
        for (let i = this._startPage; i < targetPage; i++) {
            if (this._nextPageStartCall) {
                this._nextPageStartCall.apply(this._nextPageCallThis, [i]);
            }
        }
    }

    /**
     * 刷新当前所有页数据
     */
    public refreshFinalPage() {
        if (this._pageIndex > 0) {
            this._pageIndex = this._pageIndex - 1;
            if (this._nextPageStartCall) {
                this._nextPageStartCall.apply(this._nextPageCallThis, [this._pageIndex]);
            }
        }
    }

    /**
     * 进行翻页，同时标记是否结束
     * @param page 页数
     * @param finished 是否结束
     */
    public onNextPage(page: number, data: T[], finished: boolean) {
        if (page == -1) {
            page = this._pageIndex;
        }
        // 防止分页被重复记录
        if (this._pageIndex != page) {
            return;
        }
        this._map.set(page, data);
        this._dirty = true;

        if (this._pageIndex == this._startPage) {
            this._array.length = 0;
        }

        this._array.push(...data);
        this._isFinished = finished || data.length == 0;

        if (this._isFinished) {
            // 清理多余数据
            Array.from(this._map.keys()).forEach(key => {
                if (key > page) {
                    this._map.delete(key);
                }
            });
        }
        this._pageIndex++;
        this._pageSending = false;
        if (this._nextPageEndCall) {
            this._nextPageEndCall.apply(this._nextPageCallThis, [page, data]);
        }
    }
}