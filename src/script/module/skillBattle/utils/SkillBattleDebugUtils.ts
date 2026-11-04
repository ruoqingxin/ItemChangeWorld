import type { ISkillBattleSetup, ISkillBattleState, SkillBattleEvent } from "../types/SkillBattleTypes";
import { SkillBattleFormulaUtils } from "./SkillBattleFormulaUtils";

export class SkillBattleDebugUtils {
    static formatState(setup: ISkillBattleSetup, state: ISkillBattleState): string {
        const intent = SkillBattleFormulaUtils.currentIntent(setup, state);
        return [
            `[SkillBattle] 遭遇 ${state.encounterId}，回合 ${state.round}，状态 ${state.phase}，版本 ${state.revision}`,
            `玩家 HP ${state.player.hp}/${state.player.maxHp}，护盾 ${state.player.block}，剑势 ${state.swordQi}/${state.swordQiMax}，耐久 ${state.weaponDurability}`,
            `${setup.enemy.name} HP ${state.enemy.hp}/${state.enemy.maxHp}，护盾 ${state.enemy.block}`,
            state.phase === "player_input"
                ? `当前意图：${intent.name}，伤害 ${intent.damage}，护盾 ${intent.block}，${intent.interruptible ? "可打断" : "不可打断"}`
                : "战斗已结束",
        ].join("\n");
    }

    static formatEvent(event: SkillBattleEvent): string {
        const side = (value: string) => value === "player" ? "玩家" : "敌人";
        switch (event.type) {
            case "skill_used": return `使用【${event.name}】`;
            case "qi_changed": return `剑势 ${event.before} → ${event.after}，溢出 ${event.overflow}`;
            case "damage": return `${side(event.source)} → ${side(event.target)}：伤害 ${event.amount}，护盾吸收 ${event.blockAbsorbed}，生命损失 ${event.hpLoss}`;
            case "block_gained": return `${side(event.target)} 获得 ${event.amount} 护盾`;
            case "block_cleared": return `${side(event.target)} 清除 ${event.amount} 剩余护盾`;
            case "intent_interrupted": return `打断【${event.name}】，本次意图已消耗`;
            case "intent_executed": return `敌人执行【${event.name}】`;
            case "round_started": return `第 ${event.round} 回合，显示意图【${event.name}】`;
            case "battle_ended": return event.result === "victory" ? "战斗胜利" : "战斗失败";
        }
    }
}
