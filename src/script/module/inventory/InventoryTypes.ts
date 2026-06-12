/** 局内背包运行时状态 */
export interface IInventoryState {
    /** 背包宽度，例如 6 */
    width: number;

    /** 背包高度，例如 5 */
    height: number;

    /** 背包内物品 */
    items: IInventoryItemRuntime[];
}

/** 背包物品实例 */
export interface IInventoryItemRuntime {
    /** 物品实例唯一 ID */
    itemUid: string;

    /** 物品配置 ID */
    itemId: number;

    /** 占用起始格 X */
    x: number;

    /** 占用起始格 Y */
    y: number;

    /** 占格宽 */
    width: number;

    /** 占格高 */
    height: number;
}

/** 拾取 / 丢弃操作结果 */
export interface IInventoryActionResult {
    ok: boolean;
    reason?: string;
}
