import { SubpackageLoader } from "./SubpackageLoader";

const { regClass, property } = Laya;

// 请注意，不要引用任何script目录下的文件，该脚本环境与其互相独立
// 务必注意代码隔离
// 负责加载子包与显示进度
@regClass()
export class Main extends Laya.Script {
    onStart(): void {
        const loader = new SubpackageLoader();
        // 子包如果扩展请在这里添加
        loader.loadAll(["ttf", "jslib", "subscript"], { subscript: "jslib" });
        // 添加计时器判断子包是否加载完毕
        // 子包进度条更新
        Laya.timer.loop(100, this, () => {
            if (loader.loaded) {
                // 加载完成清理timer
                Laya.timer.clearAll(this);
                // 请求执行子包入口
                console.log("game start");
                new window["GameStart"]();
            }
        });
    }
} 