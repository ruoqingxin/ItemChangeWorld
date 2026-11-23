import { QingmingConfig } from "../../skillBattle/utils/QingmingConfig";
import type { RogueItem, RogueSetup } from "../../skillBattle/types/QingmingTypes";
import type { CombatTrialProfile } from "../../skillBattle/types/EquipmentTrialTypes";

export class WeaponTrialConfig {
    static readonly tuning: CombatTrialProfile = {
        edge: 1.6, guide: .65, guideMp: .4, fall: 2.2, guard: 1.2, wind: 2,
        shieldAttack: .5, shieldArmor: .5, shieldCap: 4, basicMana: 2,
        costs: {edge:2,wind:2,guide:4,fall:7},
        enemyHp: {普通:1,精英:1.1,首领:1.2},
    };
    static readonly presets = [
        { name: "原值", player: { hp: 1000, mp: 120, attack: 100, defense: 40 },
            enemy: { hp: 500, mp: 180, attack: 55, defense: 25 } },
        { name: "中值", player: { hp: 500, mp: 80, attack: 30, defense: 12 },
            enemy: { hp: 150, mp: 180, attack: 17, defense: 8 } },
        { name: "低值", player: { hp: 300, mp: 60, attack: 20, defense: 10 },
            enemy: { hp: 100, mp: 180, attack: 11, defense: 5 } },
        { name: "单行动", player: { hp: 240, mp: 36, attack: 18, defense: 6 },
            enemy: { hp: 110, mp: 60, attack: 16, defense: 8 } },
    ];
    static apply(draft: RogueSetup, index: number): void {
        const preset = this.presets[index];
        draft.player = { ...preset.player }; draft.enemy = { ...preset.enemy };
        draft.armorMitigation = true;
        draft.singleAction = true;
        draft.combatTrial = JSON.parse(JSON.stringify(this.tuning));
    }
    static defaults(): RogueSetup {
        const draft = QingmingConfig.defaults();
        this.apply(draft, 3);
        draft.weaponTrial = { base: 1, quality: 3 };
        draft.armorTrial = {base:2,quality:3};
        draft.accessoryTrial = {base:1,quality:3};
        return draft;
    }
    static skillSummary(d: RogueSetup): string {
        const p = d.combatTrial;
        if (!p) return "青锋110%攻击/4蓝；回风250%护甲/4蓝\n引星75%攻击/5蓝；落青冥170%攻击/8蓝\n普攻100%攻击；防御150%护甲\n";
        return `青锋${Math.round(p.edge*100)}%攻击/${p.costs.edge}蓝\n引星${Math.round(p.guide*100)}%攻击+${p.guideMp*100}%蓝上限/${p.costs.guide}蓝\n` +
            `落青冥${Math.round(p.fall*100)}%攻击/${p.costs.fall}蓝，每回合一次\n` +
            `盾基数=${p.shieldAttack*100}%攻击+${p.shieldArmor*100}%护甲\n` +
            `防御${p.guard*100}%、回风${p.wind*100}%盾基数/${p.costs.wind}蓝；上限${p.shieldCap*100}%\n` +
            `引星压制35%；普攻100%攻击；双方每回合各1行动\n` +
            "余盾下回合保留一半，最多150%盾基数；战内用药占1行动。\n" +
            "引星改招按本体比例同步缩放两项；派生伤害保留各自攻击倍率。\n";
    }
    static itemDescription(key: RogueItem, d: RogueSetup): string {
        const p = d.combatTrial, item = QingmingConfig.items[key];
        if (!p) return item.description;
        const percent = (n: number) => `${+(n * 100).toFixed(1)}%`;
        const changes: Partial<Record<RogueItem, string>> = {
            retention:"回合末保留全部余盾，上限为300%盾基数。",
            wound:"本体攻击附加1层剑伤，最多6层；敌行动后每层造成5%攻击伤害，每3回合衰减1层。",
            breakingWave:`回风改为${percent(1.875*p.wind/2.5)}盾基数；随后敌行动实际格挡时追加80%攻击反击。`,
            turnTables:"跳过本回合后，随后敌行动实际格挡时追加110%攻击反击；需先持有余盾。",
            tempo:"连续使用不同主动，该招追加35%攻击伤害或35%盾基数；普攻、防御、用药、跳过均打断。",
            flyingEdge:`青锋改为${percent(.7*p.edge/1.1)}攻击，每次额外生成1飞剑。`,
            salvo:`落青冥保留${percent(p.fall)}攻击重击，消耗全部飞剑，每把追加60%攻击；每回合一次。`,
            heavyEdge:`青锋改为${percent(p.edge/1.1)}攻击，每势追加${percent(.9*p.edge/1.1)}攻击，消耗全部势；须有藏锋或静息。`,
            delayedFall:`落青冥改为${percent(.7*p.fall/1.7)}攻击，悬剑在敌阶段结束且自身存活后造成220%攻击；战末清除。`,
            shieldWind:`回风改为${percent(1.75*p.wind/2.5)}盾基数，同时生成1飞剑；独立飞剑来源。`,
            pinGuide:`引星改为${percent(.5*p.guide/.75)}攻击+${percent(p.guideMp*2/3)}蓝上限，指定敌行动压制60%，额外加2剑伤；须有剑伤。`,
            shieldFall:`消耗全部护盾，本体${percent(p.fall)}攻击另加消耗盾量125%伤害，不穿敌盾。`,
        };
        return changes[key] || item.description.replace(/(\d+%)防御/g, "$1盾基数");
    }
}
