
import GameConst from "../const/GameConst";
import { StageEnum } from "./StageEnum";

import { UIManager } from "../games/ui/UIManager";
import { UILayer } from "../games/ui/UILayer";
import { openGameEntry } from "../module/gameplay/utils/GameplayNavigation";
import { LobbySettingsView } from "../module/lobby/view/LobbySettingsView";


export class LobbyStage extends asgard.stage.BaseStage {
    constructor() {
        super(GameConst.appName, StageEnum.STAGE_LOBBY);
    }

    onEnter(): void {
        // 清理旧的场景，打开主界 面
        let root: Laya.Sprite = Laya.Scene.root;
        for (let i = 0, n = root.numChildren; i < n; i++) {
            var scene = root.getChildAt(i);
            if (scene instanceof Laya.Scene) {
                scene.close();
                scene.destroy();
            }
            else {
                scene.removeSelf();
            }
        }
        UIManager.ins().init();
        UIManager.ins().closeLayerForms(UILayer.Base);
        UIManager.ins().closeLayerForms(UILayer.HighBase);
        UIManager.ins().closeLayerForms(UILayer.Second);


        asgard.events.EventsDispatcher.init(GameConst.appName);

        LobbySettingsView.applySavedAudio();
        openGameEntry();
    }

    onExit(): void {

    }
}
