/**
 * 怪物管理器
 * 负责：刷怪配置、怪物死亡回调（经验/金币/掉落）
 * 与具体场景中的怪物节点/脚本配合使用
 */

import type { MonsterConfig, MonsterConfigTable } from "../config/MonsterConfig";
import { DefaultMonsterConfigTable } from "../config/MonsterConfig";
import type { ItemData } from "../model/ItemData";

export type OnMonsterKilled = (monsterId: number, exp: number, gold: number, drops: ItemData[]) => void;

export class MonsterManager {
    private configTable: MonsterConfigTable = DefaultMonsterConfigTable;
    private onKilled: OnMonsterKilled | null = null;

    setConfigTable(table: MonsterConfigTable): void {
        this.configTable = table;
    }

    /** 设置怪物死亡时的回调（用于加经验、加金币、把掉落物加入背包等） */
    setOnMonsterKilled(callback: OnMonsterKilled): void {
        this.onKilled = callback;
    }

    getConfig(monsterId: number): MonsterConfig | null {
        return this.configTable[monsterId] ?? null;
    }

    /**
     * 通知怪物被击杀（由战斗/场景层在怪物死亡时调用）
     * exp/gold 从配置读，drops 由 DropManager 摇完传入
     */
    notifyKilled(monsterId: number, drops: ItemData[]): void {
        const cfg = this.getConfig(monsterId);
        if (!cfg) return;
        const exp = cfg.exp ?? 0;
        const gold = cfg.gold ?? 0;
        this.onKilled?.(monsterId, exp, gold, drops);
    }
}
