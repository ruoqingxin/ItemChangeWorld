import { ElementAnimHelper, ElementAnimInBase, ElementAnimMenuGroup } from "./ElementAnimTypes";

const { regClass, classInfo, property } = Laya;

enum ListStaggerMode {
    Item = 0,
    Row = 1,
}

interface ListItemTargetInfo {
    node: Laya.Sprite;
    y: number;
    alpha: number;
}

@regClass()
@classInfo({
    menu: `${ElementAnimMenuGroup.In},4`,
    caption: "列表错峰",
})
export class ElementAnimListStaggerUp extends ElementAnimInBase {
    @property({ type: [Laya.GList], tips: "列表节点，子项会逐个向上快速划入" })
    public lists: Laya.GList[] = [];

    @property({ type: Number, defaultValue: 0, tips: "起始延迟(ms)" })
    public delay: number = 0;

    @property({ type: Number, defaultValue: 200, tips: "列表子项起始Y偏移(px)" })
    public itemOffsetY: number = 200;

    @property({ type: Number, defaultValue: 75, tips: "列表子项逐项延迟(ms)" })
    public interval: number = 75;

    @property(ListStaggerMode)
    public staggerMode: ListStaggerMode = ListStaggerMode.Item;

    @property({ type: Number, defaultValue: 2, tips: "逐行分组Y容差(px)" })
    public rowTolerance: number = 2;

    @property({ type: Number, defaultValue: 130, tips: "列表子项动画时长(ms)" })
    public itemDuration: number = 130;

    @property({ type: Boolean, defaultValue: true, tips: "启用时自动播放" })
    public playOnEnable: boolean = true;


    /**控制list首次有数据的变化才播放动画 */
    private _playedOnFirstDataChange = false;
    private _playRunId = 0;
    private _itemTargetInfoList: ListItemTargetInfo[] = [];
    private _lockedScrollerStates = new Map<Laya.GList, { touchEffect: Laya.ScrollTouchEffect; mouseWheelDisabled: boolean }>();

    onEnable(): void {
        this._playedOnFirstDataChange = false;
        this._setListArrayChangeEvent(true);
    }

    onDisable(): void {
        this.clearAllTweens();
        this.resetNode();
        Laya.timer.clearAll(this);
        this.restoreListScrolling();
        this._setListArrayChangeEvent(false);
        this._playedOnFirstDataChange = false;
    }

    private _setListArrayChangeEvent(bool: boolean) {
        for (let i = 0; i < this.lists.length; i++) {
            const list = this.lists[i];
            if (!list) {
                continue;
            }
            if (bool) {
                list.on(Laya.Event.CHANGE, this, this.play);
            } else {
                list.off(Laya.Event.CHANGE, this, this.play);
            }
        }
    }
    resetNode(): void {
        for (let i = 0; i < this._itemTargetInfoList.length; i++) {
            const info = this._itemTargetInfoList[i];
            if (info.node.destroyed) continue;
            info.node.y = info.y;
            info.node.alpha = info.alpha;
        }
    }

    public play(): void {
        if (this._playedOnFirstDataChange) {
            return;
        }
        this.clearAllTweens();
        this._itemTargetInfoList.length = 0;
        this._playRunId++;
        const runId = this._playRunId;
        const validLists: Laya.GList[] = [];
        for (let i = 0; i < this.lists.length; i++) {
            const list = ElementAnimHelper.asList(this.lists[i]);
            if (!list) {
                continue;
            }
            validLists.push(list);
            if (list.numItems > 0) {
                this._playedOnFirstDataChange = true;
            }
        }
        if (validLists.length <= 0) {
            return;
        }
        this.lockListScrolling(validLists);
        let pendingListCount = validLists.length;
        let maxAnimDuration = 0;
        for (let i = 0; i < validLists.length; i++) {
            const list = validLists[i];
            // 列表一般在设置 array 后下一帧创建可见子项
            Laya.timer.frameOnce(1, this, () => {
                if (runId !== this._playRunId) {
                    return;
                }
                const duration = this.playSingleList(list);
                if (duration > maxAnimDuration) {
                    maxAnimDuration = duration;
                }
                pendingListCount--;
                if (pendingListCount <= 0) {
                    Laya.timer.once(maxAnimDuration + 16, this, this.tryRestoreListScrolling, [runId]);
                }
            });
        }
    }

