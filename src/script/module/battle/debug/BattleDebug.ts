import { BattleManager } from "../manager/BattleManager";

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
 * BattleDebug.play(0, 0)
 * BattleDebug.end()
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
        };

        console.log("[BattleDebug] 已挂载到 window.BattleDebug");
        console.log("[BattleDebug] 示例：BattleDebug.start(1)");
        console.log("[BattleDebug] 示例：BattleDebug.play(0, 0)");
        console.log("[BattleDebug] 示例：BattleDebug.end()");
    }

    static start(scenarioId: number = 1): void {
        BattleManager.ins().startScenario(scenarioId);
    }

    static play(handIndex: number = 0, targetEnemyIndex: number = 0): void {
        BattleManager.ins().playCard(handIndex, targetEnemyIndex);
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
}