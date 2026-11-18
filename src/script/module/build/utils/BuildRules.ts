import { BattleRules as Core } from "../../skillBattle/utils/BattleRules";
import type { BuildCommand, BuildConfig, BuildState } from "../types/BuildTypes";
import type { BattleCarry } from "../../skillBattle/types/BattleTypes";
import { QingmingBuildRules as Qingming } from "./QingmingBuildRules";
import { GuzongEnemyRules } from "../../skillBattle/utils/GuzongEnemyRules";

/** 奖励与战斗共用当前构筑规则，随机结果随整局保存。 */
export class BuildRules {
    static validateConfig(config: BuildConfig): void {
        const int = (n: number, min = 0) => Number.isSafeInteger(n) && n >= min && n <= 1000000;
        if (!config?.qingming?.version || !config.setup || !int(config.qingming.battleRewards) ||
            config.qingming.battleRewards > 27 || !Object.values(config.qingming.enemy).every(n => int(n)) ||
            !int(config.qingming.enemy.hp, 1) || !config.encounters.length ||
            new Set(config.encounters.map(e => e.id)).size !== config.encounters.length ||
            config.encounters.some(e => !e.id || !GuzongEnemyRules.enemies[e.qingmingEnemy]))
            throw new Error("构筑规则或敌人配置无效");
        // 基础配置已带有效敌人与空构筑，战前按地图节点生成对应战斗。
        Core.validateSetup(config.setup);
    }
    static start(config: BuildConfig, seed: number, runId: string): BuildState {
        this.validateConfig(config);
        if (!Number.isInteger(seed) || seed < 1 || seed > 0xffffffff || !runId) throw new Error("随机种子或局标识无效");
        return Qingming.start(seed, runId);
    }
    static offer(_config: BuildConfig, state: BuildState,
        source: string, _kind: "active" | "passive"): BuildState {
        return Qingming.offer(state, source);
    }
    static apply(config: BuildConfig, state: BuildState,
        command: BuildCommand, at: number, carry?: BattleCarry, encounterId?: string) {
        return Qingming.apply(config, state, command, at, carry, encounterId);
    }
}
