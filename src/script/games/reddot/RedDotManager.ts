import { BaseClass } from "../common/BaseClass";
import { UIManager } from "../ui/UIManager";
import { RedDotBase } from "./RedDotBase";
/**
 * 红点更新系统
 */
export class RedDotManager extends BaseClass {
    /**
     * 所有的TipMark列表
     */
    private _redDots: RedDotBase[] = [];
    /**
     * 需要判断的事件列表
     */
    private _events: number[] = [];
    /**
     * 上一次检查红点时间
     */
    private _lastCheckTimeAt: number;
    /**
     * 事件与红点的关联
     */
    private _eventWithRedDots: { [e: number]: RedDotBase[] } = {};
    /**
     * 功能id与红点的关联
     */
    private _redDotIdMap: { [id: number]: RedDotBase } = {};

    /**
     * 注册红点
     * @param redDot 红点对象
     */
    registerRedDot(redDot: RedDotBase): void {
        if (this._redDots.indexOf(redDot) != -1) {
            return;
        }
        // 将自定义红点对象全部加入数组
        if (this._redDotIdMap[redDot.id]) {
            console.error('红点控制器因id重复被覆盖:', redDot.constructor.name);
        }
        this._redDotIdMap[redDot.id] = redDot;
        this._redDots.push(redDot);

        if (redDot.connectedEvents) {
            for (let e of redDot.connectedEvents) {
                let array = this._eventWithRedDots[e];
                if (!array) {
                    array = this._eventWithRedDots[e] = [];
                }
                array.push(redDot);
            }
        }
    }

    /**
     * 将事件派发给红点系统
     * @param e 事件id
     * @returns 
     */
    onEvent(e: number): void {
        if (this._events.indexOf(e) > -1) {
            return;
        }
        this._events.push(e);
    }

    /**
     * 更新红点系统
     * @returns 
     */
    onUpdate(): void {
        if (this._events.length == 0) {
            return;
        }
        let time = Laya.Browser.now();
        if (time - this._lastCheckTimeAt < 0.3) {
            return;
        }
        this._lastCheckTimeAt = time;

        let updatedTipMarks = [];
        for (let e of this._events) {
            let array = this._eventWithRedDots[e];
            if (!array) {
                continue;
            }
            for (let tipMark of array) {
                if (updatedTipMarks.indexOf(tipMark) == -1) {
                    updatedTipMarks.push(tipMark);
                    tipMark._check();
                }
            }
        }
        this._events = [];
        UIManager.ins()._onRedDotChange();
    }

    /**
     * 检查所有红点
     */
    checkAll() {
        for (let tip of this._redDots) {
            tip._check();
        }
    }
}