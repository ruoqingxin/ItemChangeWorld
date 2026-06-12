import { EEffectType, EElement } from "src/script/config/schema";
import { EBattleStatusId, IBattleCard, IBattleUnit, IEffectSpec } from "../types/BattleTypes";
import { BattleConfigUtils } from "./BattleConfigUtils";

/** 五行克制关系：key 克制 value */
const ELEMENT_COUNTER: Record<number, number> = {
    [EElement.metal]: EElement.wood,
    [EElement.wood]: EElement.earth,
    [EElement.earth]: EElement.water,
    [EElement.water]: EElement.fire,
    [EElement.fire]: EElement.metal,
};

const ELEMENT_PREFIX: Record<number, string> = {
    [EElement.metal]: "金灵",
    [EElement.wood]: "木灵",
    [EElement.water]: "水灵",
    [EElement.fire]: "火灵",
    [EElement.earth]: "土灵",
};

const ELEMENT_NAME: Record<number, string> = {
    [EElement.metal]: "金",
    [EElement.wood]: "木",
    [EElement.water]: "水",
    [EElement.fire]: "火",
    [EElement.earth]: "土",
};

export class BattleFormulaUtils {
    static getElementPrefix(element: number): string {
        return ELEMENT_PREFIX[element] || "灵";
    }

    static getElementName(element: number): string {
        return ELEMENT_NAME[element] || "无";
    }

    /**
     * 五行克制倍率。
     * 克制 1.2 / 被克 0.8 / 同属性 0.9 / 无关系 1.0
     */
    static getElementCounterRate(stoneElement: number, targetElement: number): number {
        if (!stoneElement || !targetElement) {
            return 1;
        }

        if (ELEMENT_COUNTER[stoneElement] === targetElement) {
            return 1.2;
        }

        if (ELEMENT_COUNTER[targetElement] === stoneElement) {
            return 0.8;
        }

        if (stoneElement === targetElement) {
            return 0.9;
        }

        return 1;
    }

    static getElementCounterText(stoneElement: number, targetElement: number): string {
        if (!stoneElement || !targetElement) {
            return "";
        }

        const stoneName = this.getElementName(stoneElement);
        const targetName = this.getElementName(targetElement);

        if (ELEMENT_COUNTER[stoneElement] === targetElement) {
            return `${stoneName}克${targetName}`;
        }

        if (ELEMENT_COUNTER[targetElement] === stoneElement) {
            return `${stoneName}被${targetName}克`;
        }

        if (stoneElement === targetElement) {
            return `同属性${stoneName}`;
        }

        return "";
    }

    /** 注灵基础伤害 = floor(卡牌基础伤害 × damage_rate / 100) */
    static calcEnchantBaseDamage(cardBaseDamage: number, damageRate: number): number {
        return Math.max(0, Math.floor(cardBaseDamage * damageRate / 100));
    }

    /** 注灵真实伤害 = floor(注灵基础伤害 × 五行克制倍率) */
    static calcEnchantRealDamage(
        cardBaseDamage: number,
        damageRate: number,
        stoneElement: number,
        targetElement: number,
    ): number {
        const base = this.calcEnchantBaseDamage(cardBaseDamage, damageRate);
        const rate = this.getElementCounterRate(stoneElement, targetElement);
        return Math.max(0, Math.floor(base * rate));
    }

    /** 取卡牌 effect_group 中首个 damage 效果值作为注灵基准 */
    static getCardBaseDamage(card: IBattleCard): number {
        for (const effect of card.effects) {
            if (Number(effect.effectId) === EEffectType.damage) {
                return Math.max(0, Math.floor(effect.value));
            }
        }

        return 0;
    }

    /** 基础攻击伤害（含力量/虚弱/破甲/易伤/防御，不含护盾） */
    static calcBaseAttackDamage(
        source: IBattleUnit,
        target: IBattleUnit,
        baseValue: number,
        getStatusStack: (unit: IBattleUnit, statusId: number) => number,
        getStatusCfg: (unit: IBattleUnit, statusId: number) => any,
    ): number {
        let damage = Math.max(0, Math.floor(baseValue));

        const power = getStatusStack(source, EBattleStatusId.Power);
        damage += power;

        const weak = getStatusStack(source, EBattleStatusId.Weak);
        if (weak > 0) {
            const weakCfg = getStatusCfg(source, EBattleStatusId.Weak);
            const percent = BattleConfigUtils.toNumber(weakCfg?.value_per_stack, 25);
            damage = Math.floor(damage * Math.max(0, 100 - percent) / 100);
        }

        const armorBreak = getStatusStack(target, EBattleStatusId.ArmorBreak);
        const realDef = Math.max(0, target.def - armorBreak);
        damage = Math.max(0, damage - realDef);

        const vulnerable = getStatusStack(target, EBattleStatusId.Vulnerable);
        if (vulnerable > 0) {
            const vulnerableCfg = getStatusCfg(target, EBattleStatusId.Vulnerable);
            const percent = BattleConfigUtils.toNumber(vulnerableCfg?.value_per_stack, 50);
            damage = Math.ceil(damage * (100 + percent) / 100);
        }

        return damage;
    }

    /**
     * 分段伤害预览，预览与结算共用同一套公式。
     */
    static previewSplitDamage(
        source: IBattleUnit,
        target: IBattleUnit,
        card: IBattleCard,
        getStatusStack: (unit: IBattleUnit, statusId: number) => number,
        getStatusCfg: (unit: IBattleUnit, statusId: number) => any,
        getTargetElement: (unit: IBattleUnit) => number,
    ): {
        baseDamage: number;
        baseFinalDamage: number;
        enchantBaseDamage: number;
        enchantFinalDamage: number;
        enchantElement: number;
        counterText: string;
        blockAbsorb: number;
        hpLoss: number;
        hasEnchant: boolean;
    } {
        const baseDamage = this.getCardBaseDamage(card);
        const baseFinalDamage = this.calcBaseAttackDamage(
            source,
            target,
            baseDamage,
            getStatusStack,
            getStatusCfg,
        );

        const enchant = card.enchantState;
        const hasEnchant = !!enchant?.applied;

        let enchantBaseDamage = 0;
        let enchantFinalDamage = 0;
        let enchantElement = 0;
        let counterText = "";

        if (hasEnchant && enchant) {
            enchantElement = enchant.element;
            enchantBaseDamage = this.calcEnchantBaseDamage(baseDamage, enchant.damageRate);
            enchantFinalDamage = this.calcEnchantRealDamage(
                baseDamage,
                enchant.damageRate,
                enchant.element,
                getTargetElement(target),
            );
            counterText = this.getElementCounterText(enchant.element, getTargetElement(target));
        }

        const totalRaw = baseFinalDamage + enchantFinalDamage;
        const blockAbsorb = Math.min(target.block, totalRaw);
        const hpLoss = totalRaw - blockAbsorb;

        return {
            baseDamage,
            baseFinalDamage,
            enchantBaseDamage,
            enchantFinalDamage,
            enchantElement,
            counterText,
            blockAbsorb,
            hpLoss,
            hasEnchant,
        };
    }

    static buildEnchantCardName(element: number, baseName: string): string {
        return `${this.getElementPrefix(element)}·${baseName}`;
    }

    static parseMinorEffects(raw: number[][]): IEffectSpec[] {
        return BattleConfigUtils.parseEffectGroup(raw);
    }
}
