/**
 * 游戏总管理器
 * 单机架构入口：初始化各子系统，串联 打怪 -> 掉落 -> 物品
 */

import { ItemManager } from "./ItemManager";
import { DropManager } from "./DropManager";
import { MonsterManager } from "./MonsterManager";
import { Inventory } from "../model/Inventory";
import type { ItemData } from "../model/ItemData";

/** 玩家运行时数据（可扩展等级、经验、装备栏等） */
export interface PlayerRuntime {
    exp: number;
    level: number;
    gold: number;
}

export class GameManager {
    private static _instance: GameManager | null = null;

    readonly itemManager: ItemManager = new ItemManager();
    readonly dropManager: DropManager = new DropManager();
    readonly monsterManager: MonsterManager = new MonsterManager();
    /** 玩家背包 */
    readonly inventory: Inventory = new Inventory(30);
    /** 玩家数据 */
    readonly player: PlayerRuntime = { exp: 0, level: 1, gold: 0 };

    static get instance(): GameManager {
        if (!GameManager._instance) {
            GameManager._instance = new GameManager();
        }
        return GameManager._instance;
    }

    static init(): GameManager {
        const gm = GameManager.instance;
        gm.setup();
        return gm;
    }

    private setup(): void {
        // 怪物死亡：加经验、加金币、掉落物入背包
        this.monsterManager.setOnMonsterKilled((monsterId, exp, gold, drops) => {
            this.player.exp += exp;
            this.player.gold += gold;
            for (const item of drops) {
                const added = this.inventory.addItem(
                    item.id,
                    item.count,
                    (id) => this.itemManager.getMaxStack(id)
                );
                // 可在此发事件给 UI 显示 "获得 xxx x N"
                console.log(`[GameManager] 获得: itemId=${item.id} count=${added}, exp+=${exp}, gold+=${gold}`);
            }
        });
    }

    /**
     * 击杀怪物时调用（战斗/场景层）
     * 内部会按怪物配置的 dropTableId 摇掉落，再触发 OnMonsterKilled
     */
    onMonsterKilled(monsterId: number): void {
        const cfg = this.monsterManager.getConfig(monsterId);
        if (!cfg) return;
        const drops = this.dropManager.rollDrops(cfg.dropTableId);
        this.monsterManager.notifyKilled(monsterId, drops);
    }

    getInventory(): Inventory {
        return this.inventory;
    }

    getPlayer(): PlayerRuntime {
        return this.player;
    }
}
