import { IitemConfig } from "src/script/config/schema";
import { UIUtils } from "src/script/games/utils/UIUtils";
import { ItemDisplayUtil } from "../util/ItemDisplayUtil";
import { OpenGridPlacement } from "../util/OpenGridUtil";

/** 单格边长，与 itemCell 预制 1x1 尺寸一致 */
export const OPEN_ITEM_CELL_SIZE = 139;

/**
 * 物品格子（基于 itemCell 预制：img_mask / img_search / img_item）
 */
export class UIOpenItemCell {
    readonly root: Laya.GWidget;
    readonly placement: OpenGridPlacement;

    private _imgItem: Laya.GImage;
    private _imgMask: Laya.GImage;
    private _imgSearch: Laya.GImage;
    private _revealed = false;
    private _searchComplete: () => void;
    /** 绕中心公转一圈的时长（毫秒） */
    private static readonly ORBIT_PERIOD_MS = 900;
    private _orbitAngle = 0;
    private _orbitCenterX = 0;
    private _orbitCenterY = 0;
    private _orbitRadius = 0;
    private _orbitRunning = false;

    constructor(parent: Laya.GWidget, placement: OpenGridPlacement, template: Laya.GWidget) {
        this.placement = placement;
        const cellW = placement.colSpan * OPEN_ITEM_CELL_SIZE;
        const cellH = placement.rowSpan * OPEN_ITEM_CELL_SIZE;

        const cell = UIUtils.instantiateUINode(template) as Laya.GWidget;
        cell.name = `itemCell_${placement.row}_${placement.col}`;
        cell.anchorX = 0;
        cell.anchorY = 0;
        cell.size(cellW, cellH);
        cell.pos(placement.col * OPEN_ITEM_CELL_SIZE, placement.row * OPEN_ITEM_CELL_SIZE);
        cell.visible = true;

        this._imgItem = cell.getChildByName("img_item") as Laya.GImage;
        this._imgMask = cell.getChildByName("img_mask") as Laya.GImage;
        this._imgSearch = cell.getChildByName("img_search") as Laya.GImage;
        this._layoutSearchIcon(cellW, cellH);

        parent.addChild(cell);
        this.root = cell;
        this.showIdleMask();
    }

    bind(itemCfg: IitemConfig, count: number = 1): void {
        ItemDisplayUtil.applyItemCell(this.root, itemCfg);
    }

    /** 初始/等待：仅黑色遮罩 */
    showIdleMask(): void {
        this.stopSearch();
        this._revealed = false;
        this._imgMask.visible = true;
        this._imgSearch.visible = false;
        this._setItemContentVisible(false);
    }

    /** 当前格搜索：遮罩 + 搜索图标绕格子中心公转 */
    playSearch(durationMs: number, onComplete: () => void): void {
        this.stopSearch();
        this._revealed = false;
        this._imgMask.visible = true;
        this._imgSearch.visible = true;
        this._setItemContentVisible(false);
        this._imgSearch.rotation = 0;
        this._startSearchOrbit();
        this._searchComplete = onComplete;
        Laya.timer.once(durationMs, this, this._handleSearchComplete);
    }

    private _handleSearchComplete(): void {
        this._stopSearchOrbit();
        const cb = this._searchComplete;
        this._searchComplete = null;
        cb?.();
    }

    /** 搜索完成，展示物品 */
    reveal(): void {
        if (this._revealed) {
            return;
        }
        this._revealed = true;
        this.stopSearch();
        this._imgMask.visible = false;
        this._imgSearch.visible = false;
        this._setItemContentVisible(true);
        this._imgItem.alpha = 0;
        this._imgItem.scale(0.82, 0.82);
        Laya.Tween.to(this._imgItem, { alpha: 1, scaleX: 1, scaleY: 1 }, 220, Laya.Ease.backOut);
    }

    stopSearch(): void {
        this._stopSearchOrbit();
        Laya.timer.clear(this, this._handleSearchComplete);
        this._searchComplete = null;
        Laya.Tween.clearAll(this._imgItem);
        Laya.Tween.clearAll(this._imgSearch);
    }

    destroy(): void {
        this.stopSearch();
        this.root.removeSelf();
        this.root.destroy();
    }

    private _layoutSearchIcon(cellW: number, cellH: number): void {
        if (!this._imgSearch) {
            return;
        }
        this._orbitCenterX = cellW / 2;
        this._orbitCenterY = cellH / 2;
        this._orbitRadius = Math.min(cellW, cellH) * 0.08;
        this._imgSearch.pos(this._orbitCenterX, this._orbitCenterY);
    }

    /** 搜索图标绕 itemCell 中心做小圆周运动（自身不旋转） */
    private _startSearchOrbit(): void {
        this._stopSearchOrbit();
        this._orbitAngle = 0;
        this._orbitRunning = true;
        this._updateSearchOrbit();
        Laya.timer.frameLoop(1, this, this._updateSearchOrbit);
    }

    private _updateSearchOrbit(): void {
        if (!this._orbitRunning || !this._imgSearch) {
            return;
        }
        this._orbitAngle += (360 / UIOpenItemCell.ORBIT_PERIOD_MS) * Laya.timer.delta;
        if (this._orbitAngle >= 360) {
            this._orbitAngle -= 360;
        }
        const rad = this._orbitAngle * Math.PI / 180;
        this._imgSearch.pos(
            this._orbitCenterX + this._orbitRadius * Math.cos(rad),
            this._orbitCenterY + this._orbitRadius * Math.sin(rad)
        );
    }

    private _stopSearchOrbit(): void {
        this._orbitRunning = false;
        Laya.timer.clear(this, this._updateSearchOrbit);
        if (this._imgSearch) {
            this._imgSearch.rotation = 0;
            this._imgSearch.pos(this._orbitCenterX, this._orbitCenterY);
        }
    }

    private _setItemContentVisible(visible: boolean): void {
        this._imgItem.visible = visible;
        const imgIcon = this.root.getChildByName("img_icon") as Laya.GImage;
        if (imgIcon) {
            imgIcon.visible = visible && !!imgIcon.src;
        }
        const txtCount = this.root.getChildByName("txt_count") as Laya.GTextField;
        if (txtCount) {
            txtCount.visible = visible && !!txtCount.text;
        }
    }
}