    private playSingleList(list: Laya.GList): number {
        const items: Laya.Sprite[] = [];
        for (let i = 0; i < list.numChildren; i++) {
            const item = ElementAnimHelper.asSprite(list.getChildAt(i));
            if (!item) {
                continue;
            }
            items.push(item);
        }

        if (this.staggerMode === ListStaggerMode.Row) {
            return this.playByRow(items);
        }

        for (let i = 0; i < items.length; i++) {
            this.playItem(items[i], this.delay + i * this.interval);
        }
        if (items.length <= 0) {
            return 0;
        }
        return this.delay + (items.length - 1) * this.interval + this.itemDuration;
    }

    private playByRow(items: Laya.Sprite[]): number {
        const rows = this.groupByRows(items);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
            const rowDelay = this.delay + rowIndex * this.interval;
            const rowItems = rows[rowIndex];
            for (let i = 0; i < rowItems.length; i++) {
                this.playItem(rowItems[i], rowDelay);
            }
        }
        if (rows.length <= 0) {
            return 0;
        }
        return this.delay + (rows.length - 1) * this.interval + this.itemDuration;
    }

    private groupByRows(items: Laya.Sprite[]): Laya.Sprite[][] {
        if (!items || items.length <= 0) {
            return [];
        }
        const sorted = items.slice().sort((a, b) => {
            if (a.y === b.y) {
                return a.x - b.x;
            }
            return a.y - b.y;
        });
        const rows: Laya.Sprite[][] = [];
        let currentRow: Laya.Sprite[] = [];
        let rowBaseY = sorted[0].y;
        for (let i = 0; i < sorted.length; i++) {
            const item = sorted[i];
            if (currentRow.length <= 0) {
                currentRow.push(item);
                rowBaseY = item.y;
                continue;
            }
            if (Math.abs(item.y - rowBaseY) <= this.rowTolerance) {
                currentRow.push(item);
                continue;
            }
            rows.push(currentRow);
            currentRow = [item];
            rowBaseY = item.y;
        }
        if (currentRow.length > 0) {
            rows.push(currentRow);
        }
        return rows;
    }

    private playItem(item: Laya.Sprite, delay: number): void {
        const targetY = item.y;
        this._itemTargetInfoList.push({ node: item, y: targetY, alpha: item.alpha });
        item.y = targetY + this.itemOffsetY;
        item.alpha = 0;
        Laya.Tween.create(item, this)
            .delay(delay)
            .duration(this.itemDuration)
            .ease(Laya.Ease.strongOut)
            .to("y", targetY)
            .to("alpha", 1);
    }

    public clearAllTweens(): void {
        ElementAnimHelper.clearTweens(this);
    }

    private lockListScrolling(lists: Laya.GList[]): void {
        for (let i = 0; i < lists.length; i++) {
            const list = lists[i];
            if (!list?.scroller) {
                continue;
            }
            if (!this._lockedScrollerStates.has(list)) {
                this._lockedScrollerStates.set(list, {
                    touchEffect: list.scroller.touchEffect,
                    mouseWheelDisabled: list.scroller.mouseWheelDisabled,
                });
            }
            list.scroller.touchEffect = Laya.ScrollTouchEffect.Off;
            list.scroller.mouseWheelDisabled = true;
        }
    }

    private tryRestoreListScrolling(runId: number): void {
        if (runId !== this._playRunId) {
            return;
        }
        this.restoreListScrolling();
    }

    private restoreListScrolling(): void {
        this._lockedScrollerStates.forEach((state, list) => {
            if (!list?.scroller) {
                return;
            }
            list.scroller.touchEffect = state.touchEffect;
            list.scroller.mouseWheelDisabled = state.mouseWheelDisabled;
        });
        this._lockedScrollerStates.clear();
    }
}
