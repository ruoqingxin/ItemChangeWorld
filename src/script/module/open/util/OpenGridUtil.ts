/** 物品在搜索网格中的占位 */
export interface OpenGridPlacement {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
}

/**
 * 搜打撤搜索网格：根据 bag_size 计算占位并在固定列数内自动排布
 */
export class OpenGridUtil {
    /**
     * bag_size 映射为宽高（格数）
     * 1→1x1，2→1x2，3→1x3，4→2x2；更大尺寸优先竖向 1xn
     */
    static getSpanByBagSize(bagSize: number, colCount: number): { colSpan: number; rowSpan: number } {
        const size = Math.max(1, bagSize);
        switch (size) {
            case 1:
                return { colSpan: 1, rowSpan: 1 };
            case 2:
                return { colSpan: 1, rowSpan: 2 };
            case 3:
                return { colSpan: 1, rowSpan: 3 };
            case 4:
                return { colSpan: 2, rowSpan: 2 };
            default: {
                if (size <= colCount) {
                    return { colSpan: 1, rowSpan: size };
                }
                let colSpan = Math.min(colCount, Math.ceil(Math.sqrt(size)));
                while (colSpan > 1 && size % colSpan !== 0) {
                    colSpan--;
                }
                if (colSpan <= 0) {
                    colSpan = 1;
                }
                return { colSpan, rowSpan: Math.ceil(size / colSpan) };
            }
        }
    }

    /** 按顺序为每个 bag_size 在网格中找第一个可放置位置 */
    static layoutItems(bagSizes: number[], colCount: number): OpenGridPlacement[] {
        const occupied: boolean[][] = [];
        const result: OpenGridPlacement[] = [];

        for (const bagSize of bagSizes) {
            const { colSpan, rowSpan } = OpenGridUtil.getSpanByBagSize(bagSize, colCount);
            const pos = OpenGridUtil._findFirstSlot(occupied, colCount, colSpan, rowSpan);
            if (!pos) {
                console.warn(`[OpenGridUtil] 网格空间不足，bag_size=${bagSize}`);
                result.push({ col: 0, row: OpenGridUtil._maxRow(occupied) + 1, colSpan: 1, rowSpan: 1 });
                OpenGridUtil._occupy(occupied, 0, OpenGridUtil._maxRow(occupied) + 1, 1, 1);
                continue;
            }
            OpenGridUtil._occupy(occupied, pos.col, pos.row, colSpan, rowSpan);
            result.push({ col: pos.col, row: pos.row, colSpan, rowSpan });
        }
        return result;
    }

    static getRequiredRowCount(placements: OpenGridPlacement[]): number {
        if (placements.length === 0) {
            return 1;
        }
        let maxRow = 0;
        for (const p of placements) {
            maxRow = Math.max(maxRow, p.row + p.rowSpan);
        }
        return Math.max(1, maxRow);
    }

    private static _maxRow(occupied: boolean[][]): number {
        return Math.max(0, occupied.length - 1);
    }

    private static _ensureRows(occupied: boolean[][], row: number, colCount: number): void {
        while (occupied.length <= row) {
            occupied.push(new Array(colCount).fill(false));
        }
    }

    private static _occupy(
        occupied: boolean[][],
        col: number,
        row: number,
        colSpan: number,
        rowSpan: number
    ): void {
        for (let r = row; r < row + rowSpan; r++) {
            OpenGridUtil._ensureRows(occupied, r, occupied[0]?.length ?? 5);
            for (let c = col; c < col + colSpan; c++) {
                occupied[r][c] = true;
            }
        }
    }

    private static _canPlace(
        occupied: boolean[][],
        col: number,
        row: number,
        colSpan: number,
        rowSpan: number,
        colCount: number
    ): boolean {
        if (col + colSpan > colCount) {
            return false;
        }
        for (let r = row; r < row + rowSpan; r++) {
            OpenGridUtil._ensureRows(occupied, r, colCount);
            for (let c = col; c < col + colSpan; c++) {
                if (occupied[r][c]) {
                    return false;
                }
            }
        }
        return true;
    }

    private static _findFirstSlot(
        occupied: boolean[][],
        colCount: number,
        colSpan: number,
        rowSpan: number
    ): { col: number; row: number } | null {
        const startRow = occupied.length === 0 ? 0 : 0;
        for (let row = startRow; row < startRow + 32; row++) {
            for (let col = 0; col <= colCount - colSpan; col++) {
                if (OpenGridUtil._canPlace(occupied, col, row, colSpan, rowSpan, colCount)) {
                    return { col, row };
                }
            }
        }
        return null;
    }
}
