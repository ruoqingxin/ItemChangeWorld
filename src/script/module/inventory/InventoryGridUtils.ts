import { IInventoryItemRuntime } from "./InventoryTypes";

export interface IGridPlacement {
    x: number;
    y: number;
}

/**
 * 局内背包占格工具。
 * 固定网格，不支持旋转。
 */
export class InventoryGridUtils {
    static canPlace(
        width: number,
        height: number,
        items: IInventoryItemRuntime[],
        x: number,
        y: number,
        itemWidth: number,
        itemHeight: number,
    ): boolean {
        if (x < 0 || y < 0 || x + itemWidth > width || y + itemHeight > height) {
            return false;
        }

        for (let row = y; row < y + itemHeight; row++) {
            for (let col = x; col < x + itemWidth; col++) {
                if (this.isCellOccupied(items, col, row)) {
                    return false;
                }
            }
        }

        return true;
    }

    static findFirstSlot(
        width: number,
        height: number,
        items: IInventoryItemRuntime[],
        itemWidth: number,
        itemHeight: number,
    ): IGridPlacement | null {
        for (let y = 0; y <= height - itemHeight; y++) {
            for (let x = 0; x <= width - itemWidth; x++) {
                if (this.canPlace(width, height, items, x, y, itemWidth, itemHeight)) {
                    return { x, y };
                }
            }
        }

        return null;
    }

    private static isCellOccupied(items: IInventoryItemRuntime[], x: number, y: number): boolean {
        return items.some(item => {
            return (
                x >= item.x &&
                x < item.x + item.width &&
                y >= item.y &&
                y < item.y + item.height
            );
        });
    }
}
