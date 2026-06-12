import { InventoryDebug } from "../../inventory/InventoryDebug";
import { BattleManager } from "../manager/BattleManager";
import { BattleFormulaUtils } from "../utils/BattleFormulaUtils";
import { IDamagePreview, IEnchantCheckResult } from "../types/BattleTypes";

/**
 * Debug 控制台入口。
 *
 * 在 GameMain.Init() 或临时测试入口里调用：
 *
 * import { BattleDebug } from "src/script/module/battle/debug/BattleDebug";
 * BattleDebug.mountToWindow();
 *
 * 浏览器控制台：
 *
 * BattleDebug.start(1)
 * BattleDebug.enchant(0, 3)   // 将法囊第3格火属性石注灵到第0张手牌
 * BattleDebug.preview(0, 0)   // 预览第0张手牌对第0个敌人的伤害
 * BattleDebug.play(0, 0)
 * BattleDebug.end()
 * BattleDebug.reward()
 * BattleDebug.state()
 */
export class BattleDebug {
    static mountToWindow(): void {
        const win = window as any;

        win.BattleDebug = {
            start: (scenarioId: number = 1) => {
                return BattleDebug.start(scenarioId);
            },

            play: (handIndex: number = 0, targetEnemyIndex: number = 0) => {
                BattleDebug.play(handIndex, targetEnemyIndex);
            },

            enchant: (handIndex: number = 0, pouchSlotIndex: number = 0) => {
                return BattleDebug.enchant(handIndex, pouchSlotIndex);
            },

            preview: (handIndex: number = 0, targetEnemyIndex: number = 0) => {
                return BattleDebug.preview(handIndex, targetEnemyIndex);
            },

            pouch: () => {
                return BattleDebug.pouch();
            },

            end: () => {
                BattleDebug.end();
            },

            state: () => {
                return BattleDebug.state();
            },

            print: () => {
                BattleDebug.print();
            },

            reset: () => {
                BattleDebug.reset();
            },

            reward: () => {
                BattleDebug.reward();
            },
        };

        console.log("[BattleDebug] 已挂载到 window.BattleDebug");
        console.log("[BattleDebug] 示例：BattleDebug.start(1)");
        console.log("[BattleDebug] 示例：BattleDebug.enchant(0, 3)  // 火属性石注灵到第0张手牌");
        console.log("[BattleDebug] 示例：BattleDebug.preview(0, 0)");
        console.log("[BattleDebug] 示例：BattleDebug.play(0, 0)");
        console.log("[BattleDebug] 示例：BattleDebug.end()");
        console.log("[BattleDebug] 示例：BattleDebug.reward()");
    }

    static start(scenarioId: number = 1): void {
        BattleManager.ins().startScenario(scenarioId);
    }

    static play(handIndex: number = 0, targetEnemyIndex: number = 0): void {
        BattleManager.ins().playCard(handIndex, targetEnemyIndex);
    }

    static enchant(handIndex: number = 0, pouchSlotIndex: number = 0): IEnchantCheckResult {
        const result = BattleManager.ins().enchantCard(handIndex, pouchSlotIndex);
        if (!result.ok) {
            console.warn(`[BattleDebug] 注灵失败：${result.reason}`);
        }
        return result;
    }

    static preview(handIndex: number = 0, targetEnemyIndex: number = 0): IDamagePreview | null {
        const preview = BattleManager.ins().previewDamage(handIndex, targetEnemyIndex);
        if (!preview) {
            console.warn("[BattleDebug] 无法预览伤害");
            return;
        }

        const lines = BattleDebug.formatPreview(preview);
        console.log(lines.join("\n"));
        return preview;
    }

    static pouch(): unknown {
        return BattleManager.ins().getBattlePouch();
    }

    static end(): void {
        BattleManager.ins().endTurn();
    }

    static state(): any {
        return BattleManager.ins().state;
    }

    static print(): void {
        BattleManager.ins().printState();
    }

    static reset(): void {
        BattleManager.ins().reset();
        console.log("[BattleDebug] 已重置战斗");
    }

    static reward(): void {
        const reward = BattleManager.ins().rewardState;
        if (!reward) {
            console.warn("[BattleDebug] 当前没有战斗掉落，请先战斗胜利");
            return;
        }

        InventoryDebug.listDrops(reward.drops);
    }

    private static formatPreview(preview: ReturnType<typeof BattleManager.prototype.previewDamage>): string[] {
        if (!preview) {
            return [];
        }

        const lines = ["--- 伤害预览 ---"];

        if (preview.hasEnchant) {
            const elementName = BattleFormulaUtils.getElementName(preview.enchantElement);
            lines.push(`基础：${preview.baseFinalDamage}`);
            lines.push(
                `注灵：${preview.enchantFinalDamage}（${elementName}行${preview.counterText ? `，${preview.counterText}` : ""}）`,
            );
            lines.push(`合计：${preview.baseFinalDamage + preview.enchantFinalDamage}`);
            if (preview.blockAbsorb > 0) {
                lines.push(`护盾吸收：${preview.blockAbsorb}`);
            }
            lines.push(`生命损失：${preview.hpLoss}`);
        } else {
            lines.push(`基础：${preview.baseFinalDamage}`);
            if (preview.blockAbsorb > 0) {
                lines.push(`护盾吸收：${preview.blockAbsorb}`);
            }
            lines.push(`生命损失：${preview.hpLoss}`);
        }

        return lines;
    }
}
