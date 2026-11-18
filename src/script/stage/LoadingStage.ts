import GameConst from "../const/GameConst";
import { StageEnum } from "./StageEnum";
import { ConfigLoader } from "../config/ConfigUtil";
import GameMain from "../start/GameMain";
import { UIManager } from "../games/ui/UIManager";
import { UIResDepConfig } from "../games/asset/UIResDepConfig";
import { U3DResDepConfig } from "../games/asset/U3DResDepConfig";

export class LoadingStage extends asgard.stage.BaseStage {
    constructor() {
        super(GameConst.appName, StageEnum.STAGE_LODING);
    }

    onEnter(): void {
        this.load().catch(error => console.error("项目启动失败：", error));
    }

    onExit(): void {
        const root = Laya.Scene.root;
        for (let i = root.numChildren - 1; i >= 0; i--) {
            const scene = root.getChildAt(i);
            if (scene instanceof Laya.Scene) {
                scene.close();
                scene.destroy();
            } else {
                scene.removeSelf();
            }
        }
    }

    private async load(): Promise<void> {
        await Promise.all([
            new Promise<void>(resolve => UIResDepConfig.load(this, resolve)),
            new Promise<void>(resolve => U3DResDepConfig.load(this, resolve)),
        ]);
        await new Promise<void>((resolve, reject) => ConfigLoader.loadAllConfig(
            Laya.Handler.create(this, (ok: boolean) => ok ? resolve() : reject(new Error("配置表加载失败")))));
        UIManager.ins().isReady = true;
        GameMain.ins().Init();
    }
}
