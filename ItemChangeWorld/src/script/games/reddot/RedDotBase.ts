
import { BaseClass } from "../common/BaseClass";
import { FuncChecker } from "../FuncChecker";

/**
 * 红点对象基类
 */
export abstract class RedDotBase extends BaseClass {
    /**
     * 关联的唯一功能id
     */
    private _id: number;
    /**
     * 关联的唯一功能id
     */
    public get id(): number {
        return this._id;
    }
    /**
     * 红点数量
     */
    private _dotCnt = 0;
    /**
     * 红点数量
     */
    public get dotCnt() {
        return this._dotCnt;
    }
    /**
     * 红点是否激活
     */
    public get actived() {
        return this._dotCnt > 0;
    }
    /**
     * 指定功能ID（非强制）
     * @param id 功能ID
     */
    constructor(id: number = 0) {
        super();
        this._id = id;
    }
    private _connectedEvents: number[];
    /**
     * 关联事件列表
     */
    public get connectedEvents(): number[] {
        return this._connectedEvents;
    }



    /**
     * 内部使用 检查红点逻辑
     */
    _check() {
        if (this._id <= 0 || FuncChecker.isFuncAvailable(this._id)) {
            this._dotCnt = this.doCheck();
        }
        else {
            this._dotCnt = 0;
        }
    }

    /**
     * 设置关联的事件列表
     */
    setConnectedEvents(...events: number[]) {
        this._connectedEvents = events;
    }

    /**
     * 检查红点逻辑，返回 > 0则标记红点生效
     */
    protected abstract doCheck(): number;
}