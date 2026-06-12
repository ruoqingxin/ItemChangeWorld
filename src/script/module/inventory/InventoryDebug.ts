import BattleData from "../battle/data/BattleData";
import { BattleManager } from "../battle/manager/BattleManager";
import { IDropItemRuntime } from "../battle/reward/BattleRewardTypes";
import { InventoryManager } from "./InventoryManager";
import { IInventoryItemRuntime } from "./InventoryTypes";

/**
 * 局内背包 Debug 控制台入口。
 *
 * InventoryDebug.bag()
 * InventoryDebug.pick(0)
 * InventoryDebug.drop("itemUid")
 * InventoryDebug.clear()
 */
export class InventoryDebug {
    static mountToWindow(): void {
        const win = window as any;

        win.InventoryDebug = {
            bag: () => InventoryDebug.bag(),
            pick: (index: number = 0) => InventoryDebug.pick(index),
            drop: (itemUid: string) => InventoryDebug.drop(itemUid),
            clear: () => InventoryDebug.clear(),
        };

        console.log("[InventoryDebug] 已挂载到 window.InventoryDebug");
        console.log("[InventoryDebug] 示例：InventoryDebug.bag()");
        console.log("[InventoryDebug] 示例：InventoryDebug.pick(0)");
        console.log("[InventoryDebug] 示例：InventoryDebug.drop(\"loot_0001\")");
    }

    static bag(): IInventoryItemRuntime[] {
        const items = InventoryManager.ins().state.items;
        if (items.length === 0) {
            console.log("[InventoryDebug] 背包为空");
            return items;
        }

        console.log("--- 局内背包 6×5 ---");
        for (const item of items) {
            const cfg = BattleData.ins().getItem(item.itemId);
            const name = cfg?.name || `item_${item.itemId}`;
            console.log(`${item.itemUid}  ${name}  位置(${item.x},${item.y})  占格${item.width}×${item.height}`);
        }

        return items;
    }

    static pick(index: number = 0): void {
        const reward = BattleManager.ins().rewardState;
        if (!reward) {
            console.warn("[InventoryDebug] 当前没有战斗掉落，请先战斗胜利后执行 BattleDebug.reward()");
            return;
        }

        const result = InventoryManager.ins().pickDropByIndex(index, reward.drops);
        if (!result.ok) {
            console.warn(`[InventoryDebug] 拾取失败：${result.reason}`);
            return;
        }

        const drop = reward.drops[index];
        const cfg = BattleData.ins().getItem(drop.itemId);
        console.log(`[InventoryDebug] 拾取成功：${drop.itemUid} ${cfg?.name || drop.itemId}`);
    }

    static drop(itemUid: string): void {
        const result = InventoryManager.ins().discardItem(itemUid);
        if (!result.ok) {
            console.warn(`[InventoryDebug] 丢弃失败：${result.reason}`);
            return;
        }

        console.log(`[InventoryDebug] 已丢弃：${itemUid}`);
    }

    static clear(): void {
        InventoryManager.ins().clear();
        console.log("[InventoryDebug] 背包已清空");
    }

    static listDrops(drops: IDropItemRuntime[]): void {
        if (!drops || drops.length === 0) {
            console.log("[InventoryDebug] 掉落列表为空");
            return;
        }

        console.log("--- 战斗掉落 ---");
        drops.forEach((drop, index) => {
            const cfg = BattleData.ins().getItem(drop.itemId);
            const name = cfg?.name || `item_${drop.itemId}`;
            const status = drop.picked ? "已拾取" : "未拾取";
            console.log(`[${index}] ${drop.dropUid}  ${name}  ${status}`);
        });
    }
}
