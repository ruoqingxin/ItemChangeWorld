import { ConfigUtil } from "src/script/config/ConfigUtil";
import {
    Ibattle_ruleConfig,
    IcardConfig,
    Icombat_scenarioConfig,
    Icombat_scenario_enemyConfig,
    Ideck_cardConfig,
    IdeckConfig,
    Ieffect_defineConfig,
    Ienemy_intentConfig,
    IenemyConfig,
    IitemConfig,
    IstatusConfig,
    IweaponConfig,
} from "src/script/config/schema";
import { ElementStoneDebugConfig } from "../config/ElementStoneDebugConfig";
import { BattleConfigUtils } from "../utils/BattleConfigUtils";
import { BaseClass } from "src/script/games/common/BaseClass";
import { IBattleState, IElementStoneConfig } from "../types/BattleTypes";

/**
 * 战斗配置数据
 */
export default class BattleData extends BaseClass {

    state: IBattleState | null = null;

    reset(): void {
        this.state = null;
    }

    public getBattleRule(ruleId: number): Ibattle_ruleConfig | undefined {
        return ConfigUtil.Tables.battle_rule.get(ruleId);
    }

    public getCard(cardId: number): IcardConfig | undefined {
        return ConfigUtil.Tables.card.get(cardId);
    }

    public getWeapon(weaponId: number): IweaponConfig | undefined {
        return ConfigUtil.Tables.weapon.get(weaponId);
    }

    public getItem(itemId: number): IitemConfig | undefined {
        return ConfigUtil.Tables.item.get(itemId);
    }

    /** 属性石战斗规则，优先 Debug 配置，后续可切到 element_stone 表 */
    public getElementStoneByItemId(itemId: number): IElementStoneConfig | undefined {
        return ElementStoneDebugConfig.getByItemId(itemId);
    }

    public getEnemy(enemyId: number): IenemyConfig | undefined {
        return ConfigUtil.Tables.enemy.get(enemyId);
    }

    public getStatus(statusId: number): IstatusConfig | undefined {
        return ConfigUtil.Tables.status.get(statusId);
    }

    public getCombatScenario(scenarioId: number): Icombat_scenarioConfig | undefined {
        return ConfigUtil.Tables.combat_scenario.get(scenarioId);
    }

    public getEffectDefine(effectId: number): Ieffect_defineConfig | undefined {
        return ConfigUtil.Tables.effect_define.get(effectId);
    }

    public getDeck(deckId: number): IdeckConfig | undefined {
        return ConfigUtil.Tables.deck.get(deckId);
    }

    public getDeckCards(deckId: number): Ideck_cardConfig[] {
        return ConfigUtil.Tables.deck_card.getDataList()
            .filter(row => Number(row.deck_id) === Number(deckId));
    }

    public getScenarioEnemies(scenarioId: number): Icombat_scenario_enemyConfig[] {
        return ConfigUtil.Tables.combat_scenario_enemy.getDataList()
            .filter(row => {
                return BattleConfigUtils.isEnabled(row) && Number(row.scenario_id) === Number(scenarioId);
            })
            .sort((a, b) => BattleConfigUtils.toNumber(a.order) - BattleConfigUtils.toNumber(b.order));
    }

    public getEnemyIntents(intentGroupId: number): Ienemy_intentConfig[] {
        return ConfigUtil.Tables.enemy_intent.getDataList()
            .filter(row => {
                return BattleConfigUtils.isEnabled(row) && Number(row.intent_group_id) === Number(intentGroupId);
            })
            .sort((a, b) => BattleConfigUtils.toNumber(a.intent_id) - BattleConfigUtils.toNumber(b.intent_id));
    }
}
