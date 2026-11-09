import type { Tables } from "../../../config/schema";
import { NewBattleConfigUtils } from "./NewBattleConfigUtils";
import { NewBattleCore } from "./NewBattleCore";
import type { NewSkillKind, NewPassiveKind } from "./NewBattleTypes";
import type { NewBuildConfig, NewBuildProfile } from "./NewBuildTypes";

export class NewBuildConfigUtils {
    static read(tables: Tables): NewBuildConfig {
        const setup = NewBattleConfigUtils.read(tables, NewBattleConfigUtils.defaults());
        const rule = tables.new_build_rule.get(1);
        if (!rule) throw new Error("双道构筑规则表缺失");
        setup.rulesId = "stage2-approved-2026-11-09";
        setup.earthRules = { powerPercent: rule.power_percent, lowHpPercent: rule.low_hp_percent };
        setup.skills.push(...tables.new_earth_skill.getDataList().map(row => ({
            id: row.id, name: row.name, kind: row.kind as NewSkillKind, school: "earth",
            mpCost: row.mp_cost * 100, damagePercent: row.damage_percent, shieldPercent: row.shield_percent,
            shredPercent: 0, markPercent: 0, conditionalPercent: row.conditional_percent,
            reductionPercent: row.reduction_percent, counterPercent: row.counter_percent,
        })));
        setup.passives.forEach(row => row.school = "sword");
        setup.passives.push(...tables.new_build_passive.getDataList().map(row => ({
            id: row.id, name: row.name, kind: row.kind as NewPassiveKind, school: row.school, value: row.value,
        })));
        setup.build = { schools: ["sword", "earth"], actives: [], passiveIds: [] };
        const qualification = (id: number, school: string, enabled: number) =>
            ({ id, school, defaultEligible: enabled === 1, realm: 1 });
        const enemies = tables.new_battle_enemy.getDataList();
        if (enemies.length < 3) throw new Error("阶段2战斗夹具缺失");
        const plan = [0, 1, 0, 2, 0, 1];
        const config: NewBuildConfig = {
            setup,
            skills: [
                ...tables.new_sword_skill.getDataList().map(r => qualification(r.id, "sword", r.default_eligible)),
                ...tables.new_earth_skill.getDataList().map(r => qualification(r.id, "earth", r.default_eligible)),
            ],
            passives: [
                ...tables.new_sword_passive.getDataList().map(r => qualification(r.id, "sword", r.default_eligible)),
                ...tables.new_build_passive.getDataList().map(r => qualification(r.id, r.school, r.default_eligible)),
            ],
            rules: { commonMixPercent: rule.common_mix_percent, firstCost: rule.first_cost,
                laterCost: rule.later_cost, normalDaoyun: rule.normal_daoyun,
                eliteDaoyun: rule.elite_daoyun, forgoPoints: rule.forgo_points },
            // This finite sequence is an explicit workflow fixture, not the R07 first map.
            encounters: plan.map((index, i) => ({
                id: `stage2-fixture-${i + 1}`,
                enemy: NewBattleConfigUtils.read(tables, { ...NewBattleConfigUtils.defaults(), enemyId: enemies[index].id }).enemy,
                elite: index === 2, borrow: [0, 2, 4].includes(i),
            })),
        };
        NewBattleCore.validateSetup(setup);
        return config;
    }

    static profile(config: NewBuildConfig, fixture = false): NewBuildProfile {
        return { realm: 1, fixture, learnedSkills: fixture ? config.skills.filter(r => !r.defaultEligible).map(r => r.id) : [],
            learnedPassives: fixture ? config.passives.filter(r => !r.defaultEligible).map(r => r.id) : [] };
    }
}
