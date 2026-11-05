import type { Tables } from "../../../config/schema";
import { SkillBattleConfigUtils } from "../../skillBattle/utils/SkillBattleConfigUtils";
import type { IExpeditionConfig, IExpeditionLootConfig } from "../types/ExpeditionTypes";

export class ExpeditionConfigUtils {
    static read(tables: Tables): IExpeditionConfig {
        const encounters = tables.skill_encounter.getDataList().filter(row => row.enabled === 1)
            .slice().sort((a, b) => a.order - b.order);
        if (encounters.length !== 3 || encounters.some((row, i) => row.order !== i + 1))
            throw new Error("[Expedition] 秘境路线必须为三场连续遭遇");
        const loot: IExpeditionLootConfig[] = tables.skill_loot_use.getDataList().filter(row => row.enabled === 1).map(row => {
            const display = tables.item.get(row.item_id);
            if (!display || display.enabled !== 1 || !["currency", "collection"].includes(row.use_type) ||
                !Number.isSafeInteger(row.currency_value) || row.currency_value < 0 ||
                !Number.isSafeInteger(row.collection_id) || row.collection_id < 0 ||
                (row.use_type === "currency" ? row.currency_value <= 0 || row.collection_id !== 0
                    : row.currency_value !== 0 || row.collection_id <= 0))
                throw new Error("[Expedition] 战利品使用配置无效");
            return { itemId: row.item_id, name: display.name, useType: row.use_type as "currency" | "collection",
                currencyValue: row.currency_value, collectionId: row.collection_id };
        });
        const rewards = encounters.map(encounter => {
            const entries = tables.skill_reward_entry.getDataList()
                .filter(row => row.enabled === 1 && row.reward_group_id === encounter.reward_group_id)
                .slice().sort((a, b) => a.id - b.id);
            if (!entries.length || entries.some(row => !loot.some(item => item.itemId === row.item_id) ||
                !Number.isSafeInteger(row.count) || row.count < 1 || row.count > 6))
                throw new Error("[Expedition] 固定奖励配置无效");
            return entries.reduce<number[]>((items, row) => items.concat(new Array(row.count).fill(row.item_id)), []);
        });
        if (rewards.reduce((sum, rows) => sum + rows.length, 0) > 6)
            throw new Error("[Expedition] 路线奖励超过六格战利品袋");
        return { encounters: encounters.map(row => SkillBattleConfigUtils.readEncounter(tables, row.encounter_id)),
            upgrades: SkillBattleConfigUtils.readUpgrades(tables), loot, rewards };
    }
}
