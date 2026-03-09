const { regClass, property } = Laya;
import { GameManager } from "./manager/GameManager";

@regClass()
export class Main extends Laya.Script {

    onStart() {
        console.log("Game start - 打怪/掉落/物品 单机架构");
        // 初始化游戏总管理器（物品、背包、怪物、掉落）
        const gm = GameManager.init();
        // 示例：模拟击杀一只野狼，会自动加经验/金币并摇掉落入背包
        Laya.timer.once(1000, this, () => {
            gm.onMonsterKilled(10001);
            const inv = gm.getInventory();
            const slots = inv.getSlots();
            console.log("背包格子数:", slots.length, "已用:", slots.filter(s => s != null).length);
            console.log("玩家 经验:", gm.getPlayer().exp, "金币:", gm.getPlayer().gold);
        });
    }
}