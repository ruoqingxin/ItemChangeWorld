import BattleData from "../data/BattleData";
import { IBattleState } from "../types/BattleTypes";
import { BattleConfigUtils } from "../utils/BattleConfigUtils";
import { BattleDropPlaceholder } from "./BattleDropPlaceholder";
import { IBattleRewardState, IDropItemConfig, IDropItemRuntime } from "./BattleRewardTypes";

/**
 * 战斗奖励生成器。
 * 战斗胜利后根据死亡敌人的 drop_table_id 生成掉落实例。
 */
export class BattleRewardManager {
    private static _lootUidCounter = 1;

    static generateReward(state: IBattleState): IBattleRewardState {
        const drops: IDropItemRuntime[] = [];

        for (const enemy of state.enemies) {
            const enemyCfg = BattleData.ins().getEnemy(enemy.cfgId);
            if (!enemyCfg) {
                continue;
            }

            const dropTableId = BattleDropPlaceholder.getEnemyDropTableId(
                enemy.cfgId,
                BattleConfigUtils.toNumber(enemyCfg.drop_table_id, 0),
            );

            if (dropTableId <= 0) {
                continue;
            }

            drops.push(...this.rollDropTable(dropTableId));
        }

        return {
            scenarioId: state.scenarioId,
            drops,
        };
    }

    private static rollDropTable(dropTableId: number): IDropItemRuntime[] {
        const table = BattleData.ins().getDropTable(dropTableId);
        if (!table || !BattleConfigUtils.isEnabled(table)) {
            return [];
        }

        const entries = BattleData.ins().getDropItems(dropTableId)
            .filter(row => BattleConfigUtils.isEnabled(row));

        if (entries.length <= 0) {
            return [];
        }

        const drops: IDropItemRuntime[] = [];
        const rollCount = Math.max(0, BattleConfigUtils.toNumber(table.roll_count, 0));

        for (let i = 0; i < rollCount; i++) {
            const entry = this.pickWeightedEntry(entries);
            if (!entry || Number(entry.item_id) <= 0) {
                continue;
            }

            const count = this.rollCount(entry);
            for (let j = 0; j < count; j++) {
                drops.push(this.createDrop(entry.item_id));
            }
        }

        return drops;
    }

    private static pickWeightedEntry(entries: IDropItemConfig[]): IDropItemConfig | null {
        const totalWeight = entries.reduce((sum, row) => sum + Math.max(0, Number(row.weight) || 0), 0);
        if (totalWeight <= 0) {
            return null;
        }

        let roll = Math.floor(Math.random() * totalWeight);
        for (const entry of entries) {
            roll -= Math.max(0, Number(entry.weight) || 0);
            if (roll < 0) {
                return entry;
            }
        }

        return entries[entries.length - 1] || null;
    }

    private static rollCount(entry: IDropItemConfig): number {
        const min = Math.max(0, BattleConfigUtils.toNumber(entry.min_count, 0));
        const max = Math.max(min, BattleConfigUtils.toNumber(entry.max_count, min));
        if (max <= 0) {
            return 0;
        }

        return min + Math.floor(Math.random() * (max - min + 1));
    }

    private static createDrop(itemId: number): IDropItemRuntime {
        const itemUid = this.createItemUid();
        return {
            dropUid: `drop_${itemUid}`,
            itemUid,
            itemId: Number(itemId),
            picked: false,
        };
    }

    private static createItemUid(): string {
        const uid = `loot_${String(this._lootUidCounter).padStart(4, "0")}`;
        this._lootUidCounter += 1;
        return uid;
    }

    static resetUidCounter(): void {
        this._lootUidCounter = 1;
    }
}
