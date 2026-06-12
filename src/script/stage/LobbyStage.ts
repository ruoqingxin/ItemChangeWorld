
import GameConst from "../const/GameConst";
import { StageEnum } from "./StageEnum";

import { UIManager } from "../games/ui/UIManager";
import { UILayer } from "../games/ui/UILayer";
import { BattleDebug } from "../module/battle/debug/BattleDebug";
import { InventoryDebug } from "../module/inventory/InventoryDebug";
import { BattleView } from "../module/battle/view/BattleView";


export class LobbyStage extends asgard.stage.BaseStage {
    /**
     * 进入大厅
     */
    private _launchLobby = true;

    constructor() {
        super(GameConst.appName, StageEnum.STAGE_LOBBY);
    }

    onEnter(): void {
        this._launchLobby = true;
        if (!this._launchLobby) {
            return;
        }
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
        UIManager.ins().closeLayerForms(UILayer.Base);
        UIManager.ins().closeLayerForms(UILayer.HighBase);
        UIManager.ins().closeLayerForms(UILayer.Second);


        asgard.events.EventsDispatcher.init(GameConst.appName);
        UIManager.ins().init();

        BattleDebug.mountToWindow();
        InventoryDebug.mountToWindow();
        UIManager.ins().openForm(BattleView);
    }

    onExit(): void {

    }
}