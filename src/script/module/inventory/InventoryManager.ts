import BattleData from "../battle/data/BattleData";
import { IDropItemRuntime } from "../battle/reward/BattleRewardTypes";
import InventoryData from "./InventoryData";
import { InventoryGridUtils } from "./InventoryGridUtils";
import {
    IInventoryActionResult,
    IInventoryItemRuntime,
    IInventoryState,
} from "./InventoryTypes";

/**
 * 局内背包业务入口。
 * 仅在战斗胜利后的掉落拾取阶段使用，战斗中不可打开。
 */
export class InventoryManager {
    private static _ins: InventoryManager;

    static ins(): InventoryManager {
        if (!this._ins) {
            this._ins = new InventoryManager();
        }

        return this._ins;
    }

    get state(): IInventoryState {
        return InventoryData.ins().state;
    }

    /** 战斗中禁止打开局内背包 */
    canOpenBag(battleRunning: boolean): boolean {
        return !battleRunning;
    }

    /** 拾取掉落物到背包，自动寻找空位 */
    pickDrop(dropUid: string, drops: IDropItemRuntime[]): IInventoryActionResult {
        const drop = drops.find(row => row.dropUid === dropUid);

        if (!drop) {
            return { ok: false, reason: "掉落不存在" };
        }

        if (drop.picked) {
            return { ok: false, reason: "该掉落已拾取" };
        }

        const itemCfg = BattleData.ins().getItem(drop.itemId);
        if (!itemCfg) {
            return { ok: false, reason: `物品配置不存在：${drop.itemId}` };
        }

        const bagWidth = Math.max(1, Number(itemCfg.bag_width) || 1);
        const bagHeight = Math.max(1, Number(itemCfg.bag_height) || 1);
        const inventory = InventoryData.ins().state;
        const slot = InventoryGridUtils.findFirstSlot(
            inventory.width,
            inventory.height,
            inventory.items,
            bagWidth,
            bagHeight,
        );

        if (!slot) {
            return { ok: false, reason: "背包空间不足" };
        }

        inventory.items.push({
            itemUid: drop.itemUid,
            itemId: drop.itemId,
            x: slot.x,
            y: slot.y,
            width: bagWidth,
            height: bagHeight,
        });
        drop.picked = true;

        return { ok: true };
    }

    /** 按掉落列表下标拾取 */
    pickDropByIndex(index: number, drops: IDropItemRuntime[]): IInventoryActionResult {
        const drop = drops[index];
        if (!drop) {
            return { ok: false, reason: `掉落索引无效：${index}` };
        }

        return this.pickDrop(drop.dropUid, drops);
    }

    /** 丢弃背包物品，释放占格 */
    discardItem(itemUid: string): IInventoryActionResult {
        const inventory = InventoryData.ins().state;
        const index = inventory.items.findIndex(item => item.itemUid === itemUid);

        if (index < 0) {
            return { ok: false, reason: "背包中不存在该物品" };
        }

        inventory.items.splice(index, 1);
        return { ok: true };
    }

    clear(): void {
        InventoryData.ins().reset();
    }

    getItem(itemUid: string): IInventoryItemRuntime | undefined {
        return InventoryData.ins().state.items.find(item => item.itemUid === itemUid);
    }
}
