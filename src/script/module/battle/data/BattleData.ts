import { ConfigUtil } from "src/script/config/ConfigUtil";
import {
    EEffectType,
    Ibattle_ruleConfig,
    IcardConfig,
    Icombat_scenarioConfig,
    Icombat_scenario_enemyConfig,
    Ideck_cardConfig,
    IdeckConfig,
    Ieffect_defineConfig,
    Ielement_stoneConfig,
    Ienemy_intentConfig,
    IenemyConfig,
    IitemConfig,
    IstatusConfig,
    IweaponConfig,
} from "src/script/config/schema";
import { BattleConfigUtils } from "../utils/BattleConfigUtils";
import { BaseClass } from "src/script/games/common/BaseClass";
import { IBattleState } from "../types/BattleTypes";
import { BattleDropPlaceholder } from "../reward/BattleDropPlaceholder";
import {
    IDropItemConfig,
    IDropTableConfig,
    IItemPlaceholderConfig,
} from "../reward/BattleRewardTypes";

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

    public getItem(itemId: number): IitemConfig | IItemPlaceholderConfig | undefined {
        const row = ConfigUtil.Tables?.item?.get(itemId);
        if (row) {
            return row;
        }

        return BattleDropPlaceholder.getItem(itemId);
    }

    public getDropTable(dropTableId: number): IDropTableConfig | undefined {
        const tables = (ConfigUtil.Tables as any)?.drop_table;
        const row = tables?.get?.(dropTableId);
        if (row && BattleConfigUtils.isEnabled(row)) {
            return row as IDropTableConfig;
        }

        return BattleDropPlaceholder.getDropTable(dropTableId);
    }

    public getDropItems(dropTableId: number): IDropItemConfig[] {
        const table = (ConfigUtil.Tables as any)?.drop_item;
        const rows = table?.getDataList?.() as IDropItemConfig[] | undefined;
        if (rows && rows.length > 0) {
            return rows.filter(row => {
                return BattleConfigUtils.isEnabled(row) && Number(row.drop_table_id) === Number(dropTableId);
            });
        }

        return BattleDropPlaceholder.getDropItems(dropTableId);
    }

    public getElementStoneByItemId(itemId: number): Ielement_stoneConfig | undefined {
        const row = ConfigUtil.Tables.element_stone.getDataList()
            .find(cfg => Number(cfg.item_id) === Number(itemId));
        return row && BattleConfigUtils.isEnabled(row) ? row : undefined;
    }

    public getElementStoneByStoneId(stoneId: number): Ielement_stoneConfig | undefined {
        const row = ConfigUtil.Tables.element_stone.get(stoneId);
        return row && BattleConfigUtils.isEnabled(row) ? row : undefined;
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
        const row = ConfigUtil.Tables.effect_define.get(effectId);
        return row && BattleConfigUtils.isEnabled(row) ? row : undefined;
    }

    /** effect_group / tick_effect_id 存的是 effect_define.effect_id，需查表取 effect_type */
    public getEffectType(effectId: number): EEffectType {
        const row = this.getEffectDefine(effectId);
        return row ? Number(row.effect_type) as EEffectType : EEffectType.none;
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
