/**
 * 背包模型
 * 管理格子、增删查、堆叠
 */

import type { ItemData } from "./ItemData";

export class Inventory {
    /** 背包格子：索引 -> 物品数据（空槽为 null） */
    private slots: (ItemData | null)[] = [];
    /** 容量 */
    private capacity: number;

    constructor(capacity: number = 30) {
        this.capacity = capacity;
        this.slots = new Array(capacity).fill(null);
    }

    getCapacity(): number {
        return this.capacity;
    }

    getSlots(): (ItemData | null)[] {
        return this.slots;
    }

    getSlot(index: number): ItemData | null {
        if (index < 0 || index >= this.capacity) return null;
        return this.slots[index];
    }

    /** 查找已有该物品且可堆叠的格子索引 */
    findStackableSlot(itemId: number, maxStack: number): number {
        for (let i = 0; i < this.slots.length; i++) {
            const s = this.slots[i];
            if (s && s.id === itemId && s.count < maxStack) return i;
        }
        return -1;
    }

    /** 查找空格子 */
    findEmptySlot(): number {
        return this.slots.findIndex(s => s == null);
    }

    /**
     * 添加物品（优先堆叠，再占空位）
     * @returns 实际添加的数量（可能因背包满而小于 requestCount）
     */
    addItem(itemId: number, requestCount: number, getMaxStack: (id: number) => number): number {
        let remain = requestCount;
        const maxStack = getMaxStack(itemId);

        // 先堆叠到已有格子
        let idx = this.findStackableSlot(itemId, maxStack);
        while (remain > 0 && idx >= 0) {
            const s = this.slots[idx]!;
            const add = Math.min(remain, maxStack - s.count);
            s.count += add;
            remain -= add;
            idx = this.findStackableSlot(itemId, maxStack);
        }

        // 再占空位
        while (remain > 0) {
            const empty = this.findEmptySlot();
            if (empty < 0) break;
            const add = Math.min(remain, maxStack);
            this.slots[empty] = { id: itemId, count: add };
            remain -= add;
        }

        return requestCount - remain;
    }

    /** 移除指定格子一定数量 */
    removeAt(slotIndex: number, count: number): boolean {
        const s = this.slots[slotIndex];
        if (!s || s.count < count) return false;
        s.count -= count;
        if (s.count <= 0) this.slots[slotIndex] = null;
        return true;
    }

    /** 按物品 ID 扣除数量（从多个格子扣） */
    removeItem(itemId: number, count: number): boolean {
        let need = count;
        for (let i = 0; i < this.slots.length && need > 0; i++) {
            const s = this.slots[i];
            if (!s || s.id !== itemId) continue;
            const take = Math.min(need, s.count);
            s.count -= take;
            need -= take;
            if (s.count <= 0) this.slots[i] = null;
        }
        return need === 0;
    }

    /** 统计某物品总数量 */
    countItem(itemId: number): number {
        return this.slots.reduce((sum, s) => (s && s.id === itemId ? sum + s.count : sum), 0);
    }
}
