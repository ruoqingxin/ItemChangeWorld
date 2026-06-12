import { BaseClass } from "src/script/games/common/BaseClass";
import { IInventoryState } from "./InventoryTypes";

/** 局内背包运行时数据 */
export default class InventoryData extends BaseClass {
    /** 背包宽度 */
    static readonly BAG_WIDTH = 6;

    /** 背包高度 */
    static readonly BAG_HEIGHT = 5;

    state: IInventoryState = {
        width: InventoryData.BAG_WIDTH,
        height: InventoryData.BAG_HEIGHT,
        items: [],
    };

    reset(): void {
        this.state = {
            width: InventoryData.BAG_WIDTH,
            height: InventoryData.BAG_HEIGHT,
            items: [],
        };
    }
}
