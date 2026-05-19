import { IitemConfig } from "src/script/config/schema";
import { ItemDisplayUtil } from "../util/ItemDisplayUtil";

/** 格子尺寸，与 UIOpenView 预制 box 内占位一致 */
export const OPEN_ITEM_CELL_SIZE = 139;

/**
 * 搜打撤物品格子（品质框 + 图标 + 数量）
 */
export class UIOpenItemCell {
    readonly root: Laya.GWidget;

    constructor(parent: Laya.GWidget, index: number) {
        const col = index % 5;
        const row = Math.floor(index / 5);
        const cell = new Laya.GWidget();
        cell.name = `item_cell_${index}`;
        cell.size(OPEN_ITEM_CELL_SIZE, OPEN_ITEM_CELL_SIZE);
        cell.pos(col * OPEN_ITEM_CELL_SIZE, row * OPEN_ITEM_CELL_SIZE);

        const imgQuality = new Laya.GImage();
        imgQuality.name = "img_quality";
        imgQuality.size(OPEN_ITEM_CELL_SIZE, OPEN_ITEM_CELL_SIZE);
        imgQuality.autoSize = false;
        cell.addChild(imgQuality);

        const iconSize = 110;
        const iconPad = (OPEN_ITEM_CELL_SIZE - iconSize) / 2;
        const imgIcon = new Laya.GImage();
        imgIcon.name = "img_icon";
        imgIcon.size(iconSize, iconSize);
        imgIcon.pos(iconPad, iconPad);
        imgIcon.autoSize = false;
        cell.addChild(imgIcon);

        const txtCount = new Laya.GTextField();
        txtCount.name = "txt_count";
        txtCount.fontSize = 22;
        txtCount.color = "#ffffff";
        txtCount.stroke = 2;
        txtCount.strokeColor = "#000000";
        txtCount.align = "right";
        txtCount.valign = "bottom";
        txtCount.size(OPEN_ITEM_CELL_SIZE - 8, 32);
        txtCount.pos(4, OPEN_ITEM_CELL_SIZE - 36);
        txtCount.visible = false;
        cell.addChild(txtCount);

        parent.addChild(cell);
        this.root = cell;
    }

    bind(itemCfg: IitemConfig, count: number = 1): void {
        ItemDisplayUtil.applyItemCell(this.root, itemCfg, count);
    }

    setEmpty(): void {
        this.root.visible = false;
    }

    destroy(): void {
        this.root.removeSelf();
        this.root.destroy();
    }
}
